/* Admin buttons + header navigation (front end only). Usage: node tests/mock-server.js 3200 --auth &  node tests/admin-buttons-check.js */
const { chromium } = require(process.env.PW_PATH || 'playwright');
const BASE = process.env.BASE || 'http://localhost:3200';
const AU = (process.env.ADMIN_USERNAME || 'admin').trim(), AP = (process.env.ADMIN_PASSWORD || 'admin123').trim();
let fails = 0; const ok = (n, c, d = '') => { if (!c) fails++; console.log((c ? 'PASS ' : 'FAIL ') + n + (d ? '  ' + d : '')); };
(async () => {
  const b = await chromium.launch(); const errs = [];
  const mk = async () => { const c = await b.newContext({ viewport: { width: 1366, height: 800 } }); await c.route(/fonts\./, r => r.abort()); return c; };
  let ctx = await mk(); let pg = await ctx.newPage(); pg.on('pageerror', e => errs.push(e.message));
  /* header nav links (guest) */
  for (const [label, re] of [['Modules', /modules\.html/], ['Experiments', /index\.html/], ['Tools', /tools\.html/], ['Resources', /resources\.html/], ['Home', /home\.html/]]) {
    await pg.goto(`${BASE}/home.html`); await pg.locator('.dsl-nav a', { hasText: label }).click(); await pg.waitForURL(re);
    ok(`nav: ${label}`, true);
  }
  await pg.goto(`${BASE}/home.html`); await pg.locator('.dsl-brand__link').click(); ok('brand logo goes Home', /home\.html/.test(pg.url()));
  /* guest cannot see admin controls on Experiments */
  await pg.goto(`${BASE}/index.html`); await pg.waitForSelector('.exp-card');
  ok('guest: "+ Add Experiment" hidden', !(await pg.locator('#openAddBtn').isVisible()));
  ok('guest: card ⋮ menu hidden', !(await pg.locator('.exp-card .menu').first().isVisible()));
  ok('guest: logo-edit pencil hidden', !(await pg.locator('.dsl-logo-edit').isVisible()));
  await ctx.close();
  /* admin */
  ctx = await mk(); pg = await ctx.newPage(); pg.on('pageerror', e => errs.push(e.message));
  await pg.goto(`${BASE}/login.html`); await pg.locator('#roleAdminCard').click(); await pg.fill('#identifier', AU); await pg.fill('#password', AP); await pg.click('#loginBtn'); await pg.waitForURL(/home\.html/);
  await pg.goto(`${BASE}/index.html`); await pg.waitForSelector('.exp-card'); await pg.waitForSelector('html[data-role=admin]');
  ok('admin: "+ Add Experiment" visible', await pg.locator('#openAddBtn').isVisible());
  await pg.locator('#openAddBtn').click(); await pg.waitForTimeout(600);
  ok('admin: "+ Add Experiment" opens the form', /experiment-form\.html/.test(pg.url()) || await pg.locator('#experimentModal:not([hidden])').count() === 1, pg.url());
  await pg.goto(`${BASE}/index.html`); await pg.waitForSelector('.exp-card');
  const menuBtn = pg.locator('.exp-card .menu button, .exp-card .menu summary, .exp-card [aria-haspopup]').first();
  ok('admin: card ⋮ menu visible', await pg.locator('.exp-card .menu').first().isVisible());
  await menuBtn.click(); await pg.waitForTimeout(250);
  const items = await pg.locator('.exp-card .menu .menu__item:visible').allInnerTexts();
  ok('admin: card menu lists Edit/Cover/Description/Add Sub/Delete', items.length === 5, items.join(' | '));
  await pg.keyboard.press('Escape');
  await pg.locator('.exp-card .menu .menu__item[data-action=edit]').first().click({ trial: true }).catch(() => {});
  /* header logo edit + Edit ID card */
  ok('admin: logo ✎ visible', await pg.locator('.dsl-logo-edit').isVisible());
  await pg.goto(`${BASE}/home.html`); await pg.waitForSelector('.dsl-home-role');
  ok('admin home: Edit ID Card control available', await pg.locator('#homeEditIdBtn').count() >= 1);
  await pg.locator('.dsl-home-role').click(); await pg.locator('.dsl-menu button', { hasText: 'Edit ID Card' }).click(); await pg.waitForTimeout(500);
  await pg.waitForURL(/index\.html\?editProfile/); await pg.waitForTimeout(800);
  ok('admin home: menu → Edit ID Card opens the ID card editor', await pg.locator('#profileModal').isVisible(), pg.url());
  await b.close();
  const real = errs.filter(e => !/Failed to load/.test(e)); ok('no page errors', real.length === 0, real.join(' | '));
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED'); process.exit(fails ? 1 : 0);
})();
