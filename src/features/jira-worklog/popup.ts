namespace FerbToolsJiraWorklogPopupFeature {
  const SETTINGS_STORAGE_KEY = 'ferbToolsJiraWorklogSettings';
  const RESULT_STORAGE_KEY = 'ferbToolsJiraKpiLastResult';
  const PRODUCTION_STORAGE_KEY = 'ferbToolsJiraKpiProductionIssueByMonth';
  const DEFAULT_SITE_URL = 'https://globee-software-ecommerce.atlassian.net';
  const DEFAULT_ATTENDANCE_URL = 'https://globee.1office.vn/user?customMenu=user-board-attendance';
  const WORKING_TIME_TARGET_PERCENT = 95;
  const ON_DEADLINE_TARGET_PERCENT = 95;
  const BUG_FIX_MAX_PERCENT = 10;

  interface KpiSnapshot {
    jira: JiraWorklogResult;
    attendance: AttendanceResult;
  }

  interface MetricView {
    label: string;
    value: string;
    target: string;
    actual: number;
    targetValue: number;
    maximum: number;
    pass: boolean;
  }

  export interface Elements {
    section: HTMLDetailsElement;
    siteUrlInput: HTMLInputElement;
    attendanceUrlInput: HTMLInputElement;
    monthInput: HTMLInputElement;
    concurrencyInput: HTMLInputElement;
    roleInput: HTMLInputElement;
    productionIssueInput: HTMLInputElement;
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
    let lastSnapshot: KpiSnapshot | null = null;

    elements.startButton.addEventListener('click', (event: MouseEvent): void => {
      event.preventDefault();
      event.stopPropagation();
      void startSync();
    });

    [elements.siteUrlInput, elements.attendanceUrlInput, elements.monthInput, elements.concurrencyInput, elements.roleInput].forEach(
      (input: HTMLInputElement): void => {
        input.addEventListener('change', (): void => {
          void saveSettings();
          if (input === elements.monthInput) {
            elements.preview.innerHTML = '';
            elements.summaryElement.textContent = 'Bấm Start để tính KPI đến hết hôm qua.';
            void loadProductionIssue();
          }
        });
      }
    );

    elements.productionIssueInput.addEventListener('change', (): void => {
      void saveProductionIssue();
      if (lastSnapshot?.jira.month === elements.monthInput.value) {
        renderSnapshot(lastSnapshot, readSettingsFromForm());
      }
    });

    void loadInitialState();

    async function startSync(): Promise<void> {
      elements.section.open = true;
      setBusy(true, 'Đang lấy Jira API và chấm công 1Office...');

      try {
        const settings: JiraWorklogSettings = readSettingsFromForm();
        const cutoffDate: string = getCutoffDate(settings.month);
        renderSettings(settings);
        await writeSettings(settings);
        const attendanceMonthUrl: string = buildAttendanceMonthUrl(settings.attendanceUrl, settings.month);

        const [jiraTab, attendanceTab]: [chrome.tabs.Tab, chrome.tabs.Tab] = await Promise.all([
          FerbToolsBackgroundTabs.getOrCreate(settings.siteUrl, { serviceName: 'Jira', reuse: 'origin' }),
          FerbToolsBackgroundTabs.getOrCreate(attendanceMonthUrl, {
            serviceName: '1Office',
            reuse: 'path',
            navigateExisting: true,
          }),
        ]);
        if (typeof jiraTab.id !== 'number' || typeof attendanceTab.id !== 'number') {
          throw new Error('Không tìm thấy Jira hoặc 1Office tab hợp lệ.');
        }

        const [jiraResponse, attendanceResponse]: [JiraWorklogResponse, AttendanceResponse] = await Promise.all([
          sendTabMessage<JiraWorklogStartMessage, JiraWorklogResponse>(jiraTab.id, 'features/jira-worklog/content.js', {
            type: 'RUN_JIRA_WORKLOG_SYNC_V2',
            settings,
            cutoffDate,
          }),
          sendTabMessage<AttendanceStartMessage, AttendanceResponse>(attendanceTab.id, 'features/jira-worklog/attendance-content.js', {
            type: 'RUN_ATTENDANCE_SYNC_V1',
            attendanceUrl: settings.attendanceUrl,
            month: settings.month,
            cutoffDate,
          }),
        ]);

        if (!jiraResponse.success || !jiraResponse.result) {
          throw new Error(jiraResponse.error ?? 'Lấy Jira KPI lỗi.');
        }
        if (!attendanceResponse.success || !attendanceResponse.result) {
          throw new Error(attendanceResponse.error ?? 'Lấy chấm công 1Office lỗi.');
        }

        lastSnapshot = { jira: jiraResponse.result, attendance: attendanceResponse.result };
        renderSnapshot(lastSnapshot, settings);
        await writeLastSnapshot(lastSnapshot);
        setStatus(`Đã tính KPI ${settings.month} đến ${cutoffDate}.`);
      } catch (error: unknown) {
        setStatus(error instanceof Error ? error.message : 'Tính KPI tháng lỗi.');
      } finally {
        setBusy(false);
      }
    }

    function setBusy(isBusy: boolean, status?: string): void {
      elements.siteUrlInput.disabled = isBusy;
      elements.attendanceUrlInput.disabled = isBusy;
      elements.monthInput.disabled = isBusy;
      elements.concurrencyInput.disabled = isBusy;
      elements.roleInput.disabled = isBusy;
      elements.productionIssueInput.disabled = isBusy;
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
        await loadProductionIssue();
        lastSnapshot = await readLastSnapshot();
        if (lastSnapshot?.jira.month === settings.month) {
          renderSnapshot(lastSnapshot, settings);
        }
      } catch (error: unknown) {
        console.error('Failed to load Jira KPI state', error);
      }
    }

    async function saveSettings(): Promise<void> {
      try {
        const settings: JiraWorklogSettings = readSettingsFromForm();
        renderSettings(settings);
        await writeSettings(settings);
        if (lastSnapshot?.jira.month === settings.month) {
          renderSnapshot(lastSnapshot, settings);
        }
      } catch (error: unknown) {
        setStatus(error instanceof Error ? error.message : 'Lưu Jira KPI config lỗi.');
      }
    }

    async function loadProductionIssue(): Promise<void> {
      const values: Record<string, boolean> = await readProductionIssues();
      elements.productionIssueInput.checked = values[elements.monthInput.value] === true;
      if (lastSnapshot?.jira.month === elements.monthInput.value) {
        renderSnapshot(lastSnapshot, readSettingsFromForm());
      }
    }

    async function saveProductionIssue(): Promise<void> {
      try {
        const values: Record<string, boolean> = await readProductionIssues();
        values[elements.monthInput.value] = elements.productionIssueInput.checked;
        await writeStorage(PRODUCTION_STORAGE_KEY, values);
      } catch (error: unknown) {
        setStatus(error instanceof Error ? error.message : 'Lưu Production Issue lỗi.');
      }
    }

    function readSettingsFromForm(): JiraWorklogSettings {
      return {
        siteUrl: normalizeUrl(elements.siteUrlInput.value, DEFAULT_SITE_URL, true),
        attendanceUrl: normalizeUrl(elements.attendanceUrlInput.value, DEFAULT_ATTENDANCE_URL, false),
        month: normalizeMonth(elements.monthInput.value),
        concurrency: normalizeConcurrency(elements.concurrencyInput.value),
        role: normalizeRole(elements.roleInput.value),
      };
    }

    function renderSettings(settings: JiraWorklogSettings): void {
      elements.siteUrlInput.value = settings.siteUrl;
      elements.attendanceUrlInput.value = settings.attendanceUrl;
      elements.monthInput.value = settings.month;
      elements.concurrencyInput.value = String(settings.concurrency);
    }

    function renderSnapshot(snapshot: KpiSnapshot, settings: JiraWorklogSettings): void {
      const { jira, attendance } = snapshot;
      const expectedSeconds: number = attendance.attendanceDays * 8 * 60 * 60;
      const workingPercent: number = expectedSeconds > 0 ? (jira.totalSeconds / expectedSeconds) * 100 : 0;
      const deadlinePercent: number = jira.completedWithDueDate > 0 ? (jira.completedOnTime / jira.completedWithDueDate) * 100 : 100;
      const bugPercent: number = jira.totalSeconds > 0 ? (jira.bugFixSeconds / jira.totalSeconds) * 100 : 0;
      const hasProductionIssue: boolean = elements.productionIssueInput.checked;
      const metrics: MetricView[] = [
        {
          label: 'Working time',
          value: `${formatPercent(workingPercent)} · ${formatDuration(jira.totalSeconds)} / ${formatDuration(expectedSeconds)}`,
          target: `≥ ${WORKING_TIME_TARGET_PERCENT}% · ${formatAttendanceDays(attendance.attendanceDays)} công`,
          actual: workingPercent,
          targetValue: WORKING_TIME_TARGET_PERCENT,
          maximum: Math.max(100, workingPercent),
          pass: expectedSeconds > 0 && workingPercent >= WORKING_TIME_TARGET_PERCENT,
        },
        {
          label: 'On Deadline',
          value: jira.completedWithDueDate > 0 ? `${formatPercent(deadlinePercent)} · ${jira.completedOnTime}/${jira.completedWithDueDate} task` : 'N/A · 0 task có due date',
          target: `≥ ${ON_DEADLINE_TARGET_PERCENT}%`,
          actual: deadlinePercent,
          targetValue: ON_DEADLINE_TARGET_PERCENT,
          maximum: 100,
          pass: jira.completedWithDueDate === 0 || deadlinePercent >= ON_DEADLINE_TARGET_PERCENT,
        },
        {
          label: `Bug fix [BUG-${settings.role}]`,
          value: `${formatPercent(bugPercent)} · ${formatDuration(jira.bugFixSeconds)}`,
          target: `≤ ${BUG_FIX_MAX_PERCENT}% tổng Working time`,
          actual: bugPercent,
          targetValue: BUG_FIX_MAX_PERCENT,
          maximum: Math.max(100, bugPercent),
          pass: bugPercent <= BUG_FIX_MAX_PERCENT,
        },
        {
          label: 'Production Issue',
          value: hasProductionIssue ? 'Có issue' : 'Không có issue',
          target: '< 1 issue · manual',
          actual: hasProductionIssue ? 1 : 0,
          targetValue: 1,
          maximum: 2,
          pass: !hasProductionIssue,
        },
        {
          label: 'Đúng quy trình',
          value: `${jira.ncCount} NC`,
          target: '≤ 1 NC',
          actual: jira.ncCount,
          targetValue: 1,
          maximum: Math.max(2, jira.ncCount),
          pass: jira.ncCount <= 1,
        },
      ];
      const overallPass: boolean = metrics.every((metric: MetricView): boolean => metric.pass);
      elements.summaryElement.textContent = `${jira.displayName} · ${jira.month} · ${overallPass ? 'PASS' : 'FAIL'}`;

      let html = `<div class="kpi-overall ${overallPass ? 'is-pass' : 'is-fail'}"><span>${escapeHtml(jira.displayName)}</span><strong>${overallPass ? 'PASS' : 'FAIL'}</strong></div>`;
      html += `<p class="kpi-cutoff">Tính đến ${escapeHtml(jira.cutoffDate)} · ${escapeHtml(formatAttendanceDays(attendance.attendanceDays))} công thực tế</p>`;
      html += '<div class="kpi-list">';
      metrics.forEach((metric: MetricView): void => {
        html += renderMetric(metric);
      });
      html += '</div>';
      html += '<details class="kpi-details"><summary>Chi tiết worklog</summary><ul>';
      jira.tickets.forEach((ticket: JiraWorklogTicketResult): void => {
        const issueUrl: string = `${settings.siteUrl}/browse/${encodeURIComponent(ticket.key)}`;
        html += `<li><a href="${escapeAttribute(issueUrl)}" target="_blank" rel="noreferrer">${escapeHtml(ticket.key)}</a> - ${escapeHtml(ticket.summary)}: <strong>${escapeHtml(formatDuration(ticket.seconds))}</strong></li>`;
      });
      html += '</ul></details>';
      elements.preview.innerHTML = html;
    }
  }

  function renderMetric(metric: MetricView): string {
    const maximum: number = Math.max(metric.maximum, 1);
    const fillPercent: number = Math.min(100, Math.max(0, (metric.actual / maximum) * 100));
    const markerPercent: number = Math.min(99, Math.max(1, (metric.targetValue / maximum) * 100));
    return `<div class="kpi-metric ${metric.pass ? 'is-pass' : 'is-fail'}">
      <div class="kpi-metric-heading"><strong>${escapeHtml(metric.label)}</strong><span>${metric.pass ? 'PASS' : 'FAIL'}</span></div>
      <div class="kpi-metric-value">${escapeHtml(metric.value)}</div>
      <div class="kpi-track" title="Target: ${escapeAttribute(metric.target)}">
        <span class="kpi-fill" style="width:${fillPercent.toFixed(2)}%"></span>
        <span class="kpi-target" style="left:${markerPercent.toFixed(2)}%"></span>
      </div>
      <div class="kpi-target-label">Target: ${escapeHtml(metric.target)}</div>
    </div>`;
  }

  async function sendTabMessage<TRequest, TResponse>(tabId: number, scriptPath: string, message: TRequest): Promise<TResponse> {
    try {
      return await sendMessageToTab<TRequest, TResponse>(tabId, message);
    } catch (error: unknown) {
      if (!isMissingReceiverError(error)) {
        throw error;
      }
      await injectContentScript(tabId, scriptPath);
      return sendMessageToTab<TRequest, TResponse>(tabId, message);
    }
  }

  function sendMessageToTab<TRequest, TResponse>(tabId: number, message: TRequest): Promise<TResponse> {
    return new Promise((resolve, reject): void => {
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

  function injectContentScript(tabId: number, scriptPath: string): Promise<void> {
    return new Promise((resolve, reject): void => {
      chrome.scripting.executeScript({ target: { tabId }, files: [scriptPath] }, (): void => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve();
      });
    });
  }

  function isMissingReceiverError(error: unknown): boolean {
    return error instanceof Error && (
      error.message.includes('Receiving end does not exist') ||
      error.message.includes('message port closed') ||
      error.message.includes('Could not establish connection')
    );
  }

  async function readSettings(): Promise<JiraWorklogSettings> {
    const value: unknown = await readStorage(SETTINGS_STORAGE_KEY);
    return normalizeSettings(value);
  }

  function writeSettings(settings: JiraWorklogSettings): Promise<void> {
    return writeStorage(SETTINGS_STORAGE_KEY, settings);
  }

  async function readLastSnapshot(): Promise<KpiSnapshot | null> {
    const candidate: unknown = await readStorage(RESULT_STORAGE_KEY);
    if (!isRecord(candidate)) {
      return null;
    }
    const jira: JiraWorklogResult | null = normalizeJiraResult(candidate.jira);
    const attendance: AttendanceResult | null = normalizeAttendanceResult(candidate.attendance);
    return jira && attendance && jira.month === attendance.month ? { jira, attendance } : null;
  }

  function writeLastSnapshot(snapshot: KpiSnapshot): Promise<void> {
    return writeStorage(RESULT_STORAGE_KEY, snapshot);
  }

  async function readProductionIssues(): Promise<Record<string, boolean>> {
    const candidate: unknown = await readStorage(PRODUCTION_STORAGE_KEY);
    if (!isRecord(candidate)) {
      return {};
    }
    const result: Record<string, boolean> = {};
    Object.entries(candidate).forEach(([month, value]: [string, unknown]): void => {
      if (/^\d{4}-(0[1-9]|1[0-2])$/.test(month) && typeof value === 'boolean') {
        result[month] = value;
      }
    });
    return result;
  }

  function readStorage(key: string): Promise<unknown> {
    return new Promise((resolve): void => {
      chrome.storage.local.get(key, (items: Record<string, unknown>): void => {
        resolve(chrome.runtime.lastError ? undefined : items[key]);
      });
    });
  }

  function writeStorage(key: string, value: unknown): Promise<void> {
    return new Promise((resolve, reject): void => {
      chrome.storage.local.set({ [key]: value }, (): void => {
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
      attendanceUrl: DEFAULT_ATTENDANCE_URL,
      month: getCurrentMonth(),
      concurrency: 3,
      role: 'DEV',
    };
  }

  function normalizeSettings(candidate: unknown): JiraWorklogSettings {
    const defaults: JiraWorklogSettings = createDefaultSettings();
    if (!isRecord(candidate)) {
      return defaults;
    }
    return {
      siteUrl: normalizeUrl(candidate.siteUrl, defaults.siteUrl, true),
      attendanceUrl: normalizeUrl(candidate.attendanceUrl, defaults.attendanceUrl, false),
      month: normalizeMonth(candidate.month, defaults.month),
      concurrency: normalizeConcurrency(candidate.concurrency, defaults.concurrency),
      role: normalizeRole(candidate.role, defaults.role),
    };
  }

  function normalizeJiraResult(candidate: unknown): JiraWorklogResult | null {
    if (!isRecord(candidate)) {
      return null;
    }
    const accountId: string = normalizeString(candidate.accountId);
    const displayName: string = normalizeString(candidate.displayName);
    const month: string = normalizeMonth(candidate.month, '');
    const cutoffDate: string = normalizeString(candidate.cutoffDate);
    if (!accountId || !displayName || !month || !/^\d{4}-\d{2}-\d{2}$/.test(cutoffDate)) {
      return null;
    }
    return {
      accountId,
      displayName,
      month,
      cutoffDate,
      totalSeconds: normalizeSeconds(candidate.totalSeconds),
      bugFixSeconds: normalizeSeconds(candidate.bugFixSeconds),
      completedWithDueDate: normalizeCount(candidate.completedWithDueDate),
      completedOnTime: normalizeCount(candidate.completedOnTime),
      ncCount: normalizeCount(candidate.ncCount),
      tickets: Array.isArray(candidate.tickets) ? candidate.tickets.map(normalizeTicket).filter((item: JiraWorklogTicketResult | null): item is JiraWorklogTicketResult => item !== null) : [],
      days: Array.isArray(candidate.days) ? candidate.days.map(normalizeWorklogDay).filter((item: JiraWorklogDayResult | null): item is JiraWorklogDayResult => item !== null) : [],
      generatedAt: normalizeCount(candidate.generatedAt),
    };
  }

  function normalizeAttendanceResult(candidate: unknown): AttendanceResult | null {
    if (!isRecord(candidate)) {
      return null;
    }
    const month: string = normalizeMonth(candidate.month, '');
    const cutoffDate: string = normalizeString(candidate.cutoffDate);
    if (!month || !/^\d{4}-\d{2}-\d{2}$/.test(cutoffDate)) {
      return null;
    }
    const days: AttendanceDayResult[] = Array.isArray(candidate.days)
      ? candidate.days.map(normalizeAttendanceDay).filter((item: AttendanceDayResult | null): item is AttendanceDayResult => item !== null)
      : [];
    const attendanceDays: number = typeof candidate.attendanceDays === 'number' && Number.isFinite(candidate.attendanceDays) && candidate.attendanceDays >= 0
      ? candidate.attendanceDays
      : days.reduce((sum: number, day: AttendanceDayResult): number => sum + day.value, 0);
    return { month, cutoffDate, attendanceDays, days };
  }

  function normalizeTicket(candidate: unknown): JiraWorklogTicketResult | null {
    if (!isRecord(candidate)) {
      return null;
    }
    const key: string = normalizeString(candidate.key);
    const seconds: number = normalizeSeconds(candidate.seconds);
    return key && seconds > 0 ? { key, summary: normalizeString(candidate.summary), seconds } : null;
  }

  function normalizeWorklogDay(candidate: unknown): JiraWorklogDayResult | null {
    if (!isRecord(candidate)) {
      return null;
    }
    const date: string = normalizeString(candidate.date);
    const seconds: number = normalizeSeconds(candidate.seconds);
    return /^\d{4}-\d{2}-\d{2}$/.test(date) && seconds > 0 ? { date, seconds } : null;
  }

  function normalizeAttendanceDay(candidate: unknown): AttendanceDayResult | null {
    if (!isRecord(candidate)) {
      return null;
    }
    const date: string = normalizeString(candidate.date);
    const value: number = typeof candidate.value === 'number' ? candidate.value : Number.NaN;
    return /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(value) && value >= 0 && value <= 1 ? { date, value } : null;
  }

  function normalizeUrl(candidate: unknown, fallback: string, originOnly: boolean): string {
    const value: string = normalizeString(candidate) || fallback;
    try {
      const url = new URL(value);
      if (!['http:', 'https:'].includes(url.protocol)) {
        return fallback;
      }
      return originOnly ? url.origin : url.toString();
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

  function normalizeRole(candidate: unknown, fallback = 'DEV'): string {
    return normalizeString(candidate).replace(/^\[|\]$/g, '').toUpperCase() || fallback;
  }

  function normalizeSeconds(candidate: unknown): number {
    return typeof candidate === 'number' && Number.isFinite(candidate) && candidate > 0 ? Math.floor(candidate) : 0;
  }

  function normalizeCount(candidate: unknown): number {
    return typeof candidate === 'number' && Number.isFinite(candidate) && candidate > 0 ? Math.floor(candidate) : 0;
  }

  function normalizeString(candidate: unknown): string {
    return typeof candidate === 'string' ? candidate.trim() : '';
  }

  function getCurrentMonth(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  function getCutoffDate(month: string): string {
    const currentMonth: string = getCurrentMonth();
    if (month > currentMonth) {
      throw new Error('Không thể tính KPI cho tháng tương lai.');
    }
    if (month < currentMonth) {
      const [year, monthNumber]: number[] = month.split('-').map(Number);
      const lastDay: number = new Date(year, monthNumber, 0).getDate();
      return `${month}-${String(lastDay).padStart(2, '0')}`;
    }

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const cutoff: string = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
    if (!cutoff.startsWith(`${month}-`)) {
      throw new Error('Ngày đầu tháng chưa có dữ liệu hoàn chỉnh để tính KPI.');
    }
    return cutoff;
  }

  function buildAttendanceMonthUrl(configuredUrl: string, month: string): string {
    const url = new URL(configuredUrl);
    const [year, monthNumber]: string[] = month.split('-');
    url.pathname = '/user-board-attendance';
    url.search = new URLSearchParams({ month: String(Number(monthNumber)), year }).toString();
    url.hash = '';
    return url.toString();
  }

  function formatDuration(seconds: number): string {
    const totalMinutes: number = Math.round(seconds / 60);
    return `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`;
  }

  function formatPercent(value: number): string {
    const rounded: number = Math.round(value * 10) / 10;
    return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}%`;
  }

  function formatAttendanceDays(value: number): string {
    return Number.isInteger(value) ? String(value) : value.toFixed(1);
  }

  function escapeHtml(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function escapeAttribute(value: string): string {
    return escapeHtml(value);
  }

  function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }
}
