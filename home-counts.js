// ========================================
// HOME PAGE COUNTS
// ========================================

// Home page card count elements
const homeCountElements = {
  modules: document.getElementById("homeCountModules"),
  experiments: document.getElementById("homeCountExperiments"),
  tools: document.getElementById("homeCountTools"),
  resources: document.getElementById("homeCountResources"),
};

// Optional overview elements
const homeOverviewElements = {
  modules: document.getElementById("homeOverviewModules"),
  experiments: document.getElementById("homeOverviewExperiments"),
  tools: document.getElementById("homeOverviewTools"),
  resources: document.getElementById("homeOverviewResources"),
};

let homeCountsLoading = false;

// Format count labels
function formatHomeCount(key, count) {
  const labels = {
    modules: ["module", "modules"],
    experiments: ["experiment", "experiments"],
    tools: ["tool", "tools"],
    resources: ["resource", "resources"],
  };

  const label = labels[key];

  if (!label) {
    return `${count} items available`;
  }

  return `${count} ${label[count === 1 ? 0 : 1]} available`;
}

// Load and update counts
async function refreshHomeCounts() {
  if (homeCountsLoading) return;
  if (document.visibilityState === "hidden") return;

  homeCountsLoading = true;

  try {
    const counts = await apiRequest("/home-counts");

    if (!counts || typeof counts !== "object") {
      throw new Error("Invalid response from the server.");
    }

    for (const key of Object.keys(homeCountElements)) {
      const count = counts[key];

      if (!Number.isInteger(count) || count < 0) {
        throw new Error(`Invalid ${key} count returned by the server.`);
      }

      // Update home card
      const card = homeCountElements[key];

      if (card) {
        card.textContent = formatHomeCount(key, count);
        card.removeAttribute("title");
      }

      // Update overview only if it exists
      const overview = homeOverviewElements[key];

      if (overview) {
        overview.textContent = String(count).padStart(2, "0");
        overview.removeAttribute("title");
      }
    }
  } catch (error) {
    console.error("Could not load Home card counts:", error);

    const allElements = [
      ...Object.values(homeCountElements),
      ...Object.values(homeOverviewElements),
    ];

    allElements.forEach((element) => {
      if (!element) return;

      element.textContent = "Count unavailable";
      element.title = error?.message || "Unable to load counts.";
    });
  } finally {
    homeCountsLoading = false;
  }
}

// Initial page load
refreshHomeCounts();

// Refresh when returning to the page
window.addEventListener("pageshow", refreshHomeCounts);

// Refresh when browser window receives focus
window.addEventListener("focus", refreshHomeCounts);

// Refresh when the tab becomes visible
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    refreshHomeCounts();
  }
});