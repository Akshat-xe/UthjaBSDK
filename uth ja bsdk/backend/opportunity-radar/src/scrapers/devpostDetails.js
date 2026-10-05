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
  const deadline = event.endDate;
  const validDeadline =
    typeof deadline === 'string' &&
    /(?:Z|[+-]\d\d:\d\d)$/.test(deadline) &&
    Number.isFinite(Date.parse(deadline));
  // JSON-LD description is HTML-entity encoded on Devpost.
  const decoded = $('<textarea>')
    .html(event.description || '')
    .text();
  const description = $('<div>').html(decoded).text().slice(0, 20000);
  return {
    registration_deadline: validDeadline ? new Date(deadline).toISOString() : null,
    description,
    submissionStart: event.startDate || null,
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
      item.registration_deadline = details.registration_deadline;
      Object.assign(item.raw_data, details);
    });
  } catch (error) {
    opportunities.warnings.push(`Some Devpost detail pages unavailable: ${error.message}`);
  }
  return opportunities;
}
