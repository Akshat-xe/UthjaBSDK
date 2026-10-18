'use strict';

const assert = require('node:assert/strict');

(async () => {
  const { parseUnstopPage } = await import('../../convex/radarUnstop.ts');
  const now = Date.parse('2026-10-19T12:00:00Z');
  const page = { data: { data: [
    {
      id: 123, title: 'A public challenge', region: 'online',
      seo_url: 'https://evil.example/steal',
      organisation: { name: 'Campus' },
      regnRequirements: { end_regn_dt: '2026-10-25T00:00:00Z', min_team_size: 2,
        max_team_size: 4, reg_status: 'STARTED' },
      details: '<p>Build an app</p>',
    },
    { id: 124, title: 'Expired', regnRequirements: { end_regn_dt: '2026-10-01T00:00:00Z' } },
    { id: 125, title: 'Closed', regnRequirements: { reg_status: 'FINISHED' } },
  ] } };
  const parsed = parseUnstopPage(page, now);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].eventUrl, 'https://unstop.com/hackathons/123');
  assert.equal(parsed[0].difficulty, 'unverified');
  assert.equal(parsed[0].tier, 'E');
  assert.equal(parsed[0].areaScope, 'remote');
  assert.equal(parsed[0].teamSize, '2–4 people');
  assert.equal(parsed[0].description, 'Build an app');
  assert.throws(() => parseUnstopPage({ data: { data: null } }), /schema changed/);
  console.log('Radar cloud parser tests passed.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
