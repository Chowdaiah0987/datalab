/* Sign-in state for every page.
   - Identifies Admin and Normal User roles using the server.
   - Adds Account / Logout to the header for signed-in users.
   - Shows Login for guests.
   - Hides elements marked data-admin-only unless the server confirms Admin.
   - Server-side API authorization remains authoritative.
*/
(function () {
  "use strict";

  const root = document.documentElement;
  const read = (key) => {
    try { return sessionStorage.getItem(key) || ""; }
    catch (error) { return ""; }
  };
  const write = (key, value) => {
    try { sessionStorage.setItem(key, value); }
    catch (error) { /* Optional */ }
  };

  if (read("dslRole")) root.dataset.role = read("dslRole");

  const loginUrl = () =>
    `login.html?next=${encodeURIComponent(location.pathname.replace(/^\//, "") + location.search)}`;

  const nativeFetch = window.fetch.bind(window);

  window.fetch = async function (input, init) {
    const response = await nativeFetch(input, init);
    try {
      const url = typeof input === "string" ? input : input.url;
      if (
        response.status === 401 &&
        /\/api\//.test(url) &&
        !/\/api\/auth\//.test(url)
      ) {
        write("dslRole", "");
      }
    } catch (error) {
      /* Ignore */
    }
    return response;
  };

  async function logout() {
    try {
      await nativeFetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin"
      });
    } catch (error) {
      /* Continue clearing local state */
    }

    ["dslRole", "dslName", "dsLabProfileHeaderCache"].forEach((key) => {
      try { sessionStorage.removeItem(key); }
      catch (error) { /* Ignore */ }
    });

    location.replace("home.html");
  }

  // Show admin-only elements only after the server has confirmed the role.
  function applyRoleVisibility(isAdmin) {
    document.querySelectorAll("[data-admin-only]").forEach((element) => {
      element.hidden = !isAdmin;
    });

    root.dataset.role = isAdmin ? "admin" : "user";
  }

  function buildAccount(role, name) {
    const header = document.querySelector(".dsl-right");
    if (!header || header.querySelector(".dsl-account")) return;

    const wrap = document.createElement("div");
    wrap.className = "dsl-account";

    const isAdmin = role === "admin";

    wrap.innerHTML = `
      <button type="button" class="dsl-account__btn"
        aria-haspopup="true" aria-expanded="false">
        <span class="dsl-account__badge"></span>
        <span class="dsl-account__label">Account</span>
      </button>
      <div class="dsl-account__menu" hidden role="menu">
        <p class="dsl-account__who">Signed in as</p>
        <p class="dsl-account__name"></p>
        ${isAdmin ? '<button type="button" data-edit-id role="menuitem">Edit ID card</button>' : ""}
        <button type="button" class="is-primary" data-logout role="menuitem">Logout</button>
      </div>`;

    wrap.querySelector(".dsl-account__badge").textContent =
      isAdmin ? "Admin" : "Viewer";

    wrap.querySelector(".dsl-account__name").textContent =
      isAdmin ? "Administrator" : name || "Normal User";

    const trigger = wrap.querySelector(".dsl-account__btn");
    const menu = wrap.querySelector(".dsl-account__menu");

    const setOpen = (open) => {
      menu.hidden = !open;
      trigger.setAttribute("aria-expanded", String(open));
    };

    trigger.addEventListener("click", (event) => {
      event.stopPropagation();
      setOpen(menu.hidden);
    });

    document.addEventListener("click", (event) => {
      if (!wrap.contains(event.target)) setOpen(false);
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") setOpen(false);
    });

    wrap.querySelector("[data-logout]").addEventListener("click", logout);

    const edit = wrap.querySelector("[data-edit-id]");
    if (edit) {
      edit.addEventListener("click", () => {
        setOpen(false);
        const real = document.getElementById("editIdBtn");
        if (real) real.click();
        else location.href = "index.html?editProfile=1";
      });
    }

    header.prepend(wrap);
  }

  function buildGuest() {
    const header = document.querySelector(".dsl-right");
    if (!header || header.querySelector(".dsl-account")) return;

    const link = document.createElement("a");
    link.className = "dsl-account dsl-account__login";
    link.href = loginUrl();
    link.textContent = "Login";

    header.prepend(link);
  }

  function interceptProfileClick(role) {
    document.addEventListener("click", (event) => {
      const profile = event.target.closest &&
        event.target.closest(".dsl-profile");

      if (!profile || role === "admin") return;

      event.stopImmediatePropagation();
      event.preventDefault();

      const account = document.querySelector(".dsl-account__btn");
      if (account) account.click();
    }, true);
  }

  async function init() {
    // Hide privileged controls immediately to avoid a flash before authentication.
    applyRoleVisibility(false);

    let me = { authenticated: false };

    try {
      const response = await nativeFetch("/api/auth/me", {
        credentials: "same-origin",
        cache: "no-store"
      });

      if (response.ok) {
        me = await response.json();
      }
    } catch (error) {
      // Remain in safe view-only mode if authentication cannot be verified.
    }

    const isAdmin = me.authenticated === true && me.role === "admin";
    const guest = !me.authenticated;

    if (guest) {
      me = { authenticated: false, role: "user", name: "" };
    }

    write("dslRole", guest ? "" : me.role);
    write("dslName", me.name || "");

    applyRoleVisibility(isAdmin);
    interceptProfileClick(me.role);

    const build = () => {
      if (guest) buildGuest();
      else buildAccount(me.role, me.name);
    };

    if (document.querySelector(".dsl-right")) {
      build();
    } else {
      const observer = new MutationObserver((records, obs) => {
        if (document.querySelector(".dsl-right")) {
          obs.disconnect();
          build();
        }
      });

      observer.observe(document, { childList: true, subtree: true });
    }

    if (!isAdmin) {
      const url = new URL(location.href);

      if (url.searchParams.has("action") ||
          url.searchParams.has("editProfile")) {
        url.searchParams.delete("action");
        url.searchParams.delete("editProfile");
        history.replaceState(null, "", url.pathname + url.search + url.hash);
      }
    }
  }

  init();
})();