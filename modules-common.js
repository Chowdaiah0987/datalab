/* Shared helpers for modules.html, module.html and topic.html:
   data normalising, URLs, YouTube embeds, safe lesson renderer, and the MODULES & TOPICS sidebar. */
(function () {
  "use strict";

  const MC = {};
  window.ModuleCommon = MC;

  const SVG_NS = "http://www.w3.org/2000/svg";

  MC.el = function (tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  };

  MC.icon = function (pathData, className) {
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    if (className) svg.setAttribute("class", className);
    String(pathData).split("|").forEach((d) => {
      const path = document.createElementNS(SVG_NS, "path");
      path.setAttribute("d", d);
      svg.appendChild(path);
    });
    return svg;
  };

  MC.ICONS = {
    doc: "M6 2h8l4 4v16H6z|M14 2v5h5|M9 13h6|M9 17h6",
    play: "M10 8l6 4-6 4z|M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z",
    download: "M12 3v12|M7 11l5 5 5-5|M5 21h14",
    arrow: "M5 12h14|M13 6l6 6-6 6",
    chevron: "M6 9l6 6 6-6",
    book: "M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5z|M4 5.5v16",
    search: "M10.8 4a6.8 6.8 0 1 0 0 13.6 6.8 6.8 0 0 0 0-13.6z|M16 16l4.5 4.5",
    home: "M3 11l9-8 9 8|M5 10v10h14V10",
    external: "M14 4h6v6|M20 4l-9 9|M18 14v6H4V6h6",
    check: "M5 12l5 5 9-10",
    layers: "M12 3l9 5-9 5-9-5z|M3 12l9 5 9-5|M3 16l9 5 9-5",
    info: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z|M12 11v6|M12 7.5v.5",
    help: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z|M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7|M12 17v.5",
  };

  /* ---------- URLs ---------- */
  MC.moduleHref = (id, extra) => `module.html?id=${encodeURIComponent(id)}${extra || ""}`;
  MC.topicHref = (moduleId, topicId, extra) =>
    `topic.html?module=${encodeURIComponent(moduleId)}&topic=${encodeURIComponent(topicId)}${extra || ""}`;

  MC.fileUrl = (file) => (file && file.id ? `${API_BASE}/module-files/${encodeURIComponent(file.id)}` : "");

  // Adds ?download=1 for files hosted by this site so the browser saves them instead of opening them
  MC.downloadHref = function (url, filename) {
    if (!url) return "";
    if (url.startsWith(`${API_BASE}/module-files/`) || url.startsWith(`${API_BASE}/important-question-files/`)) {
      const joiner = url.includes("?") ? "&" : "?";
      const name = filename ? `&downloadName=${encodeURIComponent(MC.safePdfName(filename))}` : "";
      return `${url}${joiner}download=1${name}`;
    }
    return url;
  };

  MC.safePdfName = function (title) {
    const slug = String(title || "Document")
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^A-Za-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
    return `${slug || "Document"}.pdf`;
  };

  MC.isHostedHere = (url) => String(url || "").startsWith(API_BASE);

  MC.youtubeEmbedUrl = function (source) {
    try {
      const url = new URL(source);
      const host = url.hostname.toLowerCase().replace(/^www\./, "");
      let videoId = "";
      if (host === "youtu.be") videoId = url.pathname.split("/").filter(Boolean)[0] || "";
      else if (host === "youtube.com" || host.endsWith(".youtube.com")) {
        videoId = url.searchParams.get("v") || (url.pathname.match(/^\/(?:embed|shorts|live)\/([^/]+)/) || [])[1] || "";
      }
      return /^[A-Za-z0-9_-]{11}$/.test(videoId) ? `https://www.youtube-nocookie.com/embed/${videoId}` : "";
    } catch (error) {
      return "";
    }
  };

  // Builds a player for an uploaded/linked video: a YouTube iframe or a <video> element
  MC.createPlayer = function (source, title) {
    const embed = MC.youtubeEmbedUrl(source);
    if (embed) {
      const frame = MC.el("iframe", "mplayer");
      frame.src = embed;
      frame.title = title;
      frame.loading = "lazy";
      frame.allow = "accelerometer; encrypted-media; gyroscope; picture-in-picture; web-share";
      frame.allowFullscreen = true;
      return frame;
    }
    const video = document.createElement("video");
    video.className = "mplayer";
    video.controls = true;
    video.preload = "metadata";
    video.src = source;
    video.setAttribute("aria-label", title);
    return video;
  };

  /* ---------- Data ---------- */
  MC.pad = (value) => {
    const text = String(value ?? "").trim();
    return /^\d+$/.test(text) ? text.padStart(2, "0") : text;
  };

  MC.normalizeTopic = function (topic, index) {
    const order = Number(topic.order);
    const pdf = MC.fileUrl(topic.pdfFile) || topic.pdfUrl || "";
    const video = MC.fileUrl(topic.videoFile) || topic.videoUrl || "";
    return {
      ...topic,
      id: String(topic.id || ""),
      title: topic.title || "Untitled topic",
      description: topic.description || "",
      lesson: topic.content || "",
      order: Number.isFinite(order) && order > 0 ? order : index + 1,
      pdf,
      video,
    };
  };

  MC.normalizeModule = function (raw, fallbackNumber) {
    const topics = (Array.isArray(raw.topics) ? raw.topics : [])
      .map((topic, index) => MC.normalizeTopic(topic, index))
      .map((topic, index) => ({ ...topic, _i: index }))
      .sort((a, b) => a.order - b.order || a._i - b._i);
    const questions = raw.importantQuestions || {};
    const numberText = String(raw.number ?? "").trim() || String(fallbackNumber);
    return {
      ...raw,
      id: String(raw.id || raw._id || ""),
      title: raw.title || "Untitled module",
      number: numberText,
      numberLabel: MC.pad(numberText),
      shortDescription: raw.description || "",
      fullDescription: raw.fullDescription || "",
      outcomes: Array.isArray(raw.learningOutcomes) ? raw.learningOutcomes.filter(Boolean) : [],
      topics,
      notes: MC.fileUrl(raw.notesFile) || raw.notesUrl || "",
      video: MC.fileUrl(raw.moduleVideoFile) || raw.moduleVideoUrl || "",
      questions: {
        title: questions.title || "Important Questions",
        description: questions.description || "",
        text: String(questions.text || "").trim(),
        pdf: questions.pdfFile
          ? `${API_BASE}/important-question-files/${encodeURIComponent(questions.pdfFile.id)}`
          : (questions.pdfUrl && !String(questions.pdfUrl).startsWith("/api/") ? questions.pdfUrl : ""),
        pdfName: questions.pdfFile ? questions.pdfFile.name : "",
      },
    };
  };

  // Modules are ordered by their module number; modules without one keep their creation order.
  MC.loadModules = async function () {
    const list = await apiRequest("/modules");
    const byCreation = list
      .map((module, index) => ({ module, index }))
      .sort((a, b) => String(a.module.createdAt || "").localeCompare(String(b.module.createdAt || "")) || b.index - a.index);
    const normalized = byCreation.map(({ module }, position) => MC.normalizeModule(module, position + 1));
    const numeric = (m) => (/^\d+(\.\d+)?$/.test(m.number) ? Number(m.number) : Number.POSITIVE_INFINITY);
    return normalized
      .map((m, i) => ({ m, i }))
      .sort((a, b) => numeric(a.m) - numeric(b.m) || a.i - b.i)
      .map(({ m }) => m);
  };

  MC.hasPdf = (module) => Boolean(module.notes || module.topics.some((t) => t.pdf));
  MC.hasVideo = (module) => Boolean(module.video || module.topics.some((t) => t.video));

  MC.plural = (count, word) => `${count} ${word}${count === 1 ? "" : "s"}`;

  /* ---------- Search matching (used by the sidebar and the module cards) ---------- */
  MC.matches = function (module, query) {
    const q = String(query || "").trim().toLowerCase();
    if (!q) return { module: true, topics: null };
    const moduleHit = `${module.title} ${module.shortDescription}`.toLowerCase().includes(q);
    const topicHits = module.topics.filter((t) => `${t.title} ${t.description}`.toLowerCase().includes(q)).map((t) => t.id);
    return { module: moduleHit || topicHits.length > 0, topics: moduleHit ? null : topicHits };
  };

  /* ---------- Sidebar ---------- */
  MC.renderSidebar = function (mount, modules, state = {}) {
    const wide = window.matchMedia("(min-width: 901px)");
    const side = MC.el("div", "msb");
    const toggle = MC.el("button", "msb__toggle");
    toggle.type = "button";
    toggle.id = "msbToggle";
    toggle.setAttribute("aria-controls", "msbPanel");
    toggle.append(MC.icon(MC.ICONS.book), MC.el("span", "", "MODULES & TOPICS"), MC.icon(MC.ICONS.chevron, "msb__toggle-chevron"));

    const panel = MC.el("div", "msb__panel");
    panel.id = "msbPanel";
    const searchLabel = MC.el("label", "msb__search");
    searchLabel.append(MC.icon(MC.ICONS.search));
    const search = document.createElement("input");
    search.type = "search";
    search.placeholder = "Search modules or topics...";
    search.setAttribute("aria-label", "Search modules or topics");
    search.autocomplete = "off";
    searchLabel.appendChild(search);
    const list = MC.el("ul", "msb__list");
    const empty = MC.el("p", "msb__empty", "No modules or topics match your search.");
    empty.hidden = true;
    panel.append(searchLabel, list, empty);
    side.append(toggle, panel);
    mount.replaceChildren(side);

    const open = new Set(state.moduleId ? [state.moduleId] : []);
    const items = modules.map((module) => {
      const li = MC.el("li", "msb__module");
      const row = MC.el("div", "msb__row");
      const link = MC.el("a", "msb__link");
      link.href = MC.moduleHref(module.id);
      link.append(
        MC.el("span", "msb__badge", module.numberLabel),
        MC.el("span", "msb__title", module.title),
        MC.el("span", "msb__count", MC.plural(module.topics.length, "Topic")),
      );
      if (module.id === state.moduleId && !state.topicId) link.setAttribute("aria-current", "page");
      const chev = MC.el("button", "msb__chev");
      chev.type = "button";
      chev.setAttribute("aria-label", `Show topics of ${module.title}`);
      chev.appendChild(MC.icon(MC.ICONS.chevron));
      row.append(link, chev);
      const topics = MC.el("ul", "msb__topics");
      topics.id = `msb-topics-${module.id}`;
      chev.setAttribute("aria-controls", topics.id);
      const topicNodes = module.topics.map((topic, index) => {
        const item = MC.el("li", "msb__topic");
        const a = MC.el("a", "msb__topic-link");
        a.href = MC.topicHref(module.id, topic.id);
        const isCurrent = module.id === state.moduleId && topic.id === state.topicId;
        if (isCurrent) { a.classList.add("is-current"); a.setAttribute("aria-current", "page"); }
        a.append(MC.icon(isCurrent ? MC.ICONS.play : MC.ICONS.doc), MC.el("span", "", `${index + 1}. ${topic.title}`));
        item.appendChild(a);
        return { topic, item };
      });
      topics.append(...topicNodes.map((n) => n.item));
      if (!module.topics.length) topics.appendChild(MC.el("li", "msb__none", "No topics yet"));
      li.append(row, topics);
      if (module.id === state.moduleId) li.classList.add("is-current");
      chev.addEventListener("click", () => {
        if (open.has(module.id)) open.delete(module.id); else open.add(module.id);
        paint();
      });
      return { module, li, chev, topics, topicNodes };
    });
    list.append(...items.map((i) => i.li));

    let query = "";
    function paint() {
      let visible = 0;
      items.forEach(({ module, li, chev, topics, topicNodes }) => {
        const hit = MC.matches(module, query);
        li.hidden = !hit.module;
        if (!hit.module) return;
        visible += 1;
        const expanded = query.trim() ? Boolean(hit.topics && hit.topics.length) || open.has(module.id) && hit.topics === null : open.has(module.id);
        li.classList.toggle("is-open", expanded);
        chev.setAttribute("aria-expanded", String(expanded));
        topics.hidden = !expanded;
        topicNodes.forEach(({ topic, item }) => {
          item.hidden = Boolean(hit.topics) && !hit.topics.includes(topic.id);
        });
      });
      empty.hidden = visible > 0;
    }

    function setPanel(openPanel) {
      panel.hidden = !openPanel;
      toggle.setAttribute("aria-expanded", String(openPanel));
      side.classList.toggle("is-collapsed", !openPanel);
    }
    toggle.addEventListener("click", () => setPanel(panel.hidden));
    const syncLayout = () => setPanel(wide.matches); // always open on desktop, collapsed on phones/tablets
    if (wide.addEventListener) wide.addEventListener("change", syncLayout); else wide.addListener(syncLayout);
    syncLayout();

    search.addEventListener("input", () => {
      query = search.value;
      paint();
      if (typeof state.onSearch === "function") state.onSearch(query);
    });
    paint();
    // Keep the highlighted topic in view inside the scrolling sidebar
    const current = panel.querySelector(".msb__topic-link.is-current");
    if (current && current.scrollIntoView) current.scrollIntoView({ block: "nearest" });
    return { search, setQuery(value) { search.value = value; query = value; paint(); } };
  };

  /* ---------- Breadcrumbs ---------- */
  MC.renderBreadcrumbs = function (nav, crumbs) {
    nav.replaceChildren();
    nav.setAttribute("aria-label", "Breadcrumb");
    const ol = MC.el("ol", "mcrumbs");
    crumbs.forEach((crumb, index) => {
      const li = MC.el("li");
      if (index === 0) {
        const a = MC.el("a", "mcrumbs__home");
        a.href = crumb.href;
        a.setAttribute("aria-label", crumb.label);
        a.appendChild(MC.icon(MC.ICONS.home));
        li.appendChild(a);
      } else if (crumb.href) {
        const a = MC.el("a", "", crumb.label);
        a.href = crumb.href;
        li.appendChild(a);
      } else {
        const span = MC.el("span", "", crumb.label);
        span.setAttribute("aria-current", "page");
        li.appendChild(span);
      }
      ol.appendChild(li);
    });
    nav.appendChild(ol);
  };

  /* ---------- Lesson content renderer (DOM only, never innerHTML) ----------
     Supported: # / ## / ### headings, paragraphs, - / * lists, 1. lists, ``` code blocks,
     ![alt](image-url) images, **bold**, *italic*, `code`, [text](https://link).        */
  function safeLink(url) {
    try {
      const parsed = new URL(url, location.href);
      return ["http:", "https:", "mailto:"].includes(parsed.protocol) ? parsed.href : "";
    } catch (error) { return ""; }
  }
  function safeImage(url) {
    if (/^data:image\/(png|jpe?g|gif|webp);base64,/i.test(url)) return url;
    try {
      const parsed = new URL(url, location.href);
      return ["http:", "https:"].includes(parsed.protocol) ? parsed.href : "";
    } catch (error) { return ""; }
  }

  function inline(parent, textValue) {
    const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*|\[[^\]]+\]\([^)\s]+\))/g;
    let last = 0;
    let match;
    while ((match = pattern.exec(textValue))) {
      if (match.index > last) parent.appendChild(document.createTextNode(textValue.slice(last, match.index)));
      const token = match[0];
      if (token.startsWith("**")) parent.appendChild(MC.el("strong", "", token.slice(2, -2)));
      else if (token.startsWith("`")) parent.appendChild(MC.el("code", "", token.slice(1, -1)));
      else if (token.startsWith("[")) {
        const parts = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(token);
        const href = parts ? safeLink(parts[2]) : "";
        if (href) {
          const a = MC.el("a", "", parts[1]);
          a.href = href;
          a.target = "_blank";
          a.rel = "noopener noreferrer";
          parent.appendChild(a);
        } else parent.appendChild(document.createTextNode(token));
      } else parent.appendChild(MC.el("em", "", token.slice(1, -1)));
      last = match.index + token.length;
    }
    if (last < textValue.length) parent.appendChild(document.createTextNode(textValue.slice(last)));
  }

  MC.renderLesson = function (container, source) {
    container.replaceChildren();
    const lines = String(source || "").replace(/\r\n?/g, "\n").split("\n");
    let paragraph = [];
    let list = null;
    const flushParagraph = () => {
      if (!paragraph.length) return;
      const p = MC.el("p");
      inline(p, paragraph.join(" "));
      container.appendChild(p);
      paragraph = [];
    };
    const flushList = () => { list = null; };
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      const fence = /^```\s*([A-Za-z0-9_+#.-]*)\s*$/.exec(line);
      if (fence) {
        flushParagraph(); flushList();
        const code = [];
        i += 1;
        while (i < lines.length && !/^```\s*$/.test(lines[i])) { code.push(lines[i]); i += 1; }
        const figure = MC.el("figure", "lesson-code");
        const lang = fence[1] && fence[1].toUpperCase() !== "OUTPUT" ? fence[1] : "";
        if (lang || fence[1].toUpperCase() === "OUTPUT") figure.appendChild(MC.el("figcaption", "", lang || "Output"));
        const pre = MC.el("pre");
        pre.appendChild(MC.el("code", "", code.join("\n")));
        figure.appendChild(pre);
        container.appendChild(figure);
        continue;
      }
      if (!line.trim()) { flushParagraph(); flushList(); continue; }
      const heading = /^(#{1,3})\s+(.*)$/.exec(line);
      if (heading) {
        flushParagraph(); flushList();
        const h = MC.el(`h${heading[1].length + 1}`);
        inline(h, heading[2].trim());
        container.appendChild(h);
        continue;
      }
      const image = /^!\[([^\]]*)\]\(([^)\s]+)\)\s*$/.exec(line.trim());
      if (image) {
        flushParagraph(); flushList();
        const src = safeImage(image[2]);
        if (src) {
          const figure = MC.el("figure", "lesson-image");
          const img = document.createElement("img");
          img.src = src;
          img.alt = image[1];
          img.loading = "lazy";
          figure.appendChild(img);
          if (image[1]) figure.appendChild(MC.el("figcaption", "", image[1]));
          container.appendChild(figure);
        }
        continue;
      }
      const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
      const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
      if (bullet || numbered) {
        flushParagraph();
        const tag = bullet ? "UL" : "OL";
        if (!list || list.tagName !== tag) {
          list = document.createElement(tag.toLowerCase());
          container.appendChild(list);
        }
        const li = MC.el("li");
        inline(li, (bullet || numbered)[1]);
        list.appendChild(li);
        continue;
      }
      flushList();
      paragraph.push(line.trim());
    }
    flushParagraph();
    return container.childElementCount > 0;
  };

  MC.setStatus = function (node, message, isError) {
    node.textContent = message;
    node.classList.toggle("is-error", Boolean(isError));
  };
})();