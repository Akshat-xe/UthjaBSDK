'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

const testData = fs.mkdtempSync(path.join(os.tmpdir(), 'uth-ja-mail-test-'));
process.env.UTHJA_SYNC_DATA_DIR = testData;
process.env.RADAR_DATA_DIR = path.join(testData, 'radar');

(async () => {
  const connectors = require('../../backend/features/sync/connectors');
  const {
    filterApprovedAcademicMail,
    sanitizeStagedAcademicMail,
    DEFAULT_ALLOWED_DOMAINS,
    isUrgentPriority,
  } = require('../../backend/features/mobile-publish/mailFilter');

  // --- 1. Account Selection & AppleScript Safety ---
  const script = connectors.mailScript();
  assert.ok(script.includes('@rishihood.edu.in'), 'mailScript must check @rishihood.edu.in');
  assert.ok(script.includes('@nst.rishihood.edu.in'), 'mailScript must check @nst.rishihood.edu.in');
  assert.ok(!script.includes('messages of inbox\n'), 'mailScript must NOT read unified inbox');
  assert.ok(script.includes('STATUS:NO_RISHIHOOD_ACCOUNT'), 'mailScript must signal missing account');
  assert.ok(script.includes('STATUS:EMPTY'), 'mailScript must signal empty account inbox');
  assert.ok(script.includes('messageCount'), 'mailScript must bound message count');

  // Live check on macOS: since the machine has 3 personal gmail.com accounts and 0 rishihood accounts,
  // extractMail() must honestly throw CONFIG_REQUIRED and NOT read personal mail!
  if (process.platform === 'darwin') {
    await assert.rejects(
      connectors.extractMail(),
      (err) => {
        assert.equal(err.code, 'CONFIG_REQUIRED');
        assert.match(err.message, /configure an @rishihood\.edu\.in account in Apple Mail/i);
        return true;
      },
      'extractMail must reject when no Rishihood account is configured',
    );
  }

  // Error handling: automation blocked or assistive access
  const authErr = connectors.mailError({ code: -1743, stderr: 'Not authorized to control Mail' });
  assert.match(authErr.message, /allow the running terminal or app to control Mail/i);

  // --- 2. AI Structured Classification & Conservative Filtering ---
  const mockRawMail = [
    {
      sender: 'Dean Academics <dean@rishihood.edu.in>',
      subject: 'Urgent: Midterm Exam Rescheduled',
      snippet: 'The CS midterm exam has been rescheduled to Friday 10 AM in Hall 4.',
      date: '5 October 2026',
    },
    {
      sender: 'Sports Club <sports@rishihood.edu.in>',
      subject: 'Badminton Tournament Registration',
      snippet: 'Join the annual badminton tournament next week. Refreshments provided.',
      date: '5 October 2026',
    },
    {
      sender: 'Hostel Warden <warden@nst.rishihood.edu.in>',
      subject: 'Critical: Water Supply Maintenance Notice',
      snippet: 'Water supply will be cut tomorrow between 9 AM and 1 PM for repairs.',
      date: '5 October 2026',
    },
    {
      sender: 'Library <library@rishihood.edu.in>',
      subject: 'New Books Available in Library',
      snippet: 'A new batch of algorithms and systems books have arrived.',
      date: '4 October 2026',
    },
  ];

  // Test structured prompt generation
  const prompt = connectors.academicMailPrompt(mockRawMail);
  assert.ok(prompt.includes('Classify each academic email message'));
  assert.ok(prompt.includes('"urgent", "high", "normal", "low"'));
  assert.ok(prompt.includes('actionItem'));

  // Test classification normalization
  const normalized = connectors.normalizeMailClassification(
    [
      {
        id: 0,
        priority: 'urgent',
        category: 'Exam',
        summary: 'CS midterm rescheduled to Friday 10 AM in Hall 4.',
        actionItem: 'Appear for exam at Hall 4 Friday 10 AM.',
      },
      {
        id: 1,
        priority: 'low',
        category: 'Sports',
        summary: 'Badminton tournament open for registration.',
        actionItem: '',
      },
      {
        id: 2,
        priority: 'high',
        category: 'Hostel',
        summary: 'Water cut tomorrow 9 AM - 1 PM.',
        actionItem: 'Store water before 9 AM tomorrow.',
      },
      {
        id: 3,
        priority: 'normal',
        category: 'Library',
        summary: 'New library books available.',
        actionItem: '',
      },
    ],
    mockRawMail,
  );

  assert.equal(normalized.length, 4);
  assert.equal(normalized[0].priority, 'urgent');
  assert.equal(normalized[1].priority, 'low');
  assert.equal(normalized[2].priority, 'high');
  assert.equal(normalized[3].priority, 'normal');

  // Test that out-of-order AI response is reordered to match candidates exactly
  const outOfOrder = connectors.normalizeMailClassification(
    [
      { id: 3, priority: 'normal', category: 'Library', summary: 'Books' },
      { id: 1, priority: 'low', category: 'Sports', summary: 'Badminton' },
      { id: 0, priority: 'urgent', category: 'Exam', summary: 'Exam moved' },
      { id: 2, priority: 'high', category: 'Hostel', summary: 'Water cut' },
    ],
    mockRawMail.map((m, idx) => ({ id: idx, ...m })),
  );
  assert.equal(outOfOrder[0].summary, 'Exam moved');
  assert.equal(outOfOrder[0].priority, 'urgent');
  assert.equal(outOfOrder[1].summary, 'Badminton');
  assert.equal(outOfOrder[2].summary, 'Water cut');
  assert.equal(outOfOrder[3].summary, 'Books');

  // Test that duplicate or missing IDs are rejected
  assert.throws(
    () =>
      connectors.normalizeMailClassification(
        [
          { id: 0, priority: 'urgent' },
          { id: 0, priority: 'low' },
          { id: 2, priority: 'high' },
          { id: 3, priority: 'normal' },
        ],
        mockRawMail.map((m, idx) => ({ id: idx, ...m })),
      ),
    /Copilot response did not match the expected mail classification format/,
  );

  // Test that malformed priority never triggers blind urgency
  const malformedPriority = connectors.normalizeMailClassification(
    [
      { id: 0, priority: 'CRITICAL_MUST_READ_URGENT!!!', category: 'Exam', summary: 'Exam' },
      { id: 1, priority: undefined, category: 'Sports', summary: 'Sports' },
      { id: 2, priority: 'high', category: 'Hostel', summary: 'Water' },
      { id: 3, priority: 'normal', category: 'Library', summary: 'Books' },
    ],
    mockRawMail.map((m, idx) => ({ id: idx, ...m })),
  );
  assert.equal(malformedPriority[0].priority, 'normal', 'Malformed priority must default to normal, never urgent');
  assert.equal(malformedPriority[1].priority, 'normal', 'Undefined priority must default to normal');

  // Test syncGmail with mock extractor & analyzer:
  // ONLY urgent and high messages should be returned in items!
  const syncResult = await connectors.syncGmail({
    extract: async () => mockRawMail,
    analyze: async () => [
      {
        id: 0,
        priority: 'urgent',
        category: 'Exam',
        summary: 'CS midterm rescheduled to Friday 10 AM in Hall 4.',
        actionItem: 'Appear for exam at Hall 4 Friday 10 AM.',
      },
      {
        id: 1,
        priority: 'normal',
        category: 'Sports',
        summary: 'Badminton tournament open.',
        actionItem: '',
      },
      {
        id: 2,
        priority: 'high',
        category: 'Hostel',
        summary: 'Water cut tomorrow 9 AM - 1 PM.',
        actionItem: 'Store water before 9 AM tomorrow.',
      },
      {
        id: 3,
        priority: 'low',
        category: 'Library',
        summary: 'New library books available.',
        actionItem: '',
      },
    ],
  });

  assert.equal(syncResult.status, 'success');
  assert.equal(syncResult.totalRead, 4);
  assert.equal(syncResult.urgentCount, 2);
  assert.equal(syncResult.items.length, 2, 'Only 2 urgent/high items should be kept');
  assert.deepEqual(
    syncResult.items.map((i) => i.priority),
    ['urgent', 'high'],
  );
  assert.deepEqual(
    syncResult.items.map((i) => i.category),
    ['Exam', 'Hostel'],
  );
  // Ensure no full bodies or extraneous properties
  for (const item of syncResult.items) {
    assert.ok(item.summary.length <= 220);
    assert.ok(item.actionItem.length <= 180);
    assert.equal(Object.hasOwn(item, 'body'), false);
    assert.equal(Object.hasOwn(item, 'content'), false);
    assert.equal(Object.hasOwn(item, 'headers'), false);
  }

  // Test Copilot analysis failure -> partial status, items empty (rejects failed classification)
  const failedAiResult = await connectors.syncGmail({
    extract: async () => mockRawMail,
    analyze: async () => {
      throw new Error('Copilot CLI quota exceeded');
    },
  });
  assert.equal(failedAiResult.status, 'partial');
  assert.deepEqual(failedAiResult.items, []);
  assert.match(failedAiResult.error, /quota exceeded/);

  // Test empty inbox -> success status, items empty
  const emptyInboxResult = await connectors.syncGmail({
    extract: async () => [],
    analyze: async () => [],
  });
  assert.equal(emptyInboxResult.status, 'success');
  assert.deepEqual(emptyInboxResult.items, []);

  // --- 3. Academic Snapshot Wiring & No Legacy emails.json ---
  const { app, scheduler } = require('../../backend/server');
  scheduler.stop();

  // Test syncAll populates academicSources.gmail
  const urgentRows = syncResult.items;
  await connectors.syncAll({
    newton: async () => ({ items: [] }),
    rishiverse: async () => ({ items: [] }),
    gmail: async () => ({ status: 'success', items: urgentRows }),
  });

  const academicSources = connectors.getAcademicSources();
  assert.ok(academicSources.gmail, 'academicSources must contain gmail source');
  assert.ok(academicSources.gmail.updatedAt);
  assert.equal(academicSources.gmail.items.length, 2);
  assert.equal(academicSources.gmail.items[0].subject, 'Urgent: Midterm Exam Rescheduled');

  // Verify /api/academic reflects academicSources.gmail and NOT old emails.json
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const testPort = server.address().port;

  function makeRequest(port, { path: reqPath, method = 'GET', headers = {} }) {
    return new Promise((resolve, reject) => {
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port,
          path: reqPath,
          method,
          headers: {
            Host: `127.0.0.1:${process.env.PORT || 3000}`,
            ...headers,
          },
        },
        (res) => {
          let body = '';
          res.on('data', (chunk) => (body += chunk));
          res.on('end', () => {
            let parsed = body;
            try {
              parsed = JSON.parse(body);
            } catch {}
            resolve({ status: res.statusCode, headers: res.headers, body: parsed });
          });
        },
      );
      req.on('error', reject);
      req.end();
    });
  }

  try {
    const res = await makeRequest(testPort, { path: '/api/academic' });
    assert.equal(res.status, 200);
    const academicData = res.body;
    assert.equal(academicData.emails.length, 2);
    assert.equal(academicData.emails[0].priority, 'urgent');
    assert.equal(academicData.emails[1].priority, 'high');
    assert.equal(academicData.emails[0].actionItem, 'Appear for exam at Hall 4 Friday 10 AM.');
    // Check schema compatibility with Android SnapshotEmail
    for (const email of academicData.emails) {
      assert.equal(typeof email.sender, 'string');
      assert.equal(typeof email.subject, 'string');
      assert.equal(typeof email.summary, 'string');
      assert.equal(typeof email.date, 'string');
      assert.equal(typeof email.category, 'string');
      assert.equal(typeof email.priority, 'string');
      assert.ok(email.priority === 'urgent' || email.priority === 'high');
      assert.equal(typeof email.actionItem, 'string');
    }
  } finally {
    server.close();
  }

  // --- 4. Mobile Mail Filter Policy ---
  // Default allowlist without MOBILE_ACADEMIC_MAIL_SENDERS
  assert.deepEqual(DEFAULT_ALLOWED_DOMAINS, ['@rishihood.edu.in', '@nst.rishihood.edu.in']);
  assert.equal(isUrgentPriority('urgent'), true);
  assert.equal(isUrgentPriority('high'), true);
  assert.equal(isUrgentPriority('normal'), false);
  assert.equal(isUrgentPriority('low'), false);
  assert.equal(isUrgentPriority(''), false);

  const mixedEmails = [
    {
      sender: 'Dean <dean@rishihood.edu.in>',
      subject: 'Exam Notice',
      priority: 'urgent',
      summary: 'Exam tomorrow',
    },
    {
      sender: 'Club <club@rishihood.edu.in>',
      subject: 'Chess meet',
      priority: 'normal',
      summary: 'Play chess',
    },
    {
      sender: 'Spam <promo@otherdeals.com>',
      subject: 'Discount',
      priority: 'urgent',
      summary: 'Buy now',
    },
    {
      sender: 'HOD <hod@nst.rishihood.edu.in>',
      subject: 'Lab change',
      priority: 'high',
      summary: 'Lab shifted',
    },
  ];

  // Unset configuredSenders -> allows only urgent mail from @rishihood.edu.in / @nst.rishihood.edu.in
  const filteredDefault = filterApprovedAcademicMail(mixedEmails, '');
  assert.equal(filteredDefault.length, 2);
  assert.equal(filteredDefault[0].sender, 'Dean <dean@rishihood.edu.in>');
  assert.equal(filteredDefault[1].sender, 'HOD <hod@nst.rishihood.edu.in>');

  // Specific configured senders override
  const filteredCustom = filterApprovedAcademicMail(mixedEmails, 'dean@rishihood.edu.in');
  assert.equal(filteredCustom.length, 1);
  assert.equal(filteredCustom[0].sender, 'Dean <dean@rishihood.edu.in>');

  // Sanitize staged snapshot
  const stagedSnapshot = {
    schemaVersion: 1,
    revision: 'rev-stage-1',
    academic: { emails: mixedEmails },
  };
  const sanitized = sanitizeStagedAcademicMail(stagedSnapshot, '', 'rev-stage-2');
  assert.equal(sanitized.revision, 'rev-stage-2');
  assert.equal(sanitized.academic.emails.length, 2);
  assert.equal(sanitized.academic.emails[0].priority, 'urgent');
  assert.equal(sanitized.academic.emails[1].priority, 'high');

  // --- 5. POST /api/sync Rejected Promise Handling ---
  let unhandledRejections = [];
  const onUnhandled = (reason) => unhandledRejections.push(reason);
  process.on('unhandledRejection', onUnhandled);

  const testServer = http.createServer(app);
  await new Promise((resolve) => testServer.listen(0, '127.0.0.1', resolve));
  const syncPort = testServer.address().port;

  const originalExecuteSync = scheduler.executeSync;
  scheduler.executeSync = async () => {
    const error = new Error('Simulated sync all failure');
    error.code = 'SIMULATED_FAIL';
    throw error;
  };

  try {
    const localOrigin = `http://localhost:${process.env.PORT || 3000}`;
    const triggerRes = await makeRequest(syncPort, {
      path: '/api/sync',
      method: 'POST',
      headers: { Origin: localOrigin },
    });
    assert.equal(triggerRes.status, 202);
    // Allow background rejection to settle
    await new Promise((r) => setTimeout(r, 100));
    assert.equal(
      unhandledRejections.length,
      0,
      'POST /api/sync must catch background rejection without leaking unhandledRejection',
    );
  } finally {
    testServer.close();
    scheduler.executeSync = originalExecuteSync;
    process.removeListener('unhandledRejection', onUnhandled);
  }

  console.log(
    'PASS: Rishihood account-scoped inbox selection, setup_required on missing account, conservative AI urgent classification, schema-compatible Android mail wiring, default domain filtering, and safe POST /api/sync execution.',
  );
})()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => {
    delete process.env.UTHJA_SYNC_DATA_DIR;
    delete process.env.RADAR_DATA_DIR;
    try {
      fs.rmSync(testData, { recursive: true, force: true });
    } catch {}
  });
