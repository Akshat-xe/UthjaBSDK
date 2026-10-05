const monthIndex: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

export function resolveAcademicScheduleDate(
  rawDate: string,
  importedAt: string | null | undefined,
  today: Date,
): Date | null {
  const date = String(rawDate || '')
    .replace(/^(Today|Upcoming),\s*/i, '')
    .trim();
  const match = /\b([A-Za-z]{3})\s+(\d{1,2})\b/.exec(date);
  const month = match ? monthIndex[match[1].toLowerCase()] : undefined;
  const day = match ? Number(match[2]) : 0;
  if (month === undefined || day < 1 || day > 31) return null;

  const imported = importedAt ? new Date(importedAt) : today;
  const reference = Number.isNaN(imported.getTime()) ? today : imported;
  const year = reference.getFullYear();
  const candidates = [year - 1, year, year + 1]
    .map((value) => new Date(value, month, day))
    .filter((value) => value.getMonth() === month && value.getDate() === day);
  if (!candidates.length) return null;
  return candidates.reduce((best, candidate) =>
    Math.abs(candidate.getTime() - reference.getTime()) <
    Math.abs(best.getTime() - reference.getTime())
      ? candidate
      : best,
  );
}

export function formatAcademicScheduleDay(
  rawDate: string,
  importedAt: string | null | undefined,
  today: Date,
): { badge: 'Past' | 'Today' | 'Upcoming' | 'Saved'; date: string } {
  const date = String(rawDate || '')
    .replace(/^(Today|Upcoming),\s*/i, '')
    .trim();
  const actual = resolveAcademicScheduleDate(rawDate, importedAt, today);
  if (!actual) return { badge: 'Saved', date };
  const current = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return {
    badge:
      actual.getTime() === current.getTime() ? 'Today' : actual < current ? 'Past' : 'Upcoming',
    date,
  };
}
