const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  createBrowserSources,
  currentSemesterKey,
  normalizeNewtonAttendance,
  normalizeRishiverseAttendance,
} = require('../../backend/features/sync/browserSources');

function response(url, status, payload) {
  return { url: () => url, status: () => status, json: async () => payload };
}

function mockChromium(
  onNavigate,
  landingUrl = 'https://my.newtonschool.co/course/viwuaeik1m82/details',
  { accountCount = 0, googleButtonCount = 0 } = {},
) {
  let currentUrl = landingUrl;
  const page = {
    handlers: {},
    routes: [],
    on(event, handler) {
      this.handlers[event] = handler;
    },
    route(_pattern, handler) {
      this.routes.push(handler);
    },
    mainFrame() {
      return this;
    },
    async goto(url) {
      currentUrl = url;
      await onNavigate(this, url, this.headless);
    },
    url() {
      return currentUrl;
    },
    setUrl(url) {
      currentUrl = url;
    },
    getByText(text, { exact } = {}) {
      return {
        count: async () =>
          exact && (text === 'student@rishihood.edu.in' || text === 'student@nst.rishihood.edu.in')
            ? accountCount
            : 0,
        click: async () => {
          currentUrl = 'https://rishiverse.rishihood.edu.in/oauth/callback';
        },
      };
    },
    getByRole(role, { name } = {}) {
      return {
        count: async () =>
          role === 'button' && name?.test?.('Sign in with Google') ? googleButtonCount : 0,
        click: async () => {
          currentUrl = 'https://accounts.google.com/signin/v2/identifier';
        },
      };
    },
    async waitForURL(predicate) {
      assert.equal(predicate(new URL(currentUrl)), true);
    },
    locator() {
      return { count: async () => 0 };
    },
  };
  const launches = [];
  return {
    launches,
    chromium: {
      async launchPersistentContext(profile, options) {
        page.headless = options.headless;
        launches.push({ profile, options });
        return { pages: () => [page], close: async () => {} };
      },
    },
  };
}

async function main() {
  assert.deepEqual(
    normalizeNewtonAttendance({
      results: [
        { course: { title: 'Systems' }, attended: true },
        { course: { title: 'Systems' }, attended: false },
      ],
    }),
    [{ name: 'Systems', attended: 1, conducted: 2, percent: 50 }],
  );
  assert.throws(
    () => normalizeNewtonAttendance({ results: [{ course: { title: 'Unknown' } }] }),
    /unsupported lecture record/,
  );
  assert.throws(() => normalizeNewtonAttendance({ results: [] }), /No Newton lecture records/);

  assert.deepEqual(
    normalizeRishiverseAttendance({
      data: {
        courses: [
          {
            courseName: 'Networks',
            attendedLectures: 3,
            totalLectures: 4,
            attendancePercentage: 75,
          },
        ],
      },
    }),
    [{ name: 'Networks', attended: 3, conducted: 4, percent: 75 }],
  );
  assert.throws(
    () =>
      normalizeRishiverseAttendance({
        courses: [{ courseName: 'Empty', attendedLectures: 0, totalLectures: 0 }],
      }),
    /no conducted classes/,
  );
  assert.equal(
    currentSemesterKey({
      semesters: [
        { id: 'old', is_current: false },
        { id: 'current', is_current: true },
      ],
    }),
    'current',
  );
  assert.equal(currentSemesterKey({ semesters: [{ id: 'ambiguous', current: false }] }), null);

  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'browser-source-test-'));
  try {
    const newtonTarget = [];
    const mock = mockChromium(async (page) => {
      newtonTarget.push(page.url());
      await page.handlers.response(
        response(
          'https://my.newtonschool.co/api/v2/course/h/viwuaeik1m82/lecture/all/?pagination=false',
          200,
          { results: [{ course: { title: 'Systems' }, attended: true }] },
        ),
      );
    });
    const source = createBrowserSources({
      chromium: mock.chromium,
      profileRoot: path.join(temp, 'private'),
      responseTimeoutMs: 50,
    });
    const result = await source.captureAttendance({ source: 'newton' });
    assert.deepEqual(result, {
      items: [{ name: 'Systems', attended: 1, conducted: 1, percent: 100 }],
    });
    assert.equal(mock.launches[0].options.headless, true);
    assert.equal(fs.statSync(mock.launches[0].profile).mode & 0o777, 0o700);
    assert.equal(newtonTarget[0], 'https://my.newtonschool.co/course/viwuaeik1m82/details');
    assert.deepEqual(await source.captureAttendance({ source: 'newton' }), result);

    const rishiverseMock = mockChromium(
      async (page) => {
        await page.handlers.response(
          response(
            'https://api.rishiverse.rishihood.edu.in/api/v1/students/self/current/attendance/summary',
            200,
            {
              courses: [
                { courseName: 'Networks', attendedLectures: 2, totalLectures: 3 },
              ],
            },
          ),
        );
        await page.handlers.response(
          response('https://api.rishiverse.rishihood.edu.in/api/v1/students/self/academics/semesters', 200, {
            semesters: [
              { id: 'past', is_current: false },
              { id: 'current', is_current: true },
            ],
          }),
        );
      },
      'https://rishiverse.rishihood.edu.in/lms/attendance',
    );
    const rishiverse = createBrowserSources({
      chromium: rishiverseMock.chromium,
      profileRoot: path.join(temp, 'rishiverse'),
      responseTimeoutMs: 50,
    });
    assert.deepEqual(
      await rishiverse.captureAttendance({ source: 'rishiverse' }),
      { items: [{ name: 'Networks', attended: 2, conducted: 3, percent: 66.67 }] },
    );
    const wrongApiHost = mockChromium(
      async (page) => {
        await page.handlers.response(
          response(
            'https://rishiverse.rishihood.edu.in/api/v1/students/self/academics/semesters',
            200,
            { semesters: [{ id: 'current', is_current: true }] },
          ),
        );
      },
      'https://rishiverse.rishihood.edu.in/lms/attendance',
    );
    await assert.rejects(
      createBrowserSources({
        chromium: wrongApiHost.chromium,
        profileRoot: path.join(temp, 'wrong-api-host'),
        responseTimeoutMs: 20,
      }).captureAttendance({ source: 'rishiverse' }),
      (error) => error.code === 'ATTENDANCE_UNAVAILABLE',
    );

    let initialRedirectBlocked = false;
    let visibleLoginOpened = false;
    const retryMock = mockChromium(
      async (page, _url, headless) => {
        if (headless && !initialRedirectBlocked) {
          await page.routes[0]({
            request: () => ({
              isNavigationRequest: () => true,
              frame: () => page,
              url: () => 'https://accounts.google.com/signin/v2/identifier',
            }),
            abort: async () => {
              initialRedirectBlocked = true;
            },
            continue: async () => assert.fail('headless OAuth navigation must be blocked'),
          });
          throw new Error('headless Google redirect blocked');
        }
        if (!headless && !visibleLoginOpened) {
          visibleLoginOpened = true;
          page.setUrl('https://accounts.google.com/signin/v2/identifier');
          return;
        }
        if (headless && visibleLoginOpened) {
          await page.handlers.response(
            response(
              'https://api.rishiverse.rishihood.edu.in/api/v1/students/self/current/attendance/summary',
              200,
              { courses: [{ courseName: 'Networks', attendedLectures: 2, totalLectures: 3 }] },
            ),
          );
          await page.handlers.response(
            response(
              'https://api.rishiverse.rishihood.edu.in/api/v1/students/self/academics/semesters',
              200,
              { semesters: [{ id: 'current', is_current: true }] },
            ),
          );
        }
      },
      'https://rishiverse.rishihood.edu.in/lms/attendance',
      { accountCount: 1 },
    );
    const retrySource = createBrowserSources({
      chromium: retryMock.chromium,
      profileRoot: path.join(temp, 'retry'),
      responseTimeoutMs: 50,
      rishiverseEmail: 'student@rishihood.edu.in',
    });
    assert.deepEqual(
      await retrySource.captureAttendance({ source: 'rishiverse' }),
      { items: [{ name: 'Networks', attended: 2, conducted: 3, percent: 66.67 }] },
    );
    assert.equal(retryMock.launches[0].options.headless, true);
    assert.equal(retryMock.launches[1].options.headless, false);
    assert.equal(retryMock.launches[2].options.headless, true);

    const authMock = mockChromium(async (page) => {
      await page.handlers.response(
        response(
          'https://my.newtonschool.co/api/v2/course/h/viwuaeik1m82/lecture/all/?pagination=false',
          403,
          {},
        ),
      );
    });
    const authSource = createBrowserSources({
      chromium: authMock.chromium,
      profileRoot: path.join(temp, 'auth'),
      responseTimeoutMs: 50,
    });
    await assert.rejects(
      authSource.captureAttendance({ source: 'newton' }),
      (error) => error.code === 'AUTH_REQUIRED',
    );

    const redirectMock = mockChromium(async (page) => {
      await page.routes[0]({
        request: () => ({
          isNavigationRequest: () => true,
          frame: () => page,
          url: () => 'https://external.example/',
        }),
        abort: async () => {},
        continue: async () => assert.fail('untrusted navigation must be blocked'),
      });
      throw new Error('navigation blocked');
    });
    const redirectSource = createBrowserSources({
      chromium: redirectMock.chromium,
      profileRoot: path.join(temp, 'redirect'),
      responseTimeoutMs: 50,
    });
    await assert.rejects(
      redirectSource.captureAttendance({ source: 'newton' }),
      (error) => error.code === 'UNTRUSTED_REDIRECT',
    );

    const googleMock = mockChromium(
      async (page) => {
        await page.routes[0]({
          request: () => ({
            isNavigationRequest: () => true,
            frame: () => page,
            url: () => 'https://accounts.google.com/signin/v2/identifier',
          }),
          abort: async () => assert.fail('RUFP visible login may reach Google accounts'),
          continue: async () => {},
        });
        page.setUrl('https://accounts.google.com/signin/v2/identifier');
      },
      'https://accounts.google.com/signin/v2/identifier',
      { accountCount: 1 },
    );
    const googleLogin = await createBrowserSources({
      chromium: googleMock.chromium,
      profileRoot: path.join(temp, 'google'),
      rishiverseEmail: 'student@rishihood.edu.in',
    }).openLogin({ source: 'rishiverse' });
    assert.equal(googleLogin.status, 'login_open');
    assert.equal(googleLogin.autoSignedIn, true);
    assert.equal(googleMock.launches[0].options.headless, false);
    await googleLogin.close();

    const wrongEmailMock = mockChromium(
      async (page) => {
        page.setUrl('https://accounts.google.com/signin/v2/identifier');
      },
      'https://accounts.google.com/signin/v2/identifier',
      { accountCount: 1 },
    );
    const wrongEmail = await createBrowserSources({
      chromium: wrongEmailMock.chromium,
      profileRoot: path.join(temp, 'wrong-email'),
      rishiverseEmail: 'student@gmail.com',
    }).openLogin({ source: 'rishiverse' });
    assert.equal(wrongEmail.status, 'auth_required');
    assert.equal(wrongEmail.error.code, 'AUTH_REQUIRED');
    assert.match(wrongEmail.error.message, /rishihood\.edu\.in/);
    await wrongEmail.close();

    const challengeMock = mockChromium(
      async (page) => {
        page.setUrl('https://accounts.google.com/signin/v2/challenge/pwd');
      },
      'https://accounts.google.com/signin/v2/challenge/pwd',
    );
    const challenge = await createBrowserSources({
      chromium: challengeMock.chromium,
      profileRoot: path.join(temp, 'challenge'),
      rishiverseEmail: 'student@rishihood.edu.in',
    }).openLogin({ source: 'rishiverse' });
    assert.equal(challenge.status, 'auth_required');
    assert.match(challenge.error.message, /password, MFA, CAPTCHA, consent/);
    await challenge.close();

    const buttonMock = mockChromium(
      async () => {},
      'https://rishiverse.rishihood.edu.in/lms/attendance',
      { accountCount: 1, googleButtonCount: 1 },
    );
    const buttonLogin = await createBrowserSources({
      chromium: buttonMock.chromium,
      profileRoot: path.join(temp, 'google-button'),
      rishiverseEmail: 'student@rishihood.edu.in',
    }).openLogin({ source: 'rishiverse' });
    assert.equal(buttonLogin.status, 'login_open');
    assert.equal(buttonLogin.autoSignedIn, true);
    await buttonLogin.close();

    let visibleUrl;
    const loginMock = mockChromium(async (_page, url) => {
      visibleUrl = url;
    });
    const login = await createBrowserSources({
      chromium: loginMock.chromium,
      profileRoot: path.join(temp, 'login'),
      responseTimeoutMs: 50,
    }).openLogin({ source: 'newton' });
    assert.equal(login.status, 'login_open');
    assert.equal(loginMock.launches[0].options.headless, false);
    assert.equal(visibleUrl, 'https://my.newtonschool.co/course/viwuaeik1m82/details');
    await login.close();

    const invalid = source.captureAttendance({
      source: 'newton',
      url: 'https://my.newtonschool.co.evil.example/course/viwuaeik1m82/details',
    });
    await assert.rejects(invalid, (error) => error.code === 'CONFIG_REQUIRED');
    await assert.rejects(
      source.captureAttendance({
        source: 'newton',
        url: 'https://my.newtonschool.co/course/h/viwuaeik1m82/',
      }),
      (error) => error.code === 'CONFIG_REQUIRED',
    );
    await assert.rejects(
      source.captureAttendance({
        source: 'rishiverse',
        url: 'https://rishiverse.com/dashboard',
      }),
      (error) => error.code === 'CONFIG_REQUIRED',
    );

    // Test that exact user URL https://rishiverse.rishihood.edu.in/dashboard is accepted
    // and captureAttendance navigates to /lms/attendance
    let navigatedUrl = null;
    const dashboardMock = mockChromium(
      async (page, url) => {
        navigatedUrl = url;
        await page.handlers.response(
          response(
            'https://api.rishiverse.rishihood.edu.in/api/v1/students/self/current/attendance/summary',
            200,
            { courses: [{ courseName: 'Systems', attendedLectures: 4, totalLectures: 5 }] },
          ),
        );
        await page.handlers.response(
          response('https://api.rishiverse.rishihood.edu.in/api/v1/students/self/academics/semesters', 200, {
            semesters: [{ id: 'current', is_current: true }],
          }),
        );
      },
      'https://rishiverse.rishihood.edu.in/lms/attendance',
    );
    const dashboardSource = createBrowserSources({
      chromium: dashboardMock.chromium,
      profileRoot: path.join(temp, 'dashboard-test'),
      responseTimeoutMs: 50,
    });
    const dashboardResult = await dashboardSource.captureAttendance({
      source: 'rishiverse',
      url: 'https://rishiverse.rishihood.edu.in/dashboard',
    });
    assert.deepEqual(dashboardResult, {
      items: [{ name: 'Systems', attended: 4, conducted: 5, percent: 80 }],
    });
    assert.equal(navigatedUrl, 'https://rishiverse.rishihood.edu.in/lms/attendance');

    // Test @nst.rishihood.edu.in email is accepted
    const nstEmailMock = mockChromium(
      async (page) => {
        page.setUrl('https://accounts.google.com/signin/v2/identifier');
      },
      'https://accounts.google.com/signin/v2/identifier',
      { accountCount: 1 },
    );
    const nstLogin = await createBrowserSources({
      chromium: nstEmailMock.chromium,
      profileRoot: path.join(temp, 'nst-email'),
      rishiverseEmail: 'student@nst.rishihood.edu.in',
    }).openLogin({ source: 'rishiverse' });
    assert.equal(nstLogin.status, 'login_open');
    assert.equal(nstLogin.autoSignedIn, true);
    await nstLogin.close();
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
  console.log('PASS: browser attendance parsers, auth errors, isolated profile permissions, and visible login bootstrap.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
