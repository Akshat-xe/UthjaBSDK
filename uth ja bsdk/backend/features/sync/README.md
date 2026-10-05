# Source synchronization

`connectors.js` coordinates Newton attendance, RUFP attendance, local Apple Mail, and Opportunity Radar. The single `/api/sync` endpoint starts it after an explicit top-bar action; `/api/sync/status` exposes only the local progress snapshot needed by the UI.

Each source reports its own success, setup requirement, partial result, or failure so one broken integration does not erase other results. Keep credentials local and diagnostics bounded. Run `tests/unit/sync-integration.cjs` and `tests/browser/update-control.cjs` after changes.

Newton requires `NEWTON_COURSE_HASH` plus `NEWTON_AUTH_TOKEN`; RUFP requires an HTTPS `RISHIVERSE_ATTENDANCE_URL` plus `RISHIVERSE_AUTH_TOKEN`. Tokens may instead be stored in macOS Keychain services `uth-ja-newton` and `uth-ja-rishiverse`. The app cannot log in without these account-specific values. Never put them in source files or browser code. HTTP 401/403 is reported as expired login, and an unknown API response is reported as a failure rather than an empty successful update.

Successful NST/RUFP attendance is retained in the private sync snapshot and projected into `/api/academic`, including summary percentages and course cards. A failed later refresh keeps the last successful attendance. The timetable still comes from the saved NST schedule and the Section D RUFP routine, since the attendance APIs do not supply class times. Copilot CLI runs locally only for bounded Apple Mail snippets and public Radar event summaries; account tokens and raw attendance do not enter Copilot prompts. A CLI failure leaves fetched mail available as a partial result. The current CLI invocation was checked against `copilot --help` and a harmless JSON prompt.
