// Matches PhoneActionStorage's JSON format. Keep personal action payloads bounded.
export const MAX_ACTION_BODY_BYTES = 512 * 1024;

type Row = Record<string, unknown>;
const record = (value: unknown): value is Row => value !== null && typeof value === 'object' && !Array.isArray(value);
const keys = (value: Row, allowed: string[], required: string[] = allowed) =>
  Object.keys(value).every((key) => allowed.includes(key)) && required.every((key) => key in value);
const str = (value: unknown, max = 500) => typeof value === 'string' && value.length <= max;
const maybeStr = (value: unknown, max = 500) => value === null || value === undefined || str(value, max);
const integer = (value: unknown, min = 0, max = 1_000_000) =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
const number = (value: unknown, min = 0, max = 1_000_000) =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const list = (value: unknown, max: number, valid: (item: unknown) => boolean) =>
  Array.isArray(value) && value.length <= max && value.every(valid);
const map = (value: unknown, max: number, valid: (item: unknown) => boolean) =>
  record(value) && Object.keys(value).length <= max &&
  Object.entries(value).every(([key, item]) => key.length > 0 && key.length <= 160 &&
    key !== '__proto__' && key !== 'constructor' && key !== 'prototype' && valid(item));

function food(value: unknown): boolean {
  return record(value) && keys(value, ['id', 'meal', 'item', 'amount', 'at'], ['id', 'meal', 'item', 'at']) &&
    str(value.id, 128) && str(value.meal, 80) && str(value.item, 500) &&
    maybeStr(value.amount, 120) && str(value.at, 64);
}

function task(value: unknown): boolean {
  return record(value) && keys(value,
    ['id', 'title', 'start', 'end', 'trigger', 'kind', 'detail', 'room', 'source', 'guided', 'hidden', 'date'],
    ['id', 'title', 'start', 'end', 'trigger', 'kind', 'detail', 'guided', 'hidden']) &&
    str(value.id, 128) && str(value.title, 300) && integer(value.start, 0, 1439) &&
    integer(value.end, 0, 1439) && integer(value.trigger, 0, 1439) &&
    str(value.kind, 80) && str(value.detail, 1000) && maybeStr(value.room, 200) &&
    maybeStr(value.source, 160) && typeof value.guided === 'boolean' &&
    typeof value.hidden === 'boolean' && maybeStr(value.date, 20);
}

function day(value: unknown): boolean {
  if (!record(value) || !keys(value,
    ['date', 'waterMl', 'checks', 'swimChecks', 'mode', 'attendance', 'scores', 'foodEntries', 'done', 'laundry'],
    ['date', 'waterMl', 'checks', 'swimChecks', 'attendance', 'scores', 'foodEntries', 'done'])) return false;
  const done = (item: unknown) => record(item) && keys(item, ['at', 'recordedAt', 'status', 'verification']) &&
    str(item.at, 64) && str(item.recordedAt, 64) && str(item.status, 80) && str(item.verification, 200);
  const laundry = value.laundry;
  return str(value.date, 20) && integer(value.waterMl, 0, 1_000_000) &&
    list(value.checks, 100, (item) => integer(item, 0, 1000)) &&
    list(value.swimChecks, 100, (item) => integer(item, 0, 1000)) &&
    maybeStr(value.mode, 80) && map(value.attendance, 200, (item) => str(item, 80)) &&
    map(value.scores, 200, (item) => number(item, -1_000_000, 1_000_000)) &&
    list(value.foodEntries, 500, food) && map(value.done, 500, done) &&
    (laundry === undefined || laundry === null ||
      (record(laundry) && keys(laundry, ['dropDate', 'dueDate', 'collectedAt'], ['dropDate', 'dueDate']) &&
        str(laundry.dropDate, 20) && str(laundry.dueDate, 20) && maybeStr(laundry.collectedAt, 64)));
}

export function validPhoneActionState(value: unknown): value is Row {
  if (!record(value) || !keys(value, [
    'currentDate', 'alarmsEnabled', 'dayRecords', 'foodEntries', 'wardrobe', 'studyNotes',
    'radarFavorites', 'radarProgress', 'eventLogs', 'customTasks',
  ])) return false;
  return str(value.currentDate, 20) && typeof value.alarmsEnabled === 'boolean' &&
    map(value.dayRecords, 1500, day) && list(value.foodEntries, 5000, food) &&
    list(value.wardrobe, 2000, (item) => record(item) &&
      keys(item, ['id', 'name', 'status', 'photoUrl'], ['id', 'name', 'status']) &&
      str(item.id, 128) && str(item.name, 300) && str(item.status, 80) && maybeStr(item.photoUrl, 2048)) &&
    list(value.studyNotes, 5000, (item) => record(item) &&
      keys(item, ['id', 'subject', 'text', 'date', 'done', 'photoUrl'], ['id', 'subject', 'text', 'date', 'done']) &&
      str(item.id, 128) && str(item.subject, 300) && str(item.text, 5000) &&
      str(item.date, 20) && typeof item.done === 'boolean' && maybeStr(item.photoUrl, 2048)) &&
    list(value.radarFavorites, 2000, (item) => str(item, 160)) &&
    map(value.radarProgress, 2000, (item) => str(item, 200)) &&
    list(value.eventLogs, 10000, (item) => record(item) &&
      keys(item, ['id', 'timestamp', 'effectiveTime', 'type', 'taskId', 'title', 'verification'],
        ['id', 'timestamp', 'effectiveTime', 'type']) &&
      str(item.id, 128) && str(item.timestamp, 64) && str(item.effectiveTime, 64) &&
      str(item.type, 100) && maybeStr(item.taskId, 128) &&
      maybeStr(item.title, 500) && maybeStr(item.verification, 200)) &&
    list(value.customTasks, 2000, task);
}
