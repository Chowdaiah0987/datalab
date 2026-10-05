const detail = document.getElementById("detail");

function createLink(className, href, text) {
  const link = el("a", className, text);
  link.href = href;
  return link;
}

function createGithubButton(url) {
  const link = el("a", "btn btn--primary btn--gh");
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.innerHTML = `${GITHUB_ICON}<span>GitHub</span>`;
  return link;
}

// Only the sub-experiment buttons that exist; the current one is highlighted
function createSubNav(experiment, activeLetter) {
  if (experiment.subExperiments.length === 0) return null;
  const nav = el("div", "detail__section");
  nav.appendChild(el("p", "detail__label", "Sub-experiments"));
  const row = el("div", "detail__actions");
  experiment.subExperiments.forEach((sub) => {
    const href = `experiment.html?id=${encodeURIComponent(experiment.id)}&sub=${encodeURIComponent(sub.letter)}`;
    const active = sub.letter === activeLetter;
    // Visible text is "Exp A"; the internal letter (A, B, C...) is unchanged
    const chip = createLink("sub-btn" + (active ? " sub-btn--active" : ""), href, `Exp ${sub.letter}`);
    chip.title = sub.title;
    if (active) chip.setAttribute("aria-current", "page");
    row.appendChild(chip);
  });
  nav.appendChild(row);
  return nav;
}

// Read More video: hover plays it from 00:00, leaving pauses it and resets to 00:00.
// Pressing the native Play button (or using the controls while it plays) switches to normal playback,
// which is never reset by pointer movement. The video keeps all of its native controls.
//
// playbackMode: "idle"   - nothing playing
//               "hover"  - started by pointer entering; pointer leaving pauses and resets
//               "manual" - started by the user; pointer movement never touches it
// The source is tracked with an explicit flag set right before our own play() call, so the "play"
// event alone is never used to guess who started playback.
function enableHoverPlayback(video) {
  if (window.matchMedia && !window.matchMedia("(hover: hover)").matches) return; // touch screens: manual only

  let playbackMode = "idle";
  let hoverPlayRequested = false; // true only between our own play() call and its "play" event

  video.addEventListener("mouseenter", () => {
    if (playbackMode === "manual" || !video.paused) return; // never interrupt playback the user started
    playbackMode = "hover";
    hoverPlayRequested = true;
    video.currentTime = 0; // every hover starts from the first frame
    video.play().catch(() => {
      // Autoplay blocked, or the pointer left before playback began
      hoverPlayRequested = false;
      if (playbackMode === "hover" && video.paused) playbackMode = "idle";
    });
  });

  video.addEventListener("mouseleave", () => {
    if (playbackMode !== "hover") return; // manual playback and idle video are left alone
    if (document.fullscreenElement === video || video.webkitDisplayingFullscreen) {
      playbackMode = "manual"; // the user went fullscreen on purpose: keep playing
      return;
    }
    playbackMode = "idle";
    hoverPlayRequested = false;
    video.pause();
    video.currentTime = 0;
  });

  video.addEventListener("play", () => {
    // A play() we did not request (native Play button, keyboard, etc.) is manual playback
    playbackMode = hoverPlayRequested ? "hover" : "manual";
    hoverPlayRequested = false;
  });

  video.addEventListener("pause", () => {
    if (video.ended) return; // "pause" also fires right before "ended"; handled there
    playbackMode = "idle"; // paused by the user (our own leave handler already set "idle")
  });

  video.addEventListener("ended", () => {
    if (playbackMode === "manual") playbackMode = "idle"; // normal end state is preserved
  });

  // Using the controls while hover-playing (seek, volume, etc.) counts as taking over
  ["pointerdown", "keydown"].forEach((type) => {
    video.addEventListener(type, () => {
      if (playbackMode === "hover") playbackMode = "manual";
    });
  });
}

// The video section is only added when a saved video can actually be read
async function attachVideo(slot, key) {
  if (!key) return;
  try {
    const blob = await getVideo(key);
    if (!blob) return;
    const video = el("video", "detail__video");
    video.controls = true;
    video.preload = "metadata";
    video.src = URL.createObjectURL(blob);
    enableHoverPlayback(video);
    const section = el("div", "detail__section");
    section.appendChild(video);
    slot.replaceWith(section);
  } catch (error) {
    console.error("Could not load experiment video:", error);
    slot.textContent = "The saved video could not be loaded.";
  }
}

const DOWNLOAD_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m0 0-4-4m4 4 4-4M5 21h14"/></svg>`;

// D2 heading on the left, Download PDF button on the right of the same row
function createD2Header(headingText, pdfOptions, panel) {
  const row = el("div", "detail__d2-head");
  const button = el("button", "btn btn--primary btn--small detail__pdf-btn");
  button.type = "button";
  button.innerHTML = `${DOWNLOAD_ICON}<span>Download PDF</span>`;
  button.addEventListener("click", async () => {
    button.disabled = true;
    try {
      await downloadD2Pdf(pdfOptions); // waits for the PDF library if it is still loading
    } catch (error) {
      if (!error.isPdfMessage) console.error("PDF download failed:", error);
      showPdfMessage(panel, row, error.isPdfMessage ? error.message : "Could not create the PDF. Please try again.");
    } finally {
      button.disabled = false;
    }
  });
  row.append(el("h2", "detail__d2-heading", headingText), button);
  return row;
}

function showPdfMessage(panel, row, message) {
  panel.querySelector(".detail__pdf-note")?.remove();
  const note = el("p", "detail__pdf-note", message);
  note.setAttribute("role", "status");
  row.after(note);
  setTimeout(() => note.remove(), 5000);
}

// One layout for both main experiments and sub-experiments
function renderPage({ label, title, video, githubUrl, d2Heading, d2Content, d2Topics, nav }) {
  const sidebar = el("aside", "detail__left");
  const header = el("div", "detail__head");
  header.append(el("p", "detail__label", label), el("h1", "", title));
  sidebar.appendChild(header);

  const videoSlot = el("div"); // replaced by the player, or removed, once the video loads
  sidebar.appendChild(videoSlot);
  if (nav) sidebar.appendChild(nav);
  if (githubUrl) {
    const section = el("div", "detail__section");
    section.appendChild(createGithubButton(githubUrl));
    sidebar.appendChild(section);
  }

  const panel = el("section", "detail__panel");
  const headingText = d2Heading || "Long Description";
  panel.appendChild(createD2Header(headingText, {
    label,
    title,
    heading: headingText,
    content: d2Content,
    topics: d2Topics
  }, panel));
  // renderD2Content (d2-format.js) shows headings, lists and code blocks; all text is kept
  panel.appendChild(Array.isArray(d2Topics) && d2Topics.length
    ? renderD2Topics(d2Topics)
    : d2Content
      ? renderD2Content(d2Content)
    : el("div", "detail__d2 detail__d2--empty", "No detailed description has been added yet."));

  const layout = el("div", "detail__layout");
  layout.append(sidebar, panel);
  detail.innerHTML = "";
  detail.appendChild(layout);
  document.title = `${title} – DS Lab`;
  if (video) attachVideo(videoSlot, video);
  else videoSlot.remove();
}

// Loads the experiment from the server (MongoDB)
async function showDetails() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");
  if (!id) {
    showNotFound();
    return;
  }

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
      showNotFound();
      return;
    }
    detail.innerHTML = "";
    detail.append(el("h1", "", "Could not load experiment"),
      el("p", "detail__empty-note", error.message));
    return;
  }

  if (!experiment) {
    showNotFound();
    return;
  }
  const subParam = params.get("sub");
  const sub = subParam && experiment.subExperiments.find((item) => item.letter === subParam || item.id === subParam);
  const source = sub || experiment;
  renderPage({
    label: sub ? `Experiment ${sub.id}` : `Experiment ${experiment.number}`,
    title: source.title,
    video: source.video,
    githubUrl: source.githubUrl,
    d2Heading: source.d2Heading,
    d2Content: source.d2Content,
    d2Topics: source.d2Topics,
    nav: createSubNav(experiment, sub ? sub.letter : null),
  });
}

function showNotFound() {
  detail.innerHTML = "";
  detail.append(el("h1", "", "Experiment not found"),
    el("p", "detail__empty-note", "It may have been deleted, or it was saved in a different browser."));
}

showDetails();