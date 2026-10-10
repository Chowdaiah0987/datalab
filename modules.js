const moduleForm = document.getElementById("moduleForm");
const moduleTopics = document.getElementById("moduleTopics");
const moduleList = document.getElementById("moduleList");
const moduleStatus = document.getElementById("moduleStatus");
const moduleFormMessage = document.getElementById("moduleFormMessage");
const moduleSaveButton = document.getElementById("saveModule");
const moduleSearch = document.getElementById("moduleSearch");
const totalModules = document.getElementById("totalModules");
const totalTopics = document.getElementById("totalTopics");
const moduleCoverInput = document.getElementById("moduleCover");
const cancelModuleEdit = document.getElementById("cancelModuleEdit");
const moduleCoverPreview = document.getElementById("moduleCoverPreview");
const moduleRemoveCoverRow = document.getElementById("moduleRemoveCoverRow");
const moduleRemoveCover = document.getElementById("moduleRemoveCover");
const importantQuestionsTextEnabled = document.getElementById("importantQuestionsTextEnabled");
const importantQuestionsTextField = document.getElementById("importantQuestionsTextField");
const importantQuestionsText = document.getElementById("importantQuestionsText");
const importantQuestionsPdfEnabled = document.getElementById("importantQuestionsPdfEnabled");
const importantQuestionsPdfField = document.getElementById("importantQuestionsPdfField");
const importantQuestionsPdfInput = document.getElementById("importantQuestionsPdf");
const importantQuestionsCurrentPdf = document.getElementById("importantQuestionsCurrentPdf");
const removeImportantQuestionsPdf = document.getElementById("removeImportantQuestionsPdf");
let editingModule = null;
let loadedModules = [];
let modulesLoaded = false;

function setModuleMessage(element, message, isError = false) {
  element.textContent = message;
  element.classList.toggle("is-error", isError);
}

function setImportantQuestionsVisibility() {
  importantQuestionsTextField.hidden = !importantQuestionsTextEnabled.checked;
  importantQuestionsPdfField.hidden = !importantQuestionsPdfEnabled.checked;
}

function renumberModuleTopics() {
  moduleTopics.querySelectorAll(".module-topic__number").forEach((number, index) => {
    number.textContent = `Topic ${index + 1}`;
  });
}

function addModuleTopic(data = {}) {
  const topic = document.createElement("section");
  topic.className = "module-topic";
  topic.dataset.topicId = data.id || (window.crypto && window.crypto.randomUUID
    ? window.crypto.randomUUID()
    : `topic-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  topic.dataset.pdfFile = JSON.stringify(data.pdfFile || null);
  topic.dataset.videoFile = JSON.stringify(data.videoFile || null);

  const number = document.createElement("h3");
  number.className = "module-topic__number";

  const headingLabel = document.createElement("label");
  headingLabel.className = "module-field";
  const headingText = document.createElement("span");
  headingText.textContent = "Topic name";
  const heading = document.createElement("input");
  heading.type = "text";
  heading.maxLength = 100;
  heading.required = true;
  heading.placeholder = "e.g. Data collection";
  heading.value = data.title || "";
  headingLabel.append(headingText, heading);

  const contentLabel = document.createElement("label");
  contentLabel.className = "module-field";
  const contentText = document.createElement("span");
  contentText.textContent = "Topic notes (optional)";
  const notes = document.createElement("textarea");
  notes.rows = 3;
  notes.maxLength = 5000;
  notes.placeholder = "Describe the topic or key learning points";
  notes.value = data.content || "";
  contentLabel.append(contentText, notes);

  function addTopicFileField(kind, labelText, accept, file, resourceUrl) {
    const label = document.createElement("label");
    label.className = "module-field";
    const labelSpan = document.createElement("span");
    labelSpan.textContent = labelText;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.className = `module-topic__${kind}-input`;
    label.append(labelSpan, input);
    topic.appendChild(label);
    let previewUrl = "";
    const preview = document.createElement("div");
    preview.className = "module-topic__preview";
    topic.appendChild(preview);
    input.addEventListener("change", () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = "";
      preview.replaceChildren();
      const selected = input.files[0];
      if (!selected) return;
      const urlInput = topic.querySelector(`.module-topic__${kind}-url`);
      if (urlInput) {
        urlInput.value = "";
        urlInput.dispatchEvent(new Event("input", { bubbles: true }));
      }
      previewUrl = URL.createObjectURL(selected);
      if (kind === "video") {
        const player = document.createElement("video");
        player.controls = true;
        player.preload = "metadata";
        player.src = previewUrl;
        player.setAttribute("aria-label", `Preview ${selected.name}`);
        preview.appendChild(player);
      } else {
        const link = document.createElement("a");
        link.className = "module-detail__pdf";
        link.href = previewUrl;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = "Preview selected PDF";
        preview.appendChild(link);
      }
    });
    if (file) {
      const current = document.createElement("label");
      current.className = "module-current-file";
      const remove = document.createElement("input");
      remove.type = "checkbox";
      remove.className = `module-topic__remove-${kind}`;
      const name = document.createElement("span");
      name.textContent = `Remove existing ${kind === "pdf" ? "PDF" : "video"}: ${file.name}`;
      current.append(remove, name);
      topic.appendChild(current);
    }
    const urlLabel = document.createElement("label");
    urlLabel.className = "module-field";
    const urlLabelText = document.createElement("span");
    urlLabelText.textContent = `${kind === "pdf" ? "PDF" : "Video"} URL (optional)`;
    const urlInput = document.createElement("input");
    urlInput.type = "url";
    urlInput.className = `module-topic__${kind}-url`;
    urlInput.placeholder = kind === "video" ? "https://... or a YouTube link" : "https://...";
    urlInput.value = resourceUrl || "";
    const urlPreview = document.createElement("a");
    urlPreview.className = "module-detail__pdf module-topic__url-preview";
    urlPreview.target = "_blank";
    urlPreview.rel = "noopener noreferrer";
    urlPreview.textContent = `Preview ${kind === "pdf" ? "PDF" : "video"} URL`;
    urlPreview.hidden = !resourceUrl;
    urlPreview.href = resourceUrl || "#";
    urlInput.addEventListener("input", () => {
      const removeInput = topic.querySelector(`.module-topic__remove-${kind}`);
      if (removeInput) removeInput.checked = Boolean(urlInput.value.trim());
      urlPreview.href = urlInput.value.trim() || "#";
      urlPreview.hidden = !urlInput.value.trim();
    });
    urlLabel.append(urlLabelText, urlInput);
    topic.append(urlLabel, urlPreview);
  }
  addTopicFileField("pdf", "Topic PDF (optional)", ".pdf,application/pdf", data.pdfFile, data.pdfUrl);
  addTopicFileField("video", "Video lesson (optional)", "video/*", data.videoFile, data.videoUrl);

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "btn btn--ghost module-topic__remove";
  remove.textContent = "Remove topic";
  remove.addEventListener("click", () => {
    topic.querySelectorAll("video").forEach((player) => {
      if (player.src.startsWith("blob:")) URL.revokeObjectURL(player.src);
    });
    topic.querySelectorAll("a[href^='blob:']").forEach((link) => URL.revokeObjectURL(link.href));
    topic.remove();
    renumberModuleTopics();
  });

  topic.prepend(number, headingLabel, contentLabel);
  topic.appendChild(remove);
  moduleTopics.appendChild(topic);
  renumberModuleTopics();
}

function readModuleCover(file) {
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
        if (!context) {
          reject(new Error("Could not process the cover image."));
          return;
        }
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

async function uploadModuleFile(file) {
  const extensionTypes = {
    avi: "video/x-msvideo",
    m4v: "video/x-m4v",
    mkv: "video/x-matroska",
    mov: "video/quicktime",
    mp4: "video/mp4",
    ogg: "video/ogg",
    webm: "video/webm",
  };
  const extension = file.name.split(".").pop().toLowerCase();
  const contentType = extension === "pdf"
    ? "application/pdf"
    : (file.type.startsWith("video/") ? file.type : (extensionTypes[extension] || file.type));
  if (!contentType) throw new Error(`Could not determine the file type for ${file.name}.`);
  const response = await fetch(`${API_BASE}/module-files`, {
    method: "POST",
    headers: {
      "Content-Type": contentType,
      "X-Module-File-Name": encodeURIComponent(file.name),
    },
    body: file,
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(result?.error || `Could not upload ${file.name}.`);
  }
  return result;
}

async function deleteUploadedModuleFile(id) {
  const response = await fetch(`${API_BASE}/module-files/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!response.ok) {
    throw new Error(`Could not clean up uploaded file ${id}.`);
  }
}

async function uploadImportantQuestionsPdf(file) {
  const response = await fetch(`${API_BASE}/important-question-files`, {
    method: "POST",
    headers: {
      "Content-Type": "application/pdf",
      "X-Important-Questions-File-Name": encodeURIComponent(file.name),
    },
    body: file,
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(result?.error || `Could not upload ${file.name}.`);
  }
  return result;
}

async function deleteImportantQuestionsPdf(id) {
  const response = await fetch(`${API_BASE}/important-question-files/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!response.ok) {
    throw new Error(`Could not clean up Important Questions PDF ${id}.`);
  }
}

function resetModuleForm() {
  editingModule = null;
  moduleForm.reset();
  moduleTopics.replaceChildren();
  addModuleTopic();
  importantQuestionsTextField.hidden = true;
  importantQuestionsPdfField.hidden = true;
  importantQuestionsCurrentPdf.hidden = true;
  importantQuestionsCurrentPdf.querySelector("span").textContent = "";
  removeImportantQuestionsPdf.checked = false;
  moduleCoverPreview.removeAttribute("src");
  moduleCoverPreview.hidden = true;
  moduleRemoveCoverRow.hidden = true;
  moduleRemoveCover.checked = false;
  moduleSaveButton.textContent = "Save Module";
  cancelModuleEdit.hidden = true;
  moduleFormMessage.textContent = "";
  moduleForm.closest("details").querySelector("summary").textContent = "+ Add Module";
}

function editModule(module, focusTarget = "") {
  editingModule = module;
  moduleForm.reset();
  document.getElementById("moduleTitle").value = module.title;
  document.getElementById("moduleDescription").value = module.description || "";
  moduleCoverPreview.src = module.cover || "";
  moduleCoverPreview.hidden = !module.cover;
  moduleRemoveCoverRow.hidden = !module.cover;
  moduleRemoveCover.checked = false;
  moduleTopics.replaceChildren();
  module.topics.forEach((topic) => addModuleTopic(topic));
  if (!module.topics.length) addModuleTopic();
  const questions = module.importantQuestions || {};
  importantQuestionsTextEnabled.checked = Boolean(questions.text);
  importantQuestionsText.value = questions.text || "";
  importantQuestionsPdfEnabled.checked = Boolean(questions.pdfFile);
  importantQuestionsCurrentPdf.hidden = !questions.pdfFile;
  importantQuestionsCurrentPdf.querySelector("span").textContent = questions.pdfFile
    ? `Remove existing Important Questions PDF: ${questions.pdfFile.name}`
    : "";
  removeImportantQuestionsPdf.checked = false;
  setImportantQuestionsVisibility();
  moduleSaveButton.textContent = "Update Module";
  cancelModuleEdit.hidden = false;
  moduleForm.closest("details").querySelector("summary").textContent = "Edit Module";
  moduleForm.closest("details").open = true;
  moduleForm.scrollIntoView({ behavior: "smooth", block: "start" });
  if (focusTarget === "topics") {
    const firstTopic = moduleTopics.querySelector('input[type="text"]');
    firstTopic?.focus({ preventScroll: true });
  } else if (focusTarget === "cover") {
    moduleCoverInput.focus({ preventScroll: true });
  }
}

function moduleDetailUrl(module) {
  return `module.html?id=${encodeURIComponent(module.id)}`;
}

function createResourceIndicator(label, iconPath, href) {
  const indicator = document.createElement("a");
  indicator.className = "module-resource";
  indicator.href = href;
  const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("aria-hidden", "true");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", iconPath);
  icon.appendChild(path);
  const text = document.createElement("span");
  text.textContent = label;
  indicator.append(icon, text);
  return indicator;
}

function createModuleCard(module, index) {
  const article = document.createElement("article");
  article.className = "home-card module-card";
  article.appendChild(createCardMenu(
    () => editModule(module),
    async () => {
      if (!window.confirm(`Delete the module “${module.title}” and its attachments?`)) return;
      try {
        await apiRequest(`/modules/${encodeURIComponent(module.id)}`, { method: "DELETE" });
        await loadModules();
      } catch (error) {
        setModuleMessage(moduleStatus, error.message, true);
      }
    },
    {
      editLabel: "Edit Module",
      deleteLabel: "Delete Module",
      actions: [
        { label: "Manage Topics", onClick: () => editModule(module, "topics") },
        { label: "Change Cover Image", onClick: () => editModule(module, "cover") },
        { label: "Preview Module", onClick: () => { window.location.href = moduleDetailUrl(module); } },
      ],
    },
  ));

  const cover = document.createElement("div");
  cover.className = "home-card__cover module-card__cover";
  if (module.cover) {
    const image = document.createElement("img");
    image.src = module.cover;
    image.alt = "";
    cover.appendChild(image);
  }
  const kicker = document.createElement("span");
  kicker.textContent = `MODULE ${String(index + 1).padStart(2, "0")}`;
  const title = document.createElement("strong");
  title.textContent = module.title;
  cover.append(kicker, title);

  const body = document.createElement("div");
  body.className = "home-card__body";
  const heading = document.createElement("h2");
  heading.textContent = module.title;
  const topics = Array.isArray(module.topics) ? module.topics : [];
  const description = document.createElement("p");
  description.textContent = module.description || `${topics.length} topic${topics.length === 1 ? "" : "s"} in this module.`;
  const metadata = document.createElement("div");
  metadata.className = "module-card__metadata";
  const topicCount = document.createElement("span");
  topicCount.className = "module-topic-count";
  topicCount.textContent = `${topics.length} topic${topics.length === 1 ? "" : "s"}`;
  metadata.appendChild(topicCount);
  const resources = document.createElement("div");
  resources.className = "module-card__resources";
  const hasPdf = topics.some((topic) => Boolean(topic.pdfFile || topic.pdfUrl));
  const hasVideo = topics.some((topic) => Boolean(topic.videoFile || topic.videoUrl));
  if (hasPdf) resources.appendChild(createResourceIndicator(
    "Notes & PDFs",
    "M6 2h8l4 4v16H6z M14 2v5h5 M9 13h6 M9 17h6",
    `${moduleDetailUrl(module)}&view=notes`,
  ));
  if (hasVideo) resources.appendChild(createResourceIndicator(
    "Video Lessons",
    "m9 7 9 5-9 5z M4 5v14",
    `${moduleDetailUrl(module)}&view=videos`,
  ));
  if (resources.childElementCount) metadata.appendChild(resources);
  const actions = document.createElement("div");
  actions.className = "module-card__actions";
  const readMore = document.createElement("a");
  readMore.className = "home-card__link";
  readMore.href = moduleDetailUrl(module);
  readMore.textContent = "Read More →";
  actions.append(readMore);
  body.append(heading, description, metadata, actions);
  article.append(cover, body);
  return article;
}

async function loadModules() {
  moduleStatus.textContent = "Loading modules...";
  try {
    loadedModules = await apiRequest("/modules");
    modulesLoaded = true;
    totalModules.textContent = String(loadedModules.length);
    totalTopics.textContent = String(loadedModules.reduce(
      (sum, module) => sum + (Array.isArray(module.topics) ? module.topics.length : 0),
      0,
    ));
    moduleStatus.classList.remove("is-error");
    renderModules();
  } catch (error) {
    moduleStatus.textContent = `Could not load modules: ${error.message}`;
    moduleStatus.classList.add("is-error");
  }
}

function renderModules() {
  if (!modulesLoaded) return;
  const query = moduleSearch.value.trim().toLowerCase();
  const filteredModules = loadedModules.filter((module) => (
    `${module.title || ""} ${module.description || ""}`.toLowerCase().includes(query)
  ));
  moduleList.replaceChildren(...filteredModules.map((module) => createModuleCard(
    module,
    loadedModules.indexOf(module),
  )));
  if (!loadedModules.length) {
    moduleStatus.textContent = "No modules have been added yet.";
  } else if (!filteredModules.length) {
    moduleStatus.textContent = "No modules match your search.";
  } else {
    moduleStatus.textContent = "";
  }
}

moduleSearch.addEventListener("input", renderModules);

moduleForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setModuleMessage(moduleFormMessage, "");
  const topicElements = [...moduleTopics.querySelectorAll(".module-topic")];
  const topics = topicElements.map((topic) => ({
    id: topic.dataset.topicId,
    title: topic.querySelector('input[type="text"]').value.trim(),
    content: topic.querySelector("textarea").value.trim(),
    pdfUrl: topic.querySelector(".module-topic__pdf-url").value.trim(),
    videoUrl: topic.querySelector(".module-topic__video-url").value.trim(),
  }));
  if (!topics.length || topics.some((topic) => !topic.title)) {
    setModuleMessage(moduleFormMessage, "Add at least one topic and give every topic a name.", true);
    return;
  }
  if (importantQuestionsPdfEnabled.checked && importantQuestionsPdfInput.files[0] &&
      !/\.pdf$/i.test(importantQuestionsPdfInput.files[0].name)) {
    setModuleMessage(moduleFormMessage, "Important Questions must be uploaded as a PDF file.", true);
    return;
  }
  for (const topic of topicElements) {
    if (topic.querySelector(".module-topic__pdf-input").files[0] &&
        topic.querySelector(".module-topic__pdf-url").value.trim()) {
      setModuleMessage(moduleFormMessage, "Choose either an uploaded PDF or a PDF URL for each topic, not both.", true);
      return;
    }
    if (topic.querySelector(".module-topic__video-input").files[0] &&
        topic.querySelector(".module-topic__video-url").value.trim()) {
      setModuleMessage(moduleFormMessage, "Choose either an uploaded video or a video URL for each topic, not both.", true);
      return;
    }
    const pdf = topic.querySelector(".module-topic__pdf-input").files[0];
    if (pdf && !/\.pdf$/i.test(pdf.name)) {
      setModuleMessage(moduleFormMessage, "Each topic PDF must have a .pdf filename.", true);
      return;
    }
    const video = topic.querySelector(".module-topic__video-input").files[0];
    if (video && !video.type.startsWith("video/") &&
        !/\.(avi|m4v|mkv|mov|mp4|ogg|webm)$/i.test(video.name)) {
      setModuleMessage(moduleFormMessage, `Choose a video file for topic “${topic.querySelector('input[type="text"]').value.trim()}”.`, true);
      return;
    }
  }

  moduleSaveButton.disabled = true;
  const uploadedFiles = [];
  const wasEditing = Boolean(editingModule);
  try {
    const moduleFiles = editingModule?.files || [];
    for (let index = 0; index < topicElements.length; index += 1) {
      const element = topicElements[index];
      const original = editingModule?.topics.find((topic) => topic.id === element.dataset.topicId) ||
        editingModule?.topics[index];
      const pdfInput = element.querySelector(".module-topic__pdf-input");
      const videoInput = element.querySelector(".module-topic__video-input");
      const removePdf = element.querySelector(".module-topic__remove-pdf");
      const removeVideo = element.querySelector(".module-topic__remove-video");
      const pdfUrlInput = element.querySelector(".module-topic__pdf-url");
      const videoUrlInput = element.querySelector(".module-topic__video-url");
      let pdfFile = original?.pdfFile || null;
      let videoFile = original?.videoFile || null;

      if (pdfInput.files[0]) {
        const uploaded = await uploadModuleFile(pdfInput.files[0]);
        uploadedFiles.push({ file: uploaded, bucket: "module" });
        pdfFile = uploaded;
      } else if (removePdf?.checked) {
        pdfFile = null;
      }
      if (videoInput.files[0]) {
        const uploaded = await uploadModuleFile(videoInput.files[0]);
        uploadedFiles.push({ file: uploaded, bucket: "module" });
        videoFile = uploaded;
      } else if (removeVideo?.checked) {
        videoFile = null;
      }

      topics[index].pdfFile = pdfFile;
      topics[index].videoFile = videoFile;
      topics[index].pdfUrl = pdfFile ? "" : pdfUrlInput.value.trim();
      topics[index].videoUrl = videoFile ? "" : videoUrlInput.value.trim();
    }
    const previousQuestions = editingModule?.importantQuestions || {};
    let questionPdf = previousQuestions.pdfFile || null;
    if (!importantQuestionsPdfEnabled.checked || removeImportantQuestionsPdf.checked) {
      questionPdf = null;
    }
    if (importantQuestionsPdfEnabled.checked && importantQuestionsPdfInput.files[0]) {
      const uploaded = await uploadImportantQuestionsPdf(importantQuestionsPdfInput.files[0]);
      uploadedFiles.push({ file: uploaded, bucket: "questions" });
      questionPdf = uploaded;
    }
    const questionText = importantQuestionsTextEnabled.checked ? importantQuestionsText.value : "";
    const questionType = questionText.trim() && questionPdf ? "both" :
      questionText.trim() ? "text" : questionPdf ? "pdf" : "none";
    const coverFile = moduleCoverInput.files[0];
    const payload = {
      title: document.getElementById("moduleTitle").value.trim(),
      description: document.getElementById("moduleDescription").value.trim(),
      cover: coverFile
        ? await readModuleCover(coverFile)
        : (moduleRemoveCover.checked ? "" : (editingModule?.cover || "")),
      topics,
      files: moduleFiles,
      importantQuestions: {
        type: questionType,
        text: questionText,
        pdfUrl: questionPdf ? `/api/important-question-files/${questionPdf.id}` : "",
        pdfFile: questionPdf,
      },
    };
    if (editingModule) {
      await apiRequest(`/modules/${encodeURIComponent(editingModule.id)}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      const retainedModuleFiles = new Set([
        ...moduleFiles.map((file) => file.id),
        ...topics.flatMap((topic) => [topic.pdfFile?.id, topic.videoFile?.id]),
      ].filter(Boolean));
      const previousModuleFiles = [
        ...editingModule.files,
        ...editingModule.topics.flatMap((topic) => [topic.pdfFile, topic.videoFile]),
      ].filter(Boolean);
      const removedModuleFiles = [...new Set(previousModuleFiles
        .filter((file) => !retainedModuleFiles.has(file.id))
        .map((file) => file.id))];
      const moduleCleanup = await Promise.allSettled(removedModuleFiles.map(deleteUploadedModuleFile));
      moduleCleanup.filter((result) => result.status === "rejected").forEach((result) => console.error(result.reason));
      const oldQuestionPdf = previousQuestions.pdfFile;
      if (oldQuestionPdf && oldQuestionPdf.id !== questionPdf?.id) {
        try {
          await deleteImportantQuestionsPdf(oldQuestionPdf.id);
        } catch (error) {
          console.error(error);
        }
      }
    } else {
      await apiRequest("/modules", { method: "POST", body: JSON.stringify(payload) });
    }
    moduleForm.closest("details").open = false;
    resetModuleForm();
    setModuleMessage(moduleFormMessage, wasEditing ? "Module updated." : "Module saved.");
    await loadModules();
  } catch (error) {
    const cleanup = await Promise.allSettled(uploadedFiles.map(({ file, bucket }) => (
      bucket === "questions" ? deleteImportantQuestionsPdf(file.id) : deleteUploadedModuleFile(file.id)
    )));
    cleanup.filter((result) => result.status === "rejected").forEach((result) => console.error(result.reason));
    setModuleMessage(moduleFormMessage, `Could not save module: ${error.message}`, true);
  } finally {
    moduleSaveButton.disabled = false;
  }
});

document.getElementById("addModuleTopic").addEventListener("click", () => addModuleTopic());
cancelModuleEdit.addEventListener("click", resetModuleForm);
importantQuestionsTextEnabled.addEventListener("change", setImportantQuestionsVisibility);
importantQuestionsPdfEnabled.addEventListener("change", setImportantQuestionsVisibility);
moduleCoverInput.addEventListener("change", async () => {
  const file = moduleCoverInput.files[0];
  if (!file) return;
  try {
    moduleCoverPreview.src = await readModuleCover(file);
    moduleCoverPreview.hidden = false;
    moduleRemoveCoverRow.hidden = true;
  } catch (error) {
    setModuleMessage(moduleFormMessage, error.message, true);
  }
});
resetModuleForm();
loadModules();
