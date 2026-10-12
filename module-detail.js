/* Module Details page (module.html?id=<moduleId>). Needs shared.js and modules-common.js. */
(function () {
  "use strict";

  const MC = window.ModuleCommon;
  const { el, icon, ICONS, plural } = MC;
  const root = document.getElementById("moduleDetail");
  const params = new URLSearchParams(location.search);
  const moduleId = params.get("id");
  const view = params.get("view") || "";

  // Old links (module.html?id=..&view=pdf|video&topic=..) now open the Topic Details page
  if ((view === "pdf" || view === "video") && moduleId && params.get("topic")) {
    location.replace(MC.topicHref(moduleId, params.get("topic"), `&focus=${view}`));
  }

  function showMessage(text, isError) {
    root.replaceChildren(el("p", `module-status${isError ? " is-error" : ""}`, text));
    const back = el("a", "mbtn mbtn--ghost", "← Back to Modules");
    back.href = "modules.html";
    root.appendChild(back);
  }

  function actionLink(label, pathData, href, className, options = {}) {
    const a = el("a", className);
    a.href = href;
    a.append(icon(pathData), el("span", "", label));
    if (options.newTab) { a.target = "_blank"; a.rel = "noopener noreferrer"; }
    if (options.download) a.download = options.download;
    return a;
  }

  function unavailable(text) {
    return el("p", "munavailable", text);
  }

  /* ---------------------------------------------------------------- sections */
  function renderHero(module) {
    const hero = el("section", "mdhero");
    const text = el("div", "mdhero__text");
    text.append(
      el("span", "mdhero__badge", `MODULE ${module.numberLabel}`),
      el("h1", "", module.title),
      el("p", "mdhero__desc", module.fullDescription || module.shortDescription || "No description has been added for this module yet."),
    );
    hero.appendChild(text);
    if (module.cover) {
      const art = el("div", "mdhero__art");
      const img = document.createElement("img");
      img.src = module.cover; img.alt = `${module.title} cover`;
      art.appendChild(img);
      hero.appendChild(art);
    } else {
      hero.classList.add("mdhero--plain");
    }
    return hero;
  }

  function renderNotesCard(module, mergeEnabled) {
    const card = el("section", "mres mres--notes");
    card.id = "module-notes";
    const head = el("div", "mres__head");
    const iconBox = el("span", "mres__icon mres__icon--pdf");
    iconBox.appendChild(icon(ICONS.doc));
    const titles = el("div", "mres__titles");
    titles.append(el("h2", "", "Module Notes & PDFs"), el("p", "", "View and download all PDFs for this module."));
    head.append(iconBox, titles);
    card.appendChild(head);

    const actions = el("div", "mres__actions");
    if (module.notes) {
      actions.append(
        actionLink("View PDF", ICONS.doc, module.notes, "mbtn mbtn--primary", { newTab: true }),
        actionLink("Download PDF", ICONS.download, MC.downloadHref(module.notes, `${module.title} notes`), "mbtn mbtn--ghost",
          MC.isHostedHere(module.notes) ? { download: MC.safePdfName(`${module.title} notes`) } : { newTab: true }),
      );
    } else {
      actions.appendChild(unavailable("The complete module notes PDF is not available yet."));
    }
    card.appendChild(actions);

    // Combined PDF: only offered when the server can really merge (pdf-lib installed)
    const hostedPdf = module.raw.notesFile || module.topics.some((t) => t.pdfFile) || (module.raw.importantQuestions || {}).pdfFile;
    if (mergeEnabled && hostedPdf) {
      const combined = el("div", "mres__combined");
      combined.appendChild(el("p", "", "Complete module PDF: module notes, then each topic’s notes in order, then additional files, with Important Questions as the final section."));
      const button = el("button", "mbtn mbtn--gold", "Download complete module PDF");
      button.type = "button";
      const status = el("p", "mres__status");
      status.setAttribute("role", "status");
      button.addEventListener("click", async () => {
        button.disabled = true;
        MC.setStatus(status, "Building the complete PDF…");
        try {
          const response = await fetch(`${API_BASE}/modules/${encodeURIComponent(module.id)}/combined-pdf?download=1`);
          if (!response.ok) {
            const body = await response.json().catch(() => null);
            throw new Error(body?.error || `The server returned ${response.status}.`);
          }
          const blob = await response.blob();
          const objectUrl = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = objectUrl;
          a.download = MC.safePdfName(`${module.title} complete`);
          document.body.appendChild(a); a.click(); a.remove();
          setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
          const skipped = Number(response.headers.get("X-Combined-Skipped") || 0);
          MC.setStatus(status, `Complete PDF created from ${plural(Number(response.headers.get("X-Combined-Parts") || 0), "PDF")}.${skipped ? ` ${plural(skipped, "linked PDF")} hosted elsewhere could not be included.` : ""}`);
        } catch (error) {
          MC.setStatus(status, `Could not create the complete PDF: ${error.message}`, true);
        } finally {
          button.disabled = false;
        }
      });
      combined.append(button, status);
      card.appendChild(combined);
    }
    return card;
  }

  function videoItems(module) {
    const items = [];
    if (module.video) items.push({ label: "Complete module video", url: module.video });
    module.topics.forEach((topic, index) => {
      if (topic.video) items.push({ label: `${index + 1}. ${topic.title}`, url: topic.video });
    });
    return items;
  }

  function renderVideoCard(module, openPanel) {
    const card = el("section", "mres mres--video");
    card.id = "module-video";
    const head = el("div", "mres__head");
    const iconBox = el("span", "mres__icon mres__icon--video");
    iconBox.appendChild(icon(ICONS.play));
    const titles = el("div", "mres__titles");
    titles.append(el("h2", "", "Module Video Lessons"), el("p", "", "Watch all video lessons for this module."));
    head.append(iconBox, titles);
    card.appendChild(head);
    const actions = el("div", "mres__actions");
    const items = videoItems(module);
    if (items.length) {
      const play = el("button", "mbtn mbtn--primary");
      play.type = "button";
      play.append(icon(ICONS.play), el("span", "", "Play"));
      play.setAttribute("aria-controls", "videoPanel");
      play.addEventListener("click", () => openPanel());
      actions.appendChild(play);
    } else {
      actions.appendChild(unavailable("No video lessons are available for this module yet."));
    }
    card.appendChild(actions);
    return card;
  }

  function renderVideoPanel(module) {
    const panel = el("section", "mpanel mvideo");
    panel.id = "videoPanel";
    panel.hidden = true;
    panel.setAttribute("aria-label", "Video lessons");
    const head = el("div", "mpanel__head");
    head.appendChild(el("h2", "", "Video Lessons"));
    const close = el("button", "mbtn mbtn--tiny", "Close");
    close.type = "button";
    head.appendChild(close);
    const chips = el("div", "mvideo__chips");
    const stage = el("div", "mvideo__stage");
    panel.append(head, chips, stage);
    const items = videoItems(module);
    let active = -1;
    function play(index) {
      active = index;
      stage.replaceChildren(MC.createPlayer(items[index].url, items[index].label));
      chips.querySelectorAll("button").forEach((b, i) => b.setAttribute("aria-pressed", String(i === index)));
    }
    items.forEach((item, index) => {
      const chip = el("button", "mvideo__chip", item.label);
      chip.type = "button";
      chip.setAttribute("aria-pressed", "false");
      chip.addEventListener("click", () => play(index));
      chips.appendChild(chip);
    });
    close.addEventListener("click", () => { panel.hidden = true; stage.replaceChildren(); active = -1; });
    return {
      panel,
      open() {
        panel.hidden = false;
        if (active < 0 && items.length) play(0);
        panel.scrollIntoView({ behavior: "smooth", block: "start" });
      },
    };
  }

  function renderTopics(module) {
    const section = el("section", "mpanel");
    section.id = "module-topics";
    const head = el("div", "mpanel__head");
    const title = el("h2", "mpanel__title");
    title.append(icon(ICONS.book), document.createTextNode("Topics in this Module"));
    head.append(title, el("span", "mpanel__count", plural(module.topics.length, "Topic")));
    section.appendChild(head);
    if (!module.topics.length) {
      section.appendChild(unavailable("No topics have been added to this module yet."));
      return section;
    }
    const rows = el("ol", "mtopics");
    module.topics.forEach((topic, index) => {
      const row = el("li", "mtopic");
      const badge = el("span", "mtopic__badge", String(index + 1).padStart(2, "0"));
      const main = el("div", "mtopic__main");
      const link = el("a", "mtopic__title", topic.title);
      link.href = MC.topicHref(module.id, topic.id);
      main.appendChild(link);
      const summary = topic.description || (topic.lesson ? topic.lesson.replace(/[#*`>\-!\[\]()]/g, "").replace(/\s+/g, " ").trim().slice(0, 160) : "");
      row.append(badge, main, el("p", "mtopic__desc", summary || "No description added yet."));

      const resource = (label, pathData, available, focus, className) => {
        if (available) {
          const a = el("a", `mchipbtn ${className}`);
          a.href = MC.topicHref(module.id, topic.id, `&focus=${focus}`);
          a.append(icon(pathData), el("span", "", label));
          a.setAttribute("aria-label", `${label} for ${topic.title}`);
          return a;
        }
        const span = el("span", `mchipbtn is-unavailable ${className}`);
        span.append(icon(pathData), el("span", "", label));
        span.setAttribute("aria-label", `${label} not available for ${topic.title}`);
        span.title = `${label} not available`;
        return span;
      };
      const open = el("a", "mtopic__go");
      open.href = MC.topicHref(module.id, topic.id);
      open.setAttribute("aria-label", `Open topic: ${topic.title}`);
      open.appendChild(icon(ICONS.arrow));
      const buttons = el("div", "mtopic__buttons");
      buttons.append(resource("PDF", ICONS.doc, Boolean(topic.pdf), "pdf", "is-pdf"), resource("Video", ICONS.play, Boolean(topic.video), "video", "is-video"), open);
      row.appendChild(buttons);
      rows.appendChild(row);
    });
    section.appendChild(rows);
    return section;
  }

  // Resource order on this page: module notes -> topic resources -> Important Questions
  function renderQuestions(module) {
    const q = module.questions;
    const section = el("section", "mpanel miq");
    section.id = "important-questions";
    const head = el("div", "mpanel__head");
    const title = el("h2", "mpanel__title");
    title.append(icon(ICONS.help), document.createTextNode(q.title));
    head.appendChild(title);
    section.appendChild(head);
    if (q.description) section.appendChild(el("p", "miq__desc", q.description));
    if (q.text) section.appendChild(el("p", "miq__text", q.text));
    if (q.pdf) {
      const actions = el("div", "mres__actions");
      actions.append(
        actionLink("View Important Questions PDF", ICONS.doc, q.pdf, "mbtn mbtn--primary", { newTab: true }),
        actionLink("Download PDF", ICONS.download, MC.downloadHref(q.pdf, `${module.title} important questions`), "mbtn mbtn--ghost",
          MC.isHostedHere(q.pdf) ? { download: MC.safePdfName(`${module.title} important questions`) } : { newTab: true }),
      );
      section.appendChild(actions);
    } else {
      section.appendChild(unavailable("The Important Questions PDF is not available for this module yet."));
    }
    return section;
  }

  function renderAbout(module) {
    const section = el("section", "mpanel");
    section.id = "about-module";
    const head = el("div", "mpanel__head");
    const title = el("h2", "mpanel__title");
    title.append(icon(ICONS.info), document.createTextNode("About this Module"));
    head.appendChild(title);
    section.appendChild(head);

    const grid = el("div", "mabout");
    const stats = el("dl", "mabout__stats");
    const pdfCount = (module.notes ? 1 : 0) + module.topics.filter((t) => t.pdf).length;
    const videoCount = (module.video ? 1 : 0) + module.topics.filter((t) => t.video).length;
    const stat = (label, value, pathData) => {
      const row = el("div", "mabout__row");
      const dt = el("dt");
      dt.append(icon(pathData), document.createTextNode(label));
      row.append(dt, el("dd", "", String(value)));
      stats.appendChild(row);
    };
    stat("Total Topics", module.topics.length, ICONS.layers);
    stat("Notes & PDFs", pdfCount, ICONS.doc);
    stat("Video Lessons", videoCount, ICONS.play);
    stat("Module PDF", module.notes ? "Available" : "Not available", ICONS.doc);
    stat("Module video", module.video ? "Available" : "Not available", ICONS.play);
    stat("Important Questions", module.questions.pdf || module.questions.text ? "Available" : "Not available", ICONS.help);

    const learn = el("div", "mabout__learn");
    learn.appendChild(el("h3", "", "What you will learn"));
    if (module.outcomes.length) {
      const ul = el("ul", "mchecklist");
      module.outcomes.forEach((outcome) => {
        const li = el("li");
        li.append(icon(ICONS.check), el("span", "", outcome));
        ul.appendChild(li);
      });
      learn.appendChild(ul);
    } else {
      learn.appendChild(unavailable("Learning outcomes have not been added for this module yet."));
    }
    grid.append(stats, learn);
    section.appendChild(grid);
    return section;
  }

  /* -------------------------------------------------------------------- page */
  async function mergeAvailable() {
    try {
      const result = await apiRequest("/capabilities");
      return Boolean(result && result.pdfMerge);
    } catch (error) {
      return false; // older server without the route: do not offer the combined PDF
    }
  }

  async function init() {
    if (!moduleId) { showMessage("No module was selected."); return; }
    try {
      const [modules, mergeEnabled] = await Promise.all([MC.loadModules(), mergeAvailable()]);
      const module = modules.find((m) => m.id === moduleId);
      MC.renderSidebar(document.getElementById("moduleSidebar"), modules, { moduleId });
      if (!module) { showMessage("This module could not be found. It may have been deleted.", true); return; }
      module.raw = module; // normalised modules keep the saved fields (notesFile, importantQuestions…)
      document.title = `${module.title} – Data Science Digital Laboratory`;

      const crumbs = el("nav", "mcrumbs-wrap");
      MC.renderBreadcrumbs(crumbs, [
        { label: "Home", href: "home.html" },
        { label: "Modules", href: "modules.html" },
        { label: module.title },
      ]);
      const videoPanel = renderVideoPanel(module);
      const resources = el("div", "mres-grid");
      resources.append(renderNotesCard(module, mergeEnabled), renderVideoCard(module, videoPanel.open));
      root.replaceChildren(crumbs, renderHero(module), resources, videoPanel.panel, renderTopics(module), renderQuestions(module), renderAbout(module));

      if (view === "videos") videoPanel.open();
      else if (view === "notes") {
        const notes = document.getElementById("module-notes");
        notes.classList.add("is-highlight");
        notes.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    } catch (error) {
      showMessage(`Could not load this module: ${error.message}`, true);
    }
  }

  init();
})();