/* Saves the 10 lab experiments (seed/experiments-seed.json) into the Experiments page.

   It logs in as Admin and calls the same API the "Add Experiment" form uses (POST /api/experiments),
   so the server validates and stores everything exactly as if the form had been filled and saved.
   No website file is changed.

   Usage (server running, .env present with ADMIN_USERNAME / ADMIN_PASSWORD):
     node seed-experiments.js                 -> http://localhost:<PORT from .env>
     SEED_URL=https://datalab-pyya.onrender.com ADMIN_USERNAME=... ADMIN_PASSWORD=... node seed-experiments.js
     node seed-experiments.js --dry-run       -> shows what would happen, saves nothing

   If an experiment with the same number already exists it is UPDATED in place (its cover image, video,
   GitHub link, tools and materials are kept); otherwise it is created. Running it twice is safe. */
require("dotenv").config();
const fs = require("node:fs");
const path = require("node:path");

const BASE = String(process.env.SEED_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/+$/, "");
const USER = String(process.env.ADMIN_USERNAME || "").trim();
const PASS = String(process.env.ADMIN_PASSWORD || "").trim();
const DRY = process.argv.includes("--dry-run");
const data = JSON.parse(fs.readFileSync(path.join(__dirname, "seed", "experiments-seed.json"), "utf8"));

let cookie = "";
async function call(method, url, body) {
  const res = await fetch(BASE + url, {
    method,
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const setCookie = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [res.headers.get("set-cookie")].filter(Boolean);
  if (setCookie.length) cookie = setCookie.map((c) => c.split(";")[0]).join("; ");
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${url} -> ${res.status}: ${json.error || "request failed"}`);
  return json;
}

(async () => {
  console.log(`Target: ${BASE}${DRY ? "  (dry run)" : ""}`);
  if (!DRY) {
    if (!USER || !PASS) throw new Error("Set ADMIN_USERNAME and ADMIN_PASSWORD (in .env or the environment) so the script can log in as Admin.");
    await call("POST", "/api/auth/login", { role: "admin", identifier: USER, password: PASS });
  }
  const existing = await call("GET", "/api/experiments");
  const byNumber = new Map(existing.map((e) => [String(e.number), e]));

  for (const payload of data) {
    const old = byNumber.get(String(payload.number));
    if (old) {
      // keep everything the Word files do not contain: media, links, tools, materials
      payload.cover = old.cover || payload.cover;
      payload.video = old.video || payload.video;
      payload.githubUrl = old.githubUrl || payload.githubUrl;
      payload.tools = old.tools && old.tools.length ? old.tools : payload.tools;
      payload.materials = old.materials && old.materials.length ? old.materials : payload.materials;
      const oldSubs = new Map((old.subExperiments || []).map((s) => [String(s.letter).toUpperCase(), s]));
      for (const s of payload.subExperiments) {
        const o = oldSubs.get(String(s.letter).toUpperCase());
        if (!o) continue;
        s.cover = o.cover || s.cover;
        s.video = o.video || s.video;
        s.githubUrl = o.githubUrl || s.githubUrl;
        s.tools = o.tools && o.tools.length ? o.tools : s.tools;
        s.materials = o.materials && o.materials.length ? o.materials : s.materials;
      }
    }
    const label = `Experiment ${payload.number}: ${payload.title}`;
    if (DRY) { console.log(`${old ? "would UPDATE" : "would CREATE"}  ${label}`); continue; }
    if (old) { await call("PUT", `/api/experiments/${old.id}`, payload); console.log(`updated  ${label}`); }
    else { await call("POST", "/api/experiments", payload); console.log(`created  ${label}`); }
  }
  console.log(DRY ? "Dry run finished - nothing was saved." : "Done. Open the Experiments page to see all 10.");
})().catch((error) => { console.error("\nFAILED:", error.message); process.exit(1); });
