/* Sign-in state for every page (added automatically by the server).
   - tells the page whether the visitor is an Admin or a Normal User (hides admin-only controls for others)
   - adds the account button with Logout to the header
   - sends the visitor to the login page if their session ends
   Real permission checks happen on the server for every API request. */
(function () {
  "use strict";

  const root = document.documentElement;
  const read = (key) => { try { return sessionStorage.getItem(key) || ""; } catch (error) { return ""; } };
  const write = (key, value) => { try { sessionStorage.setItem(key, value); } catch (error) { /* optional */ } };

  // Use the last known role straight away so there is no flicker; it is checked with the server below.
  if (read("dslRole")) root.dataset.role = read("dslRole");

  const loginUrl = () => `login.html?next=${encodeURIComponent(location.pathname.replace(/^\//, "") + location.search)}`;

  // Any API call that comes back "not signed in" sends the visitor to the login page
  const nativeFetch = window.fetch.bind(window);
  window.fetch = async function (input, init) {
    const response = await nativeFetch(input, init);
    try {
      const url = typeof input === "string" ? input : input.url;
      if (response.status === 401 && /\/api\//.test(url) && !/\/api\/auth\//.test(url)) {
        write("dslRole", "");
        location.href = loginUrl();
      }
    } catch (error) { /* ignore */ }
    return response;
  };

  async function logout() {
    try { await nativeFetch("/api/auth/logout", { method: "POST", credentials: "same-origin" }); } catch (error) { /* ignore */ }
    ["dslRole", "dslName", "dsLabProfileHeaderCache"].forEach((key) => { try { sessionStorage.removeItem(key); } catch (error) { /* ignore */ } });
    location.replace("login.html");
  }

  function buildAccount(role, name) {
    const header = document.querySelector(".dsl-right");
    if (!header || header.querySelector(".dsl-account")) return;
    const wrap = document.createElement("div");
    wrap.className = "dsl-account";
    const isAdmin = role === "admin";
    wrap.innerHTML = `
      <button type="button" class="dsl-account__btn" aria-haspopup="true" aria-expanded="false">
        <span class="dsl-account__badge"></span><span class="dsl-account__label">Account</span>
      </button>
      <div class="dsl-account__menu" hidden role="menu">
        <p class="dsl-account__who">Signed in as</p>
        <p class="dsl-account__name"></p>
        ${isAdmin ? '<button type="button" data-edit-id role="menuitem">Edit ID card</button>' : ""}
        <button type="button" class="is-primary" data-logout role="menuitem">Logout</button>
      </div>`;
    wrap.querySelector(".dsl-account__badge").textContent = isAdmin ? "Admin" : "Viewer";
    wrap.querySelector(".dsl-account__name").textContent = isAdmin ? "Administrator" : name || "Normal User";
    const trigger = wrap.querySelector(".dsl-account__btn");
    const menu = wrap.querySelector(".dsl-account__menu");
    const setOpen = (open) => { menu.hidden = !open; trigger.setAttribute("aria-expanded", String(open)); };
    trigger.addEventListener("click", (event) => { event.stopPropagation(); setOpen(menu.hidden); });
    document.addEventListener("click", (event) => { if (!wrap.contains(event.target)) setOpen(false); });
    document.addEventListener("keydown", (event) => { if (event.key === "Escape") setOpen(false); });
    wrap.querySelector("[data-logout]").addEventListener("click", logout);
    const edit = wrap.querySelector("[data-edit-id]");
    if (edit) edit.addEventListener("click", () => { setOpen(false); const real = document.getElementById("editIdBtn"); if (real) real.click(); else location.href = "index.html?editProfile=1"; });
    header.prepend(wrap);
  }

  function interceptProfileClick(role) {
    // The header profile button opens the ID-card editor. Normal Users must not get that editor.
    document.addEventListener("click", (event) => {
      const profile = event.target.closest && event.target.closest(".dsl-profile");
      if (!profile || role === "admin") return;
      event.stopImmediatePropagation();
      event.preventDefault();
      const account = document.querySelector(".dsl-account__btn");
      if (account) account.click();
    }, true);
  }

  async function init() {
    let me = { authenticated: false };
    try {
      const response = await nativeFetch("/api/auth/me", { credentials: "same-origin", cache: "no-store" });
      if (response.ok) me = await response.json();
    } catch (error) { return; /* offline: keep what we know */ }
    if (!me.authenticated) { write("dslRole", ""); location.replace(loginUrl()); return; }
    write("dslRole", me.role);
    write("dslName", me.name || "");
    root.dataset.role = me.role;
    interceptProfileClick(me.role);

    const build = () => buildAccount(me.role, me.name);
    if (document.querySelector(".dsl-right")) build();
    else new MutationObserver((records, observer) => { if (document.querySelector(".dsl-right")) { observer.disconnect(); build(); } }).observe(document, { childList: true, subtree: true });

    // Opening a page with ?action=add as a Normal User should simply show the page
    if (me.role !== "admin") {
      const url = new URL(location.href);
      if (url.searchParams.has("action") || url.searchParams.has("editProfile")) {
        url.searchParams.delete("action"); url.searchParams.delete("editProfile");
        history.replaceState(null, "", url.pathname + url.search + url.hash);
      }
    }
  }
  init();
})();