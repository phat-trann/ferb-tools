namespace FerbToolsContentAssetPopupFeature {
  const CONTENT_ASSET_SETTINGS_STORAGE_KEY = 'ferbToolsContentAssetSettings';

  export interface Elements {
    runButton: HTMLButtonElement;
    localesInput: HTMLTextAreaElement;
    siteMapInput: HTMLTextAreaElement;
    saveButton: HTMLButtonElement;
    resetButton: HTMLButtonElement;
    listIdsInput: HTMLTextAreaElement;
    listFilenameInput: HTMLInputElement;
    listConcurrencyInput: HTMLInputElement;
    listRunButton: HTMLButtonElement;
  }

  export interface Options {
    elements: Elements;
    setStatus: (status: string) => void;
  }

  export function init(options: Options): void {
    const { elements, setStatus } = options;
    let activeRunId: string | null = null;
    let activeRunButton: HTMLButtonElement | null = null;
    let listSettingsSaveTimeout: number | undefined;

    elements.runButton.addEventListener('click', (event: MouseEvent): void => {
      event.preventDefault();
      event.stopPropagation();
      void runTool();
    });

    elements.listRunButton.addEventListener('click', (event: MouseEvent): void => {
      event.preventDefault();
      void runListTool();
    });

    elements.saveButton.addEventListener('click', (): void => {
      void saveSettings();
    });

    elements.resetButton.addEventListener('click', (): void => {
      void resetSettings();
    });

    elements.listIdsInput.addEventListener('input', (): void => {
      scheduleListSettingsSave();
    });

    elements.listFilenameInput.addEventListener('input', (): void => {
      scheduleListSettingsSave();
    });

    elements.listConcurrencyInput.addEventListener('input', (): void => {
      scheduleListSettingsSave();
    });

    chrome.runtime.onMessage.addListener((message: unknown): void => {
      if (!isProgressMessage(message) || message.runId !== activeRunId) {
        return;
      }

      renderProgress(message.percent, message.label);
    });

    void loadSettings();

    async function loadSettings(): Promise<void> {
      try {
        renderSettings(await readSettings());
      } catch (error: unknown) {
        setStatus(error instanceof Error ? error.message : 'Không đọc được config.');
      }
    }

    async function saveSettings(): Promise<void> {
      setSetupBusy(true, 'Đang lưu...');

      try {
        const settings: ContentAssetSettings = readSettingsFromForm();

        await writeSettings(settings);
        renderSettings(settings);
        setStatus('Đã lưu config.');
      } catch (error: unknown) {
        setStatus(error instanceof Error ? error.message : 'Không lưu được config.');
      } finally {
        setSetupBusy(false);
      }
    }

    async function resetSettings(): Promise<void> {
      setSetupBusy(true, 'Đang reset...');

      try {
        const settings: ContentAssetSettings = FerbToolsContentAssetConfig.createDefaultSettings();

        await writeSettings(settings);
        renderSettings(settings);
        setStatus('Đã reset config.');
      } catch (error: unknown) {
        setStatus(error instanceof Error ? error.message : 'Không reset được config.');
      } finally {
        setSetupBusy(false);
      }
    }

    async function runTool(): Promise<void> {
      const runId: string = createRunId();
      activeRunId = runId;
      activeRunButton = elements.runButton;
      setToolBusy(elements.runButton, true, 'Đang export...');
      renderProgress(1, 'Starting');

      try {
        const tab: chrome.tabs.Tab | undefined = await getCurrentTab();

        if (!tab || typeof tab.id !== 'number' || !isInjectableUrl(tab.url)) {
          throw new Error('Mở đúng Content Asset detail page.');
        }

        const message: ContentAssetExportMessage = {
          type: 'RUN_CONTENT_ASSET_EXPORT',
          runId,
        };
        const response: ContentAssetExportResponse = await sendTabMessage<ContentAssetExportMessage, ContentAssetExportResponse>(tab.id, message, 'Refresh Content Asset detail page.');

        if (!response.success) {
          throw new Error(response.error ?? 'Export lỗi.');
        }

        renderProgress(100, 'Done');
        setStatus('Đã bắt đầu download.');
      } catch (error: unknown) {
        setStatus(error instanceof Error ? error.message : 'Export lỗi.');
      } finally {
        setToolBusy(elements.runButton, false);
        activeRunId = null;
        activeRunButton = null;
      }
    }

    async function runListTool(): Promise<void> {
      const contentIds: string[] = parseContentIds(elements.listIdsInput.value);
      const filename: string = normalizeFilenameInput(elements.listFilenameInput.value);

      if (contentIds.length === 0) {
        setStatus('Nhập content asset ID.');
        return;
      }

      const concurrency: number = parseConcurrency(elements.listConcurrencyInput.value);
      const runId: string = createRunId();
      activeRunId = runId;
      activeRunButton = elements.listRunButton;
      setToolBusy(elements.listRunButton, true, 'Đang export list...');
      renderProgress(1, 'Starting');

      try {
        const tab: chrome.tabs.Tab | undefined = await getCurrentTab();

        if (!tab || typeof tab.id !== 'number' || !isInjectableUrl(tab.url)) {
          throw new Error('Mở Content Asset list page.');
        }

        await writeSettings({
          ...readSettingsFromForm(),
          batchConcurrency: concurrency,
          listContentIdsText: elements.listIdsInput.value,
          listFilename: filename,
        });

        const message: ContentAssetListExportMessage = {
          type: 'RUN_CONTENT_ASSET_LIST_EXPORT',
          runId,
          contentIds,
          concurrency,
          filename,
        };
        const response: ContentAssetExportResponse = await sendTabMessage<ContentAssetListExportMessage, ContentAssetExportResponse>(tab.id, message, 'Refresh Content Asset list page.');

        if (!response.success) {
          throw new Error(response.error ?? 'Export list lỗi.');
        }

        renderProgress(100, 'Done');
        setStatus('Đã bắt đầu download list.');
      } catch (error: unknown) {
        setStatus(error instanceof Error ? error.message : 'Export list lỗi.');
      } finally {
        setToolBusy(elements.listRunButton, false);
        activeRunId = null;
        activeRunButton = null;
      }
    }

    function renderSettings(settings: ContentAssetSettings): void {
      elements.localesInput.value = settings.allowedLocales.join(', ');
      elements.siteMapInput.value = JSON.stringify(settings.siteIdByName, null, 2);
      elements.listIdsInput.value = settings.listContentIdsText;
      elements.listFilenameInput.value = settings.listFilename;
      elements.listConcurrencyInput.value = String(settings.batchConcurrency);
    }

    function readSettingsFromForm(): ContentAssetSettings {
      return {
        allowedLocales: parseLocales(elements.localesInput.value),
        siteIdByName: parseSiteIdMap(elements.siteMapInput.value),
        batchConcurrency: parseConcurrency(elements.listConcurrencyInput.value),
        listContentIdsText: elements.listIdsInput.value,
        listFilename: normalizeFilenameInput(elements.listFilenameInput.value),
      };
    }

    function setToolBusy(button: HTMLButtonElement, isBusy: boolean, status?: string): void {
      elements.runButton.disabled = isBusy;
      elements.listRunButton.disabled = isBusy;
      elements.saveButton.disabled = isBusy;
      elements.resetButton.disabled = isBusy;
      button.textContent = isBusy ? '0%' : 'Run';

      if (status) {
        setStatus(status);
      }
    }

    function setSetupBusy(isBusy: boolean, status?: string): void {
      elements.localesInput.disabled = isBusy;
      elements.siteMapInput.disabled = isBusy;
      elements.saveButton.disabled = isBusy;
      elements.resetButton.disabled = isBusy;
      elements.runButton.disabled = isBusy;
      elements.listIdsInput.disabled = isBusy;
      elements.listFilenameInput.disabled = isBusy;
      elements.listConcurrencyInput.disabled = isBusy;
      elements.listRunButton.disabled = isBusy;

      if (status) {
        setStatus(status);
      }
    }

    function renderProgress(percent: number, label: string): void {
      const normalizedPercent: number = Math.min(100, Math.max(0, Math.round(percent)));
      const targetButton: HTMLButtonElement = activeRunButton ?? elements.runButton;

      targetButton.textContent = normalizedPercent >= 100 ? 'Done' : `${normalizedPercent}%`;
      console.log(`Content Asset: ${normalizedPercent}% - ${label}`);
    }

    function scheduleListSettingsSave(): void {
      if (listSettingsSaveTimeout !== undefined) {
        window.clearTimeout(listSettingsSaveTimeout);
      }

      listSettingsSaveTimeout = window.setTimeout((): void => {
        void saveListSettings();
      }, 300);
    }

    async function saveListSettings(): Promise<void> {
      try {
        const currentSettings: ContentAssetSettings = await readSettings();

        await writeSettings({
          ...currentSettings,
          batchConcurrency: parseConcurrency(elements.listConcurrencyInput.value),
          listContentIdsText: elements.listIdsInput.value,
          listFilename: normalizeFilenameInput(elements.listFilenameInput.value),
        });
      } catch (error: unknown) {
        console.error('Failed to save Content Asset list setup', error);
      }
    }
  }

  function parseLocales(value: string): string[] {
    return value
      .split(/[,\n]/)
      .map((locale: string): string => locale.trim())
      .filter((locale: string): boolean => locale !== '');
  }

  function parseSiteIdMap(value: string): Record<string, string> {
    const parsedValue: unknown = JSON.parse(value);

    if (!isRecord(parsedValue)) {
      throw new Error('Site map phải là JSON object.');
    }

    const siteIdByName: Record<string, string> = {};

    Object.entries(parsedValue).forEach(([siteName, siteId]: [string, unknown]): void => {
      if (typeof siteId !== 'string' || siteName.trim() === '' || siteId.trim() === '') {
        throw new Error('Site map chỉ nhận string.');
      }

      siteIdByName[siteName] = siteId;
    });

    return siteIdByName;
  }

  function parseContentIds(value: string): string[] {
    return Array.from(
      new Set(
        value
          .split(/[\s,;]+/)
          .map((contentId: string): string => contentId.trim())
          .filter((contentId: string): boolean => contentId !== '')
      )
    );
  }

  function parseConcurrency(value: string): number {
    const concurrency: number = Number(value);

    if (!Number.isFinite(concurrency)) {
      return FerbToolsContentAssetConfig.DEFAULT_BATCH_CONCURRENCY;
    }

    return Math.max(1, Math.min(10, Math.floor(concurrency)));
  }

  function normalizeFilenameInput(value: string): string {
    return value.trim();
  }

  async function readSettings(): Promise<ContentAssetSettings> {
    return new Promise((resolve: (value: ContentAssetSettings) => void): void => {
      chrome.storage.local.get(CONTENT_ASSET_SETTINGS_STORAGE_KEY, (items: Record<string, unknown>): void => {
        if (chrome.runtime.lastError) {
          resolve(FerbToolsContentAssetConfig.createDefaultSettings());
          return;
        }

        resolve(normalizeSettings(items[CONTENT_ASSET_SETTINGS_STORAGE_KEY]));
      });
    });
  }

  async function writeSettings(settings: ContentAssetSettings): Promise<void> {
    return new Promise((resolve: () => void, reject: (reason?: unknown) => void): void => {
      chrome.storage.local.set(
        {
          [CONTENT_ASSET_SETTINGS_STORAGE_KEY]: settings,
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

  function normalizeSettings(candidate: unknown): ContentAssetSettings {
    const defaults: ContentAssetSettings = FerbToolsContentAssetConfig.createDefaultSettings();

    if (!isRecord(candidate)) {
      return defaults;
    }

    return {
      allowedLocales: Array.isArray(candidate.allowedLocales) ? candidate.allowedLocales.filter((locale: unknown): locale is string => typeof locale === 'string' && locale.trim() !== '') : defaults.allowedLocales,
      siteIdByName: isRecord(candidate.siteIdByName) ? parseSiteIdMap(JSON.stringify(candidate.siteIdByName)) : defaults.siteIdByName,
      batchConcurrency: typeof candidate.batchConcurrency === 'number' && Number.isFinite(candidate.batchConcurrency) ? Math.max(1, Math.min(10, Math.floor(candidate.batchConcurrency))) : defaults.batchConcurrency,
      listContentIdsText: typeof candidate.listContentIdsText === 'string' ? candidate.listContentIdsText : defaults.listContentIdsText,
      listFilename: typeof candidate.listFilename === 'string' ? candidate.listFilename : defaults.listFilename,
    };
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

  async function sendTabMessage<TRequest, TResponse>(tabId: number, message: TRequest, fallbackError: string): Promise<TResponse> {
    try {
      return await sendMessageToTab<TRequest, TResponse>(tabId, message);
    } catch (error: unknown) {
      if (!isMissingReceiverError(error)) {
        throw error;
      }

      await injectContentAssetContentScripts(tabId);
      return sendMessageToTab<TRequest, TResponse>(tabId, message, fallbackError);
    }
  }

  async function sendMessageToTab<TRequest, TResponse>(tabId: number, message: TRequest, fallbackError?: string): Promise<TResponse> {
    return new Promise((resolve: (value: TResponse) => void, reject: (reason?: unknown) => void): void => {
      chrome.tabs.sendMessage(tabId, message, (response: TResponse): void => {
        if (chrome.runtime.lastError) {
          reject(new Error(fallbackError ?? chrome.runtime.lastError.message));
          return;
        }

        resolve(response);
      });
    });
  }

  async function injectContentAssetContentScripts(tabId: number): Promise<void> {
    return new Promise((resolve: () => void, reject: (reason?: unknown) => void): void => {
      chrome.scripting.executeScript(
        {
          target: { tabId },
          files: ['features/content-asset/config.js', 'features/content-asset/content-asset-export.js'],
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
    return error instanceof Error && error.message.includes('Receiving end does not exist');
  }

  function isInjectableUrl(url: string | undefined): boolean {
    return Boolean(url?.startsWith('http://') || url?.startsWith('https://'));
  }

  function createRunId(): string {
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function isProgressMessage(message: unknown): message is ContentAssetExportProgressMessage {
    return (
      typeof message === 'object' &&
      message !== null &&
      (message as Record<string, unknown>).type === 'CONTENT_ASSET_EXPORT_PROGRESS' &&
      typeof (message as Record<string, unknown>).runId === 'string' &&
      typeof (message as Record<string, unknown>).percent === 'number' &&
      typeof (message as Record<string, unknown>).label === 'string'
    );
  }

  function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }
}
