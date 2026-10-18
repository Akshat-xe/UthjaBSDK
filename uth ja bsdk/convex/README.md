# Private mobile snapshot service

The laptop sends a finished, allowlisted `SnapshotV1` to `POST /mobile/snapshot` on this deployment's `.convex.site` URL. Only this endpoint accepts `MOBILE_PUBLISH_TOKEN`. The Android app reads `GET /mobile/snapshot` with a different `MOBILE_READ_TOKEN` on explicit user tap. Both are 256-bit or stronger random values stored in the Convex deployment environment. Neither token belongs in source control, logs, or an APK. The read token must be provisioned to the phone through a secure pairing step and stored with Android Keystore protection.

Publishing inserts a snapshot, advances the `mobileHeads` pointer, and removes superseded snapshots in one mutation. A repeated current revision with the same content is idempotent; an older revision or conflicting content is rejected. The read endpoint returns only the current revision, plus its SHA-256 digest in a response header. The phone verifies the digest and schema before replacing its local copy. Requests use HTTPS and `Cache-Control: no-store`; there is no realtime subscription or automatic phone refresh.

### Phone-triggered laptop refresh

The Android app uses only `MOBILE_READ_TOKEN`. A user tap sends an empty `POST /mobile/sync-request`; it contains no job payload or personal data. The server creates a request containing only its id, state, and timestamps. If a pending/running request already exists, the tap is deduplicated to that request. Otherwise, new requests are limited to one per 30 seconds. Requests expire after 15 minutes, including uncompleted claims.

Phone contract (Bearer `MOBILE_READ_TOKEN`):

* `POST /mobile/sync-request` with an empty body returns `{request:{requestId,state,createdAt,updatedAt,expiresAt},deduplicated}`. A cooldown response is HTTP 429 with `Retry-After`.
* `GET /mobile/sync-request?id={requestId}` returns `{requestId,state,createdAt,updatedAt,expiresAt,claimedAt?}`. States are `pending`, `running`, `completed`, `failed`, or `expired`; a 404 means the id is unknown or already aged out.
* The phone polls only after an explicit Sync tap, for a bounded interval; it still GETs `/mobile/snapshot` with the read token if the request endpoint is unavailable or times out. App resume does not enqueue work.

Laptop contract (Bearer `MOBILE_PUBLISH_TOKEN`):

* Repeatedly `POST /mobile/sync-request/claim` with an empty body. It atomically claims the oldest pending request, returning the same request object with state `running`, or JSON `null` when the queue is empty.
* After completing a requested collection and successfully publishing its snapshot with `POST /mobile/snapshot`, `POST /mobile/sync-request/{requestId}/complete` with `Content-Type: application/json` and exactly `{"state":"completed"}`. Report an unrecoverable collection/publish failure with `{"state":"failed"}`. Completion is accepted only for a live running claim.

The publisher token is never sent to the phone. Snapshot GET remains read-only; queue paths authenticate their roles independently. Queue records contain no user-controlled payload and are removed lazily after their 15-minute TTL during queue operations. Required deployment environment names: `MOBILE_PUBLISH_TOKEN`, `MOBILE_READ_TOKEN`. Generate distinct random tokens locally and set them through the Convex CLI; keep pairing values in ignored local files. Do not put literal values or a personal deployment URL in this repository. The site's `backend/features/mobile-publish/projection.js` prepares the snapshot before this service is called. Regenerate types and typecheck with `npx convex dev --once --typecheck enable` from the website directory; this change is not deployed here.

The current 700 KB request cap is below Convex's 1 MB document-value limit. If realistic snapshots exceed it, split them into bounded parts with an atomic head rather than increasing the cap blindly. Superseded snapshots are removed when a newer revision becomes current.

### Independent public Radar feed

`crons.ts` runs `radarCloud.refresh` every 12 hours in Convex. It fetches at most two pages (40 listings) from Unstop's public `/api/public/opportunity/search-result` endpoint, with a 12-second timeout per page, a 600 KB response cap per page, and no redirects. Unstop's robots.txt currently allows `/api/public/*`, but this is an undocumented endpoint; schema, access, or terms may change. If a fetch fails or returns no open listings, the previous good feed stays in place and its `fetchedAt` shows its age. No campus credentials, Copilot calls, phone actions, or private snapshots are involved.

`GET /mobile/radar` requires `Bearer MOBILE_READ_TOKEN`. Before the first successful harvest it returns 404. It otherwise returns `{schemaVersion:1,source:"unstop",fetchedAt,opportunities}` with `Cache-Control: no-store`. Rows are public listing metadata and are marked `difficulty:"unverified"`, `tier:"E"`, and `confidence:"low"`; these values are placeholders, not a quality assessment. Android should read this endpoint only on explicit Sync, merge its rows with local favorites/progress, and display source age. Mac-local Copilot enrichment remains a separate optional step. The Radar feed never advances the private `/mobile/snapshot` revision.

### Phone actions (single-owner pilot)

`/mobile/actions` stores the Android `PhoneActionState` JSON separately from laptop snapshots. Both routes require `Bearer MOBILE_READ_TOKEN` and return `Cache-Control: no-store`. This token grants **read and write access to all phone actions in this private one-person deployment**. It is not multi-user authentication. Before adding other users or devices, use per-user identity, owner-scoped rows, and a conflict policy.

* `GET /mobile/actions` returns HTTP 404 when no record exists, otherwise `{schemaVersion:1,revision,state}`. Revision starts at 1.
* `PUT /mobile/actions` accepts `{schemaVersion:1,expectedRevision,mutationId,state}`. `expectedRevision` is `null` only when creating the first record. A successful response is `{revision,mutationId,reused}`. Repeating the same mutation ID, expected revision, and state is idempotent even after later updates. Reusing an ID for different input or sending a stale revision returns HTTP 409; a stale revision response includes `{error:"revision_conflict",revision}`.
* The entire PUT body is limited to 512 KiB. The server rejects unknown fields and malformed or oversized action fields with HTTP 400. Each successful write atomically advances the revision and records its idempotency receipt.

Android must fetch before its first upload after pairing. A new install must restore an existing remote state before it creates or uploads local defaults. A 404 allows a true first write; a network/authentication failure does not. Actions that never reached the server before uninstall cannot be recovered. Wake-call contact settings remain outside this action payload.
