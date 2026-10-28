# Experiments recursive hierarchy fixes

## Hierarchy supported
- Experiment may contain direct lesson topics, or child experiments such as 1A and 1B.
- Each topic may be a Direct Topic or contain sub-topics.
- Child topics can themselves contain sub-topics, allowing 1A -> 1A.1 -> 1A.1.1 and deeper levels.
- Direct child experiments without topic children have an Open Topic Lesson action.

## Fixes
- Fixed a ReferenceError in the topic lesson heading that could render a blank page.
- Added recursive topic/sub-topic editors and recursive save/normalize behavior.
- Added path-based lesson URLs for arbitrary nested levels while retaining old `topic`/`child` URL compatibility.
- Fixed child cover-image status handling and added upload status output.
- Added nested-vs-direct validation to avoid silently saving child topics under a direct topic.
- Preserved sub-experiment `openAs` in the backend schema.
- Added cache-busting versions to the updated page assets.

## Verification
JavaScript syntax checks and ZIP integrity checks are run during packaging. MongoDB-backed browser interactions must still be tested against the user's configured environment.
