/* Topic lesson workspace. Requires experiments-core.js. Works for topics with and without sub-topics. */
(() => {
  'use strict';
  const C = window.ExpCore;
  const { h, icon, expUrl, lessonUrl, topicsOf, directLessonOf, findChain, pdfHref, findPdf, safeHttp } = C;
  const mount = document.getElementById('topicPage');
  if (!mount) return;
  const params = new URLSearchParams(location.search);
  const id = params.get('id') || '';
  const subKey = params.get('sub') || '';
  const wanted = params.get('topic') || params.get('path') || '';
  const wantDirect = params.get('direct') === '1';
  const RUN_TIMEOUT_MS = 30000;

  const link = (label, href, cls, iconName, external) => {
    const a = h('a', { class: `xp-btn ${cls}`, href }, iconName ? icon(iconName, 16) : null, h('span', {}, label));
    if (external) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
    return a;
  };
  const disabledLink = (label, cls, iconName, iconAfter) =>
    h('a', { class: `xp-btn ${cls}`, 'aria-disabled': 'true', role: 'link', tabindex: '-1' },
      !iconAfter ? icon(iconName, 16) : null, h('span', {}, label), iconAfter ? icon(iconName, 16) : null);

  /* ---------- Python syntax highlighting (no dependencies) ---------- */
  const KW = new Set('False None True and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield'.split(' '));
  const BI = new Set('print len range int float str list dict set tuple sum min max abs sorted enumerate zip map filter open type isinstance round bool input'.split(' '));
  const escHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  function highlight(code) {
    const re = /(#[^\n]*)|("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*')|(\b\d+(?:\.\d+)?(?:e[+-]?\d+)?\b)|(@[A-Za-z_][\w.]*)|([A-Za-z_]\w*)/g;
    let out = '', last = 0, m, prev = '';
    while ((m = re.exec(code))) {
      out += escHtml(code.slice(last, m.index));
      const [tok, com, strg, num, deco, word] = m;
      if (com) out += `<span class="tk-c">${escHtml(tok)}</span>`;
      else if (strg) out += `<span class="tk-s">${escHtml(tok)}</span>`;
      else if (num) out += `<span class="tk-n">${tok}</span>`;
      else if (deco) out += `<span class="tk-d">${escHtml(tok)}</span>`;
      else if (KW.has(word)) out += `<span class="tk-k">${word}</span>`;
      else if (BI.has(word)) out += `<span class="tk-b">${word}</span>`;
      else if (prev === 'def' || prev === 'class') out += `<span class="tk-f">${word}</span>`;
      else out += word;
      prev = word || '';
      last = m.index + tok.length;
    }
    return out + escHtml(code.slice(last)) + '\n';
  }

  /* ---------- Code editor: textarea over a highlighted <pre> ---------- */
  function createEditor(initial, onRun) {
    const area = h('textarea', { class: 'xp-code__input', spellcheck: 'false', autocapitalize: 'off', autocomplete: 'off', 'aria-label': 'Python code editor', wrap: 'off' });
    const pre = h('pre', { class: 'xp-code__hl', 'aria-hidden': 'true' }, h('code'));
    const gutter = h('div', { class: 'xp-code__gutter', 'aria-hidden': 'true' });
    const box = h('div', { class: 'xp-code' }, gutter, h('div', { class: 'xp-code__stack' }, pre, area));
    let tabTrap = true;
    const sync = () => { pre.scrollTop = area.scrollTop; pre.scrollLeft = area.scrollLeft; gutter.scrollTop = area.scrollTop; };
    const paint = () => {
      pre.firstChild.innerHTML = highlight(area.value);
      gutter.textContent = Array.from({ length: area.value.split('\n').length }, (_, i) => i + 1).join('\n');
      sync();
    };
    area.addEventListener('input', paint);
    area.addEventListener('scroll', sync);
    area.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { tabTrap = false; return; }
      if (e.key === 'Tab' && tabTrap && !e.shiftKey) {
        e.preventDefault();
        area.setRangeText('    ', area.selectionStart, area.selectionEnd, 'end');
        paint();
      } else if (e.key !== 'Shift') tabTrap = true;
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); onRun(); }
    });
    area.addEventListener('blur', () => { tabTrap = true; });
    return {
      el: box, area,
      get value() { return area.value; },
      set value(v) { area.value = v; paint(); },
      init(v) { area.value = v; paint(); },
    };
  }

  /* ---------- Python runner (Web Worker running Pyodide) ---------- */
  function createRunner(editor, output, { run, reset, clear, status }, originalCode) {
    let worker = null, runId = 0, timer = null, busy = false;
    const write = (text, cls) => { const s = h('span', { class: cls || '' }); s.textContent = text; output.append(s); output.scrollTop = output.scrollHeight; };
    const setBusy = (on) => {
      busy = on; run.disabled = on;
      run.classList.toggle('is-loading', on);
      run.querySelector('span:last-child').textContent = on ? 'Running…' : 'Run Code';
      output.setAttribute('aria-busy', String(on));
    };
    const stop = () => { clearTimeout(timer); timer = null; };
    const hasOutput = () => output.textContent.trim() || output.querySelector('img');
    const finish = (failed) => {
      stop(); setBusy(false);
      status.textContent = failed ? 'Error' : 'Success';
      output.dataset.state = failed ? 'error' : 'ok';
      if (!hasOutput()) write('(The program finished without printing anything.)', 'is-muted');
    };
    const killWorker = () => { if (worker) { worker.terminate(); worker = null; } };
    const ensureWorker = () => {
      if (worker) return worker;
      worker = new Worker('python-worker.js');
      worker.onmessage = (e) => {
        const m = e.data || {};
        if (m.id !== runId) return;
        if (m.type === 'status') {
          status.textContent = m.running ? 'Running' : (m.text || 'Running');
          status.title = m.text || '';
          if (m.running) { stop(); timer = setTimeout(timeout, RUN_TIMEOUT_MS); }
        } else if (m.type === 'stdout') write(m.text);
        else if (m.type === 'stderr') write(m.text, 'is-err');
        else if (m.type === 'image') output.append(h('img', { class: 'xp-output__img', alt: 'Plot produced by the code', src: `data:image/png;base64,${m.data}` }));
        else if (m.type === 'done') finish(false);
        else if (m.type === 'pyerror') { write((output.textContent ? '\n' : '') + m.message + '\n', 'is-err'); finish(true); }
        else if (m.type === 'fatal') { output.replaceChildren(); write(m.message + '\n', 'is-err'); killWorker(); finish(true); }
      };
      worker.onerror = () => { write('The Python runtime failed to start in this browser.\n', 'is-err'); killWorker(); finish(true); };
      return worker;
    };
    function timeout() {
      killWorker();
      write(`\nExecution stopped after ${RUN_TIMEOUT_MS / 1000} seconds. Check for an infinite loop or very slow code.\n`, 'is-err');
      finish(true);
    }
    function start() {
      if (busy) return;
      output.replaceChildren(); delete output.dataset.state;
      if (!editor.value.trim()) { write('Write some Python code in the editor first.', 'is-muted'); return; }
      runId += 1; setBusy(true); status.textContent = 'Running';
      try { ensureWorker().postMessage({ type: 'run', id: runId, code: editor.value }); }
      catch (e) { write('Could not start the Python runtime: ' + e.message + '\n', 'is-err'); finish(true); }
    }
    run.addEventListener('click', start);
    reset.addEventListener('click', () => {
      if (busy) { runId += 1; stop(); killWorker(); setBusy(false); }
      editor.value = originalCode;
      output.replaceChildren(); delete output.dataset.state;
      write('Editor reset to the saved code sample.', 'is-muted'); status.textContent = 'Ready';
    });
    clear.addEventListener('click', () => {
      output.replaceChildren(); delete output.dataset.state;
      if (!busy) status.textContent = 'Ready';
    });
    return { start };
  }

  /* ---------- Lesson sections ---------- */
  function section(iconName, title, content, kind) {
    const body = h('div', { class: `xp-lesson__body${kind === 'code' ? ' is-code' : ''}` });
    const empty = content == null || content === '' || (Array.isArray(content) && !content.length);
    if (empty) body.append(h('span', { class: 'xp-lesson__empty' }, 'Not added yet.'));
    else if (Array.isArray(content)) body.append(h('ol', {}, content.map((s) => h('li', {}, s))));
    else if (kind === 'code') { const pre = h('pre'); pre.textContent = content; body.append(pre); }
    else body.append(h('p', {}, content));
    return h('section', { class: 'xp-lesson', 'data-section': title.toLowerCase().replace(/\s+/g, '-') },
      h('h2', { class: 'xp-lesson__head' }, h('span', { class: 'xp-lesson__icon' }, icon(iconName, 18)), h('span', {}, title)), body);
  }

  function crumbs(exp, sub, chain, current) {
    const items = [['Home', 'home.html'], ['Experiments', 'index.html'], [`Experiment ${exp.number}`, expUrl(exp)]];
    if (sub) items.push([`Experiment ${sub.id}`, expUrl(exp, sub)]);
    chain.slice(0, -1).forEach((n) => items.push([n.topicNumber, lessonUrl(exp, sub, n)]));
    items.push([current.isDirect ? current.heading : `${current.topicNumber} ${current.heading}`, '']);
    const ol = h('ol');
    items.forEach(([label, href]) => ol.append(h('li', {}, href ? h('a', { href }, label) : h('span', { 'aria-current': 'page' }, label))));
    return h('nav', { class: 'xp-crumbs', 'aria-label': 'Breadcrumb' }, ol);
  }

  function preorder(tree) {
    const out = [];
    (function walk(nodes, chain) { nodes.forEach((n) => { const c = [...chain, n]; out.push(c); walk(n.children, c); }); })(tree, []);
    return out;
  }
  const childRow = (exp, sub, k) => h('a', { class: 'xp-topic-row', href: lessonUrl(exp, sub, k) },
    h('span', { class: 'xp-num-badge' }, k.topicNumber), h('span', { class: 'xp-topic-row__title' }, k.heading),
    k.children.length ? h('span', { class: 'xp-topic-row__meta' }, `${k.children.length} sub-topic${k.children.length === 1 ? '' : 's'}`) : null, icon('chevron', 18));

  function renderLesson(exp, sub, tree, chain) {
    const topic = chain[chain.length - 1];
    const parent = chain.length > 1 ? chain[chain.length - 2] : null;
    const source = sub || exp;
    document.title = `${topic.heading} – Data Science Digital Laboratory`;
    mount.replaceChildren(crumbs(exp, sub, chain, topic));

    const backHref = parent ? lessonUrl(exp, sub, parent) : expUrl(exp, sub);
    const backLabel = parent ? `Back to ${parent.heading}` : sub ? `Back to Experiment ${sub.id}` : `Back to Experiment ${exp.number}`;
    const actions = h('div', { class: 'xp-actions' });
    const pdfMaterial = topic.pdfUrl ? { url: topic.pdfUrl, title: topic.heading } : findPdf(source);
    if (pdfMaterial) actions.append(link('Download PDF', pdfHref(pdfMaterial), 'xp-btn--outline', 'download'));
    const gh = topic.githubUrl || source.githubUrl || exp.githubUrl;
    if (gh && safeHttp(gh)) actions.append(link('GitHub', gh, 'xp-btn--outline', 'github', true));
    /* Previous / Next move between lessons at the same hierarchy level (siblings under the same parent). */
    const sibs = topic.isDirect ? [] : C.siblingsOf(tree, chain);
    const order = sibs.map((n) => [...chain.slice(0, -1), n]);
    const at = sibs.findIndex((n) => n.id === topic.id);
    const prevChain = at > 0 ? order[at - 1] : null;
    const nextChain = at >= 0 && at < order.length - 1 ? order[at + 1] : null;
    const nextLink = nextChain ? link('Next', lessonUrl(exp, sub, nextChain[nextChain.length - 1]), 'xp-btn--primary') : disabledLink('Next', 'xp-btn--primary', 'forward', true);
    if (nextChain) nextLink.append(icon('forward', 16));
    actions.append(
      prevChain ? link('Previous', lessonUrl(exp, sub, prevChain[prevChain.length - 1]), 'xp-btn--outline', 'back') : disabledLink('Previous', 'xp-btn--outline', 'back'),
      nextLink);
    mount.append(h('div', { class: 'xp-pagebar' }, link(backLabel, backHref, 'xp-btn--outline', 'back'), actions));

    mount.append(h('div', { class: 'xp-lesson-title' },
      h('span', { class: 'xp-num-badge xp-num-badge--lg' }, topic.topicNumber), h('h1', {}, topic.heading)));

    const layout = h('div', { class: 'xp-lesson-layout' });
    const left = h('div', { class: 'xp-lesson-stack' });
    if (topic.children.length) {
      left.append(h('section', { class: 'xp-card xp-card--flat', 'data-section': 'sub-topics' },
        h('h2', { class: 'xp-card__title' }, icon('layers', 18), h('span', {}, 'Sub-topics')),
        h('div', { class: 'xp-topic-list' }, topic.children.map((k) => childRow(exp, sub, k)))));
    }
    left.append(
      section('target', 'Aim', topic.aim),
      section('code', 'Syntax', topic.syntax, 'code'),
      section('list', 'Procedure', topic.procedure),
      section('terminal', 'Code Sample', topic.code, 'code'),
      section('play', 'Output Sample', topic.output, 'code'),
      section('flag', 'Result', topic.result));

    const output = h('pre', { class: 'xp-output', role: 'log', 'aria-live': 'polite', 'aria-label': 'Code output' }, h('span', { class: 'is-muted' }, 'Run the code to see its output here.'));
    const runBtn = h('button', { class: 'xp-btn xp-btn--primary xp-btn--sm', type: 'button', 'data-action': 'run' }, icon('play', 15), h('span', {}, 'Run Code'));
    const resetBtn = h('button', { class: 'xp-btn xp-btn--dark xp-btn--sm', type: 'button', 'data-action': 'reset' }, icon('reset', 15), h('span', {}, 'Reset'));
    const clearBtn = h('button', { class: 'xp-btn xp-btn--dark xp-btn--sm', type: 'button', 'data-action': 'clear' }, icon('clear', 15), h('span', {}, 'Clear Output'));
    const status = h('span', { class: 'xp-runner__status', role: 'status' }, 'Ready');
    let runner;
    const editor = createEditor('', () => runner && runner.start());
    editor.init(topic.code);
    runner = createRunner(editor, output, { run: runBtn, reset: resetBtn, clear: clearBtn, status }, topic.code);
    const lang = h('select', { class: 'xp-select', 'aria-label': 'Language' }, h('option', {}, 'Python 3'));
    const right = h('div', { class: 'xp-runner' },
      h('section', { class: 'xp-ide', 'data-panel': 'editor' },
        h('div', { class: 'xp-ide__bar' }, h('h2', {}, icon('terminal', 17), h('span', {}, 'Live Code Editor')), lang, h('div', { class: 'xp-ide__tools' }, resetBtn, runBtn)),
        editor.el),
      h('section', { class: 'xp-ide xp-ide--out', 'data-panel': 'output' },
        h('div', { class: 'xp-ide__bar' }, h('h2', {}, icon('terminal', 17), h('span', {}, 'Output')), status, h('div', { class: 'xp-ide__tools' }, clearBtn)),
        output));
    layout.append(left, right);
    mount.append(layout);
    mount.dataset.ready = 'true';
  }

  function showError(title, message, extra) {
    mount.replaceChildren(h('section', { class: 'xp-card xp-error' }, h('h1', {}, title), h('p', { class: 'xp-muted' }, message), extra || null,
      link('Back to Experiments', 'index.html', 'xp-btn--primary', 'back')));
    document.title = `${title} – Data Science Digital Laboratory`;
    mount.dataset.ready = 'error';
  }

  async function init() {
    if (!id) return showError('No experiment selected', 'The lesson link is missing an experiment ID.');
    const exp = await C.loadExperiment(id);
    const sub = subKey ? C.findSub(exp, subKey) : null;
    if (subKey && !sub) return showError('Sub-experiment not found', `“${subKey}” does not exist in Experiment ${exp.number}. Available: ${exp.subExperiments.map((s) => s.letter).join(', ') || 'none'}.`);
    const source = sub || exp;
    const tree = topicsOf(source, sub ? sub.id : exp.number);

    if (!sub && !tree.length && exp.subExperiments.length) {
      const list = h('div', { class: 'xp-topic-list' }, exp.subExperiments.map((s) => h('a', { class: 'xp-topic-row', href: expUrl(exp, s) },
        h('span', { class: 'xp-num-badge' }, s.id), h('span', { class: 'xp-topic-row__title' }, s.title), icon('chevron', 18))));
      return showError(`Experiment ${exp.number} is organised into sub-experiments`, 'Choose one to open its lessons.', list);
    }
    if (sub && (wantDirect || !tree.length)) {
      const direct = directLessonOf(sub);
      if (direct) return renderLesson(exp, sub, [], [direct]);
      return showError('No lesson content yet', `${sub.title} has no topics or lesson content. An administrator can add them with Edit Experiment.`);
    }
    if (!tree.length) return showError('No lesson topics yet', 'This experiment has no topics. An administrator can add them with Edit Experiment.');

    let chain;
    if (wanted) {
      chain = findChain(tree, wanted);
      if (!chain) return showError('Topic not found', `No topic matches “${wanted}”. It may have been renamed or deleted.`,
        h('div', { class: 'xp-topic-list' }, tree.map((n) => childRow(exp, sub, n))));
    } else chain = [tree[0]];
    renderLesson(exp, sub, tree, chain);
  }

  init().catch((e) => showError('Topic lesson could not be opened', e.message || String(e)));
})();
