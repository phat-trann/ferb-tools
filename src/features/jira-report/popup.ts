namespace FerbToolsJiraReportPopupFeature {
  const JIRA_REPORT_STORAGE_KEY = 'ferbToolsJiraReportLastReport';
  const JIRA_REPORT_SETTINGS_STORAGE_KEY = 'ferbToolsJiraReportSettings';
  const JIRA_SHARED_SETTINGS_STORAGE_KEY = 'ferbToolsJiraSharedSettings';
  const JIRA_WORKLOG_SETTINGS_STORAGE_KEY = 'ferbToolsJiraWorklogSettings';
  const DEFAULT_SITE_URL = 'https://globee-software-ecommerce.atlassian.net';
  const DEFAULT_MY_TASKS_JQL = 'assignee = currentUser() AND statusCategory != Done ORDER BY duedate ASC';
  const LEGACY_TODAY_DONE_JQL = 'assignee = currentUser() AND statusCategory = Done AND status CHANGED TO Done AFTER startOfDay() ORDER BY updated DESC';
  const DEFAULT_TODAY_DONE_JQL = 'assignee = currentUser() AND statusCategory = Done ORDER BY updated DESC';
  const DEFAULT_SETTINGS: JiraReportSettings = {
    siteUrl: DEFAULT_SITE_URL,
    role: 'DEV',
    myTasksJql: DEFAULT_MY_TASKS_JQL,
    todayDoneJql: DEFAULT_TODAY_DONE_JQL,
  };

  export interface Elements {
    workSection: HTMLDetailsElement;
    resultSection: HTMLDetailsElement;
    roleInput: HTMLInputElement;
    siteUrlInput: HTMLInputElement;
    myTasksJqlInput: HTMLTextAreaElement;
    todayDoneJqlInput: HTMLTextAreaElement;
    workGenerateButton: HTMLButtonElement;
    resultGenerateButton: HTMLButtonElement;
    resultDateInput: HTMLInputElement;
    copyWorkButton: HTMLButtonElement;
    copyResultButton: HTMLButtonElement;
    workPreview: HTMLDivElement;
    resultPreview: HTMLDivElement;
  }

  export interface Options {
    elements: Elements;
    setStatus: (status: string) => void;
  }

  export function init(options: Options): void {
    const { elements, setStatus } = options;
    let lastReport: JiraReportResult = { workHtml: '', resultHtml: '', warnings: [] };
    let activeMode: 'work' | 'result' | null = null;

    elements.workGenerateButton.addEventListener('click', (event: MouseEvent): void => {
      event.preventDefault();
      event.stopPropagation();
      void generateReport('work');
    });

    elements.resultGenerateButton.addEventListener('click', (event: MouseEvent): void => {
      event.preventDefault();
      event.stopPropagation();
      void generateReport('result');
    });

    elements.copyWorkButton.addEventListener('click', (event: MouseEvent): void => {
      event.preventDefault();
      void copyPreview(elements.copyWorkButton, elements.workPreview.innerHTML);
    });

    elements.copyResultButton.addEventListener('click', (event: MouseEvent): void => {
      event.preventDefault();
      void copyPreview(elements.copyResultButton, elements.resultPreview.innerHTML);
    });

    [elements.siteUrlInput, elements.roleInput, elements.myTasksJqlInput, elements.todayDoneJqlInput].forEach((input: HTMLInputElement | HTMLTextAreaElement): void => {
      input.addEventListener('change', (): void => {
        void saveSettings();
      });
    });

    elements.resultDateInput.value = getTodayDateInput();
    void loadSettings();
    void loadLastReport();

    async function generateReport(mode: 'work' | 'result'): Promise<void> {
      if (activeMode !== null) {
        setStatus(activeMode === 'work' ? 'Work Plan đang được generate.' : 'Result đang được generate.');
        return;
      }

      activeMode = mode;
      const activeSection: HTMLDetailsElement = mode === 'work' ? elements.workSection : elements.resultSection;
      activeSection.open = true;
      setBusy(mode, true, mode === 'work' ? 'Đang generate Work Plan...' : 'Đang generate Result...');

      try {
        const settings: JiraReportSettings = readSettingsFromForm();
        await writeSettings(settings);
        const tab: chrome.tabs.Tab = await FerbToolsBackgroundTabs.getOrCreate(elements.siteUrlInput.value, {
          serviceName: 'Jira',
          reuse: 'origin',
        });
        if (typeof tab.id !== 'number') {
          throw new Error('Không tìm thấy Jira tab hợp lệ.');
        }

        const response: JiraReportResponse = await sendTabMessage<JiraReportGenerateMessage, JiraReportResponse>(
          tab.id,
          {
            type: 'RUN_JIRA_REPORT_GENERATE_V6',
            mode,
            resultDate: normalizeResultDate(elements.resultDateInput.value),
            settings,
          }
        );

        if (!response.success || !response.report) {
          throw new Error(response.error ?? 'Generate Jira report lỗi.');
        }

        lastReport = {
          workHtml: mode === 'work' ? sanitizeReportHtml(response.report.workHtml) : lastReport.workHtml,
          resultHtml: mode === 'result' ? sanitizeReportHtml(response.report.resultHtml) : lastReport.resultHtml,
          warnings: response.report.warnings,
        };
        if (mode === 'work') {
          elements.workPreview.innerHTML = lastReport.workHtml;
        } else {
          elements.resultPreview.innerHTML = lastReport.resultHtml;
        }
        await writeLastReport(lastReport);
        const successMessage: string = mode === 'work' ? 'Đã generate Work Plan.' : `Đã generate Result ngày ${formatDateDisplay(elements.resultDateInput.value)}.`;
        setStatus(response.report.warnings.length > 0 ? response.report.warnings.join(' ') : successMessage);
      } catch (error: unknown) {
        setStatus(error instanceof Error ? error.message : 'Generate Jira report lỗi.');
      } finally {
        setBusy(mode, false);
        activeMode = null;
      }
    }

    async function copyPreview(button: HTMLButtonElement, html: string): Promise<void> {
      if (!html.trim()) {
        setStatus('Chưa có report để copy.');
        return;
      }

      const originalText: string = button.textContent ?? 'Copy';
      button.disabled = true;

      try {
        await copyHtmlToClipboard(html);
        button.textContent = 'Copied';
        setStatus('Đã copy report.');
      } catch (error: unknown) {
        setStatus(error instanceof Error ? error.message : 'Copy report lỗi.');
      } finally {
        window.setTimeout((): void => {
          button.textContent = originalText;
          button.disabled = false;
        }, 900);
      }
    }

    function setBusy(mode: 'work' | 'result', isBusy: boolean, status?: string): void {
      const generateButton: HTMLButtonElement = mode === 'work' ? elements.workGenerateButton : elements.resultGenerateButton;
      const copyButton: HTMLButtonElement = mode === 'work' ? elements.copyWorkButton : elements.copyResultButton;

      generateButton.disabled = isBusy;
      copyButton.disabled = isBusy;
      if (mode === 'result') {
        elements.resultDateInput.disabled = isBusy;
      }
      elements.roleInput.disabled = isBusy;
      elements.siteUrlInput.disabled = isBusy;
      elements.myTasksJqlInput.disabled = isBusy;
      elements.todayDoneJqlInput.disabled = isBusy;
      generateButton.textContent = isBusy ? '...' : mode === 'work' ? 'Run Plan' : 'Run Result';

      if (status) {
        setStatus(status);
      }
    }

    async function loadSettings(): Promise<void> {
      try {
        renderSettings(await readSettings());
      } catch (error: unknown) {
        console.error('Failed to load Jira report settings', error);
      }
    }

    async function saveSettings(): Promise<void> {
      try {
        await writeSettings(readSettingsFromForm());
      } catch (error: unknown) {
        setStatus(error instanceof Error ? error.message : 'Lưu Jira report config lỗi.');
      }
    }

    function readSettingsFromForm(): JiraReportSettings {
      return {
        siteUrl: normalizeSiteUrl(elements.siteUrlInput.value, DEFAULT_SETTINGS.siteUrl),
        role: normalizeRole(elements.roleInput.value, DEFAULT_SETTINGS.role),
        myTasksJql: normalizeJql(elements.myTasksJqlInput.value, DEFAULT_SETTINGS.myTasksJql),
        todayDoneJql: normalizeJql(elements.todayDoneJqlInput.value, DEFAULT_SETTINGS.todayDoneJql),
      };
    }

    function renderSettings(settings: JiraReportSettings): void {
      elements.siteUrlInput.value = settings.siteUrl;
      elements.roleInput.value = settings.role;
      elements.myTasksJqlInput.value = settings.myTasksJql;
      elements.todayDoneJqlInput.value = settings.todayDoneJql;
    }

    async function loadLastReport(): Promise<void> {
      try {
        const report: JiraReportResult | null = await readLastReport();

        if (report) {
          lastReport = {
            workHtml: sanitizeReportHtml(report.workHtml),
            resultHtml: sanitizeReportHtml(report.resultHtml),
            warnings: report.warnings,
          };
          renderReport(lastReport);
        }
      } catch (error: unknown) {
        console.error('Failed to load Jira report cache', error);
      }
    }

    function renderReport(report: JiraReportResult): void {
      elements.workPreview.innerHTML = sanitizeReportHtml(report.workHtml);
      elements.resultPreview.innerHTML = sanitizeReportHtml(report.resultHtml);
    }
  }

  function sanitizeReportHtml(rawHtml: string): string {
    if (!rawHtml.trim()) {
      return '';
    }

    const doc: Document = new DOMParser().parseFromString(rawHtml, 'text/html');
    const allowedTags = new Set(['UL', 'OL', 'LI', 'STRONG', 'B', 'EM', 'I', 'BR', 'P', 'DIV', 'SPAN', 'A']);

    function sanitizeNode(node: Node): Node | null {
      if (node.nodeType === Node.TEXT_NODE) {
        return document.createTextNode(node.textContent ?? '');
      }

      if (node.nodeType !== Node.ELEMENT_NODE) {
        return null;
      }

      const element = node as HTMLElement;
      const tagName: string = element.tagName.toUpperCase();

      if (!allowedTags.has(tagName)) {
        const fragment: DocumentFragment = document.createDocumentFragment();
        Array.from(element.childNodes).forEach((child: Node): void => {
          const cleanChild: Node | null = sanitizeNode(child);
          if (cleanChild) {
            fragment.appendChild(cleanChild);
          }
        });
        return fragment;
      }

      const cleanElement: HTMLElement = document.createElement(tagName.toLowerCase());
      if (tagName === 'A') {
        const href: string = element.getAttribute('href') ?? '';
        try {
          const parsedUrl = new URL(href);
          if (parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:') {
            cleanElement.setAttribute('href', parsedUrl.toString());
            cleanElement.setAttribute('target', '_blank');
            cleanElement.setAttribute('rel', 'noreferrer noopener');
            cleanElement.setAttribute('style', 'text-decoration:none; color:#0052cc;');
          }
        } catch {}
      }

      Array.from(element.childNodes).forEach((child: Node): void => {
        const cleanChild: Node | null = sanitizeNode(child);
        if (cleanChild) {
          cleanElement.appendChild(cleanChild);
        }
      });

      return cleanElement;
    }

    const container: HTMLDivElement = document.createElement('div');
    Array.from(doc.body.childNodes).forEach((child: Node): void => {
      const cleanChild: Node | null = sanitizeNode(child);
      if (cleanChild) {
        container.appendChild(cleanChild);
      }
    });

    return container.innerHTML;
  }

  async function copyHtmlToClipboard(html: string): Promise<void> {
    const safeHtml: string = sanitizeReportHtml(html);
    const plainText: string = safeHtml
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/li>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    if (typeof ClipboardItem === 'undefined') {
      await navigator.clipboard.writeText(plainText);
      return;
    }

    await navigator.clipboard.write([
      new ClipboardItem({
        'text/html': new Blob([safeHtml], { type: 'text/html' }),
        'text/plain': new Blob([plainText], { type: 'text/plain' }),
      }),
    ]);
  }

  async function sendTabMessage<TRequest, TResponse>(tabId: number, message: TRequest): Promise<TResponse> {
    try {
      return await sendMessageToTab<TRequest, TResponse>(tabId, message);
    } catch (error: unknown) {
      if (!isMissingReceiverError(error)) {
        throw error;
      }

      await injectJiraReportContentScript(tabId);
      return sendMessageToTab<TRequest, TResponse>(tabId, message);
    }
  }

  async function sendMessageToTab<TRequest, TResponse>(tabId: number, message: TRequest): Promise<TResponse> {
    return new Promise((resolve: (value: TResponse) => void, reject: (reason?: unknown) => void): void => {
      chrome.tabs.sendMessage(tabId, message, (response: TResponse): void => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }

        if (response === undefined) {
          reject(new Error('Receiving end does not exist'));
          return;
        }

        resolve(response);
      });
    });
  }

  async function injectJiraReportContentScript(tabId: number): Promise<void> {
    return new Promise((resolve: () => void, reject: (reason?: unknown) => void): void => {
      chrome.scripting.executeScript(
        {
          target: { tabId },
          files: ['features/jira-report/content.js'],
        },
        (): void => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }

          resolve();
        }
      );
    });
  }

  function isMissingReceiverError(error: unknown): boolean {
    return error instanceof Error && (error.message.includes('Receiving end does not exist') || error.message.includes('message port closed'));
  }

  async function readLastReport(): Promise<JiraReportResult | null> {
    return new Promise((resolve: (value: JiraReportResult | null) => void): void => {
      chrome.storage.local.get(JIRA_REPORT_STORAGE_KEY, (items: Record<string, unknown>): void => {
        if (chrome.runtime.lastError) {
          resolve(null);
          return;
        }

        resolve(normalizeReport(items[JIRA_REPORT_STORAGE_KEY]));
      });
    });
  }

  async function writeLastReport(report: JiraReportResult): Promise<void> {
    return new Promise((resolve: () => void, reject: (reason?: unknown) => void): void => {
      chrome.storage.local.set(
        {
          [JIRA_REPORT_STORAGE_KEY]: report,
        },
        (): void => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }

          resolve();
        }
      );
    });
  }

  async function readSettings(): Promise<JiraReportSettings> {
    return new Promise((resolve: (value: JiraReportSettings) => void): void => {
      chrome.storage.local.get([JIRA_REPORT_SETTINGS_STORAGE_KEY, JIRA_SHARED_SETTINGS_STORAGE_KEY, JIRA_WORKLOG_SETTINGS_STORAGE_KEY], (items: Record<string, unknown>): void => {
        if (chrome.runtime.lastError) {
          resolve({ ...DEFAULT_SETTINGS });
          return;
        }

        resolve(normalizeSettings(
          items[JIRA_REPORT_SETTINGS_STORAGE_KEY],
          items[JIRA_SHARED_SETTINGS_STORAGE_KEY],
          items[JIRA_WORKLOG_SETTINGS_STORAGE_KEY]
        ));
      });
    });
  }

  async function writeSettings(settings: JiraReportSettings): Promise<void> {
    return new Promise((resolve: () => void, reject: (reason?: unknown) => void): void => {
      chrome.storage.local.set(
        {
          [JIRA_REPORT_SETTINGS_STORAGE_KEY]: settings,
          [JIRA_SHARED_SETTINGS_STORAGE_KEY]: {
            siteUrl: settings.siteUrl,
            role: settings.role,
          },
        },
        (): void => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }

          resolve();
        }
      );
    });
  }

  function normalizeSettings(candidate: unknown, sharedCandidate?: unknown, worklogCandidate?: unknown): JiraReportSettings {
    const reportSettings: Record<string, unknown> = isRecord(candidate) ? candidate : {};
    const sharedSettings: Record<string, unknown> = isRecord(sharedCandidate) ? sharedCandidate : {};
    const worklogSettings: Record<string, unknown> = isRecord(worklogCandidate) ? worklogCandidate : {};

    return {
      siteUrl: normalizeSiteUrl(sharedSettings.siteUrl ?? worklogSettings.siteUrl ?? reportSettings.siteUrl, DEFAULT_SETTINGS.siteUrl),
      role: normalizeRole(
        sharedSettings.role ?? worklogSettings.role ?? reportSettings.role ?? extractLegacyRole(reportSettings.owner ?? reportSettings.workPlanOwner ?? reportSettings.resultOwner),
        DEFAULT_SETTINGS.role
      ),
      myTasksJql: normalizeJql(reportSettings.myTasksJql, DEFAULT_SETTINGS.myTasksJql),
      todayDoneJql: normalizeResultJql(reportSettings.todayDoneJql),
    };
  }

  function normalizeSiteUrl(candidate: unknown, fallback: string): string {
    if (typeof candidate !== 'string') {
      return fallback;
    }
    try {
      const url = new URL(candidate.trim());
      return url.protocol === 'http:' || url.protocol === 'https:' ? url.origin : fallback;
    } catch {
      return fallback;
    }
  }

  function normalizeRole(candidate: unknown, fallback: string): string {
    if (typeof candidate !== 'string') {
      return fallback;
    }
    const normalized: string = candidate.trim().replace(/^\[|\]$/g, '').toUpperCase();
    return normalized || fallback;
  }

  function normalizeJql(candidate: unknown, fallback: string): string {
    return typeof candidate === 'string' && candidate.trim() ? candidate.trim() : fallback;
  }

  function normalizeResultJql(candidate: unknown): string {
    const value: string = normalizeJql(candidate, DEFAULT_SETTINGS.todayDoneJql);
    return value === LEGACY_TODAY_DONE_JQL ? DEFAULT_TODAY_DONE_JQL : value;
  }

  function normalizeResultDate(value: string): string {
    if (!/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(value)) {
      throw new Error('Chọn ngày hợp lệ cho Result.');
    }
    return value;
  }

  function getTodayDateInput(): string {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  }

  function formatDateDisplay(value: string): string {
    const [year, month, day]: string[] = value.split('-');
    return `${day}/${month}/${year}`;
  }

  function extractLegacyRole(candidate: unknown): string {
    if (typeof candidate !== 'string') {
      return '';
    }

    const parts: string[] = candidate.trim().split(/\s+/);
    return parts.length > 1 ? parts[parts.length - 1] ?? '' : '';
  }

  function normalizeReport(candidate: unknown): JiraReportResult | null {
    if (!isRecord(candidate) || typeof candidate.workHtml !== 'string' || typeof candidate.resultHtml !== 'string') {
      return null;
    }

    return {
      workHtml: candidate.workHtml,
      resultHtml: candidate.resultHtml,
      warnings: Array.isArray(candidate.warnings) ? candidate.warnings.filter((warning: unknown): warning is string => typeof warning === 'string') : [],
    };
  }

  function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }
}
