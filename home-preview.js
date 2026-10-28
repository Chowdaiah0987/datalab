/* =========================================================
   HOME PAGE — Recent Experiments + Tools preview
   Shows ONLY records that exist in the backend (nothing hardcoded).
   Uses apiRequest() from shared.js, same as home-counts.js.

   Endpoints and URLs below were taken from script.js, experiment.html
   and library-cards.js. If a request fails, the panel shows an error
   with a Retry button instead of fake cards.
   ========================================================= */
(function () {
  "use strict";

  if (window.__dslHomePreview) return;
  window.__dslHomePreview = true;

  const CONFIG = {
    experiments: {
      container: "homeRecentExperiments",
      endpoint: "/experiments",          // confirmed (script.js)
      listPage: "index.html",            // existing experiments listing
      detailPage: "experiment.html",     // each card opens experiment.html?id=<id>
      selectParam: "id",
      addUrl: "index.html?action=add",
      emptyText: "No experiments yet.",
      addLabel: "Add Experiment",
      limit: 4,
    },
    tools: {
      container: "homeToolsPreview",
      endpoint: "/tools",                // confirmed (library-cards.js)
      listPage: "tools.html",
      selectParam: "tool",               // ?tool=<id> on tools.html
      addUrl: "tools.html?action=add",
      emptyText: "No tools yet.",
      addLabel: "Add Tools",
      limit: 4,
    },
  };

  const COOLDOWN = 1500;
  let lastRun = 0;

  // ---------- helpers ----------
  function pick(obj, keys) {
    for (const k of keys) {
      const v = obj && obj[k];
      if (v !== undefined && v !== null && String(v).trim() !== "") return v;
    }
    return null;
  }

  function toList(data) {
    if (Array.isArray(data)) return data;
    if (data && typeof data === "object") {
      for (const k of ["items", "data", "results", "experiments", "tools"]) {
        if (Array.isArray(data[k])) return data[k];
      }
    }
    return null;
  }

  function safeImage(value) {
    if (typeof value !== "string") return null;
    const v = value.trim();
    if (!v || /^\s*javascript:/i.test(v)) return null;
    return v;
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function itemUrl(cfg, id) {
    const page = cfg.detailPage || cfg.listPage;
    return id === null
      ? cfg.listPage
      : page + "?" + cfg.selectParam + "=" + encodeURIComponent(String(id));
  }

  // Newest first only when every record has a usable creation date;
  // otherwise keep the existing order (no invented dates).
  function recent(list) {
    const dated = list.map((item) => {
      const raw = pick(item, ["createdAt", "created_at", "created", "dateAdded", "date"]);
      const t = raw === null ? NaN : new Date(raw).getTime();
      return { item, t };
    });
    if (dated.length && dated.every((d) => Number.isFinite(d.t))) {
      dated.sort((a, b) => b.t - a.t);
    }
    return dated.map((d) => d.item);
  }

  // ---------- states ----------
  function showState(box, message, actions) {
    box.replaceChildren();
    const wrap = el("p", "home-preview__state", message);
    (actions || []).forEach((a) => wrap.appendChild(a));
    box.appendChild(wrap);
  }

  function actionLink(label, href) {
    const a = el("a", "home-preview__action", label);
    a.href = href;
    return a;
  }

  function actionButton(label, onClick) {
    const b = el("button", "home-preview__action", label);
    b.type = "button";
    b.addEventListener("click", onClick);
    return b;
  }

  // ---------- hover video preview on experiment covers (2x, muted, no controls) ----------
  const PREVIEW_SPEED = 2;
  const canHover = !window.matchMedia || window.matchMedia("(hover: hover)").matches;
  const previewUrls = new Map(); // video key -> playable url (created once)

  async function previewUrl(key) {
    if (previewUrls.has(key)) return previewUrls.get(key);
    let url = "";
    if (/^https?:\/\//i.test(key)) url = /youtu\.?be|vimeo\.com/i.test(key) ? "" : key; // embeds cannot play in <video>
    else if (typeof getVideo === "function") { const blob = await getVideo(key); url = blob ? URL.createObjectURL(blob) : ""; }
    previewUrls.set(key, url);
    return url;
  }

  function attachPreview(card, cover, key) {
    if (!canHover || !key) return;
    const video = document.createElement("video");
    video.className = "home-mini__video";
    video.muted = true; video.defaultMuted = true; video.loop = true; video.playsInline = true; video.controls = false;
    video.preload = "none"; video.tabIndex = -1; video.disablePictureInPicture = true;
    video.setAttribute("muted", ""); video.setAttribute("playsinline", ""); video.setAttribute("aria-hidden", "true");
    video.defaultPlaybackRate = PREVIEW_SPEED; video.playbackRate = PREVIEW_SPEED;
    ["loadedmetadata", "play"].forEach((name) => video.addEventListener(name, () => { video.playbackRate = PREVIEW_SPEED; }));
    video.addEventListener("playing", () => video.classList.add("is-active"));
    video.addEventListener("contextmenu", (event) => event.preventDefault());
    let wanted = false;
    async function start() {
      wanted = true;
      try {
        if (!video.getAttribute("src")) { const url = await previewUrl(key); if (!url) return; video.src = url; }
        if (!wanted) return;
        video.currentTime = 0; video.playbackRate = PREVIEW_SPEED;
        await video.play(); video.playbackRate = PREVIEW_SPEED;
      } catch (error) { /* blocked or unreadable: the cover image stays visible */ }
    }
    function stop() { wanted = false; video.pause(); if (video.getAttribute("src")) video.currentTime = 0; video.classList.remove("is-active"); }
    cover.addEventListener("mouseenter", start);
    cover.addEventListener("mouseleave", stop);
    card.appendChild(video);
  }

  // ---------- renderers ----------
  function experimentCard(cfg, item) {
    const id = pick(item, ["id", "_id", "slug"]);
    const title = pick(item, ["title", "name"]);
    if (title === null) return null;

    const a = el("a", "home-mini");
    a.href = itemUrl(cfg, id);

    const img = safeImage(pick(item, ["cover", "thumbnail", "image", "imageUrl", "image_url"]));
    if (img) {
      const i = el("img", "home-mini__img");
      i.src = img;
      i.alt = "";
      i.loading = "lazy";
      a.appendChild(i);
    } else {
      const s = el("span", "home-mini__img");
      s.setAttribute("aria-hidden", "true");
      a.appendChild(s);
    }

    attachPreview(a, a.firstElementChild, item.video);

    a.appendChild(el("strong", "", String(title)));

    const num = pick(item, ["number", "experimentNumber", "experiment_number", "no", "order"]);
    if (num !== null) a.appendChild(el("small", "", "Experiment " + num));

    // Optional completion status from the real sub-experiments
    const subs = Array.isArray(item.subExperiments) ? item.subExperiments : [];
    if (subs.length) {
      const done = subs.filter((s) => s && s.completed).length;
      a.appendChild(el("span", "home-mini__badge", done + " of " + subs.length + " completed"));
    }

    return a;
  }

  function toolCard(cfg, item) {
    const id = pick(item, ["id", "_id", "slug"]);
    const name = pick(item, ["name", "title"]);
    if (name === null) return null;

    const a = el("a", "home-tool");
    a.href = itemUrl(cfg, id);

    const logo = safeImage(pick(item, ["image", "logo", "imageUrl", "image_url", "thumbnail"]));
    if (logo) {
      const i = el("img", "home-tool__logo");
      i.src = logo;
      i.alt = "";
      i.loading = "lazy";
      a.appendChild(i);
    } else {
      const b = el("span", "home-tool__logo home-tool__logo--blank", String(name).charAt(0).toUpperCase());
      b.setAttribute("aria-hidden", "true");
      a.appendChild(b);
    }

    a.appendChild(el("strong", "", String(name)));
    const desc = pick(item, ["description", "shortDescription", "short_description"]);
    if (desc !== null) a.appendChild(el("small", "", String(desc)));
    const cat = pick(item, ["category"]);
    if (cat !== null) a.appendChild(el("span", "home-tool__cat", String(cat)));
    return a;
  }

  // ---------- loader ----------
  async function load(kind, build) {
    const cfg = CONFIG[kind];
    const box = document.getElementById(cfg.container);
    if (!box) return;

    showState(box, "Loading " + kind + "...");

    try {
      if (typeof apiRequest !== "function") throw new Error("apiRequest() is missing. Check shared.js.");

      const list = toList(await apiRequest(cfg.endpoint));
      if (!list) throw new Error("Unexpected response from " + cfg.endpoint);

      const cards = recent(list)
        .map((item) => build(cfg, item))
        .filter(Boolean)
        .slice(0, cfg.limit);

      if (!cards.length) {
        showState(box, cfg.emptyText, [actionLink(cfg.addLabel, cfg.addUrl)]);
        return;
      }
      box.replaceChildren(...cards);
    } catch (error) {
      console.error("Could not load " + kind + " preview:", error);
      showState(box, "Could not load " + kind + ".", [actionButton("Retry", () => load(kind, build))]);
    }
  }

  function run(force) {
    if (document.visibilityState === "hidden") return;
    const now = Date.now();
    if (!force && now - lastRun < COOLDOWN) return;
    lastRun = now;
    load("experiments", experimentCard);
    load("tools", toolCard);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => run(true));
  } else {
    run(true);
  }
  window.addEventListener("pageshow", (e) => { if (e.persisted) run(true); });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") run(false);
  });

  window.refreshHomePreview = () => run(true);
})();