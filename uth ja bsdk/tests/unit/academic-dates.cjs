const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

(async () => {
  const moduleUrl = pathToFileURL(
    path.join(__dirname, '../../public/build/features/academic/snapshotDate.js'),
  );
  const { formatAcademicScheduleDay } = await import(moduleUrl.href);
  const { buildWeeklyTimetable } = await import(
    pathToFileURL(path.join(__dirname, '../../public/build/features/academic/weeklyTimetable.js'))
      .href
  );
  const { scheduleFor } = await import(
    pathToFileURL(path.join(__dirname, '../../public/build/features/routine/schedule.js')).href
  );
  const importedAt = '2026-09-25T02:23:00+05:30';
  const today = new Date(2026, 8, 28);
  assert.deepEqual(formatAcademicScheduleDay('Today, Sep 24 (Thursday)', importedAt, today), {
    badge: 'Past',
    date: 'Sep 24 (Thursday)',
  });
  assert.equal(formatAcademicScheduleDay('Sep 28 (Monday)', importedAt, today).badge, 'Today');
  assert.equal(formatAcademicScheduleDay('Sep 29 (Tuesday)', importedAt, today).badge, 'Upcoming');
  assert.equal(
    formatAcademicScheduleDay('Jan 2', '2026-12-30T12:00:00+05:30', new Date(2027, 0, 2)).badge,
    'Today',
  );
  const week = buildWeeklyTimetable(
    '2026-09-28',
    new Date('2026-09-28T13:00:00+05:30'),
    importedAt,
    [
      {
        date: 'Today, Sep 24 (Thursday)',
        items: [{ time: '2:00 PM - 3:30 PM', title: 'Old lesson' }],
      },
      {
        date: 'Sep 28 (Monday)',
        items: [{ time: '8:40 AM - 10:00 AM', title: 'Systems & AI Lab 1' }],
      },
      {
        date: 'Sep 29 (Tuesday)',
        items: [
          {
            time: '10:00 AM - 11:20 AM',
            subject: 'Social Communication I',
            title: 'Interpersonal Communication Dynamics',
            location: 'Classroom 4',
          },
        ],
      },
      {
        date: 'Sep 30 (Wednesday)',
        items: [
          {
            time: '10:10 AM - 11:10 AM',
            subject: 'Self and Society I',
            title: 'Self and Society-I Lecture',
          },
        ],
      },
    ],
    scheduleFor,
  );
  assert.deepEqual(
    week.map((day) => day.key),
    ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02'],
  );
  assert.deepEqual(
    week[0].items.map((item) => [item.source, item.start]),
    [
      ['NST', 520],
      ['RUFP', 610],
    ],
  );
  assert.equal(week[0].items[1].location, 'A509');
  assert.equal(week[1].items.length, 1, 'the NST lesson and RUFP class are one event');
  assert.equal(week[1].items[0].topic, 'Interpersonal Communication Dynamics');
  assert.equal(week[1].items[0].time, '10:10 AM – 11:10 AM');
  assert.equal(week[2].items.length, 1);
  assert.equal(week[2].items[0].location, 'Main Auditorium');
  assert.equal(week[3].items[0].title, 'Understanding India');
  assert.equal(week[4].items[0].location, 'A509');
  const overridden = buildWeeklyTimetable(
    '2026-09-28',
    new Date('2026-09-28T13:00:00+05:30'),
    importedAt,
    [],
    (key) =>
      scheduleFor(key).map((task) =>
        task.id === 'communication' ? { ...task, start: 600, room: 'A610' } : task,
      ),
  );
  assert.equal(
    overridden[0].items[0].start,
    600,
    'weekly RUFP class follows routine timing overrides',
  );
  assert.equal(overridden[0].items[0].location, 'A610');
  console.log(
    'PASS: current academic week merges NST and Section D RUFP routine classes, dedupes shared subjects, follows overrides, and handles stale dates.',
  );
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
