/* Tests the lesson page's run pipeline (worker messaging, output, errors, timeout UI) with a STAND-IN Pyodide.
   This does NOT prove real Python execution; that needs the real CDN runtime in a browser. */
const { chromium } = require(process.env.PW_PATH || 'playwright');
const BASE = process.env.BASE || 'http://localhost:3100';
const fake = `self.loadPyodide = async () => {
  let out = () => {};
  const g = { set() {}, destroy() {} };
  return {
    setStdout(o) { out = o.batched; }, setStderr() {},
    pyodide_py: { code: { find_imports: () => ({ toJs: () => [] }) } },
    loadPackagesFromImports: async () => {},
    globals: { get: () => () => g },
    runPython: () => true,
    runPythonAsync: async (code) => {
      if (code.includes('_out = []')) return { toJs: () => [], destroy() {} };
      if (code.includes('MPLBACKEND')) return;
      if (code.includes('while True')) { await new Promise(() => {}); }
      if (code.includes('raise')) { const e = new Error('Traceback (most recent call last):\\n  File "<exec>", line 1, in <module>\\nValueError: boom'); e.type = 'ValueError'; throw e; }
      for (const m of code.matchAll(/print\\("([^"]*)"\\)/g)) out(m[1]);
    },
  };
};`;
let n = 0, bad = 0; const ok = (name, c, d = '') => { n++; if (!c) bad++; console.log((c ? 'PASS ' : 'FAIL ') + name + (d ? '  ' + d : '')); };
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext();
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await ctx.route(/cdn\.jsdelivr\.net\/pyodide\/.*pyodide\.js/, r => r.fulfill({ contentType: 'text/javascript', body: fake }));
  const pg = await ctx.newPage();
  await pg.goto(BASE + '/topic-lesson.html?id=aaaaaaaaaaaaaaaaaaaaaaa1&topic=tp-11'); await pg.waitForSelector('.xp-code__input');
  const run = async (code) => { await pg.fill('.xp-code__input', code); await pg.locator('[data-action=run]').click(); await pg.waitForFunction(() => /Success|Error/.test(document.querySelector('.xp-runner__status').textContent), null, { timeout: 40000 }); return pg.locator('.xp-output').innerText(); };
  let out = await run('print("hello real output")'); ok('stdout shown', out.includes('hello real output') && (await pg.locator('.xp-output').getAttribute('data-state')) === 'ok');
  out = await run('raise ValueError("boom")'); ok('python error shown with traceback', out.includes('ValueError: boom') && out.includes('<editor>') && (await pg.locator('.xp-output').getAttribute('data-state')) === 'error', out.replace(/\n/g, ' | ').slice(0, 100));
  await pg.fill('.xp-code__input', '   '); await pg.locator('[data-action=run]').click();
  ok('empty editor handled', /Write some Python/.test(await pg.locator('.xp-output').innerText()));
  await pg.fill('.xp-code__input', 'while True: pass'); await pg.locator('[data-action=run]').click();
  ok('button shows loading state', await pg.locator('[data-action=run].is-loading').count() === 1 && await pg.locator('[data-action=run]').isDisabled());
  await pg.locator('[data-action=reset]').click();
  ok('Reset during run cancels it and re-enables Run', await pg.locator('[data-action=run]').isEnabled());
  await b.close(); console.log(`${n - bad}/${n} passed`); process.exit(bad ? 1 : 0);
})();
