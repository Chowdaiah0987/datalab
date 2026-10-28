
/* Sign-in state for every page.
   - Reads the session and role from /api/auth/me (server is the source of truth).
   - Home: Login for guests; Viewer / Admin role-only button for signed-in users.
   - Other pages: Login for guests or Viewer / Admin badge under the profile name.
   - Hides elements marked data-admin-only unless the server confirms Admin.
   - Server-side API authorization remains authoritative.
*/

(function () {
  "use strict";

  const root = document.documentElement;
  const nativeFetch = window.fetch.bind(window);
  const GUEST = Object.freeze({
    authenticated: false,
    role: "user",
    name: "",
    email: ""
  });
  const MENU_ID = "dslProfileMenu";

  let session = null;
  let ui = null;
  let loggingOut = false;

  /* ---------- sessionStorage helpers ---------- */

  const read = (key) => {
    try {
      return sessionStorage.getItem(key) || "";
    } catch (error) {
      return "";
    }
  };

  const write = (key, value) => {
    try {
      sessionStorage.setItem(key, value);
    } catch (error) {
      // Storage is optional.
    }
  };

  const remove = (key) => {
    try {
      sessionStorage.removeItem(key);
    } catch (error) {
      // Storage is optional.
    }
  };

  // A cached role is used only for styling, never for authorization.
  if (read("dslRole") === "user") {
    root.dataset.role = "user";
  }

  /* ---------- Session parsing ---------- */

  const clean = (value) =>
    typeof value === "string" ? value.trim().slice(0, 200) : "";

  function normalizeSession(data) {
    if (
      !data ||
      typeof data !== "object" ||
      data.authenticated !== true
    ) {
      return GUEST;
    }

    return {
      authenticated: true,
      role: data.role === "admin" ? "admin" : "user",
      name: clean(data.name),
      email: clean(data.email)
    };
  }

  async function fetchSession() {
    const controller =
      typeof AbortController === "function"
        ? new AbortController()
        : null;

    const timer = controller
      ? setTimeout(() => controller.abort(), 8000)
      : 0;

    try {
      const response = await nativeFetch("/api/auth/me", {
        credentials: "same-origin",
        cache: "no-store",
        signal: controller ? controller.signal : undefined
      });

      if (!response.ok) return GUEST;

      return normalizeSession(await response.json());
    } catch (error) {
      return GUEST;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /* ---------- Login URL ---------- */

  function loginUrl() {
    const path = location.pathname.replace(/^\/+/, "");

    if (!path || /(^|\/)login\.html$/i.test(path)) {
      return "login.html";
    }

    return (
      "login.html?next=" +
      encodeURIComponent(path + location.search)
    );
  }

  /* ---------- Expired sessions ---------- */

  window.fetch = async function (input, init) {
    const response = await nativeFetch(input, init);

    try {
      const url =
        typeof input === "string"
          ? input
          : (input && input.url) || String(input);

      if (
        response.status === 401 &&
        /\/api\//.test(url) &&
        !/\/api\/auth\//.test(url)
      ) {
        write("dslRole", "");

        if (session && session.authenticated) {
          session = GUEST;
          applySession();
        }
      }
    } catch (error) {
      // Ignore errors while checking the response URL.
    }

    return response;
  };

  /* ---------- Logout ---------- */

  async function logout(button, message) {
    if (loggingOut) return;

    loggingOut = true;

    if (button) {
      button.disabled = true;
      button.textContent = "Logging out…";
    }

    if (message) message.textContent = "";

    try {
      const response = await nativeFetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin"
      });

      // A 401 means the session was already gone.
      if (!response.ok && response.status !== 401) {
        throw new Error("Logout failed");
      }
    } catch (error) {
      loggingOut = false;

      if (button) {
        button.disabled = false;
        button.textContent = "Logout";
      }

      if (message) {
        message.textContent =
          "Could not log out. Please try again.";
      }

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

    root.dataset.auth =
      !session || !session.authenticated
        ? "guest"
        : isAdmin
          ? "admin"
          : "user";
  }

  /* ---------- Header lookups and route detection ---------- */

  const getHeader = () => document.querySelector(".dsl-header");

  const controlsSlot = () =>
    document.querySelector(".dsl-controls") ||
    document.querySelector(".dsl-right");

  function isHomePath() {
    const page = location.pathname.split("/").pop().toLowerCase();
    return page === "" || page === "home.html";
  }

  // header.js normally sets these classes.
  function ensureRouteClass(header) {
    if (
      header.classList.contains("dsl-header--home") ||
      header.classList.contains("dsl-header--inner")
    ) {
      return;
    }

    header.classList.add(isHomePath() ? "dsl-header--home" : "dsl-header--inner");

    if (!isHomePath()) {
      root.classList.add("dsl-inner");
    }
  }

  const routeVariant = (header) =>
    header.classList.contains("dsl-header--home") ? "home" : "inner";

  /* ---------- DOM helper ---------- */

  function el(tag, props, children) {
    const node = document.createElement(tag);

    Object.entries(props || {}).forEach(([key, value]) => {
      if (key === "text") {
        node.textContent = value;
      } else if (key === "className") {
        node.className = value;
      } else if (key === "dataset") {
        Object.assign(node.dataset, value);
      } else {
        node.setAttribute(key, value);
      }
    });

    (children || []).forEach((child) => node.append(child));

    return node;
  }

  function placeControls(slot, nodes) {
    if (slot.classList.contains("dsl-controls")) {
      slot.append(...nodes);
    } else {
      slot.prepend(...nodes);
    }
  }

  function openEditIdCard() {
    const real = document.getElementById("editIdBtn") || document.getElementById("homeEditIdBtn");

    if (real) {
      real.click();
    } else {
      location.href = "index.html?editProfile=1";
    }
  }

  /* ---------- Rendering ---------- */

  function clearControls(header) {
    header.querySelectorAll("[data-ctl]").forEach((node) => node.remove());
    header.querySelectorAll(".dsl-menu").forEach((node) => node.remove());
    ui = null;
  }

  /* Guests see Login on Home and every other page. */
  function renderGuest(slot, variant) {
    const link = el("a", {
      className: "dsl-account dsl-account__login",
      href: loginUrl(),
      text: "Login",
      dataset: { ctl: variant }
    });

    placeControls(slot, [link]);
  }

  /*
   * SIGNED-IN CONTROLS (Home and inner pages):
   * Home shows only the Viewer / Admin button (no profile pill); inner pages keep the
   * profile pill. On both, the Viewer / Admin button opens the same compact dropdown
   * (Logout, plus Edit ID Card for Admin).
   */
  function renderInner(header, slot, home) {
    const isAdmin = session.role === "admin";

    const badge = el("button", {
      type: "button",
      className: home
        ? "dsl-home-role dsl-home-role--" + (isAdmin ? "admin" : "viewer")
        : "dsl-role dsl-role--" + (isAdmin ? "admin" : "viewer"),
      text: isAdmin ? "Admin" : "Viewer",
      "aria-haspopup": "true",
      "aria-expanded": "false",
      "aria-controls": MENU_ID,
      "aria-label":
        (isAdmin ? "Admin" : "Viewer") + " account menu",
      dataset: { ctl: home ? "home" : "inner" }
    });

    const logoutButton = el("button", {
      type: "button",
      className: "dsl-menu__btn dsl-menu__btn--primary",
      text: "Logout"
    });

    const message = el("p", {
      className: "dsl-menu__msg",
      role: "status"
    });

    const who = el(
      "div",
      { className: "dsl-menu__who" },
      [
        el("p", {
          className: "dsl-menu__label",
          text: "Signed in as"
        }),
        el("p", {
          className: "dsl-menu__value",
          text: isAdmin
            ? "Administrator"
            : session.email || "Viewer"
        })
      ]
    );

    const children = [who];

    if (isAdmin) {
      const edit = el("button", {
        type: "button",
        className: "dsl-menu__btn",
        text: "Edit ID Card"
      });

      edit.addEventListener("click", () => {
        if (ui) ui.close();
        openEditIdCard();
      });

      children.push(edit);
    }

    children.push(logoutButton, message);

    logoutButton.addEventListener("click", () => {
      logout(logoutButton, message);
    });

    const menu = el("div", {
      id: MENU_ID,
      className: home ? "dsl-menu dsl-menu--home" : "dsl-menu",
      role: "region",
      "aria-label": "Account",
      hidden: ""
    }, children);

    const triggers = () =>
      header.querySelectorAll(".dsl-profile, .dsl-role, .dsl-home-role");

    let lastTrigger = badge;

    const setOpen = (open) => {
      menu.hidden = !open;

      triggers().forEach((node) => {
        node.setAttribute("aria-expanded", String(open));
      });
    };

    ui = {
      menuSelector: ".dsl-menu",
      triggerSelector: ".dsl-userarea",
      toggle: (source) => {
        if (source) lastTrigger = source;
        setOpen(menu.hidden);
      },
      close: () => setOpen(false),
      isOpen: () => !menu.hidden,
      focusTarget: () => lastTrigger,
      capture: true
    };

    placeControls(slot, [badge]);

    (slot.closest(".dsl-userarea") || slot.parentElement).append(menu);
  }

  function render(header, slot, variant) {
    clearControls(header);

    if (!session.authenticated) {
      renderGuest(slot, variant);
    } else {
      renderInner(header, slot, variant === "home");
    }
  }

  /* ---------- Profile accessibility ---------- */

  function syncProfile(header, variant) {
    const profile = header.querySelector(".dsl-profile");

    if (!profile) return;

    const interactive =
      session.authenticated && variant === "inner";

    if (interactive) {
      profile.setAttribute("aria-haspopup", "true");
      profile.setAttribute("aria-controls", MENU_ID);
      profile.setAttribute(
        "aria-expanded",
        String(!!(ui && ui.isOpen()))
      );
    } else {
      [
        "aria-haspopup",
        "aria-controls",
        "aria-expanded"
      ].forEach((name) => profile.removeAttribute(name));
    }
  }

  /* ---------- Keep controls in sync ---------- */

  function ensure() {
    if (!session) return;

    const header = getHeader();
    const slot = controlsSlot();

    if (!header || !slot) return;

    ensureRouteClass(header);

    const variant = routeVariant(header);
    const built = header.querySelectorAll("[data-ctl]");

    const upToDate =
      built.length === 1 &&
      built[0].dataset.ctl === variant;

    if (!upToDate) {
      render(header, slot, variant);
    }

    syncProfile(header, variant);
  }

  function applySession() {
    applyRoleVisibility(
      !!session &&
      session.authenticated &&
      session.role === "admin"
    );

    ensure();
  }

  /* ---------- Click and keyboard handling ---------- */

  document.addEventListener("click", (event) => {
    if (!ui || !(event.target instanceof Element)) return;

    const target = event.target;

    if (target.closest(ui.menuSelector)) return;

    const trigger = target.closest(ui.triggerSelector);

    if (trigger) {
      event.preventDefault();

      if (ui.capture) {
        event.stopPropagation();
      }

      ui.toggle(trigger);
      return;
    }

    ui.close();
  }, true);

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !ui || !ui.isOpen()) return;

    ui.close();

    const target = ui.focusTarget();

    if (target && target.focus) {
      target.focus();
    }
  });

  /* ---------- Dynamic headers and route changes ---------- */

  function observe() {
    let queued = false;

    const schedule = () => {
      if (queued) return;

      queued = true;

      requestAnimationFrame(() => {
        queued = false;
        ensure();
      });
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
    // Hide privileged controls until the server confirms the session.
    applyRoleVisibility(false);
    observe();

    session = await fetchSession();

    write("dslRole", session.authenticated ? session.role : "");
    write("dslName", session.name || "");

    applySession();

    if (
      !(session.authenticated && session.role === "admin")
    ) {
      const url = new URL(location.href);

      if (
        url.searchParams.has("action") ||
        url.searchParams.has("editProfile")
      ) {
        url.searchParams.delete("action");
        url.searchParams.delete("editProfile");

        history.replaceState(
          null,
          "",
          url.pathname + url.search + url.hash
        );
      }
    }
  }

  init();
})();
