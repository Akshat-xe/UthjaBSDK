import { connectorStatus } from './scrapers/apify.js';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { database } from './db/database.js';
import { runScraperPipeline } from './engine/runner.js';
import { attendanceEngine } from './attendance/attendanceEngine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UI_DIR = path.join(__dirname, 'ui');
const PORT = Number(process.env.PORT || 3030);

let isScraping = false;

const server = http.createServer(async (req, res) => {
  const hosts = new Set([`localhost:${PORT}`, `127.0.0.1:${PORT}`]);
  if (
    !hosts.has(req.headers.host) ||
    (req.headers.origin && !hosts.has(req.headers.origin.replace(/^http:\/\//, '')))
  ) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ success: false, message: 'Local same-origin access only' }));
  }
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  );

  if (url.pathname === '/api/sources' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(
      JSON.stringify({
        engine: 'Crawlee 3.18.1 (local, open source)',
        direct: ['unstop', 'devpost'],
        apify: connectorStatus(),
      }),
    );
  }

  // --- API: Get Opportunities ---
  if (url.pathname === '/api/opportunities' && req.method === 'GET') {
    const tier = url.searchParams.get('tier') || undefined;
    const weekendOnly = url.searchParams.get('weekend') === 'true';
    const opportunities = database.getAllOpportunities({ tier, weekendOnly, status: 'active' });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ success: true, opportunities }));
  }

  // --- API: Get Stats & Attendance ---
  if (url.pathname === '/api/stats' && req.method === 'GET') {
    const all = database.getAllOpportunities({ status: 'active' });
    const attendance = attendanceEngine.getAttendanceSnapshot();
    const recentRuns = database.getRecentRuns(3);

    const stats = {
      total: all.length,
      matched: all.filter((o) => o.skill_match_score >= 0.2 && !o.raw_data?.mlHeavy).length,
      tierS: all.filter((o) => o.tier_rating === 'Tier S').length,
      tierA: all.filter((o) => o.tier_rating === 'Tier A').length,
      weekendFriendly: all.filter((o) => o.leaves_required === 0 && o.attendance_safe === 1).length,
      attendance: {
        percent: attendance?.overallAttendancePercent ?? null,
        attended: attendance?.attendedCount ?? null,
        total: attendance?.scheduledCount ?? null,
        verified: false,
        note: 'Saved legacy snapshot; not verified against current tracker records',
      },
      lastRun: recentRuns[0] || null,
      isScraping: isScraping || database.isPipelineRunning(),
    };

    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ success: true, stats }));
  }

  // --- API: Trigger Scraper Manually ---
  if (url.pathname === '/api/scrape' && req.method === 'POST') {
    if (isScraping || database.isPipelineRunning()) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, message: 'Scraper already running' }));
    }

    isScraping = true;
    res.writeHead(202, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, message: 'Scraping started' }));

    try {
      await runScraperPipeline('manual_ui');
    } catch (err) {
      console.error('Manual scrape failed:', err);
    } finally {
      isScraping = false;
    }
    return;
  }

  // --- Static UI: Serve index.html ---
  if (url.pathname === '/' || url.pathname === '/index.html') {
    const htmlPath = path.join(UI_DIR, 'index.html');
    if (fs.existsSync(htmlPath)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(fs.readFileSync(htmlPath));
    }
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[Opportunity Radar] Dashboard running live at http://localhost:${PORT}`);
});
