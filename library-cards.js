function readLibraryImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the image."));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("Choose a valid image."));
      image.onload = () => {
        const scale = Math.min(1, 900 / image.width);
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const context = canvas.getContext("2d");
        if (!context) {
          reject(new Error("Could not process the image."));
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

async function uploadResourceFile(file) {
  const response = await fetch(`${API_BASE}/resource-files`, {
    method: "POST",
    headers: {
      "Content-Type": file.type,
      "X-Resource-File-Name": encodeURIComponent(file.name),
    },
    body: file,
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new Error(result?.error || `Could not upload ${file.name}.`);
  return result;
}

function makeLibraryCard({ kind, item }) {
  const article = document.createElement("article");
  article.className = "home-card library-card";
  article.appendChild(createCardMenu(
    () => (kind === "tool" ? editTool(item) : editResource(item)),
    async () => {
      if (!window.confirm(`Delete “${item.name}”? This cannot be undone.`)) return;
      const status = document.getElementById(`${kind}Status`);
      try {
        await apiRequest(`/${kind === "tool" ? "tools" : "resources"}/${encodeURIComponent(item.id)}`, { method: "DELETE" });
        await loadLibraryCards(kind);
      } catch (error) {
        setLibraryMessage(status, error.message, true);
      }
    },
  ));

  const cover = document.createElement("div");
  cover.className = "home-card__cover library-card__cover";
  if (item.image) {
    const image = document.createElement("img");
    image.src = item.image;
    image.alt = "";
    cover.appendChild(image);
  }
  const eyebrow = document.createElement("span");
  eyebrow.textContent = kind === "tool" ? (item.category || "DATA SCIENCE TOOL") : (item.type || "LEARNING RESOURCE");
  const title = document.createElement("strong");
  title.textContent = item.name;
  cover.append(eyebrow, title);

  const body = document.createElement("div");
  body.className = "home-card__body library-card__body";
  const name = document.createElement("h2");
  name.textContent = item.name;
  const description = document.createElement("p");
  description.textContent = item.description || "No short description provided.";
  body.append(name, description);

  if (kind === "resource" && item.detailedDescription) {
    const details = document.createElement("p");
    details.className = "library-card__details";
    details.textContent = item.detailedDescription;
    body.appendChild(details);
  }
  if (item.category || item.type) {
    const meta = document.createElement("p");
    meta.className = "library-card__meta";
    meta.textContent = item.category || item.type;
    body.appendChild(meta);
  }
  if (item.website || item.url) {
    const link = document.createElement("a");
    link.className = "library-card__link";
    link.href = item.website || item.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "Visit website →";
    body.appendChild(link);
  }
  if (item.file) {
    const file = document.createElement("a");
    file.className = "library-card__file";
    file.href = `${API_BASE}/resource-files/${encodeURIComponent(item.file.id)}`;
    file.target = "_blank";
    file.rel = "noopener noreferrer";
    file.textContent = `Open file: ${item.file.name}`;
    body.appendChild(file);
  }
  article.append(cover, body);
  return article;
}

function setLibraryMessage(element, message, isError = false) {
  element.textContent = message;
  element.classList.toggle("is-error", isError);
}

async function loadLibraryCards(kind) {
  const list = document.getElementById(`${kind}List`);
  const status = document.getElementById(`${kind}Status`);
  status.classList.remove("is-error");
  status.textContent = `Loading ${kind === "tool" ? "tools" : "resources"}...`;
  try {
    const items = await apiRequest(`/${kind === "tool" ? "tools" : "resources"}`);
    list.replaceChildren(...items.map((item) => makeLibraryCard({ kind, item })));
    status.textContent = items.length ? "" : `No ${kind === "tool" ? "tools" : "resources"} have been added yet.`;
  } catch (error) {
    setLibraryMessage(status, `Could not load ${kind === "tool" ? "tools" : "resources"}: ${error.message}`, true);
  }
}

function setupToolCards() {
  const form = document.getElementById("toolForm");
  if (!form) return;
  const create = document.getElementById("toolCreate");
  const imageInput = document.getElementById("toolImage");
  const preview = document.getElementById("toolImagePreview");
  const save = document.getElementById("saveTool");
  let editing = null;

  function reset() {
    editing = null;
    form.reset();
    preview.hidden = true;
    preview.removeAttribute("src");
    save.textContent = "Save Tool";
    create.querySelector("summary").textContent = "+ Add Tool";
    setLibraryMessage(document.getElementById("toolFormMessage"), "");
  }

  window.editTool = (tool) => {
    editing = tool;
    document.getElementById("toolName").value = tool.name;
    document.getElementById("toolDescription").value = tool.description || "";
    document.getElementById("toolCategory").value = tool.category || "";
    document.getElementById("toolWebsite").value = tool.website || "";
    preview.src = tool.image || "";
    preview.hidden = !tool.image;
    save.textContent = "Update Tool";
    create.querySelector("summary").textContent = "Edit Tool";
    create.open = true;
    form.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  imageInput.addEventListener("change", () => {
    const file = imageInput.files[0];
    if (!file) return;
    preview.src = URL.createObjectURL(file);
    preview.hidden = false;
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    save.disabled = true;
    const wasEditing = Boolean(editing);
    try {
      const imageFile = imageInput.files[0];
      const payload = {
        name: document.getElementById("toolName").value.trim(),
        description: document.getElementById("toolDescription").value.trim(),
        category: document.getElementById("toolCategory").value.trim(),
        website: document.getElementById("toolWebsite").value.trim(),
        image: imageFile ? await readLibraryImage(imageFile) : (editing?.image || ""),
      };
      await apiRequest(wasEditing ? `/tools/${encodeURIComponent(editing.id)}` : "/tools", {
        method: wasEditing ? "PUT" : "POST",
        body: JSON.stringify(payload),
      });
      reset();
      create.open = false;
      setLibraryMessage(document.getElementById("toolStatus"), wasEditing ? "Tool updated." : "Tool saved.");
      await loadLibraryCards("tool");
    } catch (error) {
      setLibraryMessage(document.getElementById("toolFormMessage"), `Could not save tool: ${error.message}`, true);
    } finally {
      save.disabled = false;
    }
  });

  loadLibraryCards("tool");
}

function setupResourceCards() {
  const form = document.getElementById("resourceForm");
  if (!form) return;
  const create = document.getElementById("resourceCreate");
  const imageInput = document.getElementById("resourceImage");
  const fileInput = document.getElementById("resourceFile");
  const preview = document.getElementById("resourceImagePreview");
  const currentFile = document.getElementById("resourceCurrentFile");
  const save = document.getElementById("saveResource");
  let editing = null;

  function reset() {
    editing = null;
    form.reset();
    preview.hidden = true;
    preview.removeAttribute("src");
    currentFile.replaceChildren();
    currentFile.hidden = true;
    save.textContent = "Save Resource";
    create.querySelector("summary").textContent = "+ Add Resource";
    setLibraryMessage(document.getElementById("resourceFormMessage"), "");
  }

  window.editResource = (resource) => {
    editing = resource;
    document.getElementById("resourceName").value = resource.name;
    document.getElementById("resourceDescription").value = resource.description || "";
    document.getElementById("resourceDetailedDescription").value = resource.detailedDescription || "";
    document.getElementById("resourceType").value = resource.type || "";
    document.getElementById("resourceUrl").value = resource.url || "";
    preview.src = resource.image || "";
    preview.hidden = !resource.image;
    currentFile.replaceChildren();
    if (resource.file) {
      const label = document.createElement("label");
      label.className = "module-current-file";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.id = "removeResourceFile";
      const text = document.createElement("span");
      text.textContent = `Remove existing file: ${resource.file.name}`;
      label.append(checkbox, text);
      currentFile.appendChild(label);
      currentFile.hidden = false;
    } else {
      currentFile.hidden = true;
    }
    save.textContent = "Update Resource";
    create.querySelector("summary").textContent = "Edit Resource";
    create.open = true;
    form.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  imageInput.addEventListener("change", () => {
    const file = imageInput.files[0];
    if (!file) return;
    preview.src = URL.createObjectURL(file);
    preview.hidden = false;
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    save.disabled = true;
    const previous = editing;
    const wasEditing = Boolean(previous);
    let uploaded = null;
    try {
      const selectedFile = fileInput.files[0];
      if (selectedFile) uploaded = await uploadResourceFile(selectedFile);
      const removeExistingFile = document.getElementById("removeResourceFile")?.checked;
      const payload = {
        name: document.getElementById("resourceName").value.trim(),
        description: document.getElementById("resourceDescription").value.trim(),
        detailedDescription: document.getElementById("resourceDetailedDescription").value.trim(),
        type: document.getElementById("resourceType").value.trim(),
        url: document.getElementById("resourceUrl").value.trim(),
        image: imageInput.files[0] ? await readLibraryImage(imageInput.files[0]) : (previous?.image || ""),
        file: uploaded || (removeExistingFile ? null : (previous?.file || null)),
      };
      await apiRequest(wasEditing ? `/resources/${encodeURIComponent(previous.id)}` : "/resources", {
        method: wasEditing ? "PUT" : "POST",
        body: JSON.stringify(payload),
      });
      if (previous?.file && payload.file?.id !== previous.file.id) {
        const response = await fetch(`${API_BASE}/resource-files/${encodeURIComponent(previous.file.id)}`, { method: "DELETE" });
        if (!response.ok) console.error(`Could not remove replaced resource file ${previous.file.id}.`);
      }
      reset();
      create.open = false;
      setLibraryMessage(document.getElementById("resourceStatus"), wasEditing ? "Resource updated." : "Resource saved.");
      await loadLibraryCards("resource");
    } catch (error) {
      if (uploaded) {
        const cleanup = await fetch(`${API_BASE}/resource-files/${encodeURIComponent(uploaded.id)}`, { method: "DELETE" });
        if (!cleanup.ok) console.error(`Could not clean up uploaded resource file ${uploaded.id}.`);
      }
      setLibraryMessage(document.getElementById("resourceFormMessage"), `Could not save resource: ${error.message}`, true);
    } finally {
      save.disabled = false;
    }
  });

  loadLibraryCards("resource");
}

setupToolCards();
setupResourceCards();
