# Experiments module – premium redesign

## Root causes fixed
- **Blank topic page**: `experiment-topic.html` / `topic-lesson.html` had an unclosed `<title>` (`…Laboratory">`), so the browser swallowed the entire page as title text.
- **Index-based topic navigation**: server generated `topic-1`, `topic-2` by array position, repeating across levels. IDs are now random, unique per tree, and kept on re-save (`server.js: newTopicId / ensureUniqueTopicIds`). Pages link by ID (`&topic=<id>`); legacy `path=0.1` and topic-number links still resolve.
- **Cover image was mandatory** on the server; now optional everywhere (placeholder shown).
- **Form**: new sub-experiments defaulted to "Contains Sub-topics" with blank rows and could not be saved; blank nested rows now save as a Direct Topic. New topic IDs no longer collide with loaded ones.
- **Admin buttons** were never gated on the front end (`auth.js` is not linked anywhere). Details/form pages now hide `[data-admin-only]` unless `/api/auth/me` says admin. The server remains the authority (403 for non-admins).

## New files
experiments-core.js, experiment-details.js, experiment-lesson.js, python-worker.js, experiments-premium.css, experiment-form-premium.css, experiment-form-ui.js, tests/e2e.js, tests/mock-server.js, tests/runner-plumbing.js
## Modified files
index.html, script.js, server.js, experiment.html, experiment-form.html, experiment-form.js, topic-lesson.html, experiment-topic.html, tests/experiments-navigation-check.js
## Removed
experiment.js, experiment-topic.js (replaced by experiment-details.js / experiment-lesson.js). Old notes moved to docs/archive/.

## Hierarchy rules (experiments-core.js)
Experiment → topics (recursive) | sub-experiments → topics (recursive). A node with children shows them; a leaf opens its lesson; a sub-experiment with no topics but lesson content opens it directly; an experiment with only sub-experiments lists them as its learning entries. Previous/Next walk the tree depth-first. Breadcrumb and Back follow the real parent.

## Code runner
Pyodide (pinned v0.27.7, jsDelivr) in a Web Worker (`python-worker.js`): runs inside the browser sandbox, never in Node; 30 s timeout terminates the worker; stdout/stderr, matplotlib figures and tracebacks are shown. Supported: standard library, NumPy, pandas, SciPy, scikit-learn, Matplotlib, SymPy, Beautiful Soup (from the Pyodide distribution) and seaborn (via micropip). `requests` cannot reach external sites from a browser. If the CDN is unreachable the panel says so. No `eval()`.

## Setup
`npm install`, copy `.env.example` to `.env` (MONGODB_URI, PORT, plus your existing ADMIN_USERNAME / ADMIN_PASSWORD / session secret variables), `npm start`. Deploy to Render as before. Storage: cover images are compressed data URLs in MongoDB; videos and PDFs go to GridFS in MongoDB, so nothing depends on Render's ephemeral disk. Never commit `.env`.

## Tests
`node tests/experiments-navigation-check.js` (structural); front-end tests need Playwright: `node tests/mock-server.js 3100 &`, `node tests/mock-server.js 3101 --guest &`, then `node tests/e2e.js` and `node tests/runner-plumbing.js`.

### Honest test report
PASSED (against the in-memory mock API, headless Chromium): listing search/count/empty state, Exp A/B preview modal (focus, Escape), search kept on reload, cover fallback; details and sub-details; topic with/without children; nested 4-level topic; direct-lesson sub-experiment; legacy `path=` link; missing topic message; six lesson sections; breadcrumbs, Back, Previous/Next; Reset, Clear Output; form create with 2 independent sub-experiments, tool, nested topic, no cover, reload in edit mode; delete; guest sees no admin buttons and gets 403; no console errors; no horizontal overflow at 1366/820/390 px (listing, form, details, lesson).
NOT RUN: real Python execution (sandbox had no internet; only the UI pipeline was tested with a stand-in Pyodide), `server.js` against MongoDB (dependencies could not be installed; server edits are syntax-checked and the ID logic was unit-tested in isolation), real uploads of PDF/video, persistence across a server restart, the real admin login, Safari/Firefox, screen-reader testing. Please run the app against your database before deploying.
