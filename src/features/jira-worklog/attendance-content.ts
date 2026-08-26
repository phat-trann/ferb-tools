namespace FerbToolsAttendanceContentFeature {
  const WINDOW_FLAG = '__ferbToolsAttendanceBootstrappedV1__';
  const TABLE_SELECTOR = '.attendance-table';
  const WAIT_TIMEOUT_MS = 30000;

  if (!(window as unknown as Record<string, unknown>)[WINDOW_FLAG]) {
    (window as unknown as Record<string, unknown>)[WINDOW_FLAG] = true;

    chrome.runtime.onMessage.addListener(
      (
        message: unknown,
        _sender: chrome.runtime.MessageSender,
        sendResponse: (response: AttendanceResponse) => void
      ): boolean | void => {
        if (!isStartMessage(message)) {
          return;
        }

        readAttendance(message)
          .then((result: AttendanceResult): void => sendResponse({ success: true, result }))
          .catch((error: unknown): void => {
            console.error('Failed to read 1Office attendance', error);
            sendResponse({
              success: false,
              error: error instanceof Error ? error.message : 'Lấy dữ liệu chấm công 1Office lỗi.',
            });
          });

        return true;
      }
    );
  }

  async function readAttendance(message: AttendanceStartMessage): Promise<AttendanceResult> {
    const configuredOrigin: string = normalizeOrigin(message.attendanceUrl);
    if (window.location.origin !== configuredOrigin) {
      throw new Error('Tab hiện tại không khớp 1Office URL đã cấu hình.');
    }
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(message.month) || !message.cutoffDate.startsWith(`${message.month}-`)) {
      throw new Error('Month hoặc ngày chốt chấm công không hợp lệ.');
    }

    const table: HTMLTableElement = await waitForAttendanceTable(message.month);
    const days: AttendanceDayResult[] = [];
    const seenDates: Set<string> = new Set<string>();

    table.querySelectorAll<HTMLTableCellElement>('.at-row td:not(.at-empty.out)').forEach((cell: HTMLTableCellElement): void => {
      const dayLabel: string = cell.querySelector<HTMLElement>('.at-day-label')?.textContent?.trim() ?? '';
      const pointText: string = cell.querySelector<HTMLElement>('.at-box-point > div')?.childNodes[0]?.textContent?.trim() ?? '';
      const dayMatch: RegExpMatchArray | null = dayLabel.match(/^(\d{1,2})(?:\/(\d{1,2}))?/);
      if (!dayMatch || !/^(?:0(?:\.5)?|1(?:\.0)?)$/.test(pointText)) {
        return;
      }

      const day: number = Number(dayMatch[1]);
      const explicitMonth: number | null = dayMatch[2] ? Number(dayMatch[2]) : null;
      const expectedMonth: number = Number(message.month.slice(5, 7));
      if (explicitMonth !== null && explicitMonth !== expectedMonth) {
        return;
      }

      const date: string = `${message.month}-${String(day).padStart(2, '0')}`;
      if (date > message.cutoffDate || seenDates.has(date)) {
        return;
      }

      const value: number = Number(pointText);
      if (!Number.isFinite(value) || value < 0 || value > 1) {
        return;
      }
      seenDates.add(date);
      days.push({ date, value });
    });

    if (days.length === 0) {
      throw new Error('Không đọc được ngày công trên 1Office. Kiểm tra đúng tháng và trạng thái đăng nhập.');
    }

    days.sort((left: AttendanceDayResult, right: AttendanceDayResult): number => left.date.localeCompare(right.date));
    return {
      month: message.month,
      cutoffDate: message.cutoffDate,
      attendanceDays: days.reduce((sum: number, day: AttendanceDayResult): number => sum + day.value, 0),
      days,
    };
  }

  function waitForAttendanceTable(month: string): Promise<HTMLTableElement> {
    const existing: HTMLTableElement | null = findAttendanceTable(month);
    if (existing) {
      return Promise.resolve(existing);
    }

    return new Promise<HTMLTableElement>((resolve, reject): void => {
      const observer = new MutationObserver((): void => {
        const table: HTMLTableElement | null = findAttendanceTable(month);
        if (table) {
          observer.disconnect();
          window.clearTimeout(timeoutId);
          resolve(table);
        }
      });
      const timeoutId: number = window.setTimeout((): void => {
        observer.disconnect();
        const [year, monthNumber]: string[] = month.split('-');
        reject(new Error(`Không thấy bảng chấm công 1Office tháng ${monthNumber}/${year}. Hãy kiểm tra đăng nhập rồi thử lại.`));
      }, WAIT_TIMEOUT_MS);
      observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    });
  }

  function findAttendanceTable(month: string): HTMLTableElement | null {
    const expectedMonth: number = Number(month.slice(5, 7));
    const tables: HTMLTableElement[] = Array.from(document.querySelectorAll<HTMLTableElement>(TABLE_SELECTOR));
    return tables.find((table: HTMLTableElement): boolean => {
      const labels: HTMLElement[] = Array.from(table.querySelectorAll<HTMLElement>('.at-row td:not(.at-empty.out) .at-day-label'));
      return labels.some((label: HTMLElement): boolean => {
        const match: RegExpMatchArray | null = (label.textContent?.trim() ?? '').match(/^01\/(\d{1,2})$/);
        return match !== null && Number(match[1]) === expectedMonth;
      });
    }) ?? null;
  }

  function normalizeOrigin(value: string): string {
    try {
      const url = new URL(value);
      if (!['http:', 'https:'].includes(url.protocol)) {
        throw new Error('Invalid protocol');
      }
      return url.origin;
    } catch (_error: unknown) {
      throw new Error('1Office attendance URL không hợp lệ.');
    }
  }

  function isStartMessage(message: unknown): message is AttendanceStartMessage {
    return (
      isRecord(message) &&
      message.type === 'RUN_ATTENDANCE_SYNC_V1' &&
      typeof message.attendanceUrl === 'string' &&
      typeof message.month === 'string' &&
      typeof message.cutoffDate === 'string'
    );
  }

  function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }
}
