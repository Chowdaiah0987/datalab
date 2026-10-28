
/* DS Lab common header.
   Load shared.js before header.js.
   Name and photo come from /api/profile/header.
*/
(function () {
  "use strict";

  /* Navigation icons */
  const ICONS = {
    "home.html":
      '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h5v-6h4v6h5V10"/>',
    "modules.html":
      '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    "index.html":
      '<path d="M9 3h6"/><path d="M10 3v6L4.5 19a2 2 0 0 0 1.8 3h11.4a2 2 0 0 0 1.8-3L14 9V3"/><path d="M7.5 15h9"/>',
    "tools.html":
      '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
    "resources.html":
      '<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20"/>'
  };

  const NAV = [
    ["Home", "home.html"],
    ["Modules", "modules.html"],
    ["Experiments", "index.html"],
    ["Tools", "tools.html"],
    ["Resources", "resources.html"]
  ];

  const DEFAULT_LOGO =
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%231f3a5f'/%3E%3Ctext x='32' y='41' font-family='Georgia,serif' font-size='26' font-weight='700' text-anchor='middle' fill='%23e3c47c'%3EDS%3C/text%3E%3C/svg%3E";

  const DEFAULT_PHOTO =
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 80 100'%3E%3Crect width='80' height='100' fill='%23dfe8ee'/%3E%3Ccircle cx='40' cy='38' r='16' fill='%2399aebb'/%3E%3Cpath d='M8 100c0-22 14-36 32-36s32 14 32 36z' fill='%2399aebb'/%3E%3C/svg%3E";

  const api = () =>
    typeof API_BASE !== "undefined" ? API_BASE : "/api";

  const PROFILE_CACHE_KEY = "dsLabProfileHeaderCache";
  const MAX_LOGO_BYTES = 5 * 1024 * 1024;

  function start() {
    if (document.querySelector(".dsl-header")) return;

    /* Resolve the top-level navigation section for each page. */
    const SECTION_OF = {
      "home.html": "home.html",
      "modules.html": "modules.html",
      "module.html": "modules.html",
      "topic.html": "modules.html",
      "index.html": "index.html",
      "experiment.html": "index.html",
      "topic-lesson.html": "index.html",
      "experiment-topic.html": "index.html",
      "experiment-form.html": "index.html",
      "tools.html": "tools.html",
      "tool.html": "tools.html",
      "resources.html": "resources.html",
      "resource.html": "resources.html"
    };

    const SECTION_BY_FOLDER = {
      home: "home.html",
      modules: "modules.html",
      module: "modules.html",
      topic: "modules.html",
      experiments: "index.html",
      experiment: "index.html",
      tools: "tools.html",
      tool: "tools.html",
      resources: "resources.html",
      resource: "resources.html"
    };

    function detectPage() {
      const segments = location.pathname
        .toLowerCase()
        .split("/")
        .filter(Boolean);

      let last = segments[segments.length - 1] || "";

      if (last && !last.includes(".")) {
        last += ".html";
      }

      let section = SECTION_OF[last] || "";

      if (!section) {
        const hit = segments
          .map((part) => SECTION_BY_FOLDER[part.replace(/\.html$/, "")])
          .find(Boolean);

        section = hit || (last ? "" : "home.html");
      }

      return section;
    }

    let page = detectPage();

    /* IMPORTANT: Home and inner pages use different layout classes. */
    const layoutClass = (isHome) =>
      isHome
        ? "dsl-header--home home-header"
        : "dsl-header--inner inner-page-header";

    const header = document.createElement("header");
    header.className =
      `dsl-header ${layoutClass(page === "home.html")}`;

    document.documentElement.classList.add("dsl-inner");

    header.innerHTML = `
      <div class="dsl-header__inner">
        <div class="dsl-brand">
          <a class="dsl-brand__link"
             href="home.html"
             aria-label="Data Science Digital Laboratory">
            <img class="dsl-logo" alt="">
            <span class="dsl-brand__text">
              <strong>Data Science</strong>
              <small>Digital Laboratory</small>
            </span>
          </a>

          <button type="button"
                  class="dsl-logo-edit"
                  title="Change logo"
                  aria-label="Change logo">&#9998;</button>
        </div>

        <nav class="dsl-nav" id="dslNav" aria-label="Main navigation">
          ${NAV.map(([label, href]) => `
            <a href="${href}"
               title="${label}"${href === page
                 ? ' class="is-active" aria-current="page"'
                 : ""}>
              <svg class="dsl-nav__icon"
                   viewBox="0 0 24 24"
                   aria-hidden="true">
                ${ICONS[href] || ""}
              </svg>
              <span class="dsl-nav__label">${label}</span>
            </a>
          `).join("")}
        </nav>

        <div class="dsl-right">
          <div class="dsl-userarea">
            <button type="button"
                    class="dsl-profile"
                    title="Open profile">
              <img class="dsl-avatar" alt="">
              <span class="dsl-profile__name"></span>
            </button>
            <div class="dsl-controls" id="dslControls"></div>
          </div>

          <button type="button"
                  class="dsl-burger"
                  aria-label="Menu"
                  aria-expanded="false"
                  aria-controls="dslNav">&#9776;</button>
        </div>
      </div>`;

    document.body.prepend(header);

    /* Keep layout and active navigation synchronized with route changes. */
    const syncRoute = () => {
      page = detectPage();
      const home = page === "home.html";

      header.classList.remove(
        "dsl-header--home",
        "home-header",
        "dsl-header--inner",
        "inner-page-header"
      );

      header.classList.add(...layoutClass(home).split(" "));
      document.documentElement.classList.add("dsl-inner");

      header.querySelectorAll(".dsl-nav a").forEach((anchor) => {
        const active = anchor.getAttribute("href") === page;

        anchor.classList.toggle("is-active", active);

        if (active) {
          anchor.setAttribute("aria-current", "page");
        } else {
          anchor.removeAttribute("aria-current");
        }
      });
    };

    ["popstate", "hashchange", "pageshow"].forEach((eventName) => {
      window.addEventListener(eventName, syncRoute);
    });

    const logo = header.querySelector(".dsl-logo");
    const avatar = header.querySelector(".dsl-avatar");
    const nameEl = header.querySelector(".dsl-profile__name");

    logo.src = DEFAULT_LOGO;
    avatar.src = DEFAULT_PHOTO;
    nameEl.textContent = "Student";

    const isDefault = (img) =>
      img.src.startsWith("data:image/svg+xml");

    logo.addEventListener("error", () => {
      if (!isDefault(logo)) logo.src = DEFAULT_LOGO;
    });

    avatar.addEventListener("error", () => {
      if (!isDefault(avatar)) avatar.src = DEFAULT_PHOTO;
    });

    /* ---------- Profile cache ---------- */

    function getCachedProfile() {
      try {
        return JSON.parse(
          sessionStorage.getItem(PROFILE_CACHE_KEY) || "null"
        );
      } catch (error) {
        return null;
      }
    }

    function cacheProfile(profile) {
      try {
        sessionStorage.setItem(
          PROFILE_CACHE_KEY,
          JSON.stringify(profile)
        );
      } catch (error) {
        console.warn(
          "Could not cache the header profile for this session:",
          error
        );
      }
    }

    function setText(root, selector, value) {
      const element = root.querySelector(selector);
      if (element) element.textContent = value;
    }

    function apply(profile) {
      if (!profile || typeof profile !== "object") return;

      const photo =
        profile.photoUrl || profile.photo || DEFAULT_PHOTO;

      nameEl.textContent =
        (profile.name || "").trim() || "Student";

      avatar.src = photo;

      if (
        profile.logoUrl !== undefined ||
        profile.logo !== undefined
      ) {
        logo.src = profile.logoUrl || profile.logo || DEFAULT_LOGO;
      }

      const homeProfile = document.getElementById("homeIdCard");
      if (!homeProfile) return;

      const photoEl = homeProfile.querySelector("#homeIdPhoto");
      if (photoEl) photoEl.src = photo;

      setText(homeProfile, "#homeIdName", profile.name || "Not added");
      setText(homeProfile, "#homeIdRoll", profile.roll || "Not added");
      setText(
        homeProfile,
        "#homeIdSection",
        profile.section || "Not added"
      );
      setText(
        homeProfile,
        "#homeIdBranch",
        profile.branch || "Not added"
      );
      setText(
        homeProfile,
        "#homeIdProfessor",
        profile.assistantProfessor || "Not added"
      );

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
        const response = await fetch(`${api()}/profile/header`, {
          cache: "no-store"
        });

        if (!response.ok) {
          throw new Error(
            `Profile request failed with status ${response.status}.`
          );
        }

        const profile = await response.json();
        cacheProfile(profile);
        apply(profile);
      } catch (error) {
        if (!cachedProfile) {
          console.error(
            "Could not load the profile for the site header:",
            error
          );
        }
      }
    }

    refreshProfile();

    window.addEventListener("dslab:profile-updated", (event) => {
      apply(event.detail);
      refreshProfile();
    });

    /* Profile click opens the existing ID-card editor. */
    header.querySelector(".dsl-profile").addEventListener("click", () => {
      const edit = document.getElementById("editIdBtn");

      if (edit) {
        edit.click();
      } else {
        location.href = "index.html?editProfile=1";
      }
    });

    /* ---------- Mobile navigation ---------- */

    const nav = header.querySelector("#dslNav");
    const burger = header.querySelector(".dsl-burger");

    const setMenu = (open) => {
      nav.classList.toggle("is-open", open);
      burger.setAttribute("aria-expanded", String(open));
    };

    burger.addEventListener("click", (event) => {
      event.stopPropagation();
      setMenu(!nav.classList.contains("is-open"));
    });

    nav.addEventListener("click", (event) => {
      if (event.target.closest("a")) setMenu(false);
    });

    document.addEventListener("click", (event) => {
      if (!header.contains(event.target)) setMenu(false);
    });

    document.addEventListener("keydown", (event) => {
      if (
        event.key === "Escape" &&
        nav.classList.contains("is-open")
      ) {
        setMenu(false);
        burger.focus();
      }
    });

    window.addEventListener("resize", () => {
      if (window.innerWidth > 820) setMenu(false);
    });

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

        reader.onerror = () =>
          reject(new Error("Could not read the image."));

        reader.onload = () => {
          const img = new Image();

          img.onerror = () =>
            reject(new Error("That file is not a valid image."));

          img.onload = () => {
            const width = img.naturalWidth || img.width || 256;
            const height = img.naturalHeight || img.height || 256;
            const scale = Math.min(
              1,
              256 / Math.max(width, height)
            );

            const canvas = document.createElement("canvas");
            canvas.width = Math.max(1, Math.round(width * scale));
            canvas.height = Math.max(1, Math.round(height * scale));

            const context = canvas.getContext("2d");

            if (!context) {
              reject(new Error("Could not process the image."));
              return;
            }

            context.drawImage(
              img,
              0,
              0,
              canvas.width,
              canvas.height
            );

            resolve(canvas.toDataURL("image/png"));
          };

          img.src = reader.result;
        };

        reader.readAsDataURL(file);
      });
    }

    function openLogoDialog() {
      if (document.querySelector(".dsl-modal")) return;

      let chosen = null;
      const opener = document.activeElement;
      const overlay = document.createElement("div");

      overlay.className = "dsl-modal";
      overlay.innerHTML = `
        <div class="dsl-modal__panel"
             role="dialog"
             aria-modal="true"
             aria-label="Change logo">
          <h2>Change logo</h2>
          <img class="dsl-modal__preview" alt="Logo preview">

          <label class="btn btn--ghost" style="justify-self:center">
            Upload image
            <input type="file" accept="image/*" hidden>
          </label>

          <p class="dsl-modal__msg" role="status"></p>

          <div class="dsl-modal__row">
            <button type="button" class="btn btn--ghost" data-reset>
              Use default
            </button>
            <button type="button" class="btn btn--ghost" data-cancel>
              Cancel
            </button>
            <button type="button" class="btn btn--primary" data-save>
              Save
            </button>
          </div>
        </div>`;

      document.body.appendChild(overlay);

      const preview = overlay.querySelector(".dsl-modal__preview");
      const message = overlay.querySelector(".dsl-modal__msg");
      const saveButton = overlay.querySelector("[data-save]");
      const fileInput = overlay.querySelector('input[type="file"]');

      preview.src = logo.src;

      function close() {
        document.removeEventListener("keydown", onKey);
        overlay.remove();

        if (opener && typeof opener.focus === "function") {
          opener.focus();
        }
      }

      const onKey = (event) => {
        if (event.key === "Escape") close();
      };

      document.addEventListener("keydown", onKey);

      overlay.addEventListener("click", (event) => {
        if (event.target === overlay) close();
      });

      overlay.querySelector("[data-cancel]")
        .addEventListener("click", close);

      overlay.querySelector("[data-reset]")
        .addEventListener("click", () => {
          chosen = "";
          preview.src = DEFAULT_LOGO;
          message.textContent = "";
        });

      fileInput.addEventListener("change", async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        try {
          chosen = await resizeLogo(file);
          preview.src = chosen;
          message.textContent = "";
        } catch (error) {
          message.textContent = error.message;
        }

        fileInput.value = "";
      });

      saveButton.addEventListener("click", async () => {
        if (chosen === null) {
          close();
          return;
        }

        saveButton.disabled = true;
        saveButton.textContent = "Saving...";

        try {
          const response = await fetch(`${api()}/profile/logo`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ logo: chosen })
          });

          if (!response.ok) {
            throw new Error("Could not save the logo.");
          }

          logo.src = chosen || DEFAULT_LOGO;
          close();
          refreshProfile();
        } catch (error) {
          message.textContent =
            error.message || "Could not save the logo.";
          saveButton.disabled = false;
          saveButton.textContent = "Save";
        }
      });

      saveButton.focus();
    }

    header.querySelector(".dsl-logo-edit")
      .addEventListener("click", openLogoDialog);

    const homeEditButton = document.getElementById("homeEditIdBtn");

    if (homeEditButton) {
      homeEditButton.addEventListener("click", () => {
        location.href = "index.html?editProfile=1";
      });
    }
  }

  /* ---------- Card-menu fallback ---------- */

  if (typeof window.createCardMenu !== "function") {
    let openMenu = null;

    const closeMenu = () => {
      if (!openMenu) return;

      const items = openMenu.querySelector(".card-menu__items");
      const toggle = openMenu.querySelector(".card-menu__toggle");

      if (items) items.hidden = true;

      if (toggle) {
        toggle.setAttribute("aria-expanded", "false");
      }

      openMenu = null;
    };

    document.addEventListener("click", (event) => {
      if (openMenu && !openMenu.contains(event.target)) {
        closeMenu();
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeMenu();
    });

    window.createCardMenu = function (
      onEdit,
      onDelete,
      options = {}
    ) {
      let menu;

      const makeButton = (text, className, handler) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = text;

        if (className) button.className = className;

        button.addEventListener("click", () => {
          menu.hidden = true;
          closeMenu();

          if (typeof handler === "function") handler();
        });

        return button;
      };

      const wrapper = document.createElement("div");
      wrapper.className = "card-menu";

      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "card-menu__toggle";
      toggle.textContent = "\u22EE";
      toggle.setAttribute("aria-label", "Card actions");
      toggle.setAttribute("aria-expanded", "false");

      menu = document.createElement("div");
      menu.className = "card-menu__items";
      menu.hidden = true;

      const extra = (options.actions || []).map(({ label, onClick }) =>
        makeButton(label, "", onClick)
      );

      menu.append(
        makeButton(options.editLabel || "\u270E Edit", "", onEdit),
        ...extra,
        makeButton(
          options.deleteLabel || "Delete",
          "card-menu__delete",
          onDelete
        )
      );

      wrapper.append(toggle, menu);

      toggle.addEventListener("click", (event) => {
        event.stopPropagation();

        if (openMenu && openMenu !== wrapper) {
          closeMenu();
        }

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
