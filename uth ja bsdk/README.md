# Uth ja BSDK

Local-first routine, academic dashboard, attendance, campus menu, and opportunity radar. Academic Mail is intentionally Coming soon. Express serves the browser app and local APIs; sync can start from **Update all**, the configured 30-minute Mac schedule, or an authenticated Android **Sync now** request while the Mac server is awake.

## Run

```sh
npm install
npm start
```

Open [http://localhost:3000](http://localhost:3000). To use port 3001, run `PORT=3001 npm start`. `prestart` builds the TypeScript UI into the ignored `public/build/` directory. Put private connector credentials in `.env` or the configured macOS Keychain services. Never commit `.env`, `backend/data/`, or `backend/private/`.

## Project map

- `src/ui/` browser TypeScript and application styles. `app.ts` currently coordinates the legacy page state; schedule, Academic snapshot dates, and global update behavior live in feature modules.
- `backend/server.js` local HTTP routes and service startup.
- `backend/features/` local records and reports, backups, campus menu fetching, and source synchronization.
- `backend/opportunity-radar/` the self-contained Radar service and its package dependencies.
- `public/` static document, icons, manifest, and service worker. Compiled browser files are generated under `public/build/`. Navigation and routine icons come from the local Phosphor Iconify set through `src/ui/components/Icon.ts`; `npm run build:ui` generates its small SVG map before compiling.
- `tests/unit/` data, connector, and persistence checks; `tests/browser/` behavior and responsive checks.
- `docs/features/` ownership notes and the staged refactor roadmap.
- `artifacts/screenshots/` reviewed app screenshots.

## Update behavior

The top-bar **Update all** starts one local sync for NST attendance, RUFP attendance, and Radar, then publishes a bounded phone snapshot. Academic Mail reports Coming soon; it is not captured in the current pipeline. Its dialog reports live source states and the completion time. Radar’s **Find events** remains a separate action for fetching public event listings. NST and RUFP use isolated browser profiles with interactive sign-in. Missing setup or source failures appear as individual results; successful sources remain usable. The scheduled and phone-request paths use the same non-overlapping pipeline.

RU Print menu access is documented in [RU Print Menu API](docs/RU-PRINT-MENU-API.md). Architecture and migration phases are in [Feature guides and roadmap](docs/features/README.md).

## Attendance setup (Browser adapter)

To connect attendance via the isolated Chrome browser profile:

```sh
node scripts/connect-attendance.cjs newton
node scripts/connect-attendance.cjs rishiverse
```

Profiles are kept in `backend/data/browser-sources/` with `0700` permissions. Google sign-in selects the single saved `@rishihood.edu.in` or `@nst.rishihood.edu.in` account and prompts for manual interaction if password/MFA is required.

The NST adapter opens the course scorecard and parses its subject attendance table, with a lecture-response fallback. The user completed one-time browser sign-ins on 19 October; live captures returned 3 NST and 6 RUFP courses, and the phone imported both. A later expired session may require interactive sign-in again.

## Auto-start at login (LaunchAgent)

To run the local server automatically whenever the Mac is logged in and awake:

```sh
./scripts/setup-launchagent.sh install    # installs ~/Library/LaunchAgents/com.uthjabsdk.server.plist
./scripts/setup-launchagent.sh status     # checks service status
./scripts/setup-launchagent.sh uninstall  # cleanly removes agent without affecting other services
```

When the Mac is asleep or powered off, the server does not execute; the Android app shows the latest saved snapshot with an offline/stale notice.

With `SYNC_SCHEDULE_ENABLED=true` and `SYNC_SCHEDULE_INTERVAL=30m` in the local `.env`, the running Mac server repeats Update all every 30 minutes. Its separate phone-request worker checks the queue about every 7 seconds. The installed LaunchAgent and live server health were verified on 6 October; a later login relaunch and sleep cycle remain unobserved.

## Checks

```sh
npm test
TEST_BASE_URL=http://localhost:3001 npm run test:browser
```

The UI build uses the installed TypeScript compiler and Prettier; no frontend runtime framework or large animation dependency is added.
