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

interface NoticeDismissCheckInNoticeMessage {
  type: "DISMISS_CHECKIN_NOTICE";
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

interface ContentAssetListExportMessage {
  type: "RUN_CONTENT_ASSET_LIST_EXPORT";
  runId: string;
  contentIds: string[];
  concurrency: number;
  filename?: string;
}

interface ContentAssetExportProgressMessage {
  type: "CONTENT_ASSET_EXPORT_PROGRESS";
  runId: string;
  percent: number;
  label: string;
}

interface JiraReportGenerateMessage {
  type: "RUN_JIRA_REPORT_GENERATE_V6";
  mode: "work" | "result";
  resultDate: string;
  settings: JiraReportSettings;
}

interface JiraReportSettings {
  role: string;
  myTasksJql: string;
  todayDoneJql: string;
}

interface JiraReportResult {
  workHtml: string;
  resultHtml: string;
  warnings: string[];
}

interface JiraWorklogSettings {
  siteUrl: string;
  attendanceUrl: string;
  month: string;
  concurrency: number;
  role: string;
}

interface JiraWorklogStartMessage {
  type: "RUN_JIRA_WORKLOG_SYNC_V2";
  settings: JiraWorklogSettings;
  cutoffDate: string;
}

interface JiraWorklogTicketResult {
  key: string;
  summary: string;
  seconds: number;
}

interface JiraWorklogDayResult {
  date: string;
  seconds: number;
}

interface JiraWorklogResult {
  accountId: string;
  displayName: string;
  month: string;
  totalSeconds: number;
  cutoffDate: string;
  bugFixSeconds: number;
  completedWithDueDate: number;
  completedOnTime: number;
  ncCount: number;
  tickets: JiraWorklogTicketResult[];
  days: JiraWorklogDayResult[];
  generatedAt: number;
}

interface AttendanceDayResult {
  date: string;
  value: number;
}

interface AttendanceResult {
  month: string;
  cutoffDate: string;
  attendanceDays: number;
  days: AttendanceDayResult[];
}

interface AttendanceStartMessage {
  type: "RUN_ATTENDANCE_SYNC_V1";
  attendanceUrl: string;
  month: string;
  cutoffDate: string;
}

interface AttendanceResponse {
  success: boolean;
  result?: AttendanceResult;
  error?: string;
}

interface ContentAssetSettings {
  allowedLocales: string[];
  siteIdByName: Record<string, string>;
  batchConcurrency: number;
  listContentIdsText: string;
  listFilename: string;
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

interface JiraReportResponse {
  success: boolean;
  report?: JiraReportResult;
  error?: string;
}

interface JiraWorklogResponse {
  success: boolean;
  result?: JiraWorklogResult;
  error?: string;
}
