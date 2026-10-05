// Private, per-device backup for the local web tracker. The opaque browser token
// is hashed before becoming a filename and is never written to a log.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ROOT = path.join(__dirname, '..', '..', 'data', 'workspaces');
function atomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(value, null, 2), { mode: 0o600 });
  fs.renameSync(temp, file);
}
function campusTime() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date())
      .map((p) => [p.type, p.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minute: +parts.hour * 60 + +parts.minute,
  };
}
function reports(directory, snapshot) {
  const current = campusTime();
  for (const [date, day] of Object.entries(snapshot.records.days)) {
    if (
      !day ||
      typeof day !== 'object' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      date > current.date ||
      (date === current.date && current.minute < 1390)
    )
      continue;
    const file = path.join(directory, 'reports', `${date}.json`);
    if (fs.existsSync(file)) {
      try {
        if (JSON.parse(fs.readFileSync(file, 'utf8')).sourceSavedAt === snapshot.savedAt) continue;
      } catch {}
    }
    atomic(file, {
      date,
      sourceSavedAt: snapshot.savedAt,
      generatedAt: new Date().toISOString(),
      source: 'Last synced device records',
      completed: Object.keys(day.done || {}).length,
      scheduled: day.plannedCount || null,
      waterMl: day.water || 0,
      attendance: day.attendance || {},
      scores: day.scores || {},
      records: day.done || {},
      events: snapshot.records.events.filter((e) => e && e.date === date),
    });
  }
}
module.exports = function registerTrackerBackup(app) {
  function location(req, res, next) {
    const token = req.get('X-Workspace-Token');
    if (!token || !/^[a-f0-9]{64}$/.test(token))
      return res.status(401).json({ error: 'Device token required' });
    req.workspaceDirectory = path.join(
      ROOT,
      crypto.createHash('sha256').update(token).digest('hex'),
    );
    next();
  }
  app.get('/api/tracker-backup', location, (req, res) => {
    const file = path.join(req.workspaceDirectory, 'snapshot.json');
    res.set('Cache-Control', 'no-store');
    if (!fs.existsSync(file)) return res.status(404).json({ error: 'No backup yet' });
    try {
      res.json(JSON.parse(fs.readFileSync(file, 'utf8')));
    } catch {
      res.status(500).json({ error: 'Backup unavailable' });
    }
  });
  app.put('/api/tracker-backup', location, (req, res) => {
    const data = req.body;
    if (
      !data ||
      data.version !== 1 ||
      !data.records ||
      !data.records.days ||
      typeof data.records.days !== 'object' ||
      Array.isArray(data.records.days) ||
      !Array.isArray(data.records.events) ||
      !Array.isArray(data.records.notes) ||
      !Array.isArray(data.records.wardrobe) ||
      typeof data.settings !== 'object'
    ) {
      return res.status(400).json({ error: 'Invalid tracker snapshot' });
    }
    try {
      const snapshot = {
        version: 1,
        savedAt: new Date().toISOString(),
        settings: data.settings,
        records: data.records,
      };
      atomic(path.join(req.workspaceDirectory, 'snapshot.json'), snapshot);
      reports(req.workspaceDirectory, snapshot);
      res.json({ savedAt: snapshot.savedAt });
    } catch {
      res.status(500).json({ error: 'Backup could not be saved' });
    }
  });
  const timer = setInterval(() => {
    if (!fs.existsSync(ROOT)) return;
    for (const name of fs.readdirSync(ROOT)) {
      if (!/^[a-f0-9]{64}$/.test(name)) continue;
      try {
        const directory = path.join(ROOT, name);
        reports(
          directory,
          JSON.parse(fs.readFileSync(path.join(directory, 'snapshot.json'), 'utf8')),
        );
      } catch {
        /* One damaged backup must not block other devices. */
      }
    }
  }, 60000);
  timer.unref();
};
