/* Experiment Details and Sub-Experiment Details (experiment.html?id=<id>[&sub=<letter>][&topic=<topicId>]).
   Uses shared.js (el, apiRequest, normalizeExperiment, getVideo), d2-format.js (renderD2Topics) and d2-pdf.js (downloadD2Pdf). */
const detail = document.getElementById("detail");
const DOWNLOAD_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m0 0-4-4m4 4 4-4M5 21h14"/></svg>`;
const ARROW_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>`;

// Headings found in the real content that get their own quick-jump tab
const TAB_DEFS = [
  ["Aim", /^(?:aim|objectives?|purpose)\s*:?$/i],
  ["Tools", /^tools(?:\s+used)?\s*:?$/i],
  ["Materials", /^(?:materials?|requirements|resources|references)\s*:?$/i],
  ["Program", /^(?:program(?:\s+solution)?|solution|sample\s+program)\s*:?$/i],
  ["Output", /^(?:sample\s+|expected\s+)?output\s*:?$/i],
  ["Result", /^(?:result|conclusion)\s*:?$/i],
];
const tabLabelFor = (text) => {
  const match = TAB_DEFS.find(([, pattern]) => pattern.test(String(text || "").trim()));
  return match ? match[0] : "";
};
const topicHeading = (topic) => String(topic.heading || "").replace(/^#{1,6}\s*/, "").trim();
const padNumber = (value) => (/^\d+$/.test(String(value)) ? String(value).padStart(2, "0") : String(value));

function experimentUrl(experiment, sub, topicId) {
  let url = `experiment.html?id=${encodeURIComponent(experiment.id)}`;
  if (sub) url += `&sub=${encodeURIComponent(sub.letter)}`;
  if (topicId) url += `&topic=${encodeURIComponent(topicId)}`;
  return url;
}

function createLink(className, href, text) {
  const link = el("a", className, text);
  link.href = href;
  return link;
}

function createGithubButton(url) {
  const link = el("a", "btn btn--primary btn--gh exp-github__btn");
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.innerHTML = `<span>View on GitHub</span><span aria-hidden="true">→</span>`;
  return link;
}

/* ------------------------------------------------------------ video support */
// Hover plays from 00:00 on desktops, leaving pauses and resets; pressing Play switches to normal playback.
function enableHoverPlayback(video) {
  if (window.matchMedia && !window.matchMedia("(hover: hover)").matches) return;
  let mode = "idle";
  let requested = false;
  video.addEventListener("mouseenter", () => {
    if (mode === "manual" || !video.paused) return;
    mode = "hover"; requested = true; video.currentTime = 0;
    video.play().catch(() => { requested = false; if (mode === "hover" && video.paused) mode = "idle"; });
  });
  video.addEventListener("mouseleave", () => {
    if (mode !== "hover") return;
    if (document.fullscreenElement === video || video.webkitDisplayingFullscreen) { mode = "manual"; return; }
    mode = "idle"; requested = false; video.pause(); video.currentTime = 0;
  });
  video.addEventListener("play", () => { mode = requested ? "hover" : "manual"; requested = false; });
  video.addEventListener("pause", () => { if (!video.ended) mode = "idle"; });
  video.addEventListener("ended", () => { if (mode === "manual") mode = "idle"; });
  ["pointerdown", "keydown"].forEach((type) => video.addEventListener(type, () => { if (mode === "hover") mode = "manual"; }));
}

// The cover image shows first; it is swapped for the player once the saved video can be read
async function attachVideo(slot, key) {
  if (!key) return;
  try {
    const blob = await getVideo(key);
    if (!blob) return;
    const video = el("video", "detail__video exp-media__video");
    video.controls = true;
    video.preload = "metadata";
    video.src = URL.createObjectURL(blob);
    enableHoverPlayback(video);
    slot.replaceChildren(video);
  } catch (error) {
    console.error("Could not load experiment video:", error);
    slot.appendChild(el("p", "exp-media__note", "The saved video could not be loaded."));
  }
}

/* ---------------------------------------------------------------- left card */
function renderInfoCard({ label, title, cover, video, githubUrl, subNav }) {
  const card = el("aside", "exp-info");
  const head = el("div", "exp-info__head");
  head.append(el("p", "exp-info__label", label), el("h1", "exp-info__title", title));
  card.appendChild(head);

  const media = el("div", "exp-media");
  if (cover) {
    const image = el("img", "exp-media__img");
    image.src = cover;
    image.alt = `${title} cover`;
    media.appendChild(image);
  }
  if (video) attachVideo(media, video);
  if (cover || video) card.appendChild(media);

  if (subNav) card.appendChild(subNav);
  if (githubUrl) {
    const github = el("div", "exp-info__section exp-github");
    github.append(el("p", "exp-info__sublabel", "GitHub Repository"), createGithubButton(githubUrl));
    card.appendChild(github);
  }
  return card;
}

function createSubNav(experiment, activeLetter) {
  if (experiment.subExperiments.length === 0) return null;
  const nav = el("nav", "exp-info__section");
  nav.setAttribute("aria-label", "Sub-experiments");
  nav.appendChild(el("p", "exp-info__sublabel", activeLetter ? "Other sub-experiments" : "Sub-experiments"));
  const row = el("div", "exp-chips");
  experiment.subExperiments.forEach((sub) => {
    const active = sub.letter === activeLetter;
    const chip = createLink("sub-btn" + (active ? " sub-btn--active" : ""), experimentUrl(experiment, sub), `Exp ${sub.letter}`);
    chip.title = sub.title;
    if (active) chip.setAttribute("aria-current", "page");
    row.appendChild(chip);
  });
  nav.appendChild(row);
  return nav;
}

/* -------------------------------------------------------------- PDF button */
function createPdfButton(pdfOptions, panel, anchor) {
  const button = el("button", "btn btn--primary btn--small exp-pdf");
  button.type = "button";
  button.innerHTML = `${DOWNLOAD_ICON}<span>Download PDF</span>`;
  button.addEventListener("click", async () => {
    button.disabled = true;
    try {
      await downloadD2Pdf(pdfOptions);
    } catch (error) {
      if (!error.isPdfMessage) console.error("PDF download failed:", error);
      panel.querySelector(".detail__pdf-note")?.remove();
      const note = el("p", "detail__pdf-note", error.isPdfMessage ? error.message : "Could not create the PDF. Please try again.");
      note.setAttribute("role", "status");
      anchor.after(note);
      setTimeout(() => note.remove(), 5000);
    } finally {
      button.disabled = false;
    }
  });
  return button;
}

/* ------------------------------------------------------------ right panel */
function sectionBlock(id, title, className = "") {
  const section = el("section", `exp-section ${className}`.trim());
  section.id = id;
  if (title) section.appendChild(el("h2", "exp-section__title", title));
  return section;
}

function renderPanel({ experiment, sub, source, label, title, topicParam }) {
  const panel = el("section", "exp-panel");
  const topics = (source.d2Topics || []).slice().sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
  const rows = topics.filter((topic) => topicHeading(topic) && !tabLabelFor(topicHeading(topic)));
  const baseId = sub ? sub.id : experiment.number;

  // ----- top bar: tabs + Download PDF
  const bar = el("div", "exp-bar");
  const tabs = el("nav", "exp-tabs");
  tabs.setAttribute("aria-label", "Sections");
  bar.appendChild(tabs);
  const hasAnything = topics.length || source.shortDescription || source.d2Content;
  const pdfHeading = source.d2Heading || "Long Description";
  if (hasAnything) {
    bar.appendChild(createPdfButton({ label, title, heading: pdfHeading, content: source.d2Content, topics: source.d2Topics }, panel, bar));
  }
  panel.appendChild(bar);

  // ----- description
  const description = sectionBlock("exp-description", "Description");
  description.appendChild(el("p", "exp-description__text", source.shortDescription || "No description has been added yet."));
  panel.appendChild(description);

  // ----- topic rows (real topics with their own headings)
  let rowsSection = null;
  let rowLinks = [];
  if (rows.length) {
    rowsSection = sectionBlock("exp-topics", sub ? "Subtopics" : "Topics");
    const list = el("ol", "exp-rows");
    rows.forEach((topic, index) => {
      const item = el("li");
      const link = el("a", "exp-row");
      link.href = experimentUrl(experiment, sub, topic.id);
      link.dataset.topic = topic.id;
      link.append(
        el("span", "exp-row__badge", `${baseId}.${index + 1}`),
        el("span", "exp-row__title", topicHeading(topic)),
        Object.assign(el("span", "exp-row__arrow"), { innerHTML: ARROW_ICON }),
      );
      item.appendChild(link);
      list.appendChild(item);
      rowLinks.push(link);
    });
    rowsSection.appendChild(list);
    panel.appendChild(rowsSection);
  }

  // ----- sub-experiments of this experiment (experiment page only)
  let subsSection = null;
  if (!sub && experiment.subExperiments.length) {
    subsSection = sectionBlock("exp-subs", "Sub-experiments");
    const list = el("ol", "exp-rows");
    experiment.subExperiments.forEach((item) => {
      const li = el("li");
      const link = el("a", "exp-row");
      link.href = experimentUrl(experiment, item);
      link.append(
        el("span", "exp-row__badge exp-row__badge--letter", `Exp ${item.letter}`),
        el("span", "exp-row__title", item.title),
        Object.assign(el("span", "exp-row__arrow"), { innerHTML: ARROW_ICON }),
      );
      li.appendChild(link);
      list.appendChild(li);
    });
    subsSection.appendChild(list);
    panel.appendChild(subsSection);
  }

  // ----- selected content
  const content = sectionBlock("exp-content", "");
  panel.appendChild(content);

  let selectedId = rows.some((topic) => topic.id === topicParam) ? topicParam : (rows[0] && rows[0].id) || "";

  function refreshTabs() {
    tabs.replaceChildren();
    const entries = [{ label: "Overview", target: description }];
    if (rowsSection) entries.push({ label: sub ? "Subtopics" : "Topics", target: rowsSection });
    if (subsSection) entries.push({ label: "Sub-experiments", target: subsSection });
    const seen = new Set();
    content.querySelectorAll(".d2-heading").forEach((heading) => {
      const tab = tabLabelFor(heading.textContent);
      if (tab && !seen.has(tab)) { seen.add(tab); entries.push({ label: tab, target: heading }); }
    });
    if (entries.length < 2) { tabs.hidden = true; return; }
    tabs.hidden = false;
    entries.forEach((entry, index) => {
      const button = el("button", "exp-tab" + (index === 0 ? " is-active" : ""), entry.label);
      button.type = "button";
      button.addEventListener("click", () => {
        tabs.querySelectorAll(".exp-tab").forEach((node) => node.classList.toggle("is-active", node === button));
        if (index === 0) window.scrollTo({ top: 0, behavior: "smooth" });
        else entry.target.scrollIntoView({ behavior: "smooth", block: "start" });
      });
      entry.button = button;
      tabs.appendChild(button);
    });
    // highlight the tab of the section currently under the header while scrolling
    panel._spy = entries;
  }

  function renderContent() {
    const inline = topics.filter((topic) => !rows.includes(topic));
    const visible = rows.length
      ? [rows.find((topic) => topic.id === selectedId), ...inline].filter(Boolean)
      : topics;
    visible.sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
    content.replaceChildren();
    if (!rows.length && visible.some((topic) => !topicHeading(topic))) {
      content.appendChild(el("h2", "exp-section__title", source.d2Heading || "Long Description"));
    }
    content.appendChild(renderD2Topics(visible));
    rowLinks.forEach((link) => {
      const active = link.dataset.topic === selectedId;
      link.classList.toggle("is-selected", active);
      if (active) link.setAttribute("aria-current", "true"); else link.removeAttribute("aria-current");
    });
    refreshTabs();
  }

  function select(topicId, { push = true, scroll = true } = {}) {
    if (!rows.some((topic) => topic.id === topicId)) return;
    selectedId = topicId;
    if (push) history.pushState({ topic: topicId }, "", experimentUrl(experiment, sub, topicId));
    renderContent();
    if (scroll) content.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  rowLinks.forEach((link) => link.addEventListener("click", (event) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button) return; // let new-tab clicks work
    event.preventDefault();
    select(link.dataset.topic);
  }));
  window.addEventListener("popstate", () => {
    const wanted = new URLSearchParams(location.search).get("topic");
    selectedId = rows.some((topic) => topic.id === wanted) ? wanted : (rows[0] && rows[0].id) || "";
    renderContent();
  });

  // scroll spy for the tab bar
  let ticking = false;
  window.addEventListener("scroll", () => {
    if (ticking || !panel._spy) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      const offset = (parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--dsl-header-h")) || 78) + 90;
      let current = panel._spy[0];
      panel._spy.forEach((entry) => { if (entry.target.getBoundingClientRect().top <= offset) current = entry; });
      panel._spy.forEach((entry) => entry.button && entry.button.classList.toggle("is-active", entry === current));
    });
  }, { passive: true });

  renderContent();
  if (topicParam && rows.length && selectedId === topicParam) {
    setTimeout(() => content.scrollIntoView({ behavior: "smooth", block: "start" }), 250);
  }
  return panel;
}

/* -------------------------------------------------------------------- page */
function renderPage(experiment, sub, topicParam) {
  const source = sub || experiment;
  const label = sub ? `Experiment ${sub.id}` : `Experiment ${experiment.number}`;

  const back = el("a", "btn btn--ghost exp-back");
  back.href = sub ? experimentUrl(experiment) : "index.html";
  back.textContent = sub ? `← Back to Experiment ${experiment.number}` : "← Back to Experiments";

  const layout = el("div", "exp-layout");
  layout.append(
    renderInfoCard({
      label,
      title: source.title,
      cover: source.cover || experiment.cover,
      video: source.video,
      githubUrl: source.githubUrl,
      subNav: createSubNav(experiment, sub ? sub.letter : null),
    }),
    renderPanel({ experiment, sub, source, label, title: source.title, topicParam }),
  );
  detail.replaceChildren(back, layout);
  document.title = `${source.title} – ${label} – Data Science Digital Laboratory`;
}

function showMessage(heading, text, href = "index.html", linkText = "← Back to Experiments") {
  const back = el("a", "btn btn--ghost exp-back", linkText);
  back.href = href;
  detail.replaceChildren(back, el("h1", "exp-error__title", heading), el("p", "detail__empty-note", text));
}

// Loads the experiment from the server (MongoDB)
async function showDetails() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");
  if (!id) { showMessage("Experiment not found", "No experiment was selected."); return; }

  let experiment;
  try {
    if (/^[a-f\d]{24}$/i.test(id)) {
      experiment = normalizeExperiment(await apiRequest(`/experiments/${encodeURIComponent(id)}`));
    } else { // also accepts an experiment number, for example experiment.html?id=6
      const experiments = (await apiRequest("/experiments")).map(normalizeExperiment);
      experiment = experiments.find((item) => item.id === id || item.number === id);
    }
  } catch (error) {
    if (error.message === "Experiment not found") {
      showMessage("Experiment not found", "It may have been deleted.");
      return;
    }
    showMessage("Could not load experiment", error.message);
    return;
  }
  if (!experiment) { showMessage("Experiment not found", "It may have been deleted."); return; }

  const subParam = params.get("sub");
  const sub = subParam ? experiment.subExperiments.find((item) => item.letter === subParam || item.id === subParam) : null;
  if (subParam && !sub) {
    showMessage("Sub-experiment not found", "It may have been removed from this experiment.", experimentUrl(experiment), `← Back to Experiment ${experiment.number}`);
    return;
  }
  renderPage(experiment, sub, params.get("topic") || "");
}

showDetails();