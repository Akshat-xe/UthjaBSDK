# Opportunity Radar service

This is a self-contained backend package for public Unstop and Devpost event harvesting, local SQLite records, and explainable event scoring. Its package dependencies remain isolated from the root app dependencies.

The root Express server imports its database, scraper engine, and scoring modules. Persistent event data belongs under `backend/data/opportunity-radar/`; `src/` in this package contains feature code and `config/` contains non-secret defaults. See the root `docs/features/README.md` for the update flow and test commands.

To include an optional local attendance summary in event scoring, set `ATTENDANCE_PATH` to a JSON file on the laptop. Without that setting the attendance input is unknown.
