# Check-In Data Contract

This file documents the runtime data model for the FerbTools check-in/check-out feature so another AI agent can understand and extend the feature without reverse-engineering the codebase first.

## Storage Location

- Chrome storage area: `chrome.storage.local`
- Root key: `ferbToolsState`
- Feature namespace: `ferbToolsState.features.checkIn`
- Legacy migration fallback: `noticeCheckInState`

The background service worker reads both `ferbToolsState` and the legacy `noticeCheckInState`. If only the legacy state exists, it normalizes that old shape into the new FerbTools feature state and writes future updates to `ferbToolsState`.

## Schema

```json
{
  "ferbToolsState": {
    "version": 1,
    "features": {
      "checkIn": {
        "settings": {
          "enabled": true,
          "latestCheckInTime": "10:00",
          "workDurationMinutes": 540,
          "roundingSlotMinutes": 30
        },
        "records": {
          "2026-04-06": {
            "dayKey": "2026-04-06",
            "promptShownAt": 1775437200000,
            "checkInAt": 1775437323456,
            "checkoutReminderDueAt": 1775469723456,
            "checkoutReminderShownAt": 1775469725000
          }
        }
      }
    }
  }
}
```

## Field Semantics

- `version`: root FerbTools storage schema version for future migrations.
- `features`: namespace for tool-specific state.
- `features.checkIn`: state for the check-in/check-out reminder tool.
- `features.checkIn.settings`: user setup edited from the extension action popup.
- `features.checkIn.settings.enabled`: disables all injected check-in reminders when `false`; action badge shows `OFF`.
- `features.checkIn.settings.latestCheckInTime`: local latest on-time check-in threshold in `HH:mm` format.
- `features.checkIn.settings.workDurationMinutes`: required work duration before checkout reminder.
- `features.checkIn.settings.roundingSlotMinutes`: checkout due time rounding slot.
- `features.checkIn.records`: map indexed by the local day key in `YYYY-MM-DD` format.
- `dayKey`: local calendar day derived from the machine system clock.
- `promptShownAt`: timestamp when the daily check-in prompt most recently rendered successfully. This is audit metadata and does not block future prompts by itself.
- `checkInAt`: timestamp recorded when the user confirms check-in, or the manually corrected local check-in time from the setup popup.
- `checkoutReminderDueAt`: due timestamp for the checkout reminder, calculated from `checkInAt + settings.workDurationMinutes` and then rounded up by `settings.roundingSlotMinutes`.
- `checkoutReminderShownAt`: timestamp when the checkout reminder rendered successfully.

## Message Flow

- `SHOW_DAILY_CHECKIN_PROMPT`: background -> content
- `COMPLETE_CHECKIN`: content -> background. Optional payload: `{ "checkInTime": "09:30" }`. When omitted, the background uses the current click timestamp.
- `SHOW_CHECKOUT_REMINDER`: background -> content
- `ACKNOWLEDGE_CHECKOUT_REMINDER`: content -> background
- `GET_SETTINGS`: setup popup -> background, returns persisted settings and today's derived status.
- `UPDATE_SETTINGS`: setup popup -> background, saves setup settings.
- `UPDATE_TODAY_CHECKIN`: setup popup -> background, overwrites today's `checkInAt`, recalculates `checkoutReminderDueAt`, resets the checkout reminder delivery marker when the due time changes, and refreshes the action badge/alarm.
- `CLEAR_TODAY_DATA`: setup popup -> background, deletes today's record, clears today's checkout alarm, and refreshes the action badge.
- `SNOOZE_DAILY_CHECKIN_PROMPT`: content -> background, snoozes the daily check-in prompt for the sender tab for one hour.

## Implementation Pointers

- `src/app/background.ts` owns `chrome.storage.local`, `chrome.storage.session`, `chrome.alarms`, badge state, tab activation handling, and runtime message handlers.
- `src/features/check-in/content.ts` owns the injected check-in and checkout reminder modals shown inside eligible tabs.
- `src/features/check-in/popup.ts` owns the extension action setup popup behavior.
- `static/pages/popup.html` owns the setup popup markup and styles.
- `src/shared/types.d.ts` owns shared message and storage contracts.
- `docs/architecture.md` explains the FerbTools folder layout for future tools.

## Setup Today Status

The setup popup receives a derived `today` object from `GET_SETTINGS`, `UPDATE_SETTINGS`, `UPDATE_TODAY_CHECKIN`, and `CLEAR_TODAY_DATA`. This object is not persisted separately.

```json
{
  "dayKey": "2026-04-07",
  "hasCheckIn": true,
  "checkInTime": "09:30",
  "checkoutReminderDueTime": "18:30"
}
```

## Derived Rules

- A check-in is considered late when the local system time is later than `features.checkIn.settings.latestCheckInTime`.
- Late warning copy is defined by `LATE_CHECKIN_MESSAGE` in `src/app/background.ts`.
- Checkout due time is rounded up by this rule when the slot is 30 minutes:
  - `09:00` stays `09:00`
  - `09:01` through `09:30` becomes `09:30`
  - `09:31` through `09:59` becomes `10:00`
- The action badge is derived, not persisted:
  - `OFF` with gray badge when `settings.enabled` is `false`.
  - `IN?` with red badge when there is no active check-in for the current day.
  - Countdown text such as `8h` or `42m` with amber badge while the configured work window is still running.
  - `OUT` with green badge when today's record has already completed the configured work duration.
- Check-in prompt snooze is tab-scoped session state stored under `ferbToolsCheckInPromptSnoozedTabs` in `chrome.storage.session`. It is intentionally not stored in `chrome.storage.local`.

## Daily Lifecycle

1. The user activates the first injectable Chrome tab of the day.
2. The background service worker injects the check-in content script and shows the daily check-in prompt.
3. If the current tab is snoozed because the user previously clicked the secondary button, close button, or backdrop on the check-in prompt, the background skips that tab until the one-hour snooze expires.
4. Before rendering a new FerbTools modal, the content script removes any existing FerbTools modal in the current tab.
5. The daily check-in prompt shows the current local time as an editable check-in time. If the user does not edit it, the background uses the actual click timestamp. If the user edits it, the content script sends the manual `HH:mm` value through `COMPLETE_CHECKIN`.
6. When the user confirms the check-in prompt, the background saves `checkInAt` and schedules a `chrome.alarms` reminder.
7. If the saved check-in time is still wrong, the user can open the extension action popup and edit today's check-in time. The background updates today's record and recomputes the checkout reminder.
8. After the configured work duration, the result is rounded up to the configured slot, then the background tries to show the checkout reminder on the currently active tab.
9. If the alarm fires while the active tab cannot receive the injected UI, the reminder stays pending until the next eligible tab activation.

## Assumptions

- Timezone behavior follows Chrome's system timezone.
- The daily check-in prompt can reappear after a per-tab snooze expires if today's check-in is still missing.
- The checkout reminder is considered delivered once the background can inject the UI and send the message to the content script.
