const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_EXECUTABLE,
    headless: true,
  });
  const context = await browser.newContext({
    viewport: { width: 1365, height: 1000 },
    timezoneId: 'Asia/Kolkata',
  });
  const page = await context.newPage(),
    errors = [],
    badResponses = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('response', (r) => {
    if (r.url().includes('/api/radar/') && r.status() >= 400)
      badResponses.push(`${r.status()} ${r.url()}`);
  });
  await page.goto(`${BASE_URL}/#radar`);
  const foreignRead = await page.request.get(
    `${BASE_URL.replace('localhost', '127.0.0.1')}/api/sync/status`,
    {
      headers: { Origin: 'https://example.com' },
    },
  );
  assert.equal(
    foreignRead.headers()['access-control-allow-origin'],
    undefined,
    'private sync results are not readable from another website',
  );
  const foreignSync = await page.request.post(
    `${BASE_URL.replace('localhost', '127.0.0.1')}/api/sync`,
    {
      headers: { Origin: 'https://example.com' },
    },
  );
  assert.equal(foreignSync.status(), 403, 'another website cannot trigger local email or AI sync');
  await page.getByRole('heading', { name: 'Build something worth showing.' }).waitFor();
  await page.locator('.radar-results, .unverified-panel').first().waitFor();
  await page.locator('.source-chip').first().waitFor();
  assert.equal(await page.locator('#navigation .sidebar-link:visible').count(), 9);
  assert.equal(await page.locator('#navigation [data-nav-toggle]').count(), 0);
  assert.equal(
    await page.locator('#navigation [data-jump="radar"][aria-current="page"]').count(),
    1,
  );
  assert.equal(
    await page.locator('[data-radar-scope]').count(),
    0,
    'redundant region filters are gone; feed defaults nearby',
  );
  assert.equal(
    await page.getByRole('button', { name: '☆ Saved' }).count(),
    1,
    'saved filter is a visible pill beside centered controls',
  );
  assert.equal(
    await page.locator('.radar-page .page-heading').evaluate((el) => {
      const a = el.getBoundingClientRect(),
        m = document.querySelector('main').getBoundingClientRect();
      return Math.abs(a.left + a.width / 2 - m.left - m.width / 2) < 2;
    }),
    true,
    'Radar heading is centered in the workspace',
  );
  assert.equal(
    await page.locator('.source-chip').count(),
    2,
    'only the two active sources are shown',
  );
  assert.match(
    await page.locator(':root').evaluate((el) => getComputedStyle(el).colorScheme),
    /dark/,
    'workspace theme uses dark image-led glass surfaces',
  );
  assert.match(
    await page.locator('.radar-control').evaluate((el) => getComputedStyle(el).backgroundImage),
    /linear-gradient/,
    'Radar sources card uses the forest-glass gradient',
  );
  assert.equal(
    await page
      .locator('.radar-control .source-chip')
      .first()
      .evaluate((el) => getComputedStyle(el).color),
    'rgb(220, 235, 220)',
    'source links retain readable pale-green text',
  );
  assert.equal(
    await page
      .locator('.radar-control .profile-match i')
      .first()
      .evaluate((el) => getComputedStyle(el).backgroundColor),
    'rgba(140, 181, 126, 0.13)',
    'skill chips use the tinted dark-glass palette',
  );
  assert.equal(
    await page.locator('#globalUpdateButton').count(),
    1,
    'one global update button is available',
  );
  assert.equal(
    await page.locator('[data-action="sync-all"]').count(),
    0,
    'page-level full-sync controls are removed',
  );
  assert.equal(
    await page.locator('.agent-table').count(),
    0,
    'individual hackathon research rows stay out of this panel',
  );
  assert(
    !(await page.locator('.profile-match').innerText()).match(/cybersecurity|security/i),
    'security is removed from the skills profile',
  );
  assert.equal(
    await page.locator('.page-edge-blur i').count(),
    0,
    'unused stacked viewport blur layers are removed',
  );
  assert.equal(
    await page.locator('.radar-card .radar-official-button').count(),
    await page.locator('.radar-card').count(),
    'each event has a direct official source action',
  );
  assert.equal(await page.getByText('Optional connectors and their listed costs').count(), 0);
  assert((await page.locator('.source-last-fetch').innerText()).includes('Last event fetch'));
  assert((await page.locator('.profile-match').innerText()).includes('HTML'));
  assert((await page.locator('.profile-match').innerText()).includes('Python · learning'));
  assert.equal(
    await page
      .locator('.profile-match i')
      .filter({ hasText: /security/i })
      .count(),
    0,
    'cybersecurity is not shown as a skill',
  );
  assert(
    (await page.locator('#dailyQuote').innerText()).length > 10,
    'quote is visible in sidebar, fetched or offline fallback',
  );
  assert.equal(await page.locator('[data-radar-difficulty]').count(), 4);
  assert.equal(await page.locator('[data-radar-tier]').count(), 6);
  const difficulty = page.locator('[data-radar-difficulty="easy"]');
  await difficulty.focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(
    await page.locator('[data-radar-difficulty="medium"]').getAttribute('aria-selected'),
    'true',
    'difficulty tabs support arrow navigation',
  );
  assert.equal(
    await page.locator('.radar-card details').count(),
    0,
    'redundant Details disclosure removed',
  );
  assert.equal(
    await page.locator('.radar-card .radar-card-top .eyebrow').count(),
    0,
    'source, location and tier labels are omitted from cards',
  );
  assert.equal(
    await page.locator('.radar-card .eyebrow').count(),
    0,
    'source, location and tier labels are omitted from cards',
  );
  const response = await page.evaluate(async () =>
    fetch('/api/radar/opportunities?scope=nearby').then((r) => r.json()),
  );
  assert(
    response.opportunities.every((o) => ['local', 'remote'].includes(o.areaScope)),
    'default API only returns nearby venues and online events',
  );
  assert(
    response.opportunities.every(
      (o) => o.analysis && ['easy', 'medium', 'hard', 'unverified'].includes(o.analysis.bucket),
    ),
    'every listing gets exactly one triage bucket',
  );
  assert.equal(
    new Set(response.opportunities.map((o) => o.id)).size,
    response.opportunities.length,
    'no event appears in more than one place',
  );
  for (const bucket of ['easy', 'medium', 'hard'])
    for (const tier of ['S', 'A', 'B', 'C', 'D', 'E'])
      assert(
        response.opportunities.filter(
          (o) => o.analysis.bucket === bucket && o.analysis.tierKey === tier,
        ).length <= 10,
        `${bucket}/${tier} capped at ten`,
      );
  const codeCraft = await page.evaluate(async () => {
    const x = await fetch('/api/radar/opportunities?scope=all').then((r) => r.json());
    return x.opportunities.find((o) => /code and craft/i.test(o.title));
  });
  if (codeCraft) {
    assert(codeCraft.end_date, 'Code and Craft end date retained');
    assert(codeCraft.registration_deadline, 'registration deadline retained separately');
    assert.equal(codeCraft.areaScope, 'outside', 'Chennai is not misclassified from its organizer');
  }
  const sample = response.opportunities.find((o) => o.analysis.bucket !== 'unverified');
  if (sample) {
    await page.locator(`[data-radar-difficulty="${sample.analysis.bucket}"]`).click();
    await page.locator(`[data-radar-tier="${sample.analysis.tierKey}"]`).click();
    assert.equal(
      await page
        .locator('.radar-card .radar-facts span')
        .first()
        .evaluate((el) => getComputedStyle(el).color),
      'rgb(214, 229, 217)',
      'event fact pills use readable pale text on dark glass',
    );
    assert.equal(
      await page
        .locator('.radar-card .radar-official-button')
        .first()
        .evaluate((el) => getComputedStyle(el).color),
      'rgb(222, 235, 220)',
      'official event links retain readable contrast',
    );
    const star = page.locator(`[data-radar-save="${sample.id}"]`);
    await star.click();
    assert.equal(await star.getAttribute('aria-pressed'), 'true');
    await page.getByRole('button', { name: '☆ Saved' }).click();
    assert.equal(
      await page.locator('.radar-card').count(),
      1,
      'saved filter shows the selected event',
    );
    await page.getByRole('button', { name: '★ Saved only' }).click();
    const card = page.locator(`[data-radar-summary="${sample.id}"]`);
    await card.click();
    assert(await page.locator('#radarDialog').isVisible());
    assert.equal(
      await page.locator('.summary-grid').count(),
      0,
      'long summary card grid is removed from the modal',
    );
    assert.equal(
      await page.locator('.event-brief-table').count(),
      1,
      'event description is presented as a concise table',
    );
    assert(
      (await page.locator('.event-brief-table tbody tr').count()) <= 3,
      'event brief stays short',
    );
    const summaryText = await page.locator('#radarDialog').innerText(),
      summaryLabels = await page.locator('.summary-grid small').allTextContents();
    for (const repeated of ['Location', 'Registration', 'Team size', 'Prize pool'])
      assert(!summaryLabels.includes(repeated), `summary omits card fact: ${repeated}`);
    assert(!summaryText.includes('{\"'), 'eligibility is not shown as raw JSON');
    assert.equal(
      await page.locator('.event-brief-table').count(),
      1,
      'event description uses the readable brief table',
    );
    assert(
      !summaryText.includes('&ldquo;') && !summaryText.includes('&rdquo;'),
      'description quotes are decoded',
    );
    await page.locator('#radarProgress').selectOption({ label: 'Registered' });
    assert.equal(await page.locator('#radarProgress').inputValue(), 'Registered');
    await page.getByRole('button', { name: 'Close event summary' }).click();
    await card.click();
    assert(await page.locator('#radarDialog').isVisible());
    await page.mouse.click(5, 5);
    assert(
      !(await page.locator('#radarDialog').isVisible()),
      'backdrop click closes event summary',
    );
  }
  await page.locator('[data-radar-difficulty="unverified"]').click();
  assert.equal(
    await page.locator('.radar-card').count(),
    0,
    'unverified listings stay in their compact manual-check group',
  );
  assert.deepEqual(errors, [], 'no browser JavaScript errors');
  assert.deepEqual(badResponses, [], 'radar APIs succeed');
  await page.setViewportSize({ width: 390, height: 844 });
  assert(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    'mobile radar has no horizontal overflow',
  );
  await page.setViewportSize({ width: 1365, height: 1000 });
  console.log('PASS: nearby-first feed, event summary, accessible cards, and mobile layout.');
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
