import { crawlPages } from './crawler.js';

export function extractDevpostDetails($) {
  const scripts = $('script[type="application/ld+json"]').toArray();
  let event;
  for (const script of scripts) {
    try {
      const data = JSON.parse($(script).text());
      event = [data, ...(data['@graph'] || []), ...(Array.isArray(data) ? data : [])].find(
        (x) => x?.['@type'] === 'Event',
      );
      if (event) break;
    } catch {
      /* Other JSON-LD blocks are not event data. */
    }
  }
  if (!event) throw new Error('Event metadata unavailable on detail page');
  const eventDate = (value) =>
    typeof value === 'string' &&
    /(?:Z|[+-]\d\d:\d\d)$/.test(value) &&
    Number.isFinite(Date.parse(value))
      ? new Date(value).toISOString()
      : null;
  // JSON-LD description is HTML-entity encoded on Devpost.
  const decoded = $('<textarea>')
    .html(event.description || '')
    .text();
  const description = $('<div>').html(decoded).text().slice(0, 20000);
  return {
    start_date: eventDate(event.startDate),
    end_date: eventDate(event.endDate),
    description,
    detailVerifiedAt: new Date().toISOString(),
  };
}

export async function enrichDevpost(opportunities) {
  const byUrl = new Map(
    opportunities.filter((o) => o.status === 'active').map((o) => [o.event_url, o]),
  );
  opportunities.warnings = [];
  if (!byUrl.size) return opportunities;
  try {
    await crawlPages([...byUrl.keys()], ({ $, request }) => {
      const item = byUrl.get(request.url);
      const details = extractDevpostDetails($);
      item.start_date = details.start_date;
      item.end_date = details.end_date;
      Object.assign(item.raw_data, details);
    });
  } catch (error) {
    opportunities.warnings.push(`Some Devpost detail pages unavailable: ${error.message}`);
  }
  return opportunities;
}
