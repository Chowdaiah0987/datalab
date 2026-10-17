/* =========================================================
   HOME PAGE — card three-dot menus (home-card-menu.js)
   Separate from card-menu.js, which provides createCardMenu() for the Modules/Tools/Resources lists.
   Works with the markup in home.html:
     .home-card > .home-card__menu[data-menu-kind]
       > .home-card__menu-trigger
       > .home-card__dropdown > button[data-card-action="edit" | "reset"]

   Edit Card Text  -> opens a dialog to change the card label, title and description.
   Reset Text      -> restores the original text from the page.
   Edited text is saved in this browser (localStorage).
   ========================================================= */
(function () {
  "use strict";

  if (window.__dslHomeCardMenu) return; // never bind twice
  window.__dslHomeCardMenu = true;

  const STORAGE_KEY = "dsLabHomeCardText.v1";
  const LIMITS = { label: 40, title: 40, desc: 300 };

  /* ---------- storage ---------- */
  function readSaved() {
    try {
      const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      return data && typeof data === "object" && !Array.isArray(data) ? data : {};
    } catch (error) {
      return {};
    }
  }

  function writeSaved(data) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      return true;
    } catch (error) {
      console.warn("Could not save the card text in this browser:", error);
      return false;
    }
  }

  /* ---------- card helpers ---------- */
  const defaults = {}; // original text per card, captured before any saved edits are applied

  function cardParts(card) {
    return {
      label: card.querySelector(".home-card__cover-copy span"),
      title: card.querySelector(".home-card__cover-copy strong"),
      heading: card.querySelector(".home-card__body h2"), // hidden, kept in sync for screen readers
      desc: card.querySelector(".home-card__body > p:not(.home-card__count)"),
    };
  }

  function cardKey(card) {
    const menu = card.querySelector(".home-card__menu");
    return menu && menu.dataset.menuKind ? menu.dataset.menuKind : "";
  }

  function readText(card) {
    const p = cardParts(card);
    return {
      label: p.label ? p.label.textContent.trim() : "",
      title: p.title ? p.title.textContent.trim() : "",
      desc: p.desc ? p.desc.textContent.replace(/\s+/g, " ").trim() : "",
    };
  }

  function applyText(card, text) {
    const p = cardParts(card);
    if (p.label) p.label.textContent = text.label;
    if (p.title) p.title.textContent = text.title;
    if (p.heading) p.heading.textContent = text.title;
    if (p.desc) p.desc.textContent = text.desc;
  }

  function applySaved() {
    const saved = readSaved();
    document.querySelectorAll(".home-card").forEach((card) => {
      const key = cardKey(card);
      if (!key) return;
      if (!defaults[key]) defaults[key] = readText(card);
      const s = saved[key];
      if (s && typeof s === "object") {
        applyText(card, {
          label: typeof s.label === "string" && s.label ? s.label : defaults[key].label,
          title: typeof s.title === "string" && s.title ? s.title : defaults[key].title,
          desc: typeof s.desc === "string" && s.desc ? s.desc : defaults[key].desc,
        });
      }
    });
  }

  /* ---------- toast (uses .toast from style.css) ---------- */
  let toastTimer = null;
  function toast(message, isError) {
    let el = document.getElementById("cardMenuToast");
    if (!el) {
      el = document.createElement("div");
      el.id = "cardMenuToast";
      el.className = "toast";
      el.setAttribute("role", "status");
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.classList.toggle("toast--error", Boolean(isError));
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
  }

  /* ---------- menu open / close ---------- */
  function setMenu(menu, open) {
    const trigger = menu.querySelector(".home-card__menu-trigger");
    const dropdown = menu.querySelector(".home-card__dropdown");
    if (!trigger || !dropdown) return;
    dropdown.hidden = !open;
    trigger.setAttribute("aria-expanded", String(open));
    const card = menu.closest(".home-card");
    if (card) card.classList.toggle("is-menu-open", open);
  }

  function closeAllMenus() {
    document.querySelectorAll(".home-card__menu").forEach((menu) => setMenu(menu, false));
  }

  function prepareMenus() {
    document.querySelectorAll(".home-card__menu").forEach((menu) => {
      const trigger = menu.querySelector(".home-card__menu-trigger");
      if (trigger) {
        trigger.type = "button";
        trigger.setAttribute("aria-haspopup", "true");
      }
      menu.querySelectorAll(".home-card__dropdown button").forEach((b) => { b.type = "button"; });
      setMenu(menu, false);
    });
  }

  /* ---------- edit dialog (uses .modal / .field / .btn from style.css) ---------- */
  function openEditDialog(card) {
    if (document.getElementById("cardEditModal")) return;

    const key = cardKey(card);
    const current = readText(card);
    const opener = document.activeElement;

    const modal = document.createElement("div");
    modal.className = "modal";
    modal.id = "cardEditModal";
    modal.innerHTML = `
      <div class="modal__backdrop" data-close></div>
      <form class="modal__panel" role="dialog" aria-modal="true" aria-labelledby="cardEditTitle" novalidate>
        <h2 id="cardEditTitle">Edit card text</h2>
        <label class="field"><span>Label</span>
          <input type="text" name="label" maxlength="${LIMITS.label}"></label>
        <label class="field"><span>Title</span>
          <input type="text" name="title" maxlength="${LIMITS.title}" required></label>
        <label class="field"><span>Description</span>
          <textarea name="desc" rows="4" maxlength="${LIMITS.desc}"></textarea></label>
        <p class="error" role="alert"></p>
        <div class="modal__actions">
          <button type="button" class="btn btn--ghost" data-close>Cancel</button>
          <button type="submit" class="btn btn--primary">Save</button>
        </div>
      </form>`;
    document.body.appendChild(modal);

    const form = modal.querySelector("form");
    const error = modal.querySelector(".error");
    form.elements.label.value = current.label;
    form.elements.title.value = current.title;
    form.elements.desc.value = current.desc;

    const onKey = (e) => { if (e.key === "Escape") close(); };
    function close() {
      document.removeEventListener("keydown", onKey);
      modal.remove();
      if (opener && typeof opener.focus === "function") opener.focus();
    }
    document.addEventListener("keydown", onKey);

    modal.querySelectorAll("[data-close]").forEach((el) => el.addEventListener("click", close));

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const next = {
        label: form.elements.label.value.trim(),
        title: form.elements.title.value.trim(),
        desc: form.elements.desc.value.replace(/\s+/g, " ").trim(),
      };
      if (!next.title) {
        error.textContent = "Please enter a title.";
        form.elements.title.focus();
        return;
      }
      // An emptied label or description falls back to the original text.
      const base = defaults[key] || current;
      next.label = next.label || base.label;
      next.desc = next.desc || base.desc;

      applyText(card, next);
      const saved = readSaved();
      saved[key] = next;
      const ok = writeSaved(saved);
      close();
      toast(ok ? "Card text updated." : "Updated, but it could not be saved in this browser.", !ok);
    });

    form.elements.title.focus();
    form.elements.title.select();
  }

  function resetCard(card) {
    const key = cardKey(card);
    if (!key || !defaults[key]) return;
    applyText(card, defaults[key]);
    const saved = readSaved();
    delete saved[key];
    writeSaved(saved);
    toast("Card text reset.");
  }

  function runAction(item) {
    const card = item.closest(".home-card");
    if (!card) return;
    const action = item.dataset.cardAction;
    if (action === "edit") openEditDialog(card);
    else if (action === "reset") resetCard(card);
  }

  /* ---------- events ---------- */
  document.addEventListener("click", (event) => {
    const trigger = event.target.closest(".home-card__menu-trigger");
    if (trigger) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation(); // other scripts must not toggle the same menu a second time
      const menu = trigger.closest(".home-card__menu");
      const dropdown = menu && menu.querySelector(".home-card__dropdown");
      if (!dropdown) return;
      const willOpen = dropdown.hidden;
      closeAllMenus();
      setMenu(menu, willOpen);
      if (willOpen && event.detail === 0) {
        const first = dropdown.querySelector("button");
        if (first) first.focus(); // opened with the keyboard
      }
      return;
    }

    const item = event.target.closest(".home-card__dropdown button");
    if (item) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      closeAllMenus();
      runAction(item);
      return;
    }

    if (!event.target.closest(".home-card__menu")) closeAllMenus();
  }, true); // capture phase: runs before any other click handler on the page

  document.addEventListener("keydown", (event) => {
    const open = document.querySelector(".home-card__dropdown:not([hidden])");
    if (!open) return;
    const menu = open.closest(".home-card__menu");

    if (event.key === "Escape") {
      closeAllMenus();
      const trigger = menu && menu.querySelector(".home-card__menu-trigger");
      if (trigger) trigger.focus();
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      const items = Array.from(open.querySelectorAll("button"));
      if (!items.length) return;
      event.preventDefault();
      const i = items.indexOf(document.activeElement);
      const next = event.key === "ArrowDown" ? (i + 1) % items.length : (i <= 0 ? items.length - 1 : i - 1);
      items[next].focus();
    } else if (event.key === "Tab") {
      closeAllMenus();
    }
  });

  function init() {
    prepareMenus();
    applySaved();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();