let openCardMenu = null;

function closeOpenCardMenu() {
  if (!openCardMenu) return;
  openCardMenu.querySelector(".card-menu__items").hidden = true;
  openCardMenu.querySelector(".card-menu__toggle").setAttribute("aria-expanded", "false");
  openCardMenu = null;
}

document.addEventListener("click", (event) => {
  if (openCardMenu && !openCardMenu.contains(event.target)) {
    closeOpenCardMenu();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeOpenCardMenu();
});

function createCardMenu(onEdit, onDelete, options = {}) {
  const wrapper = document.createElement("div");
  wrapper.className = "card-menu";
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "card-menu__toggle";
  toggle.textContent = "⋮";
  toggle.setAttribute("aria-label", "Card actions");
  toggle.setAttribute("aria-expanded", "false");
  const menu = document.createElement("div");
  menu.className = "card-menu__items";
  menu.hidden = true;
  const edit = document.createElement("button");
  edit.type = "button";
  edit.textContent = options.editLabel || "✎ Edit";
  const actions = (options.actions || []).map(({ label, onClick }) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.addEventListener("click", () => {
      menu.hidden = true;
      closeOpenCardMenu();
      onClick();
    });
    return button;
  });
  const remove = document.createElement("button");
  remove.type = "button";
  remove.textContent = options.deleteLabel || "Delete";
  remove.className = "card-menu__delete";
  menu.append(edit, ...actions, remove);
  wrapper.append(toggle, menu);

  toggle.addEventListener("click", (event) => {
    event.stopPropagation();
    if (openCardMenu && openCardMenu !== wrapper) closeOpenCardMenu();
    const shouldOpen = menu.hidden;
    menu.hidden = !shouldOpen;
    toggle.setAttribute("aria-expanded", String(shouldOpen));
    openCardMenu = shouldOpen ? wrapper : null;
  });
  edit.addEventListener("click", () => {
    menu.hidden = true;
    closeOpenCardMenu();
    onEdit();
  });
  remove.addEventListener("click", () => {
    menu.hidden = true;
    closeOpenCardMenu();
    onDelete();
  });
  return wrapper;
}
