namespace FerbToolsJiraWorklogPopupFeature {
  const SETTINGS_STORAGE_KEY = 'ferbToolsJiraWorklogSettings';
  const RESULT_STORAGE_KEY = 'ferbToolsJiraWorklogLastResult';
  const DEFAULT_SITE_URL = 'https://globee-software-ecommerce.atlassian.net';

  export interface Elements {
    section: HTMLDetailsElement;
    siteUrlInput: HTMLInputElement;
    monthInput: HTMLInputElement;
    concurrencyInput: HTMLInputElement;
    startButton: HTMLButtonElement;
    summaryElement: HTMLParagraphElement;
    preview: HTMLDivElement;
  }

  export interface Options {
    elements: Elements;
    setStatus: (status: string) => void;
  }

  export function init(options: Options): void {
    const { elements, setStatus } = options;

    elements.startButton.addEventListener('click', (event: MouseEvent): void => {
      event.preventDefault();
      event.stopPropagation();
      void startSync();
    });

    [elements.siteUrlInput, elements.monthInput, elements.concurrencyInput].forEach((input: HTMLInputElement): void => {
      input.addEventListener('change', (): void => {
        void saveSettings();
      });
    });

    void loadInitialState();

    async function startSync(): Promise<void> {
      elements.section.open = true;
      setBusy(true, 'Đang lấy Jira worklog...');

      try {
        const settings: JiraWorklogSettings = readSettingsFromForm();
        renderSettings(settings);
        await writeSettings(settings);

        const tab: chrome.tabs.Tab | undefined = await getCurrentTab();
        if (!tab || typeof tab.id !== 'number' || !isConfiguredJiraTab(tab.url, settings.siteUrl)) {
          throw new Error('Mở tab Jira đã đăng nhập đúng site URL rồi thử lại.');
        }

        const response: JiraWorklogResponse = await sendTabMessage<JiraWorklogStartMessage, JiraWorklogResponse>(tab.id, {
          type: 'RUN_JIRA_WORKLOG_SYNC_V1',
          settings,
        });

        if (!response.success || !response.result) {
          throw new Error(response.error ?? 'Lấy Jira worklog lỗi.');
        }

        renderResult(response.result, settings.siteUrl);
        await writeLastResult(response.result);
        setStatus(`Đã lấy worklog ${settings.month}: ${formatDuration(response.result.totalSeconds)}.`);
      } catch (error: unknown) {
        setStatus(error instanceof Error ? error.message : 'Lấy Jira worklog lỗi.');
      } finally {
        setBusy(false);
      }
    }

    function setBusy(isBusy: boolean, status?: string): void {
      elements.siteUrlInput.disabled = isBusy;
      elements.monthInput.disabled = isBusy;
      elements.concurrencyInput.disabled = isBusy;
      elements.startButton.disabled = isBusy;
      elements.startButton.textContent = isBusy ? '...' : 'Start';

      if (status) {
        setStatus(status);
      }
    }

    async function loadInitialState(): Promise<void> {
      try {
        const settings: JiraWorklogSettings = await readSettings();
        renderSettings(settings);

        const result: JiraWorklogResult | null = await readLastResult();
        if (result) {
          renderResult(result, settings.siteUrl);
        }
      } catch (error: unknown) {
        console.error('Failed to load Jira worklog state', error);
      }
    }

    async function saveSettings(): Promise<void> {
      try {
        const settings: JiraWorklogSettings = readSettingsFromForm();
        renderSettings(settings);
        await writeSettings(settings);
      } catch (error: unknown) {
        setStatus(error instanceof Error ? error.message : 'Lưu Jira worklog config lỗi.');
      }
    }

    function readSettingsFromForm(): JiraWorklogSettings {
      return {
        siteUrl: normalizeSiteUrl(elements.siteUrlInput.value),
        month: normalizeMonth(elements.monthInput.value),
        concurrency: normalizeConcurrency(elements.concurrencyInput.value),
      };
    }

    function renderSettings(settings: JiraWorklogSettings): void {
      elements.siteUrlInput.value = settings.siteUrl;
      elements.monthInput.value = settings.month;
      elements.concurrencyInput.value = String(settings.concurrency);
    }

    function renderResult(result: JiraWorklogResult, siteUrl: string): void {
      elements.summaryElement.textContent = `${result.displayName} · ${result.month} · ${formatDuration(result.totalSeconds)}`;

      let html: string = `<strong>${escapeHtml(result.displayName)}</strong> · ${escapeHtml(result.month)}<br>`;
      html += `Total: <strong>${escapeHtml(formatDuration(result.totalSeconds))}</strong>`;
      html += '<ul>';
      html += `<li>By ticket: ${result.tickets.length}`;

      if (result.tickets.length > 0) {
        html += '<ul>';
        result.tickets.forEach((ticket: JiraWorklogTicketResult): void => {
          const issueUrl: string = `${siteUrl}/browse/${encodeURIComponent(ticket.key)}`;
          const summary: string = ticket.summary ? ` - ${escapeHtml(ticket.summary)}` : '';
          html += `<li><a href="${escapeAttribute(issueUrl)}" target="_blank" rel="noreferrer">${escapeHtml(ticket.key)}</a>${summary}: <strong>${escapeHtml(formatDuration(ticket.seconds))}</strong></li>`;
        });
        html += '</ul>';
      }

      html += '</li>';
      html += `<li>By day: ${result.days.length}`;

      if (result.days.length > 0) {
        html += '<ul>';
        result.days.forEach((day: JiraWorklogDayResult): void => {
          html += `<li>${escapeHtml(day.date)}: <strong>${escapeHtml(formatDuration(day.seconds))}</strong></li>`;
        });
        html += '</ul>';
      }

      html += '</li></ul>';
      elements.preview.innerHTML = html;
    }
  }

  async function getCurrentTab(): Promise<chrome.tabs.Tab | undefined> {
    return new Promise((resolve: (value: chrome.tabs.Tab | undefined) => void): void => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs: chrome.tabs.Tab[]): void => {
        if (chrome.runtime.lastError) {
          resolve(undefined);
          return;
        }

        resolve(tabs[0]);
      });
    });
  }

  async function sendTabMessage<TRequest, TResponse>(tabId: number, message: TRequest): Promise<TResponse> {
    try {
      return await sendMessageToTab<TRequest, TResponse>(tabId, message);
    } catch (error: unknown) {
      if (!isMissingReceiverError(error)) {
        throw error;
      }

      await injectContentScript(tabId);
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

  async function injectContentScript(tabId: number): Promise<void> {
    return new Promise((resolve: () => void, reject: (reason?: unknown) => void): void => {
      chrome.scripting.executeScript(
        {
          target: { tabId },
          files: ['features/jira-worklog/content.js'],
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
    return error instanceof Error && (error.message.includes('Receiving end does not exist') || error.message.includes('message port closed') || error.message.includes('Could not establish connection'));
  }

  function isConfiguredJiraTab(tabUrl: string | undefined, siteUrl: string): boolean {
    if (!tabUrl) {
      return false;
    }

    try {
      return new URL(tabUrl).origin === new URL(siteUrl).origin;
    } catch (_error: unknown) {
      return false;
    }
  }

  async function readSettings(): Promise<JiraWorklogSettings> {
    return new Promise((resolve: (value: JiraWorklogSettings) => void): void => {
      chrome.storage.local.get(SETTINGS_STORAGE_KEY, (items: Record<string, unknown>): void => {
        if (chrome.runtime.lastError) {
          resolve(createDefaultSettings());
          return;
        }

        resolve(normalizeSettings(items[SETTINGS_STORAGE_KEY]));
      });
    });
  }

  async function writeSettings(settings: JiraWorklogSettings): Promise<void> {
    return new Promise((resolve: () => void, reject: (reason?: unknown) => void): void => {
      chrome.storage.local.set({ [SETTINGS_STORAGE_KEY]: settings }, (): void => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }

        resolve();
      });
    });
  }

  async function readLastResult(): Promise<JiraWorklogResult | null> {
    return new Promise((resolve: (value: JiraWorklogResult | null) => void): void => {
      chrome.storage.local.get(RESULT_STORAGE_KEY, (items: Record<string, unknown>): void => {
        if (chrome.runtime.lastError) {
          resolve(null);
          return;
        }

        resolve(normalizeResult(items[RESULT_STORAGE_KEY]));
      });
    });
  }

  async function writeLastResult(result: JiraWorklogResult): Promise<void> {
    return new Promise((resolve: () => void, reject: (reason?: unknown) => void): void => {
      chrome.storage.local.set({ [RESULT_STORAGE_KEY]: result }, (): void => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }

        resolve();
      });
    });
  }

  function createDefaultSettings(): JiraWorklogSettings {
    return {
      siteUrl: DEFAULT_SITE_URL,
      month: getCurrentMonth(),
      concurrency: 3,
    };
  }

  function normalizeSettings(candidate: unknown): JiraWorklogSettings {
    const defaults: JiraWorklogSettings = createDefaultSettings();
    if (!isRecord(candidate)) {
      return defaults;
    }

    return {
      siteUrl: normalizeSiteUrl(candidate.siteUrl, defaults.siteUrl),
      month: normalizeMonth(candidate.month, defaults.month),
      concurrency: normalizeConcurrency(candidate.concurrency, defaults.concurrency),
    };
  }

  function normalizeResult(candidate: unknown): JiraWorklogResult | null {
    if (!isRecord(candidate)) {
      return null;
    }

    const accountId: string = normalizeString(candidate.accountId);
    const displayName: string = normalizeString(candidate.displayName);
    const month: string = normalizeMonth(candidate.month, '');
    if (!accountId || !displayName || !month) {
      return null;
    }

    return {
      accountId,
      displayName,
      month,
      totalSeconds: normalizeSeconds(candidate.totalSeconds),
      tickets: Array.isArray(candidate.tickets) ? candidate.tickets.map(normalizeTicket).filter((value: JiraWorklogTicketResult | null): value is JiraWorklogTicketResult => value !== null) : [],
      days: Array.isArray(candidate.days) ? candidate.days.map(normalizeDay).filter((value: JiraWorklogDayResult | null): value is JiraWorklogDayResult => value !== null) : [],
      generatedAt: typeof candidate.generatedAt === 'number' && Number.isFinite(candidate.generatedAt) ? candidate.generatedAt : 0,
    };
  }

  function normalizeTicket(candidate: unknown): JiraWorklogTicketResult | null {
    if (!isRecord(candidate)) {
      return null;
    }

    const key: string = normalizeString(candidate.key);
    const seconds: number = normalizeSeconds(candidate.seconds);
    return key && seconds > 0
      ? {
          key,
          summary: normalizeString(candidate.summary),
          seconds,
        }
      : null;
  }

  function normalizeDay(candidate: unknown): JiraWorklogDayResult | null {
    if (!isRecord(candidate)) {
      return null;
    }

    const date: string = normalizeString(candidate.date);
    const seconds: number = normalizeSeconds(candidate.seconds);
    return /^\d{4}-\d{2}-\d{2}$/.test(date) && seconds > 0 ? { date, seconds } : null;
  }

  function normalizeSiteUrl(candidate: unknown, fallback = DEFAULT_SITE_URL): string {
    const value: string = normalizeString(candidate) || fallback;

    try {
      const url = new URL(value);
      if (!['http:', 'https:'].includes(url.protocol)) {
        return fallback;
      }
      return url.origin;
    } catch (_error: unknown) {
      return fallback;
    }
  }

  function normalizeMonth(candidate: unknown, fallback = getCurrentMonth()): string {
    const value: string = normalizeString(candidate);
    return /^\d{4}-(0[1-9]|1[0-2])$/.test(value) ? value : fallback;
  }

  function normalizeConcurrency(candidate: unknown, fallback = 3): number {
    const value: number = typeof candidate === 'number' ? candidate : Number(candidate);
    return Number.isFinite(value) ? Math.min(10, Math.max(1, Math.floor(value))) : fallback;
  }

  function normalizeSeconds(candidate: unknown): number {
    return typeof candidate === 'number' && Number.isFinite(candidate) && candidate > 0 ? Math.floor(candidate) : 0;
  }

  function normalizeString(candidate: unknown): string {
    return typeof candidate === 'string' ? candidate.trim() : '';
  }

  function getCurrentMonth(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  function formatDuration(seconds: number): string {
    const totalMinutes: number = Math.round(seconds / 60);
    const hours: number = Math.floor(totalMinutes / 60);
    const minutes: number = totalMinutes % 60;
    return `${hours}h ${minutes}m`;
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

  function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }
}
