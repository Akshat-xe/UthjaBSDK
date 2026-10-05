import { crawlJson } from './crawler.js';
import { enrichDevpost } from './devpostDetails.js';
export async function fetchDevpostHackathons(getJson = crawlJson, enrich = enrichDevpost) {
  const opportunities = [];

  try {
    const data = await getJson('https://devpost.com/api/hackathons');
    const list = data.hackathons;
    if (!Array.isArray(list)) throw new Error('Devpost response schema changed');

    for (const item of list) {
      if (!item.id || !item.title) continue;
      const id = `devpost_${item.id}`;
      const title = item.title || '';
      const org = item.organization_name || 'Devpost Community';
      const url = item.url || `https://devpost.com/hackathons/${item.id}`;
      const mode = (item.displayed_location?.location || '').toLowerCase().includes('online')
        ? 'online'
        : 'in-person';
      const themes = (item.themes || []).map((t) => t.name);

      // Clean prize amount HTML
      const prizeRaw = item.prize_amount || '';
      const prizeClean = prizeRaw.replace(/<[^>]+>/g, '').trim();

      opportunities.push({
        id,
        platform: 'devpost',
        title,
        organizer: org,
        event_url: url,
        event_type: 'hackathon',
        mode,
        location: item.displayed_location?.location || 'Global',
        registration_deadline: null, // Displayed submission ranges omit timezone; do not invent a deadline.
        status: item.open_state === 'open' ? 'active' : 'expired',
        start_date: null,
        end_date: null,
        prize_pool: prizeClean,
        skills_required: themes,
        raw_data: {
          registrationsCount: item.registrations_count,
          submissionDates: item.submission_period_dates,
          timeLeft: item.time_left_to_submission,
        },
      });
    }
  } catch (err) {
    throw err;
  }

  return enrich(opportunities);
}
