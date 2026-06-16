---
name: Milestone Zero Baseline
overview: Complete M00 by producing the behavior map, acceptance baseline, and starter fixtures that define bookmarklet parity and the first extension vertical slice without implementing extension features yet.
todos:
  - id: behavior-map
    content: Create the bookmarklet-to-extension behavior map with feature classifications and destination layers.
    status: pending
  - id: acceptance-baseline
    content: Create the extension port acceptance baseline with first vertical slice, milestone gates, and deferrals.
    status: pending
  - id: url-fixtures
    content: Add representative URL parser/navigation fixture data for later M03 tests.
    status: pending
  - id: history-fixtures
    content: Add representative history/bookmark fixture data for later storage and parity work.
    status: pending
  - id: verify-m00
    content: Check M00 exit criteria against the updated artifacts and keep bookmarklet code untouched.
    status: pending
isProject: false
---

# Milestone 0 Completion Plan

## Objective

Complete M00 from [docs/milestone-user-stories.updated.md](docs/milestone-user-stories.updated.md) by turning the current bookmarklet behavior and extension planning docs into four concrete baseline artifacts:

- [docs/bookmarklet-behavior-map.md](docs/bookmarklet-behavior-map.md)
- [docs/extension-port-acceptance-baseline.md](docs/extension-port-acceptance-baseline.md)
- [extension/src/test-fixtures/urls.ts](extension/src/test-fixtures/urls.ts)
- [extension/src/test-fixtures/sample-history.json](extension/src/test-fixtures/sample-history.json)

This milestone should not change bookmarklet behavior or build extension features. It should make later implementation milestones precise and manually testable.

## Source Material

Use the existing bookmarklet as the canonical behavior reference:

- [deprecated/bookmarklet/image-url-token-editor.bookmarklet.src/image-url-token-editor.bookmarklet.src.js](deprecated/bookmarklet/image-url-token-editor.bookmarklet.src/image-url-token-editor.bookmarklet.src.js)
- [deprecated/bookmarklet/README.md](deprecated/bookmarklet/README.md)
- [deprecated/bookmarklet/docs/architecture-notes.md](deprecated/bookmarklet/docs/architecture-notes.md)
- [deprecated/bookmarklet/docs/bugs-and-fixes.md](deprecated/bookmarklet/docs/bugs-and-fixes.md)

Use the extension planning docs as constraints:

- [docs/milestones.md](docs/milestones.md)
- [docs/proposed-extension-file-structure.md](docs/proposed-extension-file-structure.md)
- [docs/brave-extension-port-plan.md](docs/brave-extension-port-plan.md)
- [docs/acceptance-tests/README.md](docs/acceptance-tests/README.md)

## Implementation Steps

1. Create [docs/bookmarklet-behavior-map.md](docs/bookmarklet-behavior-map.md).

   Document the bookmarklet behavior surface by feature area: URL parsing/rebuilding, editable field model, target image selection, image apply/load/error handling, history, favorites/bookmarks, thumbnails, downloads, automation/404 traversal, keyboard routing, and LLM metadata. For each area, record the current bookmarklet source symbols, the extension destination layer, classification, parity expectation, and known deferrals.

2. Classify each behavior for the extension port.

   Use the M00 classifications from [docs/milestone-user-stories.updated.md](docs/milestone-user-stories.updated.md): `port`, `refactor`, `replace storage`, `new extension work`, or `defer`. Keep storage migration and stored-original capture separate from bookmarklet parity, since those are later extension milestones.

3. Create [docs/extension-port-acceptance-baseline.md](docs/extension-port-acceptance-baseline.md).

   Define the first vertical slice: MV3 action injects a panel, target image can be selected, URL parsing/navigation can update only the selected image, basic typed messaging exists, request throttling is represented, and storage/crypto boundaries are established before durable feature data spreads. Map existing manual acceptance tests in [docs/acceptance-tests/](docs/acceptance-tests/) to the milestones they gate.

4. Add URL regression fixtures in [extension/src/test-fixtures/urls.ts](extension/src/test-fixtures/urls.ts).

   Include representative cases for protocol/host/path tokens, filename numeric tokens, query fields, hash fields, encoded slash paths, HTML entities, decimal and hex fields, width preservation, and query-like path segments. Keep these as data fixtures only, suitable for M03 parser tests later.

5. Add representative history/bookmark fixtures in [extension/src/test-fixtures/sample-history.json](extension/src/test-fixtures/sample-history.json).

   Model current bookmarklet history/favorite shapes while using extension-era naming where appropriate. Include remote-only records, thumbnail-bearing records, downloaded records, selected/focused examples, and metadata-ready fields without adding encrypted storage implementation.

6. Verify M00 exit criteria.

   Confirm that the behavior matrix exists, regression fixtures exist, the first vertical slice is explicit, deferred work is named, and [deprecated/bookmarklet](deprecated/bookmarklet) remains untouched. Run a lightweight read-only check of the resulting docs/fixtures for consistency and obvious formatting issues.

## Boundaries

Do not implement extension runtime code as part of M00. Creating the fixture directory under [extension/src/test-fixtures/](extension/src/test-fixtures/) is acceptable because those files are listed as M00 primary artifacts, but no manifest, service worker, content script, UI, IndexedDB, or parser modules should be built in this milestone.

Do not make the React/Vite decision here. The baseline should preserve the existing direction from [docs/proposed-extension-file-structure.md](docs/proposed-extension-file-structure.md): TypeScript compilation first, plain DOM UI until complexity justifies a later decision.
