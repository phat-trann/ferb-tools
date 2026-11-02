# FerbTools

A Chrome extension for check-in reminders, SFCC content exports, and personal Jira reports. Made by Ferb.

Current version: `1.20.1` · [Download](https://github.com/phat-trann/ferb-tools/releases) · [Version history](CHANGELOG.md)

## Features

| Tool | What it does |
| --- | --- |
| Check-in Reminder | Save your check-in time and get a checkout reminder, with optional time rounding. |
| Content Asset Export | Export one SFCC content asset as XML from its detail page. |
| Content Asset List Export | Export multiple assets into one XML file from the content search page. |
| Monthly KPI | Review work time, deadlines, bug fixing, production issues, and NCs for a selected month. |
| Jira Work Plan | Generate an editable plan with overdue tasks, upcoming deadlines, and estimates. |
| Jira Result | Generate an editable work result report for a selected date. |
| Fix SFCC Toolkit URL | Automatically correct Storefront Editing links on STG and DEV sites. |

## Install

1. Download `ferbtools-production.zip` from [Releases](https://github.com/phat-trann/ferb-tools/releases) and unzip it.
2. Open `chrome://extensions` and enable **Developer mode**.
3. Select **Load unpacked** and choose the extracted folder.

## Use

Open FerbTools from the Chrome toolbar. Select the gear icon for Settings.

- Choose Light, Dark, or System appearance and hide tools you do not use.
- Set check-in hours and rounding, SFCC locales and site mapping, or Jira/1Office URLs, Role, and report queries.
- For SFCC exports, open the content detail page for one asset or the content search page for multiple assets.
- For Jira and KPI tools, sign in to Jira and 1Office as needed. FerbTools opens or reuses their tabs automatically.
- Select a month and press **Start** for KPI, or use **Run Plan** / **Run Result** and **Copy** for reports.

### Monthly KPI

The current month is selected by default. Calculations run through yesterday, using actual attendance from 1Office.

| Metric | Target |
| --- | --- |
| Working time | At least 95% of 8 hours per attendance day. |
| On Deadline | At least 95% of completed tasks with both Completed Date and Due date finished on time. |
| Bug fix time | At most 10% of total logged time on tasks prefixed `[BUG-ROLE]`. |
| Production Issue | None; check the manual box if an issue occurred. |
| Process compliance | At most 1 NC task. |

A failed metric makes the overall result **FAIL**. On Deadline shows **N/A** if no tasks have both dates; when all other metrics pass, the overall result is also N/A.

## Development

Requires `nvm` and Chrome. Run commands from the project folder:

```bash
source ~/.nvm/nvm.sh
nvm use
npm ci
npm run build
```

Load `dist` as an unpacked extension. After `nvm use`, these commands are available:

| Command | Purpose |
| --- | --- |
| `npm run watch` | Rebuild while editing. |
| `npm run typecheck` | Check TypeScript. |
| `node --test tests/*.test.cjs` | Run regression tests. |
| `npm run pack:production` | Typecheck, build, and create `ferbtools-production.zip`. |

Source code lives in `src`, extension assets in `static`, and the website in `docs`. Generated files go into `dist`.

## Releases

Group related changes into one release. Use a patch for fixes, a minor version for new features, and a major version for breaking changes.

1. Keep versions aligned in `package.json`, `package-lock.json`, `static/manifest.json`, `static/pages/popup.html`, this README, and `docs/index.html`.
2. Summarize the release in [CHANGELOG.md](CHANGELOG.md).
3. Run `nvm use`, tests, and `npm run pack:production`. Check the extension in Chrome and confirm the ZIP manifest has the same version.
