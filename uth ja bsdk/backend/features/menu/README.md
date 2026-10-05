# Campus menu

`remoteMessMenu.js` fetches and validates public RU Print menu bundles. `messMenuData.js` contains the app’s saved/fallback menu and meal-time labels. The API route is registered in `backend/server.js` and is documented in `docs/RU-PRINT-MENU-API.md`.

Upstream failures should return a useful local error or saved data, never executable content. Verify parser behavior with `tests/unit/mess-menu.cjs`.
