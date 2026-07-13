namespace FerbToolsContentAssetPopupFeature {
  const CONTENT_ASSET_SETTINGS_STORAGE_KEY = 'ferbToolsContentAssetSettings';

  export interface Elements {
    runButton: HTMLButtonElement;
    localesInput: HTMLTextAreaElement;
    siteMapInput: HTMLTextAreaElement;
    saveButton: HTMLButtonElement;
    resetButton: HTMLButtonElement;
  }

  export interface Options {
    elements: Elements;
    setStatus: (status: string) => void;
  }

  export function init(options: Options): void {
    const { elements, setStatus } = options;
    let activeRunId: string | null = null;

    elements.runButton.addEventListener('click', (event: MouseEvent): void => {
      event.preventDefault();
      event.stopPropagation();
      void runTool();
    });

    elements.saveButton.addEventListener('click', (): void => {
      void saveSettings();
    });

    elements.resetButton.addEventListener('click', (): void => {
      void resetSettings();
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
        setStatus(error instanceof Error ? error.message : 'Không đọc được Content Asset setup.');
      }
    }

    async function saveSettings(): Promise<void> {
      setSetupBusy(true, 'Đang lưu Content Asset setup...');

      try {
        const settings: ContentAssetSettings = readSettingsFromForm();

        await writeSettings(settings);
        renderSettings(settings);
        setStatus('Đã lưu Content Asset setup.');
      } catch (error: unknown) {
        setStatus(error instanceof Error ? error.message : 'Không lưu được Content Asset setup.');
      } finally {
        setSetupBusy(false);
      }
    }

    async function resetSettings(): Promise<void> {
      setSetupBusy(true, 'Đang reset Content Asset setup...');

      try {
        const settings: ContentAssetSettings = FerbToolsContentAssetConfig.createDefaultSettings();

        await writeSettings(settings);
        renderSettings(settings);
        setStatus('Đã reset Content Asset setup về mặc định.');
      } catch (error: unknown) {
        setStatus(error instanceof Error ? error.message : 'Không reset được Content Asset setup.');
      } finally {
        setSetupBusy(false);
      }
    }

    async function runTool(): Promise<void> {
      const runId: string = createRunId();
      activeRunId = runId;
      setToolBusy(true, 'Đang chạy Content Asset...');
      renderProgress(1, 'Starting');

      try {
        const tab: chrome.tabs.Tab | undefined = await getCurrentTab();

        if (!tab || typeof tab.id !== 'number' || !isInjectableUrl(tab.url)) {
          throw new Error('Mở trang Business Manager cần export rồi chạy lại tool.');
        }

        const response: ContentAssetExportResponse = await sendTabMessage<ContentAssetExportMessage, ContentAssetExportResponse>(tab.id, {
          type: 'RUN_CONTENT_ASSET_EXPORT',
          runId,
        });

        if (!response.success) {
          throw new Error(response.error ?? 'Không chạy được Content Asset tool.');
        }

        renderProgress(100, 'Done');
        setStatus('Content Asset export đã bắt đầu download.');
      } catch (error: unknown) {
        setStatus(error instanceof Error ? error.message : 'Không chạy được Content Asset tool.');
      } finally {
        setToolBusy(false);
        activeRunId = null;
      }
    }

    function renderSettings(settings: ContentAssetSettings): void {
      elements.localesInput.value = settings.allowedLocales.join(', ');
      elements.siteMapInput.value = JSON.stringify(settings.siteIdByName, null, 2);
    }

    function readSettingsFromForm(): ContentAssetSettings {
      return {
        allowedLocales: parseLocales(elements.localesInput.value),
        siteIdByName: parseSiteIdMap(elements.siteMapInput.value),
      };
    }

    function setToolBusy(isBusy: boolean, status?: string): void {
      elements.runButton.disabled = isBusy;
      elements.saveButton.disabled = isBusy;
      elements.resetButton.disabled = isBusy;
      elements.runButton.textContent = isBusy ? '0%' : 'Run';

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

      if (status) {
        setStatus(status);
      }
    }

    function renderProgress(percent: number, label: string): void {
      const normalizedPercent: number = Math.min(100, Math.max(0, Math.round(percent)));

      elements.runButton.textContent = normalizedPercent >= 100 ? 'Done' : `${normalizedPercent}%`;
      console.log(`Content Asset: ${normalizedPercent}% - ${label}`);
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
      throw new Error('Site mapping phải là JSON object.');
    }

    const siteIdByName: Record<string, string> = {};

    Object.entries(parsedValue).forEach(([siteName, siteId]: [string, unknown]): void => {
      if (typeof siteId !== 'string' || siteName.trim() === '' || siteId.trim() === '') {
        throw new Error('Site mapping chỉ nhận key/value string không rỗng.');
      }

      siteIdByName[siteName] = siteId;
    });

    return siteIdByName;
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

  async function sendTabMessage<TRequest, TResponse>(tabId: number, message: TRequest): Promise<TResponse> {
    return new Promise((resolve: (value: TResponse) => void, reject: (reason?: unknown) => void): void => {
      chrome.tabs.sendMessage(tabId, message, (response: TResponse): void => {
        if (chrome.runtime.lastError) {
          reject(new Error('Refresh tab hiện tại rồi chạy lại Content Asset tool.'));
          return;
        }

        resolve(response);
      });
    });
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
