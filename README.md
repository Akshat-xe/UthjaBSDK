# Uth ja BSDK

A laptop dashboard and a native Android companion for a daily routine, academic schedule, campus tools, and opportunity radar.

## How sync works

The laptop runs source updates and publishes a bounded SnapshotV1 payload to a private Convex deployment. Pressing **Sync now** on Android queues a payload-free request in Convex. While the Mac server is awake, it claims the request, updates sources, publishes a new snapshot, and the phone imports it. If the Mac is unavailable, the phone keeps its last saved snapshot and reports the refresh status. Phone actions such as task completion, water logs, notes, and attendance choices are saved locally first and backed up privately to Convex so a new install can restore them. The phone does not run browser scrapers or an AI command line.

The laptop keeps a private last-success receipt so its publish status survives a server restart. A staged snapshot alone is never shown as successfully published.

Academic Mail is intentionally **Coming soon** in the current sync and Android app; it is not presented as a working phone source. The dormant mobile projection still restricts eligible mail to locally classified urgent or high priority messages from approved campus senders. Local credentials, the staged snapshot, databases, and build artifacts are ignored by Git.

## Local development

1. In `uth ja bsdk`, run `npm ci`; then run `npm ci` in `uth ja bsdk/backend/opportunity-radar`. Copy `.env.example` to `.env` in the website folder and add local values there; do not commit them. Run `npm start` to open the dashboard at `http://127.0.0.1:3000`.
2. Configure the Convex deployment following `uth ja bsdk/convex/README.md`. Keep the read and publish bearer tokens separate. The laptop uses its publish token; pair the Android app with the HTTPS read endpoint and read token in its Sync dialog.
3. From the repository root, run `./gradlew assembleDebug`. Install `app/build/outputs/apk/debug/app-debug.apk` on an Android device, then pair and use **Sync now**.
4. On macOS, run `./scripts/setup-launchagent.sh install` from `uth ja bsdk` to start the local server and phone-request worker at login. `status` inspects it and `uninstall` removes it. Set `SYNC_SCHEDULE_ENABLED=true` and `SYNC_SCHEDULE_INTERVAL=30m` in the ignored local `.env` for a cron-like 30-minute Update all repeat while the Mac is awake. Phone requests are checked separately about every 7 seconds. The installed agent and its live health were verified on 6 October; login relaunch and sleep behavior still need observation.

The Android Tools screen also has local Priority wake calls settings. This uses the system call-screening role, contacts and notification-policy access. Selected phone numbers and call settings stay on the device; they are never part of a laptop sync snapshot. On Android 15 and later, apps cannot turn off a separate active Do Not Disturb rule; wake calls pause while that rule is active. Test with a real incoming call before relying on it as an alarm.

Android automatic backup and device transfer are disabled for app data. After pairing, supported phone actions are backed up to Convex and restored on a fresh install. Priority wake-call contacts and settings stay device-only. Use Reports → Export when you want a manual copy of phone records.

NST and RUFP attendance use isolated local browser profiles. Run `node scripts/connect-attendance.cjs newton` and `node scripts/connect-attendance.cjs rishiverse` from `uth ja bsdk`, then sign in interactively in the opened browser windows once. Passwords, MFA, and CAPTCHA are never automated. The NST adapter reads subject attendance from the course scorecard, with a lecture-response fallback. Parser tests pass, but authenticated live captures from both sites still need proof. Each active source's status is shown independently so a successful Radar or menu update is not mistaken for fresh attendance. Academic Mail stays Coming soon regardless of Apple Mail account setup.

## Checks

- Website: `cd "uth ja bsdk" && npm test && npx playwright install chromium && npm run test:browser` (or set `CHROME_EXECUTABLE` to an installed Chrome binary)
- Android: `./gradlew testDebugUnitTest assembleDebug` and, with a connected phone, `./gradlew connectedDebugAndroidTest --no-configuration-cache`
- Dependencies: `npm audit --omit=dev` in both `uth ja bsdk` and `uth ja bsdk/backend/opportunity-radar`

The phone snapshot contract is in `mobile-snapshot-v1.md`.
