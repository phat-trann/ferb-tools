namespace FerbToolsJiraWorklogContentFeature {
  const WINDOW_FLAG = '__ferbToolsJiraWorklogBootstrappedV1__';
  const PAGE_SIZE = 100;

  interface JiraIssueSummary {
    key: string;
    summary: string;
  }

  interface JiraWorklogValue {
    date: string;
    seconds: number;
  }

  interface MonthRange {
    from: string;
    to: string;
  }

  type TaskLimiter = <TResult>(task: () => Promise<TResult>) => Promise<TResult>;

  if (!(window as unknown as Record<string, unknown>)[WINDOW_FLAG]) {
    (window as unknown as Record<string, unknown>)[WINDOW_FLAG] = true;

    chrome.runtime.onMessage.addListener(
      (
        message: unknown,
        _sender: chrome.runtime.MessageSender,
        sendResponse: (response: JiraWorklogResponse) => void
      ): boolean | void => {
        if (!isStartMessage(message)) {
          return;
        }

        syncCurrentUserWorklogs(message.settings)
          .then((result: JiraWorklogResult): void => {
            sendResponse({ success: true, result });
          })
          .catch((error: unknown): void => {
            console.error('Failed to sync Jira worklogs', error);
            sendResponse({
              success: false,
              error: error instanceof Error ? error.message : 'Lấy Jira worklog lỗi.',
            });
          });

        return true;
      }
    );
  }

  async function syncCurrentUserWorklogs(settings: JiraWorklogSettings): Promise<JiraWorklogResult> {
    const configuredOrigin: string = normalizeOrigin(settings.siteUrl);

    if (window.location.origin !== configuredOrigin) {
      throw new Error('Tab hiện tại không khớp Jira site URL đã cấu hình.');
    }

    const range: MonthRange = getMonthRange(settings.month);
    const myself: Record<string, unknown> = await fetchJiraRecord('/rest/api/3/myself');
    const accountId: string = readRequiredString(myself.accountId, 'Jira không trả về account ID hiện tại.');
    const displayName: string = readOptionalString(myself.displayName) || accountId;
    const issues: JiraIssueSummary[] = await findIssues(accountId, range);
    const limiter: TaskLimiter = createTaskLimiter(settings.concurrency);
    const worklogsByIssue: JiraWorklogValue[][] = await Promise.all(
      issues.map((issue: JiraIssueSummary): Promise<JiraWorklogValue[]> => {
        return limiter((): Promise<JiraWorklogValue[]> => fetchIssueWorklogs(issue.key, accountId, range));
      })
    );

    const secondsByDate: Map<string, number> = new Map<string, number>();
    const tickets: JiraWorklogTicketResult[] = [];
    let totalSeconds = 0;

    issues.forEach((issue: JiraIssueSummary, index: number): void => {
      const worklogs: JiraWorklogValue[] = worklogsByIssue[index] ?? [];
      const issueSeconds: number = worklogs.reduce((sum: number, worklog: JiraWorklogValue): number => {
        secondsByDate.set(worklog.date, (secondsByDate.get(worklog.date) ?? 0) + worklog.seconds);
        return sum + worklog.seconds;
      }, 0);

      if (issueSeconds > 0) {
        tickets.push({
          key: issue.key,
          summary: issue.summary,
          seconds: issueSeconds,
        });
        totalSeconds += issueSeconds;
      }
    });

    return {
      accountId,
      displayName,
      month: settings.month,
      totalSeconds,
      tickets,
      days: Array.from(secondsByDate.entries())
        .sort(([leftDate]: [string, number], [rightDate]: [string, number]): number => leftDate.localeCompare(rightDate))
        .map(([date, seconds]: [string, number]): JiraWorklogDayResult => ({ date, seconds })),
      generatedAt: Date.now(),
    };
  }

  async function findIssues(accountId: string, range: MonthRange): Promise<JiraIssueSummary[]> {
    const escapedAccountId: string = escapeJqlString(accountId);
    const jql: string = `worklogAuthor = "${escapedAccountId}" AND worklogDate >= "${range.from}" AND worklogDate <= "${range.to}"`;
    const issuesByKey: Map<string, JiraIssueSummary> = new Map<string, JiraIssueSummary>();
    let nextPageToken: string | null = null;

    while (true) {
      const params = new URLSearchParams({
        jql,
        maxResults: String(PAGE_SIZE),
        fields: 'key,summary',
      });

      if (nextPageToken) {
        params.set('nextPageToken', nextPageToken);
      }

      const page: Record<string, unknown> = await fetchJiraRecord(`/rest/api/3/search/jql?${params.toString()}`);
      const issues: unknown[] = Array.isArray(page.issues) ? page.issues : [];

      issues.forEach((candidate: unknown): void => {
        if (!isRecord(candidate)) {
          return;
        }

        const key: string = readOptionalString(candidate.key);
        if (!key) {
          return;
        }

        const fields: Record<string, unknown> = isRecord(candidate.fields) ? candidate.fields : {};
        issuesByKey.set(key, {
          key,
          summary: readOptionalString(fields.summary),
        });
      });

      const token: string = readOptionalString(page.nextPageToken);
      const isLast: boolean = page.isLast === true;

      if (isLast || !token || issues.length === 0) {
        break;
      }

      nextPageToken = token;
    }

    return Array.from(issuesByKey.values());
  }

  async function fetchIssueWorklogs(issueKey: string, accountId: string, range: MonthRange): Promise<JiraWorklogValue[]> {
    const values: JiraWorklogValue[] = [];
    let startAt = 0;

    while (true) {
      const params = new URLSearchParams({
        startAt: String(startAt),
        maxResults: String(PAGE_SIZE),
      });
      const page: Record<string, unknown> = await fetchJiraRecord(`/rest/api/3/issue/${encodeURIComponent(issueKey)}/worklog?${params.toString()}`);
      const worklogs: unknown[] = Array.isArray(page.worklogs) ? page.worklogs : [];

      worklogs.forEach((candidate: unknown): void => {
        if (!isRecord(candidate)) {
          return;
        }

        const author: Record<string, unknown> = isRecord(candidate.author) ? candidate.author : {};
        if (readOptionalString(author.accountId) !== accountId) {
          return;
        }

        const started: string = readOptionalString(candidate.started);
        const date: string = started.slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < range.from || date > range.to) {
          return;
        }

        const seconds: number = readNonNegativeInteger(candidate.timeSpentSeconds);
        if (seconds > 0) {
          values.push({ date, seconds });
        }
      });

      const total: number = readNonNegativeInteger(page.total);
      const pageStart: number = readNonNegativeInteger(page.startAt);

      if (worklogs.length === 0 || pageStart + worklogs.length >= total) {
        break;
      }

      startAt = pageStart + worklogs.length;
    }

    return values;
  }

  async function fetchJiraRecord(path: string): Promise<Record<string, unknown>> {
    const response: Response = await fetch(new URL(path, window.location.origin).toString(), {
      credentials: 'include',
      headers: {
        accept: 'application/json',
      },
    });
    const loginReason: string = response.headers.get('X-Seraph-Loginreason') ?? '';

    if (/AUTHENTICATED_FAILED|AUTHENTICATION_DENIED/i.test(loginReason)) {
      throw new Error('Jira session không hợp lệ. Đăng nhập lại Jira rồi thử lại.');
    }

    if (!response.ok) {
      const detail: string = await readJiraError(response);
      throw new Error(`Jira API ${response.status}${detail ? `: ${detail}` : ''}`);
    }

    const contentType: string = response.headers.get('content-type') ?? '';
    if (!contentType.toLowerCase().includes('application/json')) {
      throw new Error('Jira không trả JSON. Kiểm tra trạng thái đăng nhập rồi thử lại.');
    }

    const body: unknown = await response.json();
    if (!isRecord(body)) {
      throw new Error('Jira trả về dữ liệu không hợp lệ.');
    }

    return body;
  }

  async function readJiraError(response: Response): Promise<string> {
    try {
      const body: unknown = await response.json();
      if (!isRecord(body)) {
        return '';
      }

      if (Array.isArray(body.errorMessages)) {
        return body.errorMessages.filter((value: unknown): value is string => typeof value === 'string').join(' ');
      }

      return readOptionalString(body.message);
    } catch (_error: unknown) {
      return '';
    }
  }

  function createTaskLimiter(concurrency: number): TaskLimiter {
    const limit: number = Math.min(10, Math.max(1, Math.floor(concurrency)));
    const queue: Array<() => void> = [];
    let activeCount = 0;

    const runNext = (): void => {
      if (activeCount >= limit) {
        return;
      }

      const next: (() => void) | undefined = queue.shift();
      if (!next) {
        return;
      }

      activeCount += 1;
      next();
    };

    return <TResult>(task: () => Promise<TResult>): Promise<TResult> => {
      return new Promise<TResult>((resolve: (value: TResult) => void, reject: (reason?: unknown) => void): void => {
        queue.push((): void => {
          task()
            .then(resolve, reject)
            .finally((): void => {
              activeCount -= 1;
              runNext();
            });
        });
        runNext();
      });
    };
  }

  function getMonthRange(month: string): MonthRange {
    const match: RegExpMatchArray | null = month.match(/^(\d{4})-(\d{2})$/);
    if (!match) {
      throw new Error('Month không hợp lệ.');
    }

    const year: number = Number(match[1]);
    const monthNumber: number = Number(match[2]);
    if (monthNumber < 1 || monthNumber > 12) {
      throw new Error('Month không hợp lệ.');
    }

    const lastDay: number = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
    return {
      from: `${match[1]}-${match[2]}-01`,
      to: `${match[1]}-${match[2]}-${String(lastDay).padStart(2, '0')}`,
    };
  }

  function normalizeOrigin(siteUrl: string): string {
    try {
      const url = new URL(siteUrl);
      if (!['http:', 'https:'].includes(url.protocol)) {
        throw new Error('Invalid protocol');
      }
      return url.origin;
    } catch (_error: unknown) {
      throw new Error('Jira site URL không hợp lệ.');
    }
  }

  function escapeJqlString(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }

  function readRequiredString(value: unknown, errorMessage: string): string {
    const normalized: string = readOptionalString(value);
    if (!normalized) {
      throw new Error(errorMessage);
    }
    return normalized;
  }

  function readOptionalString(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
  }

  function readNonNegativeInteger(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
  }

  function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  function isStartMessage(message: unknown): message is JiraWorklogStartMessage {
    if (!isRecord(message) || message.type !== 'RUN_JIRA_WORKLOG_SYNC_V1' || !isRecord(message.settings)) {
      return false;
    }

    return (
      typeof message.settings.siteUrl === 'string' &&
      typeof message.settings.month === 'string' &&
      typeof message.settings.concurrency === 'number'
    );
  }
}
