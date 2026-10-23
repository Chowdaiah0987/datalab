/* Dependency-free structural checks for the Experiments module (no browser, no database). */
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const files = ['index.html', 'experiment.html', 'experiment-details.js', 'experiment-form.html', 'experiment-form.js', 'experiment-form-ui.js', 'experiment-form-premium.css',
  'topic-lesson.html', 'experiment-topic.html', 'experiment-lesson.js', 'python-worker.js', 'experiments-core.js', 'experiments-premium.css', 'server.js'];
for (const f of files) assert.ok(fs.existsSync(path.join(root, f)), `Missing ${f}`);
for (const f of ['experiment.html', 'topic-lesson.html', 'experiment-topic.html', 'index.html', 'experiment-form.html'])
  assert.ok(/<title>[^<]*<\/title>/.test(read(f)), `${f}: <title> must be closed (an unclosed title blanks the page)`);
for (const f of ['topic-lesson.html', 'experiment-topic.html']) assert.match(read(f), /experiment-lesson\.js/);
assert.match(read('experiment.html'), /experiment-details\.js/);
const lesson = read('experiment-lesson.js');
for (const s of ['Aim', 'Syntax', 'Procedure', 'Code Sample', 'Output Sample', 'Result', 'Live Code Editor', 'Run Code', 'Clear Output', 'Reset']) assert.ok(lesson.includes(s), `lesson: ${s}`);
assert.doesNotMatch(lesson + read('python-worker.js'), /\beval\s*\(/, 'no eval() code execution');
const core = read('experiments-core.js');
for (const s of ['findChain', 'topicsOf', 'directLessonOf', 'normalizeExperiment']) assert.ok(core.includes(s), `core: ${s}`);
const server = read('server.js');
assert.match(server, /ensureUniqueTopicIds/); assert.match(server, /newTopicId/);
assert.match(server, /app\.get\("\/api\/experiments\/:id"/);
assert.doesNotMatch(read('experiments-premium.css'), /^\s*(body|html|h1|h2|a|button|input)\s*[,{]/m, 'premium css must not use bare global selectors');
for (const f of fs.readdirSync(root)) assert.notEqual(f, '.env', '.env must not ship');
for (const f of ['experiments-premium.css', 'experiment-form-premium.css']) {
  const css = read(f).replace(/\/\*[\s\S]*?\*\//g, '');
  assert.equal((css.match(/{/g) || []).length, (css.match(/}/g) || []).length, `${f}: unbalanced braces`);
}
console.log('PASS: structural checks');
