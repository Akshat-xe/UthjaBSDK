const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_EXECUTABLE,
    headless: true,
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
  });
  async function scenario(time, records = {}) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      timezoneId: 'Asia/Kolkata',
      permissions: ['camera'],
    });
    await context.route('**/api/tracker-backup', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
    );
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.clock.install({ time: new Date(time) });
    await page.goto(`${BASE_URL}/#today`);
    await page.evaluate((records) => {
      localStorage.setItem('rhythm-settings', JSON.stringify({ alarms: true }));
      localStorage.setItem(
        'rhythm-records-v1',
        JSON.stringify({ days: records, notes: [], wardrobe: [], events: [] }),
      );
    }, records);
    await page.reload();
    return { context, page, errors };
  }
  let s = await scenario('2026-09-14T05:15:00+05:30');
  await s.page.clock.runFor(2100);
  assert.equal(await s.page.locator('#alarmTitle').innerText(), 'Wake up. Start fresh.');
  assert.equal(await s.page.locator('#snoozeButton').innerText(), 'Wait 60 seconds');
  await s.page.locator('#snoozeButton').click();
  assert(!(await s.page.locator('#alarmDialog').isVisible()));
  await s.page.clock.runFor(60000);
  assert.equal(await s.page.locator('#alarmTitle').innerText(), 'Wake up. Start fresh.');
  await s.page.getByRole('button', { name: 'Start front camera' }).click();
  await s.page.locator('#captureButton').waitFor();
  await s.page.clock.resume();
  await s.page.waitForFunction(() => document.querySelector('#camera').videoWidth > 0);
  await s.page.locator('#captureButton').click();
  await s.page.locator('#alarmAck').check();
  await s.page.locator('#alarmDone').click();
  assert(
    await s.page
      .locator('#detailTitle')
      .innerText()
      .then((t) => t.includes('quiet start')),
  );
  assert.equal(
    await s.page.evaluate(
      () =>
        JSON.parse(localStorage.getItem('rhythm-records-v1')).days['2026-09-14'].done.wake
          .verification,
    ),
    'live_selfie_capture_unverified',
  );
  assert.deepEqual(s.errors, []);
  await s.context.close();
  s = await scenario('2026-09-14T17:00:00+05:30');
  await s.page.clock.runFor(60000);
  assert(!(await s.page.locator('#alarmDialog').isVisible()));
  await s.context.close();
  const day = {
    done: {},
    checks: [],
    water: 0,
    mode: 'custom',
    attendance: {},
    scores: {},
    snoozes: {},
    alerted: {},
  };
  s = await scenario('2026-09-14T22:59:00+05:30', { '2026-09-14': day });
  await s.page.clock.runFor(59000);
  assert(!(await s.page.locator('#alarmDialog').isVisible()));
  await s.page.clock.runFor(2000);
  assert.equal(await s.page.locator('#alarmTitle').innerText(), 'Time to sleep');
  await s.context.close();
  s = await scenario('2026-09-17T08:51:00+05:30');
  await s.page.clock.runFor(1000);
  assert.equal(await s.page.locator('#alarmTitle').innerText(), 'Understanding India');
  await s.page.reload();
  await s.page.clock.runFor(91000);
  assert.equal(await s.page.locator('#alarmTitle').innerText(), 'Understanding India');
  await s.context.close();
  // Custom routines and keyboard dialog flow.
  s = await scenario('2026-09-17T08:51:00+05:30');
  await s.page.evaluate(() =>
    localStorage.setItem('rhythm-settings', JSON.stringify({ alarms: false })),
  );
  await s.page.reload();
  await s.page.goto(`${BASE_URL}/#today`);
  await s.page.getByRole('button', { name: 'Add personal routine' }).click();
  await s.page.locator('#taskForm [name=title]').fill('Review contest arrays');
  await s.page.locator('#taskForm [name=start]').fill('20:30');
  await s.page.locator('#taskForm [name=end]').fill('21:00');
  await s.page.getByRole('button', { name: 'Save routine', exact: true }).click();
  assert((await s.page.getByText('Review contest arrays', { exact: true }).count()) === 1);
  assert.deepEqual(s.errors, []);
  await s.context.close();
  await browser.close();
  console.log(
    'PASS: 5:15 wake, 60-second wait, camera capture gate, quiet hour, Custom expiry at 11 PM, refresh recovery and custom routine creation.',
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
