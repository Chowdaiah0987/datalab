/* Browser end-to-end checks against tests/mock-server.js (front end only; NOT a database test).
   Usage: node tests/mock-server.js 3100 &  node tests/e2e.js   (needs playwright; set PW_PATH if needed) */
const { chromium } = require(process.env.PW_PATH || 'playwright');
const BASE = process.env.BASE || 'http://localhost:3100';
const E1 = 'aaaaaaaaaaaaaaaaaaaaaaa1', E2 = 'aaaaaaaaaaaaaaaaaaaaaaa2';
const results = []; const ok = (n, c, d = '') => { results.push([n, !!c, d]); console.log((c ? 'PASS ' : 'FAIL ') + n + (d ? '  ' + d : '')); };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1366, height: 900 } });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  const errs = []; const track = pg => { pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); }); return pg; };

  /* listing */
  let pg = track(await ctx.newPage()); await pg.goto(BASE + '/index.html'); await pg.waitForSelector('.exp-card');
  ok('listing shows 4 cards', await pg.locator('.exp-card').count() === 4);
  ok('count label', /4 Experiments/.test(await pg.locator('#experimentCount').innerText()));
  await pg.fill('#searchInput', 'pandas'); 
  ok('search filters + count updates', await pg.locator('.exp-card').count() === 1 && /1 of 4/.test(await pg.locator('#experimentCount').innerText()));
  await pg.fill('#searchInput', 'zzzz'); ok('empty search message', await pg.locator('.exp-nomatch').count() === 1);
  await pg.fill('#searchInput', 'pandas');
  await pg.locator('.sub-btn', { hasText: 'Exp A' }).click();
  ok('Exp A opens preview modal', await pg.locator('#previewModal:not([hidden])').count() === 1 && /Series/.test(await pg.locator('#previewTitle').innerText()));
  ok('modal focus moved inside', await pg.evaluate(() => !!document.activeElement.closest('#previewModal')));
  await pg.keyboard.press('Escape'); ok('Escape closes modal', await pg.locator('#previewModal[hidden]').count() === 1);
  await pg.locator('.sub-btn', { hasText: 'Exp B' }).click(); ok('Exp B opens its own data', /DataFrames/.test(await pg.locator('#previewTitle').innerText())); await pg.keyboard.press('Escape');
  await pg.reload(); await pg.waitForSelector('.exp-card');
  ok('search text kept after reload', await pg.inputValue('#searchInput') === 'pandas');
  await pg.fill('#searchInput', '');
  ok('card without cover shows fallback', await pg.locator('.exp-card__cover--empty').count() >= 1);

  /* details navigation by stable id */
  pg = track(await ctx.newPage()); await pg.goto(`${BASE}/experiment.html?id=${E1}`); await pg.waitForSelector('.xp-topic-row');
  ok('details: topic rows', await pg.locator('.xp-topic-row').count() === 2);
  ok('details: admin buttons visible for admin', await pg.locator('[data-admin-only]:not([hidden])').count() >= 1);
  await pg.locator('.xp-topic-row', { hasText: 'Control Flow' }).click(); await pg.waitForSelector('[data-section=sub-topics]');
  ok('topic with children shows sub-topics + 6 sections', await pg.locator('[data-section]').count() === 7);
  await pg.locator('.xp-topic-row', { hasText: 'Loops' }).click(); await pg.waitForSelector('h1');
  ok('nested level opens', (await pg.locator('h1').innerText()) === 'Loops');
  await pg.locator('.xp-topic-row', { hasText: 'for loops' }).click(); await pg.waitForFunction(() => document.querySelector('h1')?.textContent === 'for loops');
  const crumbs = await pg.locator('.xp-crumbs li').allInnerTexts();
  ok('breadcrumb follows hierarchy', crumbs.join('>').includes('Experiment 1>1.2>1.2.2>1.2.2.1'), crumbs.join(' > '));
  await pg.getByRole('link', { name: /Back to Loops/ }).click(); await pg.waitForFunction(() => document.querySelector('h1')?.textContent === 'Loops');
  ok('Back goes to real parent', true);
  ok('Next disabled on last sibling (same-level navigation)', (await pg.getByRole('link', { name: 'Next' }).getAttribute('aria-disabled')) === 'true');
  await pg.getByRole('link', { name: 'Previous' }).click(); await pg.waitForFunction(() => document.querySelector('h1')?.textContent === 'if / else'); ok('Previous goes to previous sibling', true);
  await pg.getByRole('link', { name: 'Next' }).click(); await pg.waitForFunction(() => document.querySelector('h1')?.textContent === 'Loops'); ok('Next returns to next sibling', true);
  ok('Next disabled at end', await (async () => { await pg.goto(`${BASE}/topic-lesson.html?id=${E1}&topic=tp-1221`); await pg.waitForSelector('h1'); return (await pg.getByRole('link', { name: 'Next' }).getAttribute('aria-disabled')) === 'true'; })());
  await pg.goto(`${BASE}/experiment.html?id=${E2}&sub=B`); await pg.waitForSelector('.xp-card');
  ok('sub without topics shows direct lesson card', await pg.getByRole('link', { name: /Open lesson workspace/ }).count() === 1);
  await pg.getByRole('link', { name: /Open lesson workspace/ }).click(); await pg.waitForSelector('[data-section=aim]');
  ok('direct lesson opens (not blank)', await pg.locator('[data-section]').count() === 6);

  /* editor plumbing: Reset / Clear / unreachable runtime message */
  await pg.goto(`${BASE}/topic-lesson.html?id=${E1}&topic=tp-11`); await pg.waitForSelector('.xp-code__input');
  const orig = await pg.inputValue('.xp-code__input');
  await pg.fill('.xp-code__input', 'x = 1'); await pg.locator('[data-action=reset]').click();
  ok('Reset restores saved code', (await pg.inputValue('.xp-code__input')) === orig);
  ok('syntax highlighting applied', await pg.locator('.xp-code__hl .tk-k, .xp-code__hl .tk-b').count() > 0);
  await pg.locator('[data-action=run]').click(); await pg.waitForFunction(() => /Success|Error/.test(document.querySelector('.xp-runner__status').textContent), null, { timeout: 25000 });
  const out = await pg.locator('.xp-output').innerText();
  ok('unreachable runtime reports honest message', /could not be downloaded|failed to start/.test(out), out.slice(0, 90));
  ok('run button re-enabled after failure', await pg.locator('[data-action=run]').isEnabled());
  await pg.locator('[data-action=clear]').click(); ok('Clear Output empties panel', (await pg.locator('.xp-output').innerText()).trim() === '');

  /* form: create with 2 sub-experiments, nested topics, tools; reload */
  pg = track(await ctx.newPage()); await pg.goto(BASE + '/experiment-form.html'); await pg.waitForSelector('#toolsGrid input');
  await pg.fill('#number', '9'); await pg.fill('#title', 'E2E Experiment'); await pg.fill('#shortDescription', 'Short'); await pg.fill('#longDescription', 'Long text');
  await pg.locator('#toolsGrid label', { hasText: 'NumPy' }).click();
  await pg.click('#addSubExperiment'); await pg.click('#addSubExperiment');
  const cards = pg.locator('.ef-sub-card'); ok('two sub cards', await cards.count() === 2);
  await cards.nth(0).locator('[data-s=title]').fill('Alpha'); await cards.nth(0).locator('[data-s=shortDescription]').fill('A short');
  await cards.nth(1).locator('[data-s=title]').fill('Beta'); await cards.nth(1).locator('[data-s=shortDescription]').fill('B short');
  ok('no Open-as selector in form', (await pg.locator('[data-s=openAs], [data-t=openAs]').count()) === 0);
  await cards.nth(0).locator('[data-add-subtopic]').click();
  await cards.nth(0).evaluate(c => c.querySelectorAll('details').forEach(d => { d.open = true; }));
  await cards.nth(0).locator('[data-t=heading]').first().fill('Alpha topic'); await cards.nth(0).locator('[data-t=code]').first().fill('print(42)');
  await cards.nth(1).locator('[data-s=title]').fill('Beta edited'); 
  ok('child state independent', (await cards.nth(0).locator('[data-s=title]').inputValue()) === 'Alpha');
  await pg.click('#saveExperiment'); await pg.waitForURL(/index\.html|experiment\.html/, { timeout: 8000 }).catch(() => {});
  const saved = await (await ctx.request.get(BASE + '/api/experiments')).json(); const e9 = saved.find(x => x.number === '9');
  ok('experiment saved', !!e9, e9 ? '' : (await pg.locator('#formMessage').innerText()));
  if (e9) {
    ok('two subs persisted with own data', e9.subExperiments.length === 2 && e9.subExperiments[0].title === 'Alpha' && e9.subExperiments[1].title === 'Beta edited');
    ok('tool saved', e9.tools.some(t => t.name === 'NumPy'));
    ok('nested topic persisted', JSON.stringify(e9.subExperiments[0].topics).includes('print(42)'));
    ok('saved without cover (optional)', e9.cover === '');
    pg = track(await ctx.newPage()); await pg.goto(`${BASE}/experiment-form.html?id=${e9.id}`); await pg.waitForSelector('.ef-sub-card');
    ok('edit form reloads both children', await pg.locator('.ef-sub-card').count() === 2 && (await pg.locator('#title').inputValue()) === 'E2E Experiment');
    await pg.goto(`${BASE}/experiment.html?id=${e9.id}`); await pg.waitForSelector('.xp-topic-card');
    ok('details lists both sub-experiments as topic cards', await pg.locator('.xp-topic-card').count() === 2);
    /* delete */
    await pg.goto(BASE + '/index.html'); await pg.waitForSelector('.exp-card'); const n = await pg.locator('.exp-card').count();
    pg.once('dialog', d => d.accept());
    await pg.locator(`#experiment-${e9.id} .card-menu__toggle, #experiment-${e9.id} [aria-haspopup]`).first().click().catch(() => {});
    const del = pg.locator(`#experiment-${e9.id}`).getByText(/delete/i).first();
    if (await del.count()) { await del.click(); await pg.waitForTimeout(800); const after = (await (await ctx.request.get(BASE + '/api/experiments')).json()).length; ok('delete removes record', after === n - 1); }
    else ok('delete menu reachable', false);
  }

  /* guest permissions */
  const gctx = await b.newContext({ viewport: { width: 1366, height: 900 } });
  await gctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  const gpage = await gctx.newPage();
  await gpage.goto(`${BASE.replace(/:\d+$/, ':3101')}/experiment.html?id=${E1}`).then(async () => {
    await gpage.waitForSelector('.xp-topic-row');
    ok('guest: Edit / Add Material hidden', await gpage.locator('[data-admin-only]:visible').count() === 0);
    const r = await gctx.request.put(`${BASE.replace(/:\d+$/, ':3101')}/api/experiments/${E1}`, { data: {} });
    ok('guest write rejected by API (403)', r.status() === 403);
  }).catch(e => ok('guest checks (needs mock on 3101 with --guest)', false, e.message.slice(0, 80)));
  ok('no console/page errors', errs.length === 0, errs.slice(0, 3).join(' | ').slice(0, 200));
  await b.close();
  const failed = results.filter(r => !r[1]); console.log(`\n${results.length - failed.length}/${results.length} passed`); process.exit(failed.length ? 1 : 0);
})();
