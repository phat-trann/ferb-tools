namespace FerbToolsJiraReportContentFeature {
  const WINDOW_FLAG = '__ferbToolsJiraReportBootstrappedV6__';
  const PAGE_SIZE = 100;
  const ISSUE_FIELDS: string[] = ['key', 'summary', 'status', 'timeestimate', 'duedate', 'parent'];

  interface JiraIssueRow {
    key: string;
    keyUrl: string;
    parent: string;
    summary: string;
    isDone: boolean;
    estimation: string;
    dueDate: Date | null;
  }

  if (!(window as unknown as Record<string, unknown>)[WINDOW_FLAG]) {
    (window as unknown as Record<string, unknown>)[WINDOW_FLAG] = true;

    chrome.runtime.onMessage.addListener(
      (
        message: unknown,
        _sender: chrome.runtime.MessageSender,
        sendResponse: (response: JiraReportResponse) => void
      ): boolean | void => {
        if (!isGenerateMessage(message)) {
          return;
        }

        generateReportsHTML(message.settings, message.mode, message.resultDate)
          .then((report: JiraReportResult): void => {
            sendResponse({ success: true, report });
          })
          .catch((error: unknown): void => {
            console.error('Failed to generate Jira report from API', error);
            sendResponse({
              success: false,
              error: error instanceof Error ? error.message : 'Generate Jira report lỗi.',
            });
          });

        return true;
      }
    );
  }

  async function generateReportsHTML(settings: JiraReportSettings, mode: 'work' | 'result', resultDate: string): Promise<JiraReportResult> {
    const myself: Record<string, unknown> = await fetchJiraRecord('/rest/api/3/myself');
    const displayName: string = readRequiredString(myself.displayName, 'Jira API không trả về display name của user hiện tại.');
    const reportOwner: string = [displayName, normalizeText(settings.role)].filter(Boolean).join(' ');

    if (mode === 'result') {
      const selectedDate: Date = parseDateInput(resultDate);
      const resultJql: string = buildResultJql(settings.todayDoneJql, resultDate);
      const [myTaskRows, doneRows]: [JiraIssueRow[], JiraIssueRow[]] = await Promise.all([
        searchIssues(settings.myTasksJql),
        searchIssues(resultJql),
      ]);
      const openCount: number = myTaskRows.filter((row: JiraIssueRow): boolean => !row.isDone).length;
      return {
        workHtml: '',
        resultHtml: buildResultHtml(reportOwner, formatDateDDMMYYYY(selectedDate), doneRows, openCount),
        warnings: [],
      };
    }

    const myTaskRows: JiraIssueRow[] = await searchIssues(settings.myTasksJql);
    const today: Date = startOfDay(new Date());
    const tomorrow: Date = addDays(today, 1);
    const weekStart: Date = startOfWeekMonday(today);
    const nextWeekStart: Date = addDays(weekStart, 7);
    const delayed: JiraIssueRow[] = [];
    const needToday: JiraIssueRow[] = [];
    const thisWeekInProgress: JiraIssueRow[] = [];

    myTaskRows.forEach((row: JiraIssueRow): void => {
      const due: Date | null = row.dueDate;
      if (!due || row.isDone) {
        return;
      }

      const dueTime: number = due.getTime();
      if (dueTime < today.getTime()) {
        delayed.push(row);
      }

      if (dueTime >= today.getTime() && dueTime < tomorrow.getTime()) {
        needToday.push(row);
      }

      if (dueTime >= weekStart.getTime() && dueTime < nextWeekStart.getTime() && dueTime >= today.getTime()) {
        thisWeekInProgress.push(row);
      }
    });

    const todayText: string = formatDateDDMMYYYY(today);
    return {
      workHtml: buildWorkPlanHtml(reportOwner, todayText, delayed, thisWeekInProgress, needToday),
      resultHtml: '',
      warnings: [],
    };
  }

  function buildResultJql(configuredJql: string, resultDate: string): string {
    parseDateInput(resultDate);
    const orderMatch: RegExpMatchArray | null = configuredJql.match(/\s+ORDER\s+BY\s+(.+)$/i);
    const orderBy: string = orderMatch ? ` ORDER BY ${orderMatch[1]}` : '';
    let baseJql: string = orderMatch ? configuredJql.slice(0, orderMatch.index).trim() : configuredJql.trim();

    baseJql = baseJql
      .replace(/\s+AND\s+status\s+CHANGED\s+TO\s+Done\s+AFTER\s+startOfDay\(\)/gi, '')
      .replace(/\s+AND\s+status\s+CHANGED\s+TO\s+Done\s+AFTER\s+"[^"]+"\s+BEFORE\s+"[^"]+"/gi, '')
      .replace(/\s+AND\s+status\s+CHANGED\s+TO\s+Done\s+DURING\s*\([^)]*\)/gi, '')
      .replace(/\s+AND\s+status\s+CHANGED\s+TO\s+Done\s+ON\s+(?:"[^"]+"|\S+)/gi, '')
      .trim();

    if (!baseJql) {
      throw new Error('Result JQL không được để trống.');
    }

    return `${baseJql} AND status CHANGED TO Done ON "${resultDate}"${orderBy}`;
  }

  async function searchIssues(jql: string): Promise<JiraIssueRow[]> {
    const normalizedJql: string = jql.trim();
    if (!normalizedJql) {
      throw new Error('Jira Report JQL không được để trống.');
    }

    const issuesByKey: Map<string, JiraIssueRow> = new Map<string, JiraIssueRow>();
    let nextPageToken: string | null = null;

    while (true) {
      const requestBody: Record<string, unknown> = {
        jql: normalizedJql,
        fields: ISSUE_FIELDS,
        maxResults: PAGE_SIZE,
      };

      if (nextPageToken) {
        requestBody.nextPageToken = nextPageToken;
      }

      const page: Record<string, unknown> = await fetchJiraRecord('/rest/api/3/search/jql', {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });
      const issues: unknown[] = Array.isArray(page.issues) ? page.issues : [];

      issues.forEach((candidate: unknown): void => {
        const row: JiraIssueRow | null = parseIssue(candidate);
        if (row) {
          issuesByKey.set(row.key, row);
        }
      });

      const token: string = readOptionalString(page.nextPageToken);
      if (page.isLast === true || !token || issues.length === 0) {
        break;
      }

      nextPageToken = token;
    }

    return Array.from(issuesByKey.values());
  }

  function parseIssue(candidate: unknown): JiraIssueRow | null {
    if (!isRecord(candidate)) {
      return null;
    }

    const key: string = readOptionalString(candidate.key);
    if (!key) {
      return null;
    }

    const fields: Record<string, unknown> = isRecord(candidate.fields) ? candidate.fields : {};
    const status: Record<string, unknown> = isRecord(fields.status) ? fields.status : {};
    const statusCategory: Record<string, unknown> = isRecord(status.statusCategory) ? status.statusCategory : {};
    const statusName: string = readOptionalString(status.name);
    const parent: Record<string, unknown> = isRecord(fields.parent) ? fields.parent : {};
    const parentFields: Record<string, unknown> = isRecord(parent.fields) ? parent.fields : {};

    return {
      key,
      keyUrl: `${window.location.origin}/browse/${encodeURIComponent(key)}`,
      parent: readOptionalString(parentFields.summary) || readOptionalString(parent.key),
      summary: readOptionalString(fields.summary),
      isDone: readOptionalString(statusCategory.key).toLowerCase() === 'done' || /done/i.test(statusName),
      estimation: formatEstimation(fields.timeestimate),
      dueDate: parseJiraDate(fields.duedate),
    };
  }

  async function fetchJiraRecord(path: string, init?: RequestInit): Promise<Record<string, unknown>> {
    const response: Response = await fetch(new URL(path, window.location.origin).toString(), {
      credentials: 'include',
      ...init,
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

      const messages: string[] = Array.isArray(body.errorMessages)
        ? body.errorMessages.filter((value: unknown): value is string => typeof value === 'string')
        : [];

      if (isRecord(body.errors)) {
        Object.values(body.errors).forEach((value: unknown): void => {
          if (typeof value === 'string') {
            messages.push(value);
          }
        });
      }

      return messages.join(' ') || readOptionalString(body.message);
    } catch (_error: unknown) {
      return '';
    }
  }

  function buildWorkPlanHtml(owner: string, todayText: string, delayed: JiraIssueRow[], thisWeekInProgress: JiraIssueRow[], needToday: JiraIssueRow[]): string {
    let workHtml: string = `${escapeHtml(owner)} | Work Plan on ${todayText}`;
    workHtml += '<ul>';
    workHtml += buildTicketGroupHtml(`Delayed: ${delayed.length} ticket${delayed.length > 1 ? 's' : ''}`, delayed, buildTicketLineForPlan);
    workHtml += buildTicketGroupHtml(`Tickets assigned có due date trong tuần và đang làm: ${thisWeekInProgress.length} ticket`, thisWeekInProgress, buildTicketLineForPlan);
    workHtml += buildTicketGroupHtml(`Tickets cần hoàn thành hôm nay: ${needToday.length} ticket`, needToday, buildTicketLineForPlan);
    workHtml += '</ul>';
    return workHtml;
  }

  function buildResultHtml(owner: string, todayText: string, todayDoneRows: JiraIssueRow[], openCount: number): string {
    let resultHtml: string = `${escapeHtml(owner)} | Result of work on ${todayText}`;
    resultHtml += '<ul>';
    resultHtml += `<li>Số tasks hoàn thành: ${todayDoneRows.length} ticket${todayDoneRows.length > 1 ? 's' : ''}`;

    if (todayDoneRows.length > 0) {
      resultHtml += '<ul>';
      todayDoneRows.forEach((row: JiraIssueRow): void => {
        resultHtml += `<li>${buildTicketLineForResult(row)}</li>`;
      });
      resultHtml += '</ul>';
    }

    resultHtml += '</li>';
    resultHtml += `<li>Số tickets hiện có: ${openCount} ticket${openCount > 1 ? 's' : ''}</li>`;
    resultHtml += '</ul>';
    return resultHtml;
  }

  function buildTicketGroupHtml(title: string, rows: JiraIssueRow[], renderLine: (row: JiraIssueRow) => string): string {
    let html: string = `<li>${escapeHtml(title)}`;
    if (rows.length > 0) {
      html += '<ul>';
      rows.forEach((row: JiraIssueRow): void => {
        html += `<li>${renderLine(row)}</li>`;
      });
      html += '</ul>';
    }
    return `${html}</li>`;
  }

  function buildTicketLineForPlan(row: JiraIssueRow): string {
    const parts: string[] = [];
    if (row.parent) {
      parts.push(row.parent);
    }
    if (row.summary) {
      parts.push(row.summary);
    }

    const taskText: string = parts.map(escapeHtml).join(' - ');
    const estimationHtml: string = row.estimation ? `${taskText ? ' - ' : ''}<strong>Est: ${escapeHtml(row.estimation)}</strong>` : '';
    return `${buildTicketLink(row)}: ${taskText}${estimationHtml}`;
  }

  function buildTicketLineForResult(row: JiraIssueRow): string {
    return `${buildTicketLink(row)}: ${escapeHtml(row.summary)}`;
  }

  function buildTicketLink(row: JiraIssueRow): string {
    return `<a href="${escapeAttribute(row.keyUrl)}" style="text-decoration:none; color:#0052cc;">${escapeHtml(row.key)}</a>`;
  }

  function formatEstimation(candidate: unknown): string {
    if (typeof candidate !== 'number' || !Number.isFinite(candidate)) {
      return '';
    }

    if (candidate <= 0) {
      return '30 minutes';
    }

    const totalMinutes: number = Math.max(1, Math.round(candidate / 60));
    const hours: number = Math.floor(totalMinutes / 60);
    const minutes: number = totalMinutes % 60;
    const parts: string[] = [];

    if (hours > 0) {
      parts.push(`${hours} hour${hours > 1 ? 's' : ''}`);
    }
    if (minutes > 0) {
      parts.push(`${minutes} minute${minutes > 1 ? 's' : ''}`);
    }

    return parts.join(' ');
  }

  function parseJiraDate(candidate: unknown): Date | null {
    const value: string = readOptionalString(candidate);
    const match: RegExpMatchArray | null = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) {
      return null;
    }

    const year: number = Number(match[1]);
    const month: number = Number(match[2]);
    const day: number = Number(match[3]);
    const date: Date = new Date(year, month - 1, day);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
  }

  function parseDateInput(value: string): Date {
    const match: RegExpMatchArray | null = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) {
      throw new Error('Ngày Result không hợp lệ.');
    }

    const year: number = Number(match[1]);
    const month: number = Number(match[2]);
    const day: number = Number(match[3]);
    const date: Date = new Date(year, month - 1, day);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
      throw new Error('Ngày Result không hợp lệ.');
    }
    return date;
  }

  function normalizeText(value: string | null | undefined): string {
    return (value ?? '').replace(/\s+/g, ' ').trim();
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

  function startOfDay(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function addDays(date: Date, days: number): Date {
    const nextDate: Date = new Date(date);
    nextDate.setDate(nextDate.getDate() + days);
    return nextDate;
  }

  function startOfWeekMonday(date: Date): Date {
    return addDays(startOfDay(date), -((date.getDay() + 6) % 7));
  }

  function formatDateDDMMYYYY(date: Date): string {
    const day: string = String(date.getDate()).padStart(2, '0');
    const month: string = String(date.getMonth() + 1).padStart(2, '0');
    return `${day}/${month}/${date.getFullYear()}`;
  }

  function escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escapeAttribute(value: string): string {
    return escapeHtml(value);
  }

  function isGenerateMessage(message: unknown): message is JiraReportGenerateMessage {
    if (!isRecord(message) || message.type !== 'RUN_JIRA_REPORT_GENERATE_V6' || !isRecord(message.settings)) {
      return false;
    }

    return (
      typeof message.settings.role === 'string' &&
      typeof message.settings.myTasksJql === 'string' &&
      typeof message.settings.todayDoneJql === 'string' &&
      (message.mode === 'work' || message.mode === 'result') &&
      typeof message.resultDate === 'string'
    );
  }

  function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }
}
