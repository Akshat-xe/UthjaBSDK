# RU Print menu API

This app exposes the RU Print campus menu through its Express server. The browser should call the local endpoint; the server fetches and validates the live menu from RU Print. RU Print currently embeds menu data in its deployed app bundle rather than exposing a documented JSON API.

## Endpoint

`GET /api/mess-menu`

For the local app, the URL is `http://localhost:3000/api/mess-menu`. The route takes no query parameters, request body, or authentication. It responds with JSON and sets `Cache-Control: no-store` on the HTTP response. The server caches a successful upstream menu in memory for 10 minutes, so repeated requests during that period reuse the same fetch.

## Fetch from the browser

Use a relative URL so the request goes to the same app origin:

```js
async function fetchMessMenu() {
  const response = await fetch('/api/mess-menu');
  const result = await response.json();

  if (!response.ok || !result.success) {
    throw new Error(result.details || result.error || `Menu request failed (${response.status})`);
  }

  return result;
}

const { menu, mealTimes12h, fetchedAt, sourceUrl } = await fetchMessMenu();
const todaysBreakfast = menu.Friday.breakfast;
```

Replace `Friday` with the desired English weekday name.

## Success response

HTTP `200 OK`:

| Field                 | Type            | Meaning                                                                                             |
| --------------------- | --------------- | --------------------------------------------------------------------------------------------------- |
| `success`             | boolean         | `true` when a validated menu was fetched or served from cache.                                      |
| `menu`                | object          | Menu keyed by `Monday` through `Sunday`.                                                            |
| `menu[day].breakfast` | string[]        | Breakfast dishes for that day.                                                                      |
| `menu[day].lunch`     | string[]        | Lunch dishes for that day.                                                                          |
| `menu[day].snacks`    | string[]        | Snack dishes for that day.                                                                          |
| `menu[day].dinner`    | string[]        | Dinner dishes for that day.                                                                         |
| `fetchedAt`           | ISO 8601 string | Time of the last successful upstream fetch, in UTC. A cached response keeps its original timestamp. |
| `sourceUrl`           | string          | RU Print app origin (`https://ru-print.vercel.app`).                                                |
| `mealTimes12h`        | object          | Display metadata for each meal: `time12h`, `startHour`, `endHour`, and `label`.                     |

Example menu access:

```js
menu.Monday.breakfast; // e.g. ["Banana", "Masala Oats", ...]
mealTimes12h.lunch; // { time12h: "1:00 PM", startHour: 12, endHour: 15, label: "Lunch" }
```

The menu contains all seven weekdays and all four meal arrays. Dish names and menu contents are supplied by RU Print and can change independently of this app.

## Errors

An upstream fetch or validation failure returns HTTP `502 Bad Gateway`:

```json
{
  "success": false,
  "error": "Could not fetch the live RU Print menu",
  "details": "RU Print app bundle could not be found",
  "sourceUrl": "https://ru-print.vercel.app"
}
```

`details` describes the fetch or validation problem. The app rejects missing weekdays/meals, invalid dish entries, oversized responses, unexpected bundle URLs, and invalid embedded data rather than returning a partial or unsafe menu. The upstream page and bundle requests each have an 8-second timeout. A failed request is not cached; a later call can retry.

## cURL

```sh
curl --fail-with-body http://localhost:3000/api/mess-menu
```

## Implementation

The HTTP route is in [`backend/server.js`](../backend/server.js). Upstream fetching, bundle parsing, validation, and the in-memory cache are in [`backend/features/menu/remoteMessMenu.js`](../backend/features/menu/remoteMessMenu.js). The parser tests are in [`tests/unit/mess-menu.cjs`](../tests/unit/mess-menu.cjs).

RU Print does not currently publish a stable JSON API contract. This endpoint is the integration contract for this app; if RU Print changes its page or bundle format, the fetcher may need an update.
