/* =========================================================
   HOME PAGE — card counts
   Fills #homeCountModules / Experiments / Tools / Resources (and the
   optional #homeOverview* elements) from GET /home-counts via apiRequest()
   in shared.js.

   Keep this logic in ONE file only. If home.js still contains a copy of
   it, remove that copy.
   ========================================================= */
(function () {
  "use strict";

  if (window.__dslHomeCounts) return; // never start twice
  window.__dslHomeCounts = true;

  const KEYS = ["modules", "experiments", "tools", "resources"];
  const LABELS = {
    modules: ["module", "modules"],
    experiments: ["experiment", "experiments"],
    tools: ["tool", "tools"],
    resources: ["resource", "resources"],
  };
  const COOLDOWN = 1500;

  let inflight = null;
  let lastRequest = 0;

  const cap = (key) => key.charAt(0).toUpperCase() + key.slice(1);
  const cardEl = (key) => document.getElementById("homeCount" + cap(key));
  const overviewEl = (key) => document.getElementById("homeOverview" + cap(key));

  function formatHomeCount(key, count) {
    const labels = LABELS[key];
    if (!labels) return `${count} items available`;
    return `${count} ${labels[count === 1 ? 0 : 1]} available`;
  }

  function updateHomeCount(key, count) {
    const card = cardEl(key);
    const overview = overviewEl(key);
    if (card) {
      card.textContent = formatHomeCount(key, count);
      card.removeAttribute("title");
    }
    if (overview) {
      overview.textContent = String(count);
      overview.removeAttribute("title");
    }
  }

  function showHomeCountError(key, message) {
    [cardEl(key), overviewEl(key)].forEach((el) => {
      if (!el) return;
      el.textContent = "Unavailable";
      el.title = message;
    });
  }

  // True while an element still shows its placeholder ("Loading count...", "Loading...", "—").
  function isLoading(el) {
    const text = el.textContent.trim();
    return text === "" || text === "—" || /^loading/i.test(text);
  }

  // Accept 3 or "3"; reject negatives, decimals and junk.
  function toCount(value) {
    const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
    return Number.isSafeInteger(n) && n >= 0 ? n : null;
  }

  async function refreshHomeCounts(force = false) {
    if (!KEYS.some((k) => cardEl(k) || overviewEl(k))) return; // not the home page
    if (document.visibilityState === "hidden") return;
    if (inflight) return inflight;

    const now = Date.now();
    if (!force && now - lastRequest < COOLDOWN) return;
    lastRequest = now;

    inflight = (async () => {
      try {
        if (typeof apiRequest !== "function") {
          throw new Error("apiRequest() is missing. Check shared.js.");
        }

        const counts = await apiRequest("/home-counts");
        if (!counts || typeof counts !== "object" || Array.isArray(counts)) {
          throw new Error("The server returned an invalid counts response.");
        }

        KEYS.forEach((key) => {
          const count = toCount(counts[key]);
          if (count === null) {
            showHomeCountError(key, `Invalid ${key} count returned by the server.`);
            console.error(`Invalid Home count for "${key}":`, counts[key]);
            return;
          }
          updateHomeCount(key, count);
        });
      } catch (error) {
        console.error("Could not load Home page counts:", error);
        const message = error instanceof Error ? error.message : "Unable to load counts.";

        // Only replace placeholders; counts that already loaded stay as they are.
        KEYS.forEach((key) => {
          [cardEl(key), overviewEl(key)].forEach((el) => {
            if (el && isLoading(el)) {
              el.textContent = "Unavailable";
              el.title = message;
            }
          });
        });
      } finally {
        inflight = null;
      }
    })();

    return inflight;
  }

  function init() { refreshHomeCounts(); }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  window.addEventListener("pageshow", () => refreshHomeCounts(true));
  window.addEventListener("focus", () => refreshHomeCounts());
  window.addEventListener("online", () => refreshHomeCounts(true));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") refreshHomeCounts(true);
  });

  window.refreshHomeCounts = refreshHomeCounts;
})();