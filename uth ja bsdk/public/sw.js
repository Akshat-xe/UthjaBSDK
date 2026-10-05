const CACHE = 'rhythm-shell-v39';
const SHELL = [
  '/',
  '/index.html',
  '/build/app.css',
  '/build/sidebar.css',
  '/build/routine.css',
  '/build/food.css',
  '/build/academic.css',
  '/build/update-control.css',
  '/build/app.js',
  '/build/components/Icon.js',
  '/build/components/icon-data.js',
  '/build/features/routine/schedule.js',
  '/build/features/academic/snapshotDate.js',
  '/build/features/academic/weeklyTimetable.js',
  '/build/features/sync/UpdateControl.js',
  '/icon.svg',
  '/manifest.webmanifest',
  '/profile.jpg',
];
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith('rhythm-shell-') && k !== CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (
    event.request.method !== 'GET' ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith('/api/')
  )
    return;
  // Refresh the app document first so UI updates are visible; fall back to the shell offline.
  const fresh = fetch(event.request).then(async (response) => {
    if (response.ok && SHELL.includes(url.pathname)) {
      const cache = await caches.open(CACHE);
      await cache.put(event.request, response.clone());
    }
    return response;
  });
  event.waitUntil(fresh.catch(() => null));
  const offline = () =>
    caches
      .match(event.request)
      .then((saved) => saved || caches.match(url.pathname))
      .then(
        (saved) =>
          saved ||
          (event.request.mode === 'navigate' ? caches.match('/index.html') : Response.error()),
      );
  const buildAsset = url.pathname.startsWith('/build/');
  event.respondWith(
    event.request.mode === 'navigate' || url.pathname === '/index.html' || buildAsset
      ? fresh.catch(offline)
      : caches
          .match(event.request)
          .then((saved) => saved || fresh)
          .catch(offline),
  );
});
