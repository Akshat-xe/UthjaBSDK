# Uth ja BSDK

Local-first routine, academic dashboard, attendance, mail, campus menu, and opportunity radar. Express serves the browser app and local APIs; sync starts only when **Update all** is pressed in the shared top bar.

## Run

```sh
npm install
npm start
```

Open [http://localhost:3000](http://localhost:3000). To use port 3001, run `PORT=3001 npm start`. `prestart` builds the TypeScript UI into the ignored `public/build/` directory. Put private connector credentials in `.env` or the configured macOS Keychain services. Never commit `.env`, `backend/data/`, or `backend/private/`.

## Project map

- `src/ui/` browser TypeScript and application styles. `app.ts` currently coordinates the legacy page state; schedule, Academic snapshot dates, and global update behavior live in feature modules.
- `backend/server.js` local HTTP routes and service startup.
- `backend/features/` local records and reports, backups, campus menu fetching, and source synchronization.
- `backend/opportunity-radar/` the self-contained Radar service and its package dependencies.
- `public/` static document, icons, manifest, and service worker. Compiled browser files are generated under `public/build/`. Navigation and routine icons come from the local Phosphor Iconify set through `src/ui/components/Icon.ts`; `npm run build:ui` generates its small SVG map before compiling.
- `tests/unit/` data, connector, and persistence checks; `tests/browser/` behavior and responsive checks.
- `docs/features/` ownership notes and the staged refactor roadmap.
- `artifacts/screenshots/` reviewed app screenshots.

## Update behavior

The top-bar **Update all** starts one local sync for Newton attendance, RUFP attendance, Apple Mail, and Radar. Its dialog reports live source states and the completion time. Radar’s **Find events** remains a separate action for fetching public event listings. Configure Newton with `NEWTON_AUTH_TOKEN` and `NEWTON_COURSE_HASH`, and RUFP with `RISHIVERSE_AUTH_TOKEN` and `RISHIVERSE_ATTENDANCE_URL`. Mail is read from the local Apple Mail app. Missing setup or source failures appear as individual results; successful sources remain usable.

RU Print menu access is documented in [RU Print Menu API](docs/RU-PRINT-MENU-API.md). Architecture and migration phases are in [Feature guides and roadmap](docs/features/README.md).

## Checks

```sh
npm test
TEST_BASE_URL=http://localhost:3001 npm run test:browser
```

The UI build uses the installed TypeScript compiler and Prettier; no frontend runtime framework or large animation dependency is added.
