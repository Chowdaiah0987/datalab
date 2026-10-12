/* Modules overview: sidebar + two-column cards + Add/Edit Module form. Needs shared.js and modules-common.js. */
(function () {
  "use strict";

  const MC = window.ModuleCommon;
  const { el, icon, ICONS, plural } = MC;

  const form = document.getElementById("moduleForm");
  const list = document.getElementById("moduleList");
  const statusEl = document.getElementById("moduleStatus");
  const messageEl = document.getElementById("moduleFormMessage");
  const saveButton = document.getElementById("saveModule");
  const topicsBox = document.getElementById("moduleTopics");
  const details = form.closest("details");
  const formTitle = document.getElementById("moduleFormTitle");
  const $ = (id) => document.getElementById(id);

  const MAX_PDF_MB = 50;
  const MAX_VIDEO_MB = 300;
  const VIDEO_EXT = /\.(avi|m4v|mkv|mov|mp4|ogg|webm)$/i;

  let modules = [];
  let loaded = false;
  let editing = null; // the module being edited, or null when adding
  let saving = false;
  let query = "";
  let sidebar = null;

  /* ------------------------------------------------------------------ uploads */
  function videoType(file) {
    const types = { avi: "video/x-msvideo", m4v: "video/x-m4v", mkv: "video/x-matroska", mov: "video/quicktime", mp4: "video/mp4", ogg: "video/ogg", webm: "video/webm" };
    return file.type.startsWith("video/") ? file.type : (types[file.name.split(".").pop().toLowerCase()] || "");
  }

  async function uploadModuleFile(file) {
    const isPdf = /\.pdf$/i.test(file.name);
    const type = isPdf ? "application/pdf" : videoType(file);
    if (!type) throw new Error(`Could not determine the file type for ${file.name}.`);
    const response = await fetch(`${API_BASE}/module-files`, {
      method: "POST",
      headers: { "Content-Type": type, "X-Module-File-Name": encodeURIComponent(file.name) },
      body: file,
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) throw new Error(result?.error || `Could not upload ${file.name}.`);
    return result;
  }

  async function uploadQuestionsPdf(file) {
    const response = await fetch(`${API_BASE}/important-question-files`, {
      method: "POST",
      headers: { "Content-Type": "application/pdf", "X-Important-Questions-File-Name": encodeURIComponent(file.name) },
      body: file,
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) throw new Error(result?.error || `Could not upload ${file.name}.`);
    return result;
  }

  const deleteModuleFile = (id) => fetch(`${API_BASE}/module-files/${encodeURIComponent(id)}`, { method: "DELETE" });
  const deleteQuestionsFile = (id) => fetch(`${API_BASE}/important-question-files/${encodeURIComponent(id)}`, { method: "DELETE" });

  function readCover(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Could not read the cover image."));
      reader.onload = () => {
        const image = new Image();
        image.onerror = () => reject(new Error("Choose a valid cover image."));
        image.onload = () => {
          const scale = Math.min(1, 1000 / image.width);
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(image.width * scale));
          canvas.height = Math.max(1, Math.round(image.height * scale));
          const context = canvas.getContext("2d");
          if (!context) { reject(new Error("Could not process the cover image.")); return; }
          context.drawImage(image, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/jpeg", 0.82));
        };
        image.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  /* --------------------------------------------- reusable "file or URL" field */
  // kind: "pdf" | "video". current: the saved file object (or null). url: the saved external URL.
  function createAttachment({ label, kind, current, url }) {
    const root = el("div", "mattach");
    root.appendChild(el("span", "mattach__label", label));

    const fileLabel = el("label", "module-field");
    fileLabel.appendChild(el("span", "", kind === "pdf" ? "Upload PDF" : "Upload video"));
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = kind === "pdf" ? ".pdf,application/pdf" : "video/*";
    fileLabel.appendChild(fileInput);
    root.appendChild(fileLabel);

    let removeBox = null;
    if (current) {
      const row = el("label", "module-current-file");
      removeBox = document.createElement("input");
      removeBox.type = "checkbox";
      const open = el("a", "", current.name);
      open.href = MC.fileUrl(current) || (current.id ? `${API_BASE}/important-question-files/${current.id}` : "#");
      open.target = "_blank";
      open.rel = "noopener noreferrer";
      const text = el("span", "", "Remove current file: ");
      text.appendChild(open);
      row.append(removeBox, text);
      root.appendChild(row);
    }

    const urlLabel = el("label", "module-field");
    urlLabel.appendChild(el("span", "", kind === "pdf" ? "…or PDF URL" : "…or video URL (YouTube links work)"));
    const urlInput = document.createElement("input");
    urlInput.type = "url";
    urlInput.placeholder = "https://…";
    urlInput.value = url || "";
    urlLabel.appendChild(urlInput);
    root.appendChild(urlLabel);

    const preview = el("div", "mattach__preview");
    root.appendChild(preview);
    let blobUrl = "";
    const clearBlob = () => { if (blobUrl) URL.revokeObjectURL(blobUrl); blobUrl = ""; };

    function showPreview() {
      clearBlob();
      preview.replaceChildren();
      const picked = fileInput.files[0];
      const typed = urlInput.value.trim();
      const source = picked ? (blobUrl = URL.createObjectURL(picked)) : typed;
      if (!source) return;
      if (kind === "video") {
        if (!picked && MC.youtubeEmbedUrl(source)) {
          const a = el("a", "mattach__link", "Open video link");
          a.href = source; a.target = "_blank"; a.rel = "noopener noreferrer";
          preview.appendChild(a);
        } else {
          const video = document.createElement("video");
          video.controls = true; video.preload = "metadata"; video.src = source;
          preview.appendChild(video);
        }
      } else {
        const a = el("a", "mattach__link", picked ? "Preview selected PDF" : "Open PDF link");
        a.href = source; a.target = "_blank"; a.rel = "noopener noreferrer";
        preview.appendChild(a);
      }
    }

    fileInput.addEventListener("change", () => {
      if (fileInput.files[0]) { urlInput.value = ""; if (removeBox) removeBox.checked = true; }
      showPreview();
    });
    urlInput.addEventListener("input", () => {
      if (urlInput.value.trim()) { fileInput.value = ""; if (removeBox) removeBox.checked = true; }
      showPreview();
    });
    if (url) showPreview();

    return {
      root,
      focusTarget: fileInput,
      validate() {
        const picked = fileInput.files[0];
        const typed = urlInput.value.trim();
        if (picked && typed) return `${label}: choose either an uploaded file or a URL, not both.`;
        if (picked && kind === "pdf" && !/\.pdf$/i.test(picked.name)) return `${label}: the file must be a PDF (.pdf).`;
        if (picked && kind === "pdf" && picked.size > MAX_PDF_MB * 1024 * 1024) return `${label}: PDFs can be at most ${MAX_PDF_MB} MB.`;
        if (picked && kind === "video" && !picked.type.startsWith("video/") && !VIDEO_EXT.test(picked.name)) return `${label}: choose a video file.`;
        if (picked && kind === "video" && picked.size > MAX_VIDEO_MB * 1024 * 1024) return `${label}: videos can be at most ${MAX_VIDEO_MB} MB.`;
        if (typed) {
          try { if (!["http:", "https:"].includes(new URL(typed).protocol)) throw new Error(); }
          catch (error) { return `${label}: enter a valid URL starting with http:// or https://.`; }
        }
        return "";
      },
      // Returns { file, url }. Uploads happen here; `track` remembers new uploads so a failed save can undo them.
      async resolve(upload, track) {
        const picked = fileInput.files[0];
        const typed = urlInput.value.trim();
        if (picked) {
          const uploaded = await upload(picked);
          track(uploaded);
          return { file: uploaded, url: "" };
        }
        if (typed) return { file: null, url: typed };
        if (current && !(removeBox && removeBox.checked)) return { file: current, url: "" };
        return { file: null, url: "" };
      },
      destroy: clearBlob,
    };
  }

  /* ------------------------------------------------------------ topic editor */
  const topicEditors = [];
  let moduleNotesField;
  let moduleVideoField;
  let questionsPdfField;

  function renumberTopics() {
    topicEditors.forEach((editor, index) => {
      editor.heading.textContent = `Topic ${index + 1}`;
      editor.order.value = String(index + 1);
      editor.up.disabled = index === 0;
      editor.down.disabled = index === topicEditors.length - 1;
    });
  }

  function addTopic(data = {}) {
    const box = el("section", "module-topic");
    const head = el("div", "module-topic__head");
    const heading = el("h3", "module-topic__number");
    const tools = el("div", "module-topic__tools");
    const up = el("button", "mbtn mbtn--tiny", "↑");
    const down = el("button", "mbtn mbtn--tiny", "↓");
    const remove = el("button", "mbtn mbtn--tiny mbtn--danger", "Remove");
    [up, down, remove].forEach((b) => { b.type = "button"; });
    up.setAttribute("aria-label", "Move topic up");
    down.setAttribute("aria-label", "Move topic down");
    remove.setAttribute("aria-label", "Remove topic");
    tools.append(up, down, remove);
    head.append(heading, tools);

    const field = (labelText, node) => {
      const label = el("label", "module-field");
      label.append(el("span", "", labelText), node);
      return label;
    };
    const title = Object.assign(document.createElement("input"), { type: "text", maxLength: 100, placeholder: "e.g. Extracting Meaning from Data", value: data.title || "" });
    const order = Object.assign(document.createElement("input"), { type: "number", min: 1, step: 1, value: data.order || "" });
    const description = Object.assign(document.createElement("textarea"), { rows: 2, maxLength: 600, placeholder: "Short description shown in the topic list", value: data.description || "" });
    const lesson = Object.assign(document.createElement("textarea"), { rows: 7, maxLength: 60000, placeholder: "# Heading\nParagraph text…\n- list item\n```python\nprint('code')\n```", value: data.content || "" });
    lesson.className = "module-field__mono";
    const pdf = createAttachment({ label: "Topic PDF", kind: "pdf", current: data.pdfFile || null, url: data.pdfUrl || "" });
    const video = createAttachment({ label: "Topic video", kind: "video", current: data.videoFile || null, url: data.videoUrl || "" });

    const top = el("div", "mrow mrow--order");
    top.append(field("Order", order), field("Topic title *", title));
    box.append(head, top, field("Topic description", description), field("Lesson content", lesson), pdf.root, video.root);

    const editor = { id: data.id || (crypto.randomUUID ? crypto.randomUUID() : `topic-${Date.now()}-${Math.random().toString(16).slice(2)}`),
      box, heading, order, up, down, title, description, lesson, pdf, video, original: data };
    topicEditors.push(editor);
    topicsBox.appendChild(box);

    remove.addEventListener("click", () => {
      pdf.destroy(); video.destroy();
      topicEditors.splice(topicEditors.indexOf(editor), 1);
      box.remove();
      renumberTopics();
    });
    up.addEventListener("click", () => moveTopic(editor, -1));
    down.addEventListener("click", () => moveTopic(editor, 1));
    renumberTopics();
    return editor;
  }

  function moveTopic(editor, delta) {
    const index = topicEditors.indexOf(editor);
    const target = index + delta;
    if (target < 0 || target >= topicEditors.length) return;
    topicEditors.splice(index, 1);
    topicEditors.splice(target, 0, editor);
    topicsBox.replaceChildren(...topicEditors.map((e) => e.box));
    renumberTopics();
    editor.box.scrollIntoView({ block: "nearest" });
  }

  /* --------------------------------------------------------------- form state */
  function mountAttachments(module) {
    const q = (module && module.importantQuestions) || {};
    moduleNotesField?.destroy(); moduleVideoField?.destroy(); questionsPdfField?.destroy();
    moduleNotesField = createAttachment({ label: "Complete module notes PDF", kind: "pdf", current: module?.notesFile || null, url: module?.notesUrl || "" });
    moduleVideoField = createAttachment({ label: "Complete module video", kind: "video", current: module?.moduleVideoFile || null, url: module?.moduleVideoUrl || "" });
    questionsPdfField = createAttachment({
      label: "Important Questions PDF", kind: "pdf", current: q.pdfFile || null,
      url: q.pdfFile ? "" : (q.pdfUrl && !String(q.pdfUrl).startsWith("/api/") ? q.pdfUrl : ""),
    });
    $("moduleNotesMount").replaceChildren(moduleNotesField.root);
    $("moduleVideoMount").replaceChildren(moduleVideoField.root);
    $("iqPdfMount").replaceChildren(questionsPdfField.root);
  }

  function setCoverPreview(src) {
    const preview = $("moduleCoverPreview");
    if (src) { preview.src = src; preview.hidden = false; } else { preview.removeAttribute("src"); preview.hidden = true; }
  }

  function resetForm() {
    editing = null;
    form.reset();
    topicEditors.splice(0).forEach((t) => { t.pdf.destroy(); t.video.destroy(); });
    topicsBox.replaceChildren();
    addTopic();
    mountAttachments(null);
    setCoverPreview("");
    $("moduleRemoveCoverRow").hidden = true;
    $("moduleRemoveCover").checked = false;
    saveButton.textContent = "Save Module";
    formTitle.textContent = "Add Module";
    details.querySelector("summary").lastChild.textContent = " Add Module";
    MC.setStatus(messageEl, "");
    form.querySelectorAll("[aria-invalid]").forEach((n) => n.removeAttribute("aria-invalid"));
  }

  function nextNumber() {
    const numbers = modules.map((m) => Number(m.number)).filter(Number.isFinite);
    return String((numbers.length ? Math.max(...numbers) : 0) + 1);
  }

  function openAdd() {
    resetForm();
    $("moduleNumber").value = nextNumber();
  }

  function editModule(module, focus = "") {
    resetForm();
    editing = module;
    $("moduleNumber").value = module.number;
    $("moduleTitle").value = module.title;
    $("moduleDescription").value = module.shortDescription;
    $("moduleFullDescription").value = module.fullDescription;
    $("moduleOutcomes").value = module.outcomes.join("\n");
    const isUrlCover = /^https?:\/\//i.test(module.cover || "");
    $("moduleCoverUrl").value = isUrlCover ? module.cover : "";
    setCoverPreview(module.cover || "");
    $("moduleRemoveCoverRow").hidden = !module.cover;
    topicEditors.splice(0).forEach((t) => { t.pdf.destroy(); t.video.destroy(); });
    topicsBox.replaceChildren();
    const rawTopics = module.topics.length ? module.topics : [{}];
    rawTopics.forEach((topic) => addTopic(topic));
    renumberTopics();
    mountAttachments(module);
    const q = module.importantQuestions || {};
    $("iqTitle").value = q.title || "";
    $("iqDescription").value = q.description || "";
    $("iqText").value = q.text || "";
    saveButton.textContent = "Update Module";
    formTitle.textContent = "Edit Module";
    details.querySelector("summary").lastChild.textContent = " Edit Module";
    details.open = true;
    form.scrollTop = 0;
    if (focus === "topics") topicEditors[0]?.title.focus({ preventScroll: true });
    else if (focus === "cover") $("moduleCover").focus({ preventScroll: true });
    else $("moduleTitle").focus({ preventScroll: true });
  }

  function closeForm() {
    details.open = false;
    resetForm();
  }

  /* ------------------------------------------------------------------ submit */
  function fail(message, node) {
    MC.setStatus(messageEl, message, true);
    if (node) {
      node.setAttribute("aria-invalid", "true");
      node.focus({ preventScroll: false });
    }
    return false;
  }

  function validate() {
    form.querySelectorAll("[aria-invalid]").forEach((n) => n.removeAttribute("aria-invalid"));
    const number = $("moduleNumber");
    if (!number.value.trim()) return fail("Enter the module number.", number);
    if (!/^[A-Za-z0-9.\-]{1,10}$/.test(number.value.trim())) return fail("The module number can only contain letters, digits, dots and dashes.", number);
    if (!$("moduleTitle").value.trim()) return fail("Enter the module title.", $("moduleTitle"));
    if (!$("moduleDescription").value.trim()) return fail("Enter a short description.", $("moduleDescription"));
    const coverFile = $("moduleCover").files[0];
    if (coverFile && !coverFile.type.startsWith("image/")) return fail("The cover must be an image file.", $("moduleCover"));
    if (coverFile && coverFile.size > 15 * 1024 * 1024) return fail("The cover image is too large (15 MB maximum).", $("moduleCover"));
    const coverUrl = $("moduleCoverUrl").value.trim();
    if (coverFile && coverUrl) return fail("Choose either a cover upload or a cover URL, not both.", $("moduleCoverUrl"));
    if (coverUrl) {
      try { if (!["http:", "https:"].includes(new URL(coverUrl).protocol)) throw new Error(); }
      catch (error) { return fail("Enter a valid cover image URL starting with http:// or https://.", $("moduleCoverUrl")); }
    }
    if (!topicEditors.length) return fail("Add at least one topic.", $("addModuleTopic"));
    for (const [index, topic] of topicEditors.entries()) {
      if (!topic.title.value.trim()) return fail(`Give topic ${index + 1} a title.`, topic.title);
      const error = topic.pdf.validate() || topic.video.validate();
      if (error) return fail(`Topic ${index + 1} – ${error}`, topic.pdf.focusTarget);
    }
    for (const field of [moduleNotesField, moduleVideoField, questionsPdfField]) {
      const error = field.validate();
      if (error) return fail(error, field.focusTarget);
    }
    return true;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (saving) return; // blocks double submissions
    MC.setStatus(messageEl, "");
    if (!validate()) return;

    saving = true;
    saveButton.disabled = true;
    saveButton.textContent = editing ? "Updating…" : "Saving…";
    const wasEditing = Boolean(editing);
    const previous = editing;
    const uploads = []; // { file, bucket }
    const trackModule = (file) => uploads.push({ file, bucket: "module" });
    const trackQuestions = (file) => uploads.push({ file, bucket: "questions" });
    try {
      const topics = [];
      for (const [index, editor] of topicEditors.entries()) {
        const pdf = await editor.pdf.resolve(uploadModuleFile, trackModule);
        const video = await editor.video.resolve(uploadModuleFile, trackModule);
        topics.push({
          id: editor.id,
          order: index + 1,
          title: editor.title.value.trim(),
          description: editor.description.value.trim(),
          content: editor.lesson.value.trim(),
          pdfFile: pdf.file, pdfUrl: pdf.url,
          videoFile: video.file, videoUrl: video.url,
        });
      }
      const notes = await moduleNotesField.resolve(uploadModuleFile, trackModule);
      const video = await moduleVideoField.resolve(uploadModuleFile, trackModule);
      const questionPdf = await questionsPdfField.resolve(uploadQuestionsPdf, trackQuestions);

      const coverFile = $("moduleCover").files[0];
      const coverUrl = $("moduleCoverUrl").value.trim();
      let cover;
      if (coverFile) cover = await readCover(coverFile);
      else if (coverUrl) cover = coverUrl;
      else if ($("moduleRemoveCover").checked) cover = "";
      else cover = previous?.cover || "";

      const questionText = $("iqText").value;
      const payload = {
        number: $("moduleNumber").value.trim(),
        title: $("moduleTitle").value.trim(),
        description: $("moduleDescription").value.trim(),
        fullDescription: $("moduleFullDescription").value.trim(),
        learningOutcomes: $("moduleOutcomes").value.split("\n").map((s) => s.trim()).filter(Boolean),
        cover,
        notesFile: notes.file, notesUrl: notes.url,
        moduleVideoFile: video.file, moduleVideoUrl: video.url,
        topics,
        files: previous?.files || [],
        importantQuestions: {
          title: $("iqTitle").value.trim(),
          description: $("iqDescription").value.trim(),
          text: questionText,
          pdfFile: questionPdf.file,
          pdfUrl: questionPdf.file ? `/api/important-question-files/${questionPdf.file.id}` : questionPdf.url,
        },
      };

      if (previous) {
        await apiRequest(`/modules/${encodeURIComponent(previous.id)}`, { method: "PUT", body: JSON.stringify(payload) });
        // Remove files that are no longer used (best effort)
        const kept = new Set([
          payload.notesFile?.id, payload.moduleVideoFile?.id,
          ...payload.files.map((f) => f.id),
          ...topics.flatMap((t) => [t.pdfFile?.id, t.videoFile?.id]),
        ].filter(Boolean));
        const before = [
          previous.notesFile, previous.moduleVideoFile, ...(previous.files || []),
          ...previous.topics.flatMap((t) => [t.pdfFile, t.videoFile]),
        ].filter(Boolean);
        await Promise.allSettled([...new Set(before.filter((f) => !kept.has(f.id)).map((f) => f.id))].map(deleteModuleFile));
        const oldQuestions = previous.importantQuestions?.pdfFile;
        if (oldQuestions && oldQuestions.id !== questionPdf.file?.id) await deleteQuestionsFile(oldQuestions.id).catch(() => {});
      } else {
        await apiRequest("/modules", { method: "POST", body: JSON.stringify(payload) });
      }
      closeForm();
      MC.setStatus(statusEl, wasEditing ? "Module updated." : "Module saved.");
      await load(wasEditing ? "Module updated." : "Module saved.");
    } catch (error) {
      await Promise.allSettled(uploads.map(({ file, bucket }) => (bucket === "questions" ? deleteQuestionsFile(file.id) : deleteModuleFile(file.id))));
      MC.setStatus(messageEl, `Could not save module: ${error.message}`, true);
      saveButton.textContent = wasEditing ? "Update Module" : "Save Module";
    } finally {
      saving = false;
      saveButton.disabled = false;
    }
  });

  /* ------------------------------------------------------------------- cards */
  function resourceAction(label, pathData, available, href) {
    const a = el("a", `mcard__action${available ? "" : " is-unavailable"}`);
    a.href = href;
    a.append(icon(pathData), el("span", "", label));
    if (!available) a.title = `${label} are not available yet`;
    return a;
  }

  function createCard(module) {
    const article = el("article", "mcard");
    article.id = `module-${module.id}`;
    article.dataset.id = module.id;
    const cover = el("div", "mcard__cover");
    if (module.cover) {
      const img = document.createElement("img");
      img.src = module.cover; img.alt = ""; img.loading = "lazy";
      cover.appendChild(img);
    }
    cover.appendChild(el("span", "mcard__badge", `MODULE ${module.numberLabel}`));

    const menu = createCardMenu(
      () => editModule(module),
      async () => {
        if (!window.confirm(`Delete the module “${module.title}” and all of its uploaded files? This cannot be undone.`)) return;
        try {
          await apiRequest(`/modules/${encodeURIComponent(module.id)}`, { method: "DELETE" });
          await load();
        } catch (error) {
          MC.setStatus(statusEl, error.message, true);
        }
      },
      {
        editLabel: "Edit Module",
        deleteLabel: "Delete Module",
        actions: [
          { label: "Manage Topics", onClick: () => { details.open = true; editModule(module, "topics"); } },
          { label: "Change Cover Image", onClick: () => { details.open = true; editModule(module, "cover"); } },
          { label: "Open Module", onClick: () => { location.href = MC.moduleHref(module.id); } },
        ],
      },
    );
    cover.appendChild(menu);

    const body = el("div", "mcard__body");
    const titleRow = el("div", "mcard__titlerow");
    const h2 = el("h2", "mcard__title");
    const titleLink = el("a", "", module.title);
    titleLink.href = MC.moduleHref(module.id);
    h2.appendChild(titleLink);
    titleRow.append(h2, el("span", "mcard__pill", plural(module.topics.length, "Topic")));
    const description = el("p", "mcard__desc", module.shortDescription || `${plural(module.topics.length, "topic")} in this module.`);

    const footer = el("div", "mcard__footer");
    const actions = el("div", "mcard__actions");
    actions.append(
      resourceAction("Notes & PDFs", ICONS.doc, MC.hasPdf(module), MC.moduleHref(module.id, "&view=notes")),
      resourceAction("Video Lessons", ICONS.play, MC.hasVideo(module), MC.moduleHref(module.id, "&view=videos")),
    );
    const more = el("a", "mbtn mbtn--primary mcard__more");
    more.href = MC.moduleHref(module.id);
    more.append(el("span", "", "View More"), icon(ICONS.arrow));
    footer.append(actions, more);
    body.append(titleRow, description, footer);
    article.append(cover, body);

    // The whole card opens the module, except its own links and menu
    article.addEventListener("click", (event) => {
      if (event.target.closest("a, button, .card-menu")) return;
      location.href = MC.moduleHref(module.id);
    });
    return article;
  }

  function renderCards() {
    if (!loaded) return;
    const visible = modules.filter((m) => MC.matches(m, query).module);
    list.replaceChildren(...visible.map(createCard));
    if (!modules.length) MC.setStatus(statusEl, "No modules have been added yet. Use “Add Module” to create the first one.");
    else if (!visible.length) MC.setStatus(statusEl, "No modules or topics match your search.");
    else if (!statusEl.dataset.keep) MC.setStatus(statusEl, "");
  }

  async function load(successMessage) {
    MC.setStatus(statusEl, "Loading modules...");
    try {
      modules = await MC.loadModules();
      loaded = true;
      sidebar = MC.renderSidebar($("moduleSidebar"), modules, {
        onSearch(value) { query = value; renderCards(); },
      });
      if (query) sidebar.setQuery(query);
      renderCards();
      if (successMessage) MC.setStatus(statusEl, successMessage);
    } catch (error) {
      MC.setStatus(statusEl, `Could not load modules: ${error.message}`, true);
    }
  }

  /* ----------------------------------------------------------------- wiring */
  $("addModuleTopic").addEventListener("click", () => {
    const editor = addTopic();
    editor.box.scrollIntoView({ block: "nearest", behavior: "smooth" });
    editor.title.focus({ preventScroll: true });
  });
  form.querySelectorAll("[data-cancel-add]").forEach((button) => button.addEventListener("click", closeForm));
  $("moduleCover").addEventListener("change", async () => {
    const file = $("moduleCover").files[0];
    if (!file) return;
    $("moduleCoverUrl").value = "";
    try { setCoverPreview(await readCover(file)); $("moduleRemoveCoverRow").hidden = true; }
    catch (error) { MC.setStatus(messageEl, error.message, true); }
  });
  $("moduleCoverUrl").addEventListener("input", () => {
    const value = $("moduleCoverUrl").value.trim();
    if (value) { $("moduleCover").value = ""; setCoverPreview(/^https?:\/\//i.test(value) ? value : ""); }
  });
  $("moduleRemoveCover").addEventListener("change", () => {
    if ($("moduleRemoveCover").checked) setCoverPreview("");
    else setCoverPreview(editing?.cover || "");
  });
  details.addEventListener("toggle", () => {
    document.body.classList.toggle("has-open-form", details.open);
    if (details.open && !editing) openAdd();
    if (!details.open && editing) resetForm();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && details.open) closeForm();
  });
  // Clicking the dimmed background closes the form
  details.addEventListener("click", (event) => { if (event.target === details) closeForm(); });

  resetForm();
  load();
})();