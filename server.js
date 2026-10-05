// Use public DNS so mongodb+srv:// addresses resolve on networks where Node's default DNS fails
require("node:dns").setServers(["8.8.8.8", "1.1.1.1"]);
require("dotenv").config();
const path = require("path");
const cors = require("cors");
const express = require("express");
const mongoose = require("mongoose");

const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/dslab";
const MAX_VIDEO_BYTES = (Number(process.env.MAX_VIDEO_MB) || 300) * 1024 * 1024;
const OBJECT_ID = /^[a-f\d]{24}$/i;

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
}, { _id: false });

const subExperimentSchema = new Schema({
  id: { type: String, required: true },
  letter: { type: String, required: true },
  title: { type: String, required: true },
  shortDescription: { type: String, required: true },
  d2Heading: { type: String, default: "" },
  d2Content: { type: String, default: "" },
  d2Topics: { type: [d2TopicSchema], default: [] },
  cover: { type: String, default: "" },
  video: { type: String, default: "" },
  githubUrl: { type: String, default: "" },
  completed: { type: Boolean, default: true },
}, { _id: false, id: false });

const experimentSchema = new Schema({
  number: { type: String, required: true },
  title: { type: String, required: true },
  shortDescription: { type: String, required: true },
  d2Heading: { type: String, default: "" },
  d2Content: { type: String, default: "" },
  d2Topics: { type: [d2TopicSchema], default: [] },
  cover: { type: String, required: true },
  video: { type: String, default: "" },
  githubUrl: { type: String, default: "" },
  subExperiments: { type: [subExperimentSchema], default: [] },
}, { timestamps: true });

experimentSchema.set("toJSON", {
  transform(doc, ret) {
    ret.id = String(ret._id);
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

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
}, { timestamps: true });

profileSchema.set("toJSON", {
  transform(doc, ret) {
    ["_id", "__v", "key", "createdAt", "updatedAt"].forEach((field) => delete ret[field]);
    return ret;
  },
});

const Experiment = mongoose.model("Experiment", experimentSchema);
const Profile = mongoose.model("Profile", profileSchema);
let videoBucket; // GridFS bucket for uploaded videos, created after connecting

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

function normalizeD2Topic(topic, index = 0) {
  const safe = topic && typeof topic === "object" ? topic : {};
  const type = safe.type === "code" ? "code" : "text";
  const heading = String(safe.heading || "");
  return {
    id: String(safe.id || `topic-${index + 1}`),
    heading: safe.id === "legacy-topic-1" && heading.trim().toLowerCase() === "details" ? "" : heading,
    type,
    content: type === "text" ? String(safe.content ?? safe.text ?? "") : "",
    language: String(safe.language || "python"),
    code: String(safe.code ?? ""),
    sampleOutput: String(safe.sampleOutput ?? ""),
    order: Number.isFinite(Number(safe.order)) ? Number(safe.order) : index + 1,
  };
}

function normalizeD2Topics(rawTopics, legacyText = "") {
  const list = Array.isArray(rawTopics) ? rawTopics : [];
  if (list.length) {
    return list
      .map((topic, index) => normalizeD2Topic(topic, index))
      .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
  }

  const plainText = text(legacyText);
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

function formatD2Data(d2Heading, rawTopics, legacyText) {
  const topics = normalizeD2Topics(rawTopics, legacyText);
  return {
    d2Heading: text(d2Heading),
    d2Content: serializeD2Topics(topics),
    d2Topics: topics,
  };
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
    d2Topics: d2.d2Topics,
    cover: optionalImage(sub.cover),
    video: text(sub.video),
    githubUrl: optionalGithub(sub.githubUrl),
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
    d2Topics: d2.d2Topics,
    cover: requireText(optionalImage(body.cover), "A cover image is required."),
    video: text(body.video),
    githubUrl: optionalGithub(body.githubUrl),
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
  };
}

// ---------- Video helpers (GridFS) ----------
async function deleteVideoFile(id) {
  if (!OBJECT_ID.test(id || "")) return;
  try {
    await videoBucket.delete(new mongoose.Types.ObjectId(id));
  } catch (error) {
    if (!/FileNotFound|no file with id/i.test(String(error.message))) throw error;
  }
}

// ---------- App ----------
const app = express();
const wrap = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

const configuredCorsOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(",").map((origin) => origin.trim()).filter(Boolean)
  : null;
app.use(cors({
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

// ----- Experiments -----
app.get("/api/experiments", wrap(async (req, res) => {
  res.json(await Experiment.find().sort({ createdAt: 1 }));
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

// ----- Profile (ID card) -----
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

  res.set({
    "Content-Type": (file.metadata && file.metadata.contentType) || "application/octet-stream",
    "Content-Length": file.length,
  });
  videoBucket.openDownloadStream(id).on("error", (error) => res.destroy(error)).pipe(res);
}));

app.delete("/api/videos/:id", wrap(async (req, res) => {
  // Older videos were kept in the browser under non-ObjectId keys; answering 404 lets the page clean those up itself
  if (!OBJECT_ID.test(req.params.id)) throw new HttpError(404, "Video not found");
  await deleteVideoFile(req.params.id);
  res.json({ ok: true });
}));

app.use("/api", (req, res) => res.status(404).json({ error: "Route not found" }));

// ----- Website files -----
app.use(express.static(__dirname));
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  if (req.accepts("html")) return res.sendFile(path.join(__dirname, "index.html"));
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
  app.listen(PORT, () => console.log(`DS Lab running at http://localhost:${PORT}`));
}

start().catch((error) => {
  console.error("Could not start the server:", error.message);
  console.error("Check that MongoDB is running and MONGODB_URI in your .env file is correct.");
  process.exit(1);
});