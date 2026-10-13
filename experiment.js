/* Experiment Details and Sub-Experiment Details  (experiment.html?id=<id>[&sub=<letter>][&tab=<name>][&topic=<n>]).
   Uses shared.js (el, apiRequest, normalizeExperiment, getVideo), d2-format.js (renderD2Topics) and d2-pdf.js (downloadD2Pdf).

   Experiment page tabs:      Overview | Topics | Tools | Materials      (a topic opens its own detail view)
   Sub-experiment page tabs:  Description | Program | Output | Result | Materials
   The lesson text is split into those sections by its own headings (Aim, Program, Output, Result...). */
const detail = document.getElementById("detail");
const DOWNLOAD_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m0 0-4-4m4 4 4-4M5 21h14"/></svg>`;
const ARROW_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>`;
const PLAY_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11"/><path d="M10 8l6 4-6 4z"/></svg>`;

/* ----------------------------------------------------------- section logic */
const SECTION_PATTERNS = [
  ["Program", /^(?:program(?:\s+solution)?|solution|sample\s+program|source\s+code|code)$/i],
  ["Output", /^(?:sample\s+|expected\s+)?output$/i],
  ["Result", /^(?:result|results|conclusion|learning\s+outcomes?)$/i],
  ["Materials", /^(?:materials?|references|resources|downloads?)$/i],
  ["Description", /^(?:aim|objectives?|purpose|description|introduction|theory|syntax|general\s+syntax|requirements|procedure|algorithm|explanation|steps\s+involved|working\s+principle|advantages|applications|observations?|summary|key\s+points?|notes?|topics?|examples?|tools(?:\s+used)?)$/i],
];
// Returns the section a heading belongs to, or "" when it is a custom topic/subtopic title
function sectionOf(headingText) {
  const clean = String(headingText || "").trim().replace(/\s*:\s*$/, "");
  const hit = SECTION_PATTERNS.find(([, pattern]) => pattern.test(clean));
  return hit ? hit[0] : "";
}
const padNumber = (value) => (/^\d+$/.test(String(value)) ? String(value).padStart(2, "0") : String(value));

// Renders the real content once, then sorts every block into subtopic groups and sections
function buildGroups(source) {
  const rendered = renderD2Topics(source.d2Topics || []);
  const leaves = [];
  const walk = (node) => [...node.children].forEach((child) => {
    if (child.tagName === "SECTION" || child.classList.contains("d2-rich")) walk(child);
    else leaves.push(child);
  });
  walk(rendered);

  const groups = [{ title: "", nodes: [] }]; // group 0 = text before the first subtopic title
  let section = "Description";
  leaves.forEach((node) => {
    if (node.classList.contains("detail__d2--empty")) return;
    if (node.classList.contains("d2-heading")) {
      const mapped = sectionOf(node.textContent);
      if (!mapped) {
        groups.push({ title: node.textContent.trim(), nodes: [] });
        section = "Description";
        return; // the title is shown by the page itself
      }
      section = mapped;
    }
    node.dataset.section = section;
    groups[groups.length - 1].nodes.push(node);
  });
  return groups;
}

/* ------------------------------------------------------------------ urls */
function pageUrl(experiment, sub, state = {}) {
  let url = `experiment.html?id=${encodeURIComponent(experiment.id)}`;
  if (sub) url += `&sub=${encodeURIComponent(sub.letter)}`;
  if (state.tab) url += `&tab=${encodeURIComponent(state.tab)}`;
  if (state.topic) url += `&topic=${encodeURIComponent(state.topic)}`;
  return url;
}
function readState(allowedTabs, defaultTab, topicCount) {
  const params = new URLSearchParams(location.search);
  const tab = allowedTabs.find((name) => name.toLowerCase() === (params.get("tab") || "").toLowerCase()) || defaultTab;
  const topic = Number(params.get("topic"));
  return { tab, topic: Number.isInteger(topic) && topic >= 1 && topic <= topicCount ? topic : 0 };
}

function createLink(className, href, text) {
  const link = el("a", className, text);
  link.href = href;
  return link;
}
const icon = (svg, className) => Object.assign(el("span", className), { innerHTML: svg });

/* ------------------------------------------------------------ video support */
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

async function loadVideoInto(media, key, autoplay) {
  const note = media.querySelector(".exp-media__note") || media.appendChild(el("p", "exp-media__note"));
  note.className = "exp-media__note exp-media__note--info";
  note.textContent = "Loading video…";
  try {
    const blob = await getVideo(key);
    if (!blob) throw new Error("missing");
    const video = el("video", "detail__video exp-media__video");
    video.controls = true;
    video.preload = "metadata";
    video.src = URL.createObjectURL(blob);
    enableHoverPlayback(video);
    media.replaceChildren(video);
    if (autoplay) video.play().catch(() => {});
  } catch (error) {
    console.error("Could not load experiment video:", error);
    note.className = "exp-media__note";
    note.textContent = "The saved video could not be loaded.";
    media.querySelector(".exp-media__play")?.removeAttribute("hidden");
  }
}

/* ---------------------------------------------------------------- left card */
function renderInfoCard({ label, title, cover, video, githubUrl, subNav }) {
  const card = el("aside", "exp-info");
  const head = el("div", "exp-info__head");
  head.append(el("p", "exp-info__label", label), el("h1", "exp-info__title", title));
  card.appendChild(head);

  if (cover || video) {
    const media = el("div", "exp-media");
    if (cover) {
      const image = el("img", "exp-media__img");
      image.src = cover;
      image.alt = `${title} cover`;
      media.appendChild(image);
    }
    if (video && cover) {
      const play = el("button", "exp-media__play");
      play.type = "button";
      play.setAttribute("aria-label", `Play the video for ${title}`);
      play.appendChild(icon(PLAY_ICON));
      play.addEventListener("click", () => { play.hidden = true; loadVideoInto(media, video, true); });
      media.appendChild(play);
    } else if (video) {
      loadVideoInto(media, video, false);
    }
    card.appendChild(media);
  }

  if (subNav) card.appendChild(subNav);
  if (githubUrl) {
    const github = el("div", "exp-info__section exp-github");
    github.appendChild(el("p", "exp-info__sublabel", "GitHub Repository"));
    const link = el("a", "btn btn--primary exp-github__btn");
    link.href = githubUrl;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.append(el("span", "", "View on GitHub"), el("span", "", "→"));
    github.appendChild(link);
    card.appendChild(github);
  }
  return card;
}

function createSubNav(experiment, activeLetter) {
  if (experiment.subExperiments.length === 0) return null;
  const nav = el("nav", "exp-info__section");
  nav.setAttribute("aria-label", "Sub-experiments");
  nav.appendChild(el("p", "exp-info__sublabel", activeLetter ? "Other Sub-Experiments" : "Sub-Experiments"));
  const row = el("div", "exp-chips");
  experiment.subExperiments.forEach((sub) => {
    const active = sub.letter === activeLetter;
    const chip = createLink("sub-btn" + (active ? " sub-btn--active" : ""), pageUrl(experiment, sub), `Exp ${sub.letter}`);
    chip.title = sub.title;
    if (active) chip.setAttribute("aria-current", "page");
    row.appendChild(chip);
  });
  nav.appendChild(row);
  return nav;
}

/* ------------------------------------------------------- tools and materials */
let libraryTools = null; // the site's Tools library, used to link and illustrate tool cards
async function loadLibraryTools() {
  if (libraryTools) return libraryTools;
  try { libraryTools = await apiRequest("/tools"); } catch (error) { libraryTools = []; }
  return libraryTools;
}

function toolCard(tool, library) {
  const match = library.find((item) => String(item.name || "").trim().toLowerCase() === tool.name.trim().toLowerCase());
  const external = tool.url || "";
  const internal = !external && match ? `tools.html?tool=${encodeURIComponent(match.id)}` : "";
  const href = external || internal;
  const card = el(href ? "a" : "div", "exp-tool");
  if (href) {
    card.href = href;
    if (external) { card.target = "_blank"; card.rel = "noopener noreferrer"; }
  }
  const art = el("span", "exp-tool__icon");
  if (match && match.image) {
    const image = el("img");
    image.src = match.image; image.alt = "";
    art.appendChild(image);
  } else {
    art.textContent = tool.name.trim().charAt(0).toUpperCase();
  }
  card.append(art, el("strong", "exp-tool__name", tool.name), el("span", "exp-tool__desc", tool.description || (match && match.category) || ""));
  return card;
}

function renderTools(tools, heading) {
  const section = el("section", "exp-section");
  if (heading) section.appendChild(el("h2", "exp-section__title", heading));
  if (!tools.length) {
    section.appendChild(el("p", "exp-empty", "No tools have been added to this experiment yet."));
    return section;
  }
  const grid = el("div", "exp-tools");
  section.appendChild(grid);
  loadLibraryTools().then((library) => grid.replaceChildren(...tools.map((tool) => toolCard(tool, library))));
  return section;
}

function materialKind(url) {
  const ext = (String(url).split(/[?#]/)[0].match(/\.([a-z0-9]{2,5})$/i) || [])[1];
  return (ext || "link").toUpperCase();
}

function renderMaterials(materials, extraNodes, heading) {
  const section = el("section", "exp-section");
  if (heading) section.appendChild(el("h2", "exp-section__title", heading));
  if (!materials.length && !extraNodes.length) {
    section.appendChild(el("p", "exp-empty", "No materials have been added yet."));
    return section;
  }
  if (materials.length) {
    const list = el("ul", "exp-materials");
    materials.forEach((item) => {
      const li = el("li");
      const link = el("a", "exp-material");
      link.href = item.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      let host = "";
      try { host = new URL(item.url).hostname.replace(/^www\./, ""); } catch (error) { host = ""; }
      const text = el("span", "exp-material__text");
      text.append(el("strong", "", item.title), el("small", "", host));
      link.append(el("span", "exp-material__kind", materialKind(item.url)), text, el("span", "exp-material__open", "Open ↗"));
      li.appendChild(link);
      list.appendChild(li);
    });
    section.appendChild(list);
  }
  extraNodes.forEach((node) => section.appendChild(node));
  return section;
}

/* --------------------------------------------------------------- topic rows */
function renderRows(experiment, sub, groups, selected, onOpen) {
  const list = el("ol", "exp-rows");
  const base = sub ? sub.id : experiment.number;
  groups.forEach((group, index) => {
    if (!group.title) return;
    const number = index; // group 0 is the intro, so subtopic n is groups[n]
    const li = el("li");
    const link = el("a", "exp-row" + (selected === number ? " is-selected" : ""));
    link.href = pageUrl(experiment, sub, { tab: sub ? "Description" : "Topics", topic: number });
    if (selected === number) link.setAttribute("aria-current", "true");
    link.append(el("span", "exp-row__badge", `${base}.${number}`), el("span", "exp-row__title", group.title), icon(ARROW_ICON, "exp-row__arrow"));
    link.addEventListener("click", (event) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.button) return;
      event.preventDefault();
      onOpen(number);
    });
    li.appendChild(link);
    list.appendChild(li);
  });
  return list;
}

function pdfButton(options, panel, anchor) {
  const button = el("button", "btn btn--primary btn--small exp-pdf");
  button.type = "button";
  button.innerHTML = `${DOWNLOAD_ICON}<span>Download PDF</span>`;
  button.addEventListener("click", async () => {
    button.disabled = true;
    try {
      await downloadD2Pdf(options);
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

const section = (title, className = "") => {
  const node = el("section", `exp-section ${className}`.trim());
  if (title) node.appendChild(el("h2", "exp-section__title", title));
  return node;
};
const emptyNote = (text) => el("p", "exp-empty", text);

/* --------------------------------------------------------------- right panel */
function renderPanel({ experiment, sub, label }) {
  const source = sub || experiment;
  const groups = buildGroups(source);
  const topicCount = groups.length - 1 + (groups[0].title ? 1 : 0); // groups[1..] are subtopics
  const tabNames = sub ? ["Description", "Program", "Output", "Result", "Materials"] : ["Overview", "Topics", "Tools", "Materials"];
  const tools = source.tools || [];
  const materials = source.materials || [];
  const rowGroupCount = groups.length - 1;

  const panel = el("section", "exp-panel");
  const bar = el("div", "exp-bar");
  const tabs = el("div", "exp-tabs");
  tabs.setAttribute("role", "tablist");
  bar.appendChild(tabs);
  if (source.shortDescription || source.d2Content || (source.d2Topics || []).length) {
    bar.appendChild(pdfButton({
      label, title: source.title, heading: source.d2Heading || "Long Description", content: source.d2Content, topics: source.d2Topics,
    }, panel, bar));
  }
  const body = el("div", "exp-body");
  panel.append(bar, body);

  let state = readState(tabNames, tabNames[0], rowGroupCount);

  function go(next, push = true) {
    state = { ...state, ...next };
    if (push) history.pushState(null, "", pageUrl(experiment, sub, { tab: state.tab === tabNames[0] && !state.topic ? "" : state.tab, topic: state.topic || "" }));
    paint();
    if (push) window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const nodesFor = (name, selectedTopic) => {
    const visible = [groups[0], ...(selectedTopic && groups[selectedTopic] ? [groups[selectedTopic]] : [])];
    return visible.flatMap((group) => group.nodes.filter((node) => node.dataset.section === name));
  };

  function paintTabs() {
    tabs.replaceChildren();
    tabNames.forEach((name) => {
      const active = name === state.tab;
      const button = el("button", "exp-tab" + (active ? " is-active" : ""), name);
      button.type = "button";
      button.setAttribute("role", "tab");
      button.setAttribute("aria-selected", String(active));
      button.addEventListener("click", () => go({ tab: name, topic: 0 }));
      tabs.appendChild(button);
    });
  }

  /* ----- experiment page views ----- */
  function topicDetail() {
    const group = groups[state.topic];
    const view = el("div", "exp-topicview");
    const back = el("a", "exp-topicview__back", sub ? "← All subtopics" : "← All topics");
    const listTab = sub ? "Description" : "Topics";
    back.href = pageUrl(experiment, sub, { tab: listTab });
    back.addEventListener("click", (event) => { event.preventDefault(); go({ tab: listTab, topic: 0 }); });
    const head = el("div", "exp-topicview__head");
    head.append(el("span", "exp-row__badge exp-row__badge--big", `${sub ? sub.id : experiment.number}.${state.topic}`), el("h2", "exp-topicview__title", group.title));
    const content = el("div", "exp-topicview__content detail__d2 d2-rich");
    group.nodes.forEach((node) => content.appendChild(node));
    if (!group.nodes.length) content.appendChild(emptyNote("No content has been added to this topic yet."));
    const pager = el("nav", "exp-pager");
    pager.setAttribute("aria-label", "Topic navigation");
    [[state.topic - 1, sub ? "← Previous subtopic" : "← Previous topic"], [state.topic + 1, sub ? "Next subtopic →" : "Next topic →"]].forEach(([n, text], index) => {
      if (n < 1 || n > rowGroupCount) { pager.appendChild(el("span")); return; }
      const link = el("a", `exp-pager__link exp-pager__link--${index ? "next" : "prev"}`);
      link.href = pageUrl(experiment, sub, { tab: listTab, topic: n });
      link.append(el("small", "", text), el("strong", "", groups[n].title));
      link.addEventListener("click", (event) => { event.preventDefault(); go({ topic: n }); });
      pager.appendChild(link);
    });
    view.append(back, head, content, pager);
    if (sub) { // keep the full list visible with the open subtopic highlighted
      const rows = section(`Subtopics (${rowGroupCount})`);
      rows.appendChild(renderRows(experiment, sub, groups, state.topic, (n) => go({ tab: "Description", topic: n })));
      return [view, rows];
    }
    return [view];
  }

  function overview() {
    const out = [];
    const description = section("Description");
    description.appendChild(el("p", "exp-description__text", experiment.shortDescription || "No description has been added yet."));
    groups[0].nodes.filter((node) => node.dataset.section === "Description").forEach((node) => {
      const wrap = el("div", "detail__d2 d2-rich exp-intro");
      wrap.appendChild(node);
      description.appendChild(wrap);
    });
    out.push(description);
    const topics = section(`Topics`);
    topics.appendChild(rowGroupCount ? renderRows(experiment, sub, groups, 0, (n) => go({ tab: "Topics", topic: n })) : emptyNote("No topics have been added yet."));
    out.push(topics);
    out.push(renderTools(tools, "Tools Used"));
    out.push(renderMaterials(materials, nodesFor("Materials", 0), "Materials"));
    const rest = groups[0].nodes.filter((node) => node.dataset.section !== "Description" && node.dataset.section !== "Materials");
    if (rest.length) {
      const extra = section("More details");
      const wrap = el("div", "detail__d2 d2-rich");
      rest.forEach((node) => wrap.appendChild(node));
      extra.appendChild(wrap);
      out.push(extra);
    }
    return out;
  }

  function topicsTab() {
    const topics = section(`Topics (${rowGroupCount})`);
    topics.appendChild(rowGroupCount ? renderRows(experiment, sub, groups, 0, (n) => go({ tab: "Topics", topic: n })) : emptyNote("No topics have been added yet."));
    return [topics];
  }

  /* ----- sub-experiment views ----- */
  function subSection(name) {
    const selected = state.topic;
    if (name === "Description") {
      const out = [];
      const desc = section("Description");
      desc.appendChild(el("p", "exp-description__text", sub.shortDescription || "No description has been added yet."));
      const nodes = nodesFor("Description", selected);
      if (nodes.length) {
        const wrap = el("div", "detail__d2 d2-rich exp-intro");
        nodes.forEach((node) => wrap.appendChild(node));
        desc.appendChild(wrap);
      }
      out.push(desc);
      if (rowGroupCount) {
        const rows = section(`Subtopics (${rowGroupCount})`);
        rows.appendChild(renderRows(experiment, sub, groups, selected, (n) => go({ tab: "Description", topic: n })));
        out.push(rows);
      }
      return out;
    }
    if (name === "Materials") return [renderMaterials(materials, nodesFor("Materials", selected), "Materials")];
    let nodes = nodesFor(name, selected);
    if (!selected) {
      // nothing selected: gather this section from every subtopic, labelled by subtopic title
      nodes = [];
      groups.forEach((group, index) => {
        const found = group.nodes.filter((node) => node.dataset.section === name);
        if (!found.length) return;
        if (index > 0) { const label = el("h3", "d2-heading", group.title); label.dataset.section = name; nodes.push(label); }
        nodes.push(...found);
      });
    }
    const wrap = section("");
    if (nodes.length) {
      const holder = el("div", "detail__d2 d2-rich");
      nodes.forEach((node) => holder.appendChild(node));
      wrap.appendChild(holder);
    } else {
      wrap.appendChild(emptyNote(`No ${name.toLowerCase()} has been added for this ${selected ? "subtopic" : "sub-experiment"} yet.`));
    }
    const selectedNote = selected && groups[selected] ? el("p", "exp-selected-note", `Showing: ${groups[selected].title}`) : null;
    return selectedNote ? [selectedNote, wrap] : [wrap];
  }

  function paint() {
    paintTabs();
    body.replaceChildren();
    let nodes;
    if (state.topic) nodes = topicDetail(); // whole subtopic, start to end
    else if (sub) nodes = subSection(state.tab);
    else nodes = state.tab === "Overview" ? overview() : state.tab === "Topics" ? topicsTab()
      : state.tab === "Tools" ? [renderTools(tools, `Tools Used (${tools.length})`)]
      : [renderMaterials(materials, nodesFor("Materials", 0), `Materials (${materials.length})`)];
    body.append(...nodes);
  }

  window.addEventListener("popstate", () => {
    state = readState(tabNames, tabNames[0], rowGroupCount);
    paint();
  });
  paint();
  return panel;
}

/* -------------------------------------------------------------------- page */
function renderPage(experiment, sub) {
  const source = sub || experiment;
  const label = sub ? `Experiment ${sub.id}` : `Experiment ${experiment.number}`;

  const back = el("a", "btn btn--ghost exp-back");
  back.href = sub ? pageUrl(experiment) : "index.html";
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
    renderPanel({ experiment, sub, label }),
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
    if (error.message === "Experiment not found") { showMessage("Experiment not found", "It may have been deleted."); return; }
    showMessage("Could not load experiment", error.message);
    return;
  }
  if (!experiment) { showMessage("Experiment not found", "It may have been deleted."); return; }

  const subParam = params.get("sub");
  const sub = subParam ? experiment.subExperiments.find((item) => item.letter === subParam || item.id === subParam) : null;
  if (subParam && !sub) {
    showMessage("Sub-experiment not found", "It may have been removed from this experiment.", pageUrl(experiment), `← Back to Experiment ${experiment.number}`);
    return;
  }
  renderPage(experiment, sub);
}

showDetails();