# Browser UI

`app.ts` owns route selection, local page state, and rendering. `features/` contains isolated browser behavior; `styles/` contains the app-wide style sources. `npm run build:ui` compiles the UI into `public/build/`, where the static server and service worker load it.

The app entry remains a migration boundary. New behavior should live in a feature module with typed inputs and outputs, then be connected through a small event or explicit callback.
