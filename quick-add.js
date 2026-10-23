/* =========================================================
   Quick Actions + item selection (used on Modules, Experiments,
   Tools and Resources pages)

   1) ?action=add  -> opens the page's Add form, scrolls to it and
      focuses the first field. Works for the <details class="module-create">
      forms (Tools, Resources) and falls back to clicking an
      "Add Module / Experiment / Tool / Resource" button.
   2) Adds a Cancel button next to Save in those <details> forms.
   3) ?tool= / ?experiment= / ?resource= / ?module=<id> -> highlights
      the matching card once the list has rendered.

   Load it AFTER the page's own scripts.
   ========================================================= */
(function () {
  "use strict";

  if (window.__dslQuickAdd) return;
  window.__dslQuickAdd = true;

  const params = new URLSearchParams(location.search);
  const WAIT_MS = 8000;

  function cleanUrl(keys) {
    const url = new URL(location.href);
    keys.forEach((k) => url.searchParams.delete(k));
    history.replaceState(null, "", url.pathname + url.search + url.hash);
  }

  function waitFor(find, done) {
    const first = find();
    if (first) return done(first);
    const obs = new MutationObserver(() => {
      const found = find();
      if (found) { obs.disconnect(); clearTimeout(timer); done(found); }
    });
    obs.observe(document.body, { childList: true, subtree: true });
    const timer = setTimeout(() => obs.disconnect(), WAIT_MS);
  }

  function focusFirstField(root) {
    const field = root.querySelector("input:not([type=file]):not([type=hidden]), textarea, select");
    if (field) field.focus({ preventScroll: true });
  }

  // ---------- Cancel buttons ----------
  function addCancel(details) {
    const form = details.querySelector("form");
    if (!form) return;
    // Tools/Resources ship their own Cancel button (wired in library-cards.js).
    if (form.querySelector("[data-cancel-add]")) return;
    const save = form.querySelector('button[type="submit"]');
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "module-secondary-button";
    cancel.textContent = "Cancel";
    cancel.setAttribute("data-cancel-add", "");
    cancel.addEventListener("click", () => {
      form.reset();
      details.open = false;
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
    if (save) save.insertAdjacentElement("afterend", cancel);
    else form.appendChild(cancel);
  }

  document.querySelectorAll("details.module-create").forEach(addCancel);

  // ---------- ?action=add ----------
  if (params.get("action") === "add") {
    const ADD_TEXT = /^\s*\+?\s*add(\s+(module|experiment|tool|resource))?\s*$/i;

    const openForm = () => waitFor(
      () => {
        const details = document.querySelector("details.module-create");
        if (details) return { kind: "details", node: details };
        const btn = document.getElementById("openAddBtn") ||
          Array.from(document.querySelectorAll("button, summary")).find((n) => ADD_TEXT.test(n.textContent || ""));
        return btn ? { kind: "button", node: btn } : null;
      },
      (found) => {
        if (found.kind === "details") {
          found.node.open = true;
          found.node.scrollIntoView({ behavior: "smooth", block: "start" });
          setTimeout(() => focusFirstField(found.node), 250);
        } else {
          found.node.click(); // Experiments page: opens the Add Experiment modal
          setTimeout(() => {
            const form = document.querySelector(".modal:not([hidden]) form") || document.querySelector("form");
            if (form) focusFirstField(form);
          }, 300);
        }
        cleanUrl(["action"]);
      }
    );

    // Let the page's own scripts attach their handlers first.
    if (document.readyState === "complete") setTimeout(openForm, 100);
    else window.addEventListener("load", () => setTimeout(openForm, 100));
  }

  // ---------- ?tool= / ?experiment= / ?resource= / ?module= ----------
  ["tool", "experiment", "resource", "module"].forEach((key) => {
    const id = params.get(key);
    if (!id) return;
    const safe = (window.CSS && CSS.escape) ? CSS.escape(id) : id.replace(/["\\]/g, "\\$&");
    const selectors = [
      '[data-id="' + safe + '"]',
      '[data-' + key + '-id="' + safe + '"]',
      '[data-item-id="' + safe + '"]',
      "#" + key + "-" + safe,
      "#card-" + safe,
    ].join(",");

    waitFor(
      () => document.querySelector(selectors),
      (card) => {
        card.classList.add("is-selected");
        if (!card.hasAttribute("tabindex")) card.setAttribute("tabindex", "-1");
        card.scrollIntoView({ behavior: "smooth", block: "center" });
        card.focus({ preventScroll: true });
      }
    );
  });
})();