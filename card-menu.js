/* =========================================================
   Card three-dot menu for the Modules / Tools / Resources lists.
   createCardMenu(onEdit, onDelete, options) returns the .card-menu element.
     options.editLabel   text of the first item     (default "✎ Edit")
     options.deleteLabel text of the last item      (default "Delete")
     options.actions     [{ label, onClick }] extra items between them
   (The Home page's own menu lives in home-card-menu.js.)
   ========================================================= */
(function () {
  "use strict";
  if (window.__dslCardMenu) return;
  window.__dslCardMenu = true;

  let openMenu = null;

  function closeMenu() {
    if (!openMenu) return;
    openMenu.querySelector(".card-menu__items").hidden = true;
    openMenu.querySelector(".card-menu__toggle").setAttribute("aria-expanded", "false");
    openMenu = null;
  }

  document.addEventListener("click", (event) => {
    if (openMenu && !openMenu.contains(event.target)) closeMenu();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && openMenu) {
      const toggle = openMenu.querySelector(".card-menu__toggle");
      closeMenu();
      toggle.focus();
    }
  });

  window.createCardMenu = function createCardMenu(onEdit, onDelete, options = {}) {
    const wrapper = document.createElement("div");
    wrapper.className = "card-menu";

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "card-menu__toggle";
    toggle.textContent = "⋮";
    toggle.setAttribute("aria-label", "Card actions");
    toggle.setAttribute("aria-haspopup", "true");
    toggle.setAttribute("aria-expanded", "false");

    const menu = document.createElement("div");
    menu.className = "card-menu__items";
    menu.hidden = true;

    const item = (text, className, handler) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = text;
      if (className) button.className = className;
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        closeMenu();
        handler();
      });
      return button;
    };

    const extra = (options.actions || []).map(({ label, onClick }) => item(label, "", onClick));
    menu.append(
      item(options.editLabel || "✎ Edit", "", onEdit),
      ...extra,
      item(options.deleteLabel || "Delete", "card-menu__delete", onDelete)
    );
    wrapper.append(toggle, menu);

    toggle.addEventListener("click", (event) => {
      event.stopPropagation();
      if (openMenu && openMenu !== wrapper) closeMenu();
      const willOpen = menu.hidden;
      menu.hidden = !willOpen;
      toggle.setAttribute("aria-expanded", String(willOpen));
      openMenu = willOpen ? wrapper : null;
    });

    return wrapper;
  };
})();
