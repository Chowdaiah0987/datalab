# Experiments hierarchy and form fixes

## Correct data hierarchy

- Experiment `1` can contain sub-experiments `1A`, `1B`, `1C`, etc.
- Each sub-experiment owns its own topic list and lesson fields, for example `1A.1`, `1A.2`, `1B.1`.
- Parent-level direct topics are available only when the experiment has no sub-experiments. When child experiments are added, the duplicate parent-level Topics and Topic Lesson Content panels are hidden and parent `topics` are saved as an empty list.
- A sub-experiment must have at least one named topic before saving, so the learner-facing topic page has a valid lesson to open.

## Bugs addressed

- Made Upload File / Use URL radio buttons exclusive for every repeated child PDF and video section.
- Gave each topic's Direct Topic / Contains Sub-topics radios an independent group name.
- Kept topic records that only have a heading; these were previously filtered out, causing child topic pages to be missing after save.
- Fixed topic deletion so removing a row also removes its matching lesson editor and vice versa.
- Fixed existing experiment GitHub URL loading into the edit form.
- Fixed sub-experiment cover upload error feedback so it does not overwrite the GitHub label.
- Normalized older sub-experiment records that have an ID such as `7B` but lack a `letter` field.
- Improved the topic page's missing-topic message so it explains what to fix instead of leaving an apparently blank page.
- Added cache-busting versions to the updated page assets.

## Validation performed

- `node --check` passed for all JavaScript files.
- HTML parsing passed for all HTML files.
- ZIP integrity checked after packaging.

The live MongoDB-backed workflow still needs to be exercised with the deployment's own `.env` and database. Do not include `.env` credentials in the ZIP.
