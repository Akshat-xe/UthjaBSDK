import { timeLabel } from '../routine/schedule.js';
import { resolveAcademicScheduleDate } from './snapshotDate.js';

type SnapshotItem = {
  time?: string;
  title?: string;
  subject?: string;
  type?: string;
  location?: string;
};
type SnapshotDay = { date: string; items?: Array<SnapshotItem | string> };
type RoutineClass = {
  id: string;
  kind: string;
  title: string;
  start: number;
  end: number;
  room?: string;
};
export type WeeklyClass = {
  source: 'NST' | 'RUFP';
  title: string;
  time: string;
  location: string;
  start: number;
  topic?: string;
};
export type WeeklyDay = {
  key: string;
  badge: 'Past' | 'Today' | 'Upcoming';
  label: string;
  items: WeeklyClass[];
};

const rufpIds = new Set(['communication', 'society', 'india']);
const dateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const minutes = (time: string) => {
  const match = /^(\d{1,2}):(\d{2})\s*(AM|PM)/i.exec(time.trim());
  if (!match) return Number.POSITIVE_INFINITY;
  return (
    (Number(match[1]) % 12) * 60 + Number(match[2]) + (match[3].toUpperCase() === 'PM' ? 720 : 0)
  );
};
const normalized = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
const rufpSubjectId = (item: SnapshotItem) => {
  const subject = normalized(item.subject || item.title || '');
  if (subject.includes('social communication') || subject.includes('interpersonal communication'))
    return 'communication';
  if (subject.includes('self and society') || subject.includes('self society')) return 'society';
  if (subject.includes('understanding india')) return 'india';
  return '';
};

export function buildWeeklyTimetable(
  selected: string,
  now: Date,
  importedAt: string | null | undefined,
  snapshot: SnapshotDay[],
  routineForDate: (key: string) => RoutineClass[],
): WeeklyDay[] {
  const chosen = new Date(`${selected}T12:00:00`);
  if (Number.isNaN(chosen.getTime())) return [];
  const monday = new Date(chosen);
  monday.setDate(chosen.getDate() - ((chosen.getDay() + 6) % 7));
  const saved = new Map<string, SnapshotItem[]>();
  for (const day of snapshot || []) {
    const parsed = resolveAcademicScheduleDate(day.date, importedAt, now);
    if (!parsed) continue;
    const key = dateKey(parsed);
    const items = saved.get(key) || [];
    items.push(
      ...(day.items || []).map((item) => (typeof item === 'string' ? { title: item } : item)),
    );
    saved.set(key, items);
  }
  const today = dateKey(now);
  return Array.from({ length: 5 }, (_, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    const key = dateKey(date);
    const rufpTasks = routineForDate(key).filter(
      (task) => task.kind === 'class' && rufpIds.has(task.id),
    );
    const rufp: WeeklyClass[] = rufpTasks.map((task) => ({
      source: 'RUFP',
      title: task.title,
      time: `${timeLabel(task.start)} – ${timeLabel(task.end)}`,
      location: task.room || '',
      start: task.start,
    }));
    const nst: WeeklyClass[] = [];
    for (const item of saved.get(key) || []) {
      const rufpIndex = rufpTasks.findIndex((task) => task.id === rufpSubjectId(item));
      if (rufpIndex !== -1) {
        const topic = item.title || '';
        if (topic && !normalized(topic).includes(normalized(item.subject || rufp[rufpIndex].title)))
          rufp[rufpIndex].topic = topic;
        continue;
      }
      nst.push({
        source: 'NST',
        title: item.title || item.subject || item.type || 'Class',
        time: item.time || '',
        location: item.location || '',
        start: minutes(item.time || ''),
      });
    }
    return {
      key,
      badge: key === today ? 'Today' : key < today ? 'Past' : 'Upcoming',
      label: `${date.toLocaleString('en-US', { month: 'short' })} ${date.getDate()} (${date.toLocaleString('en-US', { weekday: 'long' })})`,
      items: [...nst, ...rufp].sort((a, b) => a.start - b.start),
    };
  });
}
