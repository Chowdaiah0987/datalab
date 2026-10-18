# Experiments module functional fixes — 18 October 2026

## Included fixes
- Main and sub-experiment uploaded videos now support HTTP byte-range requests so browser video players can seek correctly.
- Experiment detail pages embed YouTube and Vimeo URLs and play direct MP4/WebM/OGG URLs as native video. Unsupported external video links show a clear message and an Open URL action.
- Main and sub-experiment material PDF URLs continue to be saved as absolute HTTP(S) links; uploaded PDFs are stored through the existing GridFS API.
- Sub-experiment cover, PDF, and video upload tiles now explicitly open their hidden file inputs.
- Sub-experiment tool choices can be selected and are saved with the sub-experiment; detail and topic pages fall back to the parent experiment's tools when no child-specific tools are selected.
- Removed sub-topic lesson editors are now excluded from the saved payload.
- Main video fields correctly clear a removed URL instead of accidentally retaining the previous video value.
- Topic lesson navigation has a visible error fallback and supports nested child-topic links through the `child` query parameter.
- Updated cache-busting query versions for the changed frontend scripts and stylesheets.

## Validation performed
- `node --check` passed for all JavaScript files in the project.
- HTML parsing passed for all HTML pages.
- All local JavaScript/CSS references from HTML pages resolve to files in the ZIP.
- Live MongoDB/browser end-to-end tests still need to be run in the user's configured environment. No `.env`, `node_modules`, or `server.log` is included.
