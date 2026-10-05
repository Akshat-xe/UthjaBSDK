const assert = require('node:assert/strict');
const express = require('express');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
(async () => {
  const token = crypto.randomBytes(32).toString('hex');
  const directory = path.join(
    __dirname,
    '../../backend/data/workspaces',
    crypto.createHash('sha256').update(token).digest('hex'),
  );
  const app = express();
  app.use(express.json({ limit: '8mb' }));
  require('../../backend/features/backup/trackerBackup')(app);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}/api/tracker-backup`;
  const headers = { 'Content-Type': 'application/json', 'X-Workspace-Token': token };
  try {
    assert.equal((await fetch(url)).status, 401);
    assert.equal((await fetch(url, { method: 'PUT', headers, body: '{}' })).status, 400);
    const records = {
      days: {
        '2026-09-11': {
          done: { india: { status: 'done' } },
          water: 250,
          attendance: { india: 'present' },
          scores: {},
          plannedCount: 12,
        },
      },
      events: [{ date: '2026-09-11', type: 'done', taskId: 'india' }],
      notes: [],
      wardrobe: [],
    };
    assert.equal(
      (
        await fetch(url, {
          method: 'PUT',
          headers,
          body: JSON.stringify({ version: 1, settings: {}, records }),
        })
      ).status,
      200,
    );
    const saved = await (await fetch(url, { headers })).json();
    assert.deepEqual(saved.records, records);
    const report = JSON.parse(
      fs.readFileSync(path.join(directory, 'reports/2026-09-11.json'), 'utf8'),
    );
    assert.equal(report.completed, 1);
    assert.equal(report.waterMl, 250);
    assert.equal(report.scheduled, 12);
    const different = { 'X-Workspace-Token': crypto.randomBytes(32).toString('hex') };
    assert.equal((await fetch(url, { headers: different })).status, 404);
    console.log(
      'PASS: private backup validation, atomic save/read, device isolation and backend report generation.',
    );
  } finally {
    server.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
