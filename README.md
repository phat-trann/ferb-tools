# FerbTools

FerbTools is a Chrome Manifest V3 extension toolkit. The first tool in the toolkit is the check-in/check-out reminder that asks for a daily check-in, tracks the configured work duration, and reminds the user to check out when the rounded work window is complete.

Made by Ferb.

## Current Tool: Check-In Reminder

- Shows a daily check-in reminder on the first eligible active Chrome tab.
- Allows the check-in time to be corrected directly in the injected reminder.
- Stores runtime state in `chrome.storage.local`.
- Computes checkout due time from the configured work duration.
- Rounds checkout due time upward by the configured rounding slot.
- Shows a checkout reminder when the due time is reached.
- Shows extension action badge states: `OFF`, `IN?`, countdown, and `OUT`.
- Supports one-hour per-tab snooze when the user closes or postpones the check-in reminder.
- Provides an action setup popup to enable/disable the tool, update schedule settings, edit today's check-in time, and clear today's data.

## Extensible Direction

FerbTools is structured so future tools can be added without mixing all logic into the root files:

- App orchestration lives in `src/app`.
- Feature-specific extension code lives in `src/features/<feature-name>`.
- Shared TypeScript contracts live in `src/shared`.
- Static extension pages live in `static/pages`.
- Shared extension assets live in `static/icons`.
- GitHub Pages content lives in `docs`.
- Feature docs and data contracts live in `docs/features`.

For the current check-in tool, use `check-in` as the feature key in folder names and `features.checkIn` as the persisted state namespace.

## Requirements

- `nvm`
- Node.js `>=25.9.0`
- Chrome or another Chromium-based browser that supports Manifest V3

This workspace has been tested with Node.js `v25.9.0`.

## Quick Start

```bash
source ~/.nvm/nvm.sh
nvm use node
npm install
npm run typecheck
npm run build
```

The unpacked extension will be generated in `dist`.

## Production Build

Run the production build from the repository root:

```bash
source ~/.nvm/nvm.sh
nvm use node
npm ci
npm run build:production
```

`npm run build:production` does the following:

- Removes old build output from `dist`.
- Runs `npm run typecheck`.
- Runs `tsc`.
- Copies static extension assets from `static` into `dist`.

The production-ready unpacked extension is `dist`.

## Production Package

To create a zip file that can be attached to a GitHub release:

```bash
source ~/.nvm/nvm.sh
nvm use node
npm ci
npm run pack:production
```

This creates:

```text
ferbtools-production.zip
```

The zip contains the generated extension files from `dist`, including:

- `manifest.json`
- `app/background.js`
- `features/check-in/content.js`
- `features/check-in/popup.js`
- `pages/popup.html`
- `icons/*`

## GitHub Pages

This repository includes a static landing page at `docs/index.html`.

To publish it with GitHub Pages:

1. Open the repository settings on GitHub.
2. Go to `Pages`.
3. Set `Source` to `Deploy from a branch`.
4. Select the target branch.
5. Select the `/docs` folder.
6. Save the Pages configuration.

GitHub Pages will serve `docs/index.html` as the site entry point. The check-in data contract is available at `docs/features/check-in-data-contract.md`, and the extension architecture notes are available at `docs/architecture.md`.

## Load The Production Build In Chrome

1. Open `chrome://extensions`.
2. Enable `Developer mode`.
3. Select `Load unpacked`.
4. Choose the `dist` directory.
5. Pin `FerbTools` to the Chrome toolbar.
6. Click the extension icon to open the setup popup.

## Behavior

- The first eligible tab activation each local day triggers the check-in reminder modal.
- Before a new FerbTools modal opens, the content script removes any existing FerbTools modal in the current tab.
- The daily check-in modal includes an editable check-in time. If the user does not edit it, the extension stores the current click timestamp in `chrome.storage.local`; if the user edits it, the extension stores the manual local time.
- If the user clicks the secondary button, close button, or backdrop on the check-in modal, FerbTools snoozes that tab for one hour before showing the check-in prompt again.
- If Chrome or the computer opens late and the stored check-in time is wrong, the user can correct today's check-in time in the setup popup.
- When today's check-in time is corrected, FerbTools recomputes the checkout due time, alarm, and action badge.
- The setup popup can clear today's stored data, which resets today's check-in state and clears today's checkout alarm.
- If the user checks in later than the configured latest on-time check-in threshold, the injected modal shows the late warning copy defined by `LATE_CHECKIN_MESSAGE` in `src/app/background.ts`.
- After the configured work duration, the checkout time is rounded upward by the configured rounding slot. With the default 30-minute slot:
  - `09:00` stays `09:00`
  - `09:01` through `09:30` becomes `09:30`
  - `09:31` through `09:59` becomes `10:00`
- The extension shows the checkout reminder modal at the rounded due time.

## Data Storage

Runtime data is stored in Chrome local extension storage:

```text
chrome.storage.local
```

Root key:

```text
ferbToolsState
```

The check-in tool stores its feature state under:

```text
ferbToolsState.features.checkIn
```

The background service worker still reads the old `noticeCheckInState` key as a legacy migration fallback, then writes future normalized state updates to `ferbToolsState`.

See `docs/features/check-in-data-contract.md` for the full storage schema, derived state, and runtime message contracts.

## Project Structure

```text
src/
  app/
    background.ts
  features/
    check-in/
      content.ts
      popup.ts
  shared/
    types.d.ts
static/
  icons/
  pages/
    popup.html
  manifest.json
docs/
  assets/
  features/
    check-in-data-contract.md
  architecture.md
  index.html
dist/
  generated build output
```

## AI Agent Notes

- Start with `docs/architecture.md` for the FerbTools extension layout and expansion rules.
- Read `docs/features/check-in-data-contract.md` for persisted check-in state, derived state, and message contracts.
- Reminder scheduling, storage normalization, action badge state, and manual check-in correction are implemented in `src/app/background.ts`.
- The tab-injected reminder UI is implemented in `src/features/check-in/content.ts`.
- The extension action setup popup behavior is implemented in `src/features/check-in/popup.ts`.
- The extension action setup popup markup and styles are implemented in `static/pages/popup.html`.
- The GitHub Pages landing page is implemented in `docs/index.html`.
- Build output is generated into `dist`; do not edit `dist` directly unless intentionally patching built artifacts.

## Release Checklist

1. Run `npm ci`.
2. Run `npm run build:production`.
3. Load `dist` into Chrome and smoke test the setup popup.
4. Run `npm run pack:production`.
5. Attach `ferbtools-production.zip` to the GitHub release.
