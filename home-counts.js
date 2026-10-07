const homeCountElements = {
  modules: document.getElementById("homeCountModules"),
  experiments: document.getElementById("homeCountExperiments"),
  tools: document.getElementById("homeCountTools"),
  resources: document.getElementById("homeCountResources"),
};
const homeOverviewElements = {
  modules: document.getElementById("homeOverviewModules"),
  experiments: document.getElementById("homeOverviewExperiments"),
  tools: document.getElementById("homeOverviewTools"),
  resources: document.getElementById("homeOverviewResources"),
};

let homeCountsLoading = false;

function formatHomeCount(key, count) {
  const labels = {
    modules: ["module", "modules"],
    experiments: ["experiment", "experiments"],
    tools: ["tool", "tools"],
    resources: ["resource", "resources"],
  };
  return `${count} ${labels[key][count === 1 ? 0 : 1]} available`;
}

async function refreshHomeCounts() {
  if (homeCountsLoading || document.visibilityState === "hidden") return;
  homeCountsLoading = true;
  try {
    const counts = await apiRequest("/home-counts");
    for (const key of Object.keys(homeCountElements)) {
      const count = counts[key];
      if (!Number.isInteger(count) || count < 0) {
        throw new Error(`The server returned an invalid ${key} count.`);
      }
      const card = homeCountElements[key];
      if (card) {
        card.textContent = formatHomeCount(key, count);
        card.removeAttribute("title");
      }
      const overview = homeOverviewElements[key];
      if (overview) {
        overview.textContent = String(count).padStart(2, "0");
        overview.removeAttribute("title");
      }
    }
  } catch (error) {
    console.error("Could not load Home card counts:", error);
    for (const element of [...Object.values(homeCountElements), ...Object.values(homeOverviewElements)]) {
      if (!element) continue;
      element.textContent = "Count unavailable";
      element.title = error.message;
    }
  } finally {
    homeCountsLoading = false;
  }
}

refreshHomeCounts();
window.addEventListener("pageshow", refreshHomeCounts);
window.addEventListener("focus", refreshHomeCounts);
document.addEventListener("visibilitychange", refreshHomeCounts);
