# Experiments topic fallback and blank lesson fix

## Changes
- If a parent experiment has no direct topics but does have sub-experiments, its Topics section now lists the sub-experiments as the available topic choices. Selecting one opens that sub-experiment detail page so its own topics and nested sub-topics remain available.
- Avoided rendering the same sub-experiment list twice when it is being used as the fallback topic list.
- Expanded topic normalization to support `heading`, `title`, and `name`, legacy `d2Topics`, and `subTopics` arrays.
- Hardened path lookup and topic-number rendering for nested lesson URLs such as `?id=...&sub=B&path=0`.
- If an older saved sub-experiment has no topic array but a path URL is opened, it falls back to a direct lesson instead of leaving the page empty.
- Added visible runtime and unhandled-rejection errors to the topic page, with a Back to Experiments link, to prevent silent blank pages.
- Updated cache-busting query versions in `experiment.html` and `experiment-topic.html`.

## Test status
- `node --check` passed for project JavaScript files.
- HTML parsing and ZIP integrity checks passed.
- Live MongoDB/browser end-to-end behavior still needs verification in the user's configured environment.
