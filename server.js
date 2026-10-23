// Use public DNS so mongodb+srv:// addresses resolve on networks where Node's default DNS fails
require("node:dns").setServers(["8.8.8.8", "1.1.1.1"]);
const crypto = require("node:crypto");
const fs = require("node:fs");
const { createHash } = crypto;
require("dotenv").config();
const path = require("path");
const cors = require("cors");
const express = require("express");
const mongoose = require("mongoose");

const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/dslab";
const MAX_VIDEO_BYTES = (Number(process.env.MAX_VIDEO_MB) || 300) * 1024 * 1024;
const MAX_PDF_BYTES = (Number(process.env.MAX_PDF_MB) || 50) * 1024 * 1024;
const OBJECT_ID = /^[a-f\d]{24}$/i;

// ---------- Authentication (Admin / Normal User) ----------
// Admin credentials live ONLY in environment variables (Render -> Environment). Nothing is hardcoded.
//   ADMIN_USERNAME        the admin username
//   ADMIN_PASSWORD        the admin password (hashed with scrypt in memory at start-up), or instead
//   ADMIN_PASSWORD_HASH   a ready-made hash: scrypt$<saltHex>$<hashHex>  (see README-login.txt)
//   SESSION_SECRET        long random string used to sign the session cookie
const ADMIN_USERNAME = String(process.env.ADMIN_USERNAME || "").trim();
const SESSION_COOKIE = "dsl_session";
const SESSION_TTL_MS = (Number(process.env.SESSION_HOURS) || 12) * 60 * 60 * 1000;
let SESSION_SECRET = process.env.SESSION_SECRET || "";
if (!SESSION_SECRET) {
  SESSION_SECRET = crypto.randomBytes(48).toString("hex");
  console.warn("SESSION_SECRET is not set: sessions will end whenever the server restarts. Set it in your environment.");
}

function scryptHash(password, saltHex = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(String(password), Buffer.from(saltHex, "hex"), 64).toString("hex");
  return `scrypt$${saltHex}$${hash}`;
}

let adminPasswordHash = "";
if (process.env.ADMIN_PASSWORD_HASH && /^scrypt\$[a-f\d]+\$[a-f\d]{128}$/i.test(process.env.ADMIN_PASSWORD_HASH.trim())) {
  adminPasswordHash = process.env.ADMIN_PASSWORD_HASH.trim();
} else if (process.env.ADMIN_PASSWORD) {
  adminPasswordHash = scryptHash(String(process.env.ADMIN_PASSWORD).trim());
}
const ADMIN_LOGIN_ENABLED = Boolean(ADMIN_USERNAME && adminPasswordHash);
if (!ADMIN_LOGIN_ENABLED) {
  console.warn("Admin login is DISABLED: set ADMIN_USERNAME and ADMIN_PASSWORD (or ADMIN_PASSWORD_HASH) in the environment.");
} else {
  console.log(`Admin login is enabled for username of length ${ADMIN_USERNAME.length}.`);
}
const DUMMY_HASH = scryptHash("dummy-password-for-constant-time-checks");

function safeEqual(a, b) {
  const left = crypto.createHash("sha256").update(String(a)).digest();
  const right = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(left, right);
}

function verifyScrypt(password, stored) {
  const [, saltHex, hashHex] = stored.split("$");
  const candidate = crypto.scryptSync(String(password), Buffer.from(saltHex, "hex"), 64);
  const expected = Buffer.from(hashHex, "hex");
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
}

// The real check always runs the full hash so a wrong username and a wrong password take the same time
function verifyAdmin(username, password) {
  if (!ADMIN_LOGIN_ENABLED) return false;
  const userOk = safeEqual(username, ADMIN_USERNAME);
  const passOk = verifyScrypt(password, userOk ? adminPasswordHash : DUMMY_HASH);
  return userOk && passOk;
}

const b64url = (buffer) => Buffer.from(buffer).toString("base64url");
function signSession(session) {
  const body = b64url(JSON.stringify(session));
  const mac = crypto.createHmac("sha256", SESSION_SECRET).update(body).digest("base64url");
  return `${body}.${mac}`;
}
function readSessionToken(token) {
  const [body, mac] = String(token || "").split(".");
  if (!body || !mac) return null;
  const expected = crypto.createHmac("sha256", SESSION_SECRET).update(body).digest("base64url");
  if (mac.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
  try {
    const session = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!session || !["admin", "user"].includes(session.r) || !(session.e > Date.now())) return null;
    return { role: session.r, name: String(session.n || ""), expires: session.e };
  } catch (error) {
    return null;
  }
}
function parseCookies(header) {
  const out = {};
  String(header || "").split(";").forEach((part) => {
    const index = part.indexOf("=");
    if (index > 0) out[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
  });
  return out;
}
const sessionFromRequest = (req) => readSessionToken(parseCookies(req.headers.cookie)[SESSION_COOKIE]);

function cookieFlags(req, maxAgeSeconds) {
  const secure = req.secure || String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim() === "https";
  return `Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure ? "; Secure" : ""}`;
}

// Slow down password guessing: 8 failed Admin attempts per IP per 15 minutes
const failedLogins = new Map();
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILED_LOGINS = 8;
function loginBlocked(ip) {
  const entry = failedLogins.get(ip);
  if (!entry) return false;
  if (entry.resetAt < Date.now()) { failedLogins.delete(ip); return false; }
  return entry.count >= MAX_FAILED_LOGINS;
}
function recordFailedLogin(ip) {
  const entry = failedLogins.get(ip);
  if (!entry || entry.resetAt < Date.now()) failedLogins.set(ip, { count: 1, resetAt: Date.now() + LOGIN_WINDOW_MS });
  else entry.count += 1;
}

// Optional dependency: PDF merging only works when `npm install pdf-lib` has been run.
let PDFDocument = null;
try {
  ({ PDFDocument } = require("pdf-lib"));
} catch (error) {
  console.warn("pdf-lib is not installed: the combined module PDF feature is disabled (npm install pdf-lib to enable).");
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// ---------- Database models ----------
const { Schema } = mongoose;

// Sub-experiments keep the id the website creates (for example "6A")
const d2TopicSchema = new Schema({
  id: { type: String, default: "" },
  heading: { type: String, default: "" },
  type: { type: String, default: "text", enum: ["text", "code"] },
  content: { type: String, default: "" },
  language: { type: String, default: "python" },
  code: { type: String, default: "" },
  sampleOutput: { type: String, default: "" },
  order: { type: Number, default: 1 },
  // Structured lesson fields used by the redesigned topic lesson page.
  aim: { type: String, default: "" },
  syntax: { type: String, default: "" },
  procedure: { type: [String], default: [] },
  result: { type: String, default: "" },
  topicNumber: { type: String, default: "" },
  openAs: { type: String, enum: ["direct", "nested"], default: "direct" },
  pdfUrl: { type: String, default: "" },
  githubUrl: { type: String, default: "" },
  subTopics: { type: [Schema.Types.Mixed], default: [] },
}, { _id: false });

const toolRefSchema = new Schema({
  toolId: { type: String, default: "" }, // _id of the Tool on the Tools page (optional so older records still load)
  name: { type: String, required: true },
  description: { type: String, default: "" },
  url: { type: String, default: "" },
}, { _id: false });

const materialSchema = new Schema({
  title: { type: String, required: true },
  url: { type: String, required: true },
}, { _id: false });

const subExperimentSchema = new Schema({
  id: { type: String, required: true },
  letter: { type: String, required: true },
  title: { type: String, required: true },
  shortDescription: { type: String, required: true },
  d2Heading: { type: String, default: "" },
  d2Content: { type: String, default: "" },
  longDescription: { type: String, default: "" },
  d2Topics: { type: [d2TopicSchema], default: [] },
  topics: { type: [d2TopicSchema], default: [] },
  cover: { type: String, default: "" },
  video: { type: String, default: "" },
  githubUrl: { type: String, default: "" },
  tools: { type: [toolRefSchema], default: [] },
  materials: { type: [materialSchema], default: [] },
  openAs: { type: String, enum: ["direct", "nested"], default: "direct" },
  completed: { type: Boolean, default: true },
}, { _id: false, id: false });

const experimentSchema = new Schema({
  number: { type: String, required: true },
  title: { type: String, required: true },
  shortDescription: { type: String, required: true },
  d2Heading: { type: String, default: "" },
  d2Content: { type: String, default: "" },
  longDescription: { type: String, default: "" },
  d2Topics: { type: [d2TopicSchema], default: [] },
  topics: { type: [d2TopicSchema], default: [] },
  cover: { type: String, default: "" },
  video: { type: String, default: "" },
  githubUrl: { type: String, default: "" },
  tools: { type: [toolRefSchema], default: [] },
  materials: { type: [materialSchema], default: [] },
  subExperiments: { type: [subExperimentSchema], default: [] },
}, { timestamps: true });

const moduleFileSchema = new Schema({
  id: { type: String, required: true },
  name: { type: String, required: true },
  contentType: { type: String, required: true },
}, { _id: false });

const moduleTopicSchema = new Schema({
  id: { type: String, required: true, default: () => new mongoose.Types.ObjectId().toString() },
  title: { type: String, required: true },
  description: { type: String, default: "" },
  content: { type: String, default: "" },
  order: { type: Number, default: 0 },
  pdfFile: { type: moduleFileSchema, default: null },
  pdfUrl: { type: String, default: "" },
  videoFile: { type: moduleFileSchema, default: null },
  videoUrl: { type: String, default: "" },
}, { _id: false });

const importantQuestionsPdfSchema = new Schema({
  id: { type: String, required: true },
  name: { type: String, required: true },
  contentType: { type: String, required: true, enum: ["application/pdf"] },
}, { _id: false });

const importantQuestionsSchema = new Schema({
  type: { type: String, enum: ["text", "pdf", "both", "none"], default: "none" },
  title: { type: String, default: "" },
  description: { type: String, default: "" },
  text: { type: String, default: "" },
  pdfUrl: { type: String, default: "" },
  pdfFile: { type: importantQuestionsPdfSchema, default: null },
}, { _id: false });

const moduleSchema = new Schema({
  number: { type: String, default: "" },
  title: { type: String, required: true },
  description: { type: String, default: "" }, // short description (shown on cards)
  fullDescription: { type: String, default: "" },
  learningOutcomes: { type: [String], default: [] },
  cover: { type: String, default: "" },
  notesFile: { type: moduleFileSchema, default: null },
  notesUrl: { type: String, default: "" },
  moduleVideoFile: { type: moduleFileSchema, default: null },
  moduleVideoUrl: { type: String, default: "" },
  topics: { type: [moduleTopicSchema], default: [] },
  files: { type: [moduleFileSchema], default: [] },
  importantQuestions: { type: importantQuestionsSchema, default: () => ({}) },
}, { timestamps: true });

const toolSchema = new Schema({
  name: { type: String, required: true },
  description: { type: String, default: "" },
  category: { type: String, default: "" },
  website: { type: String, default: "" },
  image: { type: String, default: "" },
}, { timestamps: true });

const resourceFileSchema = new Schema({
  id: { type: String, required: true },
  name: { type: String, required: true },
  contentType: { type: String, required: true },
}, { _id: false });

const resourceSchema = new Schema({
  name: { type: String, required: true },
  description: { type: String, default: "" },
  detailedDescription: { type: String, default: "" },
  type: { type: String, default: "" },
  url: { type: String, default: "" },
  image: { type: String, default: "" },
  file: { type: resourceFileSchema, default: null },
}, { timestamps: true });

experimentSchema.set("toJSON", {
  transform(doc, ret) {
    ret.id = String(ret._id);
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

moduleSchema.set("toJSON", {
  transform(doc, ret) {
    ret.id = String(ret._id);
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

for (const schema of [toolSchema, resourceSchema]) {
  schema.set("toJSON", {
    transform(doc, ret) {
      ret.id = String(ret._id);
      delete ret._id;
      delete ret.__v;
      return ret;
    },
  });
}

// One profile (the ID card) for the whole site
const profileSchema = new Schema({
  key: { type: String, default: "main", unique: true },
  name: String,
  roll: String,
  section: String,
  branch: String,
  assistantProfessor: { type: String, default: "" },
  githubRepo: { type: String, default: "" },
  photo: { type: String, default: "" },
  logo: { type: String, default: "" },
}, { timestamps: true });

profileSchema.set("toJSON", {
  transform(doc, ret) {
    ["_id", "__v", "key", "createdAt", "updatedAt"].forEach((field) => delete ret[field]);
    return ret;
  },
});

const Experiment = mongoose.model("Experiment", experimentSchema);
const Module = mongoose.model("Module", moduleSchema);
const Tool = mongoose.model("Tool", toolSchema);
const Resource = mongoose.model("Resource", resourceSchema);
const Profile = mongoose.model("Profile", profileSchema);
let videoBucket; // GridFS bucket for uploaded videos, created after connecting
let moduleFileBucket;
let importantQuestionsFileBucket;
let resourceFileBucket;

// ---------- Validation ----------
const text = (value) => (typeof value === "string" ? value.trim() : "");

function requireText(value, message) {
  const clean = text(value);
  if (!clean) throw new HttpError(400, message);
  return clean;
}

function isValidGithubUrl(value) {
  try {
    const url = new URL(value);
    const segments = url.pathname.split("/").filter(Boolean);
    return url.protocol === "https:" && ["github.com", "www.github.com"].includes(url.hostname) && segments.length >= 2;
  } catch (error) {
    return false;
  }
}

function optionalGithub(value) {
  const clean = text(value);
  if (clean && !isValidGithubUrl(clean)) {
    throw new HttpError(400, "GitHub links must look like https://github.com/username/project-name.");
  }
  return clean;
}

function optionalImage(value) {
  const image = typeof value === "string" ? value : "";
  if (image && !image.startsWith("data:image/")) throw new HttpError(400, "Images must be uploaded image files.");
  return image;
}

// Stable topic IDs: generated once, kept on every later save, never based on array position.
function newTopicId() {
  return `t_${crypto.randomBytes(6).toString("hex")}`;
}

// Makes every topic ID in one experiment/sub-experiment tree unique (legacy "topic-1" style IDs repeat across levels).
function ensureUniqueTopicIds(topics, used = new Set()) {
  for (const topic of topics) {
    let id = String(topic.id || "");
    if (!id || used.has(id)) id = newTopicId();
    used.add(id);
    topic.id = id;
    if (Array.isArray(topic.subTopics)) ensureUniqueTopicIds(topic.subTopics, used);
  }
  return topics;
}

function normalizeD2Topic(topic, index = 0) {
  const safe = topic && typeof topic === "object" ? topic : {};
  const type = safe.type === "code" ? "code" : "text";
  const heading = String(safe.heading || safe.title || safe.name || safe.topicName || safe.topic_name || safe.label || "");
  return {
    id: String(safe.id || safe.topicId || newTopicId()),
    heading: safe.id === "legacy-topic-1" && heading.trim().toLowerCase() === "details" ? "" : heading,
    type,
    content: type === "text" ? String(safe.content ?? safe.text ?? "") : "",
    language: String(safe.language || "python"),
    code: String(safe.code ?? safe.codeSample ?? safe.program ?? safe.programCode ?? safe.sampleCode ?? ""),
    sampleOutput: String(safe.sampleOutput ?? safe.outputSample ?? safe.expectedOutput ?? safe.output ?? ""),
    order: Number.isFinite(Number(safe.order)) ? Number(safe.order) : index + 1,
    aim: String(safe.aim ?? safe.objective ?? (type === "text" ? safe.content ?? safe.description ?? "" : "")),
    syntax: String(safe.syntax ?? safe.syntaxSample ?? ""),
    procedure: Array.isArray(safe.procedure ?? safe.steps ?? safe.process) ? (safe.procedure ?? safe.steps ?? safe.process).map((step) => String(step ?? "")).filter(Boolean).slice(0, 100) : String(safe.procedure ?? safe.steps ?? safe.process ?? "").split(/\r?\n/).map((step) => step.trim()).filter(Boolean).slice(0, 100),
    result: String(safe.result ?? safe.conclusion ?? ""),
    topicNumber: String(safe.topicNumber ?? safe.topicNo ?? safe.number ?? ""),
    // Derived from real child relationships; the old manual "Open as" flag is no longer read or required.
    openAs: Array.isArray(safe.subTopics) && safe.subTopics.some((child) => child && typeof child === "object") ? "nested" : "direct",
    pdfUrl: httpUrl(safe.pdfUrl, "topic PDF"),
    githubUrl: optionalGithub(safe.githubUrl),
    subTopics: Array.isArray(safe.subTopics) ? safe.subTopics.slice(0, 100).map((child, childIndex) => normalizeD2Topic(child, childIndex)) : [],
  };
}

function normalizeD2Topics(rawTopics) {
  /* Only topics that were actually saved are returned. Older versions turned the long description into a
     headless "legacy-topic-1" record when no topics existed; that record is never created again and any
     copy sent back by a client is dropped (it only duplicated the long description). */
  const list = (Array.isArray(rawTopics) ? rawTopics : []).filter(
    (topic) => !(topic && typeof topic === "object" && topic.id === "legacy-topic-1" && !String(topic.heading || "").trim()),
  );
  return list
    .map((topic, index) => normalizeD2Topic(topic, index))
    .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
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

function formatD2Data(d2Heading, rawTopics, legacyText) {
  const topics = normalizeD2Topics(rawTopics);
  return {
    d2Heading: text(d2Heading),
    d2Content: topics.length ? serializeD2Topics(topics) : text(legacyText),
    d2Topics: topics,
  };
}

function parseToolRefs(list) {
  const seen = new Set();
  return (Array.isArray(list) ? list : [])
    .filter((item) => item && (text(item.name) || text(item.description) || text(item.url)))
    .slice(0, 30)
    .map((item) => ({
      toolId: text(item.toolId).slice(0, 64),
      name: requireText(item.name, "Every tool needs a name."),
      description: text(item.description).slice(0, 200),
      url: httpUrl(item.url, "tool link"),
    }))
    .filter((tool) => {
      const key = tool.toolId || tool.name.toLowerCase();
      if (seen.has(key)) return false; // no duplicate tool entries
      seen.add(key);
      return true;
    });
}

function parseMaterials(list) {
  return (Array.isArray(list) ? list : [])
    .filter((item) => item && (text(item.title) || text(item.url)))
    .slice(0, 50)
    .map((item) => ({
      title: requireText(item.title, "Every material needs a title."),
      url: httpUrl(requireText(item.url, "Every material needs a link."), "material link"),
    }));
}

function parseSubExperiment(sub, number, usedLetters) {
  const letter = text(sub && sub.letter).toUpperCase();
  if (!/^[A-Z0-9]{1,3}$/.test(letter)) throw new HttpError(400, "Sub-experiment letters must be 1-3 letters or digits.");
  if (usedLetters.has(letter)) throw new HttpError(400, `Sub-experiment ${letter} is used twice.`);
  usedLetters.add(letter);

  const d2 = formatD2Data(sub.d2Heading, sub.d2Topics, sub.d2Content);

  return {
    id: `${number}${letter}`,
    letter,
    title: requireText(sub.title, `Sub-experiment ${letter} needs a name.`),
    shortDescription: requireText(sub.shortDescription ?? sub.description, `Sub-experiment ${letter} needs a short description.`),
    d2Heading: d2.d2Heading,
    d2Content: d2.d2Content,
    longDescription: String(sub.longDescription ?? sub.d2Content ?? ""),
    d2Topics: d2.d2Topics,
    topics: ensureUniqueTopicIds(normalizeD2Topics(sub.topics || [])),
    cover: optionalImage(sub.cover),
    video: text(sub.video),
    githubUrl: optionalGithub(sub.githubUrl),
    tools: parseToolRefs(sub.tools),
    materials: parseMaterials(sub.materials),
    openAs: Array.isArray(sub.topics) && sub.topics.length ? 'nested' : 'direct',
    completed: sub.completed !== false,
  };
}

function parseExperiment(body = {}) {
  const number = requireText(body.number, "Experiment number is required.");
  const subs = Array.isArray(body.subExperiments) ? body.subExperiments : [];
  const usedLetters = new Set();
  const d2 = formatD2Data(body.d2Heading, body.d2Topics, body.d2Content);
  return {
    number,
    title: requireText(body.title, "Experiment name is required."),
    shortDescription: requireText(body.shortDescription ?? body.description, "A short description (D1) is required."),
    d2Heading: d2.d2Heading,
    d2Content: d2.d2Content,
    longDescription: String(body.longDescription ?? body.d2Content ?? ""),
    d2Topics: d2.d2Topics,
    topics: ensureUniqueTopicIds(normalizeD2Topics(body.topics || [])),
    cover: optionalImage(body.cover), // optional: the UI shows a graceful placeholder when empty
    video: text(body.video),
    githubUrl: optionalGithub(body.githubUrl),
    tools: parseToolRefs(body.tools),
    materials: parseMaterials(body.materials),
    subExperiments: subs.map((sub) => parseSubExperiment(sub || {}, number, usedLetters)),
  };
}

function parseProfile(body = {}) {
  return {
    name: requireText(body.name, "Name is required."),
    roll: requireText(body.roll, "Roll number is required."),
    section: requireText(body.section, "Section is required."),
    branch: requireText(body.branch, "Branch is required."),
    assistantProfessor: text(body.assistantProfessor),
    githubRepo: optionalGithub(body.githubRepo),
    photo: optionalImage(body.photo),
    logo: optionalImage(body.logo),
  };
}

function httpUrl(value, label) {
  const url = text(value);
  if (!url) return "";
  try {
    if (!["http:", "https:"].includes(new URL(url).protocol)) throw new Error();
  } catch (error) {
    throw new HttpError(400, `Enter a valid ${label} URL (it must start with http:// or https://).`);
  }
  return url;
}

// Module covers are either an uploaded image (stored as a data URL) or an http(s) image link
function moduleCover(value) {
  const cover = typeof value === "string" ? value.trim() : "";
  if (!cover) return "";
  if (cover.startsWith("data:image/")) return cover;
  return httpUrl(cover, "cover image");
}

function parseModuleFile(file, kind, label) {
  if (!file) return null;
  const contentType = text(file.contentType);
  if (!OBJECT_ID.test(String(file.id || ""))) throw new HttpError(400, `The ${label} attachment is invalid.`);
  if (kind === "pdf") {
    if (contentType !== "application/pdf") throw new HttpError(400, `${label} must be a PDF.`);
    if (!/\.pdf$/i.test(text(file.name))) throw new HttpError(400, `${label} must have a .pdf filename.`);
  } else if (!contentType.startsWith("video/")) {
    throw new HttpError(400, `${label} must be a video file.`);
  }
  return {
    id: String(file.id),
    name: requireText(file.name, `The ${label} attachment needs a file name.`),
    contentType,
  };
}

function parseModule(body = {}) {
  const topics = Array.isArray(body.topics) ? body.topics : [];
  const files = Array.isArray(body.files) ? body.files : [];
  const importantQuestions = body.importantQuestions && typeof body.importantQuestions === "object"
    ? body.importantQuestions
    : {};
  if (!topics.length) throw new HttpError(400, "Add at least one module topic.");

  const number = text(body.number).slice(0, 10);
  if (number && !/^[A-Za-z0-9.\-]{1,10}$/.test(number)) {
    throw new HttpError(400, "The module number can only contain letters, digits, dots and dashes.");
  }
  const outcomes = (Array.isArray(body.learningOutcomes) ? body.learningOutcomes : [])
    .map((item) => text(item).slice(0, 300))
    .filter(Boolean)
    .slice(0, 30);

  const notesFile = parseModuleFile(body.notesFile, "pdf", "The module notes PDF");
  const notesUrl = httpUrl(body.notesUrl, "module notes PDF");
  if (notesFile && notesUrl) throw new HttpError(400, "Use either an uploaded module notes PDF or a URL, not both.");
  const moduleVideoFile = parseModuleFile(body.moduleVideoFile, "video", "The module video");
  const moduleVideoUrl = httpUrl(body.moduleVideoUrl, "module video");
  if (moduleVideoFile && moduleVideoUrl) throw new HttpError(400, "Use either an uploaded module video or a URL, not both.");

  const questionText = String(importantQuestions.text || "");
  const questionPdf = parseModuleFile(importantQuestions.pdfFile, "pdf", "The Important Questions PDF");
  const questionUrl = questionPdf ? "" : httpUrl(
    importantQuestions.pdfUrl && !String(importantQuestions.pdfUrl).startsWith("/api/")
      ? importantQuestions.pdfUrl : "",
    "Important Questions PDF",
  );
  const hasQuestionText = Boolean(questionText.trim());
  const hasPdf = Boolean(questionPdf || questionUrl);
  const questionType = hasQuestionText && hasPdf ? "both" : hasQuestionText ? "text" : hasPdf ? "pdf" : "none";

  const topicIds = new Set();
  return {
    number,
    title: requireText(body.title, "Module name is required."),
    description: text(body.description).slice(0, 600),
    fullDescription: text(body.fullDescription).slice(0, 10000),
    learningOutcomes: outcomes,
    cover: moduleCover(body.cover),
    notesFile,
    notesUrl,
    moduleVideoFile,
    moduleVideoUrl,
    topics: topics.map((topic, index) => {
      const id = text(topic && topic.id) || new mongoose.Types.ObjectId().toString();
      if (topicIds.has(id)) throw new HttpError(400, "Every topic must have a unique ID.");
      topicIds.add(id);
      const pdfFile = parseModuleFile(topic && topic.pdfFile, "pdf", "Topic PDF");
      const videoFile = parseModuleFile(topic && topic.videoFile, "video", "Topic video");
      const pdfUrl = httpUrl(topic && topic.pdfUrl, "topic PDF");
      const videoUrl = httpUrl(topic && topic.videoUrl, "topic video");
      if (pdfFile && pdfUrl) throw new HttpError(400, "A topic can use either an uploaded PDF or a PDF URL, not both.");
      if (videoFile && videoUrl) throw new HttpError(400, "A topic can use either an uploaded video or a video URL, not both.");
      const order = Number(topic && topic.order);
      return {
        id,
        title: requireText(topic && topic.title, "Every module topic needs a title."),
        description: text(topic && topic.description).slice(0, 600),
        content: text(topic && topic.content).slice(0, 60000),
        order: Number.isFinite(order) && order > 0 ? order : index + 1,
        pdfFile,
        pdfUrl,
        videoFile,
        videoUrl,
      };
    }),
    files: files.map((file) => {
      const contentType = text(file && file.contentType);
      if (!OBJECT_ID.test(String(file && file.id || ""))) {
        throw new HttpError(400, "A module attachment is invalid.");
      }
      if (contentType !== "application/pdf" && !contentType.startsWith("video/")) {
        throw new HttpError(400, "Module attachments must be PDFs or videos.");
      }
      return {
        id: String(file.id),
        name: requireText(file.name, "Every attachment needs a file name."),
        contentType,
      };
    }),
    importantQuestions: {
      type: questionType,
      title: text(importantQuestions.title).slice(0, 150),
      description: text(importantQuestions.description).slice(0, 1000),
      text: questionText,
      pdfUrl: questionPdf ? `/api/important-question-files/${questionPdf.id}` : questionUrl,
      pdfFile: questionPdf,
    },
  };
}

function parseTool(body = {}) {
  const website = text(body.website);
  if (website) {
    try {
      if (!["http:", "https:"].includes(new URL(website).protocol)) throw new Error();
    } catch (error) {
      throw new HttpError(400, "Enter a valid website URL.");
    }
  }
  return {
    name: requireText(body.name, "Tool name is required."),
    description: text(body.description),
    category: text(body.category),
    website,
    image: optionalImage(body.image),
  };
}

function parseResource(body = {}) {
  const url = text(body.url);
  if (url) {
    try {
      if (!["http:", "https:"].includes(new URL(url).protocol)) throw new Error();
    } catch (error) {
      throw new HttpError(400, "Enter a valid resource URL.");
    }
  }
  let file = null;
  if (body.file) {
    const contentType = text(body.file.contentType);
    if (!OBJECT_ID.test(String(body.file.id || ""))) throw new HttpError(400, "The resource file is invalid.");
    if (contentType !== "application/pdf" && !contentType.startsWith("image/")) {
      throw new HttpError(400, "Resource attachments must be PDFs or images.");
    }
    file = {
      id: String(body.file.id),
      name: requireText(body.file.name, "The resource file needs a name."),
      contentType,
    };
  }
  return {
    name: requireText(body.name, "Resource name is required."),
    description: text(body.description),
    detailedDescription: text(body.detailedDescription),
    type: text(body.type),
    url,
    image: optionalImage(body.image),
    file,
  };
}

// ---------- Video helpers (GridFS) ----------
async function deleteVideoFile(id) {
  if (!OBJECT_ID.test(id || "")) return;
  try {
    await videoBucket.delete(new mongoose.Types.ObjectId(id));
  } catch (error) {
    if (!/File\s*not found|no file with id/i.test(String(error.message))) throw error;
  }
}

async function deleteModuleFile(id) {
  if (!OBJECT_ID.test(id || "")) return;
  try {
    await moduleFileBucket.delete(new mongoose.Types.ObjectId(id));
  } catch (error) {
    if (!/File\s*not found|no file with id/i.test(String(error.message))) throw error;
  }
}

async function deleteImportantQuestionsFile(id) {
  if (!OBJECT_ID.test(id || "")) return;
  try {
    await importantQuestionsFileBucket.delete(new mongoose.Types.ObjectId(id));
  } catch (error) {
    if (!/File\s*not found|no file with id/i.test(String(error.message))) throw error;
  }
}

async function deleteResourceFile(id) {
  if (!OBJECT_ID.test(id || "")) return;
  try {
    await resourceFileBucket.delete(new mongoose.Types.ObjectId(id));
  } catch (error) {
    if (!/File\s*not found|no file with id/i.test(String(error.message))) throw error;
  }
}

// ---------- App ----------
const app = express();
app.set("trust proxy", 1); // Render sits behind a proxy: needed for secure cookies and the real client IP
const wrap = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

const configuredCorsOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(",").map((origin) => origin.trim()).filter(Boolean)
  : null;
app.use(cors({
  credentials: true,
  origin(origin, callback) {
    const isLocalDevelopmentOrigin = /^http:\/\/(?:localhost|127\.0\.0\.1):\d+$/.test(origin || "");
    const isAllowed = !origin ||
      (configuredCorsOrigins
        ? configuredCorsOrigins.includes("*") || configuredCorsOrigins.includes(origin)
        : isLocalDevelopmentOrigin);
    callback(null, isAllowed);
  },
}));
app.use(express.json({ limit: "30mb" })); // covers are stored as compressed image data

// ----- Sign in / sign out -----
app.get("/api/auth/me", (req, res) => {
  const session = sessionFromRequest(req);
  res.set("Cache-Control", "no-store");
  res.json(session ? { authenticated: true, role: session.role, name: session.name } : { authenticated: false, role: null });
});

app.post("/api/auth/login", wrap(async (req, res) => {
  const body = req.body || {};
  const role = body.role === "admin" ? "admin" : "user";
  const identifier = String(body.identifier ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 80);
  const password = typeof body.password === "string" ? body.password : "";
  if (!identifier) throw new HttpError(400, "Enter your username or email.");
  if (!password.trim()) throw new HttpError(400, "Enter your password.");
  if (password.length > 200) throw new HttpError(400, "The password is too long.");

  let session;
  if (role === "admin") {
    if (!ADMIN_LOGIN_ENABLED) {
      throw new HttpError(503, "Admin login is not set up on the server yet. In Render > Environment add ADMIN_USERNAME and ADMIN_PASSWORD, then redeploy.");
    }
    if (loginBlocked(req.ip)) throw new HttpError(429, "Too many failed attempts. Please wait a few minutes and try again.");
    if (!verifyAdmin(identifier, password)) {
      recordFailedLogin(req.ip);
      throw new HttpError(401, "Invalid Admin username or password.");
    }
    failedLogins.delete(req.ip);
    session = { r: "admin", n: "Admin" };
  } else {
    // Normal users: any non-empty username/email and password is accepted. Nothing is stored.
    session = { r: "user", n: identifier };
  }
  session.e = Date.now() + SESSION_TTL_MS;
  res.set("Set-Cookie", `${SESSION_COOKIE}=${signSession(session)}; ${cookieFlags(req, Math.floor(SESSION_TTL_MS / 1000))}`);
  res.set("Cache-Control", "no-store");
  res.json({ ok: true, role: session.r, name: session.n });
}));

app.post("/api/auth/logout", (req, res) => {
  res.set("Set-Cookie", `${SESSION_COOKIE}=; ${cookieFlags(req, 0)}`);
  res.set("Cache-Control", "no-store");
  res.json({ ok: true });
});

// ----- Authorization for every other API route -----
//   not signed in            -> same as Normal User (view only)
//   Normal User, read only   -> GET / HEAD allowed
//   Normal User, any change  -> 403
//   Admin                    -> everything
app.use("/api", (req, res, next) => {
  // Visitors who have not signed in are treated as view-only Normal Users (no sign-in needed to read the site)
  const session = sessionFromRequest(req) || { role: "user", name: "", guest: true };
  req.session = session;
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  if (session.role !== "admin") {
    return res.status(403).json({ error: "View-only access: only an Admin can add, edit, delete or upload content. Use Admin login to make changes." });
  }
  // Admin changes must come from this website (blocks cross-site requests that carry the cookie)
  const origin = req.get("origin");
  if (origin) {
    let sameSite = false;
    try { sameSite = new URL(origin).host === req.get("host"); } catch (error) { sameSite = false; }
    if (!sameSite && !(configuredCorsOrigins && (configuredCorsOrigins.includes("*") || configuredCorsOrigins.includes(origin)))) {
      return res.status(403).json({ error: "This request did not come from the website." });
    }
  }
  next();
});

// ----- Experiments -----
app.get("/api/experiments", wrap(async (req, res) => {
  res.json(await Experiment.find().sort({ createdAt: 1 }));
}));

app.get("/api/home-counts", wrap(async (req, res) => {
  const [modules, experiments, tools, resources] = await Promise.all([
    Module.countDocuments(),
    Experiment.countDocuments(),
    Tool.countDocuments(),
    Resource.countDocuments(),
  ]);
  res.json({ modules, experiments, tools, resources });
}));

app.get("/api/experiments/:id", wrap(async (req, res) => {
  const experiment = OBJECT_ID.test(req.params.id) ? await Experiment.findById(req.params.id) : null;
  if (!experiment) throw new HttpError(404, "Experiment not found");
  res.json(experiment);
}));

app.post("/api/experiments", wrap(async (req, res) => {
  const created = await Experiment.create(parseExperiment(req.body));
  res.status(201).json(created);
}));

app.put("/api/experiments/:id", wrap(async (req, res) => {
  if (!OBJECT_ID.test(req.params.id)) throw new HttpError(404, "Experiment not found");
  const updated = await Experiment.findByIdAndUpdate(req.params.id, parseExperiment(req.body), {
    new: true,
    runValidators: true,
  });
  if (!updated) throw new HttpError(404, "Experiment not found");
  res.json(updated);
}));

app.delete("/api/experiments/:id", wrap(async (req, res) => {
  const removed = OBJECT_ID.test(req.params.id) ? await Experiment.findByIdAndDelete(req.params.id) : null;
  if (!removed) throw new HttpError(404, "Experiment not found");
  const videoIds = [removed.video, ...removed.subExperiments.map((sub) => sub.video)].filter(Boolean);
  await Promise.all(videoIds.map((id) => deleteVideoFile(id).catch((error) => console.error("Video cleanup failed:", error.message))));
  res.json({ ok: true });
}));

// ----- Learning modules -----
app.get("/api/modules", wrap(async (req, res) => {
  res.json(await Module.find().sort({ createdAt: -1 }));
}));

app.get("/api/modules/:id", wrap(async (req, res) => {
  const module = OBJECT_ID.test(req.params.id) ? await Module.findById(req.params.id) : null;
  if (!module) throw new HttpError(404, "Module not found.");
  res.json(module);
}));

app.post("/api/modules", wrap(async (req, res) => {
  const created = await Module.create(parseModule(req.body));
  res.status(201).json(created);
}));

app.put("/api/modules/:id", wrap(async (req, res) => {
  if (!OBJECT_ID.test(req.params.id)) throw new HttpError(404, "Module not found.");
  const updated = await Module.findByIdAndUpdate(req.params.id, parseModule(req.body), {
    new: true,
    runValidators: true,
  });
  if (!updated) throw new HttpError(404, "Module not found.");
  res.json(updated);
}));

app.delete("/api/modules/:id", wrap(async (req, res) => {
  const module = OBJECT_ID.test(req.params.id) ? await Module.findById(req.params.id) : null;
  if (!module) throw new HttpError(404, "Module not found.");
  const moduleFileIds = new Set([
    ...module.files.map((file) => file.id),
    ...module.topics.flatMap((topic) => [topic.pdfFile && topic.pdfFile.id, topic.videoFile && topic.videoFile.id]),
    module.notesFile && module.notesFile.id,
    module.moduleVideoFile && module.moduleVideoFile.id,
  ].filter(Boolean));
  await Promise.all([...moduleFileIds].map((id) => deleteModuleFile(id)));
  if (module.importantQuestions && module.importantQuestions.pdfFile) {
    await deleteImportantQuestionsFile(module.importantQuestions.pdfFile.id);
  }
  await module.deleteOne();
  res.json({ ok: true });
}));

// ----- Combined module PDF (real merge with pdf-lib) -----
app.get("/api/capabilities", (req, res) => {
  res.json({ pdfMerge: Boolean(PDFDocument) });
});

async function readGridFsBuffer(bucket, id) {
  const chunks = [];
  for await (const chunk of bucket.openDownloadStream(new mongoose.Types.ObjectId(id))) chunks.push(chunk);
  return Buffer.concat(chunks);
}

// Order: module notes -> topic notes (topic order) -> additional module PDFs -> Important Questions (always last).
// Only PDFs uploaded to this site can be merged; PDFs that are external links are reported as skipped.
app.get("/api/modules/:id/combined-pdf", wrap(async (req, res) => {
  if (!PDFDocument) throw new HttpError(501, "PDF merging is not enabled on this server. Run `npm install pdf-lib` and restart.");
  const module = OBJECT_ID.test(req.params.id) ? await Module.findById(req.params.id) : null;
  if (!module) throw new HttpError(404, "Module not found.");

  const parts = [];
  const skipped = [];
  const addPart = (label, file, url, bucket) => {
    if (file) parts.push({ label, id: file.id, bucket });
    else if (url) skipped.push(label);
  };
  addPart("Module notes", module.notesFile, module.notesUrl, moduleFileBucket);
  [...module.topics]
    .sort((a, b) => (a.order || 0) - (b.order || 0))
    .forEach((topic) => addPart(`Topic: ${topic.title}`, topic.pdfFile, topic.pdfUrl, moduleFileBucket));
  module.files
    .filter((file) => file.contentType === "application/pdf")
    .forEach((file) => parts.push({ label: file.name, id: file.id, bucket: moduleFileBucket }));
  const questions = module.importantQuestions || {};
  addPart("Important Questions", questions.pdfFile, questions.pdfUrl && !questions.pdfFile ? questions.pdfUrl : "", importantQuestionsFileBucket);
  if (questions.pdfFile) {
    // addPart pushed it already; make sure it is the final entry
    const index = parts.findIndex((part) => part.bucket === importantQuestionsFileBucket);
    if (index !== parts.length - 1) parts.push(parts.splice(index, 1)[0]);
  }
  if (!parts.length) throw new HttpError(404, "This module has no uploaded PDFs to combine.");

  const output = await PDFDocument.create();
  for (const part of parts) {
    let source;
    try {
      source = await PDFDocument.load(await readGridFsBuffer(part.bucket, part.id), { ignoreEncryption: true });
    } catch (error) {
      throw new HttpError(422, `Could not read “${part.label}” as a PDF, so the combined PDF was not created.`);
    }
    (await output.copyPages(source, source.getPageIndices())).forEach((page) => output.addPage(page));
  }
  const bytes = Buffer.from(await output.save());
  const slug = (module.title || "module").normalize("NFKD").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "module";
  res.set({
    "Content-Type": "application/pdf",
    "Content-Length": bytes.length,
    "Content-Disposition": `${req.query.download === "1" ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(`${slug}_complete.pdf`)}`,
    "X-Combined-Parts": String(parts.length),
    "X-Combined-Skipped": String(skipped.length),
    "Access-Control-Expose-Headers": "X-Combined-Parts, X-Combined-Skipped",
  });
  res.send(bytes);
}));

app.post("/api/module-files", wrap(async (req, res) => {
  const type = req.get("Content-Type") || "";
  if (type !== "application/pdf" && !type.startsWith("video/")) {
    throw new HttpError(400, "Only PDF documents and video files can be attached to a module.");
  }
  let requestedName = req.get("X-Module-File-Name") || "";
  try {
    requestedName = decodeURIComponent(requestedName);
  } catch (error) {
    throw new HttpError(400, "The module file name is invalid.");
  }
  requestedName = requestedName.replace(/\\/g, "/");
  const name = path.basename(requestedName).replace(/[\r\n"]/g, "").slice(0, 200) || `module-file-${Date.now()}`;
  if (type === "application/pdf" && !/\.pdf$/i.test(name)) {
    throw new HttpError(400, "PDF attachments must have a .pdf filename.");
  }
  const moduleLimit = type === "application/pdf" ? MAX_PDF_BYTES : MAX_VIDEO_BYTES;
  if (Number(req.get("content-length")) > moduleLimit) {
    throw new HttpError(413, `${type === "application/pdf" ? "PDF files" : "Videos"} can be at most ${Math.round(moduleLimit / 1024 / 1024)} MB.`);
  }
  const upload = moduleFileBucket.openUploadStream(name, { metadata: { contentType: type } });
  let received = 0;
  await new Promise((resolve, reject) => {
    req.on("data", (chunk) => {
      received += chunk.length;
      if (received > moduleLimit) {
        req.unpipe(upload);
        upload.abort().catch(() => {});
        reject(new HttpError(413, `${type === "application/pdf" ? "PDF files" : "Videos"} can be at most ${Math.round(moduleLimit / 1024 / 1024)} MB.`));
      }
    });
    req.on("error", reject);
    req.pipe(upload).on("error", reject).on("finish", resolve);
  });
  res.status(201).json({ id: String(upload.id), name, contentType: type });
}));

app.get("/api/module-files/:id", wrap(async (req, res) => {
  if (!OBJECT_ID.test(req.params.id)) throw new HttpError(404, "Module file not found.");
  const id = new mongoose.Types.ObjectId(req.params.id);
  const [file] = await moduleFileBucket.find({ _id: id }).toArray();
  if (!file) throw new HttpError(404, "Module file not found.");
  const contentType = (file.metadata && file.metadata.contentType) || "application/octet-stream";
  let rangeStart = 0;
  let rangeEnd = file.length - 1;
  let status = 200;
  const range = req.get("Range");
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (!match || file.length === 0 || (!match[1] && !match[2])) {
      res.set("Content-Range", `bytes */${file.length}`).status(416).end();
      return;
    }
    if (!match[1]) {
      const suffixLength = Number(match[2]);
      if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) {
        res.set("Content-Range", `bytes */${file.length}`).status(416).end();
        return;
      }
      rangeStart = Math.max(0, file.length - suffixLength);
    } else {
      rangeStart = Number(match[1]);
      if (!Number.isSafeInteger(rangeStart) || rangeStart >= file.length) {
        res.set("Content-Range", `bytes */${file.length}`).status(416).end();
        return;
      }
    }
    if (match[2]) {
      rangeEnd = Number(match[2]);
      if (!Number.isSafeInteger(rangeEnd) || rangeEnd < rangeStart) {
        res.set("Content-Range", `bytes */${file.length}`).status(416).end();
        return;
      }
      rangeEnd = Math.min(rangeEnd, file.length - 1);
    }
    status = 206;
  }
  const requestedDownloadName = String(req.query.downloadName || "")
    .replace(/\\/g, "/")
    .split("/")
    .pop()
    .replace(/[^A-Za-z0-9._-]/g, "_")
    .slice(0, 120);
  const filename = encodeURIComponent(
    req.query.download === "1" && /\.pdf$/i.test(requestedDownloadName)
      ? requestedDownloadName
      : path.basename(file.filename || "module-file"),
  );
  const headers = {
    "Content-Type": contentType,
    "Content-Length": status === 206 ? rangeEnd - rangeStart + 1 : file.length,
    "Content-Disposition": `${req.query.download === "1" ? "attachment" : "inline"}; filename*=UTF-8''${filename}`,
    "Accept-Ranges": "bytes",
  };
  if (status === 206) headers["Content-Range"] = `bytes ${rangeStart}-${rangeEnd}/${file.length}`;
  res.status(status).set(headers);
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  const streamOptions = status === 206 ? { start: rangeStart, end: rangeEnd + 1 } : undefined;
  moduleFileBucket.openDownloadStream(id, streamOptions).on("error", (error) => res.destroy(error)).pipe(res);
}));

app.delete("/api/module-files/:id", wrap(async (req, res) => {
  if (!OBJECT_ID.test(req.params.id)) throw new HttpError(404, "Module file not found.");
  await deleteModuleFile(req.params.id);
  res.json({ ok: true });
}));

app.post("/api/important-question-files", wrap(async (req, res) => {
  const type = req.get("Content-Type") || "";
  if (type !== "application/pdf") throw new HttpError(400, "Important Questions attachments must be PDF documents.");
  let requestedName = req.get("X-Important-Questions-File-Name") || "";
  try {
    requestedName = decodeURIComponent(requestedName);
  } catch (error) {
    throw new HttpError(400, "The Important Questions PDF filename is invalid.");
  }
  requestedName = requestedName.replace(/\\/g, "/");
  const name = path.basename(requestedName).replace(/[\r\n"]/g, "").slice(0, 200);
  if (!/\.pdf$/i.test(name)) throw new HttpError(400, "Important Questions attachments must have a .pdf filename.");
  if (Number(req.get("content-length")) > MAX_PDF_BYTES) {
    throw new HttpError(413, `PDF files can be at most ${Math.round(MAX_PDF_BYTES / 1024 / 1024)} MB.`);
  }
  const upload = importantQuestionsFileBucket.openUploadStream(name, {
    metadata: { contentType: "application/pdf" },
  });
  let received = 0;
  await new Promise((resolve, reject) => {
    req.on("data", (chunk) => {
      received += chunk.length;
      if (received > MAX_PDF_BYTES) {
        req.unpipe(upload);
        upload.abort().catch(() => {});
        reject(new HttpError(413, `PDF files can be at most ${Math.round(MAX_PDF_BYTES / 1024 / 1024)} MB.`));
      }
    });
    req.on("error", reject);
    req.pipe(upload).on("error", reject).on("finish", resolve);
  });
  res.status(201).json({ id: String(upload.id), name, contentType: "application/pdf" });
}));

app.get("/api/important-question-files/:id", wrap(async (req, res) => {
  if (!OBJECT_ID.test(req.params.id)) throw new HttpError(404, "Important Questions PDF not found.");
  const id = new mongoose.Types.ObjectId(req.params.id);
  const [file] = await importantQuestionsFileBucket.find({ _id: id }).toArray();
  if (!file) throw new HttpError(404, "Important Questions PDF not found.");
  const filename = encodeURIComponent(path.basename(file.filename || "important-questions.pdf"));
  res.set({
    "Content-Type": "application/pdf",
    "Content-Length": file.length,
    "Content-Disposition": `${req.query.download === "1" ? "attachment" : "inline"}; filename*=UTF-8''${filename}`,
    "X-Content-Type-Options": "nosniff",
  });
  importantQuestionsFileBucket.openDownloadStream(id).on("error", (error) => res.destroy(error)).pipe(res);
}));

app.delete("/api/important-question-files/:id", wrap(async (req, res) => {
  if (!OBJECT_ID.test(req.params.id)) throw new HttpError(404, "Important Questions PDF not found.");
  await deleteImportantQuestionsFile(req.params.id);
  res.json({ ok: true });
}));

// ----- Tools -----
app.get("/api/tools", wrap(async (req, res) => {
  res.json(await Tool.find().sort({ createdAt: -1 }));
}));

app.post("/api/tools", wrap(async (req, res) => {
  res.status(201).json(await Tool.create(parseTool(req.body)));
}));

app.put("/api/tools/:id", wrap(async (req, res) => {
  if (!OBJECT_ID.test(req.params.id)) throw new HttpError(404, "Tool not found.");
  const updated = await Tool.findByIdAndUpdate(req.params.id, parseTool(req.body), {
    new: true,
    runValidators: true,
  });
  if (!updated) throw new HttpError(404, "Tool not found.");
  res.json(updated);
}));

app.delete("/api/tools/:id", wrap(async (req, res) => {
  const deleted = OBJECT_ID.test(req.params.id) ? await Tool.findByIdAndDelete(req.params.id) : null;
  if (!deleted) throw new HttpError(404, "Tool not found.");
  res.json({ ok: true });
}));

// ----- Resources -----
app.get("/api/resources", wrap(async (req, res) => {
  res.json(await Resource.find().sort({ createdAt: -1 }));
}));

app.post("/api/resources", wrap(async (req, res) => {
  res.status(201).json(await Resource.create(parseResource(req.body)));
}));

app.put("/api/resources/:id", wrap(async (req, res) => {
  if (!OBJECT_ID.test(req.params.id)) throw new HttpError(404, "Resource not found.");
  const updated = await Resource.findByIdAndUpdate(req.params.id, parseResource(req.body), {
    new: true,
    runValidators: true,
  });
  if (!updated) throw new HttpError(404, "Resource not found.");
  res.json(updated);
}));

app.delete("/api/resources/:id", wrap(async (req, res) => {
  const resource = OBJECT_ID.test(req.params.id) ? await Resource.findById(req.params.id) : null;
  if (!resource) throw new HttpError(404, "Resource not found.");
  if (resource.file) await deleteResourceFile(resource.file.id);
  await resource.deleteOne();
  res.json({ ok: true });
}));

app.post("/api/resource-files", wrap(async (req, res) => {
  const type = req.get("Content-Type") || "";
  if (type !== "application/pdf" && !type.startsWith("image/")) {
    throw new HttpError(400, "Only PDF documents and images can be attached to a resource.");
  }
  if (Number(req.get("content-length")) > MAX_VIDEO_BYTES) {
    throw new HttpError(413, `Resource files can be at most ${Math.round(MAX_VIDEO_BYTES / 1024 / 1024)} MB.`);
  }
  let requestedName = req.get("X-Resource-File-Name") || "";
  try {
    requestedName = decodeURIComponent(requestedName);
  } catch (error) {
    throw new HttpError(400, "The resource file name is invalid.");
  }
  requestedName = requestedName.replace(/\\/g, "/");
  const name = path.basename(requestedName).replace(/[\r\n"]/g, "").slice(0, 200) || `resource-file-${Date.now()}`;
  const upload = resourceFileBucket.openUploadStream(name, { metadata: { contentType: type } });
  let received = 0;
  await new Promise((resolve, reject) => {
    req.on("data", (chunk) => {
      received += chunk.length;
      if (received > MAX_VIDEO_BYTES) {
        req.unpipe(upload);
        upload.abort().catch(() => {});
        reject(new HttpError(413, `Resource files can be at most ${Math.round(MAX_VIDEO_BYTES / 1024 / 1024)} MB.`));
      }
    });
    req.on("error", reject);
    req.pipe(upload).on("error", reject).on("finish", resolve);
  });
  res.status(201).json({ id: String(upload.id), name, contentType: type });
}));

app.get("/api/resource-files/:id", wrap(async (req, res) => {
  if (!OBJECT_ID.test(req.params.id)) throw new HttpError(404, "Resource file not found.");
  const id = new mongoose.Types.ObjectId(req.params.id);
  const [file] = await resourceFileBucket.find({ _id: id }).toArray();
  if (!file) throw new HttpError(404, "Resource file not found.");
  const filename = encodeURIComponent(path.basename(file.filename || "resource-file"));
  res.set({
    "Content-Type": (file.metadata && file.metadata.contentType) || "application/octet-stream",
    "Content-Length": file.length,
    "Content-Disposition": `inline; filename*=UTF-8''${filename}`,
  });
  resourceFileBucket.openDownloadStream(id).on("error", (error) => res.destroy(error)).pipe(res);
}));

app.delete("/api/resource-files/:id", wrap(async (req, res) => {
  if (!OBJECT_ID.test(req.params.id)) throw new HttpError(404, "Resource file not found.");
  await deleteResourceFile(req.params.id);
  res.json({ ok: true });
}));

// ----- Profile (ID card) -----
app.get("/api/profile/header", wrap(async (req, res) => {
  const profile = await Profile.findOne({ key: "main" })
    .select("name roll section branch assistantProfessor githubRepo photo logo updatedAt")
    .lean();
  if (!profile) {
    res.set("Cache-Control", "no-store");
    res.json({});
    return;
  }
  const photoVersion = profile.photo ? createHash("sha256").update(profile.photo).digest("hex").slice(0, 16) : "";
  const logoVersion = profile.logo ? createHash("sha256").update(profile.logo).digest("hex").slice(0, 16) : "";
  res.set("Cache-Control", "no-store");
  res.json({
    name: profile.name || "",
    roll: profile.roll || "",
    section: profile.section || "",
    branch: profile.branch || "",
    assistantProfessor: profile.assistantProfessor || "",
    githubRepo: profile.githubRepo || "",
    photoUrl: photoVersion ? `/api/profile/assets/${photoVersion}/photo` : "",
    logoUrl: logoVersion ? `/api/profile/assets/${logoVersion}/logo` : "",
  });
}));

app.get("/api/profile/assets/:version/:asset", wrap(async (req, res) => {
  const assetField = req.params.asset === "photo" ? "photo" : req.params.asset === "logo" ? "logo" : null;
  if (!assetField || !/^[a-f\d]{16}$/.test(req.params.version)) {
    throw new HttpError(404, "Profile image not found.");
  }
  const profile = await Profile.findOne({ key: "main" }).select(assetField).lean();
  const imageData = profile && profile[assetField];
  const currentVersion = imageData ? createHash("sha256").update(imageData).digest("hex").slice(0, 16) : "";
  if (!profile || currentVersion !== req.params.version) {
    throw new HttpError(404, "Profile image not found.");
  }
  const match = new RegExp(`^data:(image/[A-Za-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$`).exec(imageData);
  if (!match) throw new HttpError(404, "Profile image not found.");
  const image = Buffer.from(match[2], "base64");
  res.set({
    "Cache-Control": "private, max-age=31536000, immutable",
    "Content-Type": match[1],
    "Content-Length": image.length,
    "X-Content-Type-Options": "nosniff",
  });
  res.send(image);
}));

app.get("/api/profile", wrap(async (req, res) => {
  const profile = await Profile.findOne({ key: "main" });
  res.json(profile ? profile.toJSON() : {});
}));

app.put("/api/profile", wrap(async (req, res) => {
  const profile = await Profile.findOneAndUpdate({ key: "main" }, parseProfile(req.body), {
    new: true,
    upsert: true,
    setDefaultsOnInsert: true,
    runValidators: true,
  });
  res.json(profile);
}));

app.put("/api/profile/logo", wrap(async (req, res) => {
  const logo = optionalImage(req.body && req.body.logo);
  const profile = await Profile.findOneAndUpdate({ key: "main" }, { logo }, {
    new: true,
    upsert: true,
    setDefaultsOnInsert: true,
  });
  res.json({ logo: profile.logo });
}));

// ----- Videos (streamed straight into MongoDB GridFS) -----
app.post("/api/videos", wrap(async (req, res) => {
  const type = req.get("X-Video-Type") || "";
  if (!type.startsWith("video/")) throw new HttpError(400, "Only video files can be uploaded.");
  if (Number(req.get("content-length")) > MAX_VIDEO_BYTES) {
    throw new HttpError(413, `Videos can be at most ${Math.round(MAX_VIDEO_BYTES / 1024 / 1024)} MB.`);
  }

  const upload = videoBucket.openUploadStream(`video-${Date.now()}`, { metadata: { contentType: type } });
  let received = 0;
  await new Promise((resolve, reject) => {
    req.on("data", (chunk) => {
      received += chunk.length;
      if (received > MAX_VIDEO_BYTES) {
        req.unpipe(upload);
        upload.abort().catch(() => {});
        reject(new HttpError(413, `Videos can be at most ${Math.round(MAX_VIDEO_BYTES / 1024 / 1024)} MB.`));
      }
    });
    req.on("error", reject);
    req.pipe(upload).on("error", reject).on("finish", resolve);
  });
  res.status(201).json({ id: String(upload.id) });
}));

app.get("/api/videos/:id", wrap(async (req, res) => {
  if (!OBJECT_ID.test(req.params.id)) throw new HttpError(404, "Video not found");
  const id = new mongoose.Types.ObjectId(req.params.id);
  const [file] = await videoBucket.find({ _id: id }).toArray();
  if (!file) throw new HttpError(404, "Video not found");

  let start = 0, end = file.length - 1, status = 200;
  const range = req.get("Range");
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (!match || file.length === 0 || (!match[1] && !match[2])) {
      res.set("Content-Range", `bytes */${file.length}`).status(416).end(); return;
    }
    if (!match[1]) {
      const suffix = Number(match[2]);
      if (!Number.isSafeInteger(suffix) || suffix <= 0) { res.set("Content-Range", `bytes */${file.length}`).status(416).end(); return; }
      start = Math.max(0, file.length - suffix);
    } else {
      start = Number(match[1]);
      if (!Number.isSafeInteger(start) || start >= file.length) { res.set("Content-Range", `bytes */${file.length}`).status(416).end(); return; }
    }
    if (match[2]) {
      end = Number(match[2]);
      if (!Number.isSafeInteger(end) || end < start) { res.set("Content-Range", `bytes */${file.length}`).status(416).end(); return; }
      end = Math.min(end, file.length - 1);
    }
    status = 206;
  }
  const headers = {
    "Content-Type": (file.metadata && file.metadata.contentType) || "application/octet-stream",
    "Content-Length": status === 206 ? end - start + 1 : file.length,
    "Accept-Ranges": "bytes",
  };
  if (status === 206) headers["Content-Range"] = `bytes ${start}-${end}/${file.length}`;
  res.status(status).set(headers);
  if (req.method === "HEAD") { res.end(); return; }
  videoBucket.openDownloadStream(id, status === 206 ? { start, end: end + 1 } : undefined)
    .on("error", (error) => res.destroy(error)).pipe(res);
}));

app.delete("/api/videos/:id", wrap(async (req, res) => {
  // Older videos were kept in the browser under non-ObjectId keys; answering 404 lets the page clean those up itself
  if (!OBJECT_ID.test(req.params.id)) throw new HttpError(404, "Video not found");
  await deleteVideoFile(req.params.id);
  res.json({ ok: true });
}));

app.use("/api", (req, res) => res.status(404).json({ error: "Route not found" }));

// ----- Website files -----
// Server files must never be downloadable
app.use((req, res, next) => {
  if (/^\/(?:server\.js|package(?:-lock)?\.json|node_modules|\.|README-login\.txt)/i.test(req.path)) return res.status(404).end();
  next();
});

// Pages need a session. Not signed in -> login page. Signed in -> the page, with the permission helper added.
const AUTH_INJECT = '<link rel="stylesheet" href="/auth.css?v=20261022-header"><script src="/auth.js?v=20261022-header"></script>';
function sendPage(req, res, next, fileName) {
  const session = sessionFromRequest(req);
  if (fileName === "login.html") {
    res.set("Cache-Control", "no-store");
    return res.sendFile(path.join(__dirname, "login.html"));
  }
  // No sign-in needed to open pages: visitors without a session simply get the view-only site.
  fs.readFile(path.join(__dirname, fileName), "utf8", (error, html) => {
    if (error) return next();
    res.set("Cache-Control", "no-store");
    res.type("html").send(html.includes("</head>") ? html.replace("</head>", `${AUTH_INJECT}</head>`) : AUTH_INJECT + html);
  });
}
app.use((req, res, next) => {
  if (req.method !== "GET" && req.method !== "HEAD") return next();
  const page = req.path === "/" ? "/home.html" : req.path;
  if (!/^\/[A-Za-z0-9_.-]+\.html$/.test(page)) return next();
  if (!fs.existsSync(path.join(__dirname, page.slice(1)))) return next();
  return sendPage(req, res, next, page.slice(1));
});
app.use(express.static(__dirname, { index: false }));
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  if (req.accepts("html")) return sendPage(req, res, next, "home.html");
  return next();
});

// ----- Errors -----
app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (error.type === "entity.too.large") error = new HttpError(413, "That request is too large. Try smaller images.");
  if (error.type === "entity.parse.failed") error = new HttpError(400, "The request body is not valid JSON.");
  if (error.name === "ValidationError" || error.name === "CastError") error = new HttpError(400, error.message);
  if (error instanceof HttpError) return res.status(error.status).json({ error: error.message });
  console.error(error);
  res.status(500).json({ error: "Something went wrong on the server." });
});

// ---------- Start ----------
async function start() {
  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
  videoBucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: "videos" });
  moduleFileBucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: "moduleFiles" });
  importantQuestionsFileBucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: "importantQuestionFiles" });
  resourceFileBucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: "resourceFiles" });
  app.listen(PORT, () => console.log(`DS Lab running at http://localhost:${PORT}`));
}

start().catch((error) => {
  console.error("Could not start the server:", error.message);
  console.error("Check that MongoDB is running and MONGODB_URI in your .env file is correct.");
  process.exit(1);
});