/* Experiments module core: API access, icon set, hierarchy normalisation and lookup,
   URL builders, media helpers and admin gating. Loaded before the page scripts.
   Exposes a single global: window.ExpCore. */
(() => {
  'use strict';

  const API_BASE = String(
    window.DS_LAB_API_BASE ||
    document.querySelector('meta[name="ds-lab-api-base"]')?.content?.trim() ||
    ((['localhost', '127.0.0.1'].includes(location.hostname) && /^55\d{2}$/.test(location.port)) ? 'http://localhost:3000/api' : '/api')
  ).replace(/\/+$/, '');

  const str = (v) => (v == null ? '' : String(v));

  /* ---------- DOM helper ---------- */
  function h(tag, attrs, ...children) {
    const node = document.createElement(tag);
    if (attrs && typeof attrs === 'object' && !(attrs instanceof Node) && !Array.isArray(attrs)) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null || v === false) continue;
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
        else if (k === 'html') node.innerHTML = v; // only ever called with trusted, static markup
        else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
        else if (v === true) node.setAttribute(k, '');
        else node.setAttribute(k, v);
      }
    } else if (attrs != null) children.unshift(attrs);
    for (const c of children.flat()) {
      if (c == null || c === false) continue;
      node.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return node;
  }

  /* ---------- Icons (inline SVG, one consistent stroke set) ---------- */
  const ICON_PATHS = {
    back: '<path d="M15 18l-6-6 6-6"/>',
    forward: '<path d="M9 6l6 6-6 6"/>',
    chevron: '<path d="M9 6l6 6-6 6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/>',
    trash: '<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6"/>',
    download: '<path d="M12 3v12M7 11l5 5 5-5M5 21h14"/>',
    github: '<path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 00-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0020 4.77 5.07 5.07 0 0019.91 1S18.73.65 16 2.48a13.38 13.38 0 00-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 005 4.77a5.44 5.44 0 00-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 009 18.13V22"/>',
    play: '<path d="M7 4l13 8-13 8z"/>',
    reset: '<path d="M3 12a9 9 0 109-9 9 9 0 00-6.400 2.700L3 8"/><path d="M3 3v5h5"/>',
    clear: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    code: '<path d="M8 8l-5 4 5 4M16 8l5 4-5 4M14 4l-4 16"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    terminal: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9l3 3-3 3M13 15h4"/>',
    flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
    folder: '<path d="M3 6a2 2 0 012-2h4l2 2h8a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>',
    flask: '<path d="M9 3h6M10 3v6l-5.500 9.500A2 2 0 006.200 21h11.600a2 2 0 001.700-2.500L14 9V3M7.500 15h9"/>',
    tool: '<path d="M14.700 6.300a4 4 0 00-5.400 5.400L3 18l3 3 6.300-6.300a4 4 0 005.400-5.400l-2.500 2.500-2.500-.5-.5-2.500z"/>',
    layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.500"/><path d="M21 16l-5-5-8 8"/>',
    video: '<rect x="3" y="5" width="14" height="14" rx="2"/><path d="M17 10l4-2v8l-4-2"/>',
    file: '<path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z"/><path d="M14 3v5h5"/>',
    upload: '<path d="M12 16V4M7 9l5-5 5 5M5 20h14"/>',
    check: '<path d="M5 12l5 5 9-10"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    more: '<circle cx="12" cy="5" r="1.200"/><circle cx="12" cy="12" r="1.200"/><circle cx="12" cy="19" r="1.200"/>',
    home: '<path d="M3 11l9-8 9 8M5 10v10h14V10"/>',
    external: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5"/>',
    book: '<path d="M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2zM4 19a2 2 0 002 2h13"/>',
    eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    save: '<path d="M5 3h11l4 4v14H5z"/><path d="M8 3v6h8V3M8 21v-7h8v7"/>',
    chevdown: '<path d="M6 9l6 6 6-6"/>',
    search: '<circle cx="11" cy="11" r="6.500"/><path d="M16 16l4.500 4.500"/>',
  };
  function icon(name, size = 18) {
    const span = document.createElement('span');
    span.className = 'xp-icon';
    span.setAttribute('aria-hidden', 'true');
    span.innerHTML = `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" focusable="false">${ICON_PATHS[name] || ''}</svg>`;
    return span;
  }

  /* ---------- API ---------- */
  async function api(path, options = {}) {
    let response;
    try {
      response = await fetch(`${API_BASE}${path}`, {
        credentials: 'same-origin',
        ...options,
        headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
      });
    } catch {
      throw new Error(`Cannot reach the Data Science Laboratory API at ${API_BASE}. Make sure the server is running and open this page from the same site.`);
    }
    const type = response.headers.get('content-type') || '';
    const data = type.includes('application/json') ? await response.json().catch(() => null) : null;
    if (!response.ok) throw new Error(data?.error || `Request failed (${response.status}).`);
    return data;
  }

  /* ---------- Admin gating (server remains the authority) ---------- */
  let adminPromise;
  function isAdmin() {
    if (!adminPromise) {
      adminPromise = fetch(`${API_BASE}/auth/me`, { credentials: 'same-origin', cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null))
        .then((me) => !!(me && me.authenticated === true && me.role === 'admin'))
        .catch(() => false);
    }
    return adminPromise;
  }
  async function applyAdminVisibility(root = document) {
    const admin = await isAdmin();
    root.querySelectorAll('[data-admin-only]').forEach((n) => { n.hidden = !admin; });
    document.documentElement.dataset.xpRole = admin ? 'admin' : 'user';
    return admin;
  }

  /* ---------- Hierarchy normalisation ----------
     Each topic node becomes:
       { id, heading, topicNumber, aim, syntax, procedure[], code, output, result,
         pdfUrl, githubUrl, children[], raw }
     IDs are taken from saved data when unique; otherwise a deterministic path-based
     ID is generated, so links never depend on array position when real IDs exist. */
  const LEGACY_HEADINGS = /^(description|program|output|result|materials|overview|tools)$/i;
  const CHILD_KEYS = ['subTopics', 'subtopics', 'childTopics', 'children'];

  function procedureList(value) {
    if (Array.isArray(value)) return value.map(str).map((s) => s.trim()).filter(Boolean);
    return str(value).split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  }
  function hasLessonContent(t) {
    return !!(t.aim || t.syntax || t.procedure.length || t.code || t.output || t.result);
  }
  function normalizeTopic(raw, index, parentNumber, parentPath, used, siblingCount = 1) {
    const t = raw && typeof raw === 'object' ? raw : {};
    const heading = str(t.heading || t.title || t.name || t.topicName || t.topic_name || t.label).trim();
    const kidsRaw = CHILD_KEYS.map((k) => t[k]).find((v) => Array.isArray(v) && v.length) || [];
    /* Only a topic that actually has a configured number keeps it. A lone top-level topic without a number is a
       direct topic and shows the experiment's own number; it must never get an invented ".1" child number. */
    const configured = str(t.topicNumber || t.topicNo || t.number || '').trim();
    const isTopLevel = parentPath.length === 0;
    const number = configured || (isTopLevel && siblingCount === 1 ? parentNumber : `${parentNumber}.${index + 1}`);
    const path = [...parentPath, index];
    let id = str(t.id || t.topicId).trim();
    if (!id || used.has(id) || /^topic-\d+$/.test(id) || id === 'legacy-topic-1') id = `t-${path.join('-')}`;
    while (used.has(id)) id += '_';
    used.add(id);
    const node = {
      id,
      heading: heading || `Topic ${number}`,
      topicNumber: number,
      aim: str(t.aim || t.objective || (t.type !== 'code' ? (t.content || t.description || t.longDescription) : '') || '').trim(),
      syntax: str(t.syntax || t.syntaxSample || ''),
      procedure: procedureList(t.procedure ?? t.steps ?? t.process ?? ''),
      code: str(t.code || t.codeSample || t.program || t.programCode || t.sampleCode || ''),
      output: str(t.sampleOutput || t.outputSample || t.expectedOutput || t.output || ''),
      result: str(t.result || t.conclusion || '').trim(),
      pdfUrl: str(t.pdfUrl || t.materialPdfUrl || ''),
      githubUrl: str(t.githubUrl || t.github || ''),
      path,
      raw: t,
      children: [],
    };
    node.children = kidsRaw.map((k, i) => normalizeTopic(k, i, number, path, used, kidsRaw.length));
    return node;
  }
  function pickTopicList(source) {
    if (!source || typeof source !== 'object') return [];
    const lists = [source.topics, source.lessonTopics, source.d2Topics, source.subTopics, source.subtopics, source.childTopics];
    for (const list of lists) {
      if (!Array.isArray(list)) continue;
      const valid = list.filter((t) => t && typeof t === 'object'
        && t.id !== 'legacy-topic-1' /* auto-generated copy of the long description, not a real topic */
        && !(list === source.d2Topics && !str(t.heading || t.title || '').trim())
        && str(t.heading || t.title || t.name || t.topicName || t.topic_name || t.aim || t.objective || t.content || t.description || t.code || t.program || t.programCode).trim()
        && !(list === source.d2Topics && LEGACY_HEADINGS.test(str(t.heading || t.title || '').trim())));
      if (valid.length) return valid;
    }
    return [];
  }
  /* Topics of an experiment or sub-experiment as a normalised tree. */
  function topicsOf(source, baseNumber) {
    const used = new Set();
    const number = str(baseNumber || source?.id || source?.number || '1');
    const list = pickTopicList(source);
    const tree = list.map((t, i) => normalizeTopic(t, i, number, [], used, list.length));
    /* Legacy data: older saves stamped a lone direct topic as "<number>.1" (1.1, 2.1, 1A.1 ...).
       A single childless top-level topic carrying exactly that stamp is a direct topic, so show its real number. */
    if (tree.length === 1 && !tree[0].children.length && tree[0].topicNumber === `${number}.1`) tree[0].topicNumber = number;
    return tree;
  }
  /* A sub-experiment with no topic array but with lesson content opens that content directly. */
  function directLessonOf(sub) {
    if (!sub) return null;
    const probe = {
      aim: str(sub.aim || sub.objective || '').trim(),
      syntax: str(sub.syntax || ''),
      procedure: procedureList(sub.procedure ?? sub.steps ?? ''),
      code: str(sub.code || sub.codeSample || sub.program || ''),
      output: str(sub.sampleOutput || sub.outputSample || sub.output || ''),
      result: str(sub.result || sub.conclusion || '').trim(),
    };
    const legacy = Array.isArray(sub.d2Topics) ? sub.d2Topics.filter((t) => t && (t.code || t.content)) : [];
    if (!probe.code) probe.code = str(legacy.find((t) => t.type === 'code')?.code || '');
    if (!probe.aim) probe.aim = str(sub.longDescription || sub.d2Content || '').trim();
    const real = !!(probe.syntax || probe.procedure.length || probe.code || probe.output || probe.result);
    if (!real && !probe.aim) return null;
    return {
      id: '__direct', heading: str(sub.title) || `Experiment ${sub.id}`, topicNumber: str(sub.id), ...probe,
      pdfUrl: '', githubUrl: str(sub.githubUrl), path: [], children: [], raw: sub, isDirect: true,
    };
  }
  /* Find a node by id (preferred), topic number, or dotted index path (legacy). Returns the ancestor chain. */
  function findChain(tree, wanted) {
    const target = str(wanted).trim();
    if (!target) return null;
    const lower = target.toLowerCase();
    const walk = (nodes, chain, pred) => {
      for (const n of nodes) {
        const c = [...chain, n];
        if (pred(n)) return c;
        const deeper = walk(n.children, c, pred);
        if (deeper) return deeper;
      }
      return null;
    };
    return walk(tree, [], (n) => n.id === target)
      || walk(tree, [], (n) => n.topicNumber.toLowerCase() === lower)
      || (/^\d+(\.\d+)*$/.test(target) ? chainByIndexPath(tree, target.split('.').map(Number)) : null)
      || walk(tree, [], (n) => n.heading.toLowerCase() === lower);
  }
  function chainByIndexPath(tree, idx) {
    let list = tree; const chain = [];
    for (const i of idx) {
      const n = list[i];
      if (!n) return null;
      chain.push(n); list = n.children;
    }
    return chain;
  }
  function siblingsOf(tree, chain) {
    return chain.length > 1 ? chain[chain.length - 2].children : tree;
  }
  /* Flat, depth-first list of every lesson-capable leaf, for Previous/Next across the whole tree. */
  function flattenLeaves(tree) {
    const out = [];
    (function walk(nodes, chain) {
      for (const n of nodes) {
        const c = [...chain, n];
        if (n.children.length) walk(n.children, c); else out.push(c);
      }
    })(tree, []);
    return out;
  }

  function normalizeSub(raw, number, i) {
    const s = raw && typeof raw === 'object' ? raw : {};
    const letter = str(s.letter || str(s.id).replace(String(number), '') || String.fromCharCode(65 + i));
    return {
      ...s,
      letter,
      id: str(s.id || `${number}${letter}`),
      title: str(s.title || s.name || `Experiment ${number}${letter}`),
      shortDescription: str(s.shortDescription || s.description || ''),
      longDescription: str(s.longDescription || s.d2Content || s.content || ''),
      cover: str(s.cover || ''), video: str(s.video || ''), githubUrl: str(s.githubUrl || ''),
      tools: Array.isArray(s.tools) ? s.tools : [],
      materials: Array.isArray(s.materials) ? s.materials : [],
    };
  }
  function normalizeExperiment(raw, fallbackId) {
    const x = raw && typeof raw === 'object' ? raw : {};
    const number = str(x.number || x.experimentNumber || '1');
    return {
      ...x,
      id: str(x.id || x._id || fallbackId),
      number,
      title: str(x.title || x.name || `Experiment ${number}`),
      shortDescription: str(x.shortDescription || x.description || ''),
      longDescription: str(x.longDescription || x.d2Content || ''),
      cover: str(x.cover || ''), video: str(x.video || ''), githubUrl: str(x.githubUrl || ''),
      tools: Array.isArray(x.tools) ? x.tools : [],
      materials: Array.isArray(x.materials) ? x.materials : [],
      subExperiments: (Array.isArray(x.subExperiments) ? x.subExperiments : []).map((s, i) => normalizeSub(s, number, i)),
    };
  }
  async function loadExperiment(idOrNumber) {
    let raw;
    if (/^[a-f\d]{24}$/i.test(idOrNumber)) raw = await api(`/experiments/${encodeURIComponent(idOrNumber)}`);
    else raw = (await api('/experiments')).find((x) => str(x.number) === idOrNumber || str(x.id) === idOrNumber);
    if (!raw) throw new Error('This experiment was not found in the database.');
    return normalizeExperiment(raw, idOrNumber);
  }
  function findSub(exp, key) {
    if (!key) return null;
    const k = str(key).toLowerCase();
    return exp.subExperiments.find((s) => s.letter.toLowerCase() === k || s.id.toLowerCase() === k) || null;
  }

  /* ---------- URLs ---------- */
  const q = encodeURIComponent;
  const expUrl = (exp, sub) => `experiment.html?id=${q(exp.id)}${sub ? `&sub=${q(sub.letter)}` : ''}`;
  const lessonUrl = (exp, sub, topic) =>
    `topic-lesson.html?id=${q(exp.id)}${sub ? `&sub=${q(sub.letter)}` : ''}${topic?.isDirect ? '&direct=1' : topic ? `&topic=${q(topic.id)}` : ''}`;
  const formUrl = (exp) => `experiment-form.html${exp ? `?id=${q(exp.id)}` : ''}`;

  /* ---------- Media ---------- */
  function videoEmbedUrl(raw) {
    try {
      const u = new URL(raw);
      const host = u.hostname.replace(/^www\./, '').toLowerCase();
      if (host === 'youtu.be') { const id = u.pathname.split('/').filter(Boolean)[0]; return id ? `https://www.youtube-nocookie.com/embed/${q(id)}` : ''; }
      if (['youtube.com', 'm.youtube.com', 'youtube-nocookie.com'].includes(host)) {
        const id = u.searchParams.get('v') || u.pathname.match(/\/(?:embed|shorts|live)\/([^/?]+)/)?.[1];
        return id ? `https://www.youtube-nocookie.com/embed/${q(id)}` : '';
      }
      if (host === 'vimeo.com' || host === 'player.vimeo.com') {
        const id = u.pathname.split('/').filter(Boolean).pop();
        return id && /^\d+$/.test(id) ? `https://player.vimeo.com/video/${id}` : '';
      }
    } catch { /* not a URL */ }
    return '';
  }
  async function renderVideoInto(container, key, title, poster) {
    if (!key) return false;
    if (/^https?:\/\//i.test(key)) {
      const embed = videoEmbedUrl(key);
      if (embed) {
        container.replaceChildren(h('iframe', {
          src: embed, title: `${title} video`, loading: 'lazy', allowfullscreen: true,
          allow: 'accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share',
          referrerpolicy: 'strict-origin-when-cross-origin',
        }));
        return true;
      }
      if (!/\.(?:mp4|webm|ogg)(?:[?#]|$)/i.test(key)) {
        container.replaceChildren(h('p', { class: 'xp-muted', text: 'This video link is not a directly playable file or a supported embed.' }),
          h('a', { class: 'xp-btn xp-btn--outline', href: key, target: '_blank', rel: 'noopener noreferrer' }, 'Open video link', icon('external', 16)));
        return true;
      }
      container.replaceChildren(h('video', { controls: true, preload: 'metadata', poster: poster || null, src: key }));
      return true;
    }
    const response = await fetch(`${API_BASE}/videos/${q(key)}`);
    if (!response.ok) throw new Error('The saved video could not be loaded.');
    container.replaceChildren(h('video', { controls: true, preload: 'metadata', poster: poster || null, src: URL.createObjectURL(await response.blob()) }));
    return true;
  }
  function pdfHref(material) {
    if (!material?.url) return '';
    try {
      const u = new URL(material.url, location.origin);
      if (u.pathname.includes('/api/module-files/')) {
        u.searchParams.set('download', '1');
        u.searchParams.set('downloadName', `${(material.title || 'learning-material').replace(/[^\w.-]+/g, '_')}.pdf`);
      }
      return u.href;
    } catch { return material.url; }
  }
  const findPdf = (source) => (source?.materials || []).find((m) => /pdf/i.test(m.title || '') || /\.pdf(?:[?#]|$)/i.test(m.url || ''));
  const safeHttp = (url) => { try { return ['http:', 'https:'].includes(new URL(url).protocol); } catch { return false; } };

  /* ---------- Tools ---------- */
  /* There is no per-tool detail page; tools.html is the existing Tools listing and each card there carries a
     matching #tool-<slug> anchor (see library-cards.js). */
  const toolSlug = (name) => str(name).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const toolUrl = (name) => `tools.html#tool-${toolSlug(name)}`;
  const TOOL_CATALOG = [
    { name: 'Python', code: 'Py', hint: 'Programming language' },
    { name: 'Pandas', code: 'Pd', hint: 'Data analysis' },
    { name: 'NumPy', code: 'Np', hint: 'Numerical computing' },
    { name: 'Jupyter Notebook', code: 'Jp', hint: 'Interactive notebooks' },
    { name: 'Matplotlib', code: 'Mp', hint: 'Plotting' },
    { name: 'Seaborn', code: 'Sb', hint: 'Statistical graphics' },
    { name: 'Scikit-learn', code: 'Sk', hint: 'Machine learning' },
    { name: 'Requests', code: 'Rq', hint: 'HTTP library' },
    { name: 'Other', code: '+', hint: 'Custom tool' },
  ];
  function toolCode(name) {
    const hit = TOOL_CATALOG.find((t) => t.name.toLowerCase() === str(name).toLowerCase());
    return hit ? hit.code : str(name).slice(0, 2).toUpperCase() || '?';
  }

  window.ExpCore = {
    API_BASE, h, icon, api, str, isAdmin, applyAdminVisibility,
    normalizeExperiment, loadExperiment, findSub, topicsOf, directLessonOf, findChain, siblingsOf, flattenLeaves, hasLessonContent,
    expUrl, lessonUrl, formUrl, videoEmbedUrl, renderVideoInto, pdfHref, findPdf, safeHttp, TOOL_CATALOG, toolCode, toolUrl, toolSlug,
  };
})();