# Mobile snapshot projection

`projection.js` exports `projectSnapshot(input)`. It is a synchronous, pure projection: callers collect the inputs and publication metadata; this module performs no I/O, credential lookup, or process execution. Every returned object and array is newly allocated.

## Input

Pass one JSON-compatible object:

```js
{
  metadata: { revision: 'rev-42', runId: 'sync-42', publishedAt: '2026-09-30T10:00:00.000Z' },
  academic: {
    importedAt: '2026-09-30T09:55:00.000Z',
    semester: 'Semester 3',
    sources: {
      newton: { updatedAt: '2026-09-30T09:50:00.000Z' },
      rishiverse: { updatedAt: '2026-09-30T09:51:00.000Z' },
      gmail: { updatedAt: '2026-09-30T09:52:00.000Z' }
    },
    attendance: { combined: {}, nst: {}, rufp: {} },
    subjects: [],
    schedule: [],
    emails: [{ sender: 'Academic notice', subject: 'Update', summary: 'A short digest.' }]
  },
  radar: { fetchedAt: '2026-09-30T09:53:00.000Z', opportunities: [] },
  menu: { fetchedAt: '2026-09-30T09:54:00.000Z', menu: { /* full week */ } },
  syncResult: {
    sources: {
      newton: { status: 'success' },
      rishiverse: { status: 'failed', error: 'Local diagnostic; never projected' },
      gmail: { status: 'partial' },
      radar: { status: 'success' },
      menu: { status: 'success' }
    }
  }
}
```

`academic` follows the bounded `/api/academic` shape (`attendance`, `subjects`, `schedule`, and `emails`). `academic.sources` and `academic.mailUpdatedAt` carry the timestamps of the last-good source data; do not substitute the enclosing sync run's `finishedAt`. A failed source retains its last-good timestamp and records but is labeled failed/stale. Radar listings use the existing `/api/radar/opportunities` record names (`event_url`, `registration_deadline`, etc.); only public listing fields and an optional summary are copied. The menu uses the weekly `menu` object and `fetchedAt` from `/api/mess-menu`. All dates supplied as timestamps must be parseable.

Source statuses accepted in `syncResult.sources` are `success`, `partial`, `failed`, `setup_required`, and `running`. A missing source is `unavailable`. Freshness is `fresh` only when status is `success` and a last-good timestamp exists; a timestamp on a failed/partial/running source is retained but labeled `stale`; otherwise freshness is `unknown`. A successful `updatedAt` may be provided on its sync source result when no source-data timestamp is available.

## Output and bounds

The returned `SnapshotV1` contains `schemaVersion: 1`, `revision`, `runId`, ISO `publishedAt`, per-source `{ status, freshness, updatedAt }`, and `academic`, `radar`, and `menu` sections. Revision and run IDs must be 1–100 characters. Attendance summaries retain only nonnegative `attended`, `total`, `canMiss`, and `needAttend` counts plus `percent` (0–100). Subjects retain `name` (100 chars), `group` (60), `code` (40), and those attendance values. Timetable retains `date` (48), `badge` (60), and up to 8 classes per day with `time` (48), `subject` (100), `type` (48), `title` (140), `status` (48), and `location` (100). Academic limits are 100 subjects, 14 timetable days, and 12 mail summaries. Mail retains `sender` (100), `subject` (180), `summary` (220), `date` (48), `category` (48), `priority` (24), and `actionItem` (180).

Radar is limited to 50 opportunities and 12 skills (40 chars each) per listing; its allowlist is `id` (100), `title` (180), `organizer` (120), `platform` (40), HTTPS `url` (500), `mode` (40), `location` (120), dates (48 each), `summary` (500), and skills. The menu requires all seven days and four meal arrays per day, with at most 40 items per meal and 100 chars per item. Projected text fields are trimmed, control characters/extra whitespace removed, and length-limited.

Mail output accepts only `sender`, `subject`, `summary` (falling back to bounded `snippet` when summary is absent/empty), `date`/`dateOnly`, `category`, `priority`/`urgency`, and `actionItem`. Message bodies, attachments, and all unlisted mail properties are deliberately ignored. Radar output carries the bounded `analysis` fields `bucket`, `tier`, `tierKey`, `difficulty`, `effortHours`, and `confidence`, preserving the UI's tier/difficulty filtering without copying score/reason or other analysis data. These analysis labels are validated against the UI's difficulty/tier enums; effort is limited to 40 chars. Its public listing allowlist also includes `locationLabel` (120 chars), `areaScope` (`local`, `remote`, `outside`, or `unknown`), `distanceKm` (0–20,050), `prizePool` (100 chars), and `teamSize` (60 chars). Only these named public `raw_data` details are eligible: `description` (1000 chars), `eligibility` (120), `submissionDates` (120), and numeric `minTeam`/`maxTeam` (0–100); contradictory team bounds are rejected. A normalized team-size label is derived from those numeric limits when not present in the bounded review summary. Raw listing structures and arbitrary reviewed fields are never copied. Tokens, credentials, diagnostics, process output, browser backup tokens, and unrelated fields are not in the output allowlist.

Malformed fields, unsupported status values, invalid timestamps/URLs, non-JSON input, cyclic/accessor-bearing objects, and input larger than 1 MiB or 50,000 values fail with a safe `TypeError` or `RangeError`. The input is read but never modified.

## Laptop publisher

The server collects the academic response builder, ranked local Radar database records, RU Print menu fetch/cache, and completed connector status in-process; it does not make HTTP requests to its own API. Set both `CONVEX_MOBILE_PUBLISH_URL` (the full HTTPS HTTP-action URL on the intended `*.convex.site`, including its configured route path) and `CONVEX_MOBILE_PUBLISH_TOKEN` to enable cloud publishing. The publisher sends the projected snapshot as JSON with `Authorization: Bearer <token>`; it never logs the token, request body, response body, or transport exception. Missing configuration skips publication. Invalid configuration, collection, and network/HTTP failures are reported with safe status codes and do not roll back or block laptop sync.

After `/api/sync` settles, the server attempts one automatic publish. `POST /api/mobile-publish` is also available for a local-origin manual retry once sync is idle; it uses the same collector and configuration. If a live menu fetch fails after this server process has observed a successful fetch, the previous menu and timestamp are kept and marked stale; the weekly bundled menu is the fallback when no in-process last-good copy exists.

The laptop's local Academic mail page may show recent inbox messages. The mobile publisher sends only urgent or high-priority messages whose sender address or exact `@domain` appears in the comma-separated local `MOBILE_ACADEMIC_MAIL_SENDERS` setting. With no override configured, `@rishihood.edu.in` and `@nst.rishihood.edu.in` are the only approved sender domains. The browser/Mail connector is separately scoped to a Rishihood account, and unrelated personal inbox items never enter this pipeline. Example: `MOBILE_ACADEMIC_MAIL_SENDERS=faculty@example.edu,@campus.example.edu`. Do not put private credentials in this setting.
