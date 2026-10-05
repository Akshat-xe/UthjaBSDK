const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';
(async () => {
  const response = await fetch(`${BASE_URL}/api/academic`);
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(typeof data.available, 'boolean');
  assert.ok(Array.isArray(data.subjects));
  assert.ok(Array.isArray(data.emails));
  assert.ok(data.emails.length <= 12);
  assert.ok(data.emails.every((item) => !('senderEmail' in item) && !('id' in item)));
  assert.deepEqual(
    Object.keys(data).sort(),
    [
      'attendance',
      'available',
      'contests',
      'deadlines',
      'emails',
      'importedAt',
      'schedule',
      'semester',
      'subjects',
      'success',
    ].sort(),
  );
  assert.ok(data.schedule.every((day) => Array.isArray(day.items)));
  assert.ok(
    data.schedule
      .flatMap((day) => day.items)
      .every(
        (item) =>
          typeof item === 'object' &&
          ['time', 'subject', 'type', 'title', 'status', 'location'].every((key) => key in item),
      ),
    'NST timetable preserves times and locations for display',
  );
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_EXECUTABLE,
    headless: true,
  });
  const page = await browser.newPage({ viewport: { width: 1365, height: 1000 } });
  await page.clock.install({ time: new Date('2026-09-28T13:00:00+05:30') });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const assertSharedUpdateControl = async () => {
    assert.equal(await page.locator('#globalUpdateButton').count(), 1);
    assert.equal(await page.locator('[data-action="sync-all"]').count(), 0);
  };
  await page.goto(`${BASE_URL}/#academic-timetable`, { waitUntil: 'networkidle' });
  await assertSharedUpdateControl();
  await page.getByRole('heading', { name: 'Weekly timetable overview' }).waitFor();
  assert.equal(await page.locator('#timetable-content .academic-day-card').count(), 5);
  assert.equal(
    await page.locator('#timetable-content [data-class-source="rufp"]').count(),
    5,
    'Section D RUFP classes appear automatically from the routine on weekdays',
  );
  assert.equal(
    await page
      .locator('#timetable-content [data-weekday="2026-09-29"] [data-class-source="rufp"]')
      .count(),
    1,
    'the snapshot topic and RUFP class are not duplicated',
  );
  assert.match(
    await page
      .locator('#timetable-content [data-weekday="2026-09-29"] [data-class-source="rufp"]')
      .innerText(),
    /Interpersonal Communication Dynamics/,
  );
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    assert.ok(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      `combined timetable overflows at ${width}px`,
    );
  }
  await page.setViewportSize({ width: 1365, height: 1000 });
  assert.equal(await page.locator('#navigation .sidebar-link').count(), 9);
  assert.equal(await page.locator('#navigation [data-nav-toggle]').count(), 0);
  assert.equal(await page.locator('#navigation .sidebar-link[aria-current="page"]').count(), 1);
  for (const [destination, heading] of [
    ['academic-attendance', 'Course Attendance'],
    ['academic-mail', 'Academic Mail'],
    ['academic-notes', 'Study notes'],
    ['academic-timetable', 'Academic Timetable'],
  ]) {
    await page.locator(`#navigation [data-jump="${destination}"]`).click();
    await page.getByRole('heading', { name: heading }).first().waitFor();
    assert.equal(
      await page.locator(`#navigation [data-jump="${destination}"][aria-current="page"]`).count(),
      1,
    );
    assert.equal(await page.locator('#navigation .sidebar-link:visible').count(), 9);
  }
  assert.equal(await page.locator('#timetable-content').count(), 1);
  await page.goto(`${BASE_URL}/#academic-attendance`);
  await assertSharedUpdateControl();
  await page.waitForSelector('#attendance-content');
  assert.equal(await page.locator('.academic-course').count(), data.subjects.length);
  assert.equal(await page.locator('.academic-jumps').count(), 0);
  await page.setViewportSize({ width: 1333, height: 978 });
  assert.ok(
    await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight),
    'attendance overview fits within a full desktop viewport',
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await page.waitForSelector('#attendance-content');
  assert.equal(await page.evaluate(() => scrollY), 0, 'mobile route opens at the page title');
  await page.setViewportSize({ width: 1365, height: 1000 });
  await page.goto(`${BASE_URL}/#academic-mail`);
  await assertSharedUpdateControl();
  await page.waitForSelector('#mail-content');
  assert.ok(
    (await page.locator('.academic-mail').count()) <= 12,
    'live academic mail remains bounded',
  );
  assert.equal(await page.locator('.glass-surface__filter').count(), 0);
  assert.equal(
    await page.locator('.academic-toolbar').evaluate((el) => getComputedStyle(el).backdropFilter),
    'none',
    'academic panels no longer redraw the page through a blur filter',
  );
  await page.goto(`${BASE_URL}/#academic-notes`);
  await assertSharedUpdateControl();
  await page.getByRole('heading', { name: 'Notes & assignments' }).waitFor();
  for (const width of [768, 390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    assert.ok(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      `academic page overflows at ${width}px`,
    );
  }
  await page.setViewportSize({ width: 1365, height: 1000 });
  await page.goto(`${BASE_URL}/#today`, { waitUntil: 'networkidle' });
  await assertSharedUpdateControl();
  const bag = page.locator('#packing-row .task-main');
  await bag.click();
  assert.equal(
    await page.locator('#packing-row .task-inline-detail').count(),
    1,
    'bag checklist opens inside the routine row',
  );
  assert.equal(
    await page.locator('#detailDialog').evaluate((el) => el.open),
    false,
    'packing does not open a popup',
  );
  assert.equal(await page.locator('#packing-row [data-pack]').count(), 12);
  await page.locator('#packing-row [data-pack="0"]').check();
  assert.equal(
    await page.locator('#packing-row [data-pack-count]').innerText(),
    '1 / 12',
    'inline checklist progress updates immediately',
  );
  assert.ok(
    JSON.parse(await page.evaluate(() => localStorage.getItem('rhythm-records-v1'))).days[
      await page.locator('#selectedDate').inputValue()
    ].checks.includes(0),
    'bag state is saved locally',
  );
  for (const width of [768, 390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    assert.ok(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      `routine overflows at ${width}px`,
    );
  }
  assert.deepEqual(errors, []);
  await browser.close();
  console.log(
    'PASS: nine always-visible navigation links, dedicated academic pages, inline bag checklist, local state, static surfaces, route aliases and responsive layout.',
  );
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
