namespace FerbToolsJiraReportPopupFeature {
  const JIRA_REPORT_STORAGE_KEY = 'ferbToolsJiraReportLastReport';
  const JIRA_REPORT_SETTINGS_STORAGE_KEY = 'ferbToolsJiraReportSettings';
  const DEFAULT_SETTINGS: JiraReportSettings = {
    owner: 'Ferb DEV',
  };

  export interface Elements {
    section: HTMLDetailsElement;
    ownerInput: HTMLInputElement;
    generateButton: HTMLButtonElement;
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

    elements.generateButton.addEventListener('click', (event: MouseEvent): void => {
      event.preventDefault();
      event.stopPropagation();
      void generateReport();
    });

    elements.copyWorkButton.addEventListener('click', (event: MouseEvent): void => {
      event.preventDefault();
      void copyPreview(elements.copyWorkButton, elements.workPreview.innerHTML);
    });

    elements.copyResultButton.addEventListener('click', (event: MouseEvent): void => {
      event.preventDefault();
      void copyPreview(elements.copyResultButton, elements.resultPreview.innerHTML);
    });

    elements.ownerInput.addEventListener('change', (): void => {
      void saveSettings();
    });

    void loadSettings();
    void loadLastReport();

    async function generateReport(): Promise<void> {
      elements.section.open = true;
      setBusy(true, 'Đang generate...');

      try {
        const settings: JiraReportSettings = readSettingsFromForm();
        await writeSettings(settings);
        const tab: chrome.tabs.Tab | undefined = await getCurrentTab();

        if (!tab || typeof tab.id !== 'number' || !isJiraDashboardUrl(tab.url)) {
          throw new Error('Mở đúng Jira dashboard.');
        }

        const response: JiraReportResponse = await sendTabMessage<JiraReportGenerateMessage, JiraReportResponse>(
          tab.id,
          {
            type: 'RUN_JIRA_REPORT_GENERATE_V3',
            settings,
          }
        );

        if (!response.success || !response.report) {
          throw new Error(response.error ?? 'Generate Jira report lỗi.');
        }

        renderReport(response.report);
        await writeLastReport(response.report);
        setStatus(response.report.warnings.length > 0 ? response.report.warnings.join(' ') : 'Đã generate Jira report.');
      } catch (error: unknown) {
        setStatus(error instanceof Error ? error.message : 'Generate Jira report lỗi.');
      } finally {
        setBusy(false);
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

    function setBusy(isBusy: boolean, status?: string): void {
      elements.generateButton.disabled = isBusy;
      elements.copyWorkButton.disabled = isBusy;
      elements.copyResultButton.disabled = isBusy;
      elements.ownerInput.disabled = isBusy;
      elements.generateButton.textContent = isBusy ? '...' : 'Generate';

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
        owner: normalizeOwner(elements.ownerInput.value, DEFAULT_SETTINGS.owner),
      };
    }

    function renderSettings(settings: JiraReportSettings): void {
      elements.ownerInput.value = settings.owner;
    }

    async function loadLastReport(): Promise<void> {
      try {
        const report: JiraReportResult | null = await readLastReport();

        if (report) {
          renderReport(report);
        }
      } catch (error: unknown) {
        console.error('Failed to load Jira report cache', error);
      }
    }

    function renderReport(report: JiraReportResult): void {
      elements.workPreview.innerHTML = report.workHtml;
      elements.resultPreview.innerHTML = report.resultHtml;
    }
  }

  async function copyHtmlToClipboard(html: string): Promise<void> {
    const plainText: string = html
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
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([plainText], { type: 'text/plain' }),
      }),
    ]);
  }

  async function getCurrentTab(): Promise<chrome.tabs.Tab | undefined> {
    return new Promise((resolve: (value: chrome.tabs.Tab | undefined) => void): void => {
      chrome.tabs.query(
        {
          active: true,
          currentWindow: true,
        },
        (tabs: chrome.tabs.Tab[]): void => {
          if (chrome.runtime.lastError) {
            resolve(undefined);
            return;
          }

          resolve(tabs[0]);
        }
      );
    });
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

  function isJiraDashboardUrl(url: string | undefined): boolean {
    return Boolean(url?.startsWith('https://globee-software-ecommerce.atlassian.net/jira/dashboards/'));
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
      chrome.storage.local.get(JIRA_REPORT_SETTINGS_STORAGE_KEY, (items: Record<string, unknown>): void => {
        if (chrome.runtime.lastError) {
          resolve({ ...DEFAULT_SETTINGS });
          return;
        }

        resolve(normalizeSettings(items[JIRA_REPORT_SETTINGS_STORAGE_KEY]));
      });
    });
  }

  async function writeSettings(settings: JiraReportSettings): Promise<void> {
    return new Promise((resolve: () => void, reject: (reason?: unknown) => void): void => {
      chrome.storage.local.set(
        {
          [JIRA_REPORT_SETTINGS_STORAGE_KEY]: settings,
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

  function normalizeSettings(candidate: unknown): JiraReportSettings {
    if (!isRecord(candidate)) {
      return { ...DEFAULT_SETTINGS };
    }

    return {
      owner: normalizeOwner(candidate.owner ?? candidate.workPlanOwner ?? candidate.resultOwner, DEFAULT_SETTINGS.owner),
    };
  }

  function normalizeOwner(candidate: unknown, fallback: string): string {
    return typeof candidate === 'string' && candidate.trim() ? candidate.trim() : fallback;
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
