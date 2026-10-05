# Local records

`storage.js` and `seedData.js` provide the existing local records and seed behavior used by the Express app. Runtime user data stays under `backend/data/`, outside the static web root and ignored by Git.

Preserve current data paths when refactoring. Validate input at API boundaries and keep demo/seed records distinct from user records.
