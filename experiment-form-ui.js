/* Replaces glyph/emoji icons in the Add/Edit form with the shared SVG icon set (also for dynamically added cards). */
(() => {
  'use strict';
  const { icon } = window.ExpCore;
  const TITLE_ICONS = [['basic information', 'file'], ['material pdf', 'file'], ['video', 'video'], ['direct topics', 'list'], ['tools', 'tool'], ['direct topic lesson', 'book'], ['sub-experiments', 'layers']];
  function enhance(root) {
    root.querySelectorAll('.ef-panel-title:not([data-xp])').forEach((t) => {
      t.dataset.xp = '1';
      const first = t.firstElementChild;
      const text = t.textContent.toLowerCase();
      const hit = TITLE_ICONS.find(([k]) => text.includes(k));
      if (first && first.tagName === 'SPAN' && hit) first.replaceWith(icon(hit[1], 18));
    });
    root.querySelectorAll('.ef-icon-button[data-remove-sub]:not([data-xp])').forEach((b) => { b.dataset.xp = '1'; b.replaceChildren(icon('trash', 16)); });
    root.querySelectorAll('.ef-upload-icon:not(.ef-pdf):not(.ef-video):not([data-xp])').forEach((n) => { n.dataset.xp = '1'; n.replaceChildren(icon('image', 20)); });
    root.querySelectorAll('.ef-upload-icon.ef-video:not([data-xp])').forEach((n) => { n.dataset.xp = '1'; n.replaceChildren(icon('video', 20)); });
    root.querySelectorAll('.ef-pagehead .ef-plus:not([data-xp])').forEach((n) => { n.dataset.xp = '1'; n.replaceChildren(icon('plus', 24)); });
    root.querySelectorAll('.ef-button, .ef-blue-button').forEach((b) => {
      if (b.dataset.xp) return; b.dataset.xp = '1';
      const m = b.textContent.trim().match(/^([＋▤◉▣←])\s*(.+)$/);
      if (!m) return;
      const map = { '＋': 'plus', '▤': b.id === 'saveDraft' ? 'file' : 'plus', '◉': 'eye', '▣': 'save', '←': 'back' };
      b.replaceChildren(icon(map[m[1]], 16), document.createTextNode(m[2]));
    });
  }
  enhance(document);
  new MutationObserver(() => enhance(document)).observe(document.body, { childList: true, subtree: true });
})();
