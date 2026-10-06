const homeCountElements = {
  modules: document.getElementById("homeCountModules"),
  experiments: document.getElementById("homeCountExperiments"),
  tools: document.getElementById("homeCountTools"),
  resources: document.getElementById("homeCountResources"),
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
    for (const [key, element] of Object.entries(homeCountElements)) {
      if (!element) continue;
      const count = counts[key];
      if (!Number.isInteger(count) || count < 0) {
        throw new Error(`The server returned an invalid ${key} count.`);
      }
      element.textContent = formatHomeCount(key, count);
      element.removeAttribute("title");
    }
  } catch (error) {
    console.error("Could not load Home card counts:", error);
    for (const element of Object.values(homeCountElements)) {
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
