
/* Public user account + admin-only editing UI.
   API permissions are enforced server-side. */
(function () {
  "use strict";

  const root = document.documentElement;

  const read = (key) => {
    try {
      return sessionStorage.getItem(key) || "";
    } catch (_) {
      return "";
    }
  };

  const write = (key, value) => {
    try {
      sessionStorage.setItem(key, value);
    } catch (_) {}
  };

  const nativeFetch = window.fetch.bind(window);

  const loginUrl = () =>
    `login.html?next=${encodeURIComponent(
      location.pathname.replace(/^\//, "") + location.search
    )}`;

  // Allow public visitors to browse without being redirected to login.
  window.fetch = async function (input, init) {
    return nativeFetch(input, init);
  };

  async function logout() {
    try {
      await nativeFetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin"
      });
    } catch (_) {}

    [
      "dslRole",
      "dslName",
      "dsLabProfileHeaderCache"
    ].forEach((key) => {
      try {
        sessionStorage.removeItem(key);
      } catch (_) {}
    });

    location.replace("home.html");
  }

  function buildAccount(role, name) {
    const header = document.querySelector(".dsl-right");

    if (!header || header.querySelector(".dsl-account")) return;

    const isAdmin = role === "admin";
    const isAuthenticated =
      role === "admin" || role === "user";

    const accountLabel = isAdmin ? "Admin" : "User";

    const wrap = document.createElement("div");
    wrap.className = "dsl-account";

    wrap.innerHTML = `
      <button
        type="button"
        class="dsl-account__btn"
        aria-haspopup="true"
        aria-expanded="false"
      >
        <span class="dsl-account__label">${accountLabel}</span>
      </button>

      <div class="dsl-account__menu" hidden role="menu">
        <p class="dsl-account__who">
          ${isAuthenticated ? "Signed in as" : "Browsing as"}
        </p>

        <p class="dsl-account__name"></p>

        ${
          isAdmin
            ? '<button type="button" data-edit-id role="menuitem">Edit ID card</button>'
            : ""
        }

        ${
          !isAdmin
            ? `<a href="${loginUrl()}" role="menuitem" class="dsl-account__admin-link">Admin sign in</a>`
            : ""
        }

        ${
          isAuthenticated
            ? '<button type="button" class="is-primary" data-logout role="menuitem">Logout</button>'
            : ""
        }
      </div>
    `;

    wrap.querySelector(".dsl-account__name").textContent =
      isAdmin ? "Administrator" : (name || "Guest User");

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
      if (!wrap.contains(event.target)) {
        setOpen(false);
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    });

    const logoutButton = wrap.querySelector("[data-logout]");

    if (logoutButton) {
      logoutButton.addEventListener("click", logout);
    }

    const edit = wrap.querySelector("[data-edit-id]");

    if (edit) {
      edit.addEventListener("click", () => {
        setOpen(false);

        const real = document.getElementById("editIdBtn");

        if (real) {
          real.click();
        } else {
          location.href = "index.html?editProfile=1";
        }
      });
    }

    header.prepend(wrap);
  }

  function interceptProfileClick(role) {
    document.addEventListener(
      "click",
      (event) => {
        const profile =
          event.target.closest &&
          event.target.closest(".dsl-profile");

        if (!profile || role === "admin") return;

        event.stopImmediatePropagation();
        event.preventDefault();

        const account =
          document.querySelector(".dsl-account__btn");

        if (account) account.click();
      },
      true
    );
  }

  async function init() {
    let me = {
      authenticated: false,
      role: null,
      name: ""
    };

    try {
      const response = await nativeFetch("/api/auth/me", {
        credentials: "same-origin",
        cache: "no-store"
      });

      if (response.ok) {
        me = await response.json();
      }
    } catch (_) {
      // Render public user mode if the server is unavailable.
    }

    const role = me.authenticated ? me.role : "viewer";
    const name = me.authenticated ? (me.name || "") : "";

    write("dslRole", role);
    write("dslName", name);

    root.dataset.role = role;

    interceptProfileClick(role);

    const build = () => buildAccount(role, name);

    if (document.querySelector(".dsl-right")) {
      build();
    } else {
      const observer = new MutationObserver(
        (records, observer) => {
          if (document.querySelector(".dsl-right")) {
            observer.disconnect();
            build();
          }
        }
      );

      observer.observe(document, {
        childList: true,
        subtree: true
      });
    }

    // Remove viewer-only URL parameters that could request editing.
    if (role !== "admin") {
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

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
