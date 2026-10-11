const detailRoot = document.getElementById("moduleDetail");
const params = new URLSearchParams(location.search);
const moduleId = params.get("id");
const view = params.get("view") || "detail";
const selectedTopicId = params.get("topic");

function makeElement(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function moduleUrl(module, resourceView = "detail", topicId = "") {
  const url = new URL("module.html", location.href);
  url.searchParams.set("id", module.id);
  if (resourceView !== "detail") url.searchParams.set("view", resourceView);
  if (topicId) url.searchParams.set("topic", topicId);
  return `${url.pathname.split("/").pop()}${url.search}`;
}

function topicPdfUrl(topic) {
  if (topic.pdfFile) return `${API_BASE}/module-files/${encodeURIComponent(topic.pdfFile.id)}`;
  return topic.pdfUrl || "";
}

function topicVideoUrl(topic) {
  if (topic.videoFile) return `${API_BASE}/module-files/${encodeURIComponent(topic.videoFile.id)}`;
  return topic.videoUrl || "";
}

function safePdfFilename(title) {
  const slug = String(title || "Topic")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `${slug || "Topic"}.pdf`;
}

function youtubeEmbedUrl(source) {
  try {
    const url = new URL(source);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    let videoId = "";
    if (host === "youtu.be") {
      videoId = url.pathname.split("/").filter(Boolean)[0] || "";
    } else if (host === "youtube.com" || host.endsWith(".youtube.com")) {
      videoId = url.searchParams.get("v") || url.pathname.match(/^\/(?:embed|shorts|live)\/([^/]+)/)?.[1] || "";
    }
    if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) return "";
    return `https://www.youtube-nocookie.com/embed/${videoId}`;
  } catch (error) {
    return "";
  }
}

function renderPageHeading(module, subtitle) {
  const eyebrow = makeElement("p", "home-detail__eyebrow", subtitle);
  const title = makeElement("h1", "", module.title);
  const description = makeElement("p", "home-detail__lead", module.description || "");
  detailRoot.append(eyebrow, title);
  if (description.textContent) detailRoot.appendChild(description);
}

function renderBackLink(module, href, label) {
  const back = makeElement("a", "home-detail__back", label);
  back.href = href;
  detailRoot.appendChild(back);
}

function renderResourceList(module, resourceType) {
  const isPdf = resourceType === "notes";
  const label = isPdf ? "Notes & PDFs" : "Video Lessons";
  document.title = `${module.title} — ${label} – Data Science Digital Laboratory`;
  renderPageHeading(module, `Learning module · ${label}`);

  const backPanel = makeElement("div", "module-resource-list__back");
  const back = makeElement("a", "home-detail__back", "← Back to Module");
  back.href = moduleUrl(module);
  backPanel.appendChild(back);
  detailRoot.appendChild(backPanel);

  const topics = Array.isArray(module.topics) ? module.topics : [];
  if (!topics.length) {
    detailRoot.appendChild(makeElement("p", "module-resource-list__empty", "No topics available yet."));
    return;
  }

  const list = makeElement("section", "module-resource-list");
  list.setAttribute("aria-label", `${label} by topic`);
  for (const [index, topic] of topics.entries()) {
    const item = makeElement("article", "module-resource-topic");
    const number = makeElement("span", "module-detail__topic-number", `Topic ${index + 1}`);
    const name = makeElement("h2", "module-resource-topic__title", topic.title);
    const hasResource = isPdf ? Boolean(topicPdfUrl(topic)) : Boolean(topicVideoUrl(topic));
    const resourceUrl = isPdf ? topicPdfUrl(topic) : topicVideoUrl(topic);
    item.append(number, name);
    if (hasResource) {
      item.appendChild(makeElement("p", "module-resource-topic__available",
        isPdf ? "PDF available" : "Video available"));
      const action = makeElement("a", "btn btn--primary module-resource-topic__action",
        isPdf ? "View PDF" : "Watch Video");
      action.href = moduleUrl(module, isPdf ? "pdf" : "video", topic.id);
      item.appendChild(action);
      if (isPdf) {
        const download = makeElement("button", "btn btn--ghost module-resource-topic__download", "Download PDF");
        download.type = "button";
        const status = makeElement("p", "module-resource-topic__status");
        status.hidden = true;
        const fallback = makeElement("a", "module-detail__pdf", "Open PDF in a new tab");
        fallback.href = resourceUrl;
        fallback.target = "_blank";
        fallback.rel = "noopener noreferrer";
        fallback.hidden = true;
        download.addEventListener("click", () => downloadPdf(resourceUrl, topic.title, status, fallback));
        item.append(download, status, fallback);
      }
    } else {
      item.appendChild(makeElement("p", "module-resource-topic__unavailable",
        isPdf ? "PDF not available" : "Video not available"));
    }
    list.appendChild(item);
  }
  detailRoot.appendChild(list);
}

async function downloadPdf(url, title, status, fallback) {
  status.hidden = false;
  status.classList.remove("is-error");
  status.textContent = "Preparing download...";
  fallback.hidden = true;
  try {
    const downloadUrl = new URL(url, location.href);
    if (downloadUrl.origin === location.origin && downloadUrl.pathname.includes("/module-files/")) {
      downloadUrl.searchParams.set("download", "1");
      downloadUrl.searchParams.set("downloadName", safePdfFilename(title));
    }
    const response = await fetch(downloadUrl);
    if (!response.ok) throw new Error(`The file server returned ${response.status}.`);
    const blob = await response.blob();
    if (!blob.size) throw new Error("The PDF file is empty.");
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = safePdfFilename(title);
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    status.textContent = "Download started.";
  } catch (error) {
    status.textContent = `Could not download this PDF: ${error.message}`;
    status.classList.add("is-error");
    fallback.hidden = false;
  }
}

function renderPdfViewer(module, topic) {
  document.title = `${topic.title} — PDF – Data Science Digital Laboratory`;
  renderPageHeading(module, "Notes & PDFs");
  detailRoot.appendChild(makeElement("h2", "module-resource-viewer__title", topic.title));
  const pdfUrl = topicPdfUrl(topic);
  if (!pdfUrl) {
    detailRoot.appendChild(makeElement("p", "module-resource-list__empty", "PDF not available for this topic."));
    renderBackLink(module, moduleUrl(module, "notes"), "← Back to Notes & PDFs");
    return;
  }
  const viewer = makeElement("iframe", "module-resource-viewer__pdf");
  viewer.src = pdfUrl;
  viewer.title = `${topic.title} PDF viewer`;
  viewer.loading = "eager";
  const loading = makeElement("p", "module-resource-viewer__loading", "Loading PDF...");
  loading.setAttribute("role", "status");
  viewer.addEventListener("load", () => { loading.hidden = true; });
  viewer.addEventListener("error", () => {
    const error = document.getElementById("pdfViewerError");
    if (error) error.hidden = false;
  });
  detailRoot.append(loading, viewer);
  const error = makeElement("p", "module-resource-viewer__error", "The PDF may not be available inline. Use the link below to open it in a new tab.");
  error.id = "pdfViewerError";
  error.hidden = true;
  const open = makeElement("a", "module-detail__pdf", "Open PDF in a new tab");
  open.href = pdfUrl;
  open.target = "_blank";
  open.rel = "noopener noreferrer";
  const retry = makeElement("button", "btn btn--ghost module-resource-viewer__retry", "Retry PDF");
  retry.type = "button";
  retry.addEventListener("click", () => {
    error.hidden = true;
    loading.hidden = false;
    viewer.src = "about:blank";
    setTimeout(() => { viewer.src = pdfUrl; }, 60);
  });
  detailRoot.append(error, open, retry);
  renderBackLink(module, moduleUrl(module, "notes"), "← Back to Notes & PDFs");
}

function renderVideoViewer(module, topic) {
  document.title = `${topic.title} — Video Lesson – Data Science Digital Laboratory`;
  renderPageHeading(module, "Video Lessons");
  detailRoot.appendChild(makeElement("h2", "module-resource-viewer__title", topic.title));
  const source = topicVideoUrl(topic);
  if (!source) {
    detailRoot.appendChild(makeElement("p", "module-resource-list__empty", "Video not available for this topic."));
    renderBackLink(module, moduleUrl(module, "videos"), "← Back to Video Lessons");
    return;
  }
  const embedUrl = youtubeEmbedUrl(source);
  if (embedUrl) {
    const player = makeElement("iframe", "module-resource-viewer__video");
    player.src = embedUrl;
    player.title = `${topic.title} video lesson`;
    player.allow = "accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
    player.allowFullscreen = true;
    detailRoot.appendChild(player);
  } else {
    const player = document.createElement("video");
    player.className = "module-resource-viewer__video";
    player.controls = true;
    player.preload = "metadata";
    player.src = source;
    player.setAttribute("aria-label", `${topic.title} video lesson`);
    const error = makeElement("p", "module-resource-viewer__error", "This video could not be loaded. Check the connection or try again.");
    error.hidden = true;
    const retry = makeElement("button", "btn btn--ghost", "Retry video");
    retry.type = "button";
    retry.addEventListener("click", () => {
      error.hidden = true;
      player.load();
    });
    player.addEventListener("error", () => { error.hidden = false; });
    detailRoot.append(player, error, retry);
  }
  renderBackLink(module, moduleUrl(module, "videos"), "← Back to Video Lessons");
}

function renderModuleDetail(module) {
  document.title = `${module.title} – Data Science Digital Laboratory`;
  renderPageHeading(module, "Learning module");

  if (module.cover) {
    const cover = document.createElement("img");
    cover.className = "module-detail__cover";
    cover.src = module.cover;
    cover.alt = `${module.title} cover`;
    detailRoot.appendChild(cover);
  }

  const topicsPanel = makeElement("section", "home-detail__panel module-detail__topics");
  topicsPanel.appendChild(makeElement("h2", "", "Topics"));
  const topics = Array.isArray(module.topics) ? module.topics : [];
  for (const [index, topic] of topics.entries()) {
    const item = makeElement("article", "module-detail__topic");
    item.append(
      makeElement("p", "module-detail__topic-number", `Topic ${index + 1}`),
      makeElement("h3", "", topic.title),
    );
    if (topic.content) item.appendChild(makeElement("p", "", topic.content));
    const pdfUrl = topicPdfUrl(topic);
    if (pdfUrl) {
      const links = makeElement("div", "module-detail__file-actions");
      const viewPdf = makeElement("a", "module-detail__pdf", "📄 View PDF");
      viewPdf.href = moduleUrl(module, "pdf", topic.id);
      const download = makeElement("a", "module-detail__pdf", "⬇ Download PDF");
      download.href = pdfUrl;
      download.download = safePdfFilename(topic.title);
      if (!pdfUrl.startsWith(API_BASE)) { // outside links cannot be downloaded in place: open them in a new tab
        download.target = "_blank";
        download.rel = "noopener noreferrer";
      }
      links.append(viewPdf, download);
      item.appendChild(links);
    }
    const videoUrl = topicVideoUrl(topic);
    if (videoUrl) {
      const videoLink = makeElement("a", "module-detail__pdf", "▶ Watch Video");
      videoLink.href = moduleUrl(module, "video", topic.id);
      item.appendChild(videoLink);
    }
    topicsPanel.appendChild(item);
  }
  if (!topics.length) topicsPanel.appendChild(makeElement("p", "", "No topics available yet."));
  detailRoot.appendChild(topicsPanel);

  const importantQuestions = module.importantQuestions || {};
  const questionText = String(importantQuestions.text || "").trim();
  const questionPdf = importantQuestions.pdfFile;
  if (questionText || questionPdf) {
    const panel = makeElement("section", "home-detail__panel module-detail__questions");
    panel.appendChild(makeElement("h2", "", "Important Questions"));
    if (questionText) panel.appendChild(makeElement("p", "module-detail__questions-text", questionText));
    if (questionPdf) {
      const pdfUrl = `${API_BASE}/important-question-files/${encodeURIComponent(questionPdf.id)}`;
      const links = makeElement("div", "module-detail__file-actions");
      const viewPdf = makeElement("a", "module-detail__pdf", "📄 View Important Questions PDF");
      viewPdf.href = pdfUrl;
      viewPdf.target = "_blank";
      viewPdf.rel = "noopener noreferrer";
      const download = makeElement("a", "module-detail__pdf", "⬇ Download PDF");
      download.href = `${pdfUrl}?download=1`;
      download.download = questionPdf.name;
      links.append(viewPdf, download);
      panel.appendChild(links);
    }
    detailRoot.appendChild(panel);
  }

  const moduleFiles = Array.isArray(module.files) ? module.files : [];
  if (moduleFiles.length) {
    const panel = makeElement("section", "home-detail__panel module-detail__files");
    panel.appendChild(makeElement("h2", "", "Additional module files"));
    for (const file of moduleFiles) {
      const url = `${API_BASE}/module-files/${encodeURIComponent(file.id)}`;
      if (String(file.contentType || "").startsWith("video/")) {
        const item = makeElement("div", "module-detail__file");
        const label = makeElement("h3", "", file.name);
        const video = document.createElement("video");
        video.controls = true;
        video.preload = "metadata";
        video.src = url;
        video.setAttribute("aria-label", file.name);
        item.append(label, video);
        panel.appendChild(item);
      } else {
        const link = makeElement("a", "module-detail__pdf", `Open PDF: ${file.name}`);
        link.href = url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        panel.appendChild(link);
      }
    }
    detailRoot.appendChild(panel);
  }

  renderBackLink(module, "modules.html", "← Back to Modules");
}

async function loadModuleDetail() {
  if (!moduleId) {
    detailRoot.textContent = "No module was selected.";
    return;
  }
  try {
    const module = await apiRequest(`/modules/${encodeURIComponent(moduleId)}`);
    const topics = Array.isArray(module.topics) ? module.topics : [];
    detailRoot.replaceChildren();
    if (view === "notes" || view === "videos") {
      renderResourceList(module, view);
    } else if (view === "pdf" || view === "video") {
      const topic = topics.find((item) => String(item.id) === selectedTopicId);
      if (!topic) {
        detailRoot.textContent = "The selected topic could not be found.";
        return;
      }
      if (view === "pdf") renderPdfViewer(module, topic);
      else renderVideoViewer(module, topic);
    } else {
      renderModuleDetail(module);
    }
  } catch (error) {
    detailRoot.textContent = `Could not load module: ${error.message}`;
  }
}

loadModuleDetail();