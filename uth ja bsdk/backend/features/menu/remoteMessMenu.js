const RU_PRINT_ORIGIN = 'https://ru-print.vercel.app';
const CACHE_MS = 10 * 60 * 1000;
let cached;
let cachedAt = 0;
let inFlight;

function extractMenu(bundle) {
  const marker = bundle.indexOf('g={');
  if (marker < 0) throw new Error('RU Print menu data was not found in its app bundle');
  const start = marker + 2;
  const end = bundle.indexOf(',y=new Set(', start);
  if (end < 0 || end - start > 30_000)
    throw new Error('RU Print menu data had an unexpected format');
  const source = bundle.slice(start, end);
  const json = source.replace(/([,{]\s*)([A-Za-z_$][\w$]*)\s*:/g, '$1"$2":');
  let menu;
  try {
    menu = JSON.parse(json);
  } catch {
    throw new Error('RU Print menu data could not be parsed safely');
  }

  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const meals = ['breakfast', 'lunch', 'snacks', 'dinner'];
  for (const day of days) {
    if (!menu[day] || typeof menu[day] !== 'object')
      throw new Error(`RU Print menu is missing ${day}`);
    for (const meal of meals) {
      if (
        !Array.isArray(menu[day][meal]) ||
        menu[day][meal].length > 40 ||
        !menu[day][meal].every((item) => typeof item === 'string' && item.length <= 100)
      ) {
        throw new Error(`RU Print ${day} ${meal} menu is invalid`);
      }
    }
  }
  return Object.fromEntries(
    days.map((day) => [
      day,
      Object.fromEntries(
        meals.map((meal) => [meal, menu[day][meal].map((item) => item.trim()).filter(Boolean)]),
      ),
    ]),
  );
}

async function fetchRemoteMenu() {
  const pageResponse = await fetch(`${RU_PRINT_ORIGIN}/`, {
    headers: { Accept: 'text/html' },
    signal: AbortSignal.timeout(8000),
  });
  if (!pageResponse.ok) throw new Error(`RU Print returned ${pageResponse.status}`);
  const html = await pageResponse.text();
  if (html.length > 1_000_000) throw new Error('RU Print page exceeded the expected size');
  const scriptPath = html.match(
    /<script[^>]+src=["']([^"']*\/static\/chunks\/app\/page-[^"']+\.js)["']/,
  )?.[1];
  if (!scriptPath) throw new Error('RU Print app bundle could not be found');
  const scriptUrl = new URL(scriptPath, RU_PRINT_ORIGIN);
  if (
    scriptUrl.origin !== RU_PRINT_ORIGIN ||
    !scriptUrl.pathname.startsWith('/_next/static/chunks/app/page-')
  )
    throw new Error('RU Print app bundle URL was invalid');
  const bundleResponse = await fetch(scriptUrl, {
    headers: { Accept: 'application/javascript' },
    signal: AbortSignal.timeout(8000),
  });
  if (!bundleResponse.ok) throw new Error(`RU Print menu bundle returned ${bundleResponse.status}`);
  const bundle = await bundleResponse.text();
  if (bundle.length > 500_000) throw new Error('RU Print app bundle exceeded the expected size');
  return extractMenu(bundle);
}

async function getRemoteMenu() {
  if (cached && Date.now() - cachedAt < CACHE_MS)
    return {
      menu: cached,
      fetchedAt: new Date(cachedAt).toISOString(),
      sourceUrl: RU_PRINT_ORIGIN,
    };
  if (!inFlight)
    inFlight = fetchRemoteMenu()
      .then((menu) => {
        cached = menu;
        cachedAt = Date.now();
        return { menu, fetchedAt: new Date(cachedAt).toISOString(), sourceUrl: RU_PRINT_ORIGIN };
      })
      .finally(() => {
        inFlight = null;
      });
  return inFlight;
}

module.exports = { extractMenu, getRemoteMenu, RU_PRINT_ORIGIN };
