import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = process.env.RADAR_DATA_DIR || path.join(__dirname, '..', '..', 'data');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'radar.sqlite');
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS opportunities (
    id TEXT PRIMARY KEY,
    platform TEXT NOT NULL,
    title TEXT NOT NULL,
    organizer TEXT,
    event_url TEXT NOT NULL,
    event_type TEXT DEFAULT 'hackathon',
    mode TEXT DEFAULT 'online',
    location TEXT DEFAULT '',
    registration_deadline TEXT,
    start_date TEXT,
    end_date TEXT,
    prize_pool TEXT DEFAULT '',
    skills_required TEXT DEFAULT '[]',
    skill_match_score REAL DEFAULT 0.0,
    tier_rating TEXT DEFAULT 'Tier B',
    leaves_required INTEGER DEFAULT 0,
    attendance_safe INTEGER DEFAULT 1,
    is_new INTEGER DEFAULT 1,
    status TEXT DEFAULT 'active',
    raw_data TEXT DEFAULT '{}',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS scraping_runs (
    id TEXT PRIMARY KEY,
    timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
    trigger_type TEXT DEFAULT 'cron_12h',
    total_found INTEGER DEFAULT 0,
    new_found INTEGER DEFAULT 0,
    duration_ms INTEGER DEFAULT 0,
    status TEXT DEFAULT 'success'
  );

  CREATE INDEX IF NOT EXISTS idx_opportunities_tier ON opportunities(tier_rating);
  CREATE INDEX IF NOT EXISTS idx_opportunities_deadline ON opportunities(registration_deadline);
  CREATE INDEX IF NOT EXISTS idx_opportunities_platform ON opportunities(platform);
`);

db.exec(
  'CREATE TABLE IF NOT EXISTS pipeline_lock (id INTEGER PRIMARY KEY, owner TEXT NOT NULL, expires_at INTEGER NOT NULL)',
);
db.exec(`CREATE TABLE IF NOT EXISTS agent_research_runs (
  id TEXT PRIMARY KEY, timestamp TEXT NOT NULL, status TEXT NOT NULL,
  researched_count INTEGER NOT NULL DEFAULT 0, duration_ms INTEGER NOT NULL DEFAULT 0,
  summary TEXT DEFAULT '', error TEXT DEFAULT ''
)`);
if (
  !db
    .prepare('PRAGMA table_info(scraping_runs)')
    .all()
    .some((c) => c.name === 'sources')
) {
  db.exec("ALTER TABLE scraping_runs ADD COLUMN sources TEXT DEFAULT '[]'");
}

export const database = {
  db,

  upsertOpportunity(item) {
    const existing = db
      .prepare('SELECT id, is_new, raw_data FROM opportunities WHERE id = ?')
      .get(item.id);
    const now = new Date().toISOString();

    if (existing) {
      const previousRawData = JSON.parse(existing.raw_data || '{}');
      const rawData = { ...previousRawData, ...(item.raw_data || {}) };
      if (!item.raw_data?.aiResearch && previousRawData.aiResearch)
        rawData.aiResearch = previousRawData.aiResearch;
      const stmt = db.prepare(`
        UPDATE opportunities SET
          title = ?,
          organizer = ?,
          event_url = ?,
          event_type = ?,
          mode = ?,
          location = ?,
          registration_deadline = ?,
          start_date = ?,
          end_date = ?,
          prize_pool = ?,
          skills_required = ?,
          skill_match_score = ?,
          tier_rating = ?,
          leaves_required = ?,
          attendance_safe = ?,
          raw_data = ?,
          updated_at = ?
        WHERE id = ?
      `);
      stmt.run(
        item.title,
        item.organizer || '',
        item.event_url,
        item.event_type || 'hackathon',
        item.mode || 'online',
        item.location || '',
        item.registration_deadline || null,
        item.start_date || null,
        item.end_date || null,
        item.prize_pool || '',
        JSON.stringify(item.skills_required || []),
        item.skill_match_score || 0.0,
        item.tier_rating || 'Tier B',
        item.leaves_required ?? null,
        item.attendance_safe == null ? null : item.attendance_safe ? 1 : 0,
        JSON.stringify(rawData),
        now,
        item.id,
      );
      return { id: item.id, isNew: false };
    } else {
      const stmt = db.prepare(`
        INSERT INTO opportunities (
          id, platform, title, organizer, event_url, event_type, mode, location,
          registration_deadline, start_date, end_date, prize_pool, skills_required,
          skill_match_score, tier_rating, leaves_required, attendance_safe, is_new,
          raw_data, created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?, 1,
          ?, ?, ?
        )
      `);
      stmt.run(
        item.id,
        item.platform,
        item.title,
        item.organizer || '',
        item.event_url,
        item.event_type || 'hackathon',
        item.mode || 'online',
        item.location || '',
        item.registration_deadline || null,
        item.start_date || null,
        item.end_date || null,
        item.prize_pool || '',
        JSON.stringify(item.skills_required || []),
        item.skill_match_score || 0.0,
        item.tier_rating || 'Tier B',
        item.leaves_required ?? null,
        item.attendance_safe == null ? null : item.attendance_safe ? 1 : 0,
        JSON.stringify(item.raw_data || {}),
        now,
        now,
      );
      return { id: item.id, isNew: true };
    }
  },

  isPipelineRunning() {
    return Boolean(db.prepare('SELECT 1 FROM pipeline_lock WHERE expires_at > ?').get(Date.now()));
  },

  refreshStatus(id, status = 'active') {
    db.prepare('UPDATE opportunities SET status = ? WHERE id = ?').run(status, id);
  },

  getAllOpportunities(filters = {}) {
    db.prepare(
      "UPDATE opportunities SET status = 'expired' WHERE status = 'active' AND registration_deadline IS NOT NULL AND julianday(registration_deadline) < julianday('now')",
    ).run();
    let query = 'SELECT * FROM opportunities WHERE 1=1';
    const params = [];

    if (filters.status) {
      query += ' AND status = ?';
      params.push(filters.status);
    }
    if (filters.tier) {
      query += ' AND tier_rating = ?';
      params.push(filters.tier);
    }
    if (filters.mode) {
      query += ' AND mode = ?';
      params.push(filters.mode);
    }
    if (filters.weekendOnly) {
      query += ' AND leaves_required = 0 AND attendance_safe = 1';
    }

    query +=
      " ORDER BY CASE tier_rating WHEN 'Tier S' THEN 1 WHEN 'Tier A' THEN 2 WHEN 'Tier B' THEN 3 ELSE 4 END, skill_match_score DESC, registration_deadline ASC";

    const rows = db.prepare(query).all(...params);
    return rows.map((r) => ({
      ...r,
      skills_required: JSON.parse(r.skills_required || '[]'),
      raw_data: JSON.parse(r.raw_data || '{}'),
    }));
  },

  recordRun(runData) {
    const stmt = db.prepare(`
      INSERT INTO scraping_runs (id, timestamp, trigger_type, total_found, new_found, duration_ms, status, sources)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      runData.id,
      runData.timestamp || new Date().toISOString(),
      runData.trigger_type || 'cron_12h',
      runData.total_found || 0,
      runData.new_found || 0,
      runData.duration_ms || 0,
      runData.status || 'success',
      JSON.stringify(runData.sources || []),
    );
  },

  getRecentRuns(limit = 10) {
    return db
      .prepare('SELECT * FROM scraping_runs ORDER BY timestamp DESC, rowid DESC LIMIT ?')
      .all(limit)
      .map((row) => ({ ...row, sources: JSON.parse(row.sources || '[]') }));
  },
  getResearchCandidates(limit = 4) {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return this.getAllOpportunities({ status: 'active' })
      .filter((item) => {
        const review = item.raw_data?.localReview || item.raw_data?.aiResearch;
        const checked = Date.parse(review?.reviewedAt || review?.researchedAt || '');
        return !Number.isFinite(checked) || checked < cutoff;
      })
      .sort(
        (a, b) =>
          Number(Boolean(a.raw_data?.localReview || a.raw_data?.aiResearch)) -
            Number(Boolean(b.raw_data?.localReview || b.raw_data?.aiResearch)) ||
          (a.registration_deadline || '9999').localeCompare(b.registration_deadline || '9999'),
      )
      .slice(0, Math.max(1, Math.min(4, Number(limit) || 4)))
      .map((item) => ({
        id: item.id,
        platform: item.platform,
        title: item.title,
        organizer: item.organizer,
        eventUrl: item.event_url,
        location: item.location,
        mode: item.mode,
        registrationDeadline: item.registration_deadline,
        startDate: item.start_date,
        endDate: item.end_date,
        prizePool: item.prize_pool,
        skills: item.skills_required,
        description: String(item.raw_data?.description || '').slice(0, 2400),
        previousResearch:
          item.raw_data?.localReview || item.raw_data?.aiResearch
            ? {
                researchedAt:
                  item.raw_data.localReview?.reviewedAt || item.raw_data.aiResearch?.researchedAt,
                tier: (item.raw_data.localReview || item.raw_data.aiResearch).tier,
                difficulty: (item.raw_data.localReview || item.raw_data.aiResearch).difficulty,
              }
            : null,
      }));
  },
  saveResearchResult(eventId, result) {
    const row = db
      .prepare('SELECT raw_data FROM opportunities WHERE id = ? AND status = ?')
      .get(eventId, 'active');
    if (!row) throw new Error('Active event was not found');
    const raw = JSON.parse(row.raw_data || '{}');
    const reviewedAt = new Date().toISOString();
    raw.localReview = { ...result, reviewedAt, engine: 'Local rules' };
    db.prepare('UPDATE opportunities SET raw_data = ?, updated_at = ? WHERE id = ?').run(
      JSON.stringify(raw),
      reviewedAt,
      eventId,
    );
    return { id: eventId, saved: true, reviewedAt };
  },
  recordAgentResearchRun(run) {
    db.prepare(
      `INSERT INTO agent_research_runs(id,timestamp,status,researched_count,duration_ms,summary,error)
      VALUES(?,?,?,?,?,?,?)`,
    ).run(
      run.id,
      run.timestamp,
      run.status,
      run.researchedCount || 0,
      run.durationMs || 0,
      String(run.summary || '').slice(0, 500),
      String(run.error || '').slice(0, 700),
    );
  },
  getRecentAgentResearchRuns(limit = 5) {
    return db
      .prepare('SELECT * FROM agent_research_runs ORDER BY timestamp DESC LIMIT ?')
      .all(Math.max(1, Math.min(10, limit)));
  },
  getResearchResults(limit = 20) {
    return this.getAllOpportunities({ status: 'active' })
      .filter((item) => item.raw_data?.localReview || item.raw_data?.aiResearch)
      .sort((a, b) =>
        String(
          b.raw_data.localReview?.reviewedAt || b.raw_data.aiResearch?.researchedAt,
        ).localeCompare(
          String(a.raw_data.localReview?.reviewedAt || a.raw_data.aiResearch?.researchedAt),
        ),
      )
      .slice(0, Math.max(1, Math.min(30, limit)))
      .map((item) => ({
        id: item.id,
        title: item.title,
        organizer: item.organizer,
        event_url: item.event_url,
        aiResearch: item.raw_data.localReview || item.raw_data.aiResearch,
      }));
  },
};
