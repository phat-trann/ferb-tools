namespace FerbToolsPopup {
  const APP_VERSION = '1.5.1';

  document.addEventListener('DOMContentLoaded', (): void => {
    const versionElement: HTMLSpanElement = getElementById('version', HTMLSpanElement);
    const statusElement: HTMLParagraphElement = getElementById('status', HTMLParagraphElement);
    const setStatus = (status: string): void => {
      statusElement.textContent = status;
      statusElement.hidden = status === '';
    };

    versionElement.textContent = `v${APP_VERSION}`;
    setStatus('');

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
      },
    });
  });

  function getElementById<TElement extends HTMLElement>(id: string, constructor: { new (): TElement }): TElement {
    const element: HTMLElement | null = document.getElementById(id);

    if (!(element instanceof constructor)) {
      throw new Error(`Missing element: ${id}`);
    }

    return element;
  }
}
