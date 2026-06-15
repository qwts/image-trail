# M00: Planning Baseline And Bookmarklet Behavior Map

**Order:** 0  
**Type:** Planning / parity map

---

## User Story

As a developer, I want a clear map from existing bookmarklet behavior to the extension architecture so the port preserves important workflows instead of accidentally rebuilding or dropping them.

## Source Context

This milestone defines implementation boundaries, regression fixtures, and the first acceptance-test baseline before new extension code expands.

---

## Scope

- Inventory bookmarklet behavior by feature area: URL parser, field model, target image control, history, favorites/bookmarks, thumbnails, downloads, automation, keybindings, and LLM metadata.
- Classify each feature as `port`, `refactor`, `replace storage`, `new extension work`, or `defer`.
- Define representative URL fixtures and image-page scenarios.
- Identify architecture mapping into `background/`, `content/`, `core/`, `data/`, and `ui/`.
- Define the first vertical slice acceptance criteria.

## Out Of Scope

- New feature implementation.
- Encryption UI design beyond interface assumptions.
- React/Vite decision.

## Exit Criteria

- A bookmarklet-to-extension behavior matrix exists.
- Regression fixtures exist for representative URL patterns.
- The first vertical slice is explicitly defined.
- Deferred work is named instead of left implicit.

## Primary Artifacts

- `docs/bookmarklet-behavior-map.md`
- `docs/extension-port-acceptance-baseline.md`
- `extension/src/test-fixtures/urls.ts`
- `extension/src/test-fixtures/sample-history.json`

---

## Acceptance Scenarios

TBD

## Implementation Notes

TBD

## Test Notes

TBD

## Open Questions

TBD
