namespace FerbToolsJiraReportContentFeature {
  const WINDOW_FLAG = '__ferbToolsJiraReportBootstrappedV2__';

  interface JiraIssueRow {
    key: string;
    keyUrl: string;
    parent: string;
    summary: string;
    status: string;
    estimation: string;
    startDate: Date | null;
    dueDate: Date | null;
  }

  interface JiraReportConfig {
    workPlanOwner: string;
    resultOwner: string;
    myTasksTitle: string;
    todayDoneTitle: string;
  }

  const CONFIG: JiraReportConfig = {
    workPlanOwner: 'Ferb DEV',
    resultOwner: 'Ferb DEV',
    myTasksTitle: 'My tasks',
    todayDoneTitle: 'Today Done',
  };

  if (!(window as unknown as Record<string, unknown>)[WINDOW_FLAG]) {
    (window as unknown as Record<string, unknown>)[WINDOW_FLAG] = true;

    chrome.runtime.onMessage.addListener((message: unknown, _sender: chrome.runtime.MessageSender, sendResponse: (response: JiraReportResponse) => void): undefined => {
      if (!isGenerateMessage(message)) {
        return undefined;
      }

      try {
        sendResponse({
          success: true,
          report: generateReportsHTML(),
        });
      } catch (error: unknown) {
        sendResponse({
          success: false,
          error: error instanceof Error ? error.message : 'Generate Jira report lỗi.',
        });
      }

      return undefined;
    });
  }

  function generateReportsHTML(): JiraReportResult {
    const map: Record<string, HTMLTableElement> = buildIssueTableMapByTitle();
    const myTasksTable: HTMLTableElement | null = map[normalizeText(CONFIG.myTasksTitle).toLowerCase()] ?? null;
    const todayDoneTable: HTMLTableElement | null = map[normalizeText(CONFIG.todayDoneTitle).toLowerCase()] ?? null;

    const myTaskRows: JiraIssueRow[] = extractRowsFromTable(myTasksTable);
    const todayDoneRows: JiraIssueRow[] = extractRowsFromTable(todayDoneTable);

    const today: Date = startOfDay(new Date());
    const tomorrow: Date = addDays(today, 1);
    const weekStart: Date = startOfWeekMonday(today);
    const nextWeekStart: Date = addDays(weekStart, 7);

    const delayed: JiraIssueRow[] = [];
    const needToday: JiraIssueRow[] = [];
    const thisWeekInProgress: JiraIssueRow[] = [];
    let openCount = 0;

    myTaskRows.forEach((row: JiraIssueRow): void => {
      const isDone: boolean = isDoneStatus(row.status);
      if (!isDone) {
        openCount += 1;
      }

      const due: Date | null = row.dueDate;
      if (!due) {
        return;
      }

      const dueTime: number = due.getTime();

      if (!isDone && dueTime < today.getTime()) {
        delayed.push(row);
      }

      if (!isDone && dueTime >= today.getTime() && dueTime < tomorrow.getTime()) {
        needToday.push(row);
      }

      if (!isDone && dueTime >= weekStart.getTime() && dueTime < nextWeekStart.getTime() && dueTime >= today.getTime()) {
        thisWeekInProgress.push(row);
      }
    });

    const todayText: string = formatDateDDMMYYYY(today);
    const warnings: string[] = [];

    if (!myTasksTable) {
      warnings.push('Không tìm thấy bảng My tasks.');
    }

    if (!todayDoneTable) {
      warnings.push('Không tìm thấy bảng Today Done.');
    }

    return {
      workHtml: buildWorkPlanHtml(todayText, delayed, thisWeekInProgress, needToday),
      resultHtml: buildResultHtml(todayText, todayDoneRows, myTasksTable ? openCount : null),
      warnings,
    };
  }

  function buildIssueTableMapByTitle(): Record<string, HTMLTableElement> {
    const map: Record<string, HTMLTableElement> = {};
    const tables: NodeListOf<HTMLTableElement> = document.querySelectorAll('table.issue-table');

    tables.forEach((table: HTMLTableElement): void => {
      const region: Element | null = table.closest('div[role="region"][id^="gadget-content-"]');
      const labelId: string | null = region?.getAttribute('aria-labelledby') ?? null;

      if (!labelId) {
        return;
      }

      const titleElement: HTMLElement | null = document.querySelector(`div#${CSS.escape(labelId)} div[role="presentation"]`);
      const titleText: string = normalizeText(titleElement?.innerText).toLowerCase();

      if (titleText) {
        map[titleText] = table;
      }
    });

    return map;
  }

  function extractRowsFromTable(table: HTMLTableElement | null): JiraIssueRow[] {
    if (!table) {
      return [];
    }

    return Array.from(table.querySelectorAll('tbody tr.issuerow')).map((row: Element): JiraIssueRow => {
      const keyLink: HTMLAnchorElement | null = row.querySelector('td.issuekey a.issue-link');
      const parentCell: HTMLTableCellElement | null = row.querySelector('td.parent');
      const summaryLink: HTMLAnchorElement | null = row.querySelector('td.summary a.issue-link');
      const statusCell: HTMLTableCellElement | null = row.querySelector('td.status');
      const estimationCell: HTMLTableCellElement | null = row.querySelector('td.timeestimate');
      const startCell: HTMLTableCellElement | null = row.querySelector('td.customfield_10015');
      const dueCell: HTMLTableCellElement | null = row.querySelector('td.duedate');

      return {
        key: normalizeText(keyLink?.textContent),
        keyUrl: keyLink?.href ?? '',
        parent: normalizeText(parentCell?.textContent),
        summary: normalizeText(summaryLink?.textContent),
        status: normalizeText(statusCell?.textContent),
        estimation: normalizeEstimation(estimationCell?.textContent),
        startDate: parseJiraDate(startCell?.textContent),
        dueDate: parseJiraDate(dueCell?.textContent),
      };
    });
  }

  function buildWorkPlanHtml(todayText: string, delayed: JiraIssueRow[], thisWeekInProgress: JiraIssueRow[], needToday: JiraIssueRow[]): string {
    let workHtml: string = `${escapeHtml(CONFIG.workPlanOwner)} | Work Plan on ${todayText}`;
    workHtml += '<ul>';
    workHtml += buildTicketGroupHtml(`Delayed: ${delayed.length} ticket${delayed.length > 1 ? 's' : ''}`, delayed, buildTicketLineForPlan);
    workHtml += buildTicketGroupHtml(`Tickets assigned có due date trong tuần và đang làm: ${thisWeekInProgress.length} ticket`, thisWeekInProgress, buildTicketLineForPlan);
    workHtml += buildTicketGroupHtml(`Tickets cần hoàn thành hôm nay: ${needToday.length} ticket`, needToday, buildTicketLineForPlan);
    workHtml += '</ul>';

    return workHtml;
  }

  function buildResultHtml(todayText: string, todayDoneRows: JiraIssueRow[], openCount: number | null): string {
    let resultHtml: string = `${escapeHtml(CONFIG.resultOwner)} | Result of work on ${todayText}`;
    resultHtml += '<ul>';
    resultHtml += `<li>Số tasks hoàn thành: ${todayDoneRows.length} ticket${todayDoneRows.length > 1 ? 's' : ''}`;

    if (todayDoneRows.length > 0) {
      resultHtml += '<ul>';
      todayDoneRows.forEach((row: JiraIssueRow): void => {
        resultHtml += `<li>${buildTicketLineForResult(row)}</li>`;
      });
      resultHtml += '</ul>';
    }

    resultHtml += '</li>';

    if (openCount !== null) {
      resultHtml += `<li>Số tickets hiện có: ${openCount} ticket${openCount > 1 ? 's' : ''}</li>`;
    }

    resultHtml += '</ul>';

    return resultHtml;
  }

  function buildTicketGroupHtml(title: string, rows: JiraIssueRow[], renderLine: (row: JiraIssueRow) => string): string {
    let html: string = `<li>${escapeHtml(title)}`;

    if (rows.length > 0) {
      html += '<ul>';
      rows.forEach((row: JiraIssueRow): void => {
        html += `<li>${renderLine(row)}</li>`;
      });
      html += '</ul>';
    }

    html += '</li>';
    return html;
  }

  function buildTicketLink(row: JiraIssueRow): string {
    if (row.keyUrl) {
      return `<a href="${escapeAttribute(row.keyUrl)}" style="text-decoration:none; color:#0052cc;">${escapeHtml(row.key)}</a>`;
    }

    return escapeHtml(row.key);
  }

  function buildTicketLineForPlan(row: JiraIssueRow): string {
    const parts: string[] = [];

    if (row.parent) {
      parts.push(row.parent);
    }

    if (row.summary) {
      parts.push(row.summary);
    }

    const taskText: string = parts.map(escapeHtml).join(' - ');
    const estimationHtml: string = row.estimation ? `${taskText ? ' - ' : ''}<strong>Est: ${escapeHtml(row.estimation)}</strong>` : '';

    return `${buildTicketLink(row)}: ${taskText}${estimationHtml}`;
  }

  function buildTicketLineForResult(row: JiraIssueRow): string {
    return `${buildTicketLink(row)}: ${escapeHtml(row.summary)}`;
  }

  function normalizeText(value: string | null | undefined): string {
    return (value ?? '').replace(/\s+/g, ' ').trim();
  }

  function normalizeEstimation(value: string | null | undefined): string {
    const estimation: string = normalizeText(value);
    return /^0 minutes$/i.test(estimation) ? '30 minutes' : estimation;
  }

  function parseJiraDate(value: string | null | undefined): Date | null {
    const trimmed: string = normalizeText(value);

    if (!trimmed) {
      return null;
    }

    const date: Date = new Date(trimmed);

    if (Number.isNaN(date.getTime())) {
      return null;
    }

    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function startOfDay(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function addDays(date: Date, days: number): Date {
    const nextDate: Date = new Date(date);
    nextDate.setDate(nextDate.getDate() + days);
    return nextDate;
  }

  function startOfWeekMonday(date: Date): Date {
    return addDays(startOfDay(date), -((date.getDay() + 6) % 7));
  }

  function formatDateDDMMYYYY(date: Date): string {
    const day: string = String(date.getDate()).padStart(2, '0');
    const month: string = String(date.getMonth() + 1).padStart(2, '0');
    return `${day}/${month}/${date.getFullYear()}`;
  }

  function isDoneStatus(statusText: string): boolean {
    return /done/i.test(statusText);
  }

  function escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escapeAttribute(value: string): string {
    return escapeHtml(value);
  }

  function isGenerateMessage(message: unknown): message is JiraReportGenerateMessage {
    return typeof message === 'object' && message !== null && (message as Record<string, unknown>).type === 'RUN_JIRA_REPORT_GENERATE_V2';
  }
}
