const MAX_IMAGE_WIDTH = 800;
const MAX_PHOTO_WIDTH = 300;
const FORM_ERROR_FIELDS = ["number", "name", "description", "cover", "github", "subs", "tools", "materials"];

let experiments = [];
let editingId = null;                    // id of the experiment being edited, or null when adding
let mainCover = "";                      // main cover currently chosen in the form
const mainVideo = { file: null, key: "" }; // newly chosen file, or key of the saved video
let refreshMainVideo = () => {};

// ---------- DOM references ----------
const list = document.getElementById("experimentList");
const emptyState = document.getElementById("emptyState");
const experimentCount = document.getElementById("experimentCount");
const searchInput = document.getElementById("searchInput");
const experimentModal = document.getElementById("experimentModal");
const form = document.getElementById("experimentForm");
const modalTitle = document.getElementById("modalTitle");
const submitBtn = document.getElementById("submitBtn");
const numberInput = document.getElementById("numberInput");
const nameInput = document.getElementById("nameInput");
const shortInput = document.getElementById("shortInput");
const d2HeadingInput = document.getElementById("d2HeadingInput");
const d2ContentInput = document.getElementById("d2ContentInput");
let d2Builder; // created below, once the builder code is defined
d2HeadingInput.closest("label").before(createWritingGuide());
const githubInput = document.getElementById("githubInput");
const coverInput = document.getElementById("coverInput");
const coverPreview = document.getElementById("coverPreview");
const uploadHint = document.getElementById("uploadHint");
const subList = document.getElementById("subList");
const previewModal = document.getElementById("previewModal");
const toast = document.getElementById("toast");

// ---------- Helpers ----------
let toastTimer;
function showToast(message, isError = false) {
  toast.textContent = message;
  toast.classList.toggle("toast--error", isError);
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toast.hidden = true), 3500);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

let modalOpener = null;
function modalFocusables(modal) {
  return [...modal.querySelectorAll('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])')]
    .filter((node) => !node.disabled && !node.hidden && node.offsetParent !== null);
}
function showModal(modal) {
  modalOpener = document.activeElement;
  modal.hidden = false;
  document.body.style.overflow = "hidden";
  const first = modal.querySelector(".preview__close") || modalFocusables(modal)[0];
  if (first) first.focus();
}

document.addEventListener("keydown", (event) => {
  if (event.key !== "Tab") return;
  const modal = document.querySelector(".modal:not([hidden])");
  if (!modal) return;
  const nodes = modalFocusables(modal);
  if (!nodes.length) return;
  const firstNode = nodes[0], lastNode = nodes[nodes.length - 1];
  if (event.shiftKey && document.activeElement === firstNode) { event.preventDefault(); lastNode.focus(); }
  else if (!event.shiftKey && document.activeElement === lastNode) { event.preventDefault(); firstNode.focus(); }
});

function hideModal(modal) {
  modal.hidden = true;
  if (modalOpener && document.contains(modalOpener) && !document.querySelector(".modal:not([hidden])")) { modalOpener.focus(); modalOpener = null; }
  if (modal === previewModal) previewCoverCtl.stop();
  if (!document.querySelector(".modal:not([hidden])")) document.body.style.overflow = "";
}

function setError(field, message, scope = form) {
  const output = scope.querySelector(`[data-error="${field}"]`);
  output.textContent = message;
  output.closest(".field").classList.toggle("invalid", Boolean(message));
}

function isValidGithubUrl(value) {
  try {
    const url = new URL(value);
    const segments = url.pathname.split("/").filter(Boolean);
    return (
      url.protocol === "https:" &&
      (url.hostname === "github.com" || url.hostname === "www.github.com") &&
      segments.length >= 2
    );
  } catch (error) {
    return false;
  }
}

// Resize and compress images before they are sent to the server.
function readCoverImage(file, maxWidth = MAX_IMAGE_WIDTH) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the image."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("That file is not a valid image."));
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.8));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// ---------- Cover preview videos (hover-to-play, no controls) ----------
// Only elements with the .cover-preview-video class are touched here; the Read More page is not affected.
const supportsHover = !window.matchMedia || window.matchMedia("(hover: hover)").matches;
const coverVideoUrls = new Map(); // video key -> object URL (created once, reused on every re-render)
const COVER_PREVIEW_SPEED = 2;    // hover previews play at 2x

async function getCoverVideoUrl(key) {
  if (coverVideoUrls.has(key)) return coverVideoUrls.get(key);
  // A direct video link can be played as it is; YouTube/Vimeo pages cannot be used in a <video> element
  if (/^https?:\/\//i.test(key)) return /youtu\.?be|vimeo\.com/i.test(key) ? "" : key;
  const blob = await getVideo(key);
  if (!blob) return "";
  const url = URL.createObjectURL(blob);
  coverVideoUrls.set(key, url);
  return url;
}

function releaseCoverVideoUrl(key) {
  const url = coverVideoUrls.get(key);
  if (url) URL.revokeObjectURL(url);
  coverVideoUrls.delete(key);
}

function createCoverVideo() {
  const video = el("video", "cover-preview-video");
  video.muted = true;
  video.defaultMuted = true;
  video.loop = true;
  video.playsInline = true;
  video.controls = false;
  video.preload = "metadata";
  video.disablePictureInPicture = true;
  video.disableRemotePlayback = true;
  video.tabIndex = -1;
  ["muted", "loop", "playsinline", "disablepictureinpicture", "disableremoteplayback"]
    .forEach((name) => video.setAttribute(name, ""));
  video.setAttribute("controlslist", "nodownload nofullscreen noremoteplayback");
  video.setAttribute("aria-hidden", "true");
  video.defaultPlaybackRate = COVER_PREVIEW_SPEED;
  video.playbackRate = COVER_PREVIEW_SPEED;
  // Browsers reset the speed when a new source loads, so apply it again once the video is ready
  ["loadedmetadata", "play"].forEach((name) => video.addEventListener(name, () => { video.playbackRate = COVER_PREVIEW_SPEED; }));
  video.addEventListener("contextmenu", (event) => event.preventDefault());
  video.addEventListener("playing", () => video.classList.add("is-active"));
  // Only one cover preview plays at a time (matters on touch screens); the others go back to their cover image
  video.addEventListener("play", () => {
    document.querySelectorAll(".cover-preview-video").forEach((other) => {
      if (other !== video) resetCoverVideo(other);
    });
  });
  return video;
}

// Pause, rewind to the first frame and show the original cover image again
function resetCoverVideo(video) {
  video.pause();
  if (video.dataset.key) video.currentTime = 0;
  video.classList.remove("is-active");
}

// Wires one cover area to its video. Called once per element, so listeners are never duplicated.
function bindCoverPreview(area, video) {
  const state = { key: "", wanted: false };

  async function start() {
    state.wanted = true;
    if (!state.key) return;
    try {
      if (video.dataset.key !== state.key) {
        const url = await getCoverVideoUrl(state.key);
        if (!url) return; // no readable video: the cover image simply stays visible
        video.src = url;
        video.dataset.key = state.key;
      }
      if (!state.wanted) return;
      video.currentTime = 0; // every hover starts from the first frame
      video.playbackRate = COVER_PREVIEW_SPEED;
      await video.play();
      video.playbackRate = COVER_PREVIEW_SPEED;
    } catch (error) {
      // Playback blocked or file unreadable: keep showing the cover image
    }
  }

  function stop() {
    state.wanted = false;
    resetCoverVideo(video);
  }

  if (supportsHover) {
    area.addEventListener("mouseenter", start);
    area.addEventListener("mouseleave", stop);
  } else {
    // Touch screens have no hover: tap the cover to play, tap again to pause
    area.addEventListener("click", () => (video.paused ? start() : stop()));
  }

  return {
    stop,
    setKey(key) {
      state.key = key || "";
      state.wanted = false;
      resetCoverVideo(video);
      if (!state.key && video.dataset.key) {
        video.removeAttribute("src");
        delete video.dataset.key;
        video.load();
      }
    },
  };
}

// Exp A / Exp B preview modal: one reusable video that always uses the selected sub-experiment's own video
const previewCoverArea = document.querySelector("#previewModal .preview__cover");
const previewCoverVideo = createCoverVideo();
previewCoverArea.appendChild(previewCoverVideo);
const previewCoverCtl = bindCoverPreview(previewCoverArea, previewCoverVideo);

// ---------- Experiment actions (saved on the server in MongoDB) ----------
async function loadExperiments() {
  const saved = readStoredExperiments(); // experiments from the old browser-only version, if any
  let remote = await apiRequest("/experiments");
  const migrationPending = localStorage.getItem("dsLabMigrationPending") === "true";
  if (saved.length > 0 && (remote.length === 0 || migrationPending)) {
    // One-time copy of the browser-saved experiments into the database
    localStorage.setItem("dsLabMigrationPending", "true");
    const migrated = new Set(remote.map((item) => `${item.number}\u0000${item.title}`));
    for (const item of saved) {
      const migrationKey = `${item.number}\u0000${item.title}`;
      if (!migrated.has(migrationKey)) {
        await apiRequest("/experiments", { method: "POST", body: JSON.stringify(item) });
        migrated.add(migrationKey);
      }
    }
    localStorage.removeItem(EXPERIMENTS_KEY);
    localStorage.removeItem("dsLabMigrationPending");
    remote = await apiRequest("/experiments");
  }
  experiments = remote.map(normalizeExperiment);
}

async function addExperiment(data) {
  const saved = normalizeExperiment(await apiRequest("/experiments", {
    method: "POST",
    body: JSON.stringify(data),
  }));
  experiments.push(saved);
  showToast("Experiment added.");
  return true;
}

async function editExperiment(id, data) {
  const index = experiments.findIndex((item) => item.id === id);
  if (index === -1) return false;
  experiments[index] = normalizeExperiment(await apiRequest(`/experiments/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify(data),
  }));
  showToast("Experiment updated.");
  return true;
}

async function deleteExperiment(id) {
  if (!confirm("Are you sure you want to delete this experiment?")) return;
  const removed = experiments.find((item) => item.id === id);
  try {
    await apiRequest(`/experiments/${encodeURIComponent(id)}`, { method: "DELETE" });
    experiments = experiments.filter((item) => item.id !== id);
    if (removed) {
      getVideoKeys(removed).forEach(releaseCoverVideoUrl);
      await Promise.all(getVideoKeys(removed).map((key) => deleteVideo(key).catch((error) => {
        console.error("Could not delete an experiment video:", error);
      })));
    }
    renderExperiments();
    showToast("Experiment deleted.");
  } catch (error) {
    showToast(`Could not delete experiment: ${error.message}`, true);
  }
}

// ---------- Progress & search ----------
// Progress = completed sub-experiments / all sub-experiments.
function getProgress() {
  const subs = experiments.flatMap((item) => item.subExperiments);
  if (subs.length === 0) return 0;
  return Math.round((subs.filter((sub) => sub.completed).length / subs.length) * 100);
}

function searchExperiments() {
  const query = searchInput.value.trim().toLowerCase();
  if (!query) return experiments;
  return experiments.filter((item) => {
    const searchable = [
      item.number, `experiment ${item.number}`, item.title, item.shortDescription,
      item.d2Heading, item.d2Content,
      ...item.subExperiments.flatMap((sub) => [sub.id, sub.title, sub.shortDescription]),
    ];
    return searchable.some((text) => String(text).toLowerCase().includes(query));
  });
}

// ---------- Rendering ----------
function detailsUrl(item, sub) {
  const base = `experiment.html?id=${encodeURIComponent(item.id)}`;
  return sub ? `${base}&sub=${encodeURIComponent(sub.letter)}` : base;
}

function padNumber(value) {
  const text = String(value ?? "").trim();
  return /^\d+$/.test(text) ? text.padStart(2, "0") : text;
}

function renderExperiments() {
  const visible = searchExperiments().slice().sort((a, b) =>
    a.number.localeCompare(b.number, undefined, { numeric: true })
  );
  list.innerHTML = "";
  visible.forEach((item) => list.appendChild(createCard(item)));

  emptyState.hidden = experiments.length > 0;
  const total = experiments.length;
  const noun = total === 1 ? "Experiment" : "Experiments";
  const searching = searchInput.value.trim() !== "";
  experimentCount.textContent = searching && visible.length !== total ? `${visible.length} of ${total} ${noun}` : `${total} ${noun}`;

  if (experiments.length > 0 && visible.length === 0) {
    list.appendChild(el("p", "exp-nomatch", "No experiments match your search."));
  }
}

function createCard(item) {
  const card = el("article", "exp-card");
  card.id = `experiment-${item.id}`;
  card.dataset.id = item.id;

  const cover = el("div", "exp-card__cover");
  const showFallback = () => {
    cover.classList.add("exp-card__cover--empty");
    cover.replaceChildren(el("span", "exp-card__fallback", String(item.number || "").padStart(2, "0")));
  };
  if (item.cover) {
    const image = el("img");
    image.src = item.cover;
    image.alt = `${item.title} cover`;
    image.loading = "lazy";
    image.addEventListener("error", showFallback, { once: true });
    cover.appendChild(image);
  } else {
    showFallback();
  }
  if (item.video) { // no video: the existing cover image is all that shows
    const coverVideo = createCoverVideo();
    cover.appendChild(coverVideo);
    bindCoverPreview(cover, coverVideo).setKey(item.video);
  }

  const body = el("div", "exp-card__body");
  const head = el("div", "exp-card__head");
  head.append(el("span", "exp-card__badge", padNumber(item.number)), el("span", "exp-card__number", `Experiment ${item.number}`));
  const title = el("h3", "exp-card__title");
  const titleLink = el("a", "", item.title);
  titleLink.href = detailsUrl(item);
  title.appendChild(titleLink);
  body.append(head, title, el("p", "exp-card__desc", item.shortDescription));

  // Meta row: real topic count (sub-experiments count as the main page's topics) and tools used
  const countNodes = (list) => (Array.isArray(list) ? list : []).filter((t) => t && typeof t === "object").length;
  const topicTotal = item.subExperiments.length || countNodes(item.topics) || countNodes((Array.isArray(item.d2Topics) ? item.d2Topics : []).filter((t) => t && t.id !== "legacy-topic-1" && String(t.heading || t.title || "").trim()));
  const toolNames = (Array.isArray(item.tools) ? item.tools : []).map((t) => String(t && t.name || "").trim()).filter(Boolean);
  if (topicTotal || toolNames.length) {
    const meta = el("div", "exp-card__meta");
    if (topicTotal) meta.appendChild(el("span", "exp-card__meta-item", `${topicTotal} topic${topicTotal === 1 ? "" : "s"}`));
    if (toolNames.length) meta.appendChild(el("span", "exp-card__meta-item", toolNames.slice(0, 3).join(", ") + (toolNames.length > 3 ? ` +${toolNames.length - 3}` : "")));
    body.appendChild(meta);
  }

  // Read More and the real sub-experiments, each linking straight to its own page
  const actions = el("div", "exp-card__actions");
  const readMore = el("a", "btn btn--primary exp-card__readmore");
  readMore.href = detailsUrl(item);
  readMore.append(el("span", "", "Read More"), el("span", "exp-card__arrow", "→"));
  actions.appendChild(readMore);
  if (item.subExperiments.length > 0) {
    const subs = el("div", "exp-card__subs");
    item.subExperiments.forEach((sub) => {
      // Visible text is "Exp A"; the internal letter/id (A, B, C...) is unchanged
      const link = el("button", "sub-btn" + (sub.completed ? " sub-btn--done" : ""), `Exp ${sub.letter}`);
      link.type = "button";
      link.title = `${sub.title}${sub.completed ? " (completed)" : ""}`;
      link.setAttribute("aria-label", `Preview Experiment ${sub.id}: ${sub.title}`);
      link.addEventListener("click", () => openPreview(item.id, sub.id));
      subs.appendChild(link);
    });
    actions.appendChild(subs);
  }
  card.append(cover, body, actions, createMenu(item.id));
  return card;
}

function createMenu(id) {
  const menu = el("div", "menu");
  menu.innerHTML = `
    <button type="button" class="menu__toggle" aria-label="Experiment options" aria-haspopup="true" aria-expanded="false">⋮</button>
    <div class="menu__list" hidden>
      <button type="button" class="menu__item" data-action="edit" data-admin-only>Edit Experiment</button>
      <button type="button" class="menu__item" data-action="cover" data-admin-only>Change Cover Image</button>
      <button type="button" class="menu__item" data-action="description" data-admin-only>Edit Description</button>
      <button type="button" class="menu__item" data-action="sub" data-admin-only>Add Sub-Experiment</button>
      <button type="button" class="menu__item menu__item--danger" data-action="delete" data-admin-only>Delete Experiment</button>
    </div>`;
  const toggle = menu.querySelector(".menu__toggle");
  const menuList = menu.querySelector(".menu__list");

  toggle.addEventListener("click", (event) => {
    event.stopPropagation();
    const willOpen = menuList.hidden;
    closeAllMenus();
    menuList.hidden = !willOpen;
    toggle.setAttribute("aria-expanded", String(willOpen));
  });
  menuList.addEventListener("click", (event) => {
    event.stopPropagation();
    const action = event.target.dataset.action;
    if (!action) return;
    closeAllMenus();
    if (action === "delete") { deleteExperiment(id); return; }
    const focus = action === "cover" ? "cover" : action === "description" ? "description" : action === "sub" ? "sub" : "";
    location.href = `experiment-form.html?id=${encodeURIComponent(id)}${focus ? `&focus=${focus}` : ""}`;
  });
  return menu;
}

function closeAllMenus() {
  document.querySelectorAll(".menu__list").forEach((menuList) => (menuList.hidden = true));
  document.querySelectorAll(".menu__toggle").forEach((btn) => btn.setAttribute("aria-expanded", "false"));
}

// ---------- Sub-experiment preview ----------
function openPreview(experimentId, subId) {
  const item = experiments.find((entry) => entry.id === experimentId);
  const sub = item && item.subExperiments.find((entry) => entry.id === subId);
  if (!sub) return;

  const github = document.getElementById("previewGithub");
  document.getElementById("previewLabel").textContent = `Experiment ${sub.id}`;
  document.getElementById("previewCover").src = sub.cover || item.cover; // own cover first
  document.getElementById("previewTitle").textContent = sub.title;
  document.getElementById("previewDesc").textContent = sub.shortDescription;
  document.getElementById("previewReadMore").href = detailsUrl(item, sub);
  previewCoverCtl.setKey(sub.video || ""); // the sub-experiment's own video only, never the main experiment's
  github.hidden = !sub.githubUrl;
  if (sub.githubUrl) github.href = sub.githubUrl;
  showModal(previewModal);
}

// ---------- Video picker (used by the main form and every sub-experiment) ----------
function bindVideoControl(root, state) {
  const input = root.querySelector('input[type="file"]');
  const status = root.querySelector("[data-video-status]");
  const removeBtn = root.querySelector("[data-video-remove]");

  const refresh = () => {
    const hasVideo = Boolean(state.file || state.key);
    status.textContent = state.file ? `Selected: ${state.file.name}` : state.key ? "Saved video attached" : "No video";
    removeBtn.hidden = !hasVideo;
  };
  input.addEventListener("change", () => {
    const file = input.files[0];
    if (!file) return;
    if (!file.type.startsWith("video/")) {
      input.value = "";
      status.textContent = "Choose a video file.";
      return;
    }
    state.file = file;
    refresh();
  });
  removeBtn.addEventListener("click", () => {
    state.file = null;
    state.key = "";
    input.value = "";
    refresh();
  });
  refresh();
  return refresh;
}

refreshMainVideo = bindVideoControl(document.getElementById("mainVideoField"), mainVideo);


/* ---------- Guided "subtopic" builder (used by the experiment form and every sub-experiment) ----------
   Each subtopic card has fixed boxes: Title, Aim, Points, Language + Program, Output, Result.
   The boxes are saved as the same d2Topics the detail pages already understand, so nothing needs markdown. */
const BUILDER_LANGUAGES = [["python", "Python"], ["sql", "SQL"], ["java", "Java"], ["c", "C"], ["cpp", "C++"], ["javascript", "JavaScript"], ["r", "R"], ["bash", "Bash / Shell"], ["text", "Plain text"]];
const BUILDER_KINDS = {
  aim: /^(?:aim|objectives?|purpose)$/i,
  program: /^(?:program(?:\s+solution)?|solution|sample\s+program|source\s+code|code)$/i,
  output: /^(?:sample\s+|expected\s+)?output$/i,
  result: /^(?:result|results|conclusion|learning\s+outcomes?)$/i,
};
const BUILDER_OTHER_SECTIONS = /^(?:description|introduction|theory|syntax|general\s+syntax|requirements|procedure|algorithm|explanation|steps\s+involved|working\s+principle|advantages|applications|observations?|summary|key\s+points?|notes?|topics?|examples?|tools(?:\s+used)?|materials?|references|resources|downloads?)$/i;

function builderKind(heading) {
  const clean = String(heading || "").trim().replace(/\s*:\s*$/, "");
  for (const [kind, pattern] of Object.entries(BUILDER_KINDS)) if (pattern.test(clean)) return kind;
  return BUILDER_OTHER_SECTIONS.test(clean) ? "other" : "";
}

function builderStripFence(text) {
  const match = /^\s*```[^\n]*\n([\s\S]*?)\n?```\s*$/.exec(String(text || ""));
  return match ? match[1] : String(text || "").trim();
}

function createWritingGuide() {
  const guide = document.createElement("details");
  guide.className = "write-guide";
  guide.open = true;
  guide.innerHTML = `
    <summary>How to fill this in (rules)</summary>
    <ol class="write-guide__rules">
      <li><strong>Subtopic</strong> – press <em>+ Add Subtopic</em> for every topic (for example “Reading CSV Data”). Each one becomes a clickable row. Opening it shows <em>everything</em> you filled in that card, from its title to its result.</li>
      <li><strong>Aim</strong> – one or two lines about what the subtopic does.</li>
      <li><strong>Points / explanation</strong> – start a line with <code>- </code> for bullets or <code>1. </code> for numbers. A blank line starts a new paragraph. Use <code>**bold**</code> and <code>\`inline code\`</code> if needed. A line like <code>## Procedure</code> adds an extra heading.</li>
      <li><strong>Program (syntax)</strong> – choose the language, then paste the full code. Spaces and indentation are kept, the code is colour-highlighted and gets a Copy button.</li>
      <li><strong>Output</strong> – paste the real output you got when you ran the program. Nothing is invented.</li>
      <li><strong>Result</strong> – the conclusion or what you learnt.</li>
      <li>Leave any box empty and it is simply not shown. Use ↑ ↓ to change the order of subtopics.</li>
    </ol>`;
  return guide;
}

function createSubtopicBuilder(mount, { introLabel = "Detailed description (optional)", introHint = "Text shown before the subtopics" } = {}) {
  mount.classList.add("st-builder");
  mount.innerHTML = "";
  mount.appendChild(createWritingGuide());
  const introField = el("label", "field");
  introField.innerHTML = `<span>${introLabel}</span><textarea data-intro rows="4" placeholder="${introHint}"></textarea>`;
  const intro = introField.querySelector("textarea");
  const list = el("div", "st-cards");
  const add = el("button", "btn btn--ghost");
  add.type = "button";
  add.textContent = "+ Add Subtopic";
  mount.append(introField, list, add);

  const relabel = () => [...list.children].forEach((card, index) => {
    card.querySelector(".d2-topic__label").textContent = `Subtopic ${index + 1}`;
  });

  function createCard(data = {}) {
    const card = el("div", "d2-topic st-card");
    const language = data.language || "python";
    const options = BUILDER_LANGUAGES.map(([value, label]) => `<option value="${value}" ${value === language ? "selected" : ""}>${label}</option>`).join("");
    card.innerHTML = `
      <div class="d2-topic__header">
        <strong class="d2-topic__label">Subtopic</strong>
        <div class="d2-topic__actions">
          <button type="button" class="btn btn--ghost btn--small" data-action="up" aria-label="Move subtopic up">↑</button>
          <button type="button" class="btn btn--ghost btn--small" data-action="down" aria-label="Move subtopic down">↓</button>
          <button type="button" class="btn btn--ghost btn--small d2-topic__delete" data-action="delete">Delete</button>
        </div>
      </div>
      <label class="field"><span>Subtopic title *</span><input type="text" data-f="title" maxlength="120" placeholder="e.g. Reading Text/CSV Data" value="${escapeHtml(data.title || "")}"></label>
      <label class="field"><span>Aim</span><textarea data-f="aim" rows="2" placeholder="What this subtopic does">${escapeHtml(data.aim || "")}</textarea></label>
      <label class="field"><span>Points / explanation</span><textarea data-f="points" rows="4" placeholder="- first point&#10;- second point">${escapeHtml(data.points || "")}</textarea></label>
      <div class="st-code-row">
        <label class="field st-lang"><span>Program language</span><select data-f="language">${options}</select></label>
        <label class="field st-code"><span>Program (syntax)</span><textarea data-f="code" rows="8" class="d2-code-editor" spellcheck="false" placeholder="Paste the complete code here">${escapeHtml(data.code || "")}</textarea></label>
      </div>
      <label class="field"><span>Output</span><textarea data-f="output" rows="4" class="d2-code-editor" spellcheck="false" placeholder="Paste the real output of the program">${escapeHtml(data.output || "")}</textarea></label>
      <label class="field"><span>Result</span><textarea data-f="result" rows="2" placeholder="Conclusion / what was learnt">${escapeHtml(data.result || "")}</textarea></label>
      <small class="error" data-topic-error></small>`;

    card.querySelector('[data-action="delete"]').addEventListener("click", () => { card.remove(); relabel(); });
    card.querySelector('[data-action="up"]').addEventListener("click", () => {
      if (card.previousElementSibling) { list.insertBefore(card, card.previousElementSibling); relabel(); }
    });
    card.querySelector('[data-action="down"]').addEventListener("click", () => {
      if (card.nextElementSibling) { list.insertBefore(card.nextElementSibling, card); relabel(); }
    });
    return card;
  }

  function addCard(data = {}) {
    const card = createCard(data);
    list.appendChild(card);
    relabel();
    return card;
  }

  const readCard = (card) => {
    const f = (name) => card.querySelector(`[data-f="${name}"]`);
    return {
      title: f("title").value.trim(),
      aim: f("aim").value.trim(),
      points: f("points").value.trim(),
      language: f("language").value || "python",
      code: f("code").value.replace(/\s+$/, ""),
      output: f("output").value.replace(/\s+$/, ""),
      result: f("result").value.trim(),
    };
  };
  const hasContent = (d) => Boolean(d.title || d.aim || d.points || d.code || d.output || d.result);

  function read() {
    const topics = [];
    const push = (topic) => topics.push({
      id: `topic-${topics.length + 1}`, heading: "", type: "text", content: "", language: "python", code: "", sampleOutput: "",
      ...topic, order: topics.length + 1,
    });
    if (intro.value.trim()) push({ content: intro.value.trim() });
    [...list.children].map(readCard).filter(hasContent).forEach((d) => {
      push({ heading: d.title });
      if (d.aim) push({ heading: "Aim", content: d.aim });
      if (d.points) push({ content: d.points });
      if (d.code) push({ heading: "Program", type: "code", language: d.language, code: d.code });
      if (d.output) push({ heading: "Output", content: `\`\`\`OUTPUT\n${d.output}\n\`\`\`` });
      if (d.result) push({ heading: "Result", content: d.result });
    });
    return topics;
  }

  function validate() {
    let message = "";
    [...list.children].forEach((card) => {
      const d = readCard(card);
      const error = card.querySelector("[data-topic-error]");
      error.textContent = "";
      if (!hasContent(d)) return;
      if (!d.title) error.textContent = "Give this subtopic a title.";
      else if (builderKind(d.title)) error.textContent = `“${d.title}” is a section name. Use the ${/^out/i.test(d.title) ? "Output" : /^(?:res|con)/i.test(d.title) ? "Result" : /^(?:aim|obj|pur)/i.test(d.title) ? "Aim" : "matching"} box inside a subtopic, and give the subtopic its own title.`;
      if (error.textContent && !message) { message = error.textContent; card.scrollIntoView({ block: "center" }); }
    });
    return message;
  }

  function restore(topics = []) {
    list.innerHTML = "";
    intro.value = "";
    const join = (a, b) => (a && b ? `${a}\n\n${b}` : a || b);
    const cardsData = [];
    const introParts = [];
    let current = null;
    const sorted = (Array.isArray(topics) ? topics : []).slice().sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
    sorted.forEach((topic) => {
      const heading = String(topic.heading || "").replace(/^#{1,6}\s*/, "").trim();
      const isCode = topic.type === "code";
      const body = isCode ? String(topic.code || "") : String(topic.content || "");
      const fenced = () => (isCode ? `\`\`\`${topic.language || "python"}\n${topic.code || ""}\n\`\`\`` : body);
      const kind = heading ? builderKind(heading) : "none";
      if (heading && kind === "") { // a custom heading starts a new subtopic
        current = { title: heading, aim: "", points: "", language: "python", code: "", output: "", result: "" };
        cardsData.push(current);
        if (isCode) { current.code = body; current.language = topic.language || "python"; current.output = topic.sampleOutput || ""; }
        else current.points = body;
        return;
      }
      if (!current) { // text before the first subtopic belongs to the detailed description
        introParts.push(heading ? `## ${heading}\n${fenced()}` : fenced());
        return;
      }
      if (kind === "aim") current.aim = join(current.aim, body);
      else if (kind === "program") {
        current.code = join(current.code, isCode ? body : builderStripFence(body));
        if (isCode) current.language = topic.language || current.language;
        if (isCode && topic.sampleOutput) current.output = join(current.output, topic.sampleOutput);
      } else if (kind === "output") current.output = join(current.output, isCode ? body : builderStripFence(body));
      else if (kind === "result") current.result = join(current.result, body);
      else current.points = join(current.points, heading ? `## ${heading}\n${fenced()}` : fenced());
    });
    intro.value = introParts.filter(Boolean).join("\n\n");
    cardsData.forEach((data) => addCard(data));
    if (!cardsData.length && !sorted.length) addCard();
  }

  add.addEventListener("click", () => addCard().querySelector('[data-f="title"]').focus());
  restore([]);
  return { read, validate, restore, add: addCard };
}

d2Builder = createSubtopicBuilder(document.getElementById("d2TopicsBuilder"), { introLabel: "Detailed description (optional)", introHint: "Full explanation shown before the subtopics" });

// ---------- Tools / materials list editor ----------
const TOOL_FIELDS = [
  { key: "name", label: "Tool name", placeholder: "Tool name (e.g. Pandas)", max: 60 },
  { key: "description", label: "Short description", placeholder: "Short description (e.g. Data Analysis Library)", max: 200 },
  { key: "url", label: "Tool link (optional)", placeholder: "https://… (optional)", type: "url", max: 500 },
];
const MATERIAL_FIELDS = [
  { key: "title", label: "Material title", placeholder: "Title (e.g. Lab notes PDF)", max: 120 },
  { key: "url", label: "Material link", placeholder: "https://… link to the PDF, notes or dataset", type: "url", max: 1000 },
];

function isHttpUrl(value) {
  try { return ["http:", "https:"].includes(new URL(value).protocol); } catch (error) { return false; }
}

function createListEditor(mount, { fields, addLabel, required }) {
  mount.replaceChildren();
  mount.classList.add("list-editor");
  const rows = el("div", "list-editor__rows");
  const add = el("button", "btn btn--ghost btn--small", `+ ${addLabel}`);
  add.type = "button";
  mount.append(rows, add);

  function addRow(values = {}) {
    const row = el("div", "list-editor__row");
    fields.forEach((field) => {
      const input = el("input");
      input.type = field.type || "text";
      input.placeholder = field.placeholder;
      input.maxLength = field.max || 200;
      input.value = values[field.key] || "";
      input.dataset.key = field.key;
      input.setAttribute("aria-label", field.label);
      row.appendChild(input);
    });
    const remove = el("button", "btn btn--ghost btn--small", "Remove");
    remove.type = "button";
    remove.addEventListener("click", () => row.remove());
    row.appendChild(remove);
    rows.appendChild(row);
    return row;
  }
  add.addEventListener("click", () => addRow().querySelector("input").focus());

  const read = () => [...rows.children]
    .map((row) => Object.fromEntries(fields.map((field) => [field.key, row.querySelector(`[data-key="${field.key}"]`).value.trim()])))
    .filter((item) => Object.values(item).some(Boolean));

  return {
    set(items) { rows.replaceChildren(); (Array.isArray(items) ? items : []).forEach((item) => addRow(item)); },
    read,
    validate() {
      for (const item of read()) {
        if (!item[required]) return `Fill in the ${required === "name" ? "tool name" : "material title"} for every row.`;
        if (fields.some((field) => field.type === "url" && item[field.key] && !isHttpUrl(item[field.key]))) {
          return "Links must start with http:// or https://";
        }
        if (required === "title" && !item.url) return "Every material needs a link.";
      }
      return "";
    },
  };
}

const toolsEditor = createListEditor(document.getElementById("toolsEditor"), { fields: TOOL_FIELDS, addLabel: "Add Tool", required: "name" });
const materialsEditor = createListEditor(document.getElementById("materialsEditor"), { fields: MATERIAL_FIELDS, addLabel: "Add Material", required: "title" });

// ---------- Add / edit form ----------
function openExperimentModal(id = null) {
  editingId = id;
  form.reset();
  FORM_ERROR_FIELDS.forEach((field) => setError(field, ""));
  d2Builder.restore([]);
  subList.innerHTML = "";
  toolsEditor.set([]);
  materialsEditor.set([]);
  mainCover = "";
  mainVideo.file = null;
  mainVideo.key = "";
  setPreview(coverPreview, uploadHint, "");

  if (id) {
    const item = experiments.find((entry) => entry.id === id);
    numberInput.value = item.number;
    nameInput.value = item.title;
    shortInput.value = item.shortDescription;
    d2HeadingInput.value = item.d2Heading;
    const d2Topics = Array.isArray(item.d2Topics) && item.d2Topics.length
      ? item.d2Topics
      : [{ id: "legacy-topic-1", heading: "", type: "text", content: item.d2Content || "", order: 1 }];
    d2Builder.restore(d2Topics);
    githubInput.value = item.githubUrl;
    toolsEditor.set(item.tools);
    materialsEditor.set(item.materials);
    mainCover = item.cover;
    mainVideo.key = item.video;
    setPreview(coverPreview, uploadHint, item.cover);
    item.subExperiments.forEach((sub) => addSubBlock(sub));
  }
  refreshMainVideo();

  modalTitle.textContent = id ? "Edit Experiment" : "Add Experiment";
  submitBtn.textContent = id ? "Save Changes" : "Add Experiment";
  showModal(experimentModal);
  numberInput.focus();
}

function setPreview(image, hint, src) {
  image.hidden = !src;
  if (src) image.src = src;
  hint.hidden = Boolean(src);
}

function nextLetter(index) {
  return index < 26 ? String.fromCharCode(65 + index) : `A${index - 25}`;
}

function addSubBlock(data = {}) {
  const block = el("fieldset", "sub-block");
  block.innerHTML = `
    <div class="sub-block__head">
      <strong class="sub-block__heading"></strong>
      <button type="button" class="btn btn--ghost btn--small" data-remove>Remove</button>
    </div>
    <div class="field-row field-row--letter">
      <label class="field"><span>Letter</span><input type="text" data-f="letter" maxlength="3"></label>
      <label class="field"><span>Name</span><input type="text" data-f="title" maxlength="80"></label>
    </div>
    <label class="field"><span>Short Description (D1)</span><textarea data-f="shortDescription" rows="2" maxlength="300"></textarea></label>
    <label class="field"><span>Long description heading (optional)</span><input type="text" data-f="d2Heading" maxlength="80" placeholder="Long Description"></label>
    <div class="field"><span>Long description &amp; subtopics</span><div data-st-mount></div></div>
    <div class="field"><span>Cover Page (optional, main cover is used if empty)</span>
      <label class="upload upload--small"><img alt="Sub-experiment cover preview" hidden><span>Click to choose an image</span><input type="file" accept="image/*" hidden></label>
    </div>
    <div class="field"><span>Video (Optional)</span>
      <div class="video-field" data-video-field><input type="file" accept="video/*"><span data-video-status></span><button type="button" class="btn btn--ghost btn--small" data-video-remove hidden>Remove video</button></div>
    </div>
    <label class="field"><span>GitHub Link (optional)</span><input type="url" data-f="githubUrl" placeholder="https://github.com/username/project"></label>
    <label class="check"><input type="checkbox" data-f="completed"> Mark as completed</label>
    <small class="error" data-sub-error></small>`;

  block.stBuilder = createSubtopicBuilder(block.querySelector("[data-st-mount]"), { introLabel: "Long description (optional)", introHint: "Text shown before the subtopics" });
  block.stBuilder.restore(Array.isArray(data.d2Topics) && data.d2Topics.length
    ? data.d2Topics
    : (data.d2Content ? [{ id: "legacy-topic-1", heading: "", type: "text", content: data.d2Content, order: 1 }] : []));
  const field = (name) => block.querySelector(`[data-f="${name}"]`);
  field("letter").value = data.letter || nextLetter(subList.children.length);
  ["title", "shortDescription", "d2Heading", "githubUrl"].forEach((name) => {
    field(name).value = data[name] || "";
  });
  field("completed").checked = data.completed !== false;

  const image = block.querySelector(".upload img");
  const hint = block.querySelector(".upload span");
  block.cover = data.cover || "";
  setPreview(image, hint, block.cover);
  block.querySelector('.upload input[type="file"]').addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      block.cover = await readCoverImage(file);
      setPreview(image, hint, block.cover);
    } catch (error) {
      block.querySelector("[data-sub-error]").textContent = error.message;
    }
  });

  block.video = { file: null, key: data.video || "" };
  bindVideoControl(block.querySelector("[data-video-field]"), block.video);

  const addEditor = (title, fields, addLabel, required, key) => {
    const wrap = el("div", "field");
    const mount = el("div");
    wrap.append(el("span", "", title), mount);
    block.insertBefore(wrap, block.querySelector("[data-sub-error]"));
    block[key] = createListEditor(mount, { fields, addLabel, required });
    block[key].set(data[key === "toolsEditor" ? "tools" : "materials"]);
  };
  addEditor("Tools Used (optional)", TOOL_FIELDS, "Add Tool", "name", "toolsEditor");
  addEditor("Materials (optional)", MATERIAL_FIELDS, "Add Material", "title", "materialsEditor");

  block.querySelector("[data-remove]").addEventListener("click", () => {
    block.remove();
    refreshSubHeadings();
  });

  subList.appendChild(block);
  refreshSubHeadings();
}

function refreshSubHeadings() {
  [...subList.children].forEach((block, index) => {
    block.querySelector(".sub-block__heading").textContent = `Sub-experiment ${index + 1}`;
  });
}

function readSubBlock(block) {
  const value = (name) => block.querySelector(`[data-f="${name}"]`).value.trim();
  return {
    letter: value("letter").toUpperCase(),
    title: value("title"),
    shortDescription: value("shortDescription"),
    d2Heading: value("d2Heading"),
    d2Topics: block.stBuilder.read(),
    d2Content: serializeD2Topics(block.stBuilder.read()),
    cover: block.cover,
    githubUrl: value("githubUrl"),
    tools: block.toolsEditor.read(),
    materials: block.materialsEditor.read(),
    completed: block.querySelector('[data-f="completed"]').checked,
  };
}

function validateSubBlock(block, usedLetters) {
  const sub = readSubBlock(block);
  let message = "";
  if (!/^[A-Z0-9]{1,3}$/.test(sub.letter)) message = "Enter a letter (up to 3 characters).";
  else if (usedLetters.has(sub.letter)) message = `Letter ${sub.letter} is used twice.`;
  else if (!sub.title) message = "Enter the sub-experiment name.";
  else if (!sub.shortDescription) message = "Enter a short description (D1).";
  else if (sub.githubUrl && !isValidGithubUrl(sub.githubUrl)) message = "Use a link like https://github.com/username/project-name";
  else message = block.stBuilder.validate() || block.toolsEditor.validate() || block.materialsEditor.validate();

  block.querySelector("[data-sub-error]").textContent = message;
  usedLetters.add(sub.letter);
  return !message;
}

function validateForm() {
  FORM_ERROR_FIELDS.forEach((field) => setError(field, ""));
  let valid = true;

  if (!numberInput.value.trim()) { setError("number", "Enter a number."); valid = false; }
  if (!nameInput.value.trim()) { setError("name", "Enter a name."); valid = false; }
  if (!shortInput.value.trim()) { setError("description", "Enter a short description (D1)."); valid = false; }
  if (!mainCover) { setError("cover", "Choose a cover image."); valid = false; }
  const github = githubInput.value.trim();
  if (github && !isValidGithubUrl(github)) {
    setError("github", "Use a link like https://github.com/username/project-name");
    valid = false;
  }

  const toolsError = toolsEditor.validate();
  if (toolsError) { setError("tools", toolsError); valid = false; }
  const materialsError = materialsEditor.validate();
  if (materialsError) { setError("materials", materialsError); valid = false; }

  // Sub-experiments are optional: only the blocks that exist are checked
  const usedLetters = new Set();
  [...subList.children].forEach((block) => { if (!validateSubBlock(block, usedLetters)) valid = false; });
  return valid;
}

async function handleMainCoverChange() {
  const file = coverInput.files[0];
  if (!file) return;
  try {
    mainCover = await readCoverImage(file);
    setPreview(coverPreview, uploadHint, mainCover);
    setError("cover", "");
  } catch (error) {
    setError("cover", error.message);
  }
}

async function handleSubmit(event) {
  event.preventDefault();
  if (!validateForm()) return;
  const builderError = d2Builder.validate();
  if (builderError) {
    showToast(builderError, true);
    return;
  }
  const d2Topics = d2Builder.read();
  submitBtn.disabled = true;
  const newVideoKeys = [];
  // Newly chosen video files are uploaded to the server; existing keys are kept.
  const resolveVideo = async (state) => {
    if (!state.file) return state.key;
    const key = await saveVideo(state.file);
    newVideoKeys.push(key);
    return key;
  };

  try {
    const number = numberInput.value.trim();
    const data = {
      number,
      title: nameInput.value.trim(),
      shortDescription: shortInput.value.trim(),
      d2Heading: d2HeadingInput.value.trim(),
      d2Content: serializeD2Topics(d2Topics),
      d2Topics,
      cover: mainCover,
      video: await resolveVideo(mainVideo),
      githubUrl: githubInput.value.trim(),
      tools: toolsEditor.read(),
      materials: materialsEditor.read(),
      subExperiments: [],
    };
    for (const block of [...subList.children]) {
      const sub = readSubBlock(block);
      data.subExperiments.push({ id: `${number}${sub.letter}`, ...sub, video: await resolveVideo(block.video) });
    }

    const previous = editingId ? experiments.find((item) => item.id === editingId) : null;
    const saved = editingId ? await editExperiment(editingId, data) : await addExperiment(data);
    if (!saved) {
      await Promise.all(newVideoKeys.map((key) => deleteVideo(key).catch((error) => {
        console.error("Could not clean up an uploaded video:", error);
      })));
      return; // keep the modal open so nothing is lost
    }
    if (previous) { // drop videos that were replaced or removed
      const kept = new Set(getVideoKeys(data));
      getVideoKeys(previous).filter((key) => !kept.has(key)).forEach(releaseCoverVideoUrl);
      await Promise.all(getVideoKeys(previous).filter((key) => !kept.has(key)).map((key) => deleteVideo(key).catch((error) => {
        console.error("Could not delete a replaced video:", error);
      })));
    }

    hideModal(experimentModal);
    editingId = null;
    searchInput.value = "";
    renderExperiments();
  } catch (error) {
    await Promise.all(newVideoKeys.map((key) => deleteVideo(key).catch((cleanupError) => {
      console.error("Could not clean up an uploaded video:", cleanupError);
    })));
    showToast(`Could not save experiment: ${error.message}`, true);
  } finally {
    submitBtn.disabled = false;
  }
}

// ---------- ID card profile (saved on the server) ----------
const profileModal = document.getElementById("profileModal");
const profileForm = document.getElementById("profileForm");
const profileFields = {
  name: document.getElementById("profileName"),
  roll: document.getElementById("profileRoll"),
  section: document.getElementById("profileSection"),
  branch: document.getElementById("profileBranch"),
  assistantProfessor: document.getElementById("profileProfessor"),
  githubRepo: document.getElementById("profileGithub"),
};
const profilePhotoInput = document.getElementById("profilePhotoInput");
const profilePhotoPreview = document.getElementById("profilePhotoPreview");
const idPhoto = document.getElementById("idPhoto");
const idOutputs = {
  name: document.getElementById("idName"),
  roll: document.getElementById("idRoll"),
  section: document.getElementById("idSection"),
  branch: document.getElementById("idBranch"),
  assistantProfessor: document.getElementById("idProfessor"),
  githubRepo: document.getElementById("idGithub"),
};

const defaultProfile = {
  name: idOutputs.name?.textContent || "",
  roll: idOutputs.roll?.textContent || "",
  section: idOutputs.section?.textContent || "",
  branch: idOutputs.branch?.textContent || "",
  assistantProfessor: "", // never hard-coded: comes from the profile form
  githubRepo: "",         // optional repo link from the profile form
  photo: idPhoto?.getAttribute("src") || "",
  logo: "",
};
let profile = { ...defaultProfile };
let pendingPhoto = "";

// Missing fields (for example in older profiles) fall back to the defaults.
async function loadProfile() {
  const saved = (() => {
    try {
      return JSON.parse(localStorage.getItem(PROFILE_KEY));
    } catch (error) {
      return null;
    }
  })();

  const remote = await apiRequest("/profile");
  const hasRemoteValues = ["name", "roll", "section", "branch", "assistantProfessor", "githubRepo", "photo", "logo"]
    .some((key) => Boolean(remote[key]));
  if (!hasRemoteValues && saved) {
    // One-time copy of the ID card saved by the old browser-only version
    profile = { ...defaultProfile, ...saved, photo: saved.photo || defaultProfile.photo, logo: saved.logo || defaultProfile.logo };
    await apiRequest("/profile", { method: "PUT", body: JSON.stringify(profile) });
    localStorage.removeItem(PROFILE_KEY);
    return;
  }
  profile = { ...defaultProfile, ...saved, ...remote, photo: remote.photo || saved?.photo || defaultProfile.photo, logo: remote.logo || saved?.logo || defaultProfile.logo };
}

async function saveProfile() {
  try {
    profile = { ...defaultProfile, ...await apiRequest("/profile", {
      method: "PUT",
      body: JSON.stringify(profile),
    }) };
    profile.photo = profile.photo || defaultProfile.photo;
    profile.logo = profile.logo || defaultProfile.logo;
    try {
      localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    } catch (error) {
      console.warn("Could not cache the ID card profile locally:", error);
    }
    return true;
  } catch (error) {
    showToast(`Could not save ID card: ${error.message}`, true);
    return false;
  }
}

function renderProfile() {
  Object.keys(idOutputs).forEach((key) => {
    if (!idOutputs[key]) return;
    const value = String(profile[key] || "").trim();
    if (key === "githubRepo") {
      const output = idOutputs[key];
      const valid = value && isValidGithubUrl(value);
      output.classList.toggle("is-empty", !valid);
      if (valid) {
        const link = el("a", "id-card__link", "View Repository ↗");
        link.href = value;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.title = value;
        output.replaceChildren(link);
      } else {
        output.textContent = "Not added";
      }
    } else if (key === "assistantProfessor") {
      idOutputs[key].textContent = value || "Not added";
      idOutputs[key].classList.toggle("is-empty", !value);
    } else {
      idOutputs[key].textContent = value;
    }
  });
  if (idPhoto) idPhoto.src = profile.photo;
  window.dispatchEvent(new CustomEvent("dslab:profile-updated", { detail: profile }));
}

function openProfileModal() {
  Object.keys(profileFields).forEach((key) => {
    profileFields[key].value = profile[key] || "";
    setError(`profile-${key}`, "", profileForm);
  });
  setError("profile-photo", "", profileForm);
  pendingPhoto = profile.photo;
  profilePhotoPreview.src = pendingPhoto;
  profileModal.hidden = false;
  document.body.style.overflow = "hidden";
  profileFields.name.focus();
}

function closeProfileModal() {
  profileModal.hidden = true;
  document.body.style.overflow = "";
}

async function handleProfilePhotoChange() {
  const file = profilePhotoInput.files[0];
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    setError("profile-photo", "Choose an image file (JPG, PNG, WebP).", profileForm);
    return;
  }
  try {
    pendingPhoto = await readCoverImage(file, MAX_PHOTO_WIDTH);
    profilePhotoPreview.src = pendingPhoto;
    setError("profile-photo", "", profileForm);
  } catch (error) {
    setError("profile-photo", error.message, profileForm);
  }
}

async function handleProfileSubmit(event) {
  event.preventDefault();
  let valid = true;
  // Assistant Professor is optional, so only these four are required
  const labels = { name: "name", roll: "roll number", section: "section", branch: "branch" };

  Object.keys(labels).forEach((key) => {
    const empty = !profileFields[key].value.trim();
    setError(`profile-${key}`, empty ? `Enter your ${labels[key]}.` : "", profileForm);
    if (empty) valid = false;
  });
  // GitHub repo link is optional, but must be a valid github.com link when entered
  const repo = profileFields.githubRepo.value.trim();
  const repoOk = !repo || isValidGithubUrl(repo);
  setError("profile-githubRepo", repoOk ? "" : "Use a link like https://github.com/username/repo-name", profileForm);
  if (!repoOk) valid = false;
  if (!valid) return;

  const previous = profile;
  profile = { ...profile, photo: pendingPhoto };
  Object.keys(profileFields).forEach((key) => (profile[key] = profileFields[key].value.trim()));

  if (!await saveProfile()) {
    profile = previous;
    return;
  }
  renderProfile();
  closeProfileModal();
  showToast("ID card updated.");
}

// ---------- Events ----------
document.getElementById("openAddBtn").addEventListener("click", () => { location.href = "experiment-form.html"; });
document.getElementById("addSubBtn").addEventListener("click", () => addSubBlock());
document.querySelectorAll(".modal").forEach((modal) => {
  modal.querySelectorAll("[data-close]").forEach((el) => el.addEventListener("click", () => hideModal(modal)));
});
form.addEventListener("submit", handleSubmit);
coverInput.addEventListener("change", handleMainCoverChange);
// Keep the search text when returning to the listing (Back button, closing a preview, or navigating away and back)
const SEARCH_KEY = "dsl-experiments-search";
try { searchInput.value = sessionStorage.getItem(SEARCH_KEY) || ""; } catch (error) { /* storage unavailable */ }
searchInput.addEventListener("input", () => {
  try { sessionStorage.setItem(SEARCH_KEY, searchInput.value); } catch (error) { /* storage unavailable */ }
  renderExperiments();
});
document.getElementById("editIdBtn")?.addEventListener("click", openProfileModal);
profileForm.addEventListener("submit", handleProfileSubmit);
profilePhotoInput.addEventListener("change", handleProfilePhotoChange);
document.addEventListener("click", closeAllMenus);
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  closeAllMenus();
  document.querySelectorAll(".modal:not([hidden])").forEach(hideModal);
});

// ---------- Start ----------
async function initialize() {
  try {
    await loadProfile();
  } catch (error) {
    showToast(`Could not load ID card from server: ${error.message}`, true);
  }
  renderProfile();

  if (new URLSearchParams(location.search).has("editProfile")) {
    openProfileModal();
  }

  try {
    await loadExperiments();
  } catch (error) {
    experiments = [];
    showToast(`Could not load experiments from server: ${error.message}`, true);
  }
  renderExperiments();
}

initialize();