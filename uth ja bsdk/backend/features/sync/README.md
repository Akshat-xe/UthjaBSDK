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
- Newton: `https://my.newtonschool.co/course/viwuaeik1m82/details?tab=scorecard`
- Rishiverse: `https://rishiverse.rishihood.edu.in/dashboard` (the adapter automatically navigates to `/lms/attendance` to capture authenticated site responses)

Dedicated persistent Chromium profiles are stored at `backend/data/browser-sources/{newton,rishiverse}` with `0700` mode permissions. Interactive setup is provided by `node scripts/connect-attendance.cjs <newton|rishiverse>`.

Newton reads subject rows from the scorecard attendance table and validates attended and total class counts. The lecture-response capture path remains a fallback. Unit tests cover the parser; an authenticated live capture still requires the one-time browser sign-in and verification on the user's Mac.

### Authentication and Google Recovery:
- The adapter strictly connects via Google sign-in using only saved `@rishihood.edu.in` or `@nst.rishihood.edu.in` accounts.
- If interactive authentication is required (password prompt, MFA, CAPTCHA, or ambiguous accounts), the adapter halts and signals `AUTH_REQUIRED`, surfacing as `setup_required` in the UI. It never automates password submission or credential guessing.
- Setup and auth failures surface as `setup_required` (prompting local connection on the laptop), while site parsing errors, unreadable responses, or network timeouts surface as `failed`. Empty attendance data is rejected with an error; empty success is never recorded.

`connectors.js` coordinates Newton attendance, RUFP attendance, and Opportunity Radar. The current server pipeline marks Academic Mail Coming soon. `/api/sync` starts the shared pipeline after an explicit top-bar action; the configured schedule and authenticated phone-request worker can also start it. `/api/sync/status` exposes only the local progress snapshot needed by the UI.

Each source reports its own success, setup requirement, partial result, or failure so one broken integration does not erase other results. Keep credentials local and diagnostics bounded. Run `tests/unit/sync-integration.cjs` and `tests/browser/update-control.cjs` after changes.

The default attendance tasks use isolated signed-in browser profiles. The one-time interactive sign-ins yielded verified live captures on 19 October: 3 NST and 6 RUFP courses, published and imported on the Motorola. Never put account credentials in source files or browser code. HTTP 401/403 is reported as expired login, and an unknown response is reported as a failure rather than an empty successful update.

Successful NST/RUFP attendance is retained in the private sync snapshot and projected into `/api/academic`, including summary percentages and course cards. A failed later refresh keeps the last successful attendance. The timetable still comes from the saved NST schedule and the Section D RUFP routine, since the attendance sources do not supply class times. Account tokens and raw attendance do not enter Copilot prompts.

## Academic Mail status

Academic Mail is intentionally Coming soon in the current server and Android UI. The sync pipeline does not invoke the Apple Mail connector, and live mail-to-phone delivery is unverified. Earlier account-scoped Apple Mail, bounded AI classification, and sender allowlist safeguards remain in the code for a future release; they do not make the feature active today.

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

The installed `com.uthjabsdk.server` LaunchAgent keeps the local server available while the Mac is logged in and awake. With the local schedule set to `30m`, it provides a cron-like quick repeat of the same Update all pipeline. Its separate phone-request worker polls the queue about every 7 seconds. The agent and health endpoint were verified live on 6 October; relaunch after the next login and behavior across sleep still need observation.

### Non-overlap and Execution Guarantees

- **Strict Non-overlap:** If an update is in progress (whether manual or scheduled), any scheduled tick that fires is skipped and recorded (`lastSkippedAt`). Ticks are never queued or run concurrently.
- **Manual Trigger Preservation:** Manual `POST /api/sync` triggers the shared pipeline and responds 202 (`Sync all started`) when idle, or 409 (`Sync all is already running`) when busy.
- **Safe Status Endpoints:**
  - `GET /api/sync/status` includes a `schedule` object.
  - `GET /api/sync/schedule` returns safe status: `{ enabled, running, mode, intervalMs, cron, lastRunAt, nextRunAt, lastOutcome, lastSkippedAt }`.
  - Outcomes accurately report source statuses (`setup_required`, `failed`, `partial`, `success`). Sources without access or credentials are never reported as successful. No credentials, tokens, or private data are ever exposed.
- **Environment Boundary:** The scheduler runs strictly in the local laptop Node.js process (`backend/server.js`); it never executes on the mobile app or in Convex cloud functions.
