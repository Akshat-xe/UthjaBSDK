// @ts-nocheck
// Legacy UI is being migrated incrementally; new feature modules remain fully checked.
import {
  defaults,
  dayNames,
  packing,
  dateKey,
  minuteOf,
  timeLabel,
  addDays,
  classesFor,
  scheduleFor,
  canComplete,
  quietAt,
  contestSubject,
} from './features/routine/schedule.js';
import { buildWeeklyTimetable } from './features/academic/weeklyTimetable.js';
import { Icon } from '@/components/Icon';
import './features/sync/UpdateControl.js';
const $ = (s) => document.querySelector(s),
  esc = (s) =>
    String(s ?? '').replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
    );
const navIcons = {
  today: 'ph:house',
  academic: 'ph:calendar-blank',
  tools: 'ph:wrench',
  timetable: 'ph:calendar-blank',
  attendance: 'ph:chart-bar',
  mail: 'ph:envelope-simple',
  notes: 'ph:notebook',
  food: 'ph:fork-knife',
  life: 'ph:suitcase',
  radar: 'ph:target',
  reports: 'ph:chart-line-up',
};
const navIcon = (name, size = 20) =>
  Icon({ name: navIcons[name] || 'ph:house', size, className: 'text-current' });
const labels = {
  today: 'Routine',
  'academic-timetable': 'Timetable',
  'academic-attendance': 'Attendance',
  'academic-mail': 'Academic mail',
  'academic-notes': 'Study notes',
  academic: 'Timetable',
  classes: 'Timetable',
  timetable: 'Timetable',
  attendance: 'Attendance',
  mail: 'Academic mail',
  notes: 'Study notes',
  food: 'Food & Water',
  meals: 'Food & Water',
  life: 'Hostel life',
  radar: 'Opportunity Radar',
  reports: 'Reports',
};
const radarState = {
  scope: 'nearby',
  items: [],
  counts: { nearby: 0, local: 0, remote: 0, outside: 0, unknown: 0 },
  status: null,
  sync: null,
  loading: false,
  error: '',
  favorites: read('rhythm-radar-favorites', []),
  onlyFavorites: false,
  difficulty: 'easy',
  tier: 'S',
  unverifiedLimit: 10,
  progress: read('rhythm-radar-progress', {}),
  quote: null,
};
let radarStatusPollTimer = null,
  radarStatusPollBusy = false;
function read(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) || fallback;
  } catch {
    return fallback;
  }
}
const fresh = () => ({ days: {}, notes: [], wardrobe: [], events: [] });
let settings = { ...defaults, ...read('rhythm-settings', {}) },
  real = read('rhythm-records-v1', fresh()),
  demo = fresh(),
  simulation = null,
  selected = dateKey(new Date()),
  view = location.hash.slice(1) || 'today',
  filter = 'all',
  menu = read('rhythm-menu', {}),
  active = null,
  timer = null,
  audio = null,
  stream = null,
  photoReady = false,
  undoAction = null,
  toastTimer = null,
  expandedTaskId = '',
  editingTaskId = '',
  pendingJumpId = '',
  navActive = '';
if (view === 'meals') view = 'food';
const db = () => (simulation ? demo : real);
const now = () => (simulation ? new Date(simulation) : new Date());
const currentDay = (key = selected) =>
  db().days[key] || {
    done: {},
    checks: [],
    water: 0,
    mode: null,
    attendance: {},
    scores: {},
    snoozes: {},
    alerted: {},
  };
function mutableDay(key = selected) {
  const day = (db().days[key] ??= currentDay(key));
  day.plannedCount = tasks(key).length;
  return day;
}
function persist() {
  try {
    if (!simulation) localStorage.setItem('rhythm-records-v1', JSON.stringify(real));
    if (!simulation) queueBackup();
    return true;
  } catch {
    toast('Device storage is full. Export a backup before adding photos.');
    return false;
  }
}
function event(type, taskId, extra = {}) {
  db().events.push({
    id: crypto.randomUUID(),
    date: selected,
    type,
    taskId,
    timestamp: new Date().toISOString(),
    effectiveTime: now().toISOString(),
    simulation: !!simulation,
    ...extra,
  });
}
function saveSettings() {
  localStorage.setItem('rhythm-settings', JSON.stringify(settings));
  if (!simulation) queueBackup();
}
function toast(message, undo) {
  undoAction = undo || null;
  $('#toast').innerHTML = `${esc(message)}${undo ? '<button id="undoAction">Undo</button>' : ''}`;
  $('#toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($('#toast').hidden = true), 6500);
}
function tasks(key = selected) {
  const day = new Date(key + 'T12:00:00').getDay();
  const base = scheduleFor(key, settings).map((t) => ({
    ...t,
    ...settings.overrides?.[t.id],
    source: settings.overrides?.[t.id]
      ? 'Personal override · original schedule from PDF'
      : t.source,
  }));
  const custom = (settings.customTasks || []).filter((t) =>
    t.date ? t.date === key : t.days.includes(day),
  );
  return [...base, ...custom].filter((t) => !t.hidden).sort((a, b) => a.start - b.start);
}
function record(task, status = 'done', verification = 'manual') {
  if (!canComplete(selected, task, now()))
    return toast(`Available at ${timeLabel(task.trigger)} on ${selected}.`);
  const key = selected,
    day = mutableDay(),
    previous = structuredClone(day),
    eventsLength = db().events.length;
  day.done[task.id] = {
    at: now().toISOString(),
    recordedAt: new Date().toISOString(),
    status,
    verification,
  };
  if (['class', 'contest'].includes(task.kind))
    day.attendance[task.id] = status === 'done' ? 'present' : status;
  delete day.snoozes[task.id];
  delete day.alerted[task.id];
  event(status, task.id, { title: task.title, verification });
  if (!persist()) {
    db().days[key] = previous;
    db().events.splice(eventsLength);
    return;
  }
  render();
  toast(status === 'done' ? 'Saved. One less thing on your mind.' : `Marked ${status}.`, () => {
    db().days[key] = previous;
    db().events.push({
      id: crypto.randomUUID(),
      date: key,
      type: 'undo',
      taskId: task.id,
      timestamp: new Date().toISOString(),
      effectiveTime: now().toISOString(),
      simulation: !!simulation,
    });
    persist();
    render();
    toast('Last action undone.');
  });
}
function undoTask(task) {
  const day = mutableDay();
  delete day.done[task.id];
  delete day.attendance[task.id];
  event('undo', task.id);
  persist();
  render();
  toast('Reopened. You can mark it again.');
}
function primaryTask(list = tasks()) {
  const m = minuteOf(now()),
    today = selected === dateKey(now()),
    done = currentDay().done;
  if (!today) return list.find((t) => !done[t.id]) || list[0];
  return (
    list.find((t) => t.start <= m && t.end > m && ['class', 'contest'].includes(t.kind)) ||
    list.find((t) => t.start <= m && t.end > m && !done[t.id]) ||
    list.find((t) => t.start > m && !done[t.id]) ||
    [...list].reverse().find((t) => !done[t.id])
  );
}
function nav() {
  const leafAlias = {
    today: 'today',
    'routine-flow': 'today',
    academic: 'academic-timetable',
    'academic-timetable': 'academic-timetable',
    classes: 'academic-timetable',
    timetable: 'academic-timetable',
    'academic-attendance': 'academic-attendance',
    attendance: 'academic-attendance',
    'academic-mail': 'academic-mail',
    mail: 'academic-mail',
    'academic-notes': 'academic-notes',
    notes: 'academic-notes',
    food: 'food',
    meals: 'food',
    life: 'life',
    radar: 'radar',
    reports: 'reports',
  };
  const activeLeaf = leafAlias[navActive] || leafAlias[view] || 'today';
  const groups = [
    { label: 'Routine', items: [['today', 'Daily rhythm', 'today']] },
    {
      label: 'Academic',
      items: [
        ['academic-timetable', 'NST timetable', 'timetable'],
        ['academic-attendance', 'Attendance', 'attendance'],
        ['academic-mail', 'Academic mail', 'mail'],
        ['academic-notes', 'Study notes', 'notes'],
      ],
    },
    {
      label: 'More tools',
      items: [
        ['food', 'Food & Water', 'food'],
        ['life', 'Hostel life', 'life'],
        ['radar', 'Opportunity Radar', 'radar'],
        ['reports', 'Reports', 'reports'],
      ],
    },
  ];
  const link = ([id, label, iconName], mobile = false) =>
    `<a class="${mobile ? 'mobile-link' : 'nav-item sidebar-link'} ${id === activeLeaf ? 'active' : ''}" href="#${id}" data-jump="${id}" ${id === activeLeaf ? 'aria-current="page"' : ''}>${navIcon(iconName, mobile ? 20 : 20)}<span>${label}</span></a>`;
  $('#navigation').innerHTML = groups
    .map(
      (group) =>
        `<div class="sidebar-group"><span class="sidebar-group__label">${group.label}</span>${group.items.map((item) => link(item)).join('')}</div>`,
    )
    .join('');
  $('#mobileNav').innerHTML = groups
    .flatMap((group) => group.items)
    .map((item) => link(item, true))
    .join('');

  $('#breadcrumb').textContent = 'Akshat Kumar';
}
function radarDate(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
function radarSafeUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' &&
      ['unstop.com', 'devpost.com'].some(
        (host) => u.hostname === host || u.hostname.endsWith('.' + host),
      )
      ? u.href
      : '';
  } catch {
    return '';
  }
}
function radarCard(o) {
  const saved = radarState.favorites.includes(o.id),
    d =
      o.start_date && o.end_date
        ? `${radarDate(o.start_date)} – ${radarDate(o.end_date)}`
        : o.start_date
          ? `Starts ${radarDate(o.start_date)} · end date not listed`
          : o.end_date
            ? `Ends ${radarDate(o.end_date)} · start date not listed`
            : 'Official event schedule not listed';
  const deadline = o.registration_deadline
    ? `Registration closes ${radarDate(o.registration_deadline)}`
    : 'Registration deadline not listed';
  const desc = o.raw_data?.description || 'No description was returned by the source.';
  const url = radarSafeUrl(o.event_url);
  const place =
    [o.location, o.distanceKm != null ? `~${o.distanceKm} km straight-line from Sonipat` : null]
      .filter(Boolean)
      .join(' · ') || 'Location not listed';
  const team =
    o.raw_data?.minTeam || o.raw_data?.maxTeam
      ? `Team ${o.raw_data.minTeam || 1}–${o.raw_data.maxTeam || o.raw_data.minTeam}`
      : '';
  let eligibility = o.raw_data?.eligibility;
  if (typeof eligibility === 'string' && eligibility.length > 240) {
    try {
      const parsed = JSON.parse(eligibility);
      eligibility = parsed.sector?.join(', ') || 'See official event page';
    } catch {
      eligibility = 'See official event page';
    }
  } else if (typeof eligibility !== 'string' && eligibility)
    eligibility = 'See official event page';
  const decode = (s) =>
    String(s ?? '')
      .replace(/&amp;/g, '&')
      .replace(/&nbsp;/g, ' ')
      .replace(/&mdash;/g, '—')
      .replace(/&ndash;/g, '–')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
  const submission = o.raw_data?.submissionDates;
  return `<article class="panel radar-card"><div class="radar-card-top"><div><span class="eyebrow">${esc(o.platform)} · ${esc(o.areaScope === 'remote' ? 'ONLINE' : o.areaScope === 'local' ? 'NEAR YOU' : 'LOCATION CHECK')}</span><h2>${esc(o.title)}</h2><p>${esc(o.organizer || 'Organizer not listed')}</p></div><button class="radar-star ${saved ? 'saved' : ''}" data-radar-save="${esc(o.id)}" aria-label="${saved ? 'Remove from saved' : 'Save opportunity'}" aria-pressed="${saved}">${saved ? '★' : '☆'}</button></div><div class="radar-facts"><span>⌖ ${esc(place)}</span><span>◷ ${esc(d)}</span><span>⌛ ${esc(deadline)}</span>${submission ? `<span>Submission window ${esc(submission)}</span>` : ''}${team ? `<span>♧ ${esc(team)}</span>` : ''}${o.prize_pool ? `<span>✧ ${esc(o.prize_pool)}</span>` : ''}</div><div class="radar-card-bottom"><span class="radar-source">Source: ${esc(o.platform)} · checked ${esc(radarDate(o.raw_data?.sourceCheckedAt || o.updated_at))}</span><div class="actions">${url ? `<a class="secondary radar-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer">Official event ↗</a>` : '<span class="setting-note">Official link unavailable</span>'}<details><summary class="text-button">Details</summary><div class="radar-detail"><p>${esc(decode(desc))}</p>${eligibility ? `<p><strong>Eligibility:</strong> ${esc(eligibility)}</p>` : ''}<p><strong>Event schedule:</strong> ${esc(d)}. ${esc(deadline)}.</p><p><strong>Data path:</strong> Crawlee fetches the ${esc(o.platform)} public listing. Habit Tracker saves this record locally in backend/data/opportunity-radar/radar.sqlite. The check time is shown above.</p></div></details></div></div></article>`;
}
async function refreshRadar() {
  if (radarState.loading) return;
  radarState.loading = true;
  radarState.error = '';
  try {
    const [data, status] = await Promise.all([
      fetch(`/api/radar/opportunities?scope=${encodeURIComponent(radarState.scope)}`).then((r) =>
        r.json(),
      ),
      fetch('/api/radar/status', { cache: 'no-store' }).then((r) => r.json()),
    ]);
    if (!data.success) throw Error(data.details || 'Could not load opportunities');
    radarState.items = data.opportunities;
    radarState.counts = data.counts;
    radarState.status = status;
    radarState.sync = status.sync || radarState.sync;
  } catch (e) {
    radarState.error = e.message;
  } finally {
    radarState.loading = false;
    if (view === 'radar') {
      render();
      if (radarState.status?.agentResearch?.running)
        setTimeout(() => {
          if (view === 'radar') refreshRadar();
        }, 12000);
    }
  }
}
function radarPage() {
  const status = radarState.status,
    shown = radarState.onlyFavorites
      ? radarState.items.filter((o) => radarState.favorites.includes(o.id))
      : radarState.items;
  const runs = status?.runs || [];
  return (
    header(
      'Find your next build.',
      'Hackathons that fit your skills, your classes, and a reasonable trip from Sonipat.',
    ) +
    `<section class="panel radar-control"><div class="radar-control-top"><div><h2>Your sources, clearly shown</h2><p class="setting-note">${esc(status?.engine || 'Loading scraper status…')} · Saves to <code>backend/data/opportunity-radar/radar.sqlite</code></p><p class="setting-note">Harvests when the app starts and every 12 hours. You can also check now. No browser clicking: Node sends requests to the public source APIs/pages and stores the results in this computer’s local database.</p></div><button class="primary" data-action="radar-scrape" ${status?.scraping ? 'disabled' : ''}>${status?.scraping ? 'Checking sources…' : '↻ Check for events'}</button></div><div class="radar-source-row">${(status?.sources || []).map((s) => `<span class="source-chip ${s.ready ? 'source-ready' : ''}">${esc(s.name)} · ${s.ready ? 'connected' : 'off'}</span>`).join('')}</div>${status?.optionalConnectors?.length ? `<details class="radar-connectors"><summary class="text-button">Optional connectors and their listed costs</summary><div class="radar-detail">${status.optionalConnectors.map((s) => `<p><strong>${esc(s.actor)}</strong> · ${esc(s.price)} · ${s.ready ? 'connected' : 'disabled; no data is sent to it'}</p>`).join('')}</div></details>` : ''}${status?.runs?.length ? `<small>Last check ${esc(new Date(runs[0].timestamp).toLocaleString('en-IN'))} · ${esc(runs[0].status)} · ${runs[0].total_found} fetched</small>${runs[0].sources?.length ? `<p class="setting-note">${runs[0].sources.map((s) => `${esc(s.source)}: ${esc(s.status)}${s.count != null ? ` (${s.count})` : ''}${s.error ? ` — ${esc(s.error)}` : ''}`).join(' · ')}</p>` : ''}` : '<small>No harvest has completed yet.</small>'}${radarState.error ? `<p class="radar-error">${esc(radarState.error)}</p>` : ''}</section><div class="radar-toolbar"><div class="segments">${[
      ['nearby', 'Near me'],
      ['local', 'In person'],
      ['remote', 'Online'],
      ['all', 'All records'],
    ]
      .map(
        ([k, v]) =>
          `<button data-radar-scope="${k}" class="${radarState.scope === k ? 'active' : ''}" aria-pressed="${radarState.scope === k}">${v}${k === 'nearby' ? ` · ${radarState.counts.nearby || 0}` : ''}</button>`,
      )
      .join(
        '',
      )}</div><button class="text-button" data-action="radar-favorites">${radarState.onlyFavorites ? '★ Saved only' : '☆ Saved'}</button></div>${shown.length ? `<div class="radar-grid">${shown.map(radarCard).join('')}</div>` : `<section class="panel empty">${radarState.loading ? 'Checking your sources…' : radarState.onlyFavorites ? 'No saved events in this view yet. Tap ☆ on an event to save it.' : 'No matching events are saved yet. Use “Check for events” to fetch fresh listings.'}</section>`}<p class="setting-note">The nearby view includes online events and in-person events matched to Sonipat or nearby Delhi NCR cities. Farther events stay in the database but are hidden by default. Travel distance is approximate.</p>`
  );
}
function quoteFallback() {
  const lines = [
    'Make one useful thing a little better today.',
    'A steady hour of focus can move a whole project forward.',
    'Start small, finish one clear step, then choose the next.',
    'Build the skill by building something real.',
  ];
  return [lines[new Date().getDate() % lines.length], 'A daily reminder'];
}
async function refreshQuote() {
  try {
    const response = await fetch('/api/daily-quote');
    if (!response.ok) throw Error();
    const data = await response.json();
    if (data.quote && data.author) radarState.quote = data;
  } catch {
    const [quote, author] = quoteFallback();
    radarState.quote = {
      quote,
      author,
      source: 'Daily thought',
      sourceUrl: '',
      date: dateKey(now()),
    };
  }
  if (view === 'radar' || view === 'today') renderQuote();
}
function renderQuote() {
  const el = $('#dailyQuote');
  if (!el || !radarState.quote) return;
  const q = radarState.quote;
  el.innerHTML = `<blockquote>${esc(q.quote)}</blockquote><small>— ${esc(q.author)}</small>${q.sourceUrl ? `<a class="quote-source" href="${esc(q.sourceUrl)}" target="_blank" rel="noopener noreferrer">Source ↗</a>` : ''}`;
}
function radarDateOnly(value) {
  if (!value) return '';
  const raw = String(value).slice(0, 10),
    d = new Date(`${raw}T12:00:00`);
  return Number.isNaN(+d)
    ? ''
    : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
function deadlineSummary(value) {
  if (!value) return 'Deadline not listed';
  const end = String(value).slice(0, 10),
    today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }),
    days = Math.round(
      (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000,
    );
  return days < 0
    ? `Closed ${Math.abs(days)} ${Math.abs(days) === 1 ? 'day' : 'days'} ago · ${radarDateOnly(value)}`
    : days === 0
      ? `Closes today · ${radarDateOnly(value)}`
      : `Closes in ${days} ${days === 1 ? 'day' : 'days'} · ${radarDateOnly(value)}`;
}
function prizeSummary(value) {
  const s = String(value || '').trim();
  if (!s) return 'Prize pool not listed';
  const amounts = [...s.matchAll(/\bINR\s*([\d,]+)/gi)]
    .map((m) => Number(m[1].replace(/,/g, '')))
    .filter(Number.isFinite);
  if (amounts.length) {
    const total = amounts.reduce((a, b) => a + b, 0);
    return `₹${total.toLocaleString('en-IN')} total · ${amounts.length} listed prizes`;
  }
  return s.length > 120 ? `${s.slice(0, 117)}…` : s;
}
function shortResearchText(value, max = 240) {
  const text = String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&quot;/g, '\"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}
function formatResearchDescription(value, max = 1800) {
  const entities = {
    amp: '&',
    nbsp: ' ',
    mdash: '—',
    ndash: '–',
    quot: '\"',
    ldquo: '“',
    rdquo: '”',
    lsquo: '‘',
    rsquo: '’',
    apos: "'",
    '#39': "'",
  };
  const text = String(value || '')
    .replace(/<br\s*\/?\s*>|<\/(?:p|li|div|h[1-6])>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '\n• ')
    .replace(/<[^>]*>/g, ' ')
    .replace(
      /&(#x[\da-f]+|#\d+|amp|nbsp|mdash|ndash|quot|ldquo|rdquo|lsquo|rsquo|apos|#39);/gi,
      (match, key) => {
        if (key[0] === '#') {
          const n =
            key[1].toLowerCase() === 'x' ? parseInt(key.slice(2), 16) : parseInt(key.slice(1), 10);
          return Number.isFinite(n) ? String.fromCodePoint(n) : ' ';
        }
        return entities[key.toLowerCase()] ?? ' ';
      },
    )
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}
function eventBriefRows(description, research) {
  const overview = shortResearchText(
      formatResearchDescription(research.summary || description).replace(/\n/g, ' '),
      150,
    ),
    provided = Array.isArray(research.tasks)
      ? research.tasks.map((task) => shortResearchText(task, 100)).filter(Boolean)
      : [],
    fallback = formatResearchDescription(description)
      .split('\n')
      .filter(
        (line) =>
          line.length > 24 &&
          !/^(hackathon at a glance|why participate|plus:?|use code|open to school students)/i.test(
            line,
          ),
      )
      .slice(0, 2)
      .map((line) => shortResearchText(line, 100)),
    tasks = (provided.length ? provided : fallback)
      .filter((task, index, list) => task !== overview && list.indexOf(task) === index)
      .slice(0, 2);
  return [
    {
      label: 'Overview',
      value: overview || 'Build-focused event; check the official listing for details.',
    },
    ...tasks.map((value, index) => ({ label: index ? 'Also build' : 'Build', value })),
  ];
}
function radarUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' &&
      ['unstop.com', 'devpost.com'].some((h) => u.hostname === h || u.hostname.endsWith(`.${h}`))
      ? u.href
      : '';
  } catch {
    return '';
  }
}
function researchSourceUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' &&
      !u.username &&
      !u.password &&
      !/(^|\.)(localhost|local|internal)$/.test(u.hostname)
      ? u.href
      : '';
  } catch {
    return '';
  }
}
function radarCardV2(o) {
  const a = o.analysis || {},
    research = o.raw_data?.aiResearch || {},
    saved = radarState.favorites.includes(o.id),
    place =
      o.areaScope === 'remote'
        ? o.locationLabel || 'Online · open anywhere'
        : o.locationLabel || research.location || o.location || 'Location not verified',
    locationNote = o.distanceKm != null ? `~${o.distanceKm} km straight-line from Sonipat` : '',
    deadline = deadlineSummary(o.registration_deadline || research.registrationDeadline),
    team =
      o.raw_data?.minTeam || o.raw_data?.maxTeam
        ? `${o.raw_data.minTeam || 1}–${o.raw_data.maxTeam || o.raw_data.minTeam} people`
        : research.teamSize || 'Team size not listed',
    prize = prizeSummary(o.prize_pool || research.prizePool),
    url = radarUrl(o.event_url);
  return `<article class="panel radar-card"><div class="radar-card-top"><div><h2>${esc(o.title)}</h2><p>${esc(o.organizer || 'Organizer not listed')}</p></div><button class="radar-star ${saved ? 'saved' : ''}" data-radar-save="${esc(o.id)}" aria-label="${saved ? 'Remove from saved' : 'Save opportunity'}" aria-pressed="${saved}">${saved ? '★' : '☆'}</button></div><div class="radar-facts"><span>⌖ ${esc(place)}${locationNote ? ` · ${esc(locationNote)}` : ''}</span><span>⌛ ${esc(deadline)}</span><span>♧ Team ${esc(team)}</span><span>✧ ${esc(prize)}</span>${a.effortHours ? `<span>Effort ~${esc(a.effortHours)} h · ${esc(a.confidence)} confidence</span>` : ''}</div><div class="radar-card-actions"><button class="primary radar-summary-button" data-radar-summary="${esc(o.id)}">See event summary</button>${url ? `<a class="secondary radar-official-button" href="${esc(url)}" target="_blank" rel="noopener noreferrer">Official listing ↗</a>` : ''}</div></article>`;
}
function radarUnverifiedCard(o) {
  const url = radarUrl(o.event_url);
  return `<article class="unverified-item"><div><strong>${esc(o.title)}</strong><small>${esc(o.organizer || 'Organizer not listed')} · ${esc(o.locationLabel || 'Location not verified')}</small></div>${url ? `<a class="text-button" href="${esc(url)}" target="_blank" rel="noopener noreferrer">Check official ↗</a>` : '<span class="muted">No verified link</span>'}</article>`;
}
function radarResearchTable(status) {
  return `<button class="primary fetch-events-button" data-action="radar-scrape" ${status.scraping ? 'disabled' : ''}>${status.scraping ? 'Finding events…' : 'Find events ↻'}</button>`;
}
function radarSummary(id) {
  const o = radarState.items.find((item) => item.id === id);
  if (!o) return;
  const a = o.analysis || {},
    r = o.raw_data || {},
    research = {},
    url = radarUrl(o.event_url),
    progress = radarState.progress[id] || 'Not started',
    description = r.description || 'Official event details were not returned by the source.';
  $('#radarDialogContent').innerHTML =
    `<div class="dialog-top"><span class="eyebrow">${esc(o.platform)} · ${esc(a.tier || 'Unverified')} · ${esc(a.difficulty || 'unknown')}</span><button data-action="close-radar" aria-label="Close event summary">×</button></div><h2 id="radarDialogTitle">${esc(o.title)}</h2><p class="radar-dialog-organizer">${esc(o.organizer || 'Organizer not listed')}</p><section class="event-description"><h3>What you’ll build or do</h3><div class="event-brief-wrap"><table class="event-brief-table"><tbody>${eventBriefRows(
      description,
      research,
    )
      .map((row) => `<tr><th scope="row">${esc(row.label)}</th><td>${esc(row.value)}</td></tr>`)
      .join(
        '',
      )}</tbody></table></div></section><label class="radar-progress-label">Your progress<select id="radarProgress" data-radar-progress="${esc(o.id)}">${['Not started', 'Interested', 'Registered', 'Building', 'Submitted', 'Completed', 'Not for me'].map((s) => `<option ${s === progress ? 'selected' : ''}>${s}</option>`).join('')}</select></label><div class="actions">${url ? `<a class="primary" href="${esc(url)}" target="_blank" rel="noopener noreferrer">Open official event ↗</a>` : ''}<span class="setting-note">Transparent local-rule estimate; verify on the official page.</span></div>`;
  $('#radarDialog').showModal();
}
function radarWorkspacePage() {
  const status = radarState.status || {},
    items = radarState.items,
    visible = radarState.onlyFavorites
      ? items.filter((o) => radarState.favorites.includes(o.id))
      : items,
    unverified = visible.filter((o) => o.analysis?.bucket === 'unverified'),
    level = radarState.difficulty,
    tiers = ['S', 'A', 'B', 'C', 'D', 'E'],
    tierItems = visible
      .filter((o) => o.analysis?.bucket === level && o.analysis?.tierKey === radarState.tier)
      .slice(0, 10),
    run = status.runs?.[0],
    profile = status.profile || {};
  const sources = (status.sources || [])
      .map(
        (source) =>
          `<a class="source-chip source-ready" href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">${esc(source.name)} · ${esc(source.method)} ↗</a>`,
      )
      .join(''),
    runSources = (run?.sources || [])
      .map(
        (source) =>
          `${source.source === 'unstop' ? 'Unstop' : source.source === 'devpost' ? 'Devpost' : source.source}: ${source.status}${source.count != null ? ` (${source.count})` : ''}`,
      )
      .join(' · '),
    newEvents =
      run?.new_found != null ? ` · ${run.new_found} new listings; existing records refreshed` : '',
    last = run
      ? `Last event fetch ${new Date(run.timestamp).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })} · ${(Number(run.duration_ms || 0) / 1000).toFixed(1)} sec${run.total_found != null ? ` · ${run.total_found} events${newEvents}` : ''}${runSources ? ` · ${runSources}` : ''}`
      : 'No event fetch completed yet',
    profileSkills = [
      ...(profile.primary || []),
      ...(profile.learning || []).map((skill) => `${skill} · learning`),
    ].filter((skill) => !/(cyber)?security/i.test(skill));
  return `<div class="radar-page">${header('Build something worth showing.', 'Nearby hackathons ranked for your skills, class schedule, and travel distance.')}<section class="panel radar-control"><div class="radar-control-top"><div><h2>Your sources, clearly shown</h2><p class="setting-note">${esc(status.engine || 'Checking source status…')} · ${esc(status.analysisEngine || 'Loading analysis status…')}</p></div><div class="radar-actions">${radarResearchTable(status)}</div></div><div class="radar-source-row">${sources || '<span class="muted">No active sources configured.</span>'}</div><p class="source-last-fetch">${status.scraping ? 'Unstop + Devpost event fetch is in progress…' : esc(last)}${run?.status && run.status !== 'success' ? ` · ${esc(run.status)}` : ''}</p><div class="profile-match"><strong>Matching against what you know</strong><span>${profileSkills.map((skill) => `<i>${esc(skill)}</i>`).join('')}</span><small>${esc(profile.preference || 'Practical build-focused projects; ML-heavy work is lower priority.')}</small></div></section><div class="radar-toolbar"><button class="text-button saved-filter" data-action="radar-favorites">${radarState.onlyFavorites ? '★ Saved only' : '☆ Saved'}</button><div class="segments difficulty-tabs" role="tablist" aria-label="Difficulty"><button role="tab" aria-selected="${level === 'easy'}" tabindex="${level === 'easy' ? 0 : -1}" data-radar-difficulty="easy">Easy <small>${visible.filter((o) => o.analysis?.bucket === 'easy').length}</small></button><button role="tab" aria-selected="${level === 'medium'}" tabindex="${level === 'medium' ? 0 : -1}" data-radar-difficulty="medium">Medium <small>${visible.filter((o) => o.analysis?.bucket === 'medium').length}</small></button><button role="tab" aria-selected="${level === 'hard'}" tabindex="${level === 'hard' ? 0 : -1}" data-radar-difficulty="hard">Hard <small>${visible.filter((o) => o.analysis?.bucket === 'hard').length}</small></button><button role="tab" aria-selected="${level === 'unverified'}" tabindex="${level === 'unverified' ? 0 : -1}" data-radar-difficulty="unverified">Unverified <small>${unverified.length}</small></button></div></div>${level === 'unverified' ? `<section class="panel unverified-panel"><div class="panel-heading"><h2>Nearby listings needing a quick manual check</h2><small>${unverified.length} listed · not auto-ranked</small></div><div class="unverified-list">${unverified.slice(0, radarState.unverifiedLimit).map(radarUnverifiedCard).join('') || '<p class="empty">No nearby listings need verification.</p>'}</div>${unverified.length > radarState.unverifiedLimit ? '<button class="secondary" data-action="more-unverified">Show 10 more</button>' : ''}</section>` : `<section class="radar-results"><div class="tier-tabs" role="tablist" aria-label="Quality tier">${tiers.map((tier) => `<button role="tab" aria-selected="${radarState.tier === tier}" tabindex="${radarState.tier === tier ? 0 : -1}" data-radar-tier="${tier}">${tier} tier <small>${visible.filter((o) => o.analysis?.bucket === level && o.analysis?.tierKey === tier).length}</small></button>`).join('')}</div><div class="results-heading"><div><span class="eyebrow">${level.toUpperCase()} · TIER ${radarState.tier}</span><h2>${level[0].toUpperCase() + level.slice(1)} hackathons for you</h2></div><small>Ranked by evidence, location, rewards, and skill fit · Max 10</small></div>${tierItems.length ? `<div class="radar-grid">${tierItems.map(radarCardV2).join('')}</div>` : '<section class="panel empty">No events meet this tier’s evidence threshold right now. Nothing is added just to fill the list.</section>'}</section>`}</div>`;
}
function header(title, subtitle) {
  return `<div class="page-heading"><div><span class="eyebrow">${simulation ? 'TEST CLOCK · SAMPLE RECORDS' : view === 'today' ? 'AKSHAT’S ROUTINE' : 'AKSHAT’S WORKSPACE'}</span><h1>${title}</h1><p>${subtitle}</p></div><div class="date-control"><button data-date-shift="-1" aria-label="Previous day">‹</button><input type="date" id="selectedDate" aria-label="Selected date" value="${selected}" min="${settings.semesterStart}" max="${settings.semesterEnd}"><button data-date-shift="1" aria-label="Next day">›</button></div></div>`;
}
function weekStrip(modifier = '') {
  const day = new Date(selected + 'T12:00:00').getDay(),
    mon = addDays(selected, -((day + 6) % 7));
  return `<div class="week-strip ${modifier}" aria-label="Choose a day">${Array.from(
    { length: 7 },
    (_, i) => {
      const date = addDays(mon, i);
      return `<button class="day-button ${date === selected ? 'active' : ''}" data-date="${date}" aria-pressed="${date === selected}"><span>${dayNames[new Date(date + 'T12:00:00').getDay()].slice(0, 3)}</span><strong>${Number(date.slice(-2))}</strong>${date === dateKey(now()) ? '<i class="dot"></i>' : ''}</button>`;
    },
  ).join('')}</div>`;
}
const mealIcon = (meal) =>
  Icon({
    name:
      {
        breakfast: 'ph:coffee-fill',
        lunch: 'ph:bowl-food-fill',
        snacks: 'ph:cookie-fill',
        dinner: 'ph:bowl-steam-fill',
      }[meal] || 'ph:bowl-food-fill',
    size: 22,
    className: 'text-current',
  });
const glyph = (t) =>
  Icon({
    name:
      {
        wake: 'ph:sun-horizon-bold',
        freshen: 'ph:shower-bold',
        'morning-study': 'ph:book-open-text-bold',
        packing: 'ph:backpack-bold',
        breakfast: 'ph:coffee-fill',
        leave: 'ph:person-simple-walk-bold',
        lunch: 'ph:bowl-food-fill',
        cooldown: 'ph:moon-stars-bold',
        evening: 'ph:lightbulb-bold',
        'study-one': 'ph:books-bold',
        'study-two': 'ph:books-bold',
        swim: 'ph:person-simple-swim-bold',
        sleep: 'ph:bed-bold',
        'laundry-drop': 'ph:washing-machine-bold',
        'laundry-pickup': 'ph:washing-machine-bold',
      }[t.id] ||
      {
        class: 'ph:chalkboard-teacher-bold',
        contest: 'ph:trophy-bold',
        packing: 'ph:backpack-bold',
        meal: 'ph:bowl-food-fill',
        quiet: 'ph:moon-stars-bold',
        choice: 'ph:lightbulb-bold',
        study: 'ph:books-bold',
        swim: 'ph:person-simple-swim-bold',
        sleep: 'ph:bed-bold',
        laundry: 'ph:washing-machine-bold',
        routine: 'ph:list-checks-bold',
      }[t.kind] ||
      'ph:list-checks-bold',
    size: 22,
    className: 'text-current',
  });
function row(t) {
  const day = currentDay(),
    done = day.done[t.id],
    allowed = canComplete(selected, t, now()),
    live = selected === dateKey(now()) && minuteOf(now()) >= t.start && minuteOf(now()) < t.end,
    expanded = expandedTaskId === t.id,
    rowId = t.kind === 'packing' ? 'packing-row' : `task-${t.id}`,
    roomLabel = /^[A-Z]\d{3}$/.test(t.room || '') ? `Room ${t.room}` : t.room;
  const status = t.room
    ? `<span class="class-meta"><span class="class-room">${esc(roomLabel)}</span><span class="class-reminder">${live ? 'Happening now' : done ? `Completed · ${new Date(done.at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : `Reminder ${timeLabel(t.trigger)}`}</span></span>`
    : done
      ? `${done.status === 'done' ? 'Completed' : esc(done.status)} · ${new Date(done.at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
      : live
        ? 'Happening now'
        : t.kind === 'quiet'
          ? 'Reminders paused'
          : t.kind === 'packing'
            ? `${day.checks.length} / ${packing.length} essentials packed · ${expanded ? 'tap to close' : 'tap to pack'}`
            : t.guided
              ? 'Guided evening'
              : esc(t.kind === 'meal' ? 'Make time to refuel' : 'Daily rhythm');
  const detail = expanded
    ? `<section class="task-inline-detail" id="task-detail-${esc(t.id)}" aria-label="${esc(t.title)} details">${editingTaskId === t.id ? taskFormHTML(t) : inlineTaskDetailHTML(t)}</section>`
    : '';
  return `<article id="${esc(rowId)}" class="task-row ${done ? 'completed' : ''} ${live ? 'current' : ''} ${expanded ? 'expanded' : ''}" data-task-row="${esc(t.id)}">
    <time class="task-time">${timeLabel(t.start)}<span>${timeLabel(t.end)}</span></time>
    <button class="task-main" data-detail="${esc(t.id)}" aria-label="${expanded ? 'Close' : 'Open'} ${esc(t.title)}" aria-expanded="${expanded}" ${expanded ? `aria-controls="task-detail-${esc(t.id)}"` : ''}>
      <span class="task-glyph ${esc(t.kind)}">${glyph(t)}</span><span class="task-copy"><strong>${esc(t.title)}</strong><small class="${live ? 'now-label' : ''}">${status}</small></span>${Icon({ name: 'ph:caret-down', size: 18, className: 'task-expand-icon text-current' })}
    </button>
    <button class="check-button ${done ? 'done' : ''}" data-complete="${esc(t.id)}" ${!allowed ? 'disabled' : ''} aria-label="${done ? 'Undo' : 'Complete'} ${esc(t.title)}"><span class="check-square">${done ? '✓' : allowed ? '' : '·'}</span></button>
    ${detail}
  </article>`;
}
function focusCard(t) {
  if (!t)
    return '<section class="focus-card"><span class="eyebrow">ALL CLEAR</span><h2>A little room to breathe.</h2><p>No scheduled tasks for this date.</p></section>';
  const m = minuteOf(now()),
    isToday = selected === dateKey(now()),
    live = isToday && m >= t.start && m < t.end,
    allowed = canComplete(selected, t, now());
  return `<section class="focus-card"><div class="focus-top"><span class="live-tag"><i></i>${live ? 'RIGHT NOW' : isToday ? 'UP NEXT' : 'DAY PREVIEW'}</span><span class="chip">${live ? `${t.end - m} min left` : isToday && t.start > m ? `In ${t.start - m} min` : timeLabel(t.start)}</span></div><h2>${esc(t.title)}</h2><p>${esc(t.detail)}</p><div class="focus-bottom"><small>${t.room ? `${esc(t.room)}<br>` : ''}${timeLabel(t.start)} – ${timeLabel(t.end)}</small><button class="primary" ${currentDay().done[t.id] && ['class', 'contest'].includes(t.kind) ? 'data-view="notes"' : `data-complete="${t.id}"`} ${!allowed ? 'disabled' : ''}>${currentDay().done[t.id] && ['class', 'contest'].includes(t.kind) ? 'Capture homework' : t.kind === 'packing' ? 'Open checklist' : t.kind === 'class' ? '✓ Mark present' : t.kind === 'choice' ? 'Choose evening' : t.kind === 'wake' ? 'Open wake check-in' : '✓ Mark as done'} <span>↗</span></button></div></section>`;
}
function mealType() {
  const m = minuteOf(now());
  return m < 630 ? 'breakfast' : m < 900 ? 'lunch' : m < 1140 ? 'snacks' : 'dinner';
}
function todayPage() {
  const list = tasks(),
    focus = primaryTask(list),
    day = currentDay(),
    done = list.filter((t) => day.done[t.id]).length,
    pct = list.length ? Math.round((done / list.length) * 100) : 0;
  const upcoming = list.filter(
      (t) => !day.done[t.id] && (selected !== dateKey(now()) || t.end > minuteOf(now())),
    ),
    display =
      filter === 'all' ? list : filter === 'done' ? list.filter((t) => day.done[t.id]) : upcoming;
  const meal = mealType(),
    foods = menu[dayNames[new Date(selected + 'T12:00:00').getDay()]]?.[meal] || [];
  return (
    header(
      selected === dateKey(now())
        ? `${minuteOf(now()) < 720 ? 'Good morning' : minuteOf(now()) < 1020 ? 'Good afternoon' : 'Good evening'}. Find your rhythm.`
        : 'A day, thoughtfully planned.',
      'Your day, in order. Just focus on the next small step.',
    ) +
    weekStrip() +
    `<div class="dashboard-grid"><div class="column">${focusCard(focus)}<section class="panel"><div class="panel-heading"><h2>Your daily flow <small> / ${list.length} steps</small></h2><button class="text-button" data-action="new-task" aria-label="Add personal routine">+ Add</button><button class="text-button" data-action="today">Back to now ↗</button></div><div class="timeline-tools"><div class="segments">${[
      ['upcoming', 'Upcoming'],
      ['all', 'Full day'],
      ['done', 'Done'],
    ]
      .map(
        ([k, v]) =>
          `<button data-filter="${k}" class="${filter === k ? 'active' : ''}" aria-pressed="${filter === k}">${v}</button>`,
      )
      .join(
        '',
      )}</div><small>${dayNames[new Date(selected + 'T12:00:00').getDay()]}</small></div>${display.length ? display.map(row).join('') : '<div class="empty">All clear here. Your full day is one tap away.</div>'}</section></div><div class="column right-column"><section class="panel progress-panel"><div class="panel-heading"><h2>A little progress</h2><span>↗</span></div><div class="progress-layout"><div class="ring" style="--progress:${pct}" role="img" aria-label="${pct}% complete"><strong>${pct}%</strong><small>OF YOUR DAY</small></div><div class="progress-copy"><h3>${done ? `${done} steps completed` : 'A fresh page.'}</h3><p>${done ? 'Small actions add up.<br>Keep going at your pace.' : 'Your first check-in<br>starts the momentum.'}</p></div></div><div class="stat-pair"><div><strong>${done}<small> / ${list.length}</small></strong><small>Tasks completed</small></div><div><strong>${classesFor(selected, settings).length}</strong><small>Classes scheduled</small></div></div></section><section class="panel water-panel"><div class="panel-heading"><h2>Water, a small reset.</h2><span class="muted">${Icon({ name: 'ph:drop-fill', size: 22, className: 'text-current' })}</span></div><div class="water-amount">${(day.water / 1000).toFixed(2)} <small>litres logged today</small></div><div class="water-bars" aria-hidden="true">${Array.from({ length: 8 }, (_, i) => `<span class="${day.water / 250 > i ? 'filled' : ''}"></span>`).join('')}</div><button class="secondary full" data-action="water" ${selected > dateKey(now()) ? 'disabled' : ''}>+ &nbsp; I drank 250 ml</button></section><section class="panel meal-panel"><div class="panel-heading"><h2>On the menu</h2><button data-view="meals" class="text-button">View all ↗</button></div><div class="meal-summary"><span class="tile-icon">${mealIcon(meal)}</span><div><h3>${meal[0].toUpperCase() + meal.slice(1)}</h3><p>${foods.length ? esc(foods.slice(0, 3).join(' · ')) : 'Open meals to see your saved menu.'}</p><small>Saved campus menu · confirm locally</small></div></div></section><section class="panel meal-panel"><div class="panel-heading"><h2>Leave nothing behind.</h2><span>↗</span></div><p class="muted">${day.checks.length} of ${packing.length} bag essentials checked.</p><button class="text-button" data-detail="packing">Open packing checklist →</button></section></div></div>`
  );
}
function classRow(t, attendance, subject) {
  const day = currentDay(),
    done = day.done[t.id],
    allowed = canComplete(selected, t, now()),
    live = selected === dateKey(now()) && minuteOf(now()) >= t.start && minuteOf(now()) < t.end,
    subjectStatus = subject?.total ? `${Math.round(subject.percent)}% overall attendance` : '';
  const note = done
    ? `${done.status === 'done' ? 'Completed' : esc(done.status)} · ${new Date(done.at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
    : live
      ? 'Happening now'
      : `${esc(t.room || 'Class')} · ${attendance ? `Attendance ${esc(attendance)}` : `Reminder ${timeLabel(t.trigger)}`}`;
  return `<article class="task-row class-row ${done ? 'completed' : ''} ${live ? 'current' : ''}" data-task-row="${t.id}"><time class="task-time">${timeLabel(t.start)}<span>${timeLabel(t.end)}</span></time><button class="task-main class-task-main" data-detail="${t.id}" aria-label="Open ${esc(t.title)}"><span class="task-glyph ${t.kind}">${glyph(t)}</span><span><strong>${esc(t.title)}</strong><small>${note}${subjectStatus ? ` · ${subjectStatus}` : ''}</small></span></button><button class="text-button class-attendance-link" data-detail="${t.id}"><span class="notes-wide">Notes & attendance ↗</span><span class="notes-small">Details ↗</span></button><button class="check-button ${done ? 'done' : ''}" data-complete="${t.id}" ${!allowed ? 'disabled' : ''} aria-label="${done ? 'Undo' : 'Complete'} ${esc(t.title)}"><span class="check-square">${done ? '✓' : allowed ? '' : '·'}</span></button></article>`;
}
function attendanceStat(label, group, fallback) {
  const pending = academicLoading || (!academicData && !academicError),
    total = Number(group?.total) || 0,
    attended = Number(group?.attended) || 0,
    percent = total
      ? Math.max(0, Math.min(100, Math.round(Number(group?.percent) || (attended / total) * 100)))
      : null,
    value = percent === null ? (pending ? '…' : '—') : `${percent}%`,
    caption = total
      ? `${attended} of ${total} lectures`
      : pending
        ? 'Loading saved attendance'
        : fallback;
  return `<section class="panel class-stat"><div class="class-stat-heading"><small>${label}</small><span>${percent === null ? 'LOCAL' : 'SYNCED'}</span></div><strong class="summary-number">${value}</strong><small class="class-stat-caption">${caption}</small>${percent === null ? '<div class="class-stat-meter empty" aria-hidden="true"></div>' : `<div class="class-stat-meter" role="img" aria-label="${percent}% attendance"><span style="width:${percent}%"></span></div>`}</section>`;
}
function semesterIndicator() {
  const label = academicData?.semester || 'Semester 1',
    index = Number(label.match(/\d+/)?.[0] || 1),
    today = dateKey(now()),
    start = settings.semesterStart,
    end = settings.semesterEnd,
    phase = today < start ? 'Begins soon' : today > end ? 'Term ended' : 'In progress',
    dateOptions = { day: 'numeric', month: 'short', year: 'numeric' },
    range = `${new Date(start + 'T12:00:00').toLocaleDateString('en-IN', dateOptions)} – ${new Date(end + 'T12:00:00').toLocaleDateString('en-IN', dateOptions)}`;
  return `<div class="semester-indicator" role="status"><span class="eyebrow">ACADEMIC TERM</span><strong>${esc(label)} · ${phase}</strong><small>${esc(range)} <i aria-hidden="true">·</i> Next up: Semester ${index + 1}</small></div>`;
}
let academicData = null,
  academicLoading = false,
  academicError = '';
async function loadAcademic() {
  if (academicLoading) return;
  academicLoading = true;
  try {
    const r = await fetch('/api/academic');
    if (!r.ok) throw Error('Could not load the local academic snapshot');
    academicData = await r.json();
    academicError = '';
  } catch (e) {
    academicError = e.message;
  } finally {
    academicLoading = false;
    if (
      [
        'academic',
        'classes',
        'academic-timetable',
        'academic-attendance',
        'academic-mail',
      ].includes(view)
    )
      render();
  }
}
function timetablePage() {
  const d = academicData || {},
    days = buildWeeklyTimetable(selected, now(), d.importedAt, d.schedule || [], tasks),
    subjects = d.subjects || [];
  const list = tasks().filter((t) => ['class', 'contest'].includes(t.kind));
  const att = currentDay().attendance;
  const dayName = dayNames[new Date(selected + 'T12:00:00').getDay()];
  const head =
    header('Academic Timetable', 'Section D · Group 4 · Lab 1 · NST and RUFP classes together.') +
    `<div class="academic-toolbar glass-surface">
   <div>
    <span class="status-dot"></span>
    <span>${d.importedAt ? `NST snapshot updated ${esc(new Date(d.importedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }))}` : academicLoading ? 'Loading your local NST snapshot' : academicError ? 'NST snapshot unavailable' : 'NST snapshot available'}</span>
    <small>Stored on this device · ${esc(d.semester || 'Semester 1')}</small>
   </div>
   <small>Section D RUFP classes are added from your routine.</small>
  </div>` +
    weekStrip('classes-week-strip') +
    semesterIndicator();

  if (academicLoading && !academicData)
    return (
      head + `<section class="panel academic-empty"><h2>Opening your timetable…</h2></section>`
    );

  const todayBoard = `<section class="panel classes-board glass-surface" style="margin-bottom:20px">
  <div class="panel-heading">
   <h2>${dayName}’s classes</h2>
   <small>PDF · page 4 · 9-minute reminders</small>
  </div>
  ${
    list.length
      ? list
          .map((t) => {
            const subject = subjects.find(
              (s) => s.name?.trim().toLowerCase() === t.title.trim().toLowerCase(),
            );
            return classRow(t, att[t.id], subject);
          })
          .join('')
      : '<p class="empty">No classes scheduled in the PDF timetable for this date. Enjoy the space.</p>'
  }
 </section>`;

  const timetableCards = days
    .map((day) => {
      return `<article class="academic-day-card" data-weekday="${esc(day.key)}">
  <div class="academic-date">
   <strong>${esc(day.badge)}</strong>
   <small>${esc(day.label)}</small>
  </div>
  <ul>
   ${day.items.map((item) => `<li data-class-source="${item.source.toLowerCase()}"><time>${esc(item.time)}</time><span><span class="academic-class-title"><i class="academic-source ${item.source.toLowerCase()}">${item.source}</i><strong>${esc(item.title)}</strong></span>${item.location ? `<small>${esc(item.location)}</small>` : ''}${item.topic ? `<small>Topic: ${esc(item.topic)}</small>` : ''}</span></li>`).join('') || '<li class="academic-no-class">No NST snapshot or RUFP class for this day.</li>'}
  </ul>
 </article>`;
    })
    .join('');

  const scheduleSection = `<section id="timetable-content" class="panel academic-integrated glass-surface">
  <div class="panel-heading">
   <div>
    <span class="eyebrow">SECTION D · NST + RUFP</span>
    <h2>Weekly timetable overview</h2>
   </div>
   <span class="muted">${days.length} days</span>
  </div>
  <div class="academic-schedule-list">${timetableCards}</div>
 </section>`;

  return head + todayBoard + scheduleSection;
}
function attendancePage() {
  const d = academicData || {},
    summary = d.attendance || {},
    subjects = d.subjects || [];

  const attendanceCards = [
    ['Combined attendance', summary.combined],
    ['NST Core', summary.nst],
    ['RUFP Foundation', summary.rufp],
  ]
    .map(([name, item]) => {
      const pct = Math.max(0, Math.min(100, Number(item?.percent) || 0));
      return `<article class="academic-stat">
   <span>${name}</span>
   <strong>${item?.total ? `${pct}%` : '—'}</strong>
   <small>${item?.total ? `${item.attended} / ${item.total} lectures` : 'No attendance snapshot'}</small>
   <div class="academic-meter"><i style="width:${pct}%"></i></div>
  </article>`;
    })
    .join('');

  const courseCards = subjects
    .map((s) => {
      const pct = Math.max(0, Math.min(100, Number(s.percent) || 0)),
        tone = pct >= 80 ? 'good' : pct >= 75 ? 'steady' : 'risk';
      return `<article class="academic-course ${tone}">
   <div class="academic-course-top">
    <span class="academic-badge">${esc(s.group)}</span>
    <strong>${pct}%</strong>
   </div>
   <h3>${esc(s.name)}</h3>
   <p>${esc(s.code || 'Course')} · ${Number(s.attended) || 0} attended · ${Number(s.total) || 0} total</p>
   <div class="academic-meter"><i style="width:${pct}%"></i></div>
   <small>${s.canMiss ? `Can miss ${Number(s.canMiss)} safely` : s.needAttend ? `Attend ${Number(s.needAttend)} more to reach 75%` : pct >= 75 ? 'On track for 75%' : 'Review attendance'}</small>
  </article>`;
    })
    .join('');

  const head =
    header('Course Attendance', 'Track NST Core, RUFP Foundation, and 75% minimum criteria.') +
    `<div class="academic-toolbar glass-surface">
   <div>
    <span class="status-dot"></span>
    <span>${d.importedAt ? `Snapshot updated ${esc(new Date(d.importedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }))}` : academicLoading ? 'Loading attendance…' : 'Saved attendance snapshot'}</span>
    <small>Stored on this device · ${esc(d.semester || 'Semester 1')}</small>
   </div>
  </div>`;

  if (academicLoading && !academicData)
    return head + `<section class="panel academic-empty"><h2>Opening attendance…</h2></section>`;

  return (
    head +
    `<section id="attendance-content" class="academic-integrated">
  <div class="panel-heading">
   <div>
    <span class="eyebrow">ATTENDANCE OVERVIEW</span>
    <h2>Aggregated metrics</h2>
   </div>
   <span class="muted">${subjects.length} courses</span>
  </div>
  <div class="academic-stats">${attendanceCards}</div>
  <div class="panel-heading course-breakdown-heading">
   <div>
    <span class="eyebrow">COURSE BREAKDOWN</span>
    <h2>Subject attendance cards</h2>
   </div>
  </div>
  <div class="academic-course-grid">${courseCards || '<p class="empty">No course attendance records yet.</p>'}</div>
 </section>`
  );
}
function academicMailPage() {
  const d = academicData || {},
    sources = radarState.sync?.sources || {};
  const emails =
    ['success', 'partial'].includes(sources.gmail?.status) && Array.isArray(sources.gmail.items)
      ? sources.gmail.items
      : d.emails || [];
  const urgent = emails.filter((x) => /urgent|high|critical/i.test(x.priority)).length;

  const mail = emails
    .map(
      (item) => `<article class="academic-mail">
  <div class="academic-mail-icon" aria-hidden="true">✉</div>
  <div class="academic-mail-content">
   <div class="academic-mail-top">
    <span class="academic-badge">${esc(item.category || 'Official')}</span>
    ${item.priority ? `<span class="academic-priority ${/urgent|high|critical/i.test(item.priority) ? 'urgent' : ''}">${esc(item.priority)}</span>` : ''}
    <time>${esc(item.date)}</time>
   </div>
   <h3>${esc(item.subject)}</h3>
   <p class="academic-mail-sender">${esc(item.sender)}</p>
   ${item.snippet ? `<p>${esc(item.snippet)}</p>` : ''}
   ${item.actionItem ? `<p class="academic-action"><strong>Next step</strong> · ${esc(item.actionItem)}</p>` : ''}
  </div>
 </article>`,
    )
    .join('');

  const head =
    header('Academic Mail', 'Official campus notices, faculty communications, and announcements.') +
    `<div class="academic-toolbar glass-surface">
   <div>
    <span class="status-dot"></span>
    <span>${emails.length} messages · ${urgent} priority notices</span>
    <small>Bounded local snapshot · Rishihood & NST</small>
   </div>
  </div>`;

  return (
    head +
    `<section id="mail-content" class="academic-integrated">
  <div class="panel-heading">
   <div>
    <span class="eyebrow">MAILBOX FEED</span>
    <h2>Recent communications</h2>
   </div>
   <small>${emails.length} stored messages · max 12</small>
  </div>
  <div class="academic-mail-list">${mail || '<div class="panel academic-empty"><p>No cached academic messages. Use Update all in the top bar to fetch mail.</p></div>'}</div>
 </section>`
  );
}
function notesPage() {
  const notes = db().notes;
  const head = header(
    'Study Notes & Homework',
    'Capture homework now. It will be here when you sit down to study.',
  );

  return (
    head +
    `<div id="notes-content" class="academic-integrated academic-notes-grid">
  <section class="panel glass-surface">
   <div class="panel-heading">
    <div>
     <span class="eyebrow">STUDY QUEUE</span>
     <h2>Notes & assignments</h2>
    </div>
    <small>${notes.filter((n) => !n.done).length} open</small>
   </div>
   ${
     notes.length
       ? notes
           .map(
             (n) => `<article class="note-card">
    <div class="panel-heading">
     <small>${esc(n.subject)} · ${esc(n.date)}</small>
     <button class="check-button ${n.done ? 'done' : ''}" data-note-toggle="${n.id}" aria-label="${n.done ? 'Reopen' : 'Complete'} homework">
      <span class="check-square">${n.done ? '✓' : ''}</span>
     </button>
    </div>
    <p>${esc(n.text)}</p>
    ${n.photo ? `<img src="${n.photo}" alt="Homework attachment">` : ''}
   </article>`,
           )
           .join('')
       : '<div class="empty">A clear mind starts here.<br>Add your next assignment or a quick class note.</div>'
   }
  </section>
  <section class="panel glass-surface">
   <div class="panel-heading">
    <div>
     <span class="eyebrow">CAPTURE</span>
     <h2>Capture a thought</h2>
    </div>
   </div>
   <form id="noteForm" class="form-stack" style="margin-top:14px">
    <label>Subject
     <select name="subject">${['General', 'Problem solving & programming', 'Mathematics I', 'Systems & AI', 'Social Communication', 'Self & Society', 'Understanding India'].map((s) => `<option>${s}</option>`).join('')}</select>
    </label>
    <label>Homework or note
     <textarea name="text" maxlength="5000" placeholder="What do you need to work on?" required></textarea>
    </label>
    <label>Photo (optional)
     <input name="photo" type="file" accept="image/*" capture="environment">
    </label>
    <button class="primary">Save note ↗</button>
   </form>
  </section>
 </div>`
  );
}
function classesPage() {
  return timetablePage();
}
function academicPage() {
  return timetablePage();
}
function laundryPickupTime(key) {
  const schedule = tasks(key),
    classes = schedule.filter((t) => t.kind === 'class');
  const lastClassEnd = classes.length ? Math.max(...classes.map((t) => t.end)) : 0;
  const eveningStart = Math.max(16 * 60, Math.ceil((lastClassEnd + 20) / 10) * 10);
  const windows = [
    [eveningStart, 18 * 60],
    [8 * 60 + 30, 10 * 60],
  ];
  for (const [start, end] of windows)
    for (let minute = start; minute + 10 <= end; minute += 10)
      if (!schedule.some((t) => t.kind !== 'quiet' && t.start < minute + 10 && t.end > minute))
        return { start: minute, end: minute + 10 };
  return null;
}
function laundryDateLabel(key) {
  return new Date(key + 'T12:00:00').toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  });
}
function laundryCard(date, laundry) {
  const time = laundryPickupTime(laundry.due),
    pickup = time
      ? `${timeLabel(time.start)}–${timeLabel(time.end)}`
      : 'No free counter window found',
    hasClasses = tasks(laundry.due).some((t) => t.kind === 'class');
  return `<div class="note-card laundry-record"><h3>Laundry dropped off · ${esc(laundryDateLabel(date))}</h3><p>Pickup ${esc(laundryDateLabel(laundry.due))}${time ? ` · ${esc(pickup)}` : ''} · ${laundry.collected ? 'Collected' : 'Waiting'}</p>${time ? `<small>${time.start >= 16 * 60 ? (hasClasses ? 'After your last class · ' : 'Afternoon pickup · ') : 'Morning pickup · '}Counter open 8:30–10:00 AM and 4:00–6:00 PM</small>` : '<small>Check with the laundry counter for another time.</small>'}${!laundry.collected ? `<button class="secondary" data-laundry-collect="${date}">Mark laundry collected</button>` : ''}</div>`;
}
const swimItems = ['Towel', 'Swimming goggles', 'Swim cap', 'Swimming pants', 'Lock the door'];
function swimmingChecklist() {
  const checks = currentDay().swimChecks || [];
  return `<div class="checklist swim-checklist">${swimItems.map((item, i) => `<label><input type="checkbox" data-swim-pack="${i}" ${checks.includes(i) ? 'checked' : ''} ${selected > dateKey(now()) ? 'disabled' : ''}>${item}</label>`).join('')}</div><p class="setting-note">Monday, Wednesday and Friday · 7:30–8:15 PM. Sunday is closed.</p>`;
}
function lifePage() {
  return (
    header(
      'A place for the little things.',
      'Laundry, clothes and a bag that is ready when you are.',
    ) +
    `<div class="wide-grid life-page"><section class="panel"><h2>The laundry loop</h2><p class="setting-note">Drop off on an open day · pickup exactly 3 days later. I’ll find a free counter time around that day’s classes.</p><div class="actions"><button class="secondary" data-action="laundry-drop">Log a drop-off</button></div>${Object.entries(
      db().days,
    )
      .filter(([, d]) => d.laundry)
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([date, d]) => laundryCard(date, d.laundry))
      .join(
        '',
      )}</section><section class="panel"><h2>Your wardrobe</h2><p class="setting-note">Add your real clothes. Track clean, wearing and laundry states.</p><form id="wardrobeForm" class="form-stack" style="margin-top:18px"><label>Item name<input name="name" maxlength="100" required placeholder="Olive T-shirt"></label><label>Clothing photo<input name="photo" type="file" accept="image/*"></label><button class="secondary">Add clothing</button></form>${db()
      .wardrobe.map(
        (w) =>
          `<article class="wardrobe-item">${w.photo ? `<img src="${w.photo}" alt="${esc(w.name)}">` : '<span class="tile-icon">♧</span>'}<strong>${esc(w.name)}</strong><select data-wardrobe="${w.id}" aria-label="Status of ${esc(w.name)}">${['Clean', 'Wearing', 'Laundry'].map((s) => `<option ${s === w.status ? 'selected' : ''}>${s}</option>`).join('')}</select></article>`,
      )
      .join(
        '',
      )}</section><section class="panel"><h2>Swimming rhythm</h2>${swimmingChecklist()}</section><section class="panel"><h2>Packing, without the backtracking.</h2>${checklistHTML()}<p class="setting-note">Checklist progress saves after every tap.</p></section></div>`
  );
}
function reportData(key) {
  const d = currentDay(key),
    list = tasks(key);
  return {
    date: key,
    generatedAt: new Date().toISOString(),
    simulation: !!simulation,
    completed: list.filter((t) => d.done[t.id]).length,
    scheduled: list.length,
    waterMl: d.water,
    attendance: d.attendance,
    contestScores: d.scores,
    eveningMode: d.mode,
    records: d.done,
    events: db().events.filter((e) => e.date === key),
  };
}
function contestSummary() {
  const entries = Object.entries(db().days).filter(([, d]) => Number.isFinite(d.scores?.contest));
  return `<section class="panel" style="margin-top:20px"><div class="panel-heading"><h2>Contest progress</h2><small>Self-reported scores</small></div>${[
    'Problem solving & programming',
    'Mathematics I',
    'Systems & AI',
  ]
    .map((subject) => {
      const scores = entries
        .filter(([date, d]) => (d.scoreSubject || contestSubject(date, settings)) === subject)
        .map(([, d]) => d.scores.contest);
      return `<article class="note-card"><h3>${subject}</h3><p class="setting-note">${scores.length ? `${(scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1)}% average · ${scores.length} contest${scores.length === 1 ? '' : 's'}` : 'No scores recorded yet.'}</p></article>`;
    })
    .join('')}</section>`;
}
function reportsPage() {
  const report = reportData(selected),
    events = report.events.slice().reverse();
  return (
    header(
      'Look back, without the noise.',
      'An honest record of what you checked in. No invented scores.',
    ) +
    `<div class="subject-summary"><section class="panel"><small>Completed steps</small><strong class="summary-number">${report.completed}/${report.scheduled}</strong></section><section class="panel"><small>Water logged</small><strong class="summary-number">${(report.waterMl / 1000).toFixed(2)} L</strong></section><section class="panel"><small>Check-ins</small><strong class="summary-number">${events.length}</strong></section></div><section class="panel"><div class="panel-heading"><h2>Your daily record</h2><div class="actions report-actions"><button class="primary" data-action="backup">Export all data ↓</button><button class="secondary" data-action="export-report">Download report ↓</button></div></div><div class="table-wrap"><table class="history"><thead><tr><th>Time</th><th>Activity</th><th>Action</th></tr></thead><tbody>${events.map((e) => `<tr><td>${new Date(e.effectiveTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' })}</td><td>${esc(e.title || e.taskId || 'Daily check-in')}</td><td>${esc(e.type)}</td></tr>`).join('') || '<tr><td colspan="3">Nothing recorded for this day yet.</td></tr>'}</tbody></table></div><p class="setting-note">Reports use your recorded actions, not an assumed discipline rating. Download and share manually. Parent delivery is not connected.</p></section><section class="panel" style="margin-top:20px"><div class="panel-heading"><h2>This week, one day at a time</h2></div>${Array.from(
      { length: 7 },
      (_, i) => {
        const date = addDays(selected, -6 + i),
          r = reportData(date);
        return `<button class="task-main full" style="padding:10px 0;border-top:1px solid var(--line)" data-date="${date}"><strong>${date}</strong><small style="margin-left:auto">${r.completed} / ${r.scheduled} completed →</small></button>`;
      },
    ).join('')}</section>${contestSummary()}`
  );
}
function reshapeRoutinePage() {
  const page = $('#page'),
    grid = page.querySelector('.dashboard-grid');
  if (!grid) return;
  const focus = grid.querySelector('.focus-card'),
    progress = grid.querySelector('.progress-panel'),
    flow = grid.querySelector('.column > .panel');
  const layout = document.createElement('div'),
    summary = document.createElement('div');
  layout.className = 'routine-layout';
  summary.className = 'routine-summary-grid';
  if (focus) {
    focus.classList.add('routine-focus');
    summary.append(focus);
  }
  if (progress) {
    progress.classList.add('routine-progress');
    summary.append(progress);
  }
  if (flow) {
    flow.classList.add('routine-flow');
    const heading = flow.querySelector('.panel-heading h2');
    if (heading) heading.firstChild.textContent = 'Daily routine';
    flow.querySelector('.segments')?.remove();
    const timeline = document.createElement('div');
    timeline.className = 'routine-timeline';
    const rail = document.createElement('span');
    rail.className = 'routine-rail';
    rail.setAttribute('aria-hidden', 'true');
    timeline.append(rail);
    flow
      .querySelectorAll(':scope > .task-row, :scope > .empty')
      .forEach((row) => timeline.append(row));
    flow.querySelector('.timeline-tools')?.after(timeline);
    if (!flow.querySelector('.timeline-tools')) flow.append(timeline);
    if (expandedTaskId === 'new') {
      const editor = document.createElement('section');
      editor.id = 'new-routine-form';
      editor.className = 'routine-new-detail';
      editor.innerHTML = taskFormHTML(null);
      timeline.before(editor);
    }
    timeline.setAttribute('role', 'region');
    timeline.setAttribute('aria-label', 'Daily routine steps');
    flow.querySelector('.timeline-tools small')?.remove();
    layout.append(summary, flow);
  } else layout.append(summary);
  grid.replaceWith(layout);
  const title = page.querySelector('.page-heading h1');
  if (title && selected === dateKey(now())) {
    title.textContent = `${minuteOf(now()) < 720 ? 'Good morning' : minuteOf(now()) < 1020 ? 'Good afternoon' : 'Good evening'}, Akshat.`;
  }
  const chip = page.querySelector('.routine-focus .chip');
  if (chip) {
    const match = chip.textContent.match(/^(In )?(\d+) min( left)?$/);
    if (match) {
      const min = Number(match[2]),
        hours = Math.floor(min / 60),
        rest = min % 60;
      chip.textContent = `${match[1] || ''}${hours ? `${hours} ${hours === 1 ? 'hour' : 'hours'}` : ''}${hours && rest ? ' ' : ''}${rest ? `${rest} ${rest === 1 ? 'minute' : 'minutes'}` : ''}${match[3] || ''}`;
    }
  }
  page.querySelector('.routine-focus .focus-bottom')?.remove();
}
function mealsPage() {
  const day = dayNames[new Date(selected + 'T12:00:00').getDay()],
    data = menu[day] || {};
  return (
    header(
      'Make room for a good meal.',
      'A saved menu for quick access, even on a slow connection.',
    ) +
    weekStrip() +
    `<div class="wide-grid">${['breakfast', 'lunch', 'snacks', 'dinner'].map((type, i) => `<section class="panel"><div class="panel-heading"><span class="tile-icon">${mealIcon(type)}</span><span class="eyebrow">MEAL 0${i + 1}</span></div><h2>${type[0].toUpperCase() + type.slice(1)}</h2><p class="setting-note">${['8:00 AM breakfast opening · routine at 8:25 AM', '1:00–2:00 PM · your lunch window', '5:00–6:00 PM · quiet hour', '8:00–9:30 PM · dinner window'][i]}</p><div class="menu-items">${(data[type] || []).map((d) => `<span>${esc(d)}</span>`).join('') || '<p class="muted">No saved dishes for this day.</p>'}</div></section>`).join('')}</div><p class="mess-menu-source setting-note">Campus menu synced with <a href="https://ru-print.vercel.app" target="_blank" rel="noopener noreferrer">RU Print</a>.</p>`
  );
}
function renderFoodPage() {
  const page = $('#page'),
    day = currentDay(),
    entries = day.foodEntries || [],
    canLog = selected <= dateKey(now());
  const section = document.createElement('div');
  section.className = 'food-tracking';
  const dayName = dayNames[new Date(selected + 'T12:00:00').getDay()],
    breakfastMenu = menu[dayName]?.breakfast || [];
  section.innerHTML = `<div class="food-grid"><section class="panel water-panel"><div class="panel-heading"><h2>Water</h2><span class="muted">Daily log</span></div><div class="water-amount">${(day.water / 1000).toFixed(2)} <small>litres · ${day.water} ml</small></div><div class="water-bars" aria-hidden="true">${Array.from({ length: 8 }, (_, i) => `<span class="${day.water / 250 > i ? 'filled' : ''}"></span>`).join('')}</div><div class="water-actions"><button class="secondary" data-water-add="250" ${!canLog ? 'disabled' : ''}>+ 250 ml</button><button class="secondary" data-water-add="500" ${!canLog ? 'disabled' : ''}>+ 500 ml</button></div><form id="waterForm" class="form-stack"><label>Other amount (ml)<input name="ml" type="number" min="1" max="3000" step="50" required ${!canLog ? 'disabled' : ''}></label><button class="secondary" ${!canLog ? 'disabled' : ''}>Log water</button></form></section><section class="panel"><div class="panel-heading"><h2>Log food or drink</h2></div><form id="foodForm" class="form-stack"><label>Meal<select name="meal"><option>Breakfast</option><option>Lunch</option><option>Snacks</option><option>Dinner</option><option>Other</option></select></label><div class="food-item-field"><label for="foodItem">Food or drink</label><div class="food-item-control"><input id="foodItem" name="item" maxlength="500" required placeholder="What did you have?"><button type="button" class="use-menu-button" data-use-menu ${breakfastMenu.length ? '' : 'disabled'}>Use planned menu</button></div><small>Fills in the dishes listed for your selected day.</small></div><label>Amount or note <span class="muted">optional</span><input name="amount" maxlength="100" placeholder="1 bowl, 250 ml…"></label><button class="primary" ${!canLog ? 'disabled' : ''}>Add to food log</button></form></section></div><section class="panel food-log"><div class="panel-heading"><h2>${selected === dateKey(now()) ? 'Today' : 'Selected day'}’s food & drink</h2><small>${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}</small></div>${
    entries.length
      ? entries
          .slice()
          .reverse()
          .map(
            (entry) =>
              `<article class="food-entry"><div><strong>${esc(entry.item)}</strong><small>${esc(entry.meal)}${entry.amount ? ` · ${esc(entry.amount)}` : ''} · ${esc(new Date(entry.at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }))}</small></div><button class="text-button" data-food-remove="${esc(entry.id)}" aria-label="Remove ${esc(entry.item)}">Remove</button></article>`,
          )
          .join('')
      : '<div class="empty">Nothing logged yet. Add a meal, snack, drink, or water above.</div>'
  }</section>`;
  const oldMenu = page.querySelector('.wide-grid');
  if (oldMenu) {
    const heading = document.createElement('h2');
    heading.className = 'saved-menu-heading';
    heading.textContent = 'Saved campus menu';
    oldMenu.before(section);
    oldMenu.before(heading);
  } else page.append(section);
}
function render() {
  const aliasMap = {
    academic: 'academic-timetable',
    classes: 'academic-timetable',
    timetable: 'academic-timetable',
    attendance: 'academic-attendance',
    mail: 'academic-mail',
    notes: 'academic-notes',
    meals: 'food',
  };
  if (aliasMap[view]) view = aliasMap[view];
  if (!labels[view]) {
    view = 'today';
    if (location.hash === '#settings') history.replaceState(null, '', '#today');
  }
  nav();
  const pages = {
    today: todayPage,
    'academic-timetable': timetablePage,
    'academic-attendance': attendancePage,
    'academic-mail': academicMailPage,
    'academic-notes': notesPage,
    food: mealsPage,
    life: lifePage,
    radar: radarWorkspacePage,
    reports: reportsPage,
  };
  const renderFn = pages[view] || todayPage;
  document.body.dataset.view = view;
  $('#page').innerHTML = renderFn();
  if (view === 'today') reshapeRoutinePage();
  if (view === 'food') renderFoodPage();
  if (pendingJumpId) {
    const target = document.getElementById(pendingJumpId);
    pendingJumpId = '';
    requestAnimationFrame(() => target?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }
  renderQuote();
  updateClock();
  if (view === 'radar') scheduleRadarStatusPoll(radarState.status ? 5000 : 1000);
  if (view === 'radar' && !radarState.status && !radarState.loading) refreshRadar();
  if (['academic-timetable', 'academic-attendance', 'academic-mail'].includes(view)) {
    if (!academicData && !academicLoading) loadAcademic();
    if (!radarState.sync)
      fetch('/api/sync/status')
        .then((r) => r.json())
        .then((status) => {
          radarState.sync = status;
          render();
        })
        .catch(() => {});
  }
}
window.addEventListener('dashboard:sync-status', (event) => {
  const snapshot = event.detail;
  radarState.sync = snapshot;
  if (radarState.status) radarState.status.sync = snapshot;
});
window.addEventListener('dashboard:sync-complete', async (event) => {
  const snapshot = event.detail;
  radarState.sync = snapshot;
  if (radarState.status) radarState.status.sync = snapshot;
  if (view === 'radar') await refreshRadar();
  if (['academic-timetable', 'academic-attendance', 'academic-mail'].includes(view)) {
    academicData = null;
    await loadAcademic();
  }
  if (
    view !== 'radar' &&
    !['academic-timetable', 'academic-attendance', 'academic-mail'].includes(view)
  )
    render();
});
function scheduleRadarStatusPoll(delay) {
  if (view !== 'radar' || radarStatusPollTimer) return;
  radarStatusPollTimer = setTimeout(pollRadarStatus, delay);
}
async function pollRadarStatus() {
  radarStatusPollTimer = null;
  if (view !== 'radar' || radarStatusPollBusy) return;
  radarStatusPollBusy = true;
  const previous = JSON.stringify({
    sync: radarState.sync,
    scraping: radarState.status?.scraping,
    run: radarState.status?.runs?.[0]?.id,
  });
  try {
    const response = await fetch('/api/radar/status', { cache: 'no-store' });
    if (!response.ok) throw Error('Sync status unavailable');
    const status = await response.json();
    radarState.status = status;
    radarState.sync = status.sync || radarState.sync;
    const current = JSON.stringify({
      sync: radarState.sync,
      scraping: status.scraping,
      run: status.runs?.[0]?.id,
    });
    if (previous !== current && view === 'radar') render();
  } catch {
  } finally {
    radarStatusPollBusy = false;
    if (view === 'radar')
      scheduleRadarStatusPoll(
        radarState.sync?.running || radarState.status?.scraping ? 1000 : 5000,
      );
  }
}
async function harvestRadar() {
  try {
    const response = await fetch('/api/radar/scrape', { method: 'POST' }),
      result = await response.json();
    if (!response.ok) throw Error(result.message || 'Could not start the source check');
    radarState.status = { ...(radarState.status || {}), scraping: true };
    render();
    toast('Checking Unstop and Devpost. Your event list will refresh when the check finishes.');
    const poll = async () => {
      try {
        const response = await fetch('/api/radar/status', { cache: 'no-store' });
        if (!response.ok) throw Error('Could not read event fetch status');
        const status = await response.json();
        radarState.status = status;
        if (!status.scraping) {
          await refreshRadar();
          const run = status.runs?.[0];
          toast(
            run
              ? `${run.total_found || 0} listings checked · ${run.new_found || 0} new. Event list refreshed.`
              : 'Event fetch finished and the list was refreshed.',
          );
          return;
        }
        if (view === 'radar') render();
        setTimeout(poll, 1500);
      } catch (error) {
        radarState.error = error.message;
        if (view === 'radar') render();
      }
    };
    setTimeout(poll, 1000);
  } catch (e) {
    radarState.error = e.message;
    render();
  }
}
function checklistHTML() {
  return `<div class="checklist">${packing.map((item, i) => `<label><input type="checkbox" data-pack="${i}" ${currentDay().checks.includes(i) ? 'checked' : ''} ${selected > dateKey(now()) ? 'disabled' : ''}>${esc(item)}</label>`).join('')}</div>`;
}
function taskFormHTML(task) {
  const start = task?.start ?? 1080,
    end = task?.end ?? 1110;
  return `<div class="inline-detail-head"><span class="eyebrow">YOUR ROUTINE</span><button type="button" class="text-button" data-action="close-inline" aria-label="Close routine editor">Close</button></div>
    <h3>${task ? 'Edit this routine' : 'Add a personal routine'}</h3>
    <form id="taskForm" class="form-stack">
      <input name="id" type="hidden" value="${esc(task?.id || '')}">
      <label>Activity<input name="title" value="${esc(task?.title || '')}" maxlength="120" required placeholder="Practise for Friday’s contest"></label>
      <label>What should you remember?<textarea name="detail" maxlength="2000">${esc(task?.detail || '')}</textarea></label>
      <div class="form-grid"><label>Starts<input name="start" type="time" value="${String(Math.floor(start / 60)).padStart(2, '0')}:${String(start % 60).padStart(2, '0')}" required></label><label>Ends<input name="end" type="time" value="${String(Math.floor(end / 60) % 24).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}" required></label></div>
      ${task ? '' : `<label>Repeat<select name="repeat"><option value="date">Only ${selected}</option><option value="daily">Every day</option><option value="weekdays">Monday–Friday</option></select></label>`}
      <p class="setting-note">${task ? 'Editing changes this activity wherever it repeats. Class reminders remain 9 minutes early.' : 'Personal routines work offline and follow the same time locks and quiet hour.'}</p>
      <button class="primary">Save routine</button>
    </form>`;
}
function inlineTaskDetailHTML(t) {
  const allowed = canComplete(selected, t, now());
  if (t.kind === 'packing')
    return `<div class="inline-detail-head"><strong>Bag essentials <span data-pack-count>${currentDay().checks.length} / ${packing.length}</span></strong><button type="button" class="text-button" data-action="close-inline" aria-label="Close bag checklist">Close</button></div>${checklistHTML()}<small>Tick each item as it goes into your bag.</small>`;
  return `<div class="inline-detail-head"><span class="eyebrow">${esc(t.kind)} · ${timeLabel(t.start)}</span><button type="button" class="text-button" data-action="close-inline" aria-label="Close details">Close</button></div>
    <p>${esc(t.detail)}</p>
    ${t.room ? `<p class="setting-note">${esc(t.room)} · ${timeLabel(t.start)}–${timeLabel(t.end)} · Reminder ${timeLabel(t.trigger)}</p>` : ''}
    ${t.id === 'leave' ? `<section class="departure-checklist"><h3>Pack and check before leaving</h3><p class="setting-note">This is the same saved checklist used in “Pack your bag”.</p>${checklistHTML()}</section>` : ''}
    ${['class', 'contest', 'study'].includes(t.kind) ? `<div class="actions"><button class="secondary" data-view="academic-notes">Open homework & notes ↗</button></div>` : ''}
    ${t.kind === 'contest' ? `<form id="scoreForm" class="form-stack"><label>Contest percentage (self-reported)<input name="score" type="number" min="0" max="100" step="0.01" required value="${currentDay().scores[t.id] ?? ''}" ${!allowed ? 'disabled' : ''}></label><button class="secondary" ${!allowed ? 'disabled' : ''}>Save score</button></form>` : ''}
    <div class="actions">${t.kind === 'choice' ? `<button class="primary" data-evening="guided" ${!allowed ? 'disabled' : ''}>Guided evening</button><button class="secondary" data-evening="custom" ${!allowed ? 'disabled' : ''}>Custom until 11 PM</button>` : `<button class="primary" data-detail-done="${esc(t.id)}" ${!allowed ? 'disabled' : ''}>${currentDay().done[t.id] ? 'Reopen task' : t.kind === 'class' ? 'Mark present' : 'Mark as done'}</button>`}${['class', 'contest'].includes(t.kind) ? `<button class="secondary" data-attendance="absent" data-id="${esc(t.id)}" ${!allowed ? 'disabled' : ''}>Absent</button><button class="secondary" data-attendance="excused" data-id="${esc(t.id)}" ${!allowed ? 'disabled' : ''}>Excused / holiday</button>` : ''}</div>
    <button class="text-button inline-edit-link" data-edit-task="${esc(t.id)}">Edit timing & instructions</button>
    ${!allowed ? `<p class="setting-note">Available at ${timeLabel(t.trigger)} on ${selected}.</p>` : ''}`;
}
function showInlineTask(id, editing = false) {
  const task = id ? tasks().find((t) => t.id === id) : null;
  if (id && !task) return;
  const key = id || 'new';
  expandedTaskId = expandedTaskId === key && !editing ? '' : key;
  editingTaskId = editing && expandedTaskId ? key : '';
  if (view !== 'today') {
    pendingJumpId = task
      ? task.kind === 'packing'
        ? 'packing-row'
        : `task-${task.id}`
      : 'new-routine-form';
    location.hash = '#today';
    return;
  }
  render();
  const target = task
    ? document.getElementById(task.kind === 'packing' ? 'packing-row' : `task-${task.id}`)
    : document.getElementById('new-routine-form');
  target?.scrollIntoView({ block: 'nearest' });
}
function editTask(id) {
  showInlineTask(id, true);
}
function details(id) {
  showInlineTask(id);
}
function complete(id, fromDetail = false) {
  const t = tasks().find((x) => x.id === id);
  if (!t) return;
  if (currentDay().done[id]) {
    if (fromDetail && $('#detailDialog').open) $('#detailDialog').close();
    return undoTask(t);
  }
  if (!canComplete(selected, t, now())) return toast('This step is still time-locked.');
  if (t.kind === 'wake') {
    if (fromDetail && $('#detailDialog').open) $('#detailDialog').close();
    return openAlarm(t, false, selected);
  }
  if (t.kind === 'packing' && currentDay().checks.length !== packing.length) {
    expandedTaskId = id;
    render();
    document
      .getElementById('packing-row')
      ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    return toast('Tick each bag essential here, then mark the task done.');
  }
  if (t.kind === 'choice') return details(id);
  if (fromDetail && $('#detailDialog').open) $('#detailDialog').close();
  record(t);
  if (t.kind === 'sleep')
    showRest('Your day is done.', 'Put your phone away. Next wake-up: 4:55 AM.', 295);
}
function chooseEvening(mode) {
  const t = tasks().find((t) => t.id === 'evening');
  if (!canComplete(selected, t, now())) return;
  mutableDay().mode = mode;
  record(t, 'done', `evening_${mode}`);
  if ($('#detailDialog').open) $('#detailDialog').close();
  closeAlarm();
}
function download(name, data) {
  const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
    ),
    a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function downloadReport() {
  const report = reportData(selected),
    rows = tasks()
      .map((t) => {
        const r = report.records[t.id];
        return `<tr><td>${timeLabel(t.start)}</td><td>${esc(t.title)}${t.room ? ` · ${esc(t.room)}` : ''}</td><td>${r ? esc(r.status) : 'Not recorded'}</td><td>${r ? esc(new Date(r.recordedAt || r.at).toLocaleString('en-US')) : '—'}</td></tr>`;
      })
      .join('');
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Daily report · ${selected}</title><style>body{font:15px/1.6 system-ui,sans-serif;color:#243322;max-width:1000px;margin:40px auto;padding:24px}h1{font-size:32px}table{border-collapse:collapse;width:100%;font-size:12px}td,th{text-align:left;border-bottom:1px solid #ddd;padding:10px}small{color:#53604e}@media print{body{margin:0}tr{break-inside:avoid}}</style><h1>Your daily rhythm · ${selected}</h1><p>${report.completed} of ${report.scheduled} steps recorded · ${(report.waterMl / 1000).toFixed(2)} litres of water logged.</p><p>Section D · Group 4 · Lab 1 · ${simulation ? 'TEST RECORDS' : 'Self-reported activity'}</p><h2>Daily timetable</h2><table><thead><tr><th>Scheduled</th><th>Activity</th><th>Status</th><th>Recorded at</th></tr></thead><tbody>${rows}</tbody></table><h2>Check-in history</h2><table><thead><tr><th>Time</th><th>Activity</th><th>Action</th></tr></thead><tbody>${report.events.map((e) => `<tr><td>${esc(new Date(e.timestamp).toLocaleString('en-US'))}</td><td>${esc(e.title || e.taskId)}</td><td>${esc(e.type)}</td></tr>`).join('')}</tbody></table><h2>Homework</h2>${
    db()
      .notes.filter((n) => n.date === selected)
      .map(
        (n) =>
          `<p><strong>${esc(n.subject)}</strong> · ${n.done ? 'Done' : 'Open'}<br>${esc(n.text)}</p>`,
      )
      .join('') || '<p>No notes recorded.</p>'
  }<small>Generated ${esc(new Date().toLocaleString('en-US'))}. Unrecorded tasks are not assumed to be missed. Attendance is not synced with the campus LMS.</small></html>`;
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html' })),
    link = document.createElement('a');
  link.href = url;
  link.download = `daily-report-${selected}.html`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function imageData(file) {
  if (!file || !file.size) return null;
  if (!/^image\/(jpeg|png|webp|gif|heic|heif)$/.test(file.type))
    throw Error('Choose a photo (JPEG, PNG or WebP).');
  if (file.size > 12 * 1024 * 1024) throw Error('Choose a photo smaller than 12 MB.');
  const bitmap = await createImageBitmap(file),
    canvas = document.createElement('canvas'),
    scale = Math.min(1, 1000 / Math.max(bitmap.width, bitmap.height));
  canvas.width = bitmap.width * scale;
  canvas.height = bitmap.height * scale;
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', 0.72);
}
async function enableAudio() {
  try {
    audio ??= new (window.AudioContext || window.webkitAudioContext)();
    await audio.resume();
  } catch {
    toast('Audio is unavailable in this browser. Visual reminders still work.');
  }
}
function chime() {
  if (!audio || audio.state !== 'running') return;
  for (let i = 0; i < 2; i++) {
    const oscillator = audio.createOscillator(),
      gain = audio.createGain(),
      at = audio.currentTime + i * 0.3;
    oscillator.type = 'sine';
    oscillator.frequency.value = i ? 660 : 520;
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(0.18, at + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, at + 0.25);
    oscillator.connect(gain);
    gain.connect(audio.destination);
    oscillator.start(at);
    oscillator.stop(at + 0.28);
  }
}
function closeAlarm() {
  clearInterval(timer);
  timer = null;
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  photoReady = false;
  active = null;
  $('#alarmDialog').close();
}
function openAlarm(task, test = false, key = dateKey(now())) {
  if (active) return;
  active = { task, test, key, started: now().getTime(), lastSound: 0 };
  photoReady = false;
  const wake = task.kind === 'wake';
  $('#alarmContent').innerHTML =
    `<div class="dialog-top"><span class="eyebrow">${test ? 'PREVIEW · NO REAL RECORDS' : wake ? 'WAKE CHECK-IN' : 'TIME FOR YOUR NEXT STEP'}</span><button data-action="silence" aria-label="Emergency stop all reminders">×</button></div><time class="alarm-timer" id="alarmClock">${timeLabel(minuteOf(now()))}</time><h2 id="alarmTitle">${esc(task.title)}</h2><p>${esc(task.detail)}</p>${wake ? '<video id="camera" autoplay playsinline muted></video><p id="cameraStatus" class="setting-note">Start the front camera to capture a live selfie. No face verification is performed.</p><div class="actions"><button class="secondary" data-action="camera">Start front camera</button><button class="primary" id="captureButton" data-action="capture" disabled>Capture selfie</button></div>' : ''}${task.kind === 'packing' ? checklistHTML() : ''}${task.kind === 'choice' ? '<div class="actions"><button class="primary" data-evening="guided">Guided evening</button><button class="secondary" data-evening="custom">Custom until 11 PM</button></div>' : `<div class="checklist"><label><input type="checkbox" id="alarmAck">${wake ? 'I am up and ready to start.' : 'I have completed this step.'}</label></div><div class="actions"><button class="primary" id="alarmDone" data-action="alarm-done" disabled>✓ ${wake ? 'Finish wake check-in' : 'Acknowledge'}</button><button class="secondary" id="snoozeButton" data-action="snooze">Snooze 5 minutes</button></div>`}<p class="setting-note">${wake ? 'A live selfie is needed to complete this check-in.' : 'Unacknowledged reminders repeat every 90 seconds.'} Emergency stop is always available.</p>`;
  $('#alarmDialog').showModal();
  chime();
  active.lastSound = now().getTime();
  timer = setInterval(() => {
    if (!active) return;
    const time = now().getTime();
    $('#alarmClock').textContent = timeLabel(minuteOf(now()));
    if (quietAt(now(), currentDay(active.key).mode)) {
      closeAlarm();
      return;
    }
    const cadence = wake && time - active.started < 300000 ? 2000 : 90000;
    if (time - active.lastSound >= cadence) {
      chime();
      active.lastSound = time;
    }
    const snooze = $('#snoozeButton');
    if (snooze && wake)
      snooze.textContent = minuteOf(now()) >= 315 ? 'Wait 60 seconds' : 'Snooze 5 minutes';
  }, 1000);
}
function showRest(title, text, until) {
  $('#detailContent').innerHTML =
    `<span class="eyebrow">REST MODE · THIS APP ONLY</span><h2 id="detailTitle">${title}</h2><p>${text}</p><p class="setting-note">Until ${timeLabel(until)}. This does not lock your phone.</p><div class="actions"><button class="secondary" data-action="leave-rest">Return to dashboard</button></div>`;
  $('#detailDialog').dataset.restUntil = String(until);
  $('#detailDialog').showModal();
}
function alarmDone() {
  if (!active || !$('#alarmAck')?.checked) return;
  const { task, test, key } = active;
  if (task.kind === 'wake' && !photoReady) return;
  if (task.kind === 'packing' && currentDay(key).checks.length !== packing.length)
    return toast('Check every packing item first.');
  const captured = photoReady;
  closeAlarm();
  if (test) return toast('Preview complete. No real records changed.');
  selected = key;
  record(task, 'done', captured ? 'live_selfie_capture_unverified' : 'manual_acknowledgment');
  if (task.kind === 'wake')
    showRest(
      'A quiet start to your day.',
      'Drink hot water. Plug your phone in, freshen up and get ready for your morning.',
      345,
    );
  if (task.kind === 'sleep')
    showRest('Your day is done.', 'Put your phone away and rest. Next wake-up: 4:55 AM.', 295);
}
function checkReminders() {
  const n = now(),
    key = dateKey(n),
    day = currentDay(key),
    minute = minuteOf(n);
  if ($('#detailDialog').dataset.restUntil) {
    const end = Number($('#detailDialog').dataset.restUntil);
    if ((end === 345 && minute >= end) || (end === 295 && minute >= 295 && minute < 1380)) {
      $('#detailDialog').close();
      delete $('#detailDialog').dataset.restUntil;
    }
  }
  if (!settings.alarms || active || quietAt(n, day.mode)) return;
  const list = tasks(key);
  const due = list.find((t) => {
    if (minute >= 295 && minute < 345 && !day.done.wake && t.kind !== 'wake') return false;
    if (t.kind === 'quiet' || day.done[t.id] || (t.guided && day.mode !== 'guided')) return false;
    const snooze = day.snoozes[t.id];
    if (snooze) return snooze <= n.getTime();
    return (
      minute >= t.trigger &&
      minute < (t.kind === 'wake' ? 345 : t.end) &&
      (!day.alerted[t.id] || n.getTime() - Number(day.alerted[t.id]) >= 90000)
    );
  });
  if (due) {
    selected = key;
    const d = mutableDay(key);
    d.alerted[due.id] = n.getTime();
    delete d.snoozes[due.id];
    persist();
    render();
    openAlarm(due, false, key);
  }
}
let lastMinute = '',
  lastDate = dateKey(now());
function updateClock() {
  const n = now();
  $('#clock').textContent = n.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  $('#clock').classList.toggle('simulation', !!simulation);
  $('#alarmToggle').innerHTML =
    `${Icon({ name: 'ph:alarm', size: 18, className: 'text-current' })}<span>${settings.alarms ? 'Pause reminders' : 'Enable reminders'}</span>`;
  $('#alarmToggle').setAttribute(
    'aria-label',
    settings.alarms ? 'Pause reminders' : 'Enable reminders',
  );
  $('#alarmToggle').setAttribute('aria-pressed', String(settings.alarms));
}
function automaticReport() {
  if (simulation) return;
  const key = dateKey(now());
  for (const date of Object.keys(real.days)) {
    if (date < key || (date === key && minuteOf(now()) >= 1390)) {
      const d = real.days[date];
      if (!d.report) {
        d.report = reportData(date);
        persist();
      }
    }
  }
}
window.addEventListener('hashchange', () => {
  const raw = location.hash.slice(1) || 'today';
  const aliasMap = {
    academic: 'academic-timetable',
    classes: 'academic-timetable',
    timetable: 'academic-timetable',
    attendance: 'academic-attendance',
    mail: 'academic-mail',
    notes: 'academic-notes',
    meals: 'food',
  };
  view = aliasMap[raw] || raw;
  navActive = pendingJumpId || view;
  expandedTaskId = '';
  $('#detailDialog').close();
  render();
  window.scrollTo(0, 0);
});
window.addEventListener('online', () => {
  updateClock();
  queueBackup();
});
window.addEventListener('offline', updateClock);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    updateClock();
    checkReminders();
    automaticReport();
  }
});
$('#alarmDialog').addEventListener('cancel', (e) => {
  e.preventDefault();
  settings.alarms = false;
  saveSettings();
  if (active && !active.test) {
    const old = selected;
    selected = active.key;
    event('emergency_stop', active.task.id);
    selected = old;
    persist();
  }
  closeAlarm();
  updateClock();
});
$('#radarDialog').addEventListener('click', (e) => {
  if (e.target === $('#radarDialog')) $('#radarDialog').close();
});
document.addEventListener('keydown', (e) => {
  const current = e.target.closest('[data-radar-difficulty],[data-radar-tier]');
  if (!current) return;
  const tabs = [...current.closest('[role=tablist]').querySelectorAll('[role=tab]:not(:disabled)')],
    index = tabs.indexOf(current);
  let next = null;
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = tabs[(index + 1) % tabs.length];
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp')
    next = tabs[(index - 1 + tabs.length) % tabs.length];
  else if (e.key === 'Home') next = tabs[0];
  else if (e.key === 'End') next = tabs.at(-1);
  if (!next) return;
  e.preventDefault();
  next.click();
  requestAnimationFrame(() =>
    document
      .querySelector(
        `${current.hasAttribute('data-radar-tier') ? '[data-radar-tier]' : '[data-radar-difficulty]'}[aria-selected=true]`,
      )
      ?.focus(),
  );
});
document.addEventListener('click', async (e) => {
  const row = e.target.closest?.('.routine-flow .task-row');
  if (
    row &&
    !e.target.closest('.task-inline-detail, button, a, input, label, select, textarea, form')
  ) {
    details(row.dataset.taskRow);
    return;
  }
  const b = e.target.closest('button,a[data-view]');
  if (!b) return;
  try {
    if (b.id === 'undoAction') {
      const fn = undoAction;
      undoAction = null;
      fn?.();
      return;
    }
    if (b.dataset.view) {
      location.hash = b.dataset.view;
      if ($('#detailDialog').open) $('#detailDialog').close();
      return;
    }
    if (b.hasAttribute('data-use-menu')) {
      const form = b.closest('#foodForm'),
        meal = String(new FormData(form).get('meal') || '').toLowerCase(),
        dayName = dayNames[new Date(selected + 'T12:00:00').getDay()],
        items = menu[dayName]?.[meal] || [];
      if (!items.length) {
        toast(`No ${meal} menu is available for ${dayName}.`);
        return;
      }
      const foodInput = form.querySelector('[name="item"]');
      foodInput.value = items.join(', ');
      form.elements.amount.value = 'Planned menu';
      foodInput.focus();
      toast(`${meal[0].toUpperCase() + meal.slice(1)} menu filled in. Save it to your log.`);
      return;
    }
    if (b.dataset.radarSummary) {
      radarSummary(b.dataset.radarSummary);
      return;
    }
    if (b.dataset.jump) {
      const jumpId = b.dataset.jump;
      navActive = jumpId;
      const aliasMap = {
        'routine-flow': 'today',
        today: 'today',
        'academic-timetable': 'academic-timetable',
        'academic-attendance': 'academic-attendance',
        'academic-mail': 'academic-mail',
        'academic-notes': 'academic-notes',
        food: 'food',
        life: 'life',
        radar: 'radar',
        reports: 'reports',
      };
      const targetView = aliasMap[jumpId] || jumpId;
      if (view !== targetView) {
        location.hash = targetView;
        return;
      }
      nav();
      const target = document.getElementById(jumpId);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        target.classList.add('jump-highlight');
        setTimeout(() => target.classList.remove('jump-highlight'), 900);
      } else window.scrollTo(0, 0);
      return;
    }
    if (b.hasAttribute('data-academic-reload')) {
      academicData = null;
      academicError = '';
      loadAcademic();
      render();
      return;
    }
    if (b.dataset.radarDifficulty) {
      radarState.difficulty = b.dataset.radarDifficulty;
      radarState.unverifiedLimit = 10;
      radarState.tier = 'S';
      render();
      return;
    }
    if (b.dataset.radarTier) {
      radarState.tier = b.dataset.radarTier;
      render();
      return;
    }
    if (b.dataset.radarScope) {
      radarState.scope = b.dataset.radarScope;
      await refreshRadar();
      return;
    }
    if (b.dataset.radarSave) {
      const id = b.dataset.radarSave;
      radarState.favorites = radarState.favorites.includes(id)
        ? radarState.favorites.filter((x) => x !== id)
        : [...radarState.favorites, id];
      localStorage.setItem('rhythm-radar-favorites', JSON.stringify(radarState.favorites));
      render();
      return;
    }
    if (b.dataset.date) {
      selected = b.dataset.date;
      render();
      return;
    }
    if (b.dataset.dateShift) {
      const next = addDays(selected, Number(b.dataset.dateShift));
      if (next >= settings.semesterStart && next <= settings.semesterEnd) {
        selected = next;
        render();
      }
      return;
    }
    if (b.dataset.waterAdd) {
      if (selected > dateKey(now())) return;
      const amount = Number(b.dataset.waterAdd),
        key = selected,
        d = mutableDay(),
        previous = d.water;
      d.water += amount;
      event('water_added', 'water', { ml: amount });
      persist();
      render();
      toast(`${amount} ml logged.`, () => {
        mutableDay(key).water = previous;
        event('water_undo', 'water', { ml: amount });
        persist();
        render();
        toast('Water entry undone.');
      });
      return;
    }
    if (b.dataset.foodRemove) {
      const day = mutableDay(),
        index = (day.foodEntries || []).findIndex((entry) => entry.id === b.dataset.foodRemove);
      if (index < 0) return;
      const [entry] = day.foodEntries.splice(index, 1);
      event('food_removed', entry.id, { title: entry.item });
      persist();
      render();
      toast('Food log entry removed.', () => {
        mutableDay().foodEntries.push(entry);
        event('food_restored', entry.id, { title: entry.item });
        persist();
        render();
        toast('Food log entry restored.');
      });
      return;
    }
    if (b.dataset.filter) {
      filter = b.dataset.filter;
      render();
      return;
    }
    if (b.dataset.editTask) return editTask(b.dataset.editTask);
    if (b.dataset.detail) return details(b.dataset.detail);
    if (b.dataset.complete) return complete(b.dataset.complete);
    if (b.dataset.detailDone) return complete(b.dataset.detailDone, true);
    if (b.dataset.evening) return chooseEvening(b.dataset.evening);
    if (b.dataset.attendance) {
      const task = tasks().find((t) => t.id === b.dataset.id);
      if ($('#detailDialog').open) $('#detailDialog').close();
      return record(task, b.dataset.attendance);
    }
    if (b.dataset.noteToggle) {
      const note = db().notes.find((n) => n.id === b.dataset.noteToggle);
      note.done = !note.done;
      event(note.done ? 'homework_done' : 'homework_reopened', note.id, { title: note.subject });
      persist();
      render();
      return;
    }
    if (b.dataset.laundryCollect) {
      const d = db().days[b.dataset.laundryCollect];
      d.laundry.collected = now().toISOString();
      event('laundry_collected', 'laundry');
      persist();
      render();
      return;
    }
    if (b.id === 'alarmToggle') {
      settings.alarms = !settings.alarms;
      saveSettings();
      if (settings.alarms) {
        await enableAudio();
        toast('Reminders enabled while the app is open.');
      } else {
        if (active && !active.test) {
          event('emergency_stop', active.task.id);
          persist();
        }
        closeAlarm();
        toast('All reminders paused.');
      }
      updateClock();
      return;
    }
    switch (b.dataset.action) {
      case 'radar-scrape':
        await harvestRadar();
        break;
      case 'radar-favorites':
        radarState.onlyFavorites = !radarState.onlyFavorites;
        render();
        break;
      case 'close-radar':
        $('#radarDialog').close();
        break;
      case 'more-unverified':
        radarState.unverifiedLimit += 10;
        render();
        break;
      case 'new-task':
        editTask();
        break;
      case 'today':
        selected = dateKey(now());
        filter = 'all';
        render();
        break;
      case 'water': {
        if (selected > dateKey(now())) break;
        const key = selected,
          d = mutableDay(),
          previous = d.water;
        d.water += 250;
        event('water_added', 'water', { ml: 250 });
        persist();
        render();
        toast('250 ml logged.', () => {
          mutableDay(key).water = previous;
          event('water_undo', 'water');
          persist();
          render();
          toast('Water entry undone.');
        });
        break;
      }
      case 'close-detail':
        $('#detailDialog').close();
        break;
      case 'close-inline':
        expandedTaskId = '';
        editingTaskId = '';
        render();
        break;
      case 'leave-rest':
        event('rest_exit', 'rest');
        persist();
        delete $('#detailDialog').dataset.restUntil;
        $('#detailDialog').close();
        break;
      case 'export-report':
        downloadReport();
        break;
      case 'backup':
        download(`rhythm-backup-${dateKey(now())}.json`, { version: 1, settings, records: db() });
        break;
      case 'real-clock':
        closeAlarm();
        simulation = null;
        demo = fresh();
        selected = dateKey(now());
        render();
        toast('Back to real time. Test data cleared.');
        break;
      case 'advance-clock':
        simulation = new Date(now().getTime() + 300000).toISOString();
        selected = dateKey(now());
        render();
        checkReminders();
        break;
      case 'test-alarm':
        await enableAudio();
        openAlarm(
          {
            id: 'preview',
            title: 'Ready for your next step?',
            kind: 'routine',
            detail: 'This is a preview of your in-app reminder. Tick the box to acknowledge it.',
          },
          true,
        );
        break;
      case 'test-wake':
        await enableAudio();
        openAlarm(
          tasks().find((t) => t.kind === 'wake'),
          true,
        );
        break;
      case 'silence':
        if (active && !active.test) {
          event('emergency_stop', active.task.id);
          persist();
        }
        settings.alarms = false;
        saveSettings();
        closeAlarm();
        render();
        toast('All reminders stopped.');
        break;
      case 'snooze': {
        if (!active) break;
        const { task, test, key } = active,
          seconds = task.kind === 'wake' && minuteOf(now()) >= 315 ? 60 : 300;
        if (!test) {
          mutableDay(key).snoozes[task.id] = now().getTime() + seconds * 1000;
          event('snooze', task.id, { seconds });
          persist();
        }
        closeAlarm();
        toast(
          test
            ? 'Preview closed.'
            : `Reminder paused for ${seconds === 60 ? '60 seconds' : '5 minutes'}.`,
        );
        break;
      }
      case 'alarm-done':
        alarmDone();
        break;
      case 'camera': {
        if (!navigator.mediaDevices?.getUserMedia)
          return toast('Front camera needs HTTPS or localhost.');
        try {
          stream?.getTracks().forEach((t) => t.stop());
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user' },
            audio: false,
          });
          if (!active) {
            stream.getTracks().forEach((t) => t.stop());
            stream = null;
            break;
          }
          $('#camera').srcObject = stream;
          await $('#camera').play();
          $('#captureButton').disabled = false;
          $('#cameraStatus').textContent = 'Camera ready. Capture a live frame when you are ready.';
        } catch {
          $('#cameraStatus').textContent =
            'Camera unavailable or permission denied. Allow camera access and retry, or use Emergency stop.';
        }
        break;
      }
      case 'capture': {
        const v = $('#camera');
        if (!stream || !v.videoWidth || v.readyState < 2)
          return toast('Wait for a live camera frame.');
        const c = document.createElement('canvas');
        c.width = v.videoWidth;
        c.height = v.videoHeight;
        c.getContext('2d').drawImage(v, 0, 0);
        photoReady = true;
        $('#cameraStatus').textContent =
          'Live selfie captured. Face identity is not verified; the image is not uploaded or retained.';
        $('#alarmDone').disabled = !$('#alarmAck').checked;
        break;
      }
      case 'laundry-drop': {
        if (selected > dateKey(now())) return toast('Future dates are time-locked.');
        if (new Date(selected + 'T12:00:00').getDay() === 0)
          return toast('Laundry is closed on Sunday.');
        const due = addDays(selected, 3);
        mutableDay().laundry = { due, collected: null };
        event('laundry_drop', 'laundry');
        persist();
        render();
        toast(`Laundry pickup planned for ${laundryDateLabel(due)}.`);
        break;
      }
    }
  } catch (err) {
    toast(err.message || 'Something did not save. Please retry.');
  }
});
document.addEventListener('change', (e) => {
  const t = e.target;
  if (t.dataset.radarProgress) {
    radarState.progress[t.dataset.radarProgress] = t.value;
    try {
      localStorage.setItem('rhythm-radar-progress', JSON.stringify(radarState.progress));
    } catch {}
    toast(`Event marked ${t.value.toLowerCase()}.`);
    return;
  }
  if (t.id === 'selectedDate') {
    if (t.value >= settings.semesterStart && t.value <= settings.semesterEnd) {
      selected = t.value;
      render();
    }
    return;
  }
  if (t.dataset.pack !== undefined) {
    if (selected > dateKey(now())) return;
    const i = Number(t.dataset.pack),
      d = mutableDay();
    d.checks = t.checked ? [...new Set([...d.checks, i])] : d.checks.filter((x) => x !== i);
    persist();
    document.querySelectorAll(`[data-pack="${i}"]`).forEach((input) => (input.checked = t.checked));
    const progress = document.querySelector('#packing-row [data-pack-count]');
    if (progress) progress.textContent = `${d.checks.length} / ${packing.length}`;
    const hint = document.querySelector('#packing-row .task-main small');
    if (hint)
      hint.textContent = `${d.checks.length} / ${packing.length} essentials packed · tap to close`;
    return;
  }
  if (t.dataset.swimPack !== undefined) {
    if (selected > dateKey(now())) return;
    const i = Number(t.dataset.swimPack),
      d = mutableDay();
    d.swimChecks = d.swimChecks || [];
    d.swimChecks = t.checked
      ? [...new Set([...d.swimChecks, i])]
      : d.swimChecks.filter((x) => x !== i);
    persist();
    document
      .querySelectorAll(`[data-swim-pack="${i}"]`)
      .forEach((input) => (input.checked = t.checked));
    return;
  }
  if (t.id === 'alarmAck')
    $('#alarmDone').disabled = !t.checked || (active?.task.kind === 'wake' && !photoReady);
  if (t.dataset.wardrobe) {
    const w = db().wardrobe.find((w) => w.id === t.dataset.wardrobe);
    w.status = t.value;
    event('wardrobe_updated', w.id, { title: w.name, status: w.status });
    persist();
  }
});
document.addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target,
    data = new FormData(form),
    submit = form.querySelector('button');
  submit.disabled = true;
  try {
    if (form.getAttribute('id') === 'taskForm') {
      const id = String(data.get('id')),
        title = String(data.get('title')).trim(),
        detail = String(data.get('detail')).trim();
      const parse = (value) => {
        const [h, m] = String(value).split(':').map(Number);
        return h * 60 + m;
      };
      const start = parse(data.get('start')),
        end = parse(data.get('end')) || 1440;
      if (!title || !Number.isFinite(start) || !Number.isFinite(end) || end <= start)
        throw Error('Choose a title and an end time after the start time.');
      const existing = id ? tasks().find((t) => t.id === id) : null,
        patch = {
          title,
          detail,
          start,
          end,
          trigger: start - (existing && ['class', 'contest'].includes(existing.kind) ? 9 : 0),
        };
      if (id) {
        const custom = settings.customTasks?.find((t) => t.id === id);
        if (custom) Object.assign(custom, patch);
        else {
          settings.overrides ??= {};
          settings.overrides[id] = patch;
        }
      } else {
        settings.customTasks ??= [];
        const repeat = data.get('repeat');
        settings.customTasks.push({
          ...patch,
          id: 'personal-' + crypto.randomUUID(),
          kind: 'routine',
          date: repeat === 'date' ? selected : null,
          days: repeat === 'weekdays' ? [1, 2, 3, 4, 5] : [0, 1, 2, 3, 4, 5, 6],
        });
      }
      saveSettings();
      expandedTaskId = '';
      editingTaskId = '';
      render();
      toast('Routine saved.');
    }
    if (form.getAttribute('id') === 'noteForm') {
      const text = String(data.get('text')).trim();
      if (!text) throw Error('Add a note first.');
      const photo = await imageData(data.get('photo'));
      db().notes.unshift({
        id: crypto.randomUUID(),
        date: selected,
        subject: String(data.get('subject')),
        text,
        photo,
        done: false,
      });
      if (!persist()) {
        db().notes.shift();
        return;
      }
      render();
      toast('Note saved for your next study session.');
    }
    if (form.getAttribute('id') === 'foodForm') {
      const item = String(data.get('item')).trim();
      if (!item) throw Error('Enter the food or drink you had.');
      const entry = {
        id: crypto.randomUUID(),
        meal: String(data.get('meal')),
        item,
        amount: String(data.get('amount')).trim(),
        at: now().toISOString(),
      };
      mutableDay().foodEntries ??= [];
      mutableDay().foodEntries.push(entry);
      event('food_added', entry.id, { title: item, meal: entry.meal });
      if (!persist()) {
        mutableDay().foodEntries.pop();
        return;
      }
      render();
      toast('Added to your food log.');
    }
    if (form.getAttribute('id') === 'waterForm') {
      const amount = Number(data.get('ml'));
      if (!Number.isInteger(amount) || amount < 1 || amount > 3000)
        throw Error('Enter a whole amount from 1 to 3000 ml.');
      if (selected > dateKey(now())) throw Error('Future dates are time-locked.');
      const key = selected,
        d = mutableDay(),
        previous = d.water;
      d.water += amount;
      event('water_added', 'water', { ml: amount });
      persist();
      render();
      toast(`${amount} ml logged.`, () => {
        mutableDay(key).water = previous;
        event('water_undo', 'water', { ml: amount });
        persist();
        render();
        toast('Water entry undone.');
      });
    }
    if (form.getAttribute('id') === 'wardrobeForm') {
      const name = String(data.get('name')).trim();
      if (!name) throw Error('Name this clothing item.');
      const photo = await imageData(data.get('photo'));
      db().wardrobe.push({ id: crypto.randomUUID(), name, photo, status: 'Clean' });
      if (!persist()) {
        db().wardrobe.pop();
        return;
      }
      render();
      toast('Clothing added.');
    }
    if (form.getAttribute('id') === 'scoreForm') {
      const score = Number(data.get('score')),
        task = tasks().find((t) => t.id === 'contest');
      if (!task || !canComplete(selected, task, now()) || score < 0 || score > 100)
        throw Error('Score must be between 0 and 100 for an available contest.');
      mutableDay().scores.contest = score;
      mutableDay().scoreSubject = contestSubject(selected, settings);
      event('contest_score', 'contest', { score, title: contestSubject(selected, settings) });
      persist();
      toast('Contest score saved.');
    }
  } catch (err) {
    toast(err.message || 'Could not save. Please retry.');
  } finally {
    submit.disabled = false;
  }
});
let backupTimer = null,
  backupRunning = false,
  backupAgain = false;
function workspaceToken() {
  let token = localStorage.getItem('rhythm-device-token');
  if (!token) {
    token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
      b.toString(16).padStart(2, '0'),
    ).join('');
    localStorage.setItem('rhythm-device-token', token);
  }
  return token;
}
function queueBackup() {
  clearTimeout(backupTimer);
  backupTimer = setTimeout(syncBackup, 1200);
}
async function syncBackup() {
  if (simulation || !navigator.onLine) return;
  if (backupRunning) {
    backupAgain = true;
    return;
  }
  backupRunning = true;
  try {
    const response = await fetch('/api/tracker-backup', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-Workspace-Token': workspaceToken() },
      body: JSON.stringify({ version: 1, settings, records: real }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw Error('Backup pending');
    localStorage.setItem('rhythm-backup-at', new Date().toISOString());
  } catch {
    /* Local records remain authoritative; retry later or on reconnect. */
  } finally {
    backupRunning = false;
    if (backupAgain) {
      backupAgain = false;
      queueBackup();
    }
  }
}
setInterval(() => {
  if (Object.keys(real.days).length || real.notes.length || real.wardrobe.length) queueBackup();
}, 30000);
render();
refreshQuote();
fetch('/api/mess-menu')
  .then((r) => {
    if (!r.ok) throw Error('Menu unavailable');
    return r.json();
  })
  .then((data) => {
    menu = data.menu || data.messMenu || {};
    localStorage.setItem('rhythm-menu', JSON.stringify(menu));
    if (['food'].includes(view)) render();
  })
  .catch(() => {});
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
setInterval(() => {
  if (simulation) simulation = new Date(new Date(simulation).getTime() + 1000).toISOString();
  updateClock();
  const n = now(),
    key = dateKey(n),
    minute = key + ':' + minuteOf(n);
  if (key !== lastDate) {
    if (selected === lastDate) selected = key;
    lastDate = key;
  }
  if (minute !== lastMinute) {
    lastMinute = minute;
    if (
      !$('#detailDialog').open &&
      !$('#alarmDialog').open &&
      !document.querySelector('#taskForm') &&
      !['settings', 'notes', 'life'].includes(view)
    )
      render();
    automaticReport();
  }
  checkReminders();
}, 1000);
