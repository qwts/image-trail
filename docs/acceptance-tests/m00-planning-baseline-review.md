# M00 Planning Baseline Review

## Purpose

This checklist is the completion gate for M00. It verifies that the planning artifacts are specific enough for later milestones to implement parity without rediscovering bookmarklet behavior.

## Preconditions

- Review the reference bookmarklet source at `deprecated/bookmarklet/image-url-token-editor.bookmarklet.src/image-url-token-editor.bookmarklet.src.js`.
- Review the M00 story at `docs/user-stories/m00-planning-baseline-and-bookmarklet-behavior-map.md`.
- Review these M00 primary artifacts:
  - `docs/bookmarklet-behavior-map.md`
  - `docs/extension-port-acceptance-baseline.md`
  - `extension/src/test-fixtures/urls.ts`
  - `extension/src/test-fixtures/sample-history.json`

## Manual Review Steps

1. Confirm each observable bookmarklet feature area has a row or section in `docs/bookmarklet-behavior-map.md`.
2. Confirm each feature area has a classification of `port`, `refactor`, `replace storage`, `new extension work`, or `defer`.
3. Confirm each feature area names an extension destination layer and milestone owner.
4. Confirm first-slice acceptance is defined in `docs/extension-port-acceptance-baseline.md` and separates included work from explicit deferrals.
5. Confirm URL fixtures cover numeric paths, hex fields, query fields, encoded slashes, HTML entities, query-like paths, hashes, width preservation, no-numeric URLs, malformed decode fallback, and rebuild round trips.
6. Confirm history fixtures cover runtime history, bookmarks, thumbnails, downloaded state, failed loads, cross-origin URLs, hex URLs, query-only URLs, visible-window boundary behavior, and legacy compatibility fields.
7. Confirm architecture boundaries are written as enforceable rules for `core/`, `data/`, `content/`, `background/`, and `ui/`.

## Pass Criteria

- No major bookmarklet workflow remains unclassified.
- Every later milestone can trace at least one acceptance criterion back to the behavior map, acceptance baseline, proposed file structure, or fixtures.
- Any excluded behavior is named as a deferral with a first eligible milestone or explicit non-scope decision.
- Fixture requirements are concrete enough for M03 parser tests and M05 history/bookmark repository tests.

## M00 Completion Notes

- The initial fixture set is checked in at `extension/src/test-fixtures/urls.ts` and `extension/src/test-fixtures/sample-history.json`.
- Acceptance tests remain manual markdown until the MV3 shell and browser automation harness exist.
- The planning gate does not implement extension runtime code; it locks the behavior map, acceptance baseline, and fixture coverage needed by M01 and later milestones.
