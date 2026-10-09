namespace FerbToolsPopup {
  const APP_VERSION: string = chrome.runtime.getManifest().version;

  document.addEventListener('DOMContentLoaded', (): void => {
    const versionElement: HTMLSpanElement = getElementById('version', HTMLSpanElement);
    const statusElement: HTMLParagraphElement = getElementById('status', HTMLParagraphElement);
    const setStatus = (status: string): void => {
      const normalizedStatus: string = status.replace(/\s+/g, ' ').trim();
      statusElement.textContent = normalizedStatus;
      statusElement.title = normalizedStatus;
      statusElement.hidden = normalizedStatus === '';
    };

    versionElement.textContent = `v${APP_VERSION}`;
    setStatus('');

    initSettingsDrawer({
      backdrop: getElementById('settings-backdrop', HTMLDivElement),
      openButton: getElementById('settings-open-button', HTMLButtonElement),
      closeButton: getElementById('settings-close-button', HTMLButtonElement),
    });

    FerbToolsCheckInPopupFeature.init({
      setStatus,
      elements: {
        form: getElementById('settings-form', HTMLFormElement),
        enabledInput: getElementById('enabled', HTMLInputElement),
        latestCheckInTimeInput: getElementById('latest-checkin-time', HTMLInputElement),
        workDurationHoursInput: getElementById('work-duration-hours', HTMLInputElement),
        roundingSlotMinutesInput: getElementById('rounding-slot-minutes', HTMLSelectElement),
        todayCheckInTimeInput: getElementById('today-checkin-time', HTMLInputElement),
        todayCheckInNoteElement: getElementById('today-checkin-note', HTMLParagraphElement),
        saveButton: getElementById('save-button', HTMLButtonElement),
        clearTodayButton: getElementById('clear-today-button', HTMLButtonElement),
      },
    });

    FerbToolsContentAssetPopupFeature.init({
      setStatus,
      elements: {
        runButton: getElementById('content-asset-button', HTMLButtonElement),
        localesInput: getElementById('content-asset-locales', HTMLTextAreaElement),
        siteMapInput: getElementById('content-asset-site-map', HTMLTextAreaElement),
        saveButton: getElementById('content-asset-save-button', HTMLButtonElement),
        resetButton: getElementById('content-asset-reset-button', HTMLButtonElement),
        listIdsInput: getElementById('content-asset-list-ids', HTMLTextAreaElement),
        listFilenameInput: getElementById('content-asset-list-filename', HTMLInputElement),
        listConcurrencyInput: getElementById('content-asset-list-concurrency', HTMLInputElement),
        listRunButton: getElementById('content-asset-list-button', HTMLButtonElement),
      },
    });

    FerbToolsJiraWorklogPopupFeature.init({
      setStatus,
      elements: {
        section: getElementById('jira-worklog-section', HTMLDetailsElement),
        siteUrlInput: getElementById('jira-worklog-site-url', HTMLInputElement),
        attendanceUrlInput: getElementById('jira-worklog-attendance-url', HTMLInputElement),
        monthInput: getElementById('jira-worklog-month', HTMLInputElement),
        concurrencyInput: getElementById('jira-worklog-concurrency', HTMLInputElement),
        roleInput: getElementById('jira-report-role', HTMLInputElement),
        productionIssueInput: getElementById('jira-kpi-production-issue', HTMLInputElement),
        startButton: getElementById('jira-worklog-start-button', HTMLButtonElement),
        summaryElement: getElementById('jira-worklog-summary', HTMLParagraphElement),
        preview: getElementById('jira-worklog-preview', HTMLDivElement),
      },
    });

    FerbToolsJiraReportPopupFeature.init({
      setStatus,
      elements: {
        workSection: getElementById('jira-work-plan-section', HTMLDetailsElement),
        resultSection: getElementById('jira-result-section', HTMLDetailsElement),
        roleInput: getElementById('jira-report-role', HTMLInputElement),
        siteUrlInput: getElementById('jira-worklog-site-url', HTMLInputElement),
        myTasksJqlInput: getElementById('jira-report-my-tasks-jql', HTMLTextAreaElement),
        todayDoneJqlInput: getElementById('jira-report-today-done-jql', HTMLTextAreaElement),
        workGenerateButton: getElementById('jira-work-plan-generate-button', HTMLButtonElement),
        resultGenerateButton: getElementById('jira-result-generate-button', HTMLButtonElement),
        resultDateInput: getElementById('jira-result-date', HTMLInputElement),
        copyWorkButton: getElementById('jira-report-copy-work-button', HTMLButtonElement),
        copyResultButton: getElementById('jira-report-copy-result-button', HTMLButtonElement),
        workPreview: getElementById('jira-report-work-preview', HTMLDivElement),
        resultPreview: getElementById('jira-report-result-preview', HTMLDivElement),
      },
    });

    FerbToolsSfccToolkitUrlFixPopupFeature.init({
      enabledInput: getElementById('sfcc-toolkit-url-fix-enabled', HTMLInputElement),
      setStatus,
    });

    FerbToolsVisibilityPopupFeature.init({
      setStatus,
      elements: {
        checkInInput: getElementById('visible-check-in', HTMLInputElement),
        contentAssetInput: getElementById('visible-content-asset', HTMLInputElement),
        contentAssetListInput: getElementById('visible-content-asset-list', HTMLInputElement),
        monthlyKpiInput: getElementById('visible-monthly-kpi', HTMLInputElement),
        jiraWorkPlanInput: getElementById('visible-jira-work-plan', HTMLInputElement),
        jiraResultInput: getElementById('visible-jira-result', HTMLInputElement),
        checkInSettings: getElementById('check-in-settings-group', HTMLElement),
        contentAssetSettings: getElementById('content-asset-settings-group', HTMLElement),
        jiraSettings: getElementById('jira-settings-group', HTMLElement),
        monthlyKpiAttendanceSetting: getElementById('monthly-kpi-attendance-setting', HTMLElement),
        monthlyKpiParallelSetting: getElementById('monthly-kpi-parallel-setting', HTMLElement),
        jiraReportMyTasksSetting: getElementById('jira-report-my-tasks-setting', HTMLElement),
        jiraReportTodayDoneSetting: getElementById('jira-report-today-done-setting', HTMLElement),
        contentAssetCard: getElementById('content-asset-section', HTMLElement),
        contentAssetListCard: getElementById('content-asset-list-section', HTMLElement),
        monthlyKpiCard: getElementById('jira-worklog-section', HTMLElement),
        jiraWorkPlanCard: getElementById('jira-work-plan-section', HTMLElement),
        jiraResultCard: getElementById('jira-result-section', HTMLElement),
        emptyState: getElementById('tool-visibility-empty', HTMLParagraphElement),
        checkInEnabledInput: getElementById('enabled', HTMLInputElement),
      },
    });
  });

  interface SettingsDrawerElements {
    backdrop: HTMLDivElement;
    openButton: HTMLButtonElement;
    closeButton: HTMLButtonElement;
  }

  function initSettingsDrawer(elements: SettingsDrawerElements): void {
    const setOpen = (isOpen: boolean): void => {
      elements.backdrop.hidden = !isOpen;
      elements.openButton.setAttribute('aria-expanded', String(isOpen));

      if (isOpen) {
        elements.closeButton.focus();
      } else {
        elements.openButton.focus();
      }
    };

    elements.openButton.addEventListener('click', (): void => {
      setOpen(true);
    });

    elements.closeButton.addEventListener('click', (): void => {
      setOpen(false);
    });

    elements.backdrop.addEventListener('click', (event: MouseEvent): void => {
      if (event.target === elements.backdrop) {
        setOpen(false);
      }
    });

    document.addEventListener('keydown', (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !elements.backdrop.hidden) {
        setOpen(false);
      }
    });
  }

  function getElementById<TElement extends HTMLElement>(id: string, constructor: { new (): TElement }): TElement {
    const element: HTMLElement | null = document.getElementById(id);

    if (!(element instanceof constructor)) {
      throw new Error(`Missing element: ${id}`);
    }

    return element;
  }
}
