/* DS Lab common header. Add to any page:  <link rel="stylesheet" href="header.css">  and, at the end of <body>,
   <script src="shared.js"></script><script src="header.js"></script>
   Name and photo come from the existing ID-card profile (/api/profile); the logo is stored with the same profile. */
(function () {
  const NAV = [["Home", "home.html"], ["Modules", "modules.html"], ["Experiments", "index.html"], ["Tools", "tools.html"], ["Resources", "resources.html"]];
  const DEFAULT_LOGO = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%230d7c86'/%3E%3Ctext x='32' y='41' font-family='Arial' font-size='26' font-weight='700' text-anchor='middle' fill='white'%3EDS%3C/text%3E%3C/svg%3E";
  const DEFAULT_PHOTO = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 80 100'%3E%3Crect width='80' height='100' fill='%23dfe8ee'/%3E%3Ccircle cx='40' cy='38' r='16' fill='%2399aebb'/%3E%3Cpath d='M8 100c0-22 14-36 32-36s32 14 32 36z' fill='%2399aebb'/%3E%3C/svg%3E";
  const api = () => (typeof API_BASE !== "undefined" ? API_BASE : "/api");

  // The site root is Home; the Read More page belongs to Experiments too.
  let page = location.pathname.split("/").pop().toLowerCase();
  if (!page) page = "home.html";
  else if (page === "experiment.html") page = "index.html";
  else if (page === "module.html") page = "modules.html";

  const header = document.createElement("header");
  header.className = "dsl-header";
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
  logo.src = DEFAULT_LOGO; avatar.src = DEFAULT_PHOTO; nameEl.textContent = "Student";

  // Show whatever the existing profile holds (no separate header copy is stored)
  function apply(profile) {
    if (!profile) return;
    nameEl.textContent = (profile.name || "").trim() || "Student";
    avatar.src = profile.photo || DEFAULT_PHOTO;
    if (profile.logo !== undefined) logo.src = profile.logo || DEFAULT_LOGO;
    const homeProfile = document.getElementById("homeIdCard");
    if (homeProfile) {
      homeProfile.querySelector("#homeIdPhoto").src = profile.photo || DEFAULT_PHOTO;
      homeProfile.querySelector("#homeIdName").textContent = profile.name || "Not added";
      homeProfile.querySelector("#homeIdRoll").textContent = profile.roll || "Not added";
      homeProfile.querySelector("#homeIdSection").textContent = profile.section || "Not added";
      homeProfile.querySelector("#homeIdBranch").textContent = profile.branch || "Not added";
      homeProfile.querySelector("#homeIdProfessor").textContent = profile.assistantProfessor || "Not added";
      const github = homeProfile.querySelector("#homeIdGithub");
      const githubUrl = (profile.githubRepo || "").trim();
      if (githubUrl) {
        const link = document.createElement("a");
        link.href = githubUrl;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = "View Repository ↗";
        link.title = githubUrl;
        github.replaceChildren(link);
      } else {
        github.textContent = "Not added";
      }
    }
  }
  fetch(`${api()}/profile`).then((r) => (r.ok ? r.json() : null)).then(apply).catch(() => {});
  window.addEventListener("dslab:profile-updated", (event) => apply(event.detail));

  // Profile click: open the existing ID-card editor
  header.querySelector(".dsl-profile").addEventListener("click", () => {
    const edit = document.getElementById("editIdBtn");
    if (edit) edit.click();
    else location.href = "index.html?editProfile=1";
  });

  // Hamburger
  const nav = header.querySelector("#dslNav");
  const burger = header.querySelector(".dsl-burger");
  const setMenu = (open) => { nav.classList.toggle("is-open", open); burger.setAttribute("aria-expanded", String(open)); };
  burger.addEventListener("click", (e) => { e.stopPropagation(); setMenu(!nav.classList.contains("is-open")); });
  document.addEventListener("click", (e) => { if (!header.contains(e.target)) setMenu(false); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") setMenu(false); });

  // ---------- Logo editor ----------
  function resizeLogo(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Could not read the image."));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error("That file is not a valid image."));
        img.onload = () => {
          const scale = Math.min(1, 256 / Math.max(img.width, img.height));
          const canvas = document.createElement("canvas");
          canvas.width = Math.round(img.width * scale); canvas.height = Math.round(img.height * scale);
          canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/png")); // PNG keeps transparent backgrounds
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function openLogoDialog() {
    let chosen = null; // null = unchanged, "" = back to default, data URL = new logo
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
    preview.src = logo.src;
    const close = () => overlay.remove();

    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
    overlay.querySelector("[data-cancel]").addEventListener("click", close);
    overlay.querySelector("[data-reset]").addEventListener("click", () => { chosen = ""; preview.src = DEFAULT_LOGO; msg.textContent = ""; });
    overlay.querySelector('input[type="file"]').addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try { chosen = await resizeLogo(file); preview.src = chosen; msg.textContent = ""; }
      catch (error) { msg.textContent = error.message; }
    });
    saveBtn.addEventListener("click", async () => {
      if (chosen === null) { close(); return; }
      saveBtn.disabled = true; saveBtn.textContent = "Saving...";
      try {
        const res = await fetch(`${api()}/profile/logo`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ logo: chosen }) });
        if (!res.ok) throw new Error("Could not save the logo.");
        logo.src = chosen || DEFAULT_LOGO;
        close();
      } catch (error) {
        msg.textContent = error.message;
        saveBtn.disabled = false; saveBtn.textContent = "Save";
      }
    });
  }
  header.querySelector(".dsl-logo-edit").addEventListener("click", openLogoDialog);
  const homeEditButton = document.getElementById("homeEditIdBtn");
  if (homeEditButton) {
    homeEditButton.addEventListener("click", () => {
      location.href = "index.html?editProfile=1";
    });
  }
})();