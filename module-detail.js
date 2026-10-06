const detailRoot = document.getElementById("moduleDetail");
const moduleId = new URLSearchParams(location.search).get("id");

function renderModuleDetail(module) {
  document.title = `${module.title} – Data Science Digital Laboratory`;
  detailRoot.replaceChildren();

  const eyebrow = document.createElement("p");
  eyebrow.className = "home-detail__eyebrow";
  eyebrow.textContent = "Learning module";
  const title = document.createElement("h1");
  title.textContent = module.title;
  const description = document.createElement("p");
  description.className = "home-detail__lead";
  description.textContent = module.description;
  detailRoot.append(eyebrow, title, description);

  if (module.cover) {
    const cover = document.createElement("img");
    cover.className = "module-detail__cover";
    cover.src = module.cover;
    cover.alt = `${module.title} cover`;
    detailRoot.appendChild(cover);
  }

  const topicsPanel = document.createElement("section");
  topicsPanel.className = "home-detail__panel module-detail__topics";
  const topicsHeading = document.createElement("h2");
  topicsHeading.textContent = "Topics";
  topicsPanel.appendChild(topicsHeading);
  for (const topic of module.topics) {
    const item = document.createElement("article");
    item.className = "module-detail__topic";
    const topicTitle = document.createElement("h3");
    topicTitle.textContent = topic.title;
    const content = document.createElement("p");
    content.textContent = topic.content;
    item.append(topicTitle, content);
    topicsPanel.appendChild(item);
  }
  detailRoot.appendChild(topicsPanel);

  if (module.files.length) {
    const filesPanel = document.createElement("section");
    filesPanel.className = "home-detail__panel module-detail__files";
    const filesHeading = document.createElement("h2");
    filesHeading.textContent = "Videos and PDF notes";
    filesPanel.appendChild(filesHeading);
    for (const file of module.files) {
      const url = `${API_BASE}/module-files/${encodeURIComponent(file.id)}`;
      if (file.contentType.startsWith("video/")) {
        const item = document.createElement("div");
        item.className = "module-detail__file";
        const label = document.createElement("h3");
        label.textContent = file.name;
        const video = document.createElement("video");
        video.controls = true;
        video.preload = "metadata";
        video.src = url;
        video.setAttribute("aria-label", file.name);
        item.append(label, video);
        filesPanel.appendChild(item);
      } else {
        const link = document.createElement("a");
        link.className = "module-detail__pdf";
        link.href = url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = `Open PDF: ${file.name}`;
        filesPanel.appendChild(link);
      }
    }
    detailRoot.appendChild(filesPanel);
  }

  const back = document.createElement("a");
  back.className = "home-detail__back";
  back.href = "modules.html";
  back.textContent = "← Back to Modules";
  detailRoot.appendChild(back);
}

async function loadModuleDetail() {
  if (!moduleId) {
    detailRoot.textContent = "No module was selected.";
    return;
  }
  try {
    renderModuleDetail(await apiRequest(`/modules/${encodeURIComponent(moduleId)}`));
  } catch (error) {
    detailRoot.textContent = `Could not load module: ${error.message}`;
  }
}

loadModuleDetail();
