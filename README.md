# FerbTools

FerbTools is a Chrome Manifest V3 toolkit made by Ferb. The extension popup is a small tool hub, so new tools can be added without turning the check-in reminder into the whole product.

Current tools:

- Check-in Reminder: stores today's check-in time, computes the checkout reminder, rounds the checkout time by the configured slot, and shows action badge status.
- Content Asset Export: sends a message to `src/features/content-asset/content-asset-export.ts` on the current Business Manager tab.

## Version

Current version: `1.5.1`

Versioning uses semantic versioning:

- Patch: bug fix or copy-only update.
- Minor: user-visible tool, UI, workflow, or behavior update.
- Major: breaking storage, package, or workflow change.

## Version Notes

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
