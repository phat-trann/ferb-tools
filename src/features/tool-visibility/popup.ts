namespace FerbToolsVisibilityPopupFeature {
  const STORAGE_KEY = 'ferbToolsVisibleFunctions';

  interface VisibilitySettings {
    checkIn: boolean;
    contentAsset: boolean;
    contentAssetList: boolean;
    monthlyKpi: boolean;
    jiraReport: boolean;
  }

  export interface Elements {
    checkInInput: HTMLInputElement;
    contentAssetInput: HTMLInputElement;
    contentAssetListInput: HTMLInputElement;
    monthlyKpiInput: HTMLInputElement;
    jiraReportInput: HTMLInputElement;
    checkInSettings: HTMLElement;
    contentAssetSettings: HTMLElement;
    jiraSettings: HTMLElement;
    monthlyKpiAttendanceSetting: HTMLElement;
    monthlyKpiParallelSetting: HTMLElement;
    jiraReportMyTasksSetting: HTMLElement;
    jiraReportTodayDoneSetting: HTMLElement;
    contentAssetCard: HTMLElement;
    contentAssetListCard: HTMLElement;
    monthlyKpiCard: HTMLElement;
    jiraReportCard: HTMLElement;
    emptyState: HTMLParagraphElement;
    checkInEnabledInput: HTMLInputElement;
  }

  export interface Options {
    elements: Elements;
    setStatus: (status: string) => void;
  }

  export function init(options: Options): void {
    const { elements, setStatus } = options;
    const inputs: HTMLInputElement[] = [
      elements.checkInInput,
      elements.contentAssetInput,
      elements.contentAssetListInput,
      elements.monthlyKpiInput,
      elements.jiraReportInput,
    ];

    inputs.forEach((input: HTMLInputElement): void => {
      input.addEventListener('change', (): void => {
        void saveSettings();
      });
    });

    void loadSettings();

    async function loadSettings(): Promise<void> {
      try {
        const settings: VisibilitySettings = normalizeSettings(await readStorage());
        render(settings);
        if (!settings.checkIn) {
          await disableCheckInReminder();
        }
      } catch (error: unknown) {
        console.error('Failed to load visible functions', error);
      }
    }

    async function saveSettings(): Promise<void> {
      const settings: VisibilitySettings = readForm();
      render(settings);

      try {
        await writeStorage(settings);
        if (!settings.checkIn) {
          await disableCheckInReminder();
        }
        setStatus('Đã cập nhật functions hiển thị.');
      } catch (error: unknown) {
        setStatus(error instanceof Error ? error.message : 'Lưu functions hiển thị lỗi.');
      }
    }

    function readForm(): VisibilitySettings {
      return {
        checkIn: elements.checkInInput.checked,
        contentAsset: elements.contentAssetInput.checked,
        contentAssetList: elements.contentAssetListInput.checked,
        monthlyKpi: elements.monthlyKpiInput.checked,
        jiraReport: elements.jiraReportInput.checked,
      };
    }

    function render(settings: VisibilitySettings): void {
      elements.checkInInput.checked = settings.checkIn;
      elements.contentAssetInput.checked = settings.contentAsset;
      elements.contentAssetListInput.checked = settings.contentAssetList;
      elements.monthlyKpiInput.checked = settings.monthlyKpi;
      elements.jiraReportInput.checked = settings.jiraReport;

      elements.checkInSettings.hidden = !settings.checkIn;
      elements.contentAssetSettings.hidden = !settings.contentAsset && !settings.contentAssetList;
      elements.jiraSettings.hidden = !settings.monthlyKpi && !settings.jiraReport;
      elements.monthlyKpiAttendanceSetting.hidden = !settings.monthlyKpi;
      elements.monthlyKpiParallelSetting.hidden = !settings.monthlyKpi;
      elements.jiraReportMyTasksSetting.hidden = !settings.jiraReport;
      elements.jiraReportTodayDoneSetting.hidden = !settings.jiraReport;
      elements.contentAssetCard.hidden = !settings.contentAsset;
      elements.contentAssetListCard.hidden = !settings.contentAssetList;
      elements.monthlyKpiCard.hidden = !settings.monthlyKpi;
      elements.jiraReportCard.hidden = !settings.jiraReport;
      elements.emptyState.hidden = settings.contentAsset || settings.contentAssetList || settings.monthlyKpi || settings.jiraReport;
    }

    async function disableCheckInReminder(): Promise<void> {
      const response: NoticeSettingsResponse = await sendRuntimeMessage<NoticeUpdateSettingsMessage, NoticeSettingsResponse>({
        type: 'UPDATE_SETTINGS',
        settings: { enabled: false },
      });
      if (!response.success) {
        throw new Error(response.error ?? 'Không tắt được Check-in Reminder.');
      }
      elements.checkInEnabledInput.checked = false;
    }
  }

  function normalizeSettings(candidate: unknown): VisibilitySettings {
    const defaults: VisibilitySettings = {
      checkIn: true,
      contentAsset: true,
      contentAssetList: true,
      monthlyKpi: true,
      jiraReport: true,
    };
    if (!isRecord(candidate)) {
      return defaults;
    }
    return {
      checkIn: typeof candidate.checkIn === 'boolean' ? candidate.checkIn : defaults.checkIn,
      contentAsset: typeof candidate.contentAsset === 'boolean' ? candidate.contentAsset : defaults.contentAsset,
      contentAssetList: typeof candidate.contentAssetList === 'boolean' ? candidate.contentAssetList : defaults.contentAssetList,
      monthlyKpi: typeof candidate.monthlyKpi === 'boolean' ? candidate.monthlyKpi : defaults.monthlyKpi,
      jiraReport: typeof candidate.jiraReport === 'boolean' ? candidate.jiraReport : defaults.jiraReport,
    };
  }

  function readStorage(): Promise<unknown> {
    return new Promise((resolve): void => {
      chrome.storage.local.get(STORAGE_KEY, (items: Record<string, unknown>): void => {
        resolve(chrome.runtime.lastError ? undefined : items[STORAGE_KEY]);
      });
    });
  }

  function writeStorage(settings: VisibilitySettings): Promise<void> {
    return new Promise((resolve, reject): void => {
      chrome.storage.local.set({ [STORAGE_KEY]: settings }, (): void => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve();
      });
    });
  }

  function sendRuntimeMessage<TRequest, TResponse>(message: TRequest): Promise<TResponse> {
    return new Promise((resolve, reject): void => {
      chrome.runtime.sendMessage(message, (response: TResponse): void => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(response);
      });
    });
  }

  function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }
}
