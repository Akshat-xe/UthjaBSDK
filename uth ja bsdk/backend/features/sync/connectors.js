const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { attendanceTask } = require('./browserAttendanceConnector');

const execFileAsync = promisify(execFile);
const MAX_ITEMS = 8;
const MAX_SNIPPET = 180;
const MAX_OUTPUT = 8192;
const MAX_COPILOT_STREAM = 262144;
const DATA_DIR =
  process.env.UTHJA_SYNC_DATA_DIR || path.join(__dirname, '..', '..', 'data', 'sync');
const state = { running: false, startedAt: null, finishedAt: null, sources: {} };
const academicSources = { newton: null, rishiverse: null, gmail: null };
const bounded = (value, max) =>
  String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
const snapshot = () => JSON.parse(JSON.stringify(state));
const getAcademicSources = () => JSON.parse(JSON.stringify(academicSources));
function safeJson(value) {
  const text = String(value)
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  try {
    return JSON.parse(text);
  } catch {}
  for (let start = 0; start < text.length; start++) {
    if (text[start] !== '[' && text[start] !== '{') continue;
    const stack = [];
    let inString = false,
      escaped = false;
    for (let end = start; end < text.length; end++) {
      const char = text[end];
      if (inString) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === '"') inString = false;
        continue;
      }
      if (char === '"') {
        inString = true;
        continue;
      }
      if (char === '[' || char === '{') stack.push(char);
      else if (char === ']' || char === '}') {
        const opening = stack.pop();
        if ((opening === '[' && char !== ']') || (opening === '{' && char !== '}')) break;
        if (!stack.length) {
          try {
            return JSON.parse(text.slice(start, end + 1));
          } catch {
            break;
          }
        }
      }
    }
  }
  throw new Error(
    'Copilot response did not contain valid JSON; event listings were kept and optional summaries were skipped.',
  );
}
function copilotResponse(stream) {
  const messages = [];
  for (const line of String(stream).split(/\r?\n/)) {
    try {
      const event = JSON.parse(line);
      if (event?.type === 'assistant.message' && typeof event.data?.content === 'string')
        messages.push(event.data.content);
    } catch {}
  }
  return safeJson(messages.length ? messages[messages.length - 1] : stream);
}

function mailError(error) {
  const diagnostic = String(error.stderr || error.message || '').toLowerCase();
  if (error.code === 'ETIMEDOUT')
    return new Error('Apple Mail took too long to return inbox messages. Open Mail and try again.');
  if (/not authorized|not permitted|(-1743|(-1744))|assistive access/.test(diagnostic))
    return new Error(
      'Apple Mail automation is blocked. Allow the running terminal or app to control Mail in System Settings → Privacy & Security → Automation.',
    );
  if (
    /can.t get (?:application|inbox)|no account|index was outside|doesn.t understand the/.test(
      diagnostic,
    )
  )
    return new Error(
      'Apple Mail could not access an inbox. Open Mail, confirm an account is configured, then try again.',
    );
  return new Error(
    'Apple Mail could not return inbox messages. Check that Mail is open and its account is available; private OS details are hidden.',
  );
}
function copilotError(error) {
  if (error.code === 'ENOENT')
    return new Error(
      'Copilot CLI was not found. Install it or set COPILOT_BIN in the local .env file.',
    );
  if (error.code === 'ETIMEDOUT')
    return new Error('Copilot CLI took too long to respond. Check its sign-in and try again.');
  const diagnostic = String(error.stderr || '').toLowerCase();
  if (/not logged in|sign in|authentication/.test(diagnostic))
    return new Error(
      'Copilot CLI needs an active sign-in. Sign in from the local terminal, then try again.',
    );
  return new Error(
    `Copilot CLI failed${Number.isInteger(error.code) ? ` (exit ${error.code})` : ''}. Check its sign-in and local setup; private input and process output are hidden.`,
  );
}

function keychainService(name) {
  return `uth-ja-${name}`;
}
function configurationError(message) {
  const error = new Error(message);
  error.code = 'CONFIG_REQUIRED';
  return error;
}
async function keychainOrEnv(envName, service) {
  if (process.env[envName]?.trim()) return process.env[envName].trim();
  if (process.platform !== 'darwin')
    throw configurationError(`${envName} is not configured. Set it in the local .env file.`);
  let stdout;
  try {
    ({ stdout } = await execFileAsync(
      'security',
      ['find-generic-password', '-s', keychainService(service), '-w'],
      { timeout: 3000, maxBuffer: 4096 },
    ));
  } catch (error) {
    const diagnostic = String(error.stderr || error.message || '').toLowerCase();
    if (/could not be found|item .*not found|not configured/.test(diagnostic))
      throw configurationError(`${envName} is not configured in environment or macOS Keychain.`);
    throw new Error(
      `${envName} could not be read from macOS Keychain. Check Keychain access and try again.`,
    );
  }
  if (!stdout.trim())
    throw configurationError(
      `${envName} is not configured. Add it to the local .env file or macOS Keychain.`,
    );
  return stdout.trim();
}

async function getNewtonToken() {
  return keychainOrEnv('NEWTON_AUTH_TOKEN', 'newton');
}
async function getRishiverseToken() {
  return keychainOrEnv('RISHIVERSE_AUTH_TOKEN', 'rishiverse');
}

async function apiJson(url, token, label) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(8000),
  });
  if (response.status === 401 || response.status === 403)
    throw configurationError(
      `${label} login expired or access was denied. Refresh its local token and try again.`,
    );
  if (!response.ok) throw new Error(`${label} returned HTTP ${response.status}`);
  return response.json();
}

async function syncNewton() {
  const hash = process.env.NEWTON_COURSE_HASH?.trim();
  if (!hash)
    throw configurationError('Newton setup needed: set NEWTON_COURSE_HASH in the local .env file.');
  const payload = await apiJson(
    `https://my.newtonschool.co/api/v2/course/h/${encodeURIComponent(hash)}/lecture/all/?pagination=false`,
    await getNewtonToken(),
    'Newton',
  );
  const lectures = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.results)
      ? payload.results
      : Array.isArray(payload?.data)
        ? payload.data
        : null;
  if (!lectures)
    throw new Error(
      'Newton returned an unrecognized lecture response; attendance was not updated.',
    );
  const subjects = new Map();
  for (const lecture of lectures.slice(0, 500)) {
    const name = bounded(
      lecture.course?.short_display_name || lecture.course?.title || 'General',
      100,
    );
    const row = subjects.get(name) || { name, attended: 0, conducted: 0 };
    row.conducted += 1;
    if (lecture.attended === true || lecture.attendance_waived === true) row.attended += 1;
    subjects.set(name, row);
  }
  return {
    items: [...subjects.values()].map((row) => ({
      ...row,
      percent: row.conducted ? Math.round((row.attended / row.conducted) * 1000) / 10 : 0,
    })),
  };
}

async function syncRishiverse() {
  const url = process.env.RISHIVERSE_ATTENDANCE_URL?.trim();
  if (!url)
    throw configurationError(
      'RUFP setup needed: set RISHIVERSE_ATTENDANCE_URL in the local .env file.',
    );
  if (!/^https:\/\//i.test(url)) throw configurationError('RUFP attendance URL must use HTTPS.');
  const payload = await apiJson(url, await getRishiverseToken(), 'Rishiverse');
  const courses = Array.isArray(payload?.courses)
    ? payload.courses
    : Array.isArray(payload?.data?.courses)
      ? payload.data.courses
      : null;
  if (!courses)
    throw new Error('RUFP returned an unrecognized course response; attendance was not updated.');
  return {
    items: courses.slice(0, 30).map((course) => ({
      name: bounded(course.courseName || course.name, 100),
      attended: Number(course.attendedLectures ?? course.attended ?? 0),
      conducted: Number(course.totalLectures ?? course.conducted ?? 0),
      percent: Number(course.attendancePercentage ?? course.percent ?? 0),
    })),
  };
}

function mailScript() {
  return [
    'tell application "Mail"',
    'set matchedAccounts to {}',
    'repeat with acc in accounts',
    'set isMatched to false',
    'try',
    'set addrs to email addresses of acc',
    'repeat with addr in addrs',
    'set lowerAddr to addr as text',
    'if lowerAddr ends with "@rishihood.edu.in" or lowerAddr ends with "@nst.rishihood.edu.in" then',
    'set isMatched to true',
    'exit repeat',
    'end if',
    'end repeat',
    'end try',
    'if not isMatched then',
    'try',
    'set uname to user name of acc as text',
    'if uname ends with "@rishihood.edu.in" or uname ends with "@nst.rishihood.edu.in" then',
    'set isMatched to true',
    'end if',
    'end try',
    'end if',
    'if isMatched then',
    'set end of matchedAccounts to acc',
    'end if',
    'end repeat',
    'if (count of matchedAccounts) = 0 then',
    'return "STATUS:NO_RISHIHOOD_ACCOUNT"',
    'end if',
    'set rows to {}',
    'set fieldSeparator to ASCII character 31',
    'set rowSeparator to ASCII character 30',
    'set maxTotal to 8',
    'set collectedCount to 0',
    'repeat with targetAccount in matchedAccounts',
    'if collectedCount >= maxTotal then exit repeat',
    'set targetMbox to missing value',
    'try',
    'set targetMbox to mailbox "INBOX" of targetAccount',
    'on error',
    'try',
    'set targetMbox to (first mailbox of targetAccount whose name is "INBOX" or name is "Inbox")',
    'on error',
    'if (count of mailboxes of targetAccount) > 0 then',
    'set targetMbox to item 1 of (mailboxes of targetAccount)',
    'end if',
    'end try',
    'end try',
    'if targetMbox is not missing value then',
    'set inboxMessages to messages of targetMbox',
    'set messageCount to count of inboxMessages',
    'set fetchLimit to maxTotal - collectedCount',
    'if messageCount > fetchLimit then set messageCount to fetchLimit',
    'repeat with messageIndex from 1 to messageCount',
    'set messageItem to item messageIndex of inboxMessages',
    'set msgBody to ""',
    'try',
    'set msgBody to content of messageItem as text',
    'if length of msgBody > 500 then',
    'set msgBody to text 1 thru 500 of msgBody',
    'end if',
    'end try',
    'set senderText to ""',
    'try',
    'set senderText to sender of messageItem as text',
    'end try',
    'set subjectText to ""',
    'try',
    'set subjectText to subject of messageItem as text',
    'end try',
    'set dateText to ""',
    'try',
    'set dateText to date received of messageItem as text',
    'end try',
    'set end of rows to (senderText & fieldSeparator & subjectText & fieldSeparator & msgBody & fieldSeparator & dateText)',
    'set collectedCount to collectedCount + 1',
    'end repeat',
    'end if',
    'end repeat',
    'if collectedCount = 0 then',
    'return "STATUS:EMPTY"',
    'end if',
    'set AppleScript\'s text item delimiters to rowSeparator',
    'return rows as text',
    'end tell',
  ].join('\n');
}
async function extractMail() {
  if (process.platform !== 'darwin')
    throw configurationError('Apple Mail is available only on macOS.');
  let stdout;
  try {
    ({ stdout } = await execFileAsync('osascript', ['-e', mailScript()], {
      timeout: 15000,
      maxBuffer: 32768,
    }));
  } catch (error) {
    throw mailError(error);
  }
  const trimmed = stdout.trim();
  if (trimmed === 'STATUS:NO_RISHIHOOD_ACCOUNT') {
    throw configurationError(
      'Rishihood Mail setup needed: configure an @rishihood.edu.in account in Apple Mail.',
    );
  }
  if (trimmed === 'STATUS:NO_INBOX') {
    throw new Error('Apple Mail could not access the Rishihood inbox. Check Mail and try again.');
  }
  if (trimmed === 'STATUS:EMPTY' || !trimmed) {
    return [];
  }
  const items = normalizeMail(trimmed.split('\x1e').filter(Boolean));
  return items;
}
function normalizeMail(lines) {
  return lines
    .slice(0, MAX_ITEMS)
    .map((line) => {
      const [sender, subject, snippet, date] = line.split(line.includes('\x1f') ? '\x1f' : '\t');
      return {
        sender: bounded(sender, 100),
        subject: bounded(subject, 180),
        snippet: bounded(snippet, MAX_SNIPPET),
        date: bounded(date, 48),
      };
    })
    .filter((item) => item.subject || item.snippet);
}
async function summarizeMail(items) {
  const prompt = `Summarize these academic email snippets in one concise plain-text digest. Do not invent facts. Return at most 500 characters.\n${JSON.stringify(items)}`;
  const bin = process.env.COPILOT_BIN || 'copilot';
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'uth-ja-copilot-'), { encoding: 'utf8' });
  const env = {
    PATH: process.env.PATH || '/usr/bin:/bin:/usr/sbin:/sbin',
    HOME: process.env.HOME || os.homedir(),
  };
  try {
    let stdout;
    try {
      ({ stdout } = await execFileAsync(bin, copilotArgs(prompt, 'text'), {
        cwd: tempDir,
        env,
        timeout: 30000,
        maxBuffer: MAX_OUTPUT,
      }));
    } catch (error) {
      throw copilotError(error);
    }
    return bounded(stdout, 500);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}
function copilotArgs(prompt, outputFormat = 'json') {
  return [
    '--prompt',
    prompt,
    '--silent',
    '--output-format',
    outputFormat,
    '--disable-builtin-mcps',
    '--available-tools',
    'view,grep,glob',
  ];
}
async function copilotJson(prompt) {
  const bin = process.env.COPILOT_BIN || 'copilot';
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'uth-ja-copilot-'), { encoding: 'utf8' });
  const env = {
    PATH: process.env.PATH || '/usr/bin:/bin:/usr/sbin:/sbin',
    HOME: process.env.HOME || os.homedir(),
  };
  try {
    let stdout;
    try {
      ({ stdout } = await execFileAsync(bin, copilotArgs(prompt), {
        cwd: tempDir,
        env,
        timeout: 30000,
        maxBuffer: MAX_COPILOT_STREAM,
      }));
    } catch (error) {
      throw copilotError(error);
    }
    return copilotResponse(stdout);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}
function radarBriefInput(candidates) {
  return candidates.slice(0, 4).map((item) => ({
    id: item.id,
    title: bounded(item.title, 180),
    organizer: bounded(item.organizer, 120),
    officialUrl: bounded(item.eventUrl, 300),
    dates: {
      registrationDeadline: item.registrationDeadline || null,
      start: item.startDate || null,
      end: item.endDate || null,
    },
    location: bounded(item.location, 120),
    description: bounded(item.description, 500),
  }));
}
function normalizeRadarSummaries(output, candidates) {
  const rows = Array.isArray(output)
    ? output
    : output && ['summaries', 'events', 'results'].map((key) => output[key]).find(Array.isArray);
  if (!Array.isArray(rows) || rows.length !== candidates.length)
    throw new Error('Copilot response did not match the expected event summary format.');
  const allowed = new Set(candidates.map((candidate) => candidate.id));
  return rows.map((item) => {
    const eventId = item?.eventId ?? item?.event_id ?? item?.id;
    const caveats = Array.isArray(item?.caveats)
      ? item.caveats
      : typeof item?.caveats === 'string'
        ? [item.caveats]
        : null;
    if (
      typeof eventId !== 'string' ||
      !allowed.has(eventId) ||
      typeof item?.summary !== 'string' ||
      item.summary.length > 500 ||
      !caveats ||
      caveats.some((value) => typeof value !== 'string')
    )
      throw new Error('Copilot response did not match the expected event summary format.');
    return { eventId, summary: item.summary, caveats };
  });
}
async function syncRadar({ harvest, analyze = copilotJson, getCandidates }) {
  const harvestResult = await harvest();
  const { database } = await import('../../opportunity-radar/src/db/database.js');
  const candidates = radarBriefInput(
    (getCandidates || ((limit) => database.getResearchCandidates(limit)))(4),
  );
  if (!candidates.length)
    return {
      status: harvestResult.status === 'failed' ? 'failed' : 'success',
      harvest: harvestResult,
      reviewed: 0,
      brief: '',
    };
  const input = JSON.stringify(candidates);
  const prompt = `Return ONLY a valid JSON array with exactly ${candidates.length} objects, one per event. Each object must use these exact fields: "eventId" copied exactly from that event's "id", "summary" as plain text no longer than 500 characters, and "caveats" as an array of plain-text strings. Do not use markdown fences or add text before or after the JSON. Summarize only supplied public listing facts. Do not browse, invent, or infer missing facts; write "Unknown" for missing values. Preserve each officialUrl as a citation in caveats.\nINPUT:\n${input}`;
  let output;
  try {
    let lastFormatError;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        output = normalizeRadarSummaries(
          await analyze(
            attempt
              ? `Your previous answer did not follow the required schema. Return only the corrected JSON array, exactly ${candidates.length} objects, with string eventId matching an input id, string summary, and string-array caveats. No prose or markdown.\nINPUT:\n${input}`
              : prompt,
          ),
          candidates,
        );
        lastFormatError = null;
        break;
      } catch (error) {
        lastFormatError = error;
        if (
          attempt ||
          !/did not contain valid JSON|did not match the expected event summary format/.test(
            error.message,
          )
        )
          throw error;
      }
    }
    if (lastFormatError) throw lastFormatError;
  } catch (error) {
    return {
      status: harvestResult.status === 'failed' ? 'failed' : 'partial',
      harvest: harvestResult,
      reviewed: 0,
      brief: 'Event fetch completed; optional AI summaries were skipped.',
      analysisError: bounded(error.message, 220),
    };
  }
  const allowed = new Map(candidates.map((item) => [item.id, item]));
  let reviewed = 0;
  for (const item of output) {
    const candidate = allowed.get(item?.eventId);
    if (
      !candidate ||
      typeof item.summary !== 'string' ||
      item.summary.length > 500 ||
      !Array.isArray(item.caveats)
    )
      continue;
    database.saveResearchResult(candidate.id, {
      summary: bounded(item.summary, 500),
      difficulty: 'unknown',
      effortHours: null,
      confidence: 'low',
      tier: 'Unverified',
      skillFit: null,
      matchedSkills: [],
      tasks: [],
      registrationDeadline: candidate.dates.registrationDeadline,
      location: candidate.location,
      teamSize: 'Unknown',
      prizePool: 'Unknown',
      eventWindow: 'Unknown',
      sources: [{ title: 'Official listing', url: candidate.officialUrl, type: 'official' }],
      caveats: item.caveats.slice(0, 3).map((value) => bounded(value, 180)),
    });
    reviewed++;
  }
  return {
    status: harvestResult.status === 'failed' ? 'partial' : 'success',
    harvest: harvestResult,
    reviewed,
    brief: `Reviewed ${reviewed} event${reviewed === 1 ? '' : 's'}.`,
  };
}
function academicMailPrompt(candidates) {
  return `Classify each academic email message for urgency, importance, and required action.
Return ONLY a valid JSON array with exactly ${candidates.length} objects, one per message in the same order.
Each object must have these exact fields:
- "id": integer matching the input message id
- "priority": exactly one of "urgent", "high", "normal", "low". Mark as "urgent" or "high" ONLY for critical academic deadlines (exams, submissions, fee payments, class cancellations, room changes, emergency notices) requiring immediate student attention or action within 24-48 hours. Mark general newsletters, event invitations, routine announcements, promotional mail, and club activities as "normal" or "low". Be conservative; when in doubt, do not mark as urgent.
- "category": a short category string (e.g. "Exam", "Attendance", "Deadline", "Administrative", "Class", "General", max 48 characters)
- "summary": a concise, factual plain-text summary of the message (max 220 characters). Do not invent facts.
- "actionItem": a clear, actionable task for the student if required (max 180 characters), or "" if no action is needed.

Do not use markdown fences or prose outside the JSON array.
INPUT:
${JSON.stringify(candidates)}`;
}

function normalizeMailClassification(output, candidates) {
  const rows = Array.isArray(output)
    ? output
    : output && ['classifications', 'emails', 'messages', 'items', 'results']
        .map((key) => output[key])
        .find(Array.isArray);
  if (!Array.isArray(rows) || rows.length !== candidates.length)
    throw new Error('Copilot response did not match the expected mail classification format.');

  const validPriorities = new Set(['urgent', 'high', 'normal', 'low']);
  const candidateList = candidates.map((c, idx) => ({
    id: c.id !== undefined && c.id !== null ? Number(c.id) : idx,
    candidate: c,
  }));
  const candidateIds = new Set(candidateList.map((c) => c.id));
  const seenIds = new Set();
  const rowById = new Map();

  for (const row of rows) {
    if (!row || typeof row !== 'object') {
      throw new Error('Copilot response did not match the expected mail classification format.');
    }
    const rawId = row.id ?? row.messageId ?? row.message_id;
    const id = Number(rawId);
    if (!Number.isInteger(id) || !candidateIds.has(id) || seenIds.has(id)) {
      throw new Error('Copilot response did not match the expected mail classification format.');
    }
    seenIds.add(id);
    rowById.set(id, row);
  }

  return candidateList.map(({ id, candidate }) => {
    const row = rowById.get(id);
    if (!row) {
      throw new Error('Copilot response did not match the expected mail classification format.');
    }
    const rawPriority = String(row?.priority || '').trim().toLowerCase();
    const priority = validPriorities.has(rawPriority) ? rawPriority : 'normal';
    const category = bounded(row?.category || 'Academic', 48);
    const summary = bounded(row?.summary || candidate.snippet || candidate.subject, 220);
    const actionItem = bounded(row?.actionItem || '', 180);
    return {
      sender: candidate.sender,
      subject: candidate.subject,
      summary,
      snippet: summary,
      date: candidate.date,
      category,
      priority,
      actionItem,
    };
  });
}

async function syncGmail({ extract = extractMail, analyze = copilotJson } = {}) {
  const rawItems = await extract();
  if (!Array.isArray(rawItems) || !rawItems.length) {
    return {
      status: 'success',
      items: [],
      totalRead: 0,
      urgentCount: 0,
    };
  }

  const candidates = rawItems.slice(0, MAX_ITEMS).map((item, index) => ({
    id: index,
    sender: bounded(item.sender, 100),
    subject: bounded(item.subject, 180),
    snippet: bounded(item.snippet, MAX_SNIPPET),
    date: bounded(item.date, 48),
  }));

  const prompt = academicMailPrompt(candidates);
  let classified;
  try {
    let lastFormatError;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const raw = await analyze(
          attempt
            ? `Your previous answer did not follow the required schema. Return only the corrected JSON array, exactly ${candidates.length} objects, with integer id, string priority ("urgent", "high", "normal", or "low"), string category, string summary, and string actionItem. No prose or markdown.\nINPUT:\n${JSON.stringify(candidates)}`
            : prompt,
        );
        classified = normalizeMailClassification(raw, candidates);
        lastFormatError = null;
        break;
      } catch (error) {
        lastFormatError = error;
        if (
          attempt ||
          !/did not contain valid JSON|did not match the expected mail classification format/i.test(
            error.message,
          )
        )
          throw error;
      }
    }
    if (lastFormatError) throw lastFormatError;
  } catch (error) {
    return {
      status: 'partial',
      items: [],
      totalRead: candidates.length,
      urgentCount: 0,
      error: bounded(error.message, 220),
    };
  }

  const approvedUrgent = classified.filter(
    (item) => item.priority === 'urgent' || item.priority === 'high',
  );

  return {
    status: 'success',
    items: approvedUrgent,
    totalRead: candidates.length,
    urgentCount: approvedUrgent.length,
  };
}
function persist(syncState) {
  fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
  try {
    fs.chmodSync(DATA_DIR, 0o700);
  } catch {}
  const file = path.join(DATA_DIR, 'latest.json');
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(
    temporary,
    JSON.stringify(
      {
        version: 2,
        startedAt: syncState.startedAt,
        finishedAt: syncState.finishedAt,
        sources: syncState.sources,
        academicSources,
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );
  try {
    fs.chmodSync(temporary, 0o600);
  } catch {}
  fs.renameSync(temporary, file);
  try {
    fs.chmodSync(file, 0o600);
  } catch {}
}
function loadPersisted() {
  try {
    const saved = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'latest.json'), 'utf8'));
    if (saved?.sources && typeof saved.sources === 'object' && !Array.isArray(saved.sources)) {
      state.sources = saved.sources;
      state.startedAt = saved.startedAt || saved.savedAt || null;
      state.finishedAt = saved.finishedAt || saved.savedAt || null;
      for (const key of Object.keys(academicSources)) {
        const source = saved.academicSources?.[key];
        if (source && Array.isArray(source.items) && typeof source.updatedAt === 'string')
          academicSources[key] = source;
      }
    }
  } catch {}
}
loadPersisted();
async function syncAll({
  radar,
  newton = attendanceTask('newton'),
  rishiverse = attendanceTask('rishiverse'),
  gmail = syncGmail,
} = {}) {
  if (state.running) throw new Error('Sync all is already running');
  state.running = true;
  state.startedAt = new Date().toISOString();
  state.finishedAt = null;
  state.sources = {};
  const tasks = [
    ['newton', newton],
    ['rishiverse', rishiverse],
    ['gmail', gmail],
  ];
  if (radar) tasks.push(['radar', radar]);
  await Promise.all(
    tasks.map(async ([key, task]) => {
      state.sources[key] = { status: 'running' };
      try {
        const value = await task();
        const timestamp = new Date().toISOString();
        state.sources[key] = { status: 'success', updatedAt: timestamp, ...value };
        if (key in academicSources && Array.isArray(value?.items))
          academicSources[key] = {
            updatedAt: timestamp,
            items: value.items.slice(0, key === 'newton' ? 100 : key === 'rishiverse' ? 30 : 12),
          };
      } catch (error) {
        state.sources[key] = {
          status: error.code === 'CONFIG_REQUIRED' ? 'setup_required' : 'failed',
          error: bounded(error.message, 220),
        };
      }
    }),
  );
  state.running = false;
  state.finishedAt = new Date().toISOString();
  try {
    persist(state);
  } catch (error) {
    console.error('[Sync status] Could not persist the completed attempt:', error.message);
  }
  return snapshot();
}
module.exports = {
  syncAll,
  syncRadar,
  getSyncState: snapshot,
  getAcademicSources,
  getNewtonToken,
  getRishiverseToken,
  syncNewton,
  syncRishiverse,
  syncGmail,
  extractMail,
  academicMailPrompt,
  normalizeMailClassification,
  summarizeMail,
  MAX_ITEMS,
  MAX_SNIPPET,
  MAX_OUTPUT,
  MAX_COPILOT_STREAM,
  mailScript,
  normalizeMail,
  copilotArgs,
  radarBriefInput,
  normalizeRadarSummaries,
  safeJson,
  copilotResponse,
  mailError,
  copilotError,
};
