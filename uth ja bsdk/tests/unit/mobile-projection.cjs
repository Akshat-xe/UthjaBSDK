const assert = require('node:assert/strict');
const { projectSnapshot } = require('../../backend/features/mobile-publish/projection');

const updatedAt = '2026-09-30T09:50:00.000Z';
function weeklyMenu() {
  return Object.fromEntries(
    ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((day) => [
      day,
      Object.fromEntries(
        ['breakfast', 'lunch', 'snacks', 'dinner'].map((meal) => [meal, [`${day} ${meal}`]]),
      ),
    ]),
  );
}

function fixture() {
  return {
    metadata: { revision: 'rev-42', runId: 'sync-42', publishedAt: '2026-09-30T10:00:00Z' },
    academic: {
      importedAt: updatedAt,
      semester: 'Semester 3',
      sources: {
        newton: { updatedAt },
        rishiverse: { updatedAt },
        gmail: { updatedAt },
      },
      attendance: {
        combined: { attended: 7, total: 10, percent: 70, canMiss: 1, needAttend: 2 },
        nst: { attended: 4, total: 5, percent: 80, canMiss: 1, needAttend: 0 },
        rufp: { attended: 3, total: 5, percent: 60, canMiss: 0, needAttend: 2 },
        privateNotes: 'must not escape',
      },
      subjects: [
        {
          name: 'Systems',
          group: 'NST Core',
          code: 'SYS',
          attended: 4,
          total: 5,
          absent: 1,
          percent: 80,
          token: 'academic-secret-token',
        },
      ],
      schedule: [
        {
          date: '2026-10-01',
          badge: 'Thursday',
          items: [
            {
              time: '09:00',
              subject: 'Systems',
              type: 'Lecture',
              title: 'Networks',
              status: 'Scheduled',
              location: 'Room 2',
              privateNotes: 'not projected',
            },
          ],
        },
      ],
      emails: [
        {
          sender: 'Faculty',
          subject: 'Schedule update',
          summary: 'Class moves to Friday.',
          snippet: 'RAW BODY: do not include this',
          body: 'RAW MAIL BODY',
          authToken: 'mail-secret',
          date: '2026-09-30',
        },
      ],
      rawMailBodies: ['RAW BODY'],
      browserBackupToken: 'backup-secret',
    },
    radar: {
      fetchedAt: updatedAt,
      opportunities: [
        {
          id: 'event-1',
          title: 'Campus build day',
          organizer: 'Campus',
          platform: 'unstop',
          event_url: 'https://example.test/events/1',
          mode: 'online',
          location: 'Remote',
          locationLabel: 'Online · open anywhere',
          areaScope: 'remote',
          distanceKm: null,
          registration_deadline: '2026-10-10',
          prize_pool: 'INR 60,000',
          analysis: {
            bucket: 'easy',
            tier: 'Tier A',
            tierKey: 'A',
            difficulty: 'easy',
            effortHours: '4–10',
            confidence: 'medium',
            score: 99,
            reason: 'private analysis note',
          },
          raw_data: {
            description: 'Public project listing description.',
            minTeam: 2,
            maxTeam: 4,
            eligibility: 'Students',
            submissionDates: 'October 1–10',
            authToken: 'radar-secret',
            localReview: { summary: 'Build a small prototype.', teamSize: 'Unknown' },
          },
          processOutput: 'private command output',
          userProfile: { unrelated: true },
        },
      ],
      credentials: { password: 'do-not-publish' },
    },
    menu: { fetchedAt: updatedAt, menu: weeklyMenu(), localPath: '/private/menu.json' },
    syncResult: {
      finishedAt: '2026-09-30T10:00:00Z',
      processOutput: 'secret process output',
      sources: {
        newton: { status: 'success', updatedAt },
        rishiverse: { status: 'success', updatedAt },
        gmail: { status: 'success', updatedAt },
        radar: { status: 'success', updatedAt },
        menu: { status: 'success', updatedAt },
      },
    },
  };
}

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

const source = fixture();
const before = JSON.stringify(source);
const output = projectSnapshot(deepFreeze(source));
assert.deepEqual(JSON.stringify(source), before, 'projection does not mutate caller data');
assert.equal(output.schemaVersion, 1);
assert.equal(output.revision, 'rev-42');
assert.equal(output.runId, 'sync-42');
assert.equal(output.publishedAt, '2026-09-30T10:00:00.000Z');
assert.equal(output.academic.attendance.combined.percent, 70);
assert.equal(output.academic.schedule[0].items[0].title, 'Networks');
assert.equal(output.academic.emails[0].summary, 'Class moves to Friday.');
assert.equal(output.radar.opportunities[0].summary, 'Build a small prototype.');
assert.deepEqual(output.radar.opportunities[0].analysis, {
  bucket: 'easy',
  tier: 'Tier A',
  tierKey: 'A',
  difficulty: 'easy',
  effortHours: '4–10',
  confidence: 'medium',
});
assert.equal(output.radar.opportunities[0].prizePool, 'INR 60,000');
assert.equal(output.radar.opportunities[0].teamSize, '2–4 people');
assert.equal(output.radar.opportunities[0].locationLabel, 'Online · open anywhere');
assert.deepEqual(output.radar.opportunities[0].details, {
  description: 'Public project listing description.',
  eligibility: 'Students',
  submissionDates: 'October 1–10',
});
assert.deepEqual(output.menu.menu.Monday.breakfast, ['Monday breakfast']);
assert.deepEqual(output.sources.newton, { status: 'success', freshness: 'fresh', updatedAt });

const serialized = JSON.stringify(output);
for (const privateValue of [
  'RAW MAIL BODY',
  'RAW BODY',
  'mail-secret',
  'academic-secret-token',
  'radar-secret',
  'do-not-publish',
  'backup-secret',
  'private command output',
  '/private/menu.json',
  'private analysis note',
]) {
  assert(!serialized.includes(privateValue), `redacted ${privateValue}`);
}
assert.equal(Object.hasOwn(output.academic.emails[0], 'snippet'), false);
assert.equal(Object.hasOwn(output.radar.opportunities[0], 'raw_data'), false);
assert.equal(Object.hasOwn(output.radar.opportunities[0].analysis, 'score'), false);
assert.equal(Object.hasOwn(output.radar.opportunities[0].analysis, 'reason'), false);
assert.equal(Object.hasOwn(output.academic.attendance, 'privateNotes'), false);

const boundedInput = fixture();
boundedInput.academic.subjects = Array.from({ length: 120 }, (_, index) => ({
  name: ` ${'N'.repeat(150)} ${index} `,
  group: 'G'.repeat(90),
  code: 'C'.repeat(80),
}));
boundedInput.academic.schedule = Array.from({ length: 20 }, (_, index) => ({
  date: 'D'.repeat(90),
  badge: 'B'.repeat(100),
  items: Array.from({ length: 12 }, () => ({
    title: 'T'.repeat(200),
    subject: 'S'.repeat(150),
    location: 'L'.repeat(150),
  })),
}));
boundedInput.academic.emails = Array.from({ length: 15 }, () => ({
  sender: 'F'.repeat(150),
  subject: 'U'.repeat(250),
  summary: 'M'.repeat(300),
}));
boundedInput.radar.opportunities = Array.from({ length: 60 }, (_, index) => ({
  id: `event-${index}`,
  title: 'E'.repeat(250),
  organizer: 'O'.repeat(150),
  event_url: 'https://example.test/events',
  areaScope: 'remote',
  skills_required: Array.from({ length: 20 }, () => 'K'.repeat(60)),
  locationLabel: 'L'.repeat(150),
  prize_pool: 'P'.repeat(150),
  raw_data: {
    minTeam: 2,
    maxTeam: 4,
    description: 'D'.repeat(1200),
    eligibility: 'E'.repeat(150),
    submissionDates: 'S'.repeat(150),
  },
  analysis: {
    bucket: 'easy',
    tier: 'Tier A',
    tierKey: 'A',
    difficulty: 'easy',
    effortHours: 'H'.repeat(80),
    confidence: 'medium',
  },
}));
boundedInput.menu.menu.Monday.breakfast = ['I'.repeat(150)];
const boundedOutput = projectSnapshot(boundedInput);
assert.equal(boundedOutput.academic.subjects.length, 100);
assert.equal(boundedOutput.academic.subjects[0].name.length, 100);
assert.equal(boundedOutput.academic.subjects[0].group.length, 60);
assert.equal(boundedOutput.academic.schedule.length, 14);
assert.equal(boundedOutput.academic.schedule[0].items.length, 8);
assert.equal(boundedOutput.academic.schedule[0].items[0].title.length, 140);
assert.equal(boundedOutput.academic.emails.length, 12);
assert.equal(boundedOutput.academic.emails[0].summary.length, 220);
assert.equal(boundedOutput.radar.opportunities.length, 50);
assert.equal(boundedOutput.radar.opportunities[0].title.length, 180);
assert.equal(boundedOutput.radar.opportunities[0].skills.length, 12);
assert.equal(boundedOutput.radar.opportunities[0].locationLabel.length, 120);
assert.equal(boundedOutput.radar.opportunities[0].prizePool.length, 100);
assert.equal(boundedOutput.radar.opportunities[0].details.description.length, 1000);
assert.equal(boundedOutput.radar.opportunities[0].details.eligibility.length, 120);
assert.equal(boundedOutput.radar.opportunities[0].details.submissionDates.length, 120);
assert.equal(boundedOutput.radar.opportunities[0].analysis.effortHours.length, 40);
assert.equal(boundedOutput.menu.menu.Monday.breakfast[0].length, 100);

const snippetOnly = fixture();
snippetOnly.academic.emails = [
  {
    sender: 'Faculty',
    subject: 'Room change',
    summary: '  ',
    snippet: 'Room 3 tomorrow.',
    body: 'private body',
  },
];
assert.equal(projectSnapshot(snippetOnly).academic.emails[0].summary, 'Room 3 tomorrow.');
const malformedAnalysis = fixture();
malformedAnalysis.radar.opportunities[0].analysis.bucket = 'private';
assert.throws(() => projectSnapshot(malformedAnalysis), /analysis\.bucket/);

const partialInput = fixture();
partialInput.syncResult.sources.rishiverse = {
  status: 'failed',
  error: 'private diagnostic should not be projected',
  finishedAt: '2026-09-30T10:00:00Z',
};
partialInput.syncResult.sources.gmail.status = 'partial';
partialInput.syncResult.sources.radar.status = 'failed';
const partialOutput = projectSnapshot(partialInput);
assert.deepEqual(partialOutput.sources.rishiverse, {
  status: 'failed',
  freshness: 'stale',
  updatedAt,
});
assert.deepEqual(partialOutput.sources.gmail, { status: 'partial', freshness: 'stale', updatedAt });
assert.deepEqual(partialOutput.sources.radar, { status: 'failed', freshness: 'stale', updatedAt });
assert(
  !JSON.stringify(partialOutput).includes('private diagnostic'),
  'sync diagnostics are not projected',
);

assert.throws(() => projectSnapshot(null), /Invalid mobile snapshot input at input/);
assert.throws(
  () =>
    projectSnapshot({
      ...fixture(),
      metadata: { revision: '', runId: 'id', publishedAt: updatedAt },
    }),
  /metadata\.revision/,
);
assert.throws(
  () =>
    projectSnapshot({
      ...fixture(),
      metadata: { revision: 'r', runId: 'id', publishedAt: 'not-a-date' },
    }),
  /metadata\.publishedAt/,
);
const oversizedId = fixture();
oversizedId.metadata.revision = 'r'.repeat(101);
assert.throws(() => projectSnapshot(oversizedId), /metadata\.revision/);
assert.throws(
  () => projectSnapshot({ ...fixture(), syncResult: { sources: { radar: { status: 'ok' } } } }),
  /recognized source status/,
);
const malformed = fixture();
malformed.academic.subjects = 'not-an-array';
assert.throws(() => projectSnapshot(malformed), /academic\.subjects/);
const sparse = fixture();
sparse.academic.subjects = Array(1);
assert.throws(() => projectSnapshot(sparse), /dense arrays/);
const badUrl = fixture();
badUrl.radar.opportunities[0].event_url = 'javascript:alert(1)';
assert.throws(() => projectSnapshot(badUrl), /HTTPS URL/);
const missingListingTitle = fixture();
missingListingTitle.radar.opportunities[0].title = '';
assert.throws(() => projectSnapshot(missingListingTitle), /radar\.opportunities\[0\]\.title/);
const oversized = fixture();
oversized.academic.emails[0].body = 'x'.repeat(1024 * 1024 + 1);
assert.throws(() => projectSnapshot(oversized), /exceeds 1 MiB/);
const cyclic = fixture();
cyclic.academic.loop = cyclic.academic;
assert.throws(() => projectSnapshot(cyclic), /acyclic JSON-compatible data/);
const accessor = fixture();
Object.defineProperty(accessor.academic, 'hidden', { enumerable: true, get: () => 'value' });
assert.throws(() => projectSnapshot(accessor), /without accessors/);
const noStatuses = fixture();
noStatuses.syncResult = {};
assert.equal(projectSnapshot(noStatuses).sources.menu.status, 'unavailable');
assert.equal(projectSnapshot(noStatuses).sources.menu.freshness, 'stale');

console.log(
  'PASS: mobile snapshot projection validates, bounds, redacts, preserves freshness, and copies.',
);
