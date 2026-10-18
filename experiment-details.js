/* Experiment details and sub-experiment details page. Requires experiments-core.js. */
(() => {
  'use strict';
  const { h, icon, api, str, expUrl, lessonUrl, formUrl, topicsOf, directLessonOf, renderVideoInto, pdfHref, findPdf, safeHttp, toolCode } = window.ExpCore;
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
    return h('section', { class: 'xp-card' },
      h('h2', { class: 'xp-card__title' }, icon(iconName, 18), h('span', {}, title)), ...body);
  }

  function toolsCard(tools) {
    const grid = h('div', { class: 'xp-tool-grid' });
    tools.forEach((t) => grid.append(h('div', { class: 'xp-tool' },
      h('span', { class: 'xp-tool__logo' }, toolCode(t.name)),
      h('div', {}, h('strong', {}, t.name), t.description ? h('small', {}, t.description) : null))));
    return card('Tools Used', 'tool', grid);
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

  function render(exp, sub) {
    const source = sub || exp;
    const title = source.title;
    const tree = topicsOf(source, sub ? sub.id : exp.number);
    const direct = sub && !tree.length ? directLessonOf(sub) : null;
    const pdf = findPdf(source);
    const tools = source.tools.length ? source.tools : (sub ? exp.tools : []);
    document.title = `${title} – Data Science Digital Laboratory`;
    mount.replaceChildren(breadcrumb(exp, sub));

    /* Action bar */
    const actions = h('div', { class: 'xp-actions' });
    if (!sub) {
      actions.append(
        h('button', { class: 'xp-btn xp-btn--outline', type: 'button', 'data-admin-only': true, hidden: true, onclick: () => addMaterialDialog(exp) }, icon('plus', 16), h('span', {}, 'Add Material')),
        Object.assign(btn('Edit', formUrl(exp), 'xp-btn--primary', 'edit'), { hidden: true }),
      );
      actions.lastChild.setAttribute('data-admin-only', '');
    }
    mount.append(h('div', { class: 'xp-pagebar' },
      btn(sub ? `Back to Experiment ${exp.number}` : 'Back to Experiments', sub ? expUrl(exp) : 'index.html', 'xp-btn--outline', 'back'), actions));

    /* Header: copy + media */
    const links = h('div', { class: 'xp-link-row' });
    if (pdf) links.append(btn('Download Material', pdfHref(pdf), 'xp-btn--primary', 'download'));
    if (source.githubUrl && safeHttp(source.githubUrl)) links.append(btn('GitHub', source.githubUrl, 'xp-btn--outline', 'github', true));
    const copy = h('div', { class: 'xp-hero__copy' },
      h('span', { class: 'xp-eyebrow' }, sub ? `Experiment ${sub.id}` : `Experiment ${exp.number}`),
      h('h1', {}, title),
      h('p', { class: 'xp-lead' }, source.longDescription || source.shortDescription || 'No description has been added yet.'),
      links.children.length ? links : null);
    mount.append(h('section', { class: 'xp-hero' }, copy, mediaBlock(source, exp, title)));

    /* Learning entries: on the main page the sub-experiments are the topics; child topics of
       7A / 7B are never listed here. On a sub-experiment page its own child topics are listed. */
    const grid = h('div', { class: 'xp-two-col' });
    const hasSubs = !sub && exp.subExperiments.length > 0;
    if (hasSubs) {
      const cards = h('div', { class: 'xp-topic-card-list' }, exp.subExperiments.map((s) => subTopicCard(exp, s)));
      const body = [cards];
      if (tree.length) body.push(h('div', { class: 'xp-topic-list xp-topic-list--spaced' }, tree.map((n) => topicRow(exp, null, n))));
      grid.append(card('Topics (Sub-experiments)', 'list', ...body));
    } else if (tree.length) {
      const list = h('div', { class: 'xp-topic-list' }, tree.map((n) => topicRow(exp, sub, n)));
      grid.append(card(sub ? `Topics (Child Topics of ${sub.id})` : 'Topics', 'list', list));
    }
    if (tools.length) grid.append(toolsCard(tools));
    if (grid.children.length) mount.append(grid);

    if (direct) {
      mount.append(card('Lesson', 'book',
        h('p', { class: 'xp-lead xp-lead--sm' }, direct.aim || 'This sub-experiment is a single lesson.'),
        h('div', { class: 'xp-link-row' }, btn('Open lesson workspace', lessonUrl(exp, sub, direct), 'xp-btn--primary', 'play'))));
    }

    if (!tree.length && !direct && !(!sub && exp.subExperiments.length)) {
      mount.append(card('Topics', 'list', h('div', { class: 'xp-empty' },
        h('p', {}, 'No topics or lessons have been added yet.'),
        Object.assign(btn('Add content', formUrl(exp), 'xp-btn--primary', 'edit'), { hidden: true }))));
      mount.lastChild.querySelector('a').setAttribute('data-admin-only', '');
    }
    window.ExpCore.applyAdminVisibility(mount);
  }

  async function init() {
    try {
      if (!experimentId) throw new Error('No experiment was selected.');
      const exp = await window.ExpCore.loadExperiment(experimentId);
      const sub = subKey ? window.ExpCore.findSub(exp, subKey) : null;
      if (subKey && !sub) throw new Error(`Sub-experiment “${subKey}” was not found. Available: ${exp.subExperiments.map((s) => s.letter).join(', ') || 'none'}.`);
      render(exp, sub);
    } catch (e) {
      mount.replaceChildren(h('section', { class: 'xp-card xp-error' },
        h('h1', {}, 'Could not load this experiment'), h('p', { class: 'xp-muted' }, e.message),
        btn('Back to Experiments', 'index.html', 'xp-btn--primary', 'back')));
    }
  }
  init();
})();
