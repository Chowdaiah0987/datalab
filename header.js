/* DS Lab common header. Add to any page:  <link rel="stylesheet" href="header.css">  and, at the end of <body>,
   <script src="shared.js"></script><script src="header.js"></script>
   Name and photo come from the existing ID-card profile (/api/profile); the logo is stored with the same profile. */
(function () {
  "use strict";

  const NAV = [["Home", "home.html"], ["Modules", "modules.html"], ["Experiments", "index.html"], ["Tools", "tools.html"], ["Resources", "resources.html"]];
  const DEFAULT_LOGO = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%231f3a5f'/%3E%3Ctext x='32' y='41' font-family='Georgia,serif' font-size='26' font-weight='700' text-anchor='middle' fill='%23e3c47c'%3EDS%3C/text%3E%3C/svg%3E";
  const DEFAULT_PHOTO = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 80 100'%3E%3Crect width='80' height='100' fill='%23dfe8ee'/%3E%3Ccircle cx='40' cy='38' r='16' fill='%2399aebb'/%3E%3Cpath d='M8 100c0-22 14-36 32-36s32 14 32 36z' fill='%2399aebb'/%3E%3C/svg%3E";
  const api = () => (typeof API_BASE !== "undefined" ? API_BASE : "/api");
  const PROFILE_CACHE_KEY = "dsLabProfileHeaderCache";
  const MAX_LOGO_BYTES = 5 * 1024 * 1024;

  function start() {
    if (document.querySelector(".dsl-header")) return; // never build the header twice

    // The site root is Home; the Read More page belongs to Experiments too.
    let page = location.pathname.split("/").pop().toLowerCase();
    if (page && !page.includes(".")) page += ".html";
    if (!page) page = "home.html";
    else if (page === "experiment.html") page = "index.html";
    else if (page === "module.html") page = "modules.html";

    const header = document.createElement("header");
    header.className = `dsl-header${page === "home.html" ? " dsl-header--home" : ""}`;
    header.innerHTML = `
      <div class="dsl-header__inner">
        <div class="dsl-brand">
          <a class="dsl-brand__link" href="home.html" aria-label="Data Science Digital Laboratory">
            <img class="dsl-logo" alt=""><span class="dsl-brand__text"><strong>Data Science</strong><small>Digital Laboratory</small></span>
          </a>
          <button type="button" class="dsl-logo-edit" title="Change logo" aria-label="Change logo">&#9998;</button>
        </div>
        <nav class="dsl-nav" id="dslNav" aria-label="Main navigation">
          ${NAV.map(([label, href]) => `<a href="${href}"${href === page ? ' class="is-active" aria-current="page"' : ""}>${label}</a>`).join("")}
        </nav>
        <div class="dsl-right">
          <button type="button" class="dsl-profile" title="Open profile"><img class="dsl-avatar" alt=""><span class="dsl-profile__name"></span></button>
          <button type="button" class="dsl-burger" aria-label="Menu" aria-expanded="false" aria-controls="dslNav">&#9776;</button>
        </div>
      </div>`;
    document.body.prepend(header);

    const logo = header.querySelector(".dsl-logo");
    const avatar = header.querySelector(".dsl-avatar");
    const nameEl = header.querySelector(".dsl-profile__name");
    logo.src = DEFAULT_LOGO;
    avatar.src = DEFAULT_PHOTO;
    nameEl.textContent = "Student";

    // If an uploaded image URL is broken, fall back to the defaults.
    const isDefault = (img) => img.src.startsWith("data:image/svg+xml");
    logo.addEventListener("error", () => { if (!isDefault(logo)) logo.src = DEFAULT_LOGO; });
    avatar.addEventListener("error", () => { if (!isDefault(avatar)) avatar.src = DEFAULT_PHOTO; });

    /* ---------- Profile ---------- */
    function getCachedProfile() {
      try {
        return JSON.parse(sessionStorage.getItem(PROFILE_CACHE_KEY) || "null");
      } catch (error) {
        return null;
      }
    }

    function cacheProfile(profile) {
      try {
        sessionStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(profile));
      } catch (error) {
        console.warn("Could not cache the header profile for this session:", error);
      }
    }

    // Null-safe helpers so one missing element cannot break the whole header.
    function setText(root, selector, value) {
      const el = root.querySelector(selector);
      if (el) el.textContent = value;
    }

    function apply(profile) {
      if (!profile || typeof profile !== "object") return;
      const photo = profile.photoUrl || profile.photo || DEFAULT_PHOTO;

      nameEl.textContent = (profile.name || "").trim() || "Student";
      avatar.src = photo;
      if (profile.logoUrl !== undefined || profile.logo !== undefined) {
        logo.src = profile.logoUrl || profile.logo || DEFAULT_LOGO;
      }

      const homeProfile = document.getElementById("homeIdCard");
      if (!homeProfile) return;

      const photoEl = homeProfile.querySelector("#homeIdPhoto");
      if (photoEl) photoEl.src = photo;
      setText(homeProfile, "#homeIdName", profile.name || "Not added");
      setText(homeProfile, "#homeIdRoll", profile.roll || "Not added");
      setText(homeProfile, "#homeIdSection", profile.section || "Not added");
      setText(homeProfile, "#homeIdBranch", profile.branch || "Not added");
      setText(homeProfile, "#homeIdProfessor", profile.assistantProfessor || "Not added");

      const github = homeProfile.querySelector("#homeIdGithub");
      if (github) {
        const githubUrl = (profile.githubRepo || "").trim();
        if (/^https?:\/\//i.test(githubUrl)) {
          const link = document.createElement("a");
          link.href = githubUrl;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          link.textContent = "View Repository ↗";
          link.title = githubUrl;
          github.replaceChildren(link);
        } else {
          github.textContent = githubUrl || "Not added";
        }
      }
    }

    const cachedProfile = getCachedProfile();
    if (cachedProfile) apply(cachedProfile);

    async function refreshProfile() {
      try {
        const response = await fetch(`${api()}/profile/header`, { cache: "no-store" });
        if (!response.ok) throw new Error(`Profile request failed with status ${response.status}.`);
        const profile = await response.json();
        cacheProfile(profile);
        apply(profile);
      } catch (error) {
        if (!cachedProfile) console.error("Could not load the profile for the site header:", error);
      }
    }
    refreshProfile();

    window.addEventListener("dslab:profile-updated", (event) => {
      apply(event.detail);
      refreshProfile();
    });

    // Profile click: open the existing ID-card editor
    header.querySelector(".dsl-profile").addEventListener("click", () => {
      const edit = document.getElementById("editIdBtn");
      if (edit) edit.click();
      else location.href = "index.html?editProfile=1";
    });

    /* ---------- Hamburger ---------- */
    const nav = header.querySelector("#dslNav");
    const burger = header.querySelector(".dsl-burger");
    const setMenu = (open) => {
      nav.classList.toggle("is-open", open);
      burger.setAttribute("aria-expanded", String(open));
    };
    burger.addEventListener("click", (e) => {
      e.stopPropagation();
      setMenu(!nav.classList.contains("is-open"));
    });
    nav.addEventListener("click", (e) => { if (e.target.closest("a")) setMenu(false); });
    document.addEventListener("click", (e) => { if (!header.contains(e.target)) setMenu(false); });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && nav.classList.contains("is-open")) {
        setMenu(false);
        burger.focus();
      }
    });
    window.addEventListener("resize", () => { if (window.innerWidth > 820) setMenu(false); });

    /* ---------- Logo editor ---------- */
    function resizeLogo(file) {
      return new Promise((resolve, reject) => {
        if (!file.type || !file.type.startsWith("image/")) {
          reject(new Error("Please choose an image file."));
          return;
        }
        if (file.size > MAX_LOGO_BYTES) {
          reject(new Error("The image must be smaller than 5 MB."));
          return;
        }
        const reader = new FileReader();
        reader.onerror = () => reject(new Error("Could not read the image."));
        reader.onload = () => {
          const img = new Image();
          img.onerror = () => reject(new Error("That file is not a valid image."));
          img.onload = () => {
            // SVG files can report 0 size; fall back to 256.
            const w = img.naturalWidth || img.width || 256;
            const h = img.naturalHeight || img.height || 256;
            const scale = Math.min(1, 256 / Math.max(w, h));
            const canvas = document.createElement("canvas");
            canvas.width = Math.max(1, Math.round(w * scale));
            canvas.height = Math.max(1, Math.round(h * scale));
            canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
            resolve(canvas.toDataURL("image/png")); // PNG keeps transparent backgrounds
          };
          img.src = reader.result;
        };
        reader.readAsDataURL(file);
      });
    }

    function openLogoDialog() {
      if (document.querySelector(".dsl-modal")) return; // one dialog at a time

      let chosen = null; // null = unchanged, "" = back to default, data URL = new logo
      const opener = document.activeElement;
      const overlay = document.createElement("div");
      overlay.className = "dsl-modal";
      overlay.innerHTML = `
        <div class="dsl-modal__panel" role="dialog" aria-modal="true" aria-label="Change logo">
          <h2>Change logo</h2>
          <img class="dsl-modal__preview" alt="Logo preview">
          <label class="btn btn--ghost" style="justify-self:center">Upload image<input type="file" accept="image/*" hidden></label>
          <p class="dsl-modal__msg" role="status"></p>
          <div class="dsl-modal__row">
            <button type="button" class="btn btn--ghost" data-reset>Use default</button>
            <button type="button" class="btn btn--ghost" data-cancel>Cancel</button>
            <button type="button" class="btn btn--primary" data-save>Save</button>
          </div>
        </div>`;
      document.body.appendChild(overlay);

      const preview = overlay.querySelector(".dsl-modal__preview");
      const msg = overlay.querySelector(".dsl-modal__msg");
      const saveBtn = overlay.querySelector("[data-save]");
      const fileInput = overlay.querySelector('input[type="file"]');
      preview.src = logo.src;

      const onKey = (e) => { if (e.key === "Escape") close(); };
      function close() {
        document.removeEventListener("keydown", onKey);
        overlay.remove();
        if (opener && typeof opener.focus === "function") opener.focus();
      }
      document.addEventListener("keydown", onKey);

      overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
      overlay.querySelector("[data-cancel]").addEventListener("click", close);
      overlay.querySelector("[data-reset]").addEventListener("click", () => {
        chosen = "";
        preview.src = DEFAULT_LOGO;
        msg.textContent = "";
      });
      fileInput.addEventListener("change", async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
          chosen = await resizeLogo(file);
          preview.src = chosen;
          msg.textContent = "";
        } catch (error) {
          msg.textContent = error.message;
        }
        fileInput.value = ""; // allow choosing the same file again
      });
      saveBtn.addEventListener("click", async () => {
        if (chosen === null) { close(); return; }
        saveBtn.disabled = true;
        saveBtn.textContent = "Saving...";
        try {
          const res = await fetch(`${api()}/profile/logo`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ logo: chosen }),
          });
          if (!res.ok) throw new Error("Could not save the logo.");
          logo.src = chosen || DEFAULT_LOGO;
          close();
          refreshProfile();
        } catch (error) {
          msg.textContent = error.message || "Could not save the logo.";
          saveBtn.disabled = false;
          saveBtn.textContent = "Save";
        }
      });
      saveBtn.focus();
    }
    header.querySelector(".dsl-logo-edit").addEventListener("click", openLogoDialog);

    const homeEditButton = document.getElementById("homeEditIdBtn");
    if (homeEditButton) {
      homeEditButton.addEventListener("click", () => {
        location.href = "index.html?editProfile=1";
      });
    }
  }

  // Safety net: the Modules / Tools / Resources pages call createCardMenu(), which is defined in
  // card-menu.js. If that file is missing or outdated, define the same function here so those
  // pages keep working. A real card-menu.js loaded afterwards simply replaces this copy.
  if (typeof window.createCardMenu !== "function") {
    let openMenu = null;
    const closeMenu = () => {
      if (!openMenu) return;
      openMenu.querySelector(".card-menu__items").hidden = true;
      openMenu.querySelector(".card-menu__toggle").setAttribute("aria-expanded", "false");
      openMenu = null;
    };
    document.addEventListener("click", (e) => { if (openMenu && !openMenu.contains(e.target)) closeMenu(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeMenu(); });

    window.createCardMenu = function (onEdit, onDelete, options = {}) {
      const button = (text, className, handler) => {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = text;
        if (className) b.className = className;
        b.addEventListener("click", () => { menu.hidden = true; closeMenu(); handler(); });
        return b;
      };
      const wrapper = document.createElement("div");
      wrapper.className = "card-menu";
      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "card-menu__toggle";
      toggle.textContent = "\u22EE";
      toggle.setAttribute("aria-label", "Card actions");
      toggle.setAttribute("aria-expanded", "false");
      const menu = document.createElement("div");
      menu.className = "card-menu__items";
      menu.hidden = true;
      const extra = (options.actions || []).map(({ label, onClick }) => button(label, "", onClick));
      menu.append(
        button(options.editLabel || "\u270E Edit", "", onEdit),
        ...extra,
        button(options.deleteLabel || "Delete", "card-menu__delete", onDelete)
      );
      wrapper.append(toggle, menu);
      toggle.addEventListener("click", (e) => {
        e.stopPropagation();
        if (openMenu && openMenu !== wrapper) closeMenu();
        const open = menu.hidden;
        menu.hidden = !open;
        toggle.setAttribute("aria-expanded", String(open));
        openMenu = open ? wrapper : null;
      });
      return wrapper;
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();