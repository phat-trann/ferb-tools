# FerbTools

FerbTools is a Chrome Manifest V3 toolkit made by Ferb. The extension popup is a small tool hub, so new tools can be added without turning the check-in reminder into the whole product.

Current tools:

- Check-in Reminder: stores today's check-in time, computes the checkout reminder, rounds the checkout time by the configured slot, and shows action badge status.
- Content Asset Export: sends a message to `src/features/content-asset/content-asset-export.ts` on the current Business Manager tab.
- Jira Report: generates Work Plan and Result HTML from the current Jira dashboard for Teams.

## Version

Current version: `1.10.2`

Versioning uses semantic versioning:

- Patch: bug fix or copy-only update.
- Minor: user-visible tool, UI, workflow, or behavior update.
- Major: breaking storage, package, or workflow change.

## Version Notes

### 1.10.2

- Fixes Jira Report message response handling and expands the report section when generating.

### 1.10.1

- Uses bullet formatting for Jira Result and keeps the last generated Jira report in the popup.

### 1.10.0

- Added Jira Report in the extension popup with Work Plan/Result preview and copy actions.

### 1.9.3

- Keeps the Check-in switch transition disabled until the initial checked state has been committed.

### 1.9.2

- Prevents the Check-in switch knob from animating when the popup first opens.

### 1.9.1

- Ensures exported library XML always has a newline after the opening `<library>` tag.

### 1.9.0

- Saves Content Asset List Export textbox, filename, and parallel settings.
- Added filename input for list exports and blank lines between exported content nodes.
- Improved list export progress ranges and popup card alignment.

### 1.8.7

- Removed false CSRF error detection from normal SFCC responses that include the warning string inside script source.

### 1.8.6

- Restored parallel Content Asset list searches with one cloned list page per worker.
- Extracts CSRF tokens from SFCC `CSRFInjector` scripts when the cloned form has no hidden token input.

### 1.8.5

- Splits Content Asset List Export IDs by whitespace, comma, or semicolon so pasted IDs do not merge into one search term.

### 1.8.4

- Runs Content Asset list searches sequentially so each response supplies the CSRF token for the next search.
- Keeps detail-page XML builds parallel after each detail link is found.

### 1.8.3

- Uses the actual `ContentListForm.action` URL when cloning the SFCC list page for batch searches.
- Falls back to the current DOM form only if the cloned page does not include `ContentListForm`.

### 1.8.2

- Validates Content Asset List Export against the real `ContentListForm` before running.
- Fetches a fresh list page per batch item so each search uses a fresh CSRF token.

### 1.8.1

- Auto-injects Content Asset scripts into the active SFCC tab before retrying export messages.
- Uses separate refresh messages for detail-page and list-page exports.

### 1.8.0

- Added Content Asset List Export for newline-separated content asset IDs from a Business Manager content list page.
- Added parallel export control and shared XML library wrapper for list exports.

### 1.7.0

- Refined popup layout with fixed sizing, stable scrolling, and compact one-line status messages.
- Standardized popup copy and Content Asset Export error text.

### 1.6.0

- Updated Check-in popup rules to skip weekends and skip startup prompts after the configured latest check-in time.
- Prioritized the current day so stale prompts or checkout reminders from previous days no longer show after reopening the machine.

### 1.5.1

- Removed startup setup loading text from the global popup status.
- Added a runtime message timeout so Check-in setup cannot stay busy forever when background does not respond.

### 1.5.0

- Moved popup orchestration into global `src/app/popup.ts`.
- Split popup feature helpers into each feature folder.
- Moved popup status to the top of the panel.

### 1.4.2

- Kept tool setup panels collapsed by default and removed extra popup helper text.
- Moved Content Asset Export progress detail to console logging while keeping percent progress in the Run button.

### 1.4.1

- Added `npm run watch` for automatic TypeScript and static file rebuilds during extension development.

### 1.4.0

- Moved Check-in Reminder setup into an expandable tool card.
- Added expandable Content Asset Export setup for locales and site mapping.
- Content Asset Export now reads saved setup from `chrome.storage.local`.

### 1.3.0

- Added percentage progress feedback for Content Asset Export runs.

### 1.2.1

- Typed and reorganized Content Asset Export internals without changing export behavior.
- Split site IDs and allowed locales into `src/features/content-asset/config.ts`.
- Added reusable helper functions to prepare for future list-based content ID export.

### 1.2.0

- Converted Content Asset Export to TypeScript and a manifest-loaded content script.
- Moved Content Asset Export site and locale settings into `src/features/content-asset/config.ts`.
- Popup now sends a tab message to run the exporter instead of injecting the exporter file.

### 1.1.1

- Moved the Content Asset Export source into `src/features/content-asset/content-asset-export.js`.
- Kept the exporter script logic unchanged while aligning the file name and runtime path with the tool structure.

### 1.1.0

- Added a multi-tool popup hub with Check-in Reminder and Content Asset Export.
- Added popup version display and this README version note section.
- Added extension injection flow for Content Asset Export.
- Updated checkout rounding so seconds inside a rounded minute do not push to the next slot.
- Updated the extension badge countdown to include minutes.
- Removed extra markdown docs; README is now the single markdown reference.

### 1.0.0

- Initial FerbTools Chrome extension.
- Added Check-in Reminder with daily check-in prompt, checkout reminder, settings popup, storage, alarms, and badge states.

## Requirements

- `nvm`
- Node.js `>=25.9.0`
- Chrome or another Chromium-based browser that supports Manifest V3

## Quick Start

```bash
source ~/.nvm/nvm.sh
nvm use node
npm install
npm run typecheck
npm run build
```

The unpacked extension is generated in `dist`.

## Watch Build

```bash
npm run watch
```

The watch command builds once, then keeps TypeScript output and static extension files in `dist` updated while you edit.

## Production Build

```bash
source ~/.nvm/nvm.sh
nvm use node
npm ci
npm run build:production
```

`npm run build:production` typechecks, cleans old output, builds TypeScript, and copies static extension files.

## Production Package

```bash
source ~/.nvm/nvm.sh
nvm use node
npm ci
npm run pack:production
```

This creates `ferbtools-production.zip`.

## Project Structure

```text
src/
  app/background.ts
  app/popup.ts
  features/content-asset/config.ts
  features/content-asset/content-asset-export.ts
  features/content-asset/popup.ts
  features/check-in/content.ts
  features/check-in/popup.ts
  shared/types.d.ts
static/
  icons/
  pages/popup.html
  manifest.json
docs/
  index.html
  assets/
dist/
  generated build output
```

## Release Checklist

1. Update versions in `package.json`, `package-lock.json`, `static/manifest.json`, and this README.
2. Add a short note under `Version Notes`.
3. Run `npm ci`.
4. Run `npm run build:production`.
5. Load `dist` in Chrome and smoke test the popup tools.
6. Run `npm run pack:production`.
