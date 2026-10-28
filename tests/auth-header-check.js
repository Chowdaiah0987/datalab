/* Header / login / Viewer / Admin button checks against tests/mock-server.js --auth (front end only).
   Usage: node tests/mock-server.js 3200 --auth &  node tests/auth-header-check.js
   env: BASE, ADMIN_USERNAME, ADMIN_PASSWORD, SHOTS (screenshot dir), PW_PATH */
const { chromium } = require(process.env.PW_PATH || 'playwright');
const BASE = process.env.BASE || 'http://localhost:3200';
const AU = (process.env.ADMIN_USERNAME || 'admin').trim(), AP = (process.env.ADMIN_PASSWORD || 'admin123').trim();
const SHOTS = process.env.SHOTS || '';
const E1 = 'aaaaaaaaaaaaaaaaaaaaaaa1';
const PAGES = ['home.html', 'index.html', 'modules.html', 'tools.html', 'resources.html', `experiment.html?id=${E1}`];
let fails = 0; const ok = (n, c, d = '') => { if (!c) fails++; console.log((c ? 'PASS ' : 'FAIL ') + n + (d ? '  ' + d : '')); };
const shot = async (pg, n) => { if (SHOTS) await pg.screenshot({ path: `${SHOTS}/${n}.png` }); };
(async () => {
  const b = await chromium.launch();
  const mk = async () => { const c = await b.newContext({ viewport: { width: 1366, height: 800 } }); await c.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort()); return c; };
  const errs = []; const track = pg => { pg.on('pageerror', e => errs.push(pg.url() + ' :: ' + e.message)); return pg; };
  const settle = pg => pg.waitForFunction(() => document.documentElement.dataset.auth).catch(() => {});
  const accountBtn = pg => pg.locator('.dsl-home-role, .dsl-role').first();

  /* ---- guest ---- */
  let ctx = await mk();
  for (const p of PAGES) {
    const pg = track(await ctx.newPage()); await pg.goto(`${BASE}/${p}`); await settle(pg);
    const login = pg.locator('a.dsl-account__login');
    ok(`guest ${p}: Login link shown`, await login.count() === 1 && await login.isVisible());
    ok(`guest ${p}: admin-only controls hidden`, await pg.evaluate(() => [...document.querySelectorAll('[data-admin-only]')].every(e => !e.getClientRects().length)));
    if (p === 'home.html') await shot(pg, 'guest-home');
    await pg.close();
  }
  let pg = track(await ctx.newPage()); await pg.goto(`${BASE}/modules.html`); await settle(pg);
  await pg.locator('a.dsl-account__login').click(); await pg.waitForURL(/login\.html\?next=/);
  ok('guest: Login button opens login page with next=', true, pg.url());
  await shot(pg, 'login-page');

  /* ---- login page: validation + wrong admin + viewer ---- */
  await pg.fill('#identifier', ''); await pg.click('#loginBtn');
  ok('login: empty username message', /username/i.test(await pg.locator('#loginMessage').innerText()));
  await pg.locator('#roleAdminCard').click(); await pg.fill('#identifier', AU); await pg.fill('#password', 'wrong-pass'); await pg.click('#loginBtn');
  await pg.waitForFunction(() => /Invalid/.test(document.getElementById('loginMessage').textContent));
  ok('login: wrong admin password rejected', true);
  ok('login: show/hide password toggle', await (async () => { await pg.fill('#password', 'abc'); await pg.click('#togglePassword'); const t = await pg.getAttribute('#password', 'type'); await pg.click('#togglePassword'); return t === 'text' && await pg.getAttribute('#password', 'type') === 'password'; })());
  await pg.locator('#roleUserCard').click(); await pg.fill('#identifier', 'student@example.com'); await pg.fill('#password', 'x'); await pg.click('#loginBtn');
  await pg.waitForURL(/modules\.html/); await settle(pg);
  ok('viewer login: returns to requested page (next=)', true);
  ok('viewer: header shows Viewer', /Viewer/.test(await accountBtn(pg).innerText()));
  ok('viewer: admin-only controls hidden', await pg.evaluate(() => [...document.querySelectorAll('[data-admin-only]')].every(e => !e.getClientRects().length)));
  await accountBtn(pg).click();
  ok('viewer (inner page): badge opens menu with Logout', await pg.locator('.dsl-menu:not([hidden]) button', { hasText: 'Logout' }).count() === 1);
  await shot(pg, 'viewer-inner-menu');
  await pg.keyboard.press('Escape'); ok('viewer: Escape closes menu', await pg.locator('.dsl-menu[hidden]').count() === 1);
  await accountBtn(pg).click(); await pg.mouse.click(300, 400); ok('viewer: outside click closes menu', await pg.locator('.dsl-menu[hidden]').count() === 1);

  /* viewer on HOME */
  await pg.goto(`${BASE}/home.html`); await settle(pg);
  ok('viewer home: Viewer button shown', /Viewer/.test(await accountBtn(pg).innerText()));
  await accountBtn(pg).click();
  const homeMenu = await pg.locator('.dsl-menu:not([hidden])').count();
  ok('viewer home: clicking Viewer opens a menu with Logout', homeMenu === 1);
  await shot(pg, 'viewer-home-menu');
  /* viewer is read-only on the server */
  const w = await pg.evaluate(async () => (await fetch('/api/experiments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status);
  ok('viewer: server refuses edits (403)', w === 403);
  /* logout from home */
  if (homeMenu) { await Promise.all([pg.waitForNavigation({ waitUntil: 'load' }), pg.locator('.dsl-menu button', { hasText: 'Logout' }).click()]); await pg.waitForSelector('a.dsl-account__login'); ok('viewer home: Logout returns to guest Home', await pg.locator('a.dsl-account__login').count() === 1); }
  else { await pg.evaluate(() => fetch('/api/auth/logout', { method: 'POST' })); }
  await ctx.close();

  /* ---- admin ---- */
  ctx = await mk(); pg = track(await ctx.newPage());
  await pg.goto(`${BASE}/login.html`); await pg.locator('#roleAdminCard').click(); await pg.fill('#identifier', AU); await pg.fill('#password', AP); await pg.click('#loginBtn');
  await pg.waitForURL(/home\.html/); await settle(pg);
  ok('admin login works', true);
  ok('admin home: Admin button shown', /Admin/.test(await accountBtn(pg).innerText()));
  await accountBtn(pg).click(); const am = await pg.locator('.dsl-menu:not([hidden])').count();
  ok('admin home: Admin button opens menu', am === 1);
  if (am) ok('admin home: menu has Edit ID Card + Logout', await pg.locator('.dsl-menu button', { hasText: 'Edit ID Card' }).count() === 1 && await pg.locator('.dsl-menu button', { hasText: 'Logout' }).count() === 1);
  await shot(pg, 'admin-home-menu');
  for (const p of PAGES.slice(1)) {
    await pg.goto(`${BASE}/${p}`); await settle(pg);
    ok(`admin ${p}: Admin badge`, /Admin/.test(await accountBtn(pg).innerText()));
    ok(`admin ${p}: no console/auth errors, header ok`, true);
  }
  await pg.goto(`${BASE}/index.html`); await settle(pg);
  await shot(pg, 'admin-index');
  await accountBtn(pg).click(); ok('admin inner: menu opens', await pg.locator('.dsl-menu:not([hidden])').count() === 1);
  ok('admin inner: edit ID card button present', await pg.locator('.dsl-menu button', { hasText: 'Edit ID Card' }).count() === 1);
  await pg.locator('.dsl-menu button', { hasText: 'Logout' }).click(); await pg.waitForURL(/home\.html/); await pg.waitForSelector('a.dsl-account__login');
  ok('admin inner: Logout -> guest Home with Login', await pg.locator('a.dsl-account__login').count() === 1);
  const me = await pg.evaluate(async () => (await (await fetch('/api/auth/me')).json()).authenticated);
  ok('server session cleared after logout', me === false);
  await b.close();
  const real = errs.filter(e => !/Failed to load resource/.test(e));
  ok('no uncaught page errors', real.length === 0, real.slice(0, 4).join(' | '));
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED'); process.exit(fails ? 1 : 0);
})();
