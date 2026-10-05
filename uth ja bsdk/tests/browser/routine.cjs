const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_EXECUTABLE,
    headless: true,
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1060 },
    timezoneId: 'Asia/Kolkata',
  });
  await context.route('**/api/tracker-backup', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
  );
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.clock.install({ time: new Date('2026-09-25T09:00:00+05:30') });
  await page.goto(BASE_URL);
  await page.waitForSelector('.routine-flow');
  const navLabels = await page
    .locator('#navigation .nav-item span:not(.nav-end)')
    .allTextContents();
  assert.equal(navLabels.at(-1), 'Reports', 'Reports is last in the sidebar');
  assert(!navLabels.includes('Settings'), 'Settings is removed from navigation');
  await page.screenshot({ path: '/tmp/rhythm-desktop.png', fullPage: true });
  const timeline = page.locator('.routine-timeline');
  assert.equal(await timeline.getAttribute('role'), 'region', 'daily steps are a labeled region');
  const timelineMetrics = await timeline.evaluate((el) => ({
    height: el.clientHeight,
    scrollHeight: el.scrollHeight,
    overflowY: getComputedStyle(el).overflowY,
    rowCount: el.querySelectorAll('.task-row').length,
  }));
  assert.equal(timelineMetrics.overflowY, 'visible', 'routine has no nested scroll window');
  assert(
    timelineMetrics.scrollHeight <= timelineMetrics.height + 1,
    'all routine steps expand naturally',
  );
  assert(timelineMetrics.rowCount >= 10, 'all routine steps render together');
  assert((await page.locator('.class-room').count()) > 0, 'classes show a room badge');
  assert.match(await page.locator('.class-room').first().innerText(), /^Room /);
  assert.match(await page.locator('.class-reminder').first().innerText(), /Reminder|Happening now/);
  const current = page.locator('.task-row.current');
  assert.match(
    await current.evaluate((el) => getComputedStyle(el).backgroundImage),
    /linear-gradient/,
    'current step uses a restrained green gradient',
  );
  assert.equal(
    await current.locator('.task-main strong').evaluate((el) => getComputedStyle(el).color),
    'rgb(237, 244, 231)',
    'current step text remains readable',
  );
  await current.locator('.task-main').hover();
  assert.equal(
    await current.locator('.task-main').evaluate((el) => getComputedStyle(el, '::after').content),
    'none',
    'routine buttons do not draw a pointer-following glow over the row',
  );
  assert.equal(
    await current.locator('.task-main').evaluate((el) => getComputedStyle(el).filter),
    'none',
    'routine hover does not brighten a rectangular inner button',
  );
  const tileColors = await page
    .locator('.routine-flow .task-glyph')
    .evaluateAll((elements) => [...new Set(elements.map((el) => getComputedStyle(el).color))]);
  assert.deepEqual(tileColors, ['rgb(212, 234, 190)'], 'routine icon tiles use one theme color');
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(50);
  assert(
    await page
      .locator('.task-row')
      .last()
      .evaluate((el) => el.getBoundingClientRect().bottom <= innerHeight + 1),
    'last routine step is reachable by normal page scrolling',
  );
  const rail = page.locator('.routine-rail');
  assert.equal(
    await rail.evaluate((el) => getComputedStyle(el).position),
    'absolute',
    'timeline rail covers the full routine',
  );
  assert(
    (await rail.evaluate((el) => el.getBoundingClientRect().height)) >=
      (await timeline.evaluate((el) => el.clientHeight)) - 20,
    'timeline rail remains continuous across every step',
  );
  await page.getByRole('button', { name: 'Open Wake up. Start fresh.' }).click();
  assert.equal(await page.locator('#task-wake .task-inline-detail').count(), 1);
  assert.equal(
    await page.locator('#detailDialog').isVisible(),
    false,
    'ordinary task opens inline',
  );
  await page.getByRole('button', { name: 'Edit timing & instructions' }).click();
  assert.equal(
    await page.locator('#task-wake #taskForm').count(),
    1,
    'routine editor stays inline',
  );
  await page.getByRole('button', { name: 'Close routine editor' }).click();
  await page.locator('#task-wake .task-time').click();
  assert.equal(await page.locator('#task-wake .task-inline-detail').count(), 1, 'time opens row');
  await page.locator('.task-row').nth(1).locator('.task-time').click();
  assert.equal(await page.locator('#task-wake .task-inline-detail').count(), 0, 'first row closes');
  assert.equal(await page.locator('.task-row').nth(1).locator('.task-inline-detail').count(), 1);
  await page.locator('.task-row').nth(1).locator('.task-time').click();
  assert.equal(await page.locator('.task-row .task-inline-detail').count(), 0, 'row collapses');
  assert.equal(
    await page.locator('.workspace-name').evaluate((el) => getComputedStyle(el).position),
    'static',
    'workspace name is left aligned',
  );
  assert.match(
    await page.locator(':root').evaluate((el) => getComputedStyle(el).getPropertyValue('--bg')),
    /08110e/,
    'workspace uses the dark image-led glass palette',
  );
  assert.equal(await page.locator('#connection').count(), 0);
  assert.equal(await page.locator('.workspace-name').innerText(), 'Akshat Kumar');
  assert.match(
    await page.locator('.profile').innerText(),
    /RUFP · Section 4/,
    'profile has the corrected programme label',
  );
  assert.equal(await page.locator('.segments').count(), 0);
  assert.equal(await page.locator('.focus-bottom').count(), 0);
  await page.locator('.routine-flow').hover();
  assert.notEqual(
    await page.locator('.routine-flow').evaluate((el) => getComputedStyle(el).transform),
    'none',
  );
  await page.goto(`${BASE_URL}/#food`);
  assert.equal(
    await page
      .getByRole('button', { name: '+ 250 ml' })
      .evaluate((el) => getComputedStyle(el).color),
    'rgb(237, 247, 231)',
    'quick water action has readable light text',
  );
  assert.equal(
    await page
      .getByRole('button', { name: 'Log water' })
      .evaluate((el) => getComputedStyle(el).color),
    'rgb(20, 34, 24)',
    'pale water action has readable dark text',
  );
  const liveMenu = await (await fetch(`${BASE_URL}/api/mess-menu`)).json();
  assert.equal(
    liveMenu.sourceUrl,
    'https://ru-print.vercel.app',
    'menu comes from the live RU Print app',
  );
  assert.equal(await page.locator('.notice').count(), 0, 'menu notice is removed');
  assert.equal(
    await page.locator('.mess-menu-source').count(),
    1,
    'RU Print link sits after the campus menu',
  );
  const selectedMenuDay = await page
    .locator('#selectedDate')
    .evaluate((input) => new Date(input.value + 'T12:00:00').getDay());
  const selectedMenuName = [
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
  ][selectedMenuDay];
  await page.waitForFunction(
    ({ items }) =>
      JSON.stringify(
        [...document.querySelectorAll('.wide-grid .panel:first-child .menu-items span')].map(
          (node) => node.textContent,
        ),
      ) === JSON.stringify(items),
    { items: liveMenu.menu[selectedMenuName].breakfast },
  );
  const visibleMenu = await page
    .locator('.wide-grid .panel')
    .first()
    .locator('.menu-items span')
    .allTextContents();
  await page.getByRole('button', { name: 'Use planned menu' }).click();
  assert.equal(
    await page.locator('#foodForm [name="item"]').evaluate((input) => input.value),
    visibleMenu.join(', '),
    'quick meal fill uses the displayed live campus menu',
  );
  await page.getByLabel('Food or drink').fill('Oats and banana');
  await page.getByLabel('Amount or note optional').fill('1 bowl');
  await page.getByRole('button', { name: 'Add to food log' }).click();
  assert((await page.getByText('Oats and banana', { exact: true }).count()) === 1);
  await page.getByRole('button', { name: 'Remove Oats and banana' }).click();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  assert((await page.getByText('Oats and banana', { exact: true }).count()) === 1);
  await page.getByRole('button', { name: '+ 250 ml' }).click();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  assert((await page.locator('.water-amount').innerText()).includes('0.00'));
  await page.clock.setFixedTime(new Date('2026-09-14T08:05:00+05:30'));
  await page.reload();
  await page.goto(`${BASE_URL}/#today`);
  await page.getByRole('button', { name: 'Open Leave for campus' }).click();
  assert.equal(
    await page.locator('#task-leave .task-inline-detail [data-pack]').count(),
    12,
    'Leave for campus shows the complete saved bag checklist',
  );
  assert(
    await page
      .locator('#task-leave .task-inline-detail')
      .innerText()
      .then(
        (text) =>
          text.includes('MacBook Air M5') &&
          text.includes('ID card') &&
          text.includes('Lock the door'),
      ),
    'departure checklist names the key items to carry and check',
  );
  assert.equal(await page.locator('#detailDialog').isVisible(), false, 'leaving opens no popup');
  await page.getByRole('button', { name: 'Close details' }).click();
  await page.getByRole('button', { name: 'Open Pack your bag' }).click();
  assert.equal(
    await page.locator('#packing-row .task-inline-detail [data-pack]').count(),
    12,
    'packing checklist expands inline',
  );
  assert.equal(await page.locator('#detailDialog').isVisible(), false, 'packing opens no popup');
  await page
    .locator('#packing-row .task-inline-detail input[type=checkbox]')
    .evaluateAll((list) => list.forEach((x) => x.click()));
  await page.locator('[data-complete=packing]').click();
  assert(
    await page
      .locator('#toast')
      .innerText()
      .then((t) => t.includes('Saved')),
  );
  assert(await page.locator('[data-complete="systems-lab"]').isDisabled());
  await page.clock.setFixedTime(new Date('2026-09-17T08:51:00+05:30'));
  await page.reload();
  await page.goto(`${BASE_URL}/#academic-timetable`);
  await page.waitForSelector('#timetable-content');
  assert.equal(await page.locator('#navigation .sidebar-link').count(), 9);
  assert.equal(await page.locator('#navigation .sidebar-link svg').count(), 9);
  assert.equal(await page.locator('#navigation [data-nav-toggle]').count(), 0);
  assert.equal(
    await page.locator('#navigation [data-jump="academic-timetable"]').getAttribute('aria-current'),
    'page',
  );
  assert(
    (await page.locator('#timetable-content .academic-schedule-list li').count()) > 0,
    'dedicated timetable page uses the NST timetable',
  );
  await page.goto(`${BASE_URL}/#academic-attendance`);
  await page.waitForSelector('#attendance-content');
  assert(
    (await page.locator('#attendance-content .academic-course').count()) > 0,
    'dedicated attendance page includes course attendance',
  );
  assert(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    'academic sections fit desktop width',
  );
  await page.clock.setFixedTime(new Date('2026-09-21T08:00:00+05:30'));
  await page.reload();
  await page.goto(`${BASE_URL}/#life`);
  await page.getByRole('button', { name: 'Log a drop-off' }).click();
  const laundryCard = page.locator('.laundry-record').first();
  assert.match(await laundryCard.innerText(), /Laundry dropped off · Monday, 21 Sept/);
  assert.match(
    await laundryCard.innerText(),
    /Pickup Thursday, 24 Sept · 5:10 PM–5:20 PM/,
    'laundry pickup is three calendar days later and fits after the last class',
  );
  const wardrobeButton = page.getByRole('button', { name: 'Add clothing' });
  assert.equal(
    await wardrobeButton.evaluate((button) => getComputedStyle(button).color),
    'rgb(32, 69, 42)',
    'wardrobe button text has strong contrast',
  );
  assert.equal(
    await wardrobeButton.evaluate((button) => getComputedStyle(button).backgroundColor),
    'rgb(220, 235, 216)',
  );
  await page.locator('[data-swim-pack="0"]').check();
  await page.goto(`${BASE_URL}/#today`);
  await page.goto(`${BASE_URL}/#life`);
  assert(
    await page.locator('[data-swim-pack="0"]').isChecked(),
    'swim checklist state survives navigation',
  );
  assert.equal(
    await page.locator('[data-swim-pack]').count(),
    5,
    'swim kit has its own five-step checklist',
  );
  await page.goto(`${BASE_URL}/#notes`);
  await page.locator('[name=text]').fill('Finish arrays homework <script>alert(1)</script>');
  await page.getByRole('button', { name: 'Save note' }).click();
  assert(
    (await page
      .getByText('Finish arrays homework <script>alert(1)</script>', { exact: true })
      .count()) === 1,
  );
  await page.clock.setFixedTime(new Date('2026-09-25T09:00:00+05:30'));
  await page.goto(`${BASE_URL}/#reports`);
  const [backupDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export all data' }).click(),
  ]);
  assert.match(
    backupDownload.suggestedFilename(),
    /rhythm-backup-2026-09-25\.json/,
    'full data export is available from Reports',
  );
  await page.clock.setFixedTime(new Date('2026-09-25T09:00:00+05:30'));
  await page.reload();
  await page.goto(`${BASE_URL}/#notes`);
  assert.equal(
    await page.locator('.note-card').count(),
    1,
    'locally saved notes remain available after navigation',
  );
  await page.goto(`${BASE_URL}/#food`);
  await page.getByRole('button', { name: '+ 250 ml' }).click();
  await page.reload();
  assert((await page.locator('.water-amount').innerText()).includes('0.25'));
  await page.evaluate(() => navigator.serviceWorker.ready);
  await context.setOffline(true);
  await page.reload();
  await page.waitForSelector('.food-tracking');
  await page.getByRole('button', { name: '+ 250 ml' }).click();
  assert((await page.locator('.water-amount').innerText()).includes('0.50'));
  await context.setOffline(false);
  for (const width of [390, 320, 768]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(`${BASE_URL}/#today`);
    if (width === 390) {
      await page.getByRole('button', { name: 'Open Wake up. Start fresh.' }).click();
      assert.equal(await page.locator('#task-wake .task-inline-detail').count(), 1);
      assert.equal(await page.locator('#detailDialog').isVisible(), false);
    }
    assert(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      `overflow ${width}`,
    );
    if (width === 390) await page.screenshot({ path: '/tmp/rhythm-mobile.png', fullPage: true });
  }
  assert.deepEqual(errors, []);
  console.log(
    'PASS: desktop/mobile layout, routine layout, food logging and undo, water undo, packing, future lock, attendance undo, safe notes, reminder acknowledgement, semester status, Reports backup export, reload persistence, offline actions.',
  );
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
