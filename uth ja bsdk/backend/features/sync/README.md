# Source synchronization

## Browser attendance adapter

`browserSources.js` is a standalone, package-free adapter for capturing NST and RUFP attendance from the signed-in local browser UI using an isolated Chrome persistent profile. It is wired into `connectors.js` via `browserAttendanceConnector.js` as the default attendance task for `newton` and `rishiverse`.

The CommonJS interface is:

```js
const { captureAttendance, openLogin } = require('./browserSources');
const setup = await openLogin({ source: 'newton' });
if (setup.status !== 'login_open') throw new Error(setup.error.message);
// The user signs in in the visible browser, then closes it with:
await setup.close();
const result = await captureAttendance({ source: 'newton' });
```

`source` is `newton` or `rishiverse`. Exact user source URLs:
- Newton: `https://my.newtonschool.co/course/viwuaeik1m82/details`
- Rishiverse: `https://rishiverse.rishihood.edu.in/dashboard` (the adapter automatically navigates to `/lms/attendance` to capture authenticated site responses)

Dedicated persistent Chromium profiles are stored at `backend/data/browser-sources/{newton,rishiverse}` with `0700` mode permissions. Interactive setup is provided by `node scripts/connect-attendance.cjs <newton|rishiverse>`.

### Authentication and Google Recovery:
- The adapter strictly connects via Google sign-in using only saved `@rishihood.edu.in` or `@nst.rishihood.edu.in` accounts.
- If interactive authentication is required (password prompt, MFA, CAPTCHA, or ambiguous accounts), the adapter halts and signals `AUTH_REQUIRED`, surfacing as `setup_required` in the UI. It never automates password submission or credential guessing.
- Setup and auth failures surface as `setup_required` (prompting local connection on the laptop), while site parsing errors, unreadable responses, or network timeouts surface as `failed`. Empty attendance data is rejected with an error; empty success is never recorded.

`connectors.js` coordinates Newton attendance, RUFP attendance, local Apple Mail, and Opportunity Radar. The single `/api/sync` endpoint starts it after an explicit top-bar action; `/api/sync/status` exposes only the local progress snapshot needed by the UI.

Each source reports its own success, setup requirement, partial result, or failure so one broken integration does not erase other results. Keep credentials local and diagnostics bounded. Run `tests/unit/sync-integration.cjs` and `tests/browser/update-control.cjs` after changes.

Newton requires `NEWTON_COURSE_HASH` plus `NEWTON_AUTH_TOKEN`; RUFP requires an HTTPS `RISHIVERSE_ATTENDANCE_URL` plus `RISHIVERSE_AUTH_TOKEN`. Tokens may instead be stored in macOS Keychain services `uth-ja-newton` and `uth-ja-rishiverse`. The app cannot log in without these account-specific values. Never put them in source files or browser code. HTTP 401/403 is reported as expired login, and an unknown API response is reported as a failure rather than an empty successful update.

Successful NST/RUFP attendance is retained in the private sync snapshot and projected into `/api/academic`, including summary percentages and course cards. A failed later refresh keeps the last successful attendance. The timetable still comes from the saved NST schedule and the Section D RUFP routine, since the attendance APIs do not supply class times. Copilot CLI runs locally only for bounded Apple Mail snippets and public Radar event summaries; account tokens and raw attendance do not enter Copilot prompts. A CLI failure leaves fetched mail available as a partial result. The current CLI invocation was checked against `copilot --help` and a harmless JSON prompt.

## Rishihood Mail to urgent phone pipeline

- **Account-scoped inbox selection:** Apple Mail automation explicitly scans account email addresses and usernames for an exact `@rishihood.edu.in` (or `@nst.rishihood.edu.in`) suffix. It never accesses unified `inbox` across accounts or personal mailboxes.
- **Honest status reporting:** If no Rishihood account exists in Apple Mail, sync reports `setup_required` (`Rishihood Mail setup needed: configure an @rishihood.edu.in account in Apple Mail.`). If macOS Automation access is blocked, it reports `failed`.
- **Conservative AI structured classification:** Bounded email snippets (up to 8 messages, max 180 chars per snippet) are classified locally via Copilot CLI. The AI assigns structured priority (`urgent`, `high`, `normal`, `low`), `category`, `summary` (max 220 chars), and `actionItem` (max 180 chars).
- **Strict nonurgent rejection:** Only messages with verified `urgent` or `high` priority pass to the urgent phone pipeline. Normal, low, unverified, or failed AI classifications are rejected and never published to Android.
- **Privacy & payload safeguards:** Raw message bodies, auth headers, and private email addresses are never logged or persisted in cloud snapshots.
- **Mobile publisher & academic snapshot:** Approved urgent rows are stored in `academicSources.gmail` with a source freshness timestamp. `/api/academic` serves these live rows, and the mobile publisher forwards them to Convex/Android. `MOBILE_ACADEMIC_MAIL_SENDERS` defaults to `@rishihood.edu.in` and `@nst.rishihood.edu.in` when unset; legacy `emails.json` is never published as current.

## Scheduled sync orchestration

`scheduler.js` provides package-free, background scheduled execution while the laptop server is running. It shares the identical full sync pipeline and Convex mobile publish used by manual `POST /api/sync`, guaranteeing manual and scheduled execution paths never diverge.

### Configuration

Scheduled sync is **disabled by default** and enabled strictly via local environment variables:

| Variable | Description | Default | Example |
|---|---|---|---|
| `SYNC_SCHEDULE_ENABLED` | Enables scheduled local sync (`true`, `1`, `yes`) | Disabled (`false`) | `SYNC_SCHEDULE_ENABLED=true` |
| `SYNC_SCHEDULE_INTERVAL` | Interval duration (`m`, `h`, `s`, `ms`, or raw minutes) | `30m` | `SYNC_SCHEDULE_INTERVAL=30m` |
| `SYNC_SCHEDULE_CRON` | Standard 5-field cron expression (`min hour dom month dow`) | Unset | `SYNC_SCHEDULE_CRON="*/30 * * * *"` |

If `SYNC_SCHEDULE_CRON` is set and valid, it takes precedence. Otherwise, `SYNC_SCHEDULE_INTERVAL` governs the schedule.

### Non-overlap and Execution Guarantees

- **Strict Non-overlap:** If an update is in progress (whether manual or scheduled), any scheduled tick that fires is skipped and recorded (`lastSkippedAt`). Ticks are never queued or run concurrently.
- **Manual Trigger Preservation:** Manual `POST /api/sync` triggers the shared pipeline and responds 202 (`Sync all started`) when idle, or 409 (`Sync all is already running`) when busy.
- **Safe Status Endpoints:**
  - `GET /api/sync/status` includes a `schedule` object.
  - `GET /api/sync/schedule` returns safe status: `{ enabled, running, mode, intervalMs, cron, lastRunAt, nextRunAt, lastOutcome, lastSkippedAt }`.
  - Outcomes accurately report source statuses (`setup_required`, `failed`, `partial`, `success`). Sources without access or credentials are never reported as successful. No credentials, tokens, or private data are ever exposed.
- **Environment Boundary:** The scheduler runs strictly in the local laptop Node.js process (`backend/server.js`); it never executes on the mobile app or in Convex cloud functions.
