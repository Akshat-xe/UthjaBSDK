import { crawlJson } from './crawler.js';
export async function fetchUnstopHackathons(pages = 15, getJson = crawlJson) {
  const opportunities = [];
  let lastPage = 1;
  for (let page = 1; page <= Math.min(pages, lastPage); page++) {
    try {
      const url = `https://unstop.com/api/public/opportunity/search-result?opportunity=hackathons&oppstatus=open&page=${page}&per_page=20`;
      const json = await getJson(url);
      const list = json?.data?.data;
      if (!Array.isArray(list)) throw new Error('Unstop response schema changed');
      lastPage = Math.min(15, Math.max(lastPage, Number(json?.data?.last_page) || 1));

      for (const item of list) {
        if (!item.id || !item.title) continue;
        const reg = item.regnRequirements || {};
        const title = item.title || '';
        const id = `unstop_${item.id}`;
        const url = item.seo_url || `https://unstop.com/hackathons/${item.id}`;
        const deadline = reg.end_regn_dt || null;
        const org = item.organisation?.name || item.organisation_name || 'Independent / Campus';
        const region = String(item.region || '').toLowerCase();
        const mode = /online|virtual|remote/.test(region)
          ? 'online'
          : /offline|in.?person|hybrid/.test(region)
            ? 'in-person'
            : 'unknown';
        const prizes = (item.prizes || [])
          .filter((p) => Number(p.cash) > 0)
          .map(
            (p) =>
              `${p.currencyCode || (p.currency === 'fa-rupee' ? 'INR' : 'Currency unverified')} ${p.cash}`,
          )
          .join(' + ');

        opportunities.push({
          id,
          platform: 'unstop',
          title,
          organizer: org,
          event_url: url,
          event_type: 'hackathon',
          mode,
          location: item.address_with_country_logo?.city || 'Location unverified',
          registration_deadline: deadline,
          start_date: item.start_date || item.event_start_date || null,
          end_date: item.end_date || item.event_end_date || null,
          status: reg.reg_status === 'FINISHED' ? 'expired' : 'active',
          prize_pool: prizes,
          skills_required: (item.workfunction || []).map((t) => t.name).filter(Boolean),
          raw_data: {
            description: (item.details || '').replace(/<[^>]*>/g, ' ').slice(0, 20000),
            sourceUrl: url,
            sourceCheckedAt: new Date().toISOString(),
            registrationOpens: reg.start_regn_dt || null,
            registrationCloses: reg.end_regn_dt || null,
            venue: item.address_with_country_logo?.address || '',
            state: item.address_with_country_logo?.state || '',
            eligibility: reg.eligibility || null,
            paid: Boolean(item.isPaid),
            viewsCount: item.viewsCount,
            minTeam: reg.min_team_size,
            maxTeam: reg.max_team_size,
            daysLeft: reg.remain_days,
          },
        });
      }
    } catch (err) {
      throw new Error(`Unstop page ${page}: ${err.message}`);
    }
  }

  return opportunities;
}
