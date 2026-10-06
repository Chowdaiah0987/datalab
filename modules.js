const moduleForm = document.getElementById("moduleForm");
const moduleTopics = document.getElementById("moduleTopics");
const moduleList = document.getElementById("moduleList");
const moduleStatus = document.getElementById("moduleStatus");
const moduleFormMessage = document.getElementById("moduleFormMessage");
const moduleSaveButton = document.getElementById("saveModule");
const moduleFilesInput = document.getElementById("moduleFiles");
const moduleCoverInput = document.getElementById("moduleCover");
const moduleCurrentFiles = document.getElementById("moduleCurrentFiles");
const cancelModuleEdit = document.getElementById("cancelModuleEdit");
const moduleCoverPreview = document.getElementById("moduleCoverPreview");
const moduleRemoveCoverRow = document.getElementById("moduleRemoveCoverRow");
const moduleRemoveCover = document.getElementById("moduleRemoveCover");
let editingModule = null;

function setModuleMessage(element, message, isError = false) {
  element.textContent = message;
  element.classList.toggle("is-error", isError);
}

function addModuleTopic(title = "", content = "") {
  const topic = document.createElement("section");
  topic.className = "module-topic";

  const headingLabel = document.createElement("label");
  headingLabel.className = "module-field";
  const headingText = document.createElement("span");
  headingText.textContent = "Topic name";
  const heading = document.createElement("input");
  heading.type = "text";
  heading.maxLength = 100;
  heading.required = true;
  heading.placeholder = "e.g. Data collection";
  heading.value = title;
  headingLabel.append(headingText, heading);

  const contentLabel = document.createElement("label");
  contentLabel.className = "module-field";
  const contentText = document.createElement("span");
  contentText.textContent = "Topic notes (optional)";
  const notes = document.createElement("textarea");
  notes.rows = 3;
  notes.maxLength = 5000;
  notes.placeholder = "Describe the topic or key learning points";
  notes.value = content;
  contentLabel.append(contentText, notes);

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "btn btn--ghost module-topic__remove";
  remove.textContent = "Remove topic";
  remove.addEventListener("click", () => topic.remove());

  topic.append(headingLabel, contentLabel, remove);
  moduleTopics.appendChild(topic);
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
  const response = await fetch(`${API_BASE}/module-files`, {
    method: "POST",
    headers: {
      "Content-Type": file.type,
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

function resetModuleForm() {
  editingModule = null;
  moduleForm.reset();
  moduleTopics.replaceChildren();
  addModuleTopic();
  moduleCurrentFiles.replaceChildren();
  moduleCurrentFiles.hidden = true;
  moduleCoverPreview.removeAttribute("src");
  moduleCoverPreview.hidden = true;
  moduleRemoveCoverRow.hidden = true;
  moduleRemoveCover.checked = false;
  moduleSaveButton.textContent = "Save Module";
  cancelModuleEdit.hidden = true;
  moduleFormMessage.textContent = "";
  moduleForm.closest("details").querySelector("summary").textContent = "+ Add Module";
}

function editModule(module) {
  editingModule = module;
  moduleForm.reset();
  document.getElementById("moduleTitle").value = module.title;
  document.getElementById("moduleDescription").value = module.description || "";
  moduleCoverPreview.src = module.cover || "";
  moduleCoverPreview.hidden = !module.cover;
  moduleRemoveCoverRow.hidden = !module.cover;
  moduleRemoveCover.checked = false;
  moduleTopics.replaceChildren();
  module.topics.forEach((topic) => addModuleTopic(topic.title, topic.content));
  if (!module.topics.length) addModuleTopic();
  moduleCurrentFiles.replaceChildren();
  moduleCurrentFiles.hidden = !module.files.length;
  for (const file of module.files) {
    const label = document.createElement("label");
    label.className = "module-current-file";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.dataset.fileId = file.id;
    const name = document.createElement("span");
    name.textContent = `Remove existing attachment: ${file.name}`;
    label.append(checkbox, name);
    moduleCurrentFiles.appendChild(label);
  }
  moduleSaveButton.textContent = "Update Module";
  cancelModuleEdit.hidden = false;
  moduleForm.closest("details").querySelector("summary").textContent = "Edit Module";
  moduleForm.closest("details").open = true;
  moduleForm.scrollIntoView({ behavior: "smooth", block: "start" });
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
  const description = document.createElement("p");
  description.textContent = module.description || `${module.topics.length} topic${module.topics.length === 1 ? "" : "s"} in this module.`;
  const actions = document.createElement("div");
  actions.className = "module-card__actions";
  const readMore = document.createElement("a");
  readMore.className = "home-card__link";
  readMore.href = `module.html?id=${encodeURIComponent(module.id)}`;
  readMore.textContent = "Read more →";
  actions.append(readMore);
  body.append(heading, description, actions);
  article.append(cover, body);
  return article;
}

async function loadModules() {
  moduleStatus.textContent = "Loading modules...";
  try {
    const modules = await apiRequest("/modules");
    moduleList.replaceChildren(...modules.map(createModuleCard));
    moduleStatus.classList.remove("is-error");
    moduleStatus.textContent = modules.length ? "" : "No modules have been added yet.";
  } catch (error) {
    moduleStatus.textContent = `Could not load modules: ${error.message}`;
    moduleStatus.classList.add("is-error");
  }
}

moduleForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setModuleMessage(moduleFormMessage, "");
  const topics = [...moduleTopics.querySelectorAll(".module-topic")].map((topic) => ({
    title: topic.querySelector("input").value.trim(),
    content: topic.querySelector("textarea").value.trim(),
  }));
  if (!topics.length || topics.some((topic) => !topic.title)) {
    setModuleMessage(moduleFormMessage, "Add at least one topic and give every topic a name.", true);
    return;
  }

  moduleSaveButton.disabled = true;
  const uploadedFiles = [];
  const wasEditing = Boolean(editingModule);
  try {
    const files = editingModule
      ? editingModule.files.filter((file) => !moduleCurrentFiles.querySelector(`[data-file-id="${file.id}"]`).checked)
      : [];
    for (const file of moduleFilesInput.files) {
      const uploaded = await uploadModuleFile(file);
      uploadedFiles.push(uploaded);
      files.push(uploaded);
    }
    const coverFile = moduleCoverInput.files[0];
    const payload = {
      title: document.getElementById("moduleTitle").value.trim(),
      description: document.getElementById("moduleDescription").value.trim(),
      cover: coverFile
        ? await readModuleCover(coverFile)
        : (moduleRemoveCover.checked ? "" : (editingModule?.cover || "")),
      topics,
      files,
    };
    if (editingModule) {
      await apiRequest(`/modules/${encodeURIComponent(editingModule.id)}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      const retained = new Set(files.map((file) => file.id));
      const removedFiles = editingModule.files.filter((file) => !retained.has(file.id));
      const cleanup = await Promise.allSettled(removedFiles.map((file) => deleteUploadedModuleFile(file.id)));
      cleanup.filter((result) => result.status === "rejected").forEach((result) => console.error(result.reason));
    } else {
      await apiRequest("/modules", { method: "POST", body: JSON.stringify(payload) });
    }
    moduleForm.closest("details").open = false;
    resetModuleForm();
    setModuleMessage(moduleFormMessage, wasEditing ? "Module updated." : "Module saved.");
    await loadModules();
  } catch (error) {
    const cleanup = await Promise.allSettled(uploadedFiles.map((file) => deleteUploadedModuleFile(file.id)));
    cleanup.filter((result) => result.status === "rejected").forEach((result) => console.error(result.reason));
    setModuleMessage(moduleFormMessage, `Could not save module: ${error.message}`, true);
  } finally {
    moduleSaveButton.disabled = false;
  }
});

document.getElementById("addModuleTopic").addEventListener("click", () => addModuleTopic());
cancelModuleEdit.addEventListener("click", resetModuleForm);
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
addModuleTopic();
loadModules();
