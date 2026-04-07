# FerbTools Architecture

FerbTools is organized as a Chrome Manifest V3 toolkit. The check-in/check-out reminder is the first feature, but the repository layout is intended to support additional tools.

## Folder Layout

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
```

## Responsibilities

- `src/app/background.ts`: top-level extension orchestration, Chrome event listeners, storage normalization, alarms, badge state, and message routing.
- `src/features/check-in/content.ts`: UI injected into browser tabs for check-in/check-out reminders.
- `src/features/check-in/popup.ts`: controller for the extension action setup popup.
- `src/shared/types.d.ts`: shared message, settings, and storage contracts.
- `static/pages/popup.html`: action popup markup and styles.
- `static/manifest.json`: Chrome MV3 manifest, permissions, action popup, icons, and service worker path.
- `docs/index.html`: GitHub Pages landing page.
- `docs/features/check-in-data-contract.md`: check-in feature storage and runtime message contract.

## Storage Shape

All runtime state should be namespaced under the root key:

```text
ferbToolsState
```

Feature state should be grouped under `features`:

```json
{
  "version": 1,
  "features": {
    "checkIn": {}
  }
}
```

When adding a new tool, add a new feature namespace instead of writing unrelated top-level keys. For example, a future notes tool should use `features.notes`, not `notesState`.

## Adding A Future Tool

1. Create a new folder under `src/features/<feature-name>`.
2. Add any shared contracts to `src/shared/types.d.ts`.
3. Add a feature namespace under `FerbToolsStorageState.features`.
4. Update `normalizeState` in `src/app/background.ts` to preserve and normalize the new namespace.
5. Add runtime message guards and handlers in `src/app/background.ts`.
6. Put feature documentation under `docs/features/<feature-name>-data-contract.md`.
7. Update `docs/index.html` if the feature should be marketed on the landing page.
8. Update `README.md` and this architecture file if the repository layout changes.

## Build Output

TypeScript preserves the `src` folder structure under `dist` because `tsconfig.json` uses `rootDir: "src"` and `outDir: "dist"`.

Expected generated JavaScript paths:

- `dist/app/background.js`
- `dist/features/check-in/content.js`
- `dist/features/check-in/popup.js`

Static assets are copied from `static` into `dist`, so expected static output includes:

- `dist/manifest.json`
- `dist/pages/popup.html`
- `dist/icons/*`
