namespace FerbToolsCheckInPopupFeature {
  const RUNTIME_MESSAGE_TIMEOUT_MS = 5000;

  export interface Elements {
    form: HTMLFormElement;
    enabledInput: HTMLInputElement;
    latestCheckInTimeInput: HTMLInputElement;
    workDurationHoursInput: HTMLInputElement;
    roundingSlotMinutesInput: HTMLSelectElement;
    todayCheckInTimeInput: HTMLInputElement;
    todayCheckInNoteElement: HTMLParagraphElement;
    saveButton: HTMLButtonElement;
    clearTodayButton: HTMLButtonElement;
  }

  export interface Options {
    elements: Elements;
    setStatus: (status: string) => void;
  }

  export function init(options: Options): void {
    const { elements, setStatus } = options;

    elements.form.addEventListener('submit', (event: SubmitEvent): void => {
      event.preventDefault();
      void saveSettings();
    });

    elements.enabledInput.addEventListener('click', (event: MouseEvent): void => {
      event.stopPropagation();
    });

    elements.enabledInput.addEventListener('change', (): void => {
      void saveEnabledSetting();
    });

    elements.clearTodayButton.addEventListener('click', (): void => {
      void clearTodayData();
    });

    void loadSettings();

    async function loadSettings(): Promise<void> {
      setFormBusy(true);

      try {
        const response: NoticeSettingsResponse = await sendRuntimeMessage<NoticeGetSettingsMessage, NoticeSettingsResponse>({
          type: 'GET_SETTINGS',
        });

        if (!response.success || !response.settings) {
          throw new Error(response.error ?? 'Không đọc được setup.');
        }

        renderSettings(response.settings);
        renderToday(response.today);
        setStatus('');
      } catch (error: unknown) {
        setStatus(error instanceof Error ? error.message : 'Không đọc được setup.');
      } finally {
        setFormBusy(false);
      }
    }

    async function saveSettings(): Promise<void> {
      const nextSettings: NoticeSettings = readSettingsFromForm();
      const todayCheckInTime: string = elements.todayCheckInTimeInput.value;

      setFormBusy(true, 'Đang lưu...');

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
            throw new Error(todayResponse.error ?? 'Không lưu được check-in.');
          }

          today = todayResponse.today;
        }

        renderToday(today);
        setStatus(todayCheckInTime ? 'Đã lưu setup + check-in.' : 'Đã lưu setup.');
      } catch (error: unknown) {
        setStatus(error instanceof Error ? error.message : 'Không lưu được setup.');
      } finally {
        setFormBusy(false);
      }
    }

    async function saveEnabledSetting(): Promise<void> {
      setFormBusy(true, elements.enabledInput.checked ? 'Đang bật...' : 'Đang tắt...');

      try {
        const response: NoticeSettingsResponse = await sendRuntimeMessage<NoticeUpdateSettingsMessage, NoticeSettingsResponse>({
          type: 'UPDATE_SETTINGS',
          settings: {
            enabled: elements.enabledInput.checked,
          },
        });

        if (!response.success || !response.settings) {
          throw new Error(response.error ?? 'Không cập nhật được trạng thái.');
        }

        renderSettings(response.settings);
        renderToday(response.today);
        setStatus(response.settings.enabled ? 'Đã bật check-in.' : 'Đã tắt check-in.');
      } catch (error: unknown) {
        setStatus(error instanceof Error ? error.message : 'Không cập nhật được trạng thái.');
        await loadSettings();
      } finally {
        setFormBusy(false);
      }
    }

    async function clearTodayData(): Promise<void> {
      setFormBusy(true, 'Đang xóa...');

      try {
        const response: NoticeClearTodayDataResponse = await sendRuntimeMessage<NoticeClearTodayDataMessage, NoticeClearTodayDataResponse>({
          type: 'CLEAR_TODAY_DATA',
        });

        if (!response.success) {
          throw new Error(response.error ?? 'Không xóa được data hôm nay.');
        }

        renderToday(response.today);
        setStatus('Đã xóa ngày hiện tại.');
      } catch (error: unknown) {
        setStatus(error instanceof Error ? error.message : 'Không xóa được data hôm nay.');
      } finally {
        setFormBusy(false);
      }
    }

    function renderSettings(settings: NoticeSettings): void {
      elements.enabledInput.checked = settings.enabled;
      elements.latestCheckInTimeInput.value = settings.latestCheckInTime;
      elements.workDurationHoursInput.value = formatHours(settings.workDurationMinutes);
      elements.roundingSlotMinutesInput.value = String(settings.roundingSlotMinutes);
    }

    function renderToday(today: NoticeTodayStatus | undefined): void {
      if (!today || !today.hasCheckIn) {
        elements.todayCheckInTimeInput.value = today?.checkInTime ?? '';
        elements.todayCheckInNoteElement.textContent = 'Chưa check-in hôm nay.';
        return;
      }

      elements.todayCheckInTimeInput.value = today.checkInTime ?? '';
      const checkInTime: string = today.checkInTime ?? 'chưa rõ';
      elements.todayCheckInNoteElement.textContent = today.checkoutReminderDueTime
        ? `Check-in ${checkInTime} - Checkout ${today.checkoutReminderDueTime}`
        : `Check-in ${checkInTime}`;
    }

    function readSettingsFromForm(): NoticeSettings {
      return {
        enabled: elements.enabledInput.checked,
        latestCheckInTime: elements.latestCheckInTimeInput.value,
        workDurationMinutes: Math.round(Number(elements.workDurationHoursInput.value) * 60),
        roundingSlotMinutes: Number(elements.roundingSlotMinutesInput.value),
      };
    }

    function setFormBusy(isBusy: boolean, status?: string): void {
      elements.enabledInput.disabled = isBusy;
      elements.latestCheckInTimeInput.disabled = isBusy;
      elements.workDurationHoursInput.disabled = isBusy;
      elements.roundingSlotMinutesInput.disabled = isBusy;
      elements.todayCheckInTimeInput.disabled = isBusy;
      elements.saveButton.disabled = isBusy;
      elements.clearTodayButton.disabled = isBusy;

      if (status) {
        setStatus(status);
      }
    }
  }

  function formatHours(minutes: number): string {
    const hours: number = minutes / 60;
    return Number.isInteger(hours) ? String(hours) : String(Number(hours.toFixed(2)));
  }

  async function sendRuntimeMessage<TRequest, TResponse>(message: TRequest): Promise<TResponse> {
    return new Promise((resolve: (value: TResponse) => void, reject: (reason?: unknown) => void): void => {
      let isSettled: boolean = false;
      const timeoutId: number = window.setTimeout((): void => {
        isSettled = true;
        reject(new Error('Background không phản hồi.'));
      }, RUNTIME_MESSAGE_TIMEOUT_MS);

      chrome.runtime.sendMessage(message, (response: TResponse): void => {
        if (isSettled) {
          return;
        }

        isSettled = true;
        window.clearTimeout(timeoutId);

        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }

        resolve(response);
      });
    });
  }
}
