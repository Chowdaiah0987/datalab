/* Sign-in state for every page.
   - Reads the session and role from /api/auth/me (the server is the only source of truth).
   - Home header: the original Login link / Account dropdown, unchanged.
   - Every other page: Login (guest) or a Viewer / Admin badge under the profile name, plus one
     compact dropdown opened from the profile photo, name or badge.
   - Hides elements marked data-admin-only unless the server confirms Admin.
   - Server-side API authorization remains authoritative; nothing here grants access.
*/
(function () {
  "use strict";

  const root = document.documentElement;
  const nativeFetch = window.fetch.bind(window);
  const GUEST = Object.freeze({ authenticated: false, role: "user", name: "", email: "" });
  const MENU_ID = "dslProfileMenu";

  let session = null;       // null until /api/auth/me has answered
  let ui = null;            // the open/close controller of the dropdown currently on the page
  let loggingOut = false;

  /* ---------- sessionStorage helpers (cache for styling only, never for authorization) ---------- */
  const read = (key) => {
    try { return sessionStorage.getItem(key) || ""; }
    catch (error) { return ""; }
  };
  const write = (key, value) => {
    try { sessionStorage.setItem(key, value); }
    catch (error) { /* Optional */ }
  };
  const remove = (key) => {
    try { sessionStorage.removeItem(key); }
    catch (error) { /* Optional */ }
  };

  // A cached "admin" is never trusted before the server answers.
  if (read("dslRole") === "user") root.dataset.role = "user";

  /* ---------- Session parsing ---------- */
  const clean = (value) => (typeof value === "string" ? value.trim().slice(0, 200) : "");

  function normalizeSession(data) {
    if (!data || typeof data !== "object" || data.authenticated !== true) return GUEST;
    return {
      authenticated: true,
      role: data.role === "admin" ? "admin" : "user",
      name: clean(data.name),
      email: clean(data.email)
    };
  }

  async function fetchSession() {
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), 8000) : 0;
    try {
      const response = await nativeFetch("/api/auth/me", {
        credentials: "same-origin",
        cache: "no-store",
        signal: controller ? controller.signal : undefined
      });
      if (!response.ok) return GUEST;           // 401 and every other failure: not signed in
      return normalizeSession(await response.json());
    } catch (error) {
      return GUEST;                             // network error or malformed JSON: safe view-only mode
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /* ---------- Login URL (keeps the current path and query, never loops) ---------- */
  function loginUrl() {
    const path = location.pathname.replace(/^\/+/, "");
    if (!path || /(^|\/)login\.html$/i.test(path)) return "login.html";
    return "login.html?next=" + encodeURIComponent(path + location.search);
  }

  /* ---------- Expired sessions: a 401 from any non-auth API drops the signed-in UI ---------- */
  window.fetch = async function (input, init) {
    const response = await nativeFetch(input, init);
    try {
      const url = typeof input === "string" ? input : (input && input.url) || String(input);
      if (response.status === 401 && /\/api\//.test(url) && !/\/api\/auth\//.test(url)) {
        write("dslRole", "");
        if (session && session.authenticated) {
          session = GUEST;
          applySession();
        }
      }
    } catch (error) {
      /* Ignore */
    }
    return response;
  };

  /* ---------- Logout ---------- */
  async function logout(button, message) {
    if (loggingOut) return;
    loggingOut = true;
    if (button) { button.disabled = true; button.textContent = "Logging out\u2026"; }
    if (message) message.textContent = "";

    try {
      const response = await nativeFetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin"
      });
      // A 401 means the session was already gone; anything else that is not ok means it may still be active.
      if (!response.ok && response.status !== 401) throw new Error("logout failed");
    } catch (error) {
      loggingOut = false;
      if (button) { button.disabled = false; button.textContent = "Logout"; }
      if (message) message.textContent = "Could not log out. Please try again.";
      return;
    }

    ["dslRole", "dslName", "dsLabProfileHeaderCache"].forEach(remove);
    location.replace("home.html");
  }

  /* ---------- Role visibility ---------- */
  function applyRoleVisibility(isAdmin) {
    document.querySelectorAll("[data-admin-only]").forEach((element) => {
      element.hidden = !isAdmin;
    });
    root.dataset.role = isAdmin ? "admin" : "user";
    root.dataset.auth = !session || !session.authenticated ? "guest" : isAdmin ? "admin" : "user";
  }

  /* ---------- Header lookups and route detection ---------- */
  const getHeader = () => document.querySelector(".dsl-header");
  const controlsSlot = () => document.querySelector(".dsl-controls") || document.querySelector(".dsl-right");

  function isHomePath() {
    const page = location.pathname.split("/").pop().toLowerCase();
    return page === "" || page === "home.html";
  }

  // header.js normally sets these classes; this only fills them in if a page forgot to.
  function ensureRouteClass(header) {
    if (header.classList.contains("dsl-header--home") || header.classList.contains("dsl-header--inner")) return;
    const home = isHomePath();
    header.classList.add(home ? "dsl-header--home" : "dsl-header--inner");
    root.classList.toggle("dsl-inner", !home);
  }

  const routeVariant = (header) => (header.classList.contains("dsl-header--home") ? "home" : "inner");

  /* ---------- Small DOM helper (user data only ever goes in through textContent) ---------- */
  function el(tag, props, children) {
    const node = document.createElement(tag);
    Object.entries(props || {}).forEach(([key, value]) => {
      if (key === "text") node.textContent = value;
      else if (key === "className") node.className = value;
      else if (key === "dataset") Object.assign(node.dataset, value);
      else node.setAttribute(key, value);
    });
    (children || []).forEach((child) => node.append(child));
    return node;
  }

  function placeControls(slot, nodes) {
    if (slot.classList.contains("dsl-controls")) slot.append(...nodes);
    else slot.prepend(...nodes);
  }

  function openEditIdCard() {
    // Existing behaviour: use the on-page button when present, otherwise the existing route.
    const real = document.getElementById("editIdBtn");
    if (real) real.click();
    else location.href = "index.html?editProfile=1";
  }

  /* ---------- Rendering ---------- */
  function clearControls(header) {
    header.querySelectorAll("[data-ctl]").forEach((node) => node.remove());
    header.querySelectorAll(".dsl-menu").forEach((node) => node.remove());
    ui = null;
  }

  function renderGuest(slot, variant) {
    const link = el("a", {
      className: "dsl-account dsl-account__login",
      href: loginUrl(),
      text: "Login",
      dataset: { ctl: variant }
    });
    placeControls(slot, [link]);
  }

  // Home: the original Account dropdown, unchanged in markup and behaviour.
  function renderHome(slot) {
    const isAdmin = session.role === "admin";

    const trigger = el("button", {
      type: "button",
      className: "dsl-account__btn",
      "aria-haspopup": "true",
      "aria-expanded": "false"
    }, [
      el("span", { className: "dsl-account__badge", text: isAdmin ? "Admin" : "Viewer" }),
      el("span", { className: "dsl-account__label", text: "Account" })
    ]);

    const logoutButton = el("button", { type: "button", className: "is-primary", role: "menuitem", text: "Logout" });
    const message = el("p", { className: "dsl-menu__msg", role: "status" });
    const items = [
      el("p", { className: "dsl-account__who", text: "Signed in as" }),
      el("p", { className: "dsl-account__name", text: isAdmin ? "Administrator" : session.name || "Normal User" })
    ];
    if (isAdmin) {
      const edit = el("button", { type: "button", role: "menuitem", text: "Edit ID card" });
      edit.addEventListener("click", () => { ui && ui.close(); openEditIdCard(); });
      items.push(edit);
    }
    items.push(logoutButton, message);

    const menu = el("div", { className: "dsl-account__menu", role: "menu", hidden: "" }, items);
    const wrap = el("div", { className: "dsl-account", dataset: { ctl: "home" } }, [trigger, menu]);

    logoutButton.addEventListener("click", () => logout(logoutButton, message));

    const setOpen = (open) => {
      menu.hidden = !open;
      trigger.setAttribute("aria-expanded", String(open));
    };
    ui = {
      menuSelector: ".dsl-account__menu",
      triggerSelector: ".dsl-account__btn",
      toggle: () => setOpen(menu.hidden),
      close: () => setOpen(false),
      isOpen: () => !menu.hidden,
      focusTarget: () => trigger,
      capture: false
    };
    placeControls(slot, [wrap]);
  }

  // Non-Home: role badge under the name, one compact dropdown shared by photo, name and badge.
  function renderInner(header, slot) {
    const isAdmin = session.role === "admin";

    const badge = el("button", {
      type: "button",
      className: "dsl-role dsl-role--" + (isAdmin ? "admin" : "viewer"),
      text: isAdmin ? "Admin" : "Viewer",
      "aria-haspopup": "true",
      "aria-expanded": "false",
      "aria-controls": MENU_ID,
      "aria-label": (isAdmin ? "Admin" : "Viewer") + " account menu",
      dataset: { ctl: "inner" }
    });

    const logoutButton = el("button", { type: "button", className: "dsl-menu__btn dsl-menu__btn--primary", text: "Logout" });
    const message = el("p", { className: "dsl-menu__msg", role: "status" });
    const who = el("div", { className: "dsl-menu__who" }, [
      el("p", { className: "dsl-menu__label", text: "Signed in as" }),
      el("p", { className: "dsl-menu__value", text: isAdmin ? "Administrator" : session.email || "Viewer" })
    ]);

    const children = [who];
    if (isAdmin) {
      const edit = el("button", { type: "button", className: "dsl-menu__btn", text: "Edit ID Card" });
      edit.addEventListener("click", () => { ui && ui.close(); openEditIdCard(); });
      children.push(edit);
    }
    children.push(logoutButton, message);
    logoutButton.addEventListener("click", () => logout(logoutButton, message));

    const menu = el("div", { id: MENU_ID, className: "dsl-menu", role: "region", "aria-label": "Account", hidden: "" }, children);

    const triggers = () => header.querySelectorAll(".dsl-profile, .dsl-role");
    let lastTrigger = badge;
    const setOpen = (open) => {
      menu.hidden = !open;
      triggers().forEach((node) => node.setAttribute("aria-expanded", String(open)));
    };
    ui = {
      menuSelector: ".dsl-menu",
      triggerSelector: ".dsl-userarea", // the whole pill: photo, name, badge and padding
      toggle: (source) => { if (source) lastTrigger = source; setOpen(menu.hidden); },
      close: () => setOpen(false),
      isOpen: () => !menu.hidden,
      focusTarget: () => lastTrigger,
      capture: true // one owner for profile clicks, so no other handler fires alongside the dropdown
    };

    placeControls(slot, [badge]);
    (slot.closest(".dsl-userarea") || slot.parentElement).append(menu);
  }

  function render(header, slot, variant) {
    clearControls(header);
    if (!session.authenticated) renderGuest(slot, variant);
    else if (variant === "home") renderHome(slot);
    else renderInner(header, slot);
  }

  // Expose the profile pill to assistive tech. The photo and name (ID card) are never touched here.
  function syncProfile(header, variant) {
    const profile = header.querySelector(".dsl-profile");
    if (!profile) return;

    const interactive = session.authenticated && variant === "inner";
    if (interactive) {
      profile.setAttribute("aria-haspopup", "true");
      profile.setAttribute("aria-controls", MENU_ID);
      profile.setAttribute("aria-expanded", String(!!(ui && ui.isOpen())));
    } else {
      ["aria-haspopup", "aria-controls", "aria-expanded"].forEach((name) => profile.removeAttribute(name));
    }
  }

  // Idempotent: safe to call from the observer on every change. Builds exactly one set of controls.
  function ensure() {
    if (!session) return;
    const header = getHeader();
    const slot = controlsSlot();
    if (!header || !slot) return;

    ensureRouteClass(header);
    const variant = routeVariant(header);
    const built = header.querySelectorAll("[data-ctl]");
    const upToDate = built.length === 1 && built[0].dataset.ctl === variant;
    if (!upToDate) render(header, slot, variant);
    syncProfile(header, variant);
  }

  function applySession() {
    applyRoleVisibility(!!session && session.authenticated && session.role === "admin");
    ensure();
  }

  /* ---------- Click and keyboard handling (one listener for every header variant) ---------- */
  document.addEventListener("click", (event) => {
    if (!ui || !(event.target instanceof Element)) return;
    const target = event.target;

    if (target.closest(ui.menuSelector)) return; // clicks inside the menu never toggle it

    const trigger = target.closest(ui.triggerSelector);
    if (trigger) {
      event.preventDefault();
      if (ui.capture) event.stopPropagation();
      ui.toggle(trigger);
      return;
    }
    ui.close();
  }, true);

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !ui || !ui.isOpen()) return;
    ui.close();
    const target = ui.focusTarget();
    if (target && target.focus) target.focus();
  });

  /* ---------- Dynamic headers and route changes ---------- */
  function observe() {
    let queued = false;
    const schedule = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; ensure(); });
    };
    new MutationObserver(schedule).observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class"]
    });
  }

  /* ---------- Start ---------- */
  async function init() {
    // Hide privileged controls immediately to avoid a flash before the server answers.
    applyRoleVisibility(false);
    observe();

    session = await fetchSession();
    write("dslRole", session.authenticated ? session.role : "");
    write("dslName", session.name || "");
    applySession();

    if (!(session.authenticated && session.role === "admin")) {
      const url = new URL(location.href);
      if (url.searchParams.has("action") || url.searchParams.has("editProfile")) {
        url.searchParams.delete("action");
        url.searchParams.delete("editProfile");
        history.replaceState(null, "", url.pathname + url.search + url.hash);
      }
    }
  }

  init();
})();