const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_EXECUTABLE,
    headless: true,
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  let started = false;
  let statusReadsAfterStart = 0;
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/api/sync', (route) => {
    started = true;
    return route.fulfill({ status: 202, json: { success: true } });
  });
  await page.route('**/api/sync/status', async (route) => {
    if (started) statusReadsAfterStart += 1;
    const snapshot =
      started && statusReadsAfterStart === 1
        ? {
            running: true,
            startedAt: '2026-09-28T05:00:00.000Z',
            sources: {
              newton: { status: 'success' },
              rishiverse: { status: 'running' },
              gmail: { status: 'running' },
              radar: { status: 'running' },
            },
          }
        : started
          ? {
              running: false,
              startedAt: '2026-09-28T05:00:00.000Z',
              finishedAt: '2026-09-28T05:00:03.000Z',
              sources: {
                newton: { status: 'success' },
                rishiverse: { status: 'success' },
                gmail: { status: 'partial', error: 'No unread mail found.' },
                radar: { status: 'success', harvest: { totalFound: 12, newCount: 2 } },
              },
            }
          : { running: false, sources: {} };
    await route.fulfill({ status: 200, json: snapshot });
  });
  await page.goto(`${BASE_URL}/#radar`, { waitUntil: 'domcontentloaded' });
  const update = page.locator('#globalUpdateButton');
  await update.waitFor();
  assert.equal(await update.count(), 1, 'the app exposes one shared update button');
  assert.equal(await page.locator('[data-action="sync-all"]').count(), 0);
  await update.click();
  await page.locator('#globalUpdateDialog[open]').waitFor();
  await page.getByText('Your updates are in progress').waitFor();
  assert.match(await page.locator('#globalUpdateSummary').innerText(), /1 of 4 sources finished/);
  assert.equal(await page.locator('#globalUpdateProgress').getAttribute('aria-valuenow'), '25');
  await page.getByText('Update finished with a few issues').waitFor();
  assert.match(
    await page.locator('#globalUpdateSummary').innerText(),
    /3 of 4 sources updated · 1 need attention/,
  );
  assert.equal(await page.locator('#globalUpdateSources li').count(), 4);
  assert.match(await page.locator('#globalUpdatedAt').innerText(), /Last updated/);
  await page.goto(`${BASE_URL}/#academic-attendance`, { waitUntil: 'domcontentloaded' });
  assert.equal(await page.locator('#globalUpdateButton').count(), 1);
  assert.equal(
    await page.locator('[data-action="sync-all"]').count(),
    0,
    'academic pages use the shared update control',
  );
  assert.deepEqual(errors, [], 'the shared update flow has no browser errors');
  console.log(
    'PASS: one global update button starts a single sync, shows four source results and a completion timestamp on every page.',
  );
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
