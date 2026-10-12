/* Topic Details page (topic.html?module=<moduleId>&topic=<topicId>[&focus=pdf|video]).
   Needs shared.js and modules-common.js. */
(function () {
  "use strict";

  const MC = window.ModuleCommon;
  const { el, icon, ICONS } = MC;
  const root = document.getElementById("topicDetail");
  const params = new URLSearchParams(location.search);
  const moduleId = params.get("module");
  const topicId = params.get("topic");
  const focus = params.get("focus") || "";

  function showMessage(text, isError, backHref = "modules.html", backLabel = "← Back to Modules") {
    root.replaceChildren(el("p", `module-status${isError ? " is-error" : ""}`, text));
    const back = el("a", "mbtn mbtn--ghost", backLabel);
    back.href = backHref;
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

  const unavailable = (text) => el("p", "munavailable", text);

  function resourceCard(id, className, iconClass, pathData, title, subtitle) {
    const card = el("section", `mres mres--topic ${className}`);
    card.id = id;
    const head = el("div", "mres__head");
    const box = el("span", `mres__icon ${iconClass}`);
    box.appendChild(icon(pathData));
    const titles = el("div", "mres__titles");
    titles.append(el("h2", "", title), el("p", "", subtitle));
    head.append(box, titles);
    card.appendChild(head);
    return card;
  }

  /* ------------------------------------------------------------------ hero */
  function renderHeader(module, topic, index) {
    const header = el("header", "mtopichead");
    const badges = el("div", "mtopichead__badges");
    const moduleBadge = el("a", "mdhero__badge", `MODULE ${module.numberLabel}`);
    moduleBadge.href = MC.moduleHref(module.id);
    badges.append(moduleBadge, el("span", "mtopichead__pos", `Topic ${index + 1} of ${module.topics.length}`));
    header.append(badges, el("h1", "", topic.title));
    if (topic.description) header.appendChild(el("p", "mtopichead__desc", topic.description));
    return header;
  }

  /* ---------------------------------------------------------------- lesson */
  function renderLesson(topic) {
    const card = el("article", "mpanel mlesson");
    card.id = "topic-lesson";
    const head = el("div", "mpanel__head");
    const title = el("h2", "mpanel__title");
    title.append(icon(ICONS.book), document.createTextNode("Lesson Content"));
    head.appendChild(title);
    card.appendChild(head);
    const body = el("div", "lesson");
    if (topic.lesson && MC.renderLesson(body, topic.lesson)) card.appendChild(body);
    else card.appendChild(unavailable("Lesson content has not been added for this topic yet."));
    return card;
  }

  /* -------------------------------------------------------------- topic PDF */
  function renderPdf(module, topic) {
    const card = resourceCard("topic-pdf", "mres--notes", "mres__icon--pdf", ICONS.doc, "Topic Notes & PDF", "Read the notes for this topic.");
    if (!topic.pdf) {
      card.appendChild(unavailable("A PDF is not available for this topic yet."));
      return card;
    }
    const hosted = MC.isHostedHere(topic.pdf);
    const viewer = el("div", "mpdf");
    const frame = document.createElement("iframe");
    frame.className = "mpdf__frame";
    frame.title = `${topic.title} – PDF`;
    frame.loading = "lazy";
    frame.src = topic.pdf;
    viewer.appendChild(frame);
    card.appendChild(viewer);
    const fallback = el("p", "mpdf__hint", "If the PDF does not appear here, use “Open in new tab”.");
    const actions = el("div", "mres__actions");
    actions.append(
      actionLink("Open in new tab", ICONS.external, topic.pdf, "mbtn mbtn--ghost", { newTab: true }),
      actionLink("Download PDF", ICONS.download, MC.downloadHref(topic.pdf, topic.title), "mbtn mbtn--primary",
        hosted ? { download: MC.safePdfName(topic.title) } : { newTab: true }),
    );
    card.append(actions, fallback);
    return card;
  }

  /* ------------------------------------------------------------ topic video */
  function renderVideo(topic) {
    const card = resourceCard("topic-video", "mres--video", "mres__icon--video", ICONS.play, "Topic Video Lesson", "Watch the video for this topic.");
    if (!topic.video) {
      card.appendChild(unavailable("A video is not available for this topic yet."));
      return card;
    }
    const stage = el("div", "mvideo__stage");
    stage.appendChild(MC.createPlayer(topic.video, `${topic.title} – video`));
    card.appendChild(stage);
    if (!MC.youtubeEmbedUrl(topic.video) && !MC.isHostedHere(topic.video)) {
      const actions = el("div", "mres__actions");
      actions.appendChild(actionLink("Open video link", ICONS.external, topic.video, "mbtn mbtn--ghost", { newTab: true }));
      card.appendChild(actions);
    }
    return card;
  }

  /* ------------------------------------------------- whole-module resources */
  function renderModuleResources(module) {
    const section = el("section", "mpanel mmodres");
    section.id = "module-resources";
    const head = el("div", "mpanel__head");
    const title = el("h2", "mpanel__title");
    title.append(icon(ICONS.layers), document.createTextNode("Full Module Resources"));
    head.appendChild(title);
    section.appendChild(head);
    const actions = el("div", "mres__actions");
    if (module.notes) {
      actions.appendChild(actionLink("Full Module PDF", ICONS.doc, module.notes, "mbtn mbtn--ghost", { newTab: true }));
    } else {
      actions.appendChild(el("span", "mbtn mbtn--ghost is-unavailable", "Full module PDF unavailable"));
    }
    if (module.video) {
      actions.appendChild(actionLink("Full Module Video", ICONS.play, MC.moduleHref(module.id, "&view=videos"), "mbtn mbtn--ghost"));
    } else {
      actions.appendChild(el("span", "mbtn mbtn--ghost is-unavailable", "Full module video unavailable"));
    }
    actions.appendChild(actionLink("All Topics", ICONS.book, `${MC.moduleHref(module.id)}#module-topics`, "mbtn mbtn--ghost"));
    section.appendChild(actions);
    return section;
  }

  /* ------------------------------------------------------------- prev / next */
  function renderPager(module, index) {
    const nav = el("nav", "mpager");
    nav.setAttribute("aria-label", "Topic navigation");
    const make = (topic, direction) => {
      if (!topic) return el("span", "mpager__spacer");
      const a = el("a", `mpager__link mpager__link--${direction}`);
      a.href = MC.topicHref(module.id, topic.id);
      const label = el("span", "mpager__label", direction === "prev" ? "Previous topic" : "Next topic");
      a.append(label, el("strong", "", topic.title));
      return a;
    };
    nav.append(make(module.topics[index - 1], "prev"), make(module.topics[index + 1], "next"));
    return nav;
  }

  /* ------------------------------------------------------------------- page */
  async function init() {
    if (!moduleId || !topicId) { showMessage("No topic was selected."); return; }
    try {
      const modules = await MC.loadModules();
      const module = modules.find((m) => m.id === moduleId);
      MC.renderSidebar(document.getElementById("moduleSidebar"), modules, { moduleId, topicId });
      if (!module) { showMessage("This module could not be found. It may have been deleted.", true); return; }
      const index = module.topics.findIndex((t) => t.id === topicId);
      if (index < 0) {
        showMessage("This topic could not be found. It may have been removed from the module.", true, MC.moduleHref(module.id), "← Back to module");
        return;
      }
      const topic = module.topics[index];
      document.title = `${topic.title} – ${module.title} – Data Science Digital Laboratory`;

      const crumbs = el("nav", "mcrumbs-wrap");
      MC.renderBreadcrumbs(crumbs, [
        { label: "Home", href: "home.html" },
        { label: "Modules", href: "modules.html" },
        { label: module.title, href: MC.moduleHref(module.id) },
        { label: topic.title },
      ]);

      const grid = el("div", "mtopicgrid");
      const side = el("div", "mtopicgrid__side");
      side.append(renderPdf(module, topic), renderVideo(topic));
      grid.append(renderLesson(topic), side);

      root.replaceChildren(crumbs, renderHeader(module, topic, index), grid, renderModuleResources(module), renderPager(module, index));

      const target = focus === "pdf" ? "topic-pdf" : focus === "video" ? "topic-video" : "";
      if (target) {
        const node = document.getElementById(target);
        node.classList.add("is-highlight");
        node.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    } catch (error) {
      showMessage(`Could not load this topic: ${error.message}`, true);
    }
  }

  init();
})();