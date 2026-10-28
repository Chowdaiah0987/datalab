# Data Science Digital Laboratory — Experiments Redesign

## Updated workflow

- `index.html`: redesigned listing styles, search/count toolbar, Add Experiment navigation, and Exp A/B/C preview-popup triggers.
- `experiment-form.html`: new dedicated Add/Edit Experiment page.
- `experiment.html`: redesigned parent/sub-experiment details page.
- `experiment-topic.html`: new topic lesson page with a browser-sandboxed Python runner powered by Pyodide.

## New files

- `experiment-form.html`
- `experiment-form.js`
- `experiment-topic.html`
- `experiment-topic.js`
- `experiments-overhaul.css`
- `.env.example`
- `EXPERIMENTS-REDESIGN-NOTES.md`

## Existing files modified

- `index.html`
- `script.js`
- `shared.js`
- `experiment.html`
- `experiment.js`
- `topic.html` (cache-busting shared script version)
- `server.js` (structured lesson fields and topic storage)

## Backend and storage

The existing Express/Mongoose API is reused. The Experiment and Sub-experiment schemas now accept structured topics with Aim, Syntax, Procedure, Code Sample, Output Sample, Result, topic identifiers, opening mode, PDF URL, GitHub URL, and nested topic data. The existing GridFS upload endpoints are reused for uploaded videos and PDFs. Cover images continue to use the existing compressed data-URL approach.

## Setup

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env` and set your own `MONGODB_URI`, `PORT`, and the existing authentication environment variables required by your deployment.
3. Start with `npm start`.
4. Sign in with an Admin account to create or edit experiments. View-only sessions cannot save changes.

Never commit `.env` or share database credentials. The delivered ZIP intentionally excludes `.env`, `node_modules`, and `server.log`.

## Validation performed

- `node --check` passed for `server.js`, `shared.js`, `script.js`, `experiment.js`, `experiment-form.js`, and `experiment-topic.js`.
- The updated HTML files passed Python's HTMLParser check.
- Local stylesheet brace counts were balanced and local asset references in the new pages were checked.

## Not verified in this workspace

A live MongoDB connection, authenticated upload/save operations, deployment persistence, and browser-level end-to-end interactions were not verified because this workspace did not have the project's runtime credentials or a reachable configured MongoDB service. Please run the app against your configured database and test the workflow before redeploying.
