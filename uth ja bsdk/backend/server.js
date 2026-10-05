const express = require('express');
const cors = require('cors');
const { randomUUID } = require('crypto');
const path = require('path');
const fs = require('fs');
const storage = require('./features/local-records/storage');
const { mealTimes12h, messMenu } = require('./features/menu/messMenuData');
const { getRemoteMenu, RU_PRINT_ORIGIN } = require('./features/menu/remoteMessMenu');
const {
  collectSnapshotInput,
  publishProjectedSnapshot,
  isProjectedSnapshot,
} = require('./features/mobile-publish/publisher');
const { projectSnapshot } = require('./features/mobile-publish/projection');
const {
  filterApprovedAcademicMail,
  sanitizeStagedAcademicMail,
} = require('./features/mobile-publish/mailFilter');

const app = express();
const PORT = process.env.PORT || 3000;
const radarDataDir = path.join(__dirname, 'data', 'opportunity-radar');
const mobileStageDir = path.join(__dirname, 'data', 'mobile-publish');
const mobileStageFile = path.join(mobileStageDir, 'staged-snapshot.json');
const mobilePublishReceiptFile = path.join(mobileStageDir, 'last-success.json');
process.env.RADAR_DATA_DIR = radarDataDir;
let quoteCache = null;
let quoteCacheDate = '';
let radarModules;
let radarScraper;
let radarHarvestPromise = null;
let lastGoodMobileMenu = null;
function readMobilePublishReceipt() {
  try {
    if (fs.statSync(mobilePublishReceiptFile).size > 4096) return null;
    const saved = JSON.parse(fs.readFileSync(mobilePublishReceiptFile, 'utf8'));
    if (saved.status !== 'published' || typeof saved.revision !== 'string' ||
        !saved.revision || saved.revision.length > 100 ||
        typeof saved.attemptedAt !== 'string' ||
        Number.isNaN(Date.parse(saved.attemptedAt))) return null;
    return { status: 'published', attemptedAt: saved.attemptedAt,
      revision: saved.revision, reason: null };
  } catch {
    return null;
  }
}
function saveMobilePublishReceipt(state) {
  try {
    fs.mkdirSync(mobileStageDir, { recursive: true, mode: 0o700 });
    const temporary = `${mobilePublishReceiptFile}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(state), { mode: 0o600 });
    fs.renameSync(temporary, mobilePublishReceiptFile);
  } catch {
    console.error('[Mobile publish] Could not persist last success status.');
  }
}
let mobilePublishState = readMobilePublishReceipt() ||
  { status: 'idle', attemptedAt: null, revision: null, reason: null };
const connectors = require('./features/sync/connectors');
async function getRadarModules() {
  radarModules ||= Promise.all([
    import('./opportunity-radar/src/db/database.js'),
    import('./opportunity-radar/src/scoring/triageEngine.js'),
  ]).then(([db, analysis]) => ({
    database: db.database,
    rankAndLimit: analysis.rankAndLimit,
    opportunityProfile: analysis.opportunityProfile,
  }));
  return radarModules;
}
async function getRadarScraper() {
  radarScraper ||= import('./opportunity-radar/src/engine/runner.js').then((engine) => ({
    runScraperPipeline: engine.runScraperPipeline,
  }));
  return radarScraper;
}
const localCities = {
  sonipat: [28.993, 77.015],
  murthal: [29.025, 77.065],
  delhi: [28.614, 77.209],
  'new delhi': [28.614, 77.209],
  gurugram: [28.459, 77.026],
  gurgaon: [28.459, 77.026],
  noida: [28.536, 77.391],
  'greater noida': [28.474, 77.504],
  ghaziabad: [28.669, 77.454],
  faridabad: [28.408, 77.317],
  rohtak: [28.895, 76.606],
  panipat: [29.391, 76.963],
  bahadurgarh: [28.692, 76.924],
  meerut: [28.985, 77.706],
  baghpat: [28.944, 77.218],
  karnal: [29.685, 76.99],
  jhajjar: [28.607, 76.656],
  kundli: [28.88, 77.12],
  hapur: [28.73, 77.775],
  pilkhuwa: [28.712, 77.656],
  bulandshahr: [28.406, 77.849],
  muzaffarnagar: [29.472, 77.708],
  shamli: [29.45, 77.315],
  aligarh: [27.897, 78.088],
  mathura: [27.492, 77.673],
  bijnor: [29.373, 78.136],
  roorkee: [29.854, 77.888],
  haridwar: [29.945, 78.164],
  chennai: [13.083, 80.27],
  mumbai: [19.076, 72.878],
  bengaluru: [12.972, 77.595],
  bangalore: [12.972, 77.595],
  hyderabad: [17.385, 78.487],
  pune: [18.52, 73.856],
  kolkata: [22.573, 88.364],
  lucknow: [26.847, 80.947],
  jaipur: [26.912, 75.787],
  dehradun: [30.316, 78.032],
  chandigarh: [30.734, 76.779],
};
function classifyRadarPlace(item) {
  const raw = item.raw_data || {};
  const researchLocation = '';
  const hybrid = /hybrid|in[- ]person|offline/i.test(
    `${item.mode} ${item.location} ${researchLocation}`,
  );
  if (
    !hybrid &&
    (item.mode === 'online' || /online|remote|virtual/i.test(`${item.mode} ${item.location}`))
  )
    return {
      areaScope: 'remote',
      distanceKm: null,
      locationLabel: researchLocation || 'Online',
      placeVerified: true,
      locationReason: 'The source or cited research lists this event as online.',
    };
  const locationValue =
    typeof item.location === 'string'
      ? item.location
      : Object.values(item.location || {})
          .filter((v) => typeof v === 'string')
          .join(', ');
  const place = [
    locationValue,
    researchLocation,
    raw.venue,
    raw.address,
    raw.city,
    raw.state,
    raw.district,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  for (const [city, [lat, lon]] of Object.entries(localCities)) {
    if (!new RegExp(`\\b${city.replace(/[.*+?^${}()|[\\]\\]/g, '\\\\$&')}\\b`, 'i').test(place))
      continue;
    const dLat = ((lat - 28.993) * Math.PI) / 180,
      dLon = ((lon - 77.015) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((28.993 * Math.PI) / 180) *
        Math.cos((lat * Math.PI) / 180) *
        Math.sin(dLon / 2) ** 2;
    const distanceKm = Math.round(6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
    return {
      areaScope: distanceKm <= 100 ? 'local' : 'outside',
      distanceKm,
      locationLabel: `${city.replace(/\b\w/g, (c) => c.toUpperCase())}, ${raw.state || 'India'}`,
      placeVerified: true,
      locationReason: `Matched the event’s venue fields to ${city.replace(/\b\w/g, (c) => c.toUpperCase())}; straight-line distance from Sonipat.`,
    };
  }
  if (/\b(ncr|delhi ncr|national capital region|nct of delhi)\b/i.test(place))
    return {
      areaScope: 'local',
      distanceKm: null,
      locationLabel: 'Delhi NCR',
      placeVerified: true,
      locationReason: 'The event lists Delhi NCR; exact venue is not available.',
    };
  return {
    areaScope: 'unknown',
    distanceKm: null,
    locationLabel: 'Location not verified',
    placeVerified: false,
    locationReason: 'No nearby venue could be confirmed from the event location fields.',
  };
}
async function startRadarHarvest(trigger = 'manual_ui') {
  if (radarHarvestPromise) return radarHarvestPromise;
  radarHarvestPromise = getRadarScraper()
    .then(({ runScraperPipeline }) => runScraperPipeline(trigger))
    .finally(() => {
      radarHarvestPromise = null;
    });
  return radarHarvestPromise;
}
const localOrigins = new Set([`http://localhost:${PORT}`, `http://127.0.0.1:${PORT}`]);
const localHosts = new Set([`localhost:${PORT}`, `127.0.0.1:${PORT}`]);
app.use('/api', (req, res, next) => {
  if (!localHosts.has(req.get('host')))
    return res.status(403).json({ error: 'This API only accepts the local dashboard host.' });
  next();
});
app.use(
  cors({
    origin(origin, callback) {
      callback(null, !origin || localOrigins.has(origin));
    },
  }),
);
app.use(express.json({ limit: '8mb' }));
function requireLocalOrigin(req, res, next) {
  const origin = req.get('origin');
  if (origin && !localOrigins.has(origin))
    return res.status(403).json({ error: 'This local action only accepts the dashboard origin.' });
  next();
}
app.use((req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  return requireLocalOrigin(req, res, next);
});
require('./features/backup/trackerBackup')(app);

// Serve static frontend files
const publicDir = path.join(__dirname, '..', 'public');
app.use(express.static(publicDir));

// Opportunity Radar is served by this app and saves records in backend/data/opportunity-radar/radar.sqlite.
app.get('/api/radar/opportunities', async (req, res) => {
  try {
    const { database, rankAndLimit } = await getRadarModules();
    const opportunities = database
      .getAllOpportunities({ status: 'active' })
      .map((item) => ({ ...item, ...classifyRadarPlace(item) }));
    const scope = req.query.scope || 'nearby';
    const nearby = opportunities.filter((o) => ['local', 'remote'].includes(o.areaScope));
    const scoped =
      scope === 'all'
        ? opportunities
        : scope === 'local'
          ? opportunities.filter((o) => o.areaScope === 'local')
          : scope === 'remote'
            ? opportunities.filter((o) => o.areaScope === 'remote')
            : nearby;
    res.json({
      success: true,
      opportunities: rankAndLimit(scoped),
      counts: {
        nearby: nearby.length,
        local: opportunities.filter((o) => o.areaScope === 'local').length,
        remote: opportunities.filter((o) => o.areaScope === 'remote').length,
        outside: opportunities.filter((o) => o.areaScope === 'outside').length,
        unknown: opportunities.filter((o) => o.areaScope === 'unknown').length,
      },
    });
  } catch (err) {
    res.status(500).json({ error: 'Could not load opportunities', details: err.message });
  }
});
app.get('/api/radar/status', async (_req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    const { database, opportunityProfile } = await getRadarModules();
    const runs = database.getRecentRuns(1);
    res.json({
      success: true,
      engine: 'Unstop + Devpost harvest · explainable local scoring · local SQLite',
      database: 'backend/data/opportunity-radar/radar.sqlite',
      schedule: 'External harvest starts only after an explicit user action',
      scraping: Boolean(radarHarvestPromise) || database.isPipelineRunning(),
      analysisEngine:
        'Local rules for ranking · Copilot CLI for optional event summaries during Sync all.',
      profile: opportunityProfile,
      sources: [
        {
          key: 'unstop',
          name: 'Unstop',
          method: 'Public hackathon listing API',
          url: 'https://unstop.com/',
        },
        {
          key: 'devpost',
          name: 'Devpost',
          method: 'Public listing pages',
          url: 'https://devpost.com/hackathons',
        },
      ],
      runs,
      sync: connectors.getSyncState(),
    });
  } catch (err) {
    res.status(500).json({ error: 'Could not load scraper status', details: err.message });
  }
});
app.get('/api/daily-quote', async (_req, res) => {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
  if (quoteCache && quoteCacheDate === today) return res.json(quoteCache);
  try {
    const response = await fetch('https://zenquotes.io/api/today', {
      signal: AbortSignal.timeout(5000),
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`Quote service returned ${response.status}`);
    const data = await response.json();
    const quote = Array.isArray(data) ? data[0] : null;
    if (!quote || typeof quote.q !== 'string' || typeof quote.a !== 'string')
      throw new Error('Quote response was incomplete');
    quoteCache = {
      quote: quote.q.slice(0, 500),
      author: quote.a.slice(0, 100),
      source: 'ZenQuotes',
      sourceUrl: 'https://zenquotes.io/',
      date: today,
    };
    quoteCacheDate = today;
    res.set('Cache-Control', 'public, max-age=21600').json(quoteCache);
  } catch (error) {
    res
      .status(503)
      .json({ error: 'Daily quote is temporarily unavailable', details: error.message });
  }
});
app.post('/api/radar/scrape', requireLocalOrigin, (req, res) => {
  if (radarHarvestPromise)
    return res.status(409).json({ success: false, message: 'A harvest is already running' });
  res.status(202).json({
    success: true,
    message: 'Harvest started; results save to the local Opportunity Radar database',
  });
  startRadarHarvest('manual_ui').catch((err) =>
    console.error('[Opportunity Radar] Harvest failed:', err.message),
  );
});
app.get('/api/sync/status', (_req, res) =>
  res.set('Cache-Control', 'no-store').json({ success: true, ...connectors.getSyncState() }),
);
async function publishCurrentMobileSnapshot(syncState) {
  mobilePublishState = {
    ...mobilePublishState,
    status: 'publishing',
    attemptedAt: new Date().toISOString(),
    reason: null,
  };
  try {
    const runId = syncState.finishedAt ? syncState.startedAt || syncState.finishedAt : null;
    let staged = null;
    let writeStage = false;
    try {
      const saved = JSON.parse(fs.readFileSync(mobileStageFile, 'utf8'));
      if (isProjectedSnapshot(saved) && (!runId || saved.runId === runId)) {
        staged = sanitizeStagedAcademicMail(
          saved,
          process.env.MOBILE_ACADEMIC_MAIL_SENDERS,
          `${new Date().toISOString()}-${randomUUID()}`,
        );
        writeStage = staged !== saved;
      }
    } catch {
      // A missing or unreadable stage is rebuilt when the run is still in memory.
    }
    if (!staged) {
      if (!runId) throw new Error('No completed laptop sync run or staged snapshot');
      const metadata = {
        revision: `${syncState.finishedAt || runId}-${randomUUID()}`,
        runId,
        publishedAt: new Date().toISOString(),
      };
      const input = await collectSnapshotInput({
        metadata,
        getAcademic: () => {
          const academic = getAcademicSnapshot();
          return {
            ...academic,
            emails: filterApprovedAcademicMail(
              academic.emails,
              process.env.MOBILE_ACADEMIC_MAIL_SENDERS,
            ),
          };
        },
        getRadar: async () => {
          const { database, rankAndLimit } = await getRadarModules();
          const latestSuccessfulRun = database
            .getRecentRuns(1000)
            .find((run) => run.status === 'success');
          const ranked = rankAndLimit(
            database
              .getAllOpportunities({ status: 'active' })
              .map((item) => ({ ...item, ...classifyRadarPlace(item) })),
          );
          const opportunities = ranked.slice(0, 50).map((item) => {
            const raw = item.raw_data || {};
            const review = raw.localReview || raw.aiResearch || {};
            return {
              id: item.id,
              title: item.title,
              organizer: item.organizer ?? null,
              platform: item.platform ?? null,
              event_url: item.event_url ?? null,
              mode: item.mode ?? null,
              location: item.location ?? null,
              locationLabel: item.locationLabel ?? null,
              areaScope: item.areaScope,
              distanceKm: item.distanceKm,
              registration_deadline: item.registration_deadline ?? null,
              start_date: item.start_date ?? null,
              end_date: item.end_date ?? null,
              prize_pool: item.prize_pool ?? null,
              skills_required: item.skills_required ?? [],
              analysis: {
                bucket: item.analysis.bucket,
                tier: item.analysis.tier,
                tierKey: item.analysis.tierKey,
                difficulty: item.analysis.difficulty,
                effortHours: item.analysis.effortHours ?? null,
                confidence: item.analysis.confidence,
              },
              raw_data: {
                description: raw.description ?? null,
                eligibility: raw.eligibility ?? null,
                submissionDates: raw.submissionDates ?? null,
                minTeam: raw.minTeam ?? null,
                maxTeam: raw.maxTeam ?? null,
                localReview: {
                  summary: review.summary ?? null,
                  teamSize: review.teamSize ?? null,
                  prizePool: review.prizePool ?? null,
                },
              },
            };
          });
          return { fetchedAt: latestSuccessfulRun?.timestamp || null, opportunities };
        },
        getMenu: async () => {
          try {
            lastGoodMobileMenu = await getRemoteMenu();
            return { ...lastGoodMobileMenu, status: 'success' };
          } catch {
            return {
              menu: lastGoodMobileMenu?.menu || messMenu,
              fetchedAt: lastGoodMobileMenu?.fetchedAt || null,
              status: 'failed',
            };
          }
        },
        getSyncState: () => syncState,
      });
      staged = projectSnapshot(input);
      writeStage = true;
    }
    if (writeStage) {
      fs.mkdirSync(mobileStageDir, { recursive: true, mode: 0o700 });
      const temporary = `${mobileStageFile}.${process.pid}.tmp`;
      fs.writeFileSync(temporary, JSON.stringify(staged), { mode: 0o600 });
      fs.renameSync(temporary, mobileStageFile);
    }
    const result = await publishProjectedSnapshot(staged);
    mobilePublishState = {
      status: result.status,
      attemptedAt: mobilePublishState.attemptedAt,
      revision: result.revision || mobilePublishState.revision,
      reason: result.reason || null,
    };
    if (result.status === 'published') saveMobilePublishReceipt(mobilePublishState);
    return result;
  } catch (error) {
    mobilePublishState = { ...mobilePublishState, status: 'failed', reason: 'collection_failed' };
    throw error;
  }
}

app.get('/api/mobile-publish/status', (_req, res) =>
  res.set('Cache-Control', 'no-store').json(mobilePublishState),
);

app.post('/api/sync', requireLocalOrigin, (_req, res) => {
  if (connectors.getSyncState().running)
    return res.status(409).json({ success: false, error: 'Sync all is already running' });
  mobilePublishState = { ...mobilePublishState, status: 'waiting_for_sync', reason: null };
  res.status(202).json({ success: true, message: 'Sync all started' });
  connectors
    .syncAll({
      radar: () => connectors.syncRadar({ harvest: () => startRadarHarvest('sync_all') }),
    })
    .then(async (syncState) => {
      try {
        const result = await publishCurrentMobileSnapshot(syncState);
        if (result.status === 'failed')
          console.error(`[Mobile publish] Automatic publish failed (${result.reason}).`);
      } catch {
        console.error('[Mobile publish] Automatic publish failed; details hidden.');
      }
    })
    .catch(() => {
      mobilePublishState = { ...mobilePublishState, status: 'failed', reason: 'sync_failed' };
      console.error('[Sync all] Sync failed; private diagnostics hidden.');
    });
});

app.post('/api/mobile-publish', requireLocalOrigin, async (_req, res) => {
  const syncState = connectors.getSyncState();
  if (syncState.running)
    return res.status(409).json({ success: false, error: 'Sync all is still running' });
  if (mobilePublishState.status === 'publishing')
    return res.status(409).json({ success: false, error: 'Mobile publication is already running' });
  if (!syncState.finishedAt && !fs.existsSync(mobileStageFile))
    return res
      .status(409)
      .json({ success: false, error: 'Complete a laptop Update all run first' });
  try {
    const result = await publishCurrentMobileSnapshot(syncState);
    const status = result.status === 'failed' ? 502 : 200;
    return res.status(status).json({
      success: result.status === 'published',
      status: result.status,
      ...(result.reason ? { reason: result.reason } : {}),
      ...(result.httpStatus ? { httpStatus: result.httpStatus } : {}),
      ...(result.revision ? { revision: result.revision } : {}),
    });
  } catch {
    console.error('[Mobile publish] Manual publish failed; details hidden.');
    return res.status(502).json({
      success: false,
      status: 'failed',
      error: 'Mobile snapshot collection failed.',
    });
  }
});

function getAcademicSnapshot() {
  const readLocal = (name) => {
    try {
      return JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'newton', name), 'utf8'));
    } catch {
      return null;
    }
  };
  const data = readLocal('data.json');
  const mailData = readLocal('emails.json');
  const savedAcademicSources = connectors.getAcademicSources();
  const sourceTimestamps = Object.fromEntries(
    Object.entries(savedAcademicSources).map(([name, source]) => [
      name,
      source?.updatedAt ? { updatedAt: source.updatedAt } : null,
    ]),
  );
  const mailUpdatedAt =
    typeof mailData?.updatedAt === 'string' && Number.isFinite(Date.parse(mailData.updatedAt))
      ? new Date(mailData.updatedAt).toISOString()
      : null;
  if (!data)
    return {
      success: true,
      available: false,
      importedAt: null,
      mailUpdatedAt,
      sources: sourceTimestamps,
      attendance: null,
      subjects: [],
      contests: [],
      schedule: [],
      deadlines: [],
      emails: [],
    };
  const rawImportedAt = data.updated_at || mailData?.updatedAt || null;
  const importedMatch =
    typeof rawImportedAt === 'string' &&
    rawImportedAt.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4}),?\s*(\d{1,2}):(\d{2}):(\d{2})\s*(am|pm)$/i);
  let importedAt = rawImportedAt;
  if (importedMatch) {
    let hour = Number(importedMatch[4]) % 12;
    if (importedMatch[7].toLowerCase() === 'pm') hour += 12;
    importedAt = new Date(
      Number(importedMatch[3]),
      Number(importedMatch[2]) - 1,
      Number(importedMatch[1]),
      hour,
      Number(importedMatch[5]),
      Number(importedMatch[6]),
    ).toISOString();
  } else if (rawImportedAt && Number.isNaN(Date.parse(rawImportedAt))) importedAt = null;
  const subjectRows = Object.entries(data.nst?.subjects || {}).map(([name, row]) => ({
    name,
    group: 'NST Core',
    code: row.short_name || '',
    attended: Number(row.attended) || 0,
    total: Number(row.total) || 0,
    absent: Number(row.absent) || 0,
    percent: Number(row.percentage) || 0,
    canMiss: Number(row.canMiss) || 0,
    needAttend: Number(row.needAttend) || 0,
  }));
  for (const row of data.rufp?.courses || [])
    subjectRows.push({
      name: row.courseName || 'RUFP course',
      group: 'RUF Foundation',
      code: row.courseCode || '',
      attended: Number(row.attendedLectures) || 0,
      total: Number(row.totalLectures) || 0,
      absent: Number(row.absentLectures) || 0,
      percent: Number(row.attendancePercentage) || 0,
      canMiss: Number(row.canMiss) || 0,
      needAttend: Number(row.needAttend) || 0,
    });
  const academicSources = savedAcademicSources;
  const totals = {
    nst: { attended: Number(data.nst?.attended) || 0, total: Number(data.nst?.total) || 0 },
    rufp: { attended: Number(data.rufp?.attended) || 0, total: Number(data.rufp?.total) || 0 },
  };
  for (const [key, group] of [
    ['newton', 'NST Core'],
    ['rishiverse', 'RUF Foundation'],
  ]) {
    const source = academicSources[key];
    if (!source) continue;
    const validItems = source.items.filter(
      (item) => item?.name && Number.isFinite(Number(item.conducted)),
    );
    if (validItems.length !== source.items.length) continue;
    for (let i = subjectRows.length - 1; i >= 0; i--)
      if (subjectRows[i].group === group) subjectRows.splice(i, 1);
    const aggregate = { attended: 0, total: 0 };
    for (const item of validItems) {
      const attended = Math.max(0, Number(item.attended) || 0);
      const total = Math.max(0, Number(item.conducted) || 0);
      aggregate.attended += attended;
      aggregate.total += total;
      subjectRows.push({
        name: String(item.name).slice(0, 100),
        group,
        code: '',
        attended,
        total,
        absent: Math.max(0, total - attended),
        percent: total ? Math.round((attended / total) * 1000) / 10 : 0,
        canMiss: 0,
        needAttend: 0,
      });
    }
    totals[key === 'newton' ? 'nst' : 'rufp'] = aggregate;
  }
  const attendanceSummary = (row) => ({
    attended: row.attended,
    total: row.total,
    percent: row.total ? Math.round((row.attended / row.total) * 1000) / 10 : 0,
    canMiss: 0,
    needAttend: 0,
  });
  const liveImportedAt = [academicSources.newton?.updatedAt, academicSources.rishiverse?.updatedAt]
    .filter(Boolean)
    .sort()
    .at(-1);
  const mailItems = (mailData?.items || data.emails?.items || []).slice(0, 12).map((item) => ({
    sender: String(item.sender || 'Academic notice').slice(0, 100),
    subject: String(item.subject || item.aiTitle || 'No subject').slice(0, 180),
    snippet: String(item.summary || item.snippet || '')
      .replace(/\\s+/g, ' ')
      .slice(0, 220),
    date: String(item.dateOnly || item.date || '').slice(0, 48),
    category: String(item.category || 'Academic').slice(0, 48),
    priority: String(item.priority || item.urgency || '').slice(0, 24),
    actionItem: String(item.actionItem || '')
      .replace(/\\s+/g, ' ')
      .slice(0, 180),
  }));
  return {
    success: true,
    available: true,
    importedAt: liveImportedAt || importedAt,
    mailUpdatedAt,
    sources: sourceTimestamps,
    semester: String(data.user?.course || '').match(/semester\s+\d+/i)?.[0] || null,
    attendance: {
      combined: liveImportedAt
        ? attendanceSummary({
            attended: totals.nst.attended + totals.rufp.attended,
            total: totals.nst.total + totals.rufp.total,
          })
        : {
            attended: Number(data.combined_attendance?.attended) || 0,
            total: Number(data.combined_attendance?.total) || 0,
            percent: Number(data.combined_attendance?.percentage) || 0,
            canMiss: Number(data.combined_attendance?.can_miss) || 0,
            needAttend: Number(data.combined_attendance?.need_attend) || 0,
          },
      nst: academicSources.newton
        ? attendanceSummary(totals.nst)
        : {
            attended: Number(data.nst?.attended) || 0,
            total: Number(data.nst?.total) || 0,
            percent: Number(data.nst?.percentage) || 0,
            canMiss: Number(data.nst?.can_miss) || 0,
            needAttend: Number(data.nst?.need_attend) || 0,
          },
      rufp: academicSources.rishiverse
        ? attendanceSummary(totals.rufp)
        : {
            attended: Number(data.rufp?.attended) || 0,
            total: Number(data.rufp?.total) || 0,
            percent: Number(data.rufp?.percentage) || 0,
            canMiss: Number(data.rufp?.canMiss) || 0,
            needAttend: Number(data.rufp?.needAttend) || 0,
          },
      xp: Number(data.user?.total_xp) || 0,
    },
    subjects: subjectRows,
    contests: (data.contests || []).slice(0, 20).map((item) => ({
      title: String(item.title || 'Contest').slice(0, 120),
      subject: String(item.subject || '').slice(0, 60),
      start: String(item.start || '').slice(0, 48),
      end: String(item.end || '').slice(0, 48),
      earned: Number(item.earned_xp) || 0,
      totalXp: Number(item.total_xp) || 0,
      percent: Number(item.percentage) || 0,
    })),
    schedule: (data.schedule || []).slice(0, 14).map((day) => ({
      date: String(day.date || '').slice(0, 48),
      badge: String(day.badge || '').slice(0, 60),
      items: (day.items || []).slice(0, 8).map((x) =>
        typeof x === 'string'
          ? {
              time: '',
              subject: '',
              type: '',
              title: x.slice(0, 140),
              status: 'Scheduled',
              location: '',
            }
          : {
              time: String(x.time || '').slice(0, 48),
              subject: String(x.subject || '').slice(0, 100),
              type: String(x.type || '').slice(0, 48),
              title: String(x.title || x.name || 'Class').slice(0, 140),
              status: String(x.status || 'Scheduled').slice(0, 48),
              location: String(x.location || '').slice(0, 100),
            },
      ),
    })),
    deadlines: (data.deadlines || []).slice(0, 20).map((item) => ({
      title: String(item.title || 'Deadline').slice(0, 140),
      subject: String(item.subject || '').slice(0, 60),
      due: String(item.due || '').slice(0, 48),
      type: String(item.type || '').slice(0, 48),
      status: String(item.status || '').slice(0, 48),
      urgent: !!item.urgent,
    })),
    emails: mailItems,
  };
}

app.get('/api/academic', (_req, res) => {
  const {
    mailUpdatedAt: _mailUpdatedAt,
    sources: _sources,
    ...publicAcademic
  } = getAcademicSnapshot();
  res.set('Cache-Control', 'no-store').json(publicAcademic);
});

// The RU Print menu is embedded in its deployed public app bundle, so fetch and
// validate that live source server-side instead of relying on a copied menu.
app.get('/api/mess-menu', async (_req, res) => {
  try {
    const data = await getRemoteMenu();
    res
      .set('Cache-Control', 'no-store')
      .json({ success: true, ...data, mealTimes12h, sourceUrl: RU_PRINT_ORIGIN });
  } catch (error) {
    res.status(502).set('Cache-Control', 'no-store').json({
      success: false,
      error: 'Could not fetch the live RU Print menu',
      details: error.message,
      sourceUrl: RU_PRINT_ORIGIN,
    });
  }
});

// --- SETTINGS ENDPOINTS ---
app.get('/api/settings', (req, res) => {
  try {
    const settings = storage.getSettings();
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch settings', details: err.message });
  }
});

app.patch('/api/settings', (req, res) => {
  try {
    const updated = storage.updateSettings(req.body);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update settings', details: err.message });
  }
});

// --- DISCIPLINE LOGS ENDPOINTS ---
app.get('/api/discipline-logs', (req, res) => {
  try {
    const logs = storage.getDisciplineLogs();
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch discipline logs', details: err.message });
  }
});

app.post('/api/discipline-logs', (req, res) => {
  try {
    const log = storage.recordDisciplineLog(req.body);
    res.status(201).json(log);
  } catch (err) {
    res.status(500).json({ error: 'Failed to record discipline log', details: err.message });
  }
});

// --- ACADEMIC ATTENDANCE ENDPOINTS (NewtonSchool & Rishiverse LMS) ---
app.get('/api/attendance', (req, res) => {
  try {
    const attendance = storage.getAttendanceData();
    res.json(attendance);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch attendance data', details: err.message });
  }
});

app.post('/api/attendance/mark', (req, res) => {
  try {
    const result = storage.markAcademicSession(req.body);
    res.status(201).json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to mark attendance session', details: err.message });
  }
});

app.post('/api/attendance/toggle-session', (req, res) => {
  try {
    const result = storage.toggleSubjectSession(req.body);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to toggle session', details: err.message });
  }
});

// --- HABITS ENDPOINTS ---
app.get('/api/habits', (req, res) => {
  try {
    const habits = storage.getHabits();
    res.json(habits);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch habits', details: err.message });
  }
});

app.get('/api/habits/:id', (req, res) => {
  try {
    const habits = storage.getHabits();
    const habit = habits.find((h) => h.id === Number(req.params.id));
    if (!habit) {
      return res.status(404).json({ error: 'Habit not found' });
    }
    res.json(habit);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch habit', details: err.message });
  }
});

app.post('/api/habits', (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Habit name is required' });
    }
    const created = storage.createHabit(req.body);
    res.status(201).json(created);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create habit', details: err.message });
  }
});

app.put('/api/habits/:id', (req, res) => {
  try {
    const updated = storage.updateHabit(req.params.id, req.body);
    if (!updated) {
      return res.status(404).json({ error: 'Habit not found' });
    }
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update habit', details: err.message });
  }
});

app.patch('/api/habits/:id/toggle', (req, res) => {
  try {
    const { isEnabled } = req.body;
    const toggled = storage.toggleHabit(req.params.id, isEnabled);
    if (!toggled) {
      return res.status(404).json({ error: 'Habit not found' });
    }
    res.json(toggled);
  } catch (err) {
    res.status(500).json({ error: 'Failed to toggle habit', details: err.message });
  }
});

app.delete('/api/habits/:id', (req, res) => {
  try {
    const success = storage.deleteHabit(req.params.id);
    if (!success) {
      return res.status(404).json({ error: 'Habit not found' });
    }
    res.json({ success: true, message: 'Habit deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete habit', details: err.message });
  }
});

// --- SEED TIMETABLE ENDPOINT ---
app.post('/api/seed', (req, res) => {
  try {
    const seeded = storage.seedDatabase();
    res.json({ success: true, count: seeded.length, habits: seeded });
  } catch (err) {
    res.status(500).json({ error: 'Failed to seed timetable', details: err.message });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Fallback to index.html for SPA routing
app.get('*', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

// Start listening
app.listen(PORT, '127.0.0.1', () => {
  console.log(`🚀 Uthjabsdk Web & API Server running at http://localhost:${PORT}`);
});
