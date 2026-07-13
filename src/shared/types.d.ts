interface NoticeDailyRecord {
  dayKey: string;
  promptShownAt?: number;
  checkInAt?: number;
  checkoutReminderDueAt?: number;
  checkoutReminderShownAt?: number;
}

interface NoticeSettings {
  enabled: boolean;
  latestCheckInTime: string;
  workDurationMinutes: number;
  roundingSlotMinutes: number;
}

interface NoticeCheckInFeatureState {
  records: Record<string, NoticeDailyRecord>;
  settings: NoticeSettings;
}

interface FerbToolsStorageState {
  version: 1;
  features: {
    checkIn: NoticeCheckInFeatureState;
  };
}

interface NoticeTodayStatus {
  dayKey: string;
  hasCheckIn: boolean;
  checkInTime?: string;
  checkoutReminderDueTime?: string;
}

interface NoticeShowDailyCheckInPromptMessage {
  type: "SHOW_DAILY_CHECKIN_PROMPT";
  dayKey: string;
  isLate: boolean;
  lateMessage?: string;
}

interface NoticeShowCheckoutReminderMessage {
  type: "SHOW_CHECKOUT_REMINDER";
  dayKey: string;
  checkInAt: number;
  dueAt: number;
  workDurationMinutes: number;
}

interface NoticeCompleteCheckInMessage {
  type: "COMPLETE_CHECKIN";
  checkInTime?: string;
}

interface NoticeAcknowledgeCheckoutReminderMessage {
  type: "ACKNOWLEDGE_CHECKOUT_REMINDER";
  dayKey: string;
}

interface NoticeGetSettingsMessage {
  type: "GET_SETTINGS";
}

interface NoticeUpdateSettingsMessage {
  type: "UPDATE_SETTINGS";
  settings: Partial<NoticeSettings>;
}

interface NoticeUpdateTodayCheckInMessage {
  type: "UPDATE_TODAY_CHECKIN";
  checkInTime: string;
}

interface NoticeClearTodayDataMessage {
  type: "CLEAR_TODAY_DATA";
}

interface NoticeSnoozeDailyCheckInPromptMessage {
  type: "SNOOZE_DAILY_CHECKIN_PROMPT";
}

interface ContentAssetExportMessage {
  type: "RUN_CONTENT_ASSET_EXPORT";
  runId: string;
}

interface ContentAssetExportProgressMessage {
  type: "CONTENT_ASSET_EXPORT_PROGRESS";
  runId: string;
  percent: number;
  label: string;
}

interface ContentAssetSettings {
  allowedLocales: string[];
  siteIdByName: Record<string, string>;
}

interface NoticeAcknowledgeCheckoutReminderResponse {
  success: boolean;
  error?: string;
}

interface NoticeSettingsResponse {
  success: boolean;
  settings?: NoticeSettings;
  today?: NoticeTodayStatus;
  error?: string;
}

interface NoticeUpdateTodayCheckInResponse {
  success: boolean;
  today?: NoticeTodayStatus;
  error?: string;
}

interface NoticeClearTodayDataResponse {
  success: boolean;
  today?: NoticeTodayStatus;
  error?: string;
}

interface NoticeSnoozeDailyCheckInPromptResponse {
  success: boolean;
  snoozedUntil?: number;
  error?: string;
}

interface NoticeCompleteCheckInResponse {
  success: boolean;
  dueAt?: number;
  isLate?: boolean;
  lateMessage?: string;
  error?: string;
}

interface ContentAssetExportResponse {
  success: boolean;
  error?: string;
}
