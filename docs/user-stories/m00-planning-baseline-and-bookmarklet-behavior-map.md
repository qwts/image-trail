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

## Documentation Review Complete

- **Reviewed source context:** Behavior map, acceptance baseline, proposed file structure, and deprecated bookmarklet notes.
- **Most important build guardrails:** fixtures, parity traceability, explicit deferrals, and architecture-boundary enforcement.
- **Acceptance criteria added from review:** source-to-destination behavior classification and fixture coverage.
- **Still intentionally out of scope:** actual extension implementation, UI framework decisions, and encryption UX beyond assumptions.

## Acceptance Scenarios

- Behavior inventory maps every bookmarklet feature area to a destination layer and classification with no unclassified observable workflow.
- Acceptance baseline names the first vertical slice and explicitly separates included work from deferred work.
- URL and history fixtures cover normal paths, encoded slashes, query-like paths, decimal/hex fields, width preservation, thumbnails, downloaded state, favorites/bookmarks, and malformed decode fallbacks.
- Architecture boundaries are written as enforceable rules for core, data, content, background, and UI modules.
- Every later milestone can trace at least one acceptance criterion back to the behavior map, file-structure plan, or acceptance baseline.

## Planning Discipline To Apply Before Build

- **Shift-left validation:** confirm contracts, threat model notes, edge cases, and regression checks before implementation begins. Add fixtures or manual checks before wiring broad UI behavior.
- **DRY and explicit interfaces:** centralize repeated schemas, actions, repository calls, status codes, and DOM cleanup primitives rather than copying logic into views.
- **Single responsibility:** keep parser, storage, crypto, target DOM integration, background permissions, and UI rendering in their own bounded modules.
- **React-ready modularity:** views should render from serializable state and dispatch named actions; no view should own parser, crypto, persistence, network governance, or target-image business rules.
- **Change isolation:** volatile browser APIs, storage formats, permission prompts, LLM endpoints, and future React/Vite rendering must sit behind adapters.
- **Secure/testable defaults:** default to least privilege, bounded storage/request behavior, typed validation, and pure core functions that can be tested without DOM, network, or extension APIs.

## Implementation Notes

- Treat this story as the planning gate; do not implement extension code here.
- Use Adapter and Ports-and-Adapters boundaries in the documents: bookmarklet symbols are source behavior, extension modules are destination ports.
- Add missing parity notes rather than relying on memory in implementation tickets.
- Record deferrals as explicit product decisions with their first eligible milestone.

## Test Notes

- Review `docs/bookmarklet-behavior-map.md` against the bookmarklet source symbols and confirm no major feature area is omitted.
- Review `docs/extension-port-acceptance-baseline.md` and ensure every first-slice behavior has a manual pass/fail path.
- Verify fixture requirements are specific enough for later automated tests.

## Acceptance Criteria Coverage Review

### Missing Before This Planning Pass

- Placeholder sections made the story impossible to execute or verify without rediscovering requirements from the broader docs.
- The story did not explicitly state the reviewed source documents, the module boundaries that must not be crossed, or the framework-adoption constraints.
- The story did not call out the concrete pass/fail acceptance criteria needed to prove source-to-destination behavior classification and fixture coverage.
- The story did not explicitly separate actual extension implementation, UI framework decisions, and encryption UX beyond assumptions from the work that should be implemented in this milestone.

### Added In This Planning Pass

- Added a documentation-review completion block tying this story to: Behavior map, acceptance baseline, proposed file structure, and deprecated bookmarklet notes.
- Added concrete acceptance scenarios for source-to-destination behavior classification and fixture coverage.
- Added implementation notes that preserve fixtures, parity traceability, explicit deferrals, and architecture-boundary enforcement.
- Added test notes that can be converted into manual regression checks or automated fixtures before integration.
- Added open questions for decisions that remain unresolved but should not block documenting the intended architecture.

### Coverage Status

- All placeholder planning sections for this story are filled.
- The milestone is now traceable from docs to acceptance criteria to implementation patterns and test notes.
- Remaining uncertainty is isolated under **Open Questions** rather than hidden as missing acceptance criteria.

## Open Questions

- Resolved for M00: the initial URL fixture set is checked in at `extension/src/test-fixtures/urls.ts`; later milestones may add cases as parser defects are found.
- Resolved for M00: acceptance tests remain manual markdown until the MV3 shell and browser automation harness exist.
