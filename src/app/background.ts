namespace FerbToolsBackground {
  const STORAGE_KEY = 'ferbToolsState';
  const LEGACY_CHECK_IN_STORAGE_KEY = 'noticeCheckInState';
  const CHECK_IN_PROMPT_SNOOZE_STORAGE_KEY = 'ferbToolsCheckInPromptSnoozedTabs';
  const CHECKOUT_REMINDER_PREFIX = 'ferbtools-checkout-reminder';
  const BADGE_REFRESH_ALARM = 'badge-refresh';
  const EXTENSION_NAME = 'FerbTools';
  const EXTENSION_CREDIT = 'Made by Ferb';
  const DAY_MS = 24 * 60 * 60 * 1000;
  const RECORD_RETENTION_DAYS = 45;
  const BADGE_REFRESH_PERIOD_MINUTES = 1;
  const CHECK_IN_PROMPT_SNOOZE_MS = 60 * 60 * 1000;
  const LATE_CHECKIN_MESSAGE = 'Trễ giờ check in T.T';
  const MONDAY_DAY = 1;
  const FRIDAY_DAY = 5;
  const DEFAULT_SETTINGS: NoticeSettings = {
    enabled: true,
    latestCheckInTime: '10:00',
    workDurationMinutes: 9 * 60,
    roundingSlotMinutes: 30,
  };
  const BADGE_TEXT_COLOR = '#ffffff';
  const BADGE_DISABLED_COLOR = '#64748b';
  const BADGE_PENDING_COLOR = '#dc2626';
  const BADGE_COUNTDOWN_COLOR = '#f59e0b';
  const BADGE_READY_COLOR = '#16a34a';

  interface NoticeBadgeState {
    text: string;
    backgroundColor: string;
    title: string;
  }

  let operationChain: Promise<unknown> = Promise.resolve();

  chrome.runtime.onInstalled.addListener((): void => {
    void queueTask(async (): Promise<void> => {
      await initializeState();
      ensureBadgeRefreshAlarm();
      await refreshActionBadge();
    });
  });

  chrome.runtime.onStartup.addListener((): void => {
    void queueTask(async (): Promise<void> => {
      await initializeState();
      ensureBadgeRefreshAlarm();
      await handleCurrentActiveTab();
      await refreshActionBadge();
    });
  });

  chrome.tabs.onActivated.addListener((activeInfo: chrome.tabs.OnActivatedInfo): void => {
    void queueTask(async (): Promise<void> => {
      await handleTabActivation(activeInfo.tabId);
      await refreshActionBadge();
    });
  });

  chrome.tabs.onUpdated.addListener((tabId: number, changeInfo: chrome.tabs.OnUpdatedInfo, tab: chrome.tabs.Tab): void => {
    if (changeInfo.status !== 'complete' || tab.active !== true) {
      return;
    }

    void queueTask(async (): Promise<void> => {
      await handleTabActivation(tabId);
      await refreshActionBadge();
    });
  });

  chrome.tabs.onRemoved.addListener((tabId: number): void => {
    void queueTask(async (): Promise<void> => {
      await removeSnoozedCheckInPromptTab(tabId);
    });
  });

  chrome.windows.onFocusChanged.addListener((windowId: number): void => {
    if (windowId === chrome.windows.WINDOW_ID_NONE) {
      return;
    }

    void queueTask(async (): Promise<void> => {
      await handleCurrentActiveTab();
      await refreshActionBadge();
    });
  });

  chrome.alarms.onAlarm.addListener((alarm: chrome.alarms.Alarm): void => {
    void queueTask(async (): Promise<void> => {
      await handleAlarm(alarm);
    });
  });

  chrome.runtime.onMessage.addListener((message: unknown, sender: chrome.runtime.MessageSender, sendResponse: (response?: NoticeCompleteCheckInResponse | NoticeAcknowledgeCheckoutReminderResponse | NoticeSettingsResponse | NoticeUpdateTodayCheckInResponse | NoticeClearTodayDataResponse | NoticeSnoozeDailyCheckInPromptResponse) => void): boolean | void => {
    if (isCompleteCheckInMessage(message)) {
      void queueTask(async (): Promise<NoticeCompleteCheckInResponse> => {
        return completeCheckIn(message.checkInTime);
      }).then(
        (response: NoticeCompleteCheckInResponse): void => {
          sendResponse(response);
        },
        (error: unknown): void => {
          console.error('Failed to save check-in', error);
          sendResponse({
            success: false,
            error: 'Unable to save your check-in right now.',
          });
        }
      );

      return true;
    }

    if (isGetSettingsMessage(message)) {
      void queueTask(async (): Promise<NoticeSettingsResponse> => {
        const state: FerbToolsStorageState = await initializeState();

        return {
          success: true,
          settings: state.features.checkIn.settings,
          today: getTodayStatus(state, Date.now()),
        };
      }).then(
        (response: NoticeSettingsResponse): void => {
          sendResponse(response);
        },
        (error: unknown): void => {
          console.error('Failed to read settings', error);
          sendResponse({
            success: false,
            error: 'Unable to read settings right now.',
          });
        }
      );

      return true;
    }

    if (isUpdateSettingsMessage(message)) {
      void queueTask(async (): Promise<NoticeSettingsResponse> => {
        return updateSettings(message.settings);
      }).then(
        (response: NoticeSettingsResponse): void => {
          sendResponse(response);
        },
        (error: unknown): void => {
          console.error('Failed to update settings', error);
          sendResponse({
            success: false,
            error: 'Unable to update settings right now.',
          });
        }
      );

      return true;
    }

    if (isUpdateTodayCheckInMessage(message)) {
      void queueTask(async (): Promise<NoticeUpdateTodayCheckInResponse> => {
        return updateTodayCheckIn(message.checkInTime);
      }).then(
        (response: NoticeUpdateTodayCheckInResponse): void => {
          sendResponse(response);
        },
        (error: unknown): void => {
          console.error('Failed to update today check-in time', error);
          sendResponse({
            success: false,
            error: 'Unable to update today check-in time right now.',
          });
        }
      );

      return true;
    }

    if (isClearTodayDataMessage(message)) {
      void queueTask(async (): Promise<NoticeClearTodayDataResponse> => {
        return clearTodayData();
      }).then(
        (response: NoticeClearTodayDataResponse): void => {
          sendResponse(response);
        },
        (error: unknown): void => {
          console.error('Failed to clear today data', error);
          sendResponse({
            success: false,
            error: 'Unable to clear today data right now.',
          });
        }
      );

      return true;
    }

    if (isSnoozeDailyCheckInPromptMessage(message)) {
      void queueTask(async (): Promise<NoticeSnoozeDailyCheckInPromptResponse> => {
        return snoozeDailyCheckInPrompt(sender);
      }).then(
        (response: NoticeSnoozeDailyCheckInPromptResponse): void => {
          sendResponse(response);
        },
        (error: unknown): void => {
          console.error('Failed to snooze daily check-in prompt', error);
          sendResponse({
            success: false,
            error: 'Unable to snooze the check-in prompt right now.',
          });
        }
      );

      return true;
    }

    if (isAcknowledgeCheckoutReminderMessage(message)) {
      void queueTask(async (): Promise<NoticeAcknowledgeCheckoutReminderResponse> => {
        await acknowledgeCheckoutReminder(message.dayKey);

        return {
          success: true,
        };
      }).then(
        (response: NoticeAcknowledgeCheckoutReminderResponse): void => {
          sendResponse(response);
        },
        (error: unknown): void => {
          console.error('Failed to acknowledge checkout reminder', error);
          sendResponse({
            success: false,
            error: 'Unable to acknowledge checkout reminder right now.',
          });
        }
      );

      return true;
    }
  });

  function queueTask<T>(task: () => Promise<T>): Promise<T> {
    const scheduledTask: Promise<T> = operationChain.then(task, task);

    operationChain = scheduledTask.then(
      (): void => undefined,
      (): void => undefined
    );

    return scheduledTask;
  }

  async function initializeState(): Promise<FerbToolsStorageState> {
    const currentState: FerbToolsStorageState = await getStorageState();
    const prunedState: { state: FerbToolsStorageState; changed: boolean } = pruneState(currentState, Date.now());

    if (prunedState.changed) {
      await saveStorageState(prunedState.state);
    }

    return prunedState.state;
  }

  async function handleCurrentActiveTab(): Promise<void> {
    const activeTab: chrome.tabs.Tab | null = await getCurrentActiveTab();

    if (!activeTab || typeof activeTab.id !== 'number') {
      return;
    }

    await handleTabActivation(activeTab.id);
  }

  async function handleTabActivation(tabId: number): Promise<void> {
    const tab: chrome.tabs.Tab | null = await getTab(tabId);

    if (!tab || typeof tab.id !== 'number' || !isInjectableUrl(tab.url)) {
      return;
    }

    const state: FerbToolsStorageState = await initializeState();

    if (!state.features.checkIn.settings.enabled) {
      await dismissCheckInNotice(tab.id);
      return;
    }

    const now: number = Date.now();
    const dayKey: string = getDayKey(now);
    const pendingReminder: NoticeDailyRecord | null = getPendingCheckoutReminder(state, now, dayKey);

    if (pendingReminder) {
      const reminderShown: boolean = await showCheckoutReminder(tab.id, pendingReminder, state.features.checkIn.settings);

      if (reminderShown) {
        pendingReminder.checkoutReminderShownAt = now;
        state.features.checkIn.records[pendingReminder.dayKey] = pendingReminder;
        await saveStorageState(state);
      }

      return;
    }

    const activeWorkRecord: NoticeDailyRecord | null = getActiveWorkRecord(state, now, dayKey);

    if (activeWorkRecord) {
      return;
    }

    const todayRecord: NoticeDailyRecord | undefined = state.features.checkIn.records[dayKey];

    if (todayRecord?.checkInAt) {
      return;
    }

    if (!shouldShowDailyCheckInPrompt(now, state.features.checkIn.settings)) {
      await dismissCheckInNotice(tab.id);
      return;
    }

    if (await isCheckInPromptSnoozed(tab.id, now)) {
      return;
    }

    const promptShown: boolean = await showDailyCheckInPrompt(tab.id, dayKey, state.features.checkIn.settings);

    if (!promptShown) {
      return;
    }

    state.features.checkIn.records[dayKey] = {
      dayKey,
      promptShownAt: now,
    };

    await saveStorageState(state);
  }

  async function handleAlarm(alarm: chrome.alarms.Alarm): Promise<void> {
    if (alarm.name === BADGE_REFRESH_ALARM) {
      await refreshActionBadge();
      return;
    }

    const dayKey: string | null = parseAlarmDayKey(alarm.name);

    if (!dayKey) {
      return;
    }

    const now: number = Date.now();

    if (dayKey !== getDayKey(now) || isWeekend(now)) {
      await refreshActionBadge();
      return;
    }

    const state: FerbToolsStorageState = await initializeState();

    if (!state.features.checkIn.settings.enabled) {
      await refreshActionBadge();
      return;
    }

    const record: NoticeDailyRecord | undefined = state.features.checkIn.records[dayKey];

    if (!record || !record.checkInAt || !record.checkoutReminderDueAt || record.checkoutReminderShownAt) {
      await refreshActionBadge();
      return;
    }

    const activeTab: chrome.tabs.Tab | null = await getCurrentActiveTab();

    if (!activeTab || typeof activeTab.id !== 'number' || !isInjectableUrl(activeTab.url)) {
      await refreshActionBadge();
      return;
    }

    const reminderShown: boolean = await showCheckoutReminder(activeTab.id, record, state.features.checkIn.settings);

    if (!reminderShown) {
      await refreshActionBadge();
      return;
    }

    record.checkoutReminderShownAt = now;
    state.features.checkIn.records[dayKey] = record;
    await saveStorageState(state);
    await refreshActionBadge();
  }

  async function completeCheckIn(checkInTime?: string): Promise<NoticeCompleteCheckInResponse> {
    if (typeof checkInTime === 'string' && !isTimeInput(checkInTime)) {
      return {
        success: false,
        error: 'Invalid check-in time.',
      };
    }

    const now: number = Date.now();
    const dayKey: string = getDayKey(now);
    const state: FerbToolsStorageState = await initializeState();
    const record: NoticeDailyRecord = state.features.checkIn.records[dayKey] ?? { dayKey };
    const checkInAt: number = checkInTime ? getLocalTimeTimestamp(now, checkInTime) : now;
    const isLate: boolean = isLateCheckInTime(checkInAt, state.features.checkIn.settings);
    const checkoutReminderDueAt: number = roundCheckoutReminderTime(
      checkInAt + minutesToMilliseconds(state.features.checkIn.settings.workDurationMinutes),
      state.features.checkIn.settings.roundingSlotMinutes
    );

    record.promptShownAt = record.promptShownAt ?? now;
    record.checkInAt = checkInAt;
    record.checkoutReminderDueAt = checkoutReminderDueAt;
    delete record.checkoutReminderShownAt;

    state.features.checkIn.records[dayKey] = record;

    await saveStorageState(state);
    await clearAlarm(getAlarmName(dayKey));

    if (record.checkoutReminderDueAt > now) {
      chrome.alarms.create(getAlarmName(dayKey), {
        when: record.checkoutReminderDueAt,
      });
    }

    ensureBadgeRefreshAlarm();
    await refreshActionBadge();

    return {
      success: true,
      dueAt: record.checkoutReminderDueAt,
      isLate,
      lateMessage: isLate ? LATE_CHECKIN_MESSAGE : undefined,
    };
  }

  async function acknowledgeCheckoutReminder(dayKey: string): Promise<void> {
    const state: FerbToolsStorageState = await initializeState();
    const record: NoticeDailyRecord | undefined = state.features.checkIn.records[dayKey];

    if (record?.checkInAt && record.checkoutReminderDueAt && !record.checkoutReminderShownAt) {
      record.checkoutReminderShownAt = Date.now();
      state.features.checkIn.records[dayKey] = record;
      await saveStorageState(state);
    }

    await refreshActionBadge();
  }

  async function updateSettings(settingsPatch: Partial<NoticeSettings>): Promise<NoticeSettingsResponse> {
    const state: FerbToolsStorageState = await initializeState();
    const nextSettings: NoticeSettings = normalizeSettings({
      ...state.features.checkIn.settings,
      ...settingsPatch,
    });

    state.features.checkIn.settings = nextSettings;
    await saveStorageState(state);
    await refreshActionBadge();

    return {
      success: true,
      settings: nextSettings,
      today: getTodayStatus(state, Date.now()),
    };
  }

  async function updateTodayCheckIn(checkInTime: string): Promise<NoticeUpdateTodayCheckInResponse> {
    if (!isTimeInput(checkInTime)) {
      return {
        success: false,
        error: 'Giờ check-in hôm nay không hợp lệ.',
      };
    }

    const now: number = Date.now();
    const dayKey: string = getDayKey(now);
    const state: FerbToolsStorageState = await initializeState();
    const record: NoticeDailyRecord = state.features.checkIn.records[dayKey] ?? { dayKey };
    const checkInAt: number = getLocalTimeTimestamp(now, checkInTime);
    const checkoutReminderDueAt: number = roundCheckoutReminderTime(
      checkInAt + minutesToMilliseconds(state.features.checkIn.settings.workDurationMinutes),
      state.features.checkIn.settings.roundingSlotMinutes
    );
    const previousCheckoutReminderDueAt: number | undefined = record.checkoutReminderDueAt;

    record.promptShownAt = record.promptShownAt ?? now;
    record.checkInAt = checkInAt;
    record.checkoutReminderDueAt = checkoutReminderDueAt;

    if (previousCheckoutReminderDueAt !== checkoutReminderDueAt) {
      delete record.checkoutReminderShownAt;
    }

    state.features.checkIn.records[dayKey] = record;

    await saveStorageState(state);
    await clearAlarm(getAlarmName(dayKey));

    if (record.checkoutReminderDueAt > now) {
      chrome.alarms.create(getAlarmName(dayKey), {
        when: record.checkoutReminderDueAt,
      });
    }

    ensureBadgeRefreshAlarm();
    await refreshActionBadge();

    return {
      success: true,
      today: getTodayStatus(state, now),
    };
  }

  async function clearTodayData(): Promise<NoticeClearTodayDataResponse> {
    const now: number = Date.now();
    const dayKey: string = getDayKey(now);
    const state: FerbToolsStorageState = await initializeState();

    delete state.features.checkIn.records[dayKey];

    await saveStorageState(state);
    await clearAlarm(getAlarmName(dayKey));
    await refreshActionBadge();

    return {
      success: true,
      today: getTodayStatus(state, now),
    };
  }

  async function snoozeDailyCheckInPrompt(sender: chrome.runtime.MessageSender): Promise<NoticeSnoozeDailyCheckInPromptResponse> {
    const tabId: number | undefined = sender.tab?.id;

    if (typeof tabId !== 'number') {
      return {
        success: false,
        error: 'Unable to identify the current tab.',
      };
    }

    const snoozedUntil: number = Date.now() + CHECK_IN_PROMPT_SNOOZE_MS;
    const snoozedTabs: Record<string, number> = await getSnoozedCheckInPromptTabs();

    snoozedTabs[String(tabId)] = snoozedUntil;
    await saveSnoozedCheckInPromptTabs(snoozedTabs);

    return {
      success: true,
      snoozedUntil,
    };
  }

  function getPendingCheckoutReminder(state: FerbToolsStorageState, now: number, dayKey: string = getDayKey(now)): NoticeDailyRecord | null {
    const pendingRecords: NoticeDailyRecord[] = [state.features.checkIn.records[dayKey]]
      .filter((record: NoticeDailyRecord | undefined): record is NoticeDailyRecord => Boolean(record))
      .filter((record: NoticeDailyRecord): boolean => {
        return Boolean(record.checkInAt && record.checkoutReminderDueAt && record.checkoutReminderDueAt <= now && !record.checkoutReminderShownAt);
      })
      .sort((leftRecord: NoticeDailyRecord, rightRecord: NoticeDailyRecord): number => {
        return (leftRecord.checkoutReminderDueAt ?? 0) - (rightRecord.checkoutReminderDueAt ?? 0);
      });

    return pendingRecords[0] ?? null;
  }

  function getActiveWorkRecord(state: FerbToolsStorageState, now: number, dayKey: string = getDayKey(now)): NoticeDailyRecord | null {
    const activeRecords: NoticeDailyRecord[] = [state.features.checkIn.records[dayKey]]
      .filter((record: NoticeDailyRecord | undefined): record is NoticeDailyRecord => Boolean(record))
      .filter((record: NoticeDailyRecord): boolean => {
        return Boolean(record.checkInAt && record.checkoutReminderDueAt && record.checkoutReminderDueAt > now);
      })
      .sort((leftRecord: NoticeDailyRecord, rightRecord: NoticeDailyRecord): number => {
        return (rightRecord.checkInAt ?? 0) - (leftRecord.checkInAt ?? 0);
      });

    return activeRecords[0] ?? null;
  }

  async function isCheckInPromptSnoozed(tabId: number, now: number): Promise<boolean> {
    const snoozedTabs: Record<string, number> = await getSnoozedCheckInPromptTabs();
    const tabKey: string = String(tabId);
    const snoozedUntil: number | undefined = snoozedTabs[tabKey];

    if (typeof snoozedUntil !== 'number') {
      return false;
    }

    if (snoozedUntil <= now) {
      delete snoozedTabs[tabKey];
      await saveSnoozedCheckInPromptTabs(snoozedTabs);
      return false;
    }

    return true;
  }

  async function removeSnoozedCheckInPromptTab(tabId: number): Promise<void> {
    const snoozedTabs: Record<string, number> = await getSnoozedCheckInPromptTabs();
    const tabKey: string = String(tabId);

    if (typeof snoozedTabs[tabKey] !== 'number') {
      return;
    }

    delete snoozedTabs[tabKey];
    await saveSnoozedCheckInPromptTabs(snoozedTabs);
  }

  function getTodayStatus(state: FerbToolsStorageState, now: number): NoticeTodayStatus {
    const dayKey: string = getDayKey(now);
    const record: NoticeDailyRecord | undefined = state.features.checkIn.records[dayKey];

    return {
      dayKey,
      hasCheckIn: Boolean(record?.checkInAt),
      checkInTime: typeof record?.checkInAt === 'number' ? formatTimeInput(record.checkInAt) : undefined,
      checkoutReminderDueTime: typeof record?.checkoutReminderDueAt === 'number' ? formatTimeInput(record.checkoutReminderDueAt) : undefined,
    };
  }

  async function refreshActionBadge(): Promise<void> {
    const state: FerbToolsStorageState = await initializeState();
    const badgeState: NoticeBadgeState = getBadgeState(state, Date.now());

    await Promise.all([chrome.action.setBadgeText({ text: badgeState.text }), chrome.action.setBadgeBackgroundColor({ color: badgeState.backgroundColor }), chrome.action.setBadgeTextColor({ color: BADGE_TEXT_COLOR }), chrome.action.setTitle({ title: badgeState.title })]);
  }

  function getBadgeState(state: FerbToolsStorageState, now: number): NoticeBadgeState {
    if (!state.features.checkIn.settings.enabled) {
      return {
        text: 'OFF',
        backgroundColor: BADGE_DISABLED_COLOR,
        title: withExtensionCredit('Reminder đang tắt. Bấm icon để bật lại.'),
      };
    }

    const activeWorkRecord: NoticeDailyRecord | null = getActiveWorkRecord(state, now);

    if (activeWorkRecord?.checkInAt && activeWorkRecord.checkoutReminderDueAt) {
      const remainingMs: number = activeWorkRecord.checkoutReminderDueAt - now;

      return {
        text: formatBadgeCountdown(remainingMs),
        backgroundColor: BADGE_COUNTDOWN_COLOR,
        title: withExtensionCredit(`Check in: ${formatTime(activeWorkRecord.checkInAt)}.\nCòn ${formatDuration(remainingMs)}.\nĐủ giờ: ${formatTime(activeWorkRecord.checkoutReminderDueAt)}.`),
      };
    }

    const todayRecord: NoticeDailyRecord | undefined = state.features.checkIn.records[getDayKey(now)];

    if (todayRecord?.checkInAt && todayRecord.checkoutReminderDueAt && todayRecord.checkoutReminderDueAt <= now) {
      return {
        text: 'OUT',
        backgroundColor: BADGE_READY_COLOR,
        title: withExtensionCredit(`Đã đủ ${formatWorkDuration(state.features.checkIn.settings.workDurationMinutes)}.\nNhớ checkout trước khi ra về.\nCheck in: ${formatTime(todayRecord.checkInAt)}.\nĐủ giờ: ${formatTime(todayRecord.checkoutReminderDueAt)}.`),
      };
    }

    const lateSuffix: string = isLateCheckInTime(now, state.features.checkIn.settings) ? ` ${LATE_CHECKIN_MESSAGE}` : '';

    return {
      text: 'IN?',
      backgroundColor: BADGE_PENDING_COLOR,
      title: withExtensionCredit(`Chưa check in hôm nay.${lateSuffix}`),
    };
  }

  async function showDailyCheckInPrompt(tabId: number, dayKey: string, settings: NoticeSettings): Promise<boolean> {
    const now: number = Date.now();
    const isLate: boolean = isLateCheckInTime(now, settings);
    const message: NoticeShowDailyCheckInPromptMessage = {
      type: 'SHOW_DAILY_CHECKIN_PROMPT',
      dayKey,
      isLate,
      lateMessage: isLate ? LATE_CHECKIN_MESSAGE : undefined,
    };

    return showNotice(tabId, message);
  }

  async function showCheckoutReminder(tabId: number, record: NoticeDailyRecord, settings: NoticeSettings): Promise<boolean> {
    if (!record.checkInAt || !record.checkoutReminderDueAt) {
      return false;
    }

    const message: NoticeShowCheckoutReminderMessage = {
      type: 'SHOW_CHECKOUT_REMINDER',
      dayKey: record.dayKey,
      checkInAt: record.checkInAt,
      dueAt: record.checkoutReminderDueAt,
      workDurationMinutes: settings.workDurationMinutes,
    };

    return showNotice(tabId, message);
  }

  async function dismissCheckInNotice(tabId: number): Promise<void> {
    await sendMessageToTab(tabId, {
      type: 'DISMISS_CHECKIN_NOTICE',
    });
  }

  async function showNotice(tabId: number, message: NoticeShowDailyCheckInPromptMessage | NoticeShowCheckoutReminderMessage): Promise<boolean> {
    const scriptInjected: boolean = await injectContentScript(tabId);

    if (!scriptInjected) {
      return false;
    }

    return sendMessageToTab(tabId, message);
  }

  async function injectContentScript(tabId: number): Promise<boolean> {
    return new Promise((resolve: (value: boolean) => void): void => {
      chrome.scripting.executeScript(
        {
          target: { tabId },
          files: ['features/check-in/content.js'],
        },
        (): void => {
          if (chrome.runtime.lastError) {
            resolve(false);
            return;
          }

          resolve(true);
        }
      );
    });
  }

  async function sendMessageToTab(tabId: number, message: NoticeShowDailyCheckInPromptMessage | NoticeShowCheckoutReminderMessage | NoticeDismissCheckInNoticeMessage): Promise<boolean> {
    return new Promise((resolve: (value: boolean) => void): void => {
      chrome.tabs.sendMessage(tabId, message, (): void => {
        if (chrome.runtime.lastError) {
          resolve(false);
          return;
        }

        resolve(true);
      });
    });
  }

  function getAlarmName(dayKey: string): string {
    return `${CHECKOUT_REMINDER_PREFIX}:${dayKey}`;
  }

  function parseAlarmDayKey(alarmName: string): string | null {
    if (!alarmName.startsWith(`${CHECKOUT_REMINDER_PREFIX}:`)) {
      return null;
    }

    const dayKey: string = alarmName.slice(CHECKOUT_REMINDER_PREFIX.length + 1);
    return dayKey || null;
  }

  function pruneState(state: FerbToolsStorageState, now: number): { state: FerbToolsStorageState; changed: boolean } {
    const cutoffDayKey: string = getDayKey(now - RECORD_RETENTION_DAYS * DAY_MS);
    const nextRecords: Record<string, NoticeDailyRecord> = {};
    let changed: boolean = false;

    Object.entries(state.features.checkIn.records).forEach(([dayKey, record]: [string, NoticeDailyRecord]): void => {
      if (dayKey < getDayKey(now) && !record.checkInAt) {
        changed = true;
        return;
      }

      if (dayKey >= cutoffDayKey) {
        nextRecords[dayKey] = record;
        return;
      }

      changed = true;
    });

    return {
      state: {
        version: 1,
        features: {
          checkIn: {
            records: nextRecords,
            settings: state.features.checkIn.settings,
          },
        },
      },
      changed,
    };
  }

  function getDayKey(timestamp: number): string {
    const date: Date = new Date(timestamp);
    const year: string = String(date.getFullYear());
    const month: string = String(date.getMonth() + 1).padStart(2, '0');
    const day: string = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }

  function isLateCheckInTime(timestamp: number, settings: NoticeSettings): boolean {
    return timestamp > getLocalTimeTimestamp(timestamp, settings.latestCheckInTime);
  }

  function shouldShowDailyCheckInPrompt(timestamp: number, settings: NoticeSettings): boolean {
    return !isWeekend(timestamp) && timestamp <= getLocalTimeTimestamp(timestamp, settings.latestCheckInTime);
  }

  function isWeekend(timestamp: number): boolean {
    const day: number = new Date(timestamp).getDay();
    return day < MONDAY_DAY || day > FRIDAY_DAY;
  }

  function getLocalTimeTimestamp(timestamp: number, time: string): number {
    const date: Date = new Date(timestamp);
    const [hours, minutes] = time.split(':').map((value: string): number => Number(value));

    date.setHours(hours, minutes, 0, 0);
    return date.getTime();
  }

  function roundCheckoutReminderTime(timestamp: number, roundingSlotMinutes: number): number {
    if (roundingSlotMinutes <= 0) {
      return timestamp;
    }

    const date: Date = new Date(timestamp);
    const currentMinutes: number = date.getMinutes();
    const remainderMinutes: number = currentMinutes % roundingSlotMinutes;

    if (remainderMinutes === 0) {
      date.setSeconds(0, 0);
      return date.getTime();
    }

    date.setMinutes(currentMinutes + (roundingSlotMinutes - remainderMinutes), 0, 0);
    return date.getTime();
  }

  function minutesToMilliseconds(minutes: number): number {
    return minutes * 60 * 1000;
  }

  function formatBadgeCountdown(remainingMs: number): string {
    const totalMinutes: number = Math.max(0, Math.ceil(remainingMs / (60 * 1000)));

    if (totalMinutes >= 60) {
      const hours: number = Math.floor(totalMinutes / 60);
      const minutes: number = totalMinutes % 60;

      if (hours >= 10) {
        return `${hours}h`;
      }

      return `${hours}:${String(minutes).padStart(2, '0')}`;
    }

    return `${totalMinutes}m`;
  }

  function formatDuration(remainingMs: number): string {
    const totalMinutes: number = Math.max(0, Math.ceil(remainingMs / (60 * 1000)));
    const hours: number = Math.floor(totalMinutes / 60);
    const minutes: number = totalMinutes % 60;

    if (hours === 0) {
      return `${minutes} phút`;
    }

    if (minutes === 0) {
      return `${hours} giờ`;
    }

    return `${hours} giờ ${minutes} phút`;
  }

  function formatWorkDuration(minutes: number): string {
    return formatDuration(minutesToMilliseconds(minutes));
  }

  function formatTime(timestamp: number): string {
    return new Intl.DateTimeFormat('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(timestamp));
  }

  function formatTimeInput(timestamp: number): string {
    const date: Date = new Date(timestamp);
    const hours: string = String(date.getHours()).padStart(2, '0');
    const minutes: string = String(date.getMinutes()).padStart(2, '0');

    return `${hours}:${minutes}`;
  }

  function ensureBadgeRefreshAlarm(): void {
    chrome.alarms.create(BADGE_REFRESH_ALARM, {
      periodInMinutes: BADGE_REFRESH_PERIOD_MINUTES,
    });
  }

  function withExtensionCredit(message: string): string {
    return `${EXTENSION_NAME} • ${EXTENSION_CREDIT}\n${message}`;
  }

  function isInjectableUrl(url: string | undefined): boolean {
    if (!url) {
      return false;
    }

    return url.startsWith('http://') || url.startsWith('https://') || url.startsWith('file://');
  }

  function isCompleteCheckInMessage(message: unknown): message is NoticeCompleteCheckInMessage {
    return isRecord(message) && message.type === 'COMPLETE_CHECKIN';
  }

  function isGetSettingsMessage(message: unknown): message is NoticeGetSettingsMessage {
    return isRecord(message) && message.type === 'GET_SETTINGS';
  }

  function isUpdateSettingsMessage(message: unknown): message is NoticeUpdateSettingsMessage {
    return isRecord(message) && message.type === 'UPDATE_SETTINGS' && isRecord(message.settings);
  }

  function isUpdateTodayCheckInMessage(message: unknown): message is NoticeUpdateTodayCheckInMessage {
    return isRecord(message) && message.type === 'UPDATE_TODAY_CHECKIN' && typeof message.checkInTime === 'string';
  }

  function isClearTodayDataMessage(message: unknown): message is NoticeClearTodayDataMessage {
    return isRecord(message) && message.type === 'CLEAR_TODAY_DATA';
  }

  function isSnoozeDailyCheckInPromptMessage(message: unknown): message is NoticeSnoozeDailyCheckInPromptMessage {
    return isRecord(message) && message.type === 'SNOOZE_DAILY_CHECKIN_PROMPT';
  }

  function isAcknowledgeCheckoutReminderMessage(message: unknown): message is NoticeAcknowledgeCheckoutReminderMessage {
    return isRecord(message) && message.type === 'ACKNOWLEDGE_CHECKOUT_REMINDER' && typeof message.dayKey === 'string';
  }

  function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  async function getStorageState(): Promise<FerbToolsStorageState> {
    return new Promise((resolve: (value: FerbToolsStorageState) => void): void => {
      chrome.storage.local.get([STORAGE_KEY, LEGACY_CHECK_IN_STORAGE_KEY], (items: Record<string, unknown>): void => {
        if (chrome.runtime.lastError) {
          console.error('Failed to read extension state', chrome.runtime.lastError);
          resolve(createEmptyState());
          return;
        }

        resolve(normalizeState(items[STORAGE_KEY] ?? items[LEGACY_CHECK_IN_STORAGE_KEY]));
      });
    });
  }

  async function saveStorageState(state: FerbToolsStorageState): Promise<void> {
    return new Promise((resolve: () => void, reject: (reason?: unknown) => void): void => {
      chrome.storage.local.set(
        {
          [STORAGE_KEY]: state,
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

  async function getSnoozedCheckInPromptTabs(): Promise<Record<string, number>> {
    return new Promise((resolve: (value: Record<string, number>) => void): void => {
      chrome.storage.session.get(CHECK_IN_PROMPT_SNOOZE_STORAGE_KEY, (items: Record<string, unknown>): void => {
        if (chrome.runtime.lastError) {
          console.error('Failed to read check-in prompt snooze state', chrome.runtime.lastError);
          resolve({});
          return;
        }

        resolve(normalizeSnoozedCheckInPromptTabs(items[CHECK_IN_PROMPT_SNOOZE_STORAGE_KEY]));
      });
    });
  }

  async function saveSnoozedCheckInPromptTabs(snoozedTabs: Record<string, number>): Promise<void> {
    return new Promise((resolve: () => void, reject: (reason?: unknown) => void): void => {
      chrome.storage.session.set(
        {
          [CHECK_IN_PROMPT_SNOOZE_STORAGE_KEY]: snoozedTabs,
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

  async function clearAlarm(alarmName: string): Promise<boolean> {
    return new Promise((resolve: (value: boolean) => void): void => {
      chrome.alarms.clear(alarmName, (wasCleared: boolean): void => {
        if (chrome.runtime.lastError) {
          resolve(false);
          return;
        }

        resolve(wasCleared);
      });
    });
  }

  async function getCurrentActiveTab(): Promise<chrome.tabs.Tab | null> {
    const tabs: chrome.tabs.Tab[] = await queryTabs({
      active: true,
      lastFocusedWindow: true,
    });

    return tabs[0] ?? null;
  }

  async function queryTabs(queryInfo: chrome.tabs.QueryInfo): Promise<chrome.tabs.Tab[]> {
    return new Promise((resolve: (value: chrome.tabs.Tab[]) => void): void => {
      chrome.tabs.query(queryInfo, (tabs: chrome.tabs.Tab[]): void => {
        if (chrome.runtime.lastError) {
          resolve([]);
          return;
        }

        resolve(tabs);
      });
    });
  }

  async function getTab(tabId: number): Promise<chrome.tabs.Tab | null> {
    return new Promise((resolve: (value: chrome.tabs.Tab | null) => void): void => {
      chrome.tabs.get(tabId, (tab: chrome.tabs.Tab): void => {
        if (chrome.runtime.lastError) {
          resolve(null);
          return;
        }

        resolve(tab);
      });
    });
  }

  function createEmptyState(): FerbToolsStorageState {
    return {
      version: 1,
      features: {
        checkIn: {
          records: {},
          settings: DEFAULT_SETTINGS,
        },
      },
    };
  }

  function normalizeState(candidate: unknown): FerbToolsStorageState {
    if (!isRecord(candidate) || candidate.version !== 1) {
      return createEmptyState();
    }

    if (isRecord(candidate.features) && isRecord(candidate.features.checkIn)) {
      return {
        version: 1,
        features: {
          checkIn: normalizeCheckInFeatureState(candidate.features.checkIn),
        },
      };
    }

    if (isRecord(candidate.records)) {
      return {
        version: 1,
        features: {
          checkIn: normalizeCheckInFeatureState(candidate),
        },
      };
    }

    return createEmptyState();
  }

  function normalizeCheckInFeatureState(candidate: unknown): NoticeCheckInFeatureState {
    if (!isRecord(candidate) || !isRecord(candidate.records)) {
      return {
        records: {},
        settings: DEFAULT_SETTINGS,
      };
    }

    const records: Record<string, NoticeDailyRecord> = normalizeRecords(candidate.records);

    return {
      records,
      settings: normalizeSettings(candidate.settings),
    };
  }

  function normalizeRecords(candidate: Record<string, unknown>): Record<string, NoticeDailyRecord> {
    const records: Record<string, NoticeDailyRecord> = {};

    Object.entries(candidate).forEach(([dayKey, value]: [string, unknown]): void => {
      const normalizedRecord: NoticeDailyRecord | null = normalizeRecord(dayKey, value);

      if (normalizedRecord) {
        records[dayKey] = normalizedRecord;
      }
    });

    return records;
  }

  function normalizeSettings(candidate: unknown): NoticeSettings {
    if (!isRecord(candidate)) {
      return DEFAULT_SETTINGS;
    }

    return {
      enabled: typeof candidate.enabled === 'boolean' ? candidate.enabled : DEFAULT_SETTINGS.enabled,
      latestCheckInTime: normalizeTimeInput(candidate.latestCheckInTime),
      workDurationMinutes: normalizeIntegerInput(candidate.workDurationMinutes, 30, 24 * 60, DEFAULT_SETTINGS.workDurationMinutes),
      roundingSlotMinutes: normalizeIntegerInput(candidate.roundingSlotMinutes, 0, 120, DEFAULT_SETTINGS.roundingSlotMinutes),
    };
  }

  function normalizeTimeInput(candidate: unknown): string {
    if (isTimeInput(candidate)) {
      return candidate;
    }

    return DEFAULT_SETTINGS.latestCheckInTime;
  }

  function normalizeSnoozedCheckInPromptTabs(candidate: unknown): Record<string, number> {
    if (!isRecord(candidate)) {
      return {};
    }

    const snoozedTabs: Record<string, number> = {};

    Object.entries(candidate).forEach(([tabKey, snoozedUntil]: [string, unknown]): void => {
      if (/^\d+$/.test(tabKey) && typeof snoozedUntil === 'number' && Number.isFinite(snoozedUntil)) {
        snoozedTabs[tabKey] = snoozedUntil;
      }
    });

    return snoozedTabs;
  }

  function isTimeInput(candidate: unknown): candidate is string {
    return typeof candidate === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(candidate);
  }

  function normalizeIntegerInput(candidate: unknown, min: number, max: number, fallback: number): number {
    if (typeof candidate !== 'number' || !Number.isFinite(candidate)) {
      return fallback;
    }

    const normalizedValue: number = Math.round(candidate);
    return Math.min(max, Math.max(min, normalizedValue));
  }

  function normalizeRecord(dayKey: string, candidate: unknown): NoticeDailyRecord | null {
    if (!isRecord(candidate)) {
      return null;
    }

    const record: NoticeDailyRecord = {
      dayKey,
    };

    if (typeof candidate.promptShownAt === 'number') {
      record.promptShownAt = candidate.promptShownAt;
    }

    if (typeof candidate.checkInAt === 'number') {
      record.checkInAt = candidate.checkInAt;
    }

    if (typeof candidate.checkoutReminderDueAt === 'number') {
      record.checkoutReminderDueAt = candidate.checkoutReminderDueAt;
    }

    if (typeof candidate.checkoutReminderShownAt === 'number') {
      record.checkoutReminderShownAt = candidate.checkoutReminderShownAt;
    }

    return record;
  }
}
