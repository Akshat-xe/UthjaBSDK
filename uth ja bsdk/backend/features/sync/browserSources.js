'use strict';

const fs = require('node:fs');
const path = require('node:path');

const NEWTON_HOST = 'my.newtonschool.co';
const RISHIVERSE_HOST = 'rishiverse.rishihood.edu.in';
const RISHIVERSE_API_HOST = 'api.rishiverse.rishihood.edu.in';
const GOOGLE_ACCOUNTS_HOST = 'accounts.google.com';
const NEWTON_COURSE_HASH = 'viwuaeik1m82';
const DEFAULT_NEWTON_URL = `https://${NEWTON_HOST}/course/${NEWTON_COURSE_HASH}/details`;
const DEFAULT_RISHIVERSE_URL = `https://${RISHIVERSE_HOST}/dashboard`;
const DEFAULT_PROFILE_ROOT = path.resolve(__dirname, '../../data/browser-sources');

class UnsupportedPayloadError extends Error {}

class BrowserSourceError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'BrowserSourceError';
    this.code = code;
  }
}

function sourceUrl(source, value) {
  if (!['newton', 'rishiverse'].includes(source)) {
    throw new BrowserSourceError('CONFIG_REQUIRED', 'Choose the newton or rishiverse attendance source.');
  }

  const allowedHost = source === 'newton' ? NEWTON_HOST : RISHIVERSE_HOST;
  let url;
  try {
    url = new URL(
      value || (source === 'newton' ? DEFAULT_NEWTON_URL : DEFAULT_RISHIVERSE_URL),
    );
  } catch {
    throw new BrowserSourceError('CONFIG_REQUIRED', 'A valid institutional dashboard URL is required.');
  }
  if (
    url.protocol !== 'https:' ||
    url.hostname !== allowedHost ||
    url.username ||
    url.password ||
    (url.port && url.port !== '443')
  ) {
    throw new BrowserSourceError('CONFIG_REQUIRED', 'The URL must use the exact HTTPS institutional host.');
  }
  if (
    source === 'newton' &&
    url.pathname !== `/course/${NEWTON_COURSE_HASH}/details`
  ) {
    throw new BrowserSourceError('CONFIG_REQUIRED', 'Use the configured Newton course details URL.');
  }
  if (
    source === 'rishiverse' &&
    !['/lms/attendance', '/dashboard'].includes(url.pathname)
  ) {
    throw new BrowserSourceError('CONFIG_REQUIRED', 'Use the Rishiverse dashboard or LMS attendance URL.');
  }
  return url;
}

function attendanceValue(value) {
  if (value === true || value === 1) return true;
  if (value === false || value === 0) return false;
  return null;
}

function courseName(row) {
  const value =
    row.courseName ??
    row.course_name ??
    row.course?.name ??
    row.course?.title ??
    row.subjectName ??
    row.subject_name;
  return typeof value === 'string' ? value.trim() : '';
}

function recordList(payload, keys) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return null;
  for (const key of keys) {
    if (Array.isArray(payload[key])) return payload[key];
  }
  if (payload.data && typeof payload.data === 'object') {
    for (const key of keys) {
      if (Array.isArray(payload.data[key])) return payload.data[key];
    }
  }
  return null;
}

function normalizeNewtonAttendance(payload) {
  const records = recordList(payload, ['results', 'lectures', 'items']);
  if (!records?.length) throw new UnsupportedPayloadError('No Newton lecture records were returned.');

  const courses = new Map();
  for (const row of records) {
    if (!row || typeof row !== 'object') {
      throw new UnsupportedPayloadError('Newton returned an unsupported lecture record.');
    }
    const name = courseName(row);
    const attended = attendanceValue(row.attended ?? row.is_attended ?? row.isAttended);
    if (!name || attended === null) {
      throw new UnsupportedPayloadError('Newton returned an unsupported lecture record.');
    }
    const item = courses.get(name) || { name, attended: 0, conducted: 0 };
    item.conducted += 1;
    if (attended) item.attended += 1;
    courses.set(name, item);
  }

  const items = [...courses.values()].map((item) => ({
    ...item,
    percent: Math.round((item.attended / item.conducted) * 10000) / 100,
  }));
  if (!items.length || items.every((item) => item.conducted === 0)) {
    throw new UnsupportedPayloadError('Newton returned no attendance data.');
  }
  return items;
}

function countValue(value) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function normalizeRishiverseAttendance(payload) {
  const records = recordList(payload, ['courses', 'results', 'attendance', 'items']);
  if (!records?.length) {
    const nested = payload?.data;
    const nestedRecords = recordList(nested, ['courses', 'results', 'attendance', 'items']);
    if (!nestedRecords?.length) {
      throw new UnsupportedPayloadError('Rishiverse returned no attendance courses.');
    }
    return normalizeRishiverseRows(nestedRecords);
  }
  return normalizeRishiverseRows(records);
}

function normalizeRishiverseRows(records) {
  const items = [];
  for (const row of records) {
    if (!row || typeof row !== 'object') {
      throw new UnsupportedPayloadError('Rishiverse returned an unsupported attendance course.');
    }
    const name = courseName(row);
    const attended = countValue(
      row.attendedLectures ?? row.attended_lectures ?? row.classesAttended ?? row.attended,
    );
    const conducted = countValue(
      row.totalLectures ?? row.total_lectures ?? row.classesConducted ?? row.conducted,
    );
    if (!name || attended === null || conducted === null || attended > conducted) {
      throw new UnsupportedPayloadError('Rishiverse returned an unsupported attendance course.');
    }
    if (conducted > 0) {
      items.push({
        name,
        attended,
        conducted,
        percent: Math.round((attended / conducted) * 10000) / 100,
      });
    }
  }
  if (!items.length) throw new UnsupportedPayloadError('Rishiverse returned no conducted classes.');
  return items;
}

function currentSemesterKey(payload) {
  const semesters = recordList(payload, ['semesters', 'results', 'items']);
  const nestedSemesters = semesters || recordList(payload?.data, ['semesters', 'results', 'items']);
  if (nestedSemesters) {
    const current = nestedSemesters.filter(
      (semester) =>
        semester &&
        (semester.is_current === true ||
          semester.isCurrent === true ||
          semester.current === true),
    );
    if (current.length !== 1) return null;
    const value =
      current[0].slug ?? current[0].id ?? current[0].semester ?? current[0].code;
    return value === undefined || value === null ? null : String(value);
  }
  const explicit = payload?.current_semester ?? payload?.currentSemester;
  if (typeof explicit === 'string' || typeof explicit === 'number') return String(explicit);
  if (explicit && typeof explicit === 'object') {
    const value = explicit.slug ?? explicit.id ?? explicit.semester ?? explicit.code;
    return value === undefined || value === null ? null : String(value);
  }
  return null;
}

function responseKind(source, url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const expectedHost =
    source === 'newton' ? NEWTON_HOST : source === 'rishiverse' ? RISHIVERSE_API_HOST : null;
  if (parsed.protocol !== 'https:' || parsed.hostname !== expectedHost) return null;
  if (
    source === 'newton' &&
    parsed.pathname === `/api/v2/course/h/${NEWTON_COURSE_HASH}/lecture/all/` &&
    parsed.searchParams.get('pagination') === 'false'
  ) {
    return 'newton-attendance';
  }
  if (source === 'rishiverse') {
    if (parsed.pathname === '/api/v1/students/self/academics/semesters') return 'semesters';
    if (/^\/api\/v1\/students\/self\/[^/]+\/attendance\/summary$/.test(parsed.pathname)) {
      return 'rishiverse-attendance';
    }
  }
  return null;
}

function semesterFromResponseUrl(url) {
  const match = new URL(url).pathname.match(
    /^\/api\/v1\/students\/self\/([^/]+)\/attendance\/summary$/,
  );
  return match ? decodeURIComponent(match[1]) : null;
}

function ensureProfile(profileRoot, source) {
  fs.mkdirSync(profileRoot, { recursive: true, mode: 0o700 });
  const rootStat = fs.lstatSync(profileRoot);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
    throw new Error('The private browser profile directory is not a regular directory.');
  }
  fs.chmodSync(profileRoot, 0o700);
  const profilePath = path.join(profileRoot, source);
  fs.mkdirSync(profilePath, { recursive: true, mode: 0o700 });
  const profileStat = fs.lstatSync(profilePath);
  if (!profileStat.isDirectory() || profileStat.isSymbolicLink()) {
    throw new Error('The private browser profile directory is not a regular directory.');
  }
  fs.chmodSync(profilePath, 0o700);
  return profilePath;
}

async function restrictTopLevelRedirects(page, source, { allowGoogleAccounts = false, onBlocked } = {}) {
  if (typeof page.route !== 'function') return;
  const allowedHost = source === 'newton' ? NEWTON_HOST : RISHIVERSE_HOST;
  await page.route('**/*', async (route) => {
    const request = route.request();
    if (!request.isNavigationRequest() || request.frame() !== page.mainFrame()) {
      await route.continue();
      return;
    }
    let target;
    try {
      target = new URL(request.url());
    } catch {
      onBlocked();
      await route.abort();
      return;
    }
    const allowedGoogleAuth =
      allowGoogleAccounts &&
      source === 'rishiverse' &&
      target.protocol === 'https:' &&
      target.hostname === GOOGLE_ACCOUNTS_HOST;
    if (
      target.protocol !== 'https:' ||
      (target.hostname !== allowedHost && !allowedGoogleAuth)
    ) {
      onBlocked();
      await route.abort();
      return;
    }
    await route.continue();
  });
}

function isGoogleAccountsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === GOOGLE_ACCOUNTS_HOST;
  } catch {
    return false;
  }
}

function googleAuthMessage(reason) {
  const messages = {
    no_saved_account:
      'No saved @rishihood.edu.in email is configured. Open the visible sign-in browser and sign in manually.',
    account_not_found:
      'The Google account chooser has no matching saved @rishihood.edu.in account. Sign in manually.',
    multiple_accounts:
      'The Google account chooser is ambiguous. Select the intended account manually.',
    interactive_auth:
      'Google requires a password, MFA, CAPTCHA, consent, or another interactive step. Complete sign-in manually.',
    returned_elsewhere:
      'Google sign-in did not return to the Rishiverse attendance page. Complete sign-in manually.',
  };
  return messages[reason] || messages.interactive_auth;
}

async function selectSavedRishihoodAccount(page, email) {
  const currentUrl = typeof page.url === 'function' ? page.url() : '';
  if (!isGoogleAccountsUrl(currentUrl)) return { selected: false };
  const url = new URL(currentUrl);
  if (/consent|challenge|captcha|verify/i.test(url.pathname)) {
    return { reason: 'interactive_auth' };
  }
  if (!/accountchooser|signin\/v2\/identifier|\/v3\/signin\/accountchooser/i.test(url.pathname)) {
    return { reason: 'interactive_auth' };
  }
  if (email && !/^[^@\s]+@(?:nst\.)?rishihood\.edu\.in$/i.test(email)) {
    return { reason: 'no_saved_account' };
  }
  if (typeof page.locator === 'function') {
    const passwordCount = await page.locator('input[type="password"]').count();
    if (passwordCount > 0) return { reason: 'interactive_auth' };
  }
  if (typeof page.getByText !== 'function') return { reason: 'account_not_found' };
  const account = email
    ? page.getByText(email, { exact: true })
    : page.getByText(/^[^@\s]+@(?:nst\.)?rishihood\.edu\.in$/i);
  const count = await account.count();
  if (count === 0) return { reason: 'account_not_found' };
  if (count !== 1) return { reason: 'multiple_accounts' };
  await account.click();
  if (typeof page.waitForURL === 'function') {
    try {
      await page.waitForURL(
        (nextUrl) => {
          const parsed = new URL(nextUrl.toString());
          return parsed.protocol === 'https:' && parsed.hostname === RISHIVERSE_HOST;
        },
        { timeout: 10000 },
      );
    } catch {
      const nowUrl = typeof page.url === 'function' ? page.url() : '';
      if (isGoogleAccountsUrl(nowUrl)) {
        return { reason: 'interactive_auth' };
      }
      return { reason: 'returned_elsewhere' };
    }
  }
  const returnedUrl = typeof page.url === 'function' ? page.url() : '';
  try {
    const parsed = new URL(returnedUrl);
    if (parsed.protocol !== 'https:' || parsed.hostname !== RISHIVERSE_HOST) {
      if (isGoogleAccountsUrl(returnedUrl)) {
        return { reason: 'interactive_auth' };
      }
      return { reason: 'returned_elsewhere' };
    }
  } catch {
    return { reason: 'returned_elsewhere' };
  }
  return { selected: true };
}

async function clickRishihoodGoogleSignIn(page) {
  if (typeof page.getByRole !== 'function') return { reason: 'interactive_auth' };
  const name = /^(continue with google|sign in with google|google)$/i;
  const buttons = page.getByRole('button', { name });
  const links = page.getByRole('link', { name });
  const buttonCount = await buttons.count();
  const linkCount = await links.count();
  if (buttonCount + linkCount === 0) return { notFound: true };
  if (buttonCount + linkCount !== 1) {
    return { reason: 'interactive_auth' };
  }
  try {
    await (buttonCount === 1 ? buttons : links).click();
    if (typeof page.waitForURL === 'function') {
      await page.waitForURL(
        (nextUrl) => {
          const parsed = new URL(nextUrl.toString());
          return (
            (parsed.protocol === 'https:' && parsed.hostname === GOOGLE_ACCOUNTS_HOST) ||
            (parsed.protocol === 'https:' && parsed.hostname === RISHIVERSE_HOST)
          );
        },
        { timeout: 10000 },
      );
    }
  } catch {
    return { reason: 'interactive_auth' };
  }
  return isGoogleAccountsUrl(typeof page.url === 'function' ? page.url() : '')
    ? { started: true }
    : { reason: 'interactive_auth' };
}

function createBrowserSources({
  chromium,
  profileRoot = DEFAULT_PROFILE_ROOT,
  responseTimeoutMs = 15000,
  rishiverseEmail = process.env.RISHIVERSE_EMAIL,
} = {}) {
  async function getChromium() {
    if (chromium) return chromium;
    try {
      return require('playwright').chromium;
    } catch {
      throw new Error('Playwright Chromium is not available in this local installation.');
    }
  }

  async function openLogin({ source, url } = {}) {
    let context;
    let blockedRedirect = false;
    try {
      const target = sourceUrl(source, url);
      const browser = await getChromium();
      context = await browser.launchPersistentContext(ensureProfile(profileRoot, source), {
        headless: false,
        channel: 'chrome',
      });
      const page = context.pages()[0] || (await context.newPage());
      await restrictTopLevelRedirects(page, source, {
        allowGoogleAccounts: source === 'rishiverse',
        onBlocked: () => {
          blockedRedirect = true;
        },
      });
      await page.goto(target.toString(), { waitUntil: 'domcontentloaded' });
      let autoSignedIn = false;
      if (source === 'rishiverse') {
        const passwordFields =
          typeof page.locator === 'function'
            ? await page.locator('input[type="password"]:visible').count()
            : 0;
        if (passwordFields > 0) {
          return {
            status: 'auth_required',
            error: { code: 'AUTH_REQUIRED', message: googleAuthMessage('interactive_auth') },
            close: async () => context.close(),
          };
        }
        if (!isGoogleAccountsUrl(page.url())) {
          const signIn = await clickRishihoodGoogleSignIn(page);
          if (signIn.reason) {
            return {
              status: 'auth_required',
              error: { code: 'AUTH_REQUIRED', message: googleAuthMessage(signIn.reason) },
              close: async () => context.close(),
            };
          }
        }
      }
      if (source === 'rishiverse' && isGoogleAccountsUrl(page.url())) {
        const selection = await selectSavedRishihoodAccount(page, rishiverseEmail);
        if (selection.reason) {
          return {
            status: 'auth_required',
            error: {
              code: 'AUTH_REQUIRED',
              message: googleAuthMessage(selection.reason),
            },
            close: async () => context.close(),
          };
        }
        autoSignedIn = selection.selected;
      }
      if (
        source === 'rishiverse' &&
        new URL(page.url()).hostname === RISHIVERSE_HOST &&
        page.url() !== target.toString()
      ) {
        await page.goto(target.toString(), { waitUntil: 'domcontentloaded' });
      }
      if (blockedRedirect) {
        return {
          status: 'auth_required',
          error: {
            code: 'AUTH_REQUIRED',
            message: googleAuthMessage('interactive_auth'),
          },
          close: async () => context.close(),
        };
      }
      return {
        status: 'login_open',
        autoSignedIn,
        close: async () => {
          await context.close();
          return { status: 'closed' };
        },
      };
    } catch (error) {
      if (context) {
        try {
          await context.close();
        } catch {
          return {
            status: 'setup_required',
            error: {
              code: 'BROWSER_CLEANUP_FAILED',
              message: 'The isolated sign-in browser could not close cleanly.',
            },
          };
        }
      }
      const invalidInput = error instanceof BrowserSourceError;
      return {
        status: 'setup_required',
        error: {
          code: blockedRedirect
            ? 'UNTRUSTED_REDIRECT'
            : invalidInput
              ? error.code
              : 'BROWSER_UNAVAILABLE',
          message: invalidInput
            ? error.message
            : blockedRedirect
              ? 'The sign-in page redirected outside its institutional host.'
              : 'Could not open the isolated sign-in browser. Browser diagnostics are not exposed.',
        },
      };
    }
  }

  async function captureAttendance({ source, url, _retriedGoogle = false } = {}) {
    let context;
    let blockedRedirect = false;
    try {
      const target = sourceUrl(source, url);
      const navigateTarget = new URL(target.toString());
      if (source === 'rishiverse') {
        navigateTarget.pathname = '/lms/attendance';
      }
      const browser = await getChromium();
      context = await browser.launchPersistentContext(ensureProfile(profileRoot, source), {
        headless: true,
        channel: 'chrome',
      });
      const page = context.pages()[0] || (await context.newPage());
      await restrictTopLevelRedirects(page, source, {
        onBlocked: () => {
          blockedRedirect = true;
        },
      });
      const state = { items: null, error: null, semester: null, summaries: new Map() };
      let resolveReady;
      const ready = new Promise((resolve) => {
        resolveReady = resolve;
      });

      function finishIfReady() {
        if (state.items || state.error) resolveReady();
      }

      async function onResponse(response) {
        const responseUrl = response.url();
        const kind = responseKind(source, responseUrl);
        if (!kind) return;
        const status = response.status();
        if (status === 401 || status === 403) {
          state.error = {
            code: 'AUTH_REQUIRED',
            message: 'The saved browser sign-in is missing or expired. Open the visible sign-in browser.',
          };
          finishIfReady();
          return;
        }
        if (status < 200 || status >= 300) return;
        try {
          const payload = await response.json();
          if (kind === 'newton-attendance') {
            state.items = normalizeNewtonAttendance(payload);
          } else if (kind === 'semesters') {
            state.semester = currentSemesterKey(payload);
            if (state.semester !== null && state.summaries.has(state.semester)) {
              state.items = state.summaries.get(state.semester);
            }
          } else {
            const semester = semesterFromResponseUrl(responseUrl);
            const items = normalizeRishiverseAttendance(payload);
            state.summaries.set(semester, items);
            if (state.semester !== null && semester === state.semester) state.items = items;
          }
          finishIfReady();
        } catch (error) {
          if (error instanceof UnsupportedPayloadError || kind === 'semesters') {
            state.error = {
              code: 'UNSUPPORTED_RESPONSE',
              message: 'The attendance response did not match a supported site format.',
            };
            finishIfReady();
          } else {
            state.error = {
              code: 'UNREADABLE_RESPONSE',
              message: 'The attendance response could not be read safely.',
            };
            finishIfReady();
          }
        }
      }

      page.on('response', (response) => {
        void onResponse(response).catch(() => {
          state.error = {
            code: 'UNREADABLE_RESPONSE',
            message: 'The attendance response could not be read safely.',
          };
          finishIfReady();
        });
      });
      await page.goto(navigateTarget.toString(), { waitUntil: 'domcontentloaded' });
      const landedUrl = typeof page.url === 'function' ? page.url() : navigateTarget.toString();
      if (
        new URL(landedUrl).hostname !==
        (source === 'newton' ? NEWTON_HOST : RISHIVERSE_HOST)
      ) {
        throw new BrowserSourceError(
          'AUTH_REQUIRED',
          'The site sign-in needs attention. Open the visible sign-in browser.',
        );
      }

      let timeoutHandle;
      const timeout = new Promise((resolve) => {
        timeoutHandle = setTimeout(() => resolve('timeout'), responseTimeoutMs);
      });
      const outcome = await Promise.race([ready.then(() => 'ready'), timeout]);
      clearTimeout(timeoutHandle);
      if (state.error) throw new BrowserSourceError(state.error.code, state.error.message);
      if (state.items?.length) return { items: state.items };
      if (outcome === 'timeout') {
        const passwordFields =
          typeof page.locator === 'function'
            ? await page.locator('input[type="password"]').count()
            : 0;
        const loginRoute = /\/(?:login|sign-?in|auth)(?:\/|$)/i.test(new URL(page.url()).pathname);
        const googleSignIn =
          source === 'rishiverse' && typeof page.getByRole === 'function'
            ? (await page.getByRole('button', { name: /^(continue with google|sign in with google|google)$/i }).count()) > 0
            : false;
        if (passwordFields > 0 || loginRoute || googleSignIn) {
          throw new BrowserSourceError(
            'AUTH_REQUIRED',
            'The saved browser sign-in expired or needs a manual step. Open the visible sign-in browser.',
          );
        }
        throw new BrowserSourceError(
          'ATTENDANCE_UNAVAILABLE',
          'The signed-in page did not provide supported attendance data.',
        );
      }
      throw new BrowserSourceError('ATTENDANCE_UNAVAILABLE', 'No attendance data was returned.');
    } catch (error) {
      if (
        source === 'rishiverse' &&
        !_retriedGoogle &&
        (blockedRedirect || error.code === 'AUTH_REQUIRED')
      ) {
        if (context) {
          try {
            await context.close();
          } catch {
            context = null;
            throw new BrowserSourceError(
              'BROWSER_CLEANUP_FAILED',
              'The isolated browser could not close cleanly.',
            );
          }
          context = null;
        }
        const login = await openLogin({ source, url });
        if (login.status === 'login_open' && login.autoSignedIn) {
          await login.close();
          return await captureAttendance({ source, url, _retriedGoogle: true });
        }
        if (login.close) await login.close();
        throw new BrowserSourceError(
          'AUTH_REQUIRED',
          login.error?.message || googleAuthMessage('interactive_auth'),
        );
      }
      if (error instanceof BrowserSourceError) throw error;
      const missingBrowser = /Playwright Chromium/.test(error?.message || '');
      throw new BrowserSourceError(
        blockedRedirect ? 'UNTRUSTED_REDIRECT' : missingBrowser ? 'SETUP_REQUIRED' : 'BROWSER_ERROR',
        blockedRedirect
          ? 'The page redirected outside its institutional host.'
          : missingBrowser
            ? error.message
            : 'Browser attendance capture failed. Browser diagnostics are not exposed.',
      );
    } finally {
      if (context) {
        try {
          await context.close();
        } catch {
          throw new BrowserSourceError(
            'BROWSER_CLEANUP_FAILED',
            'The isolated browser could not close cleanly.',
          );
        }
      }
    }
  }

  return { captureAttendance, openLogin };
}

const { captureAttendance, openLogin } = createBrowserSources();

module.exports = {
  captureAttendance,
  createBrowserSources,
  currentSemesterKey,
  normalizeNewtonAttendance,
  normalizeRishiverseAttendance,
  openLogin,
};
