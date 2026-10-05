# Application architecture

## Runtime

`backend/server.js` starts one Express server for static files and local APIs. The browser app is built from `src/ui/app.ts` and the feature modules beneath `src/ui/features/`; `npm run build:ui` emits ES modules and CSS to `public/build/`. The checked-in `public/index.html` is the app shell. The service worker refreshes generated JS/CSS from the local server first and uses its cache offline; it never caches `/api/*` responses.

The UI is local-first: routines, notes, attendance actions, and settings remain in browser storage and synchronize to the private local backup only when available. Sync providers do not run on page load. **Update all** starts one backend orchestration pass and displays per-source progress in a single shared dialog. The Radar page keeps its narrower **Find events** action.

Radar's scraper engine is imported only when a harvest starts. Viewing saved opportunities loads the database and ranking logic without loading Crawlee's scraper stack. On this machine, the restarted server used about 57 MB RSS before a Radar visit and about 103 MB after loading Radar; the earlier eager import reached about 126 MB. These are process snapshots, not a fixed memory limit.

## Feature ownership

- Routine scheduling and packing helpers: `src/ui/features/routine/`.
- Imported timetable date labels: `src/ui/features/academic/`.
- Shared update modal and status polling: `src/ui/features/sync/`.
- Academic views and other page behavior: currently coordinated in `src/ui/app.ts`; extraction is staged in `docs/features/README.md`.
- Source connectors: `backend/features/sync/`.
- Local records and seed data: `backend/features/local-records/`.
- Device backup and nightly reports: `backend/features/backup/`.
- RU Print menu parser and fetcher: `backend/features/menu/`.
- Radar scraping and scoring package: `backend/opportunity-radar/`.

Each feature folder has a `README.md` that identifies its responsibilities and data flow. Do not put credentials or personal sync records in source folders.

## Build and verify

`npm start` runs the UI build before launching Express. `npm run build:ui` can be used alone for quick UI compilation. `npm test` covers schedule rules, backup isolation, Radar ranking, source failure handling, and menu validation. `npm run test:browser` uses installed Chrome and honors `TEST_BASE_URL` for the server under test.

The app-level UI module is being migrated from its previous JavaScript implementation. `app.ts` currently has a temporary `@ts-nocheck` marker for legacy browser globals and implicit data shapes; newly written TypeScript feature modules are checked by `tsc`. Remove that marker as route state and API models are extracted into typed modules.
