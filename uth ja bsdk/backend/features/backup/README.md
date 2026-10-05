# Backup and reports

`trackerBackup.js` registers the per-device backup route and report generation. It validates payloads, isolates workspaces by opaque token hash, and writes private files under `backend/data/workspaces/`.

Run `tests/unit/backup.cjs` after changing persistence, token handling, or report output. Never move live backup data while reorganizing source files.
