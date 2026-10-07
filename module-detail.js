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
  const topics = Array.isArray(module.topics) ? module.topics : [];
  for (const [index, topic] of topics.entries()) {
    const item = document.createElement("article");
    item.className = "module-detail__topic";
    const number = document.createElement("p");
    number.className = "module-detail__topic-number";
    number.textContent = `Topic ${index + 1}`;
    const topicTitle = document.createElement("h3");
    topicTitle.textContent = topic.title;
    const content = document.createElement("p");
    content.textContent = topic.content;
    item.append(number, topicTitle);
    if (topic.content) item.appendChild(content);
    if (topic.pdfFile) {
      const pdfUrl = `${API_BASE}/module-files/${encodeURIComponent(topic.pdfFile.id)}`;
      const links = document.createElement("div");
      links.className = "module-detail__file-actions";
      const view = document.createElement("a");
      view.className = "module-detail__pdf";
      view.href = pdfUrl;
      view.target = "_blank";
      view.rel = "noopener noreferrer";
      view.textContent = "📄 View PDF";
      const download = document.createElement("a");
      download.className = "module-detail__pdf";
      download.href = `${pdfUrl}?download=1`;
      download.setAttribute("download", topic.pdfFile.name);
      download.textContent = "⬇ Download PDF";
      links.append(view, download);
      item.appendChild(links);
    }
    if (topic.videoFile) {
      const video = document.createElement("video");
      video.controls = true;
      video.preload = "metadata";
      video.src = `${API_BASE}/module-files/${encodeURIComponent(topic.videoFile.id)}`;
      video.setAttribute("aria-label", `${topic.title} video lesson`);
      item.appendChild(video);
    }
    topicsPanel.appendChild(item);
  }
  detailRoot.appendChild(topicsPanel);

  const importantQuestions = module.importantQuestions || {};
  const questionText = String(importantQuestions.text || "").trim();
  const questionPdf = importantQuestions.pdfFile;
  if (questionText || questionPdf) {
    const questionsPanel = document.createElement("section");
    questionsPanel.className = "home-detail__panel module-detail__questions";
    const questionsHeading = document.createElement("h2");
    questionsHeading.textContent = "Important Questions";
    questionsPanel.appendChild(questionsHeading);
    if (questionText) {
      const text = document.createElement("p");
      text.className = "module-detail__questions-text";
      text.textContent = questionText;
      questionsPanel.appendChild(text);
    }
    if (questionPdf) {
      const pdfUrl = `${API_BASE}/important-question-files/${encodeURIComponent(questionPdf.id)}`;
      const links = document.createElement("div");
      links.className = "module-detail__file-actions";
      const view = document.createElement("a");
      view.className = "module-detail__pdf";
      view.href = pdfUrl;
      view.target = "_blank";
      view.rel = "noopener noreferrer";
      view.textContent = "📄 View Important Questions PDF";
      const download = document.createElement("a");
      download.className = "module-detail__pdf";
      download.href = `${pdfUrl}?download=1`;
      download.setAttribute("download", questionPdf.name);
      download.textContent = "⬇ Download PDF";
      links.append(view, download);
      questionsPanel.appendChild(links);
    }
    detailRoot.appendChild(questionsPanel);
  }

  const moduleFiles = Array.isArray(module.files) ? module.files : [];
  if (moduleFiles.length) {
    const filesPanel = document.createElement("section");
    filesPanel.className = "home-detail__panel module-detail__files";
    const filesHeading = document.createElement("h2");
    filesHeading.textContent = "Additional module files";
    filesPanel.appendChild(filesHeading);
    for (const file of moduleFiles) {
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
