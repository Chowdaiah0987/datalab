// Shared by index.html and experiment.html

// Same-origin is preferred in production. A local static server (such as VS Code
// Live Server) needs to call the Node backend on its default port instead.
const configuredApiBase = window.DS_LAB_API_BASE ||
  document.querySelector('meta[name="ds-lab-api-base"]')?.content.trim();
const isLocalStaticServer = ["localhost", "127.0.0.1"].includes(window.location.hostname) &&
  /^55\d{2}$/.test(window.location.port);
const API_BASE = String(configuredApiBase || (isLocalStaticServer
  ? "http://localhost:3000/api"
  : "/api")).replace(/\/+$/, "");

const EXPERIMENTS_KEY = "dsLabExperiments";
const PROFILE_KEY = "dsLabProfile";
const VIDEO_DB = "dsLabVideos";
const VIDEO_STORE = "videos";

const GITHUB_ICON = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"/></svg>`;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

async function apiRequest(path, options = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        ...(options.body && !(options.body instanceof Blob) ? { "Content-Type": "application/json" } : {}),
        ...options.headers,
      },
    });
  } catch (error) {
    throw new Error("Cannot reach the server. Is it running?");
  }
  const contentType = response.headers.get("content-type") || "";
  const result = contentType.includes("application/json") ? await response.json() : null;
  if (!response.ok) {
    throw new Error(result?.error || `Request failed with status ${response.status}.`);
  }
  return result;
}

// ---------- Stored data (older saves get sensible defaults) ----------
function normalizeSubExperiment(sub, parentNumber) {
  return {
    ...sub,
    id: sub.id || sub._id || `${parentNumber}${sub.letter}`,
    letter: sub.letter || "",
    title: sub.title || "",
    shortDescription: sub.shortDescription ?? sub.description ?? "",
    d2Heading: sub.d2Heading || "",
    d2Content: sub.d2Content || "",
    d2Topics: normalizeD2Topics(sub.d2Topics, sub.d2Content || ""),
    cover: sub.cover || "",
    video: sub.video || "",
    githubUrl: sub.githubUrl || "",
    completed: sub.completed !== false,
  };
}

function normalizeD2Topic(topic, index = 0) {
  if (!topic || typeof topic !== "object") {
    return {
      id: `topic-${index + 1}`,
      heading: "",
      type: "text",
      content: "",
      language: "python",
      code: "",
      sampleOutput: "",
      order: index + 1,
    };
  }

  const type = topic.type === "code" ? "code" : "text";
  const heading = String(topic.heading || topic.title || "");
  return {
    id: String(topic.id || `topic-${index + 1}`),
    heading: topic.id === "legacy-topic-1" && heading.trim().toLowerCase() === "details" ? "" : heading,
    type,
    content: type === "text" ? String(topic.content ?? topic.text ?? "") : "",
    language: String(topic.language || "python"),
    code: String(topic.code ?? ""),
    sampleOutput: String(topic.sampleOutput ?? ""),
    order: Number.isFinite(Number(topic.order)) ? Number(topic.order) : index + 1,
  };
}

function normalizeD2Topics(rawTopics, legacyText = "") {
  const list = Array.isArray(rawTopics) ? rawTopics : [];
  if (list.length) {
    return list
      .map((topic, index) => normalizeD2Topic(topic, index))
      .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
  }

  const plainText = String(legacyText ?? "").trim();
  if (!plainText) return [];
  return [{
    id: "legacy-topic-1",
    heading: "",
    type: "text",
    content: plainText,
    language: "python",
    code: "",
    sampleOutput: "",
    order: 1,
  }];
}

function serializeD2Topics(topics) {
  const list = Array.isArray(topics) ? topics : [];
  if (!list.length) return "";
  return list
    .slice()
    .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0))
    .map((topic) => {
      const heading = topic.heading ? `## ${topic.heading}` : "";
      if (topic.type === "code") {
        const language = String(topic.language || "python").replace(/[^A-Za-z0-9_+#.-]/g, "") || "python";
        const code = topic.code ? `\`\`\`${language}\n${topic.code}\n\`\`\`` : "";
        const sample = topic.sampleOutput ? `\`\`\`OUTPUT\n${topic.sampleOutput}\n\`\`\`` : "";
        return [heading, code, sample].filter(Boolean).join("\n\n");
      }
      return [heading, topic.content || ""].filter(Boolean).join("\n");
    })
    .join("\n\n")
    .trim();
}

function normalizeExperiment(item) {
  const number = String(item.number ?? "");
  const d2Topics = normalizeD2Topics(item.d2Topics, item.d2Content ?? item.longDescription ?? item.d2 ?? "");
  const d2Content = serializeD2Topics(d2Topics);
  return {
    ...item,
    id: String(item.id || item._id || ""),
    number,
    title: item.title || "",
    shortDescription: item.shortDescription ?? item.description ?? "",
    d2Heading: item.d2Heading || "",
    d2Content,
    d2Topics,
    cover: item.cover ?? item.coverImage ?? "",
    video: item.video || "",
    githubUrl: item.githubUrl ?? item.githubLink ?? "",
    subExperiments: Array.isArray(item.subExperiments)
      ? item.subExperiments.map((sub) => normalizeSubExperiment(sub, number))
      : [],
  };
}

function readStoredExperiments() {
  try {
    const saved = JSON.parse(localStorage.getItem(EXPERIMENTS_KEY));
    return Array.isArray(saved) ? saved.map(normalizeExperiment) : [];
  } catch (error) {
    return [];
  }
}

function getVideoKeys(experiment) {
  return [experiment.video, ...experiment.subExperiments.map((sub) => sub.video)].filter(Boolean);
}

// IndexedDB remains a fallback for videos saved by older frontend versions.
function openVideoDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(VIDEO_DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(VIDEO_STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function videoRequest(mode, action) {
  const db = await openVideoDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(VIDEO_STORE, mode);
    const request = action(transaction.objectStore(VIDEO_STORE));
    transaction.oncomplete = () => { db.close(); resolve(request.result); };
    transaction.onerror = transaction.onabort = () => { db.close(); reject(transaction.error); };
  });
}

async function saveVideo(file) {
  const result = await apiRequest("/videos", {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream", "X-Video-Type": file.type || "application/octet-stream" },
    body: file,
  });
  return result.id;
}

async function getVideo(key) {
  try {
    const response = await fetch(`${API_BASE}/videos/${encodeURIComponent(key)}`);
    if (response.ok) return await response.blob();
    if (response.status !== 404) throw new Error(`Could not load video (status ${response.status}).`);
  } catch (error) {
    const stored = await videoRequest("readonly", (store) => store.get(key)).catch(() => null);
    if (stored) return stored;
    throw error;
  }
  return videoRequest("readonly", (store) => store.get(key));
}

async function deleteVideo(key) {
  try {
    await apiRequest(`/videos/${encodeURIComponent(key)}`, { method: "DELETE" });
  } catch (error) {
    const stored = await videoRequest("readonly", (store) => store.get(key));
    if (!stored) throw error;
  }
  await videoRequest("readwrite", (store) => store.delete(key));
}
