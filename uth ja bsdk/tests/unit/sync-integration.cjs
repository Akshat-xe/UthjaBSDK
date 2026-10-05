const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const testData = fs.mkdtempSync(path.join(os.tmpdir(), 'uth-ja-sync-test-'));
process.env.UTHJA_SYNC_DATA_DIR = testData;
process.env.RADAR_DATA_DIR = path.join(testData, 'radar');

(async () => {
  const connectors = require('../../backend/features/sync/connectors');
  assert.equal(connectors.MAX_ITEMS, 8);
  assert.equal(connectors.MAX_SNIPPET, 180);
  const previousToken = process.env.NEWTON_AUTH_TOKEN;
  process.env.NEWTON_AUTH_TOKEN = 'unit-test-token';
  assert.equal(await connectors.getNewtonToken(), 'unit-test-token');
  if (previousToken === undefined) delete process.env.NEWTON_AUTH_TOKEN;
  else process.env.NEWTON_AUTH_TOKEN = previousToken;
  const originalFetch = global.fetch;
  const originalHash = process.env.NEWTON_COURSE_HASH;
  const originalNewtonToken = process.env.NEWTON_AUTH_TOKEN;
  const originalRufpUrl = process.env.RISHIVERSE_ATTENDANCE_URL;
  const originalRufpToken = process.env.RISHIVERSE_AUTH_TOKEN;
  try {
    process.env.NEWTON_COURSE_HASH = 'test-course';
    process.env.NEWTON_AUTH_TOKEN = 'unit-test-token';
    process.env.RISHIVERSE_ATTENDANCE_URL = 'https://example.test/attendance';
    process.env.RISHIVERSE_AUTH_TOKEN = 'unit-test-token';
    global.fetch = async () => ({ ok: true, json: async () => ({ unexpected: [] }) });
    await assert.rejects(connectors.syncNewton(), /unrecognized lecture response/);
    await assert.rejects(connectors.syncRishiverse(), /unrecognized course response/);
    global.fetch = async (url) => ({
      ok: true,
      json: async () =>
        String(url).includes('newtonschool')
          ? { results: [{ course: { title: 'Systems' }, attended: true }] }
          : {
              courses: [
                {
                  courseName: 'Foundation',
                  attendedLectures: 0,
                  totalLectures: 2,
                  attendancePercentage: 0,
                },
              ],
            },
    });
    const academic = await connectors.syncAll({
      newton: connectors.syncNewton,
      rishiverse: connectors.syncRishiverse,
      gmail: async () => ({ items: [] }),
    });
    assert.equal(academic.sources.newton.status, 'success');
    assert.equal(academic.sources.rishiverse.items[0].attended, 0);
    assert.equal(connectors.getAcademicSources().newton.items[0].name, 'Systems');
    assert.equal(connectors.getAcademicSources().rishiverse.items[0].conducted, 2);
  } finally {
    global.fetch = originalFetch;
    for (const [key, value] of [
      ['NEWTON_COURSE_HASH', originalHash],
      ['NEWTON_AUTH_TOKEN', originalNewtonToken],
      ['RISHIVERSE_ATTENDANCE_URL', originalRufpUrl],
      ['RISHIVERSE_AUTH_TOKEN', originalRufpToken],
    ]) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
  assert.deepEqual(connectors.copilotArgs('bounded prompt'), [
    '--prompt',
    'bounded prompt',
    '--silent',
    '--output-format',
    'json',
    '--disable-builtin-mcps',
    '--available-tools',
    'view,grep,glob',
  ]);
  assert.deepEqual(
    connectors.copilotResponse(
      `${JSON.stringify({ type: 'assistant.message', data: { content: '[{"eventId":"e1","summary":"A short brief.","caveats":[]}]' } })}\n${JSON.stringify({ type: 'assistant.turn_end' })}`,
    ),
    [{ eventId: 'e1', summary: 'A short brief.', caveats: [] }],
  );
  assert.deepEqual(
    connectors.safeJson(
      'Result follows:\n```json\n[{"eventId":"e1","summary":"Use { braces } safely","caveats":[]}]\n```',
    ),
    [{ eventId: 'e1', summary: 'Use { braces } safely', caveats: [] }],
  );
  assert.deepEqual(
    connectors.normalizeRadarSummaries(
      {
        summaries: [
          { id: 'e1', summary: 'A concise event brief.', caveats: 'https://unstop.com/event/1' },
        ],
      },
      [{ id: 'e1' }],
    ),
    [{ eventId: 'e1', summary: 'A concise event brief.', caveats: ['https://unstop.com/event/1'] }],
  );
  assert.throws(() => connectors.safeJson('no structured answer'), /did not contain valid JSON/);
  assert.match(
    connectors.mailError({ code: '-1743', stderr: 'Not authorized to send Apple events to Mail' })
      .message,
    /allow the running terminal or app to control Mail/i,
  );
  assert.match(connectors.mailError({ code: 'ETIMEDOUT', stderr: '' }).message, /took too long/i);
  assert.match(
    connectors.copilotError({
      code: 1,
      message: 'Command failed: copilot --prompt private message contents',
      stderr: '',
    }).message,
    /private input and process output are hidden/i,
  );
  assert(
    !connectors
      .copilotError({
        code: 1,
        message: 'Command failed: copilot --prompt private message contents',
        stderr: '',
      })
      .message.includes('private message contents'),
  );
  assert(!connectors.copilotArgs('bounded prompt').includes('--allow-all'));
  assert(!connectors.copilotArgs('bounded prompt').includes('--yolo'));
  assert.match(connectors.mailScript(), /messageCount/);
  const separatedMail = connectors.normalizeMail([
    'Faculty\x1fSchedule\x1fLine one\nLine two\x1f28 September 2026',
  ]);
  assert.equal(separatedMail.length, 1);
  assert.equal(separatedMail[0].snippet, 'Line one Line two');
  assert.equal(separatedMail[0].date, '28 September 2026');
  assert.deepEqual(
    connectors.radarBriefInput([
      {
        id: 'event-1',
        title: 'A'.repeat(500),
        organizer: 'Org',
        eventUrl: 'https://example.com/event',
        registrationDeadline: null,
        startDate: null,
        endDate: null,
        location: 'Unknown',
        description: 'D'.repeat(900),
      },
    ]),
    [
      {
        id: 'event-1',
        title: 'A'.repeat(180),
        organizer: 'Org',
        officialUrl: 'https://example.com/event',
        dates: { registrationDeadline: null, start: null, end: null },
        location: 'Unknown',
        description: 'D'.repeat(500),
      },
    ],
  );
  const bounded = connectors.normalizeMail(
    Array.from({ length: 12 }, () => `Faculty\tUpdate\t${'x'.repeat(500)}\ttoday`),
  );
  assert.equal(bounded.length, 8);
  assert.equal(bounded[0].snippet.length, 180);
  const fakeSources = {
    newton: async () => ({}),
    rishiverse: async () => ({}),
    gmail: async () => ({ items: bounded, summary: 'Test digest' }),
  };
  const result = await connectors.syncAll(fakeSources);
  assert.equal(result.sources.gmail.status, 'success');
  assert(result.sources.gmail.items.length <= 8);
  assert(result.sources.gmail.items.every((item) => item.snippet.length <= 180));
  assert.equal(result.sources.newton.status, 'success');
  assert.equal(result.sources.rishiverse.status, 'success');
  assert.equal(connectors.getSyncState().running, false);
  const partialRadar = await connectors.syncRadar({
    harvest: async () => ({ status: 'success', totalFound: 2 }),
    getCandidates: () => [
      {
        id: 'event-1',
        title: 'Build a student app',
        organizer: 'Campus',
        eventUrl: 'https://unstop.com/event/1',
        location: 'Online',
        description: 'Build and share an app.',
      },
    ],
    analyze: async () => {
      throw new Error('Copilot returned invalid JSON');
    },
  });
  assert.equal(
    partialRadar.status,
    'partial',
    'an optional AI failure does not erase the successful event harvest',
  );
  assert.equal(partialRadar.harvest.totalFound, 2);
  assert.match(partialRadar.analysisError, /invalid JSON/);
  const { database } = await import('../../backend/opportunity-radar/src/db/database.js');
  database.upsertOpportunity({
    id: 'event-1',
    platform: 'unstop',
    title: 'Build a student app',
    event_url: 'https://unstop.com/event/1',
    location: 'Online',
    raw_data: { description: 'Build and share an app.' },
  });
  let summaryAttempts = 0;
  const recoveredRadar = await connectors.syncRadar({
    harvest: async () => ({ status: 'success', total: 1, newCount: 0 }),
    getCandidates: () => [
      {
        id: 'event-1',
        title: 'Build a student app',
        organizer: 'Campus',
        eventUrl: 'https://unstop.com/event/1',
        location: 'Online',
        description: 'Build and share an app.',
      },
    ],
    analyze: async () =>
      ++summaryAttempts === 1
        ? [{ id: 'wrong-shape' }]
        : [{ id: 'event-1', summary: 'Build a small student app.', caveats: [] }],
  });
  assert.equal(
    recoveredRadar.status,
    'success',
    'a format correction retry recovers optional summaries',
  );
  assert.equal(recoveredRadar.reviewed, 1);
  assert.equal(summaryAttempts, 2);
  const allFailed = await connectors.syncAll({
    newton: async () => {
      const error = new Error('Newton setup needed');
      error.code = 'CONFIG_REQUIRED';
      throw error;
    },
    rishiverse: async () => {
      const error = new Error('RUFP setup needed');
      error.code = 'CONFIG_REQUIRED';
      throw error;
    },
    gmail: async () => {
      throw new Error('Mail access unavailable');
    },
  });
  assert.equal(allFailed.sources.newton.status, 'setup_required');
  assert.equal(allFailed.sources.rishiverse.status, 'setup_required');
  assert.equal(allFailed.sources.gmail.status, 'failed');
  assert.equal(
    connectors.getAcademicSources().newton.items[0].name,
    'Systems',
    'a failed update preserves the last successful academic data',
  );
  const persisted = JSON.parse(fs.readFileSync(path.join(testData, 'latest.json'), 'utf8'));
  assert.equal(
    persisted.finishedAt,
    allFailed.finishedAt,
    'the most recent attempt is saved even when every connector fails',
  );
  assert.equal(persisted.sources.newton.status, 'setup_required');
  assert.equal(persisted.sources.gmail.status, 'failed');
  const restarted = JSON.parse(
    execFileSync(
      process.execPath,
      [
        '-e',
        "process.stdout.write(JSON.stringify(require('./backend/features/sync/connectors').getSyncState()))",
      ],
      {
        cwd: path.resolve(__dirname, '../..'),
        env: {
          ...process.env,
          UTHJA_SYNC_DATA_DIR: testData,
          RADAR_DATA_DIR: path.join(testData, 'radar'),
        },
      },
    ),
  );
  assert.equal(
    restarted.finishedAt,
    allFailed.finishedAt,
    'a restarted server reads the all-failed attempt instead of an older snapshot',
  );
  assert.equal(restarted.sources.gmail.status, 'failed');
  const shared = await connectors.syncAll({
    ...fakeSources,
    radar: async () => ({ status: 'partial', reviewed: 0, harvest: { status: 'partial' } }),
  });
  assert.equal(shared.sources.radar.status, 'partial');
  assert.equal(shared.sources.radar.harvest.status, 'partial');
  console.log(
    'PASS: Apple Mail extraction is bounded before summarization, credentials have no fallback, and source failures are partial.',
  );
})()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    delete process.env.UTHJA_SYNC_DATA_DIR;
    delete process.env.RADAR_DATA_DIR;
    fs.rmSync(testData, { recursive: true, force: true });
  });
