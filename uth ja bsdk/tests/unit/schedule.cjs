const assert = require('node:assert/strict');
(async () => {
  const fs = require('node:fs');
  const source = fs.readFileSync(
    require('node:path').join(__dirname, '../../public/build/features/routine/schedule.js'),
    'utf8',
  );
  const { classesFor, scheduleFor, defaults, quietAt, timeLabel, canComplete, contestSubject } =
    await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
  const expected = {
    '2026-09-14': [
      [520, 600, 'A305'],
      [610, 670, 'A509'],
      [840, 920, 'A305'],
      [930, 1010, 'A305'],
    ],
    '2026-09-15': [
      [610, 670, 'A509'],
      [690, 770, 'A507'],
      [840, 920, 'A507'],
      [930, 1010, 'A507'],
    ],
    '2026-09-16': [
      [520, 600, 'A305'],
      [610, 670, 'Main Auditorium'],
      [840, 920, 'A305'],
      [930, 1010, 'A305'],
    ],
    '2026-09-17': [
      [540, 670, 'A509'],
      [690, 770, 'A507'],
      [840, 920, 'A507'],
      [930, 1010, 'A507'],
    ],
    '2026-09-18': [
      [540, 670, 'A509'],
      [840, 990, 'Room to confirm'],
    ],
  };
  for (const [date, list] of Object.entries(expected)) {
    assert.deepEqual(
      classesFor(date).map((t) => [t.start, t.end, t.room]),
      list,
    );
    for (const t of classesFor(date)) assert.equal(t.trigger, t.start - 9);
  }
  assert.equal(classesFor('2026-09-19').length, 0);
  assert.equal(classesFor('2026-09-20').length, 0);
  assert.equal(classesFor('2027-02-15').length, 0);
  for (const date of ['2026-09-13', '2026-09-14', '2026-09-15'])
    assert(
      !scheduleFor(date).some((t) => /yoga/i.test(t.title) || /yoga/i.test(t.detail)),
      'timetable contains no yoga activities',
    );
  for (const [time, mode, result] of [
    ['16:59', 'guided', false],
    ['17:00', 'guided', true],
    ['17:59', 'guided', true],
    ['18:00', 'guided', false],
    ['18:00', 'custom', true],
    ['22:59', 'custom', true],
    ['23:00', 'custom', false],
  ])
    assert.equal(quietAt(new Date('2026-09-14T' + time + ':00'), mode), result);
  const india = classesFor('2026-09-17')[0];
  assert(!canComplete('2026-09-17', india, new Date('2026-09-17T08:50:59')));
  assert(canComplete('2026-09-17', india, new Date('2026-09-17T08:51:00')));
  assert(!canComplete('2026-09-18', india, new Date('2026-09-17T23:00:00')));
  assert.equal(timeLabel(1440), '12:00 AM');
  assert.equal(timeLabel(720), '12:00 PM');
  assert.equal(contestSubject('2026-09-18'), 'Problem solving & programming');
  assert.equal(contestSubject('2026-09-25'), 'Mathematics I');
  assert.equal(contestSubject('2026-10-02'), 'Systems & AI');
  console.log(
    'PASS: PDF weekday classes/rooms, Lab 1 filtering, semester limits, no unlisted yoga activities, contest rotation, 9-minute locks, quiet/custom boundaries and midnight formatting.',
  );
})();
