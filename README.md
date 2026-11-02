# FerbTools

FerbTools is a Chrome Manifest V3 toolkit made by Ferb. The extension popup is a small tool hub, so new tools can be added without turning the check-in reminder into the whole product.

Current tools:

- Check-in Reminder: stores today's check-in time, computes the checkout reminder, rounds the checkout time by the configured slot, and shows action badge status.
- Content Asset Export: sends a message to `src/features/content-asset/content-asset-export.ts` on the current Business Manager tab.
- Content Asset List Export: exports multiple SFCC content assets into one library XML file.
- Monthly KPI: combines the signed-in user's Jira REST API data with actual 1Office attendance through yesterday.
- Jira Work Plan: generates the current Work Plan independently through Jira REST API v3.
- Jira Result: generates Result independently for a selected date through Jira REST API v3.
- Fix SFCC Toolkit URL: rewrites Storefront Editing links to the correct STG or DEV Business Manager host.

## Version

Current version: `1.20.1`

Versioning uses semantic versioning:

- Patch: bug fix or copy-only update.
- Minor: user-visible tool, UI, workflow, or behavior update.
- Major: breaking storage, package, or workflow change.

Small related fixes are grouped into the current update batch instead of creating a version for every edit. Use `Unreleased` for work toward a future release, then consolidate its notes when that release is prepared. Historical patch notes below are grouped by minor version; the ranges retain their original version numbers.

The package, lockfile root package, extension manifest, popup fallback label, landing page, and production package must agree on the current version. Runtime version labels and feature logs read the extension manifest.

## Version Notes

### Unreleased

- Adds Light, Dark, and System appearance modes in Settings, saves the preference, and applies it before the popup renders.
- Adapts inputs, report links, KPI indicators, switches, scrollbars, and the Settings drawer to the selected appearance.
- Unifies popup actions, report links, success indicators, and the ready-to-checkout badge around the blue accent; failures remain red and unavailable data stays neutral.

### 1.20.0–1.20.1

- Adds a saved on/off setting for Fix SFCC Toolkit URL, handling existing links, DOM updates, and captured clicks with versioned FerbTools console messages.
- Hardens extension messaging, Jira report HTML rendering, Content Asset XML escaping, and extension-page CSP.
- Reduces unnecessary Content Asset, Jira API, storage, and badge refresh work while preserving first-content library detection for list exports.
- Shares Jira site URL and Role consistently across Monthly KPI, Work Plan, and Result, and preserves edited check-in time when a reminder is refreshed.
- Limits the SFCC Toolkit URL Fix content script to STG/DEV hostname labels and validates configured Jira origins before API access.
- Fixes On Deadline to compare Completed Date (`customfield_10091`) against Due date through the full cutoff day, with a separate cache to avoid reusing results calculated from Resolved.
- Shows N/A with an empty On Deadline bar when no tasks have both dates; other failed metrics still make the overall KPI FAIL.

### 1.19.0–1.19.1

- Adds a `Không làm tròn` (`0 phút`) option to Check-in Reminder so checkout can use the exact calculated time.
- Splits Jira Report into independent Jira Work Plan and Jira Result cards, with separate Run and Copy actions, busy states, and preview updates.
- Adds a Result date picker, defaults it to today, and applies the selected full-day range to Jira JQL automatically.
- Splits visibility controls for Jira Work Plan and Jira Result while migrating the previous Jira Report visibility setting.

### 1.18.0–1.18.3

- Adds saved visibility toggles for Check-in Reminder, Content Asset Export, Content Asset List Export, Monthly KPI, and Jira Report, hiding unused cards and function-specific settings.
- Disables the background Check-in Reminder when hidden; showing it again leaves its Enabled switch off until explicitly enabled.
- Waits for the requested month/year URL and matching attendance table before reading a reused 1Office tab.
- Expands popup status messages to multiple lines and places Monthly KPI above Jira Report after layout adjustments.
- Orders Content Asset page attributes by the SFCC schema so `<page-title>` is exported before `<page-description>` for both single and list exports.

### 1.17.0

- Replaces the Jira Worklog summary with a monthly KPI dashboard for Working time, On Deadline, Bug fix time, Production Issue, and NC process compliance.
- Calculates expected Working time from actual 1Office attendance through yesterday, treating `1` as one day, `0.5` as half a day, and `0` as off.
- Automatically opens or reuses the configured 1Office attendance page in a background tab and loads the selected month.
- Adds progress bars, target markers, per-metric PASS/FAIL states, and an overall FAIL whenever any required metric fails.
- Adds a monthly manual Production Issue checkbox where checked means FAIL, a configurable 1Office URL, and a fixed Bug fix target of at most 10% of total Working time.
- Uses the configured Role to match `[BUG-ROLE]` Jira summaries and counts completed assigned tasks with due dates for On Deadline.

### 1.16.0

- Reuses any open configured Jira tab or automatically opens one in the background for Jira Worklog and Jira Report.
- Waits for automatically opened Jira tabs to load before injecting the API worker, with clear timeout and login guidance.
- Validates the active SFCC page before export and gives separate Content Asset Detail and Search Content Asset instructions for single and batch exports.

### 1.15.0

- Moves Jira Report ticket loading entirely from dashboard HTML to Jira REST API v3.
- Adds configurable My tasks and Today Done JQL in the Settings drawer, with current-user defaults.
- Paginates `/rest/api/3/search/jql` results and maps parent, status category, due date, and remaining estimate from API fields.
- Allows Jira Report generation from any signed-in page on the configured Jira site instead of requiring a dashboard.

### 1.14.0

- Moves long-lived tool configuration into one Settings drawer opened from the header gear icon.
- Uses `/rest/api/3/myself` for the Jira Report name and keeps only the report role, such as `DEV`, configurable.
- Migrates the previous Jira Report Owner setting to the new Role setting.

### 1.13.0

- Adds Jira Worklog with configurable site URL, month, and parallel request count.
- Uses the active Jira session and `/rest/api/3/myself` so only the signed-in user's worklogs are loaded without storing an API token.
- Totals monthly worklogs by ticket and calendar day, and restores the latest result from local storage.
- Displays worklog durations as hours and minutes instead of decimal hours.
- Excludes macOS `.DS_Store` metadata from production ZIP packages.

### 1.12.0

- Adds a saved Owner setting shared by Jira Work Plan and Result generation.
- Synchronizes the landing page with the complete tool set and displays the current version.

### 1.11.0–1.11.1

- Includes the library ID in Content Asset List exports, using the first content asset to determine the library wrapper and the active list library as fallback.
- Appends each Jira task estimation to Work Plan in bold with an `Est:` prefix and treats `0 minutes` as `30 minutes`.
- Reads the popup version from the extension manifest to keep the displayed version synchronized.

### 1.10.0–1.10.4

- Adds Jira Report with Work Plan/Result previews and Copy actions.
- Uses bullet formatting for Result, restores the last generated report, fixes message response handling, and expands the report section when generating.
- Standardizes popup color, text, font-size, and button styling.
- Aligns popup scrollbars across tool lists, textareas, and report previews.

### 1.9.0–1.9.3

- Saves Content Asset List Export textbox, filename, and parallel settings.
- Adds a list export filename input, blank lines between content nodes, and a newline after the opening `<library>` tag.
- Improves list export progress ranges and popup card alignment.
- Prevents the Check-in switch from animating before its initial checked state has loaded.

### 1.8.0–1.8.7

- Adds Content Asset List Export from the Business Manager content list, with parallel workers and a shared library XML wrapper.
- Accepts IDs separated by whitespace, commas, or semicolons.
- Validates the real `ContentListForm`, uses its action URL, and handles CSRF tokens from hidden inputs or `CSRFInjector` scripts.
- Stabilizes search concurrency and list-page fallback, ending this series with parallel searches using a cloned page per worker.
- Auto-injects Content Asset scripts when needed and provides separate detail/list refresh guidance.
- Removes false CSRF error detection triggered by warning strings inside normal SFCC script source.

### 1.7.0

- Refined popup layout with fixed sizing, stable scrolling, and compact one-line status messages.
- Standardized popup copy and Content Asset Export error text.

### 1.6.0

- Updated Check-in popup rules to skip weekends and skip startup prompts after the configured latest check-in time.
- Prioritized the current day so stale prompts or checkout reminders from previous days no longer show after reopening the machine.

### 1.5.0–1.5.1

- Moves popup orchestration into `src/app/popup.ts`, with helpers in each feature folder and status at the top of the panel.
- Removes startup setup loading text and adds a Check-in runtime message timeout so setup cannot remain busy indefinitely.

### 1.4.0–1.4.2

- Adds expandable Check-in and Content Asset setup panels, collapsed by default, with saved locale/site mapping from `chrome.storage.local`.
- Moves detailed Content Asset progress to the console while keeping percentage progress in the Run button.
- Adds `npm run watch` for automatic TypeScript and static file rebuilds.

### 1.3.0

- Added percentage progress feedback for Content Asset Export runs.

### 1.2.0–1.2.1

- Converts Content Asset Export to TypeScript and a manifest-loaded content script invoked through tab messages.
- Extracts site IDs and locales into `src/features/content-asset/config.ts` and introduces reusable typed helpers for later batch export support.

### 1.1.0–1.1.1

- Adds a multi-tool popup with Check-in Reminder, Content Asset Export, version display, and export script injection.
- Organizes Content Asset Export under its feature folder and consolidates Markdown documentation into this README.
- Fixes checkout rounding so seconds inside a rounded minute do not push to the next slot, and includes minutes in the badge countdown.

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
  features/sfcc-toolkit-url-fix/content.ts
  features/sfcc-toolkit-url-fix/popup.ts
  shared/theme.ts
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

1. Group related changes into one release and select a version only when preparing that release.
2. Synchronize `package.json`, the root versions in `package-lock.json`, `static/manifest.json`, the fallback label in `static/pages/popup.html`, the current version in this README, and all version labels in `docs/index.html`.
3. Consolidate pending notes under `Version Notes`; preserve historical version ranges.
4. Run `nvm use` before npm commands, then `npm ci` and `npm run build:production`.
5. Load `dist` in Chrome and smoke test the popup tools.
6. Run `npm run pack:production` and verify its manifest version matches the source manifest.
