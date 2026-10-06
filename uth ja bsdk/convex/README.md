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
