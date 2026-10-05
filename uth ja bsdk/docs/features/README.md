# Feature ownership and roadmap

This map describes where to make changes and how the app is built. Keep private data in `backend/data/` and credentials in the local environment; feature source folders contain code and documentation only.

## Current feature map

| Folder                            | Owns                                                                      | Main flow                                                                           |
| --------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `src/ui/features/routine/`        | Date-aware class and routine schedule generation                          | `app.ts` imports schedule helpers to render routine and timetable views             |
| `src/ui/features/academic/`       | Imported timetable date labels and a future academic page migration       | Saved source dates receive current Past/Today/Upcoming badges                       |
| `src/ui/features/sync/`           | Shared Update all button, progress dialog, polling, and completion events | Button → `POST /api/sync` → poll `/api/sync/status` → refresh the visible dashboard |
| `backend/features/sync/`          | Newton, RUFP, Mail, and Radar sync coordination                           | Express route → bounded connector calls → persisted source results                  |
| `backend/features/local-records/` | Local seed data, snapshots, and record storage                            | Backend routes load/update private local records                                    |
| `backend/features/backup/`        | Per-device backup and scheduled daily reports                             | Browser backup request → validated private workspace files                          |
| `backend/features/menu/`          | RU Print source request, cache, parser, and menu shaping                  | Food view → `/api/mess-menu` → validated RU Print data                              |
| `backend/opportunity-radar/`      | Independent event harvest, storage, and explainable ranking               | Radar API → scraper/database/scoring modules                                        |
| `tests/unit/`                     | Data and backend behavior tests                                           | Run with `npm test`                                                                 |
| `tests/browser/`                  | End-to-end interaction and responsive tests                               | Run with `npm run test:browser`                                                     |

The UI is not fully split by page yet: `src/ui/app.ts` still owns academic, routine, food, reports, and navigation rendering. It was formatted and moved under `src/ui/`, while the new shared update and schedule logic now live in feature modules.

## Roadmap

1. Extract shared types for routes, local records, academic snapshots, and sync status. Remove `@ts-nocheck` from `src/ui/app.ts` as each type boundary is introduced.
2. Extract academic, routine, food, and reports page renderers into `src/ui/features/<feature>/` modules. Keep route state and navigation in a small app shell.
3. Introduce route-level browser tests for the extracted modules before removing old helpers. Keep one UI entry point and one CSS entry point.
4. Split `backend/server.js` route registration into thin feature routers only when module boundaries can be stated clearly; preserve one server and existing local-data locations.
5. Recheck generated file size, browser memory, responsive layouts, keyboard navigation, service-worker updates, and every API flow after each extraction.

## Change workflow

1. Read the README in the feature folder and its unit/browser tests.
2. Keep a change inside that feature unless the data contract or route boundary requires another folder.
3. Update feature notes and tests when ownership or API behavior changes.
4. Run `npm test`, then the relevant browser check with `TEST_BASE_URL` set to the running local server.
5. Build with `npm run build:ui`; generated output in `public/build/` is disposable and ignored.

## Dependency note

The root app production dependencies currently audit clean. The separate Radar package reports a moderate `stream-json` advisory through Crawlee. npm only offers a forced Crawlee downgrade that crosses a major boundary and does not remove the advisory, so the current Radar dependency was retained and its browser/unit checks stay in place. Reassess when Crawlee publishes a compatible fix or a reviewed override is available.
