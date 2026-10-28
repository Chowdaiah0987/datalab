/* Experiment details and sub-experiment details page. Requires experiments-core.js. */
(() => {
  'use strict';
  const { h, icon, api, str, expUrl, lessonUrl, formUrl, topicsOf, directLessonOf, renderVideoInto, pdfHref, findPdf, safeHttp, toolCode, toolUrl } = window.ExpCore;
  const mount = document.getElementById('detail');
  const params = new URLSearchParams(location.search);
  const experimentId = params.get('id') || '';
  const subKey = params.get('sub') || '';

  const btn = (label, href, cls = 'xp-btn--outline', iconName, external) => {
    const a = h('a', { class: `xp-btn ${cls}`, href }, iconName ? icon(iconName, 16) : null, h('span', {}, label));
    if (external) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
    return a;
  };

  function breadcrumb(exp, sub) {
    const nav = h('nav', { class: 'xp-crumbs', 'aria-label': 'Breadcrumb' });
    const items = [['Home', 'home.html'], ['Experiments', 'index.html']];
    items.push([`Experiment ${exp.number}`, sub ? expUrl(exp) : '']);
    if (sub) items.push([`Experiment ${sub.id}`, '']);
    const ol = h('ol');
    items.forEach(([label, href], i) => {
      const last = i === items.length - 1;
      ol.append(h('li', {}, href ? h('a', { href }, label) : h('span', { 'aria-current': 'page' }, label)));
    });
    nav.append(ol);
    return nav;
  }

  const snippet = (t, n = 120) => { const x = String(t || '').replace(/\s+/g, ' ').trim(); return x.length > n ? `${x.slice(0, n - 1).trimEnd()}…` : x; };
  function topicRow(exp, sub, node) {
    const kids = node.children.length;
    const desc = snippet(node.aim);
    return h('a', { class: 'xp-topic-row', href: lessonUrl(exp, sub, node) },
      h('span', { class: 'xp-num-badge' }, node.topicNumber),
      h('span', { class: 'xp-topic-row__text' },
        h('span', { class: 'xp-topic-row__title' }, node.heading),
        desc ? h('small', { class: 'xp-topic-row__desc' }, desc) : null),
      kids ? h('span', { class: 'xp-topic-row__meta' }, `${kids} sub-topic${kids === 1 ? '' : 's'}`) : null,
      icon('chevron', 18));
  }
  /* A sub-experiment shown as a topic-style card on the main experiment page. */
  function subTopicCard(exp, s) {
    return h('a', { class: 'xp-topic-card', href: expUrl(exp, s) },
      h('span', { class: 'xp-num-badge xp-num-badge--lg' }, s.id),
      h('span', { class: 'xp-topic-card__body' },
        h('strong', {}, s.title),
        s.shortDescription ? h('small', {}, snippet(s.shortDescription, 140)) : null),
      icon('chevron', 18));
  }

  function card(title, iconName, ...body) {
    const extra = typeof body[body.length - 1] === 'string' ? ` ${body.pop()}` : '';
    return h('section', { class: `xp-card${extra}` },
      h('h2', { class: 'xp-card__title' }, icon(iconName, 18), h('span', {}, title)), ...body);
  }
  /* Scrollable card body: heading stays fixed, only this area scrolls, and only when content overflows. */
  function scrollBody(...children) {
    const box = h('div', { class: 'xp-scroll' }, ...children);
    const check = () => { box.classList.toggle('is-scrollable', box.scrollHeight > box.clientHeight + 1); };
    if ('ResizeObserver' in window) new ResizeObserver(check).observe(box); else window.addEventListener('resize', check);
    requestAnimationFrame(check);
    return box;
  }

  function toolsCard(tools) {
    const grid = h('div', { class: 'xp-tool-grid' });
    tools.forEach((t) => grid.append(h('a', { class: 'xp-tool', href: toolUrl(t.name), title: `Open ${t.name} in Tools` },
      h('span', { class: 'xp-tool__logo' }, toolCode(t.name)),
      h('div', {}, h('strong', {}, t.name), t.description ? h('small', {}, t.description) : null))));
    const body = tools.length ? grid : h('div', { class: 'xp-empty xp-empty--sm' }, h('p', {}, 'No tools selected yet'));
    return card('Tools Used', 'tool', scrollBody(body), 'xp-card--scroll');
  }

  function mediaBlock(source, parent, title) {
    const wrap = h('div', { class: 'xp-media' });
    const cover = source.cover || parent?.cover || '';
    const hasVideo = !!source.video;
    if (hasVideo) {
      renderVideoInto(wrap, source.video, title, cover).catch((e) => wrap.replaceChildren(h('p', { class: 'xp-muted', text: e.message })));
    } else if (cover) {
      const img = h('img', { src: cover, alt: `${title} cover` });
      img.addEventListener('error', () => wrap.replaceChildren(placeholder()));
      wrap.append(img);
    } else wrap.append(placeholder());
    return wrap;
  }
  const placeholder = () => h('div', { class: 'xp-media__empty' }, icon('flask', 40), h('span', {}, 'No cover image yet'));

  function addMaterialDialog(exp) {
    const dlg = h('dialog', { class: 'xp-dialog', 'aria-labelledby': 'xpMatTitle' });
    const title = h('input', { id: 'xpMatName', required: true, maxlength: '80', placeholder: 'Material PDF' });
    const url = h('input', { id: 'xpMatUrl', type: 'url', required: true, placeholder: 'https://example.com/material.pdf' });
    const msg = h('p', { class: 'xp-form-msg', role: 'alert' });
    const save = h('button', { class: 'xp-btn xp-btn--primary', type: 'submit' }, 'Save material');
    const form = h('form', { method: 'dialog', novalidate: true },
      h('h2', { id: 'xpMatTitle' }, 'Add material'),
      h('label', { class: 'xp-field' }, h('span', {}, 'Title'), title),
      h('label', { class: 'xp-field' }, h('span', {}, 'PDF or material URL'), url), msg,
      h('div', { class: 'xp-dialog__actions' },
        h('button', { class: 'xp-btn xp-btn--outline', type: 'button', onclick: () => dlg.close() }, 'Cancel'), save));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      msg.textContent = '';
      if (!title.value.trim() || !safeHttp(url.value.trim())) { msg.textContent = 'Enter a title and a valid http(s) URL.'; return; }
      save.disabled = true; save.textContent = 'Saving…';
      try {
        const payload = { ...exp, materials: [...exp.materials, { title: title.value.trim(), url: url.value.trim() }] };
        ['id', '_id', 'createdAt', 'updatedAt'].forEach((k) => delete payload[k]);
        await api(`/experiments/${encodeURIComponent(exp.id)}`, { method: 'PUT', body: JSON.stringify(payload) });
        location.reload();
      } catch (err) { msg.textContent = err.message; save.disabled = false; save.textContent = 'Save material'; }
    });
    dlg.append(form);
    document.body.append(dlg);
    dlg.addEventListener('close', () => dlg.remove());
    dlg.showModal();
    title.focus();
  }

  /* Saved tool refs -> current Tools-page data (matched by toolId, else name). Falls back to the saved ref. */
  function resolveTools(saved, catalog) {
    const list = Array.isArray(catalog) ? catalog : [];
    const seen = new Set();
    return (Array.isArray(saved) ? saved : []).map((ref) => {
      const hit = list.find((t) => ref.toolId && String(t.id || t._id) === String(ref.toolId))
        || list.find((t) => str(t.name).trim().toLowerCase() === str(ref.name).trim().toLowerCase());
      return hit ? { name: str(hit.name), description: str(hit.description) || str(ref.description) } : ref;
    }).filter((t) => { const k = str(t.name).trim().toLowerCase(); if (!k || seen.has(k)) return false; seen.add(k); return true; });
  }

  function render(exp, sub, toolCatalog) {
    const source = sub || exp;
    const title = source.title;
    const tree = topicsOf(source, sub ? sub.id : exp.number);
    const direct = sub && !tree.length ? directLessonOf(sub) : null;
    const pdf = findPdf(source);
    const tools = resolveTools(source.tools, toolCatalog);
    document.title = `${title} – Data Science Digital Laboratory`;
    mount.replaceChildren(breadcrumb(exp, sub));

    /* Action bar: read-more pages show navigation only (Add Material / Edit live on the admin screens). */
    mount.append(h('div', { class: 'xp-pagebar' },
      btn(sub ? `Back to Experiment ${exp.number}` : 'Back to Experiments', sub ? expUrl(exp) : 'index.html', 'xp-btn--outline', 'back')));

    /* Header: copy + media */
    const links = h('div', { class: 'xp-link-row' });
    if (pdf) links.append(btn('Download Material', pdfHref(pdf), 'xp-btn--primary', 'download'));
    if (source.githubUrl && safeHttp(source.githubUrl)) links.append(btn('GitHub', source.githubUrl, 'xp-btn--outline', 'github', true));
    const copy = h('div', { class: 'xp-hero__copy' },
      h('span', { class: 'xp-eyebrow xp-eyebrow--badge' }, sub ? `Experiment ${sub.id}` : `Experiment ${exp.number}`),
      h('h1', {}, title),
      h('p', { class: 'xp-lead' }, source.longDescription || source.shortDescription || 'No description has been added yet.'),
      links.children.length ? links : null);
    mount.append(h('section', { class: 'xp-hero xp-hero--card' }, copy, mediaBlock(source, exp, title)));

    /* Learning entries: on the main page the sub-experiments are the topics; child topics of
       7A / 7B are never listed here. On a sub-experiment page its own child topics are listed. */
    const grid = h('div', { class: 'xp-two-col xp-two-col--bounded' });
    const hasSubs = !sub && exp.subExperiments.length > 0;
    const emptyTopics = () => h('div', { class: 'xp-empty xp-empty--sm' },
      h('p', {}, 'No topics added yet'),
      Object.assign(btn('Add content', formUrl(exp), 'xp-btn--primary', 'edit'), { hidden: true, 'data-admin-only': '' }));
    /* Only saved data is rendered: sub-experiments on a main page, saved topics otherwise, else an empty state.
       A sub-experiment that is a direct lesson shows the lesson card below instead of a topics card. */
    if (hasSubs) {
      const body = [h('div', { class: 'xp-topic-card-list' }, exp.subExperiments.map((s) => subTopicCard(exp, s)))];
      if (tree.length) body.push(h('div', { class: 'xp-topic-list xp-topic-list--spaced' }, tree.map((n) => topicRow(exp, null, n))));
      grid.append(card('Topics (Sub-experiments)', 'list', scrollBody(...body), 'xp-card--scroll'));
    } else if (tree.length) {
      const list = h('div', { class: 'xp-topic-list' }, tree.map((n) => topicRow(exp, sub, n)));
      grid.append(card(sub ? `Topics (Child Topics of ${sub.id})` : 'Topics', 'list', scrollBody(list), 'xp-card--scroll'));
    } else if (!direct) {
      grid.append(card(sub ? `Topics (Child Topics of ${sub.id})` : 'Topics', 'list', scrollBody(emptyTopics()), 'xp-card--scroll'));
    }
    grid.append(toolsCard(tools));
    if (grid.children.length) mount.append(grid);

    if (direct) {
      mount.append(card('Lesson', 'book',
        h('p', { class: 'xp-lead xp-lead--sm' }, direct.aim || 'This sub-experiment is a single lesson.'),
        h('div', { class: 'xp-link-row' }, btn('Open lesson workspace', lessonUrl(exp, sub, direct), 'xp-btn--primary', 'play'))));
    }

    window.ExpCore.applyAdminVisibility(mount);
  }

  async function init() {
    try {
      if (!experimentId) throw new Error('No experiment was selected.');
      const exp = await window.ExpCore.loadExperiment(experimentId);
      const sub = subKey ? window.ExpCore.findSub(exp, subKey) : null;
      if (subKey && !sub) throw new Error(`Sub-experiment “${subKey}” was not found. Available: ${exp.subExperiments.map((s) => s.letter).join(', ') || 'none'}.`);
      const toolCatalog = await api('/tools').catch(() => []);
      render(exp, sub, toolCatalog);
    } catch (e) {
      mount.replaceChildren(h('section', { class: 'xp-card xp-error' },
        h('h1', {}, 'Could not load this experiment'), h('p', { class: 'xp-muted' }, e.message),
        btn('Back to Experiments', 'index.html', 'xp-btn--primary', 'back')));
    }
  }
  init();
})();