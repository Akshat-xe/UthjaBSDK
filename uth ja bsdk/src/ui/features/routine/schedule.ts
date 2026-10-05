export const defaults = {
  semesterStart: '2026-08-15',
  semesterEnd: '2027-02-14',
  contestAnchor: '2026-09-18',
  alarms: false,
};
export const dayNames = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];
export const packing = [
  'Phone charger',
  'MacBook Air M5',
  'Phone',
  'PSP',
  'Book',
  'Rough copy',
  'Pen',
  'Earbuds',
  'ID card',
  'SSD card',
  'Room key',
  'Lock the door',
];
export const dateKey = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const minuteOf = (d) => d.getHours() * 60 + d.getMinutes();
export const timeLabel = (minutes) => {
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${Math.floor(m / 60) % 12 || 12}:${String(m % 60).padStart(2, '0')} ${m >= 720 ? 'PM' : 'AM'}`;
};
export function addDays(key, n) {
  const d = new Date(key + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return dateKey(d);
}
export function contestSubject(date, settings = defaults) {
  const weeks = Math.floor(
    (Date.parse(date + 'T12:00:00Z') - Date.parse(settings.contestAnchor + 'T12:00:00Z')) /
      604800000,
  );
  return ['Problem solving & programming', 'Mathematics I', 'Systems & AI'][((weeks % 3) + 3) % 3];
}
const cls = (id, title, start, end, room) => ({
  id,
  title,
  start,
  end,
  room,
  kind: 'class',
  trigger: start - 9,
  detail: `Go to ${room}. Complete your campus facial attendance scan, then mark yourself present.`,
  source: 'PDF · page 4 · Section D / 4 / Lab 1',
});
export function classesFor(date, settings = defaults) {
  if (date < settings.semesterStart || date > settings.semesterEnd) return [];
  const day = new Date(date + 'T12:00:00').getDay();
  if (day === 1 || day === 3)
    return [
      cls('systems-lab', 'Systems & AI · Lab 1', 520, 600, 'A305'),
      cls(
        day === 1 ? 'communication' : 'society',
        day === 1 ? 'Social Communication' : 'Self & Society',
        610,
        670,
        day === 1 ? 'A509' : 'Main Auditorium',
      ),
      cls('programming-lab', 'Problem solving · Lab 1', 840, 920, 'A305'),
      cls('math-lab', 'Mathematics I · Lab 1', 930, 1010, 'A305'),
    ];
  if (day === 2 || day === 4)
    return [
      cls(
        day === 2 ? 'communication' : 'india',
        day === 2 ? 'Social Communication' : 'Understanding India',
        day === 2 ? 610 : 540,
        670,
        'A509',
      ),
      cls('systems', 'Systems & AI Essentials', 690, 770, 'A507'),
      cls('programming', 'Problem solving & programming', 840, 920, 'A507'),
      cls('math', 'Mathematics I', 930, 1010, 'A507'),
    ];
  if (day === 5)
    return [
      cls('india', 'Understanding India', 540, 670, 'A509'),
      {
        ...cls(
          'contest',
          `Contest · ${contestSubject(date, settings)}`,
          840,
          990,
          'Room to confirm',
        ),
        kind: 'contest',
      },
    ];
  return [];
}
export function scheduleFor(date, settings = defaults) {
  const day = new Date(date + 'T12:00:00').getDay();
  const task = (id, title, start, end, kind, detail, extra = {}) => ({
    id,
    title,
    start,
    end,
    trigger: start,
    kind,
    detail,
    ...extra,
  });
  const list = [
    task(
      'wake',
      'Wake up. Start fresh.',
      295,
      305,
      'wake',
      'Drink hot water, put your phone on charge, and begin your morning.',
    ),
    task(
      'freshen',
      'Brush, freshen up & shower',
      305,
      345,
      'routine',
      'Brush your teeth, use the bathroom, shower and change. Morning facial routine: besan cleanse and coconut oil.',
    ),
  ];
  list.push(
    task(
      'morning-study',
      'A quiet start',
      345,
      480,
      'study',
      'Review yesterday’s notes, practise programming and get ready without rushing.',
    ),
  );
  list.push(
    task(
      'packing',
      'Pack your bag',
      485,
      505,
      'packing',
      'Everything you need, checked once. Take your room key and lock the door.',
    ),
    task(
      'breakfast',
      'Breakfast',
      505,
      510,
      'meal',
      'Head to the Newton School mess. Your bag should already be packed.',
    ),
  );
  if (classesFor(date, settings).length)
    list.push(
      task(
        'leave',
        'Leave for campus',
        510,
        520,
        'routine',
        'Leave the mess and head to campus. Check your first class and room below.',
      ),
    );
  list.push(
    ...classesFor(date, settings),
    task(
      'lunch',
      'Lunch & water',
      780,
      831,
      'meal',
      'Have lunch, refill your water bottle and check the next classroom.',
    ),
    task(
      'cooldown',
      'Your quiet hour',
      1020,
      1080,
      'quiet',
      'No reminders from 5:00–6:00 PM. Have your snacks and take a breather.',
    ),
    task(
      'evening',
      'Choose your evening',
      1080,
      1095,
      'choice',
      'How was your day? Had your snacks? Choose Guided or Custom until 11:00 PM.',
    ),
    task(
      'study-one',
      'Study · first session',
      1095,
      [1, 3, 5].includes(day) ? 1170 : 1200,
      'study',
      'Go to your room, plug your phone in and start with your homework.',
      { guided: true },
    ),
  );
  if ([1, 3, 5].includes(day))
    list.push(
      task(
        'swim',
        'Swimming',
        1170,
        1215,
        'swim',
        'Take swimwear, towel, goggles, room key and a clean change. Head downstairs using the lift or stairs carefully.',
        { guided: true },
      ),
    );
  list.push(
    task(
      'study-two',
      'Study · finish strong',
      1215,
      1380,
      'study',
      'Work through homework and prepare for the next class. Take dinner within the 8:00–9:30 PM window.',
      { guided: true },
    ),
    task(
      'sleep',
      'Time to sleep',
      1380,
      1440,
      'sleep',
      'Put your phone away. Your next wake-up is 4:55 AM — a 5h 55m window.',
    ),
  );
  // Laundry uses the 4–6 PM collection window without breaking the 5–6 PM quiet hour.
  if (day === 1)
    list.push(
      task(
        'laundry-drop',
        'Drop off laundry',
        1010,
        1020,
        'laundry',
        'Take the laundry bag and receipt. Monday drop-off → Thursday collection. Counter closes at 6:00 PM.',
      ),
    );
  if (day === 4)
    list.push(
      task(
        'laundry-pick',
        'Collect laundry',
        1010,
        1020,
        'laundry',
        'Collect Monday’s laundry with your receipt. Return clean clothes to your wardrobe.',
      ),
    );
  return list.sort((a, b) => a.start - b.start);
}
export function canComplete(date, task, now) {
  return date < dateKey(now) || (date === dateKey(now) && minuteOf(now) >= task.trigger);
}
export function quietAt(now, mode) {
  const m = minuteOf(now);
  return (m >= 1020 && m < 1080) || (mode === 'custom' && m >= 1080 && m < 1380);
}
