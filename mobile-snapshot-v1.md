# Mobile snapshot contract, version 1

The laptop publishes one processed, allowlisted JSON document after its local source run settles. `mobile-snapshot-v1.fixture.json` is synthetic output from the tested projector; it contains no account data. The phone fetches this document only on a Sync tap and keeps its last verified copy when a request fails.

## Envelope

- `schemaVersion` is exactly `1`. A phone that sees another value must keep its prior snapshot and report an unsupported version.
- `revision` uniquely identifies an immutable publication. `runId` identifies the laptop source run. `publishedAt` is ISO 8601. A phone may accept a different revision only after payload validation and checksum verification.
- `sources` has `newton`, `rishiverse`, `gmail`, `radar`, and `menu`. Each has `status`, `freshness`, and nullable `updatedAt`. A failed source may retain last-good records and is marked stale.
- `academic` contains attendance groups, subjects, a bounded timetable, and short mail digests. `radar` contains public opportunity listings and bounded matching labels. `menu` contains the seven-day four-meal RU Print menu. Exact projection limits and redaction are documented in `uth ja bsdk/backend/features/mobile-publish/README.md`.

## Import rule

The phone verifies HTTPS, HTTP status, `X-Snapshot-SHA256` against the exact response bytes, JSON shape, `schemaVersion`, and required sections before storing the new document. It saves a complete validated document atomically, then updates UI state. A `304` leaves the existing copy intact. Local task checkoffs, food/water records, notes, wardrobe, favorites, and preferences are a separate phone-owned store and are never replaced by an imported laptop snapshot.

If a future schema changes field meanings or required structure, increment `schemaVersion` and add an explicit migration before the phone accepts it. Unknown optional fields in version 1 may be ignored. Do not silently reinterpret an unknown version as version 1.

## Security boundary

The snapshot intentionally omits raw email bodies, login credentials, process output, logs, local file paths, and full scraper payloads. A write token stays on the laptop. A different read token is paired on the phone and protected by Android Keystore. Neither belongs in this repository or an APK. Convex receives only projector output; the laptop Express backend retains raw data and Copilot execution.
