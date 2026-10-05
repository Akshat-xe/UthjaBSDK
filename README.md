# Uth ja BSDK

A laptop dashboard and a native Android companion for a daily routine, academic schedule, campus tools, and opportunity radar.

## How sync works

The laptop runs source updates and publishes a bounded SnapshotV1 payload to a private Convex deployment. The phone imports that snapshot only when **Sync now** is pressed. Phone actions such as task completion, water logs, notes, and attendance choices remain local and survive later imports. The phone does not run browser scrapers or an AI command line.

Academic mail is included in a mobile snapshot only when its sender matches the laptop's `MOBILE_ACADEMIC_MAIL_SENDERS` allowlist. The default is empty. Local credentials, the staged snapshot, databases, and build artifacts are ignored by Git.

## Local development

1. In `uth ja bsdk`, run `npm ci`; then run `npm ci` in `uth ja bsdk/backend/opportunity-radar`. Copy `.env.example` to `.env` in the website folder and add local values there; do not commit them. Run `npm start` to open the dashboard at `http://127.0.0.1:3000`.
2. Configure the Convex deployment following `uth ja bsdk/convex/README.md`. Keep the read and publish bearer tokens separate. The laptop uses its publish token; pair the Android app with the HTTPS read endpoint and read token in its Sync dialog.
3. From the repository root, run `./gradlew assembleDebug`. Install `app/build/outputs/apk/debug/app-debug.apk` on an Android device, then pair and use **Sync now**.

The Android Tools screen also has local Priority wake calls settings. This uses the system call-screening role, contacts and notification-policy access. Selected phone numbers and call settings stay on the device; they are never part of a laptop sync snapshot. On Android 15 and later, apps cannot turn off a separate active Do Not Disturb rule; wake calls pause while that rule is active. Test with a real incoming call before relying on it as an alarm.

Android automatic backup and device transfer are disabled for app data. Use Reports → Export when you want a manual copy of phone records.

NST and RUFP attendance need their own local source configuration. Their status is shown independently in the dashboard and phone so a successful Radar or menu update is not mistaken for fresh attendance.

## Checks

- Website: `cd "uth ja bsdk" && npm test && npx playwright install chromium && npm run test:browser` (or set `CHROME_EXECUTABLE` to an installed Chrome binary)
- Android: `./gradlew testDebugUnitTest assembleDebug` and, with a connected phone, `./gradlew connectedDebugAndroidTest --no-configuration-cache`
- Dependencies: `npm audit --omit=dev` in both `uth ja bsdk` and `uth ja bsdk/backend/opportunity-radar`

The phone snapshot contract is in `mobile-snapshot-v1.md`.
