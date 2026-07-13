namespace FerbToolsCheckInPopup {
  const APP_VERSION = '1.2.0';
  const form: HTMLFormElement = getElementById('settings-form', HTMLFormElement);
  const versionElement: HTMLSpanElement = getElementById('version', HTMLSpanElement);
  const contentAssetButton: HTMLButtonElement = getElementById('content-asset-button', HTMLButtonElement);
  const enabledInput: HTMLInputElement = getElementById('enabled', HTMLInputElement);
  const latestCheckInTimeInput: HTMLInputElement = getElementById('latest-checkin-time', HTMLInputElement);
  const workDurationHoursInput: HTMLInputElement = getElementById('work-duration-hours', HTMLInputElement);
  const roundingSlotMinutesInput: HTMLSelectElement = getElementById('rounding-slot-minutes', HTMLSelectElement);
  const todayCheckInTimeInput: HTMLInputElement = getElementById('today-checkin-time', HTMLInputElement);
  const todayCheckInNoteElement: HTMLParagraphElement = getElementById('today-checkin-note', HTMLParagraphElement);
  const saveButton: HTMLButtonElement = getElementById('save-button', HTMLButtonElement);
  const clearTodayButton: HTMLButtonElement = getElementById('clear-today-button', HTMLButtonElement);
  const statusElement: HTMLParagraphElement = getElementById('status', HTMLParagraphElement);

  document.addEventListener('DOMContentLoaded', (): void => {
    versionElement.textContent = `v${APP_VERSION}`;
    void loadSettings();
  });

  form.addEventListener('submit', (event: SubmitEvent): void => {
    event.preventDefault();
    void saveSettings();
  });

  enabledInput.addEventListener('change', (): void => {
    void saveEnabledSetting();
  });

  clearTodayButton.addEventListener('click', (): void => {
    void clearTodayData();
  });

  contentAssetButton.addEventListener('click', (): void => {
    void runContentAssetTool();
  });

  async function loadSettings(): Promise<void> {
    setFormBusy(true, 'Đang tải setup...');

    try {
      const response: NoticeSettingsResponse = await sendRuntimeMessage<NoticeGetSettingsMessage, NoticeSettingsResponse>({
        type: 'GET_SETTINGS',
      });

      if (!response.success || !response.settings) {
        throw new Error(response.error ?? 'Không đọc được setup.');
      }

      renderSettings(response.settings);
      renderToday(response.today);
      setStatus('Setup hiện tại đã sẵn sàng.');
    } catch (error: unknown) {
      setStatus(error instanceof Error ? error.message : 'Không đọc được setup.');
    } finally {
      setFormBusy(false);
    }
  }

  async function saveSettings(): Promise<void> {
    const nextSettings: NoticeSettings = readSettingsFromForm();
    const todayCheckInTime: string = todayCheckInTimeInput.value;

    setFormBusy(true, 'Đang lưu setup...');

    try {
      const response: NoticeSettingsResponse = await sendRuntimeMessage<NoticeUpdateSettingsMessage, NoticeSettingsResponse>({
        type: 'UPDATE_SETTINGS',
        settings: nextSettings,
      });

      if (!response.success || !response.settings) {
        throw new Error(response.error ?? 'Không lưu được setup.');
      }

      renderSettings(response.settings);
      let today: NoticeTodayStatus | undefined = response.today;

      if (todayCheckInTime) {
        const todayResponse: NoticeUpdateTodayCheckInResponse = await sendRuntimeMessage<NoticeUpdateTodayCheckInMessage, NoticeUpdateTodayCheckInResponse>({
          type: 'UPDATE_TODAY_CHECKIN',
          checkInTime: todayCheckInTime,
        });

        if (!todayResponse.success) {
          throw new Error(todayResponse.error ?? 'Không cập nhật được giờ check-in hôm nay.');
        }

        today = todayResponse.today;
      }

      renderToday(today);
      setStatus(todayCheckInTime ? 'Đã lưu setup và cập nhật giờ check-in hôm nay.' : 'Đã lưu setup. Badge sẽ cập nhật ngay.');
    } catch (error: unknown) {
      setStatus(error instanceof Error ? error.message : 'Không lưu được setup.');
    } finally {
      setFormBusy(false);
    }
  }

  async function saveEnabledSetting(): Promise<void> {
    setFormBusy(true, enabledInput.checked ? 'Đang bật FerbTools...' : 'Đang tắt FerbTools...');

    try {
      const response: NoticeSettingsResponse = await sendRuntimeMessage<NoticeUpdateSettingsMessage, NoticeSettingsResponse>({
        type: 'UPDATE_SETTINGS',
        settings: {
          enabled: enabledInput.checked,
        },
      });

      if (!response.success || !response.settings) {
        throw new Error(response.error ?? 'Không cập nhật được trạng thái FerbTools.');
      }

      renderSettings(response.settings);
      renderToday(response.today);
      setStatus(response.settings.enabled ? 'FerbTools đã bật.' : 'FerbTools đã tắt.');
    } catch (error: unknown) {
      setStatus(error instanceof Error ? error.message : 'Không cập nhật được trạng thái FerbTools.');
      await loadSettings();
    } finally {
      setFormBusy(false);
    }
  }

  async function clearTodayData(): Promise<void> {
    setFormBusy(true, 'Đang xóa data hôm nay...');

    try {
      const response: NoticeClearTodayDataResponse = await sendRuntimeMessage<NoticeClearTodayDataMessage, NoticeClearTodayDataResponse>({
        type: 'CLEAR_TODAY_DATA',
      });

      if (!response.success) {
        throw new Error(response.error ?? 'Không xóa được data hôm nay.');
      }

      renderToday(response.today);
      setStatus('Đã xóa data hôm nay. Badge sẽ cập nhật ngay.');
    } catch (error: unknown) {
      setStatus(error instanceof Error ? error.message : 'Không xóa được data hôm nay.');
    } finally {
      setFormBusy(false);
    }
  }

  async function runContentAssetTool(): Promise<void> {
    setToolBusy(true, 'Đang chạy Content Asset...');

    try {
      const tab: chrome.tabs.Tab | undefined = await getCurrentTab();

      if (!tab || typeof tab.id !== 'number' || !isInjectableUrl(tab.url)) {
        throw new Error('Mở trang Business Manager cần export rồi chạy lại tool.');
      }

      const response: ContentAssetExportResponse = await sendTabMessage<ContentAssetExportMessage, ContentAssetExportResponse>(tab.id, {
        type: 'RUN_CONTENT_ASSET_EXPORT',
      });

      if (!response.success) {
        throw new Error(response.error ?? 'Không chạy được Content Asset tool.');
      }

      setStatus('Content Asset tool đã chạy trên tab hiện tại.');
    } catch (error: unknown) {
      setStatus(error instanceof Error ? error.message : 'Không chạy được Content Asset tool.');
    } finally {
      setToolBusy(false);
    }
  }

  function renderSettings(settings: NoticeSettings): void {
    enabledInput.checked = settings.enabled;
    latestCheckInTimeInput.value = settings.latestCheckInTime;
    workDurationHoursInput.value = formatHours(settings.workDurationMinutes);
    roundingSlotMinutesInput.value = String(settings.roundingSlotMinutes);
  }

  function renderToday(today: NoticeTodayStatus | undefined): void {
    if (!today || !today.hasCheckIn) {
      todayCheckInTimeInput.value = today?.checkInTime ?? '';
      todayCheckInNoteElement.textContent = 'Chưa check-in hôm nay. Nếu cần set thủ công, nhập giờ thực tế rồi bấm lưu.';
      return;
    }

    todayCheckInTimeInput.value = today.checkInTime ?? '';
    const checkInTime: string = today.checkInTime ?? 'chưa rõ';
    todayCheckInNoteElement.textContent = today.checkoutReminderDueTime
      ? `Check-in hôm nay: ${checkInTime}. Checkout dự kiến: ${today.checkoutReminderDueTime}.`
      : `Check-in hôm nay: ${checkInTime}.`;
  }

  function readSettingsFromForm(): NoticeSettings {
    return {
      enabled: enabledInput.checked,
      latestCheckInTime: latestCheckInTimeInput.value,
      workDurationMinutes: Math.round(Number(workDurationHoursInput.value) * 60),
      roundingSlotMinutes: Number(roundingSlotMinutesInput.value),
    };
  }

  function formatHours(minutes: number): string {
    const hours: number = minutes / 60;
    return Number.isInteger(hours) ? String(hours) : String(Number(hours.toFixed(2)));
  }

  function setFormBusy(isBusy: boolean, status?: string): void {
    enabledInput.disabled = isBusy;
    latestCheckInTimeInput.disabled = isBusy;
    workDurationHoursInput.disabled = isBusy;
    roundingSlotMinutesInput.disabled = isBusy;
    todayCheckInTimeInput.disabled = isBusy;
    saveButton.disabled = isBusy;
    clearTodayButton.disabled = isBusy;
    contentAssetButton.disabled = isBusy;

    if (status) {
      setStatus(status);
    }
  }

  function setToolBusy(isBusy: boolean, status?: string): void {
    contentAssetButton.disabled = isBusy;
    saveButton.disabled = isBusy;
    clearTodayButton.disabled = isBusy;

    if (status) {
      setStatus(status);
    }
  }

  function setStatus(status: string): void {
    statusElement.textContent = status;
  }

  function getElementById<TElement extends HTMLElement>(
    id: string,
    constructor: { new (): TElement }
  ): TElement {
    const element: HTMLElement | null = document.getElementById(id);

    if (!(element instanceof constructor)) {
      throw new Error(`Missing element: ${id}`);
    }

    return element;
  }

  async function sendRuntimeMessage<TRequest, TResponse>(message: TRequest): Promise<TResponse> {
    return new Promise((resolve: (value: TResponse) => void, reject: (reason?: unknown) => void): void => {
      chrome.runtime.sendMessage(message, (response: TResponse): void => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }

        resolve(response);
      });
    });
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

  function isInjectableUrl(url: string | undefined): boolean {
    return Boolean(url?.startsWith('http://') || url?.startsWith('https://'));
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
}
