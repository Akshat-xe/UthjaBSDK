'use strict';

const MAX_INPUT_SIZE = 1024 * 1024;
const MAX_INPUT_NODES = 50_000;
const MAX_INPUT_ARRAY_LENGTH = 5_000;
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const MEALS = ['breakfast', 'lunch', 'snacks', 'dinner'];
const SOURCE_STATUSES = new Set(['success', 'partial', 'failed', 'setup_required', 'running']);

function inputError(path, expected) {
  return new TypeError(`Invalid mobile snapshot input at ${path}: expected ${expected}.`);
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function descriptorValue(record, key) {
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  return descriptor && Object.hasOwn(descriptor, 'value') ? descriptor.value : undefined;
}

function validateInputTree(root) {
  let nodes = 0;
  let size = 0;
  const seen = new Set();
  const stack = [{ value: root, depth: 0 }];
  while (stack.length) {
    const { value, depth } = stack.pop();
    nodes++;
    if (nodes > MAX_INPUT_NODES) throw new RangeError('Mobile snapshot input is too complex.');
    if (typeof value === 'string') {
      size += Buffer.byteLength(value, 'utf8');
    } else if (typeof value === 'number') {
      if (!Number.isFinite(value)) throw inputError('input', 'finite numbers');
    } else if (value === null || typeof value === 'boolean') {
      continue;
    } else if (typeof value === 'object') {
      if (seen.has(value)) throw inputError('input', 'acyclic JSON-compatible data');
      seen.add(value);
      if (depth >= 24) throw new RangeError('Mobile snapshot input is nested too deeply.');
      const isArray = Array.isArray(value);
      const prototype = Object.getPrototypeOf(value);
      if (prototype !== (isArray ? Array.prototype : Object.prototype) && prototype !== null)
        throw inputError('input', 'plain JSON-compatible objects and arrays');
      if (Object.getOwnPropertySymbols(value).length)
        throw inputError('input', 'string-keyed JSON-compatible data');
      if (isArray && value.length > MAX_INPUT_ARRAY_LENGTH)
        throw new RangeError('Mobile snapshot input array exceeds 5000 items.');
      const keys = Object.keys(value);
      if (isArray && keys.filter((key) => /^(0|[1-9]\d*)$/.test(key)).length !== value.length)
        throw inputError('input', 'dense arrays');
      size += keys.reduce((total, key) => total + Buffer.byteLength(key, 'utf8'), 0);
      for (const key of keys) {
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (!descriptor || !Object.hasOwn(descriptor, 'value'))
          throw inputError('input', 'data properties without accessors');
        stack.push({ value: descriptor.value, depth: depth + 1 });
      }
    } else {
      throw inputError('input', 'JSON-compatible values');
    }
    if (size > MAX_INPUT_SIZE) throw new RangeError('Mobile snapshot input exceeds 1 MiB.');
  }
  if (size > MAX_INPUT_SIZE) throw new RangeError('Mobile snapshot input exceeds 1 MiB.');
}

function recordAt(value, path, optional = false) {
  if ((value === undefined || value === null) && optional) return null;
  if (!isRecord(value)) throw inputError(path, 'an object');
  return value;
}

function arrayAt(value, path, maximum = Infinity) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw inputError(path, 'an array');
  return value.slice(0, maximum);
}

function textAt(value, path, maximum, fallback = '') {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== 'string') throw inputError(path, 'a string');
  return value
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maximum);
}

function identifierAt(value, path) {
  const identifier = textAt(value, path, Number.MAX_SAFE_INTEGER);
  if (!identifier || identifier.length > 100)
    throw inputError(path, 'a non-empty string of at most 100 characters');
  return identifier;
}

function numberAt(value, path, fallback = 0, maximum = Number.MAX_SAFE_INTEGER) {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > maximum)
    throw inputError(path, `a number between 0 and ${maximum}`);
  return value;
}

function timestampAt(value, path) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value)))
    throw inputError(path, 'a valid timestamp or null');
  return new Date(value).toISOString();
}

function safeUrl(value, path, maximum = 500) {
  const text = textAt(value, path, Number.MAX_SAFE_INTEGER);
  if (!text) return '';
  let parsed;
  try {
    parsed = new URL(text);
  } catch {
    throw inputError(path, 'an HTTPS URL');
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password)
    throw inputError(path, 'an HTTPS URL without embedded credentials');
  const normalized = parsed.toString();
  if (normalized.length > maximum)
    throw inputError(path, `an HTTPS URL no longer than ${maximum} characters`);
  return normalized;
}

function pickText(record, key, path, maximum, fallback = '') {
  return textAt(descriptorValue(record, key), `${path}.${key}`, maximum, fallback);
}

function pickNumber(record, key, path, maximum = Number.MAX_SAFE_INTEGER) {
  return numberAt(descriptorValue(record, key), `${path}.${key}`, 0, maximum);
}

function enumAt(value, path, allowed, fallback = '') {
  const text = textAt(value, path, 40, fallback);
  if (!text || !allowed.includes(text)) throw inputError(path, `one of ${allowed.join(', ')}`);
  return text;
}

function attendanceSummary(value, path) {
  if (value === undefined || value === null) return null;
  const record = recordAt(value, path);
  return {
    attended: pickNumber(record, 'attended', path),
    total: pickNumber(record, 'total', path),
    percent: pickNumber(record, 'percent', path, 100),
    canMiss: pickNumber(record, 'canMiss', path),
    needAttend: pickNumber(record, 'needAttend', path),
  };
}

function projectAcademic(value) {
  const academic = recordAt(value, 'academic');
  const attendanceInput = recordAt(
    descriptorValue(academic, 'attendance'),
    'academic.attendance',
    true,
  );
  const attendance = {};
  for (const key of ['combined', 'nst', 'rufp']) {
    attendance[key] = attendanceSummary(
      attendanceInput && descriptorValue(attendanceInput, key),
      `academic.attendance.${key}`,
    );
  }

  const subjects = arrayAt(descriptorValue(academic, 'subjects'), 'academic.subjects', 100).map(
    (subject, index) => {
      const path = `academic.subjects[${index}]`;
      const row = recordAt(subject, path);
      return {
        name: pickText(row, 'name', path, 100),
        group: pickText(row, 'group', path, 60),
        code: pickText(row, 'code', path, 40),
        attended: pickNumber(row, 'attended', path),
        total: pickNumber(row, 'total', path),
        absent: pickNumber(row, 'absent', path),
        percent: pickNumber(row, 'percent', path, 100),
        canMiss: pickNumber(row, 'canMiss', path),
        needAttend: pickNumber(row, 'needAttend', path),
      };
    },
  );
  const schedule = arrayAt(descriptorValue(academic, 'schedule'), 'academic.schedule', 14).map(
    (day, index) => {
      const path = `academic.schedule[${index}]`;
      if (typeof day === 'string') {
        return {
          date: '',
          badge: '',
          items: [
            {
              time: '',
              subject: '',
              type: '',
              title: textAt(day, path, 140),
              status: 'Scheduled',
              location: '',
            },
          ],
        };
      }
      const row = recordAt(day, path);
      const items = arrayAt(descriptorValue(row, 'items'), `${path}.items`, 8).map(
        (item, itemIndex) => {
          const itemPath = `${path}.items[${itemIndex}]`;
          if (typeof item === 'string') {
            return {
              time: '',
              subject: '',
              type: '',
              title: textAt(item, itemPath, 140),
              status: 'Scheduled',
              location: '',
            };
          }
          const classRow = recordAt(item, itemPath);
          return {
            time: pickText(classRow, 'time', itemPath, 48),
            subject: pickText(classRow, 'subject', itemPath, 100),
            type: pickText(classRow, 'type', itemPath, 48),
            title: textAt(
              descriptorValue(classRow, 'title') ?? descriptorValue(classRow, 'name'),
              `${itemPath}.title`,
              140,
              'Class',
            ),
            status: textAt(
              descriptorValue(classRow, 'status'),
              `${itemPath}.status`,
              48,
              'Scheduled',
            ),
            location: pickText(classRow, 'location', itemPath, 100),
          };
        },
      );
      return {
        date: pickText(row, 'date', path, 48),
        badge: pickText(row, 'badge', path, 60),
        items,
      };
    },
  );
  const emails = arrayAt(descriptorValue(academic, 'emails'), 'academic.emails', 12)
    .map((email, index) => {
      const path = `academic.emails[${index}]`;
      const row = recordAt(email, path);
      const summary =
        textAt(descriptorValue(row, 'summary'), `${path}.summary`, 220) ||
        textAt(descriptorValue(row, 'snippet'), `${path}.summary`, 220);
      return {
        sender: textAt(descriptorValue(row, 'sender'), `${path}.sender`, 100, 'Academic notice'),
        subject: textAt(
          descriptorValue(row, 'subject') ?? descriptorValue(row, 'aiTitle'),
          `${path}.subject`,
          180,
          'No subject',
        ),
        summary,
        date: textAt(
          descriptorValue(row, 'dateOnly') ?? descriptorValue(row, 'date'),
          `${path}.date`,
          48,
        ),
        category: textAt(descriptorValue(row, 'category'), `${path}.category`, 48, 'Academic'),
        priority: textAt(
          descriptorValue(row, 'priority') ?? descriptorValue(row, 'urgency'),
          `${path}.priority`,
          24,
        ),
        actionItem: pickText(row, 'actionItem', path, 180),
      };
    })
    .filter((email) => email.subject || email.summary);

  return {
    importedAt: timestampAt(descriptorValue(academic, 'importedAt'), 'academic.importedAt'),
    semester: pickText(academic, 'semester', 'academic', 40),
    attendance,
    subjects,
    schedule,
    emails,
  };
}

function projectRadar(value) {
  const radar = recordAt(value, 'radar');
  const opportunities = arrayAt(
    descriptorValue(radar, 'opportunities'),
    'radar.opportunities',
    50,
  ).map((item, index) => {
    const path = `radar.opportunities[${index}]`;
    const row = recordAt(item, path);
    const rawData = recordAt(descriptorValue(row, 'raw_data'), `${path}.raw_data`, true);
    const review = rawData
      ? recordAt(
          descriptorValue(rawData, 'localReview') ?? descriptorValue(rawData, 'aiResearch'),
          `${path}.raw_data.review`,
          true,
        )
      : null;
    const analysisInput = recordAt(descriptorValue(row, 'analysis'), `${path}.analysis`, true);
    const minimumTeam = numberAt(
      rawData && descriptorValue(rawData, 'minTeam'),
      `${path}.raw_data.minTeam`,
      null,
      100,
    );
    const maximumTeam = numberAt(
      rawData && descriptorValue(rawData, 'maxTeam'),
      `${path}.raw_data.maxTeam`,
      null,
      100,
    );
    const url = descriptorValue(row, 'event_url') ?? descriptorValue(row, 'eventUrl');
    const skillsValue = descriptorValue(row, 'skills_required') ?? descriptorValue(row, 'skills');
    const skills = arrayAt(skillsValue, `${path}.skills`, 12).map((skill, skillIndex) =>
      textAt(skill, `${path}.skills[${skillIndex}]`, 40),
    );
    const id = identifierAt(descriptorValue(row, 'id'), `${path}.id`);
    const title = textAt(descriptorValue(row, 'title'), `${path}.title`, 180);
    if (!title) throw inputError(`${path}.title`, 'a non-empty string');
    const areaScope = enumAt(descriptorValue(row, 'areaScope'), `${path}.areaScope`, [
      'local',
      'remote',
      'outside',
      'unknown',
    ]);
    const teamSizeValue =
      minimumTeam !== null || maximumTeam !== null
        ? `${minimumTeam ?? 1}–${maximumTeam ?? minimumTeam} people`
        : review && descriptorValue(review, 'teamSize');
    if (minimumTeam !== null && maximumTeam !== null && minimumTeam > maximumTeam)
      throw inputError(`${path}.raw_data`, 'minimum team size no greater than maximum team size');
    return {
      id,
      title,
      organizer: pickText(row, 'organizer', path, 120),
      platform: pickText(row, 'platform', path, 40),
      url: safeUrl(url, `${path}.url`),
      mode: pickText(row, 'mode', path, 40),
      location: pickText(row, 'location', path, 120),
      locationLabel: textAt(
        descriptorValue(row, 'locationLabel') ?? descriptorValue(row, 'location'),
        `${path}.locationLabel`,
        120,
      ),
      areaScope,
      distanceKm: numberAt(descriptorValue(row, 'distanceKm'), `${path}.distanceKm`, null, 20050),
      prizePool: textAt(
        descriptorValue(row, 'prize_pool') ?? (review && descriptorValue(review, 'prizePool')),
        `${path}.prizePool`,
        100,
      ),
      teamSize: textAt(teamSizeValue, `${path}.teamSize`, 60),
      minTeam: minimumTeam,
      maxTeam: maximumTeam,
      registrationDeadline: textAt(
        descriptorValue(row, 'registration_deadline') ??
          descriptorValue(row, 'registrationDeadline'),
        `${path}.registrationDeadline`,
        48,
      ),
      startDate: textAt(
        descriptorValue(row, 'start_date') ?? descriptorValue(row, 'startDate'),
        `${path}.startDate`,
        48,
      ),
      endDate: textAt(
        descriptorValue(row, 'end_date') ?? descriptorValue(row, 'endDate'),
        `${path}.endDate`,
        48,
      ),
      summary: textAt(
        descriptorValue(row, 'summary') ?? (review && descriptorValue(review, 'summary')),
        `${path}.summary`,
        500,
      ),
      skills,
      details: {
        description: textAt(
          rawData && descriptorValue(rawData, 'description'),
          `${path}.details.description`,
          1000,
        ),
        eligibility: textAt(
          rawData && descriptorValue(rawData, 'eligibility'),
          `${path}.details.eligibility`,
          120,
        ),
        submissionDates: textAt(
          rawData && descriptorValue(rawData, 'submissionDates'),
          `${path}.details.submissionDates`,
          120,
        ),
      },
      analysis: analysisInput
        ? {
            bucket: enumAt(descriptorValue(analysisInput, 'bucket'), `${path}.analysis.bucket`, [
              'easy',
              'medium',
              'hard',
              'unverified',
            ]),
            tier: enumAt(descriptorValue(analysisInput, 'tier'), `${path}.analysis.tier`, [
              'Tier S',
              'Tier A',
              'Tier B',
              'Tier C',
              'Tier D',
              'Tier E',
            ]),
            tierKey: enumAt(descriptorValue(analysisInput, 'tierKey'), `${path}.analysis.tierKey`, [
              'S',
              'A',
              'B',
              'C',
              'D',
              'E',
            ]),
            difficulty: enumAt(
              descriptorValue(analysisInput, 'difficulty'),
              `${path}.analysis.difficulty`,
              ['easy', 'medium', 'hard', 'unknown'],
            ),
            effortHours: textAt(
              descriptorValue(analysisInput, 'effortHours'),
              `${path}.analysis.effortHours`,
              40,
            ),
            confidence: enumAt(
              descriptorValue(analysisInput, 'confidence'),
              `${path}.analysis.confidence`,
              ['low', 'medium', 'high'],
            ),
          }
        : null,
    };
  });
  return {
    fetchedAt: timestampAt(
      descriptorValue(radar, 'fetchedAt') ?? descriptorValue(radar, 'updatedAt'),
      'radar.fetchedAt',
    ),
    opportunities,
  };
}

function projectMenu(value) {
  const menuInput = recordAt(value, 'menu');
  const weeklyMenu = recordAt(descriptorValue(menuInput, 'menu'), 'menu.menu');
  const menu = {};
  for (const day of DAYS) {
    const dayInput = recordAt(descriptorValue(weeklyMenu, day), `menu.menu.${day}`);
    const dayMenu = {};
    for (const meal of MEALS) {
      const items = arrayAt(descriptorValue(dayInput, meal), `menu.menu.${day}.${meal}`, 40);
      dayMenu[meal] = items.map((item, index) =>
        textAt(item, `menu.menu.${day}.${meal}[${index}]`, 100),
      );
    }
    menu[day] = dayMenu;
  }
  return {
    fetchedAt: timestampAt(
      descriptorValue(menuInput, 'fetchedAt') ?? descriptorValue(menuInput, 'updatedAt'),
      'menu.fetchedAt',
    ),
    menu,
  };
}

function projectSource(syncResult, name, lastGoodUpdatedAt) {
  const sources = recordAt(descriptorValue(syncResult, 'sources'), 'syncResult.sources', true);
  const result = sources ? descriptorValue(sources, name) : undefined;
  if (result !== undefined && !isRecord(result))
    throw inputError(`syncResult.sources.${name}`, 'an object');
  const status = result ? descriptorValue(result, 'status') : 'unavailable';
  if (status !== 'unavailable' && !SOURCE_STATUSES.has(status))
    throw inputError(`syncResult.sources.${name}.status`, 'a recognized source status');
  const resultTimestamp =
    result && status === 'success' ? descriptorValue(result, 'updatedAt') : undefined;
  const updatedAt = timestampAt(
    lastGoodUpdatedAt ?? resultTimestamp,
    `syncResult.sources.${name}.updatedAt`,
  );
  const freshness = status === 'success' && updatedAt ? 'fresh' : updatedAt ? 'stale' : 'unknown';
  return { status, freshness, updatedAt };
}

function projectSnapshot(input) {
  if (!isRecord(input)) throw inputError('input', 'an object');
  validateInputTree(input);
  const academicInput = recordAt(descriptorValue(input, 'academic'), 'academic');
  const radarInput = recordAt(descriptorValue(input, 'radar'), 'radar');
  const menuInput = recordAt(descriptorValue(input, 'menu'), 'menu');
  const syncResult = recordAt(descriptorValue(input, 'syncResult'), 'syncResult');
  const metadata = recordAt(descriptorValue(input, 'metadata'), 'metadata');
  const revision = identifierAt(descriptorValue(metadata, 'revision'), 'metadata.revision');
  const runId = identifierAt(descriptorValue(metadata, 'runId'), 'metadata.runId');
  const publishedAt = timestampAt(descriptorValue(metadata, 'publishedAt'), 'metadata.publishedAt');
  if (!publishedAt) throw inputError('metadata.publishedAt', 'a valid timestamp');

  const academic = projectAcademic(academicInput);
  const radar = projectRadar(radarInput);
  const menu = projectMenu(menuInput);
  const academicSources = recordAt(
    descriptorValue(academicInput, 'sources'),
    'academic.sources',
    true,
  );
  const mailUpdatedAt = descriptorValue(academicInput, 'mailUpdatedAt');
  const sourceTimestamp = (name, fallback) => {
    const source = academicSources && descriptorValue(academicSources, name);
    const sourceRecord =
      source === undefined || source === null ? null : recordAt(source, `academic.sources.${name}`);
    return (sourceRecord && descriptorValue(sourceRecord, 'updatedAt')) ?? fallback;
  };
  const sources = {
    newton: projectSource(syncResult, 'newton', sourceTimestamp('newton', undefined)),
    rishiverse: projectSource(syncResult, 'rishiverse', sourceTimestamp('rishiverse', undefined)),
    gmail: projectSource(syncResult, 'gmail', sourceTimestamp('gmail', mailUpdatedAt)),
    radar: projectSource(syncResult, 'radar', radar.fetchedAt),
    menu: projectSource(syncResult, 'menu', menu.fetchedAt),
  };
  return {
    schemaVersion: 1,
    revision,
    runId,
    publishedAt,
    sources,
    academic,
    radar,
    menu,
  };
}

module.exports = { projectSnapshot };
