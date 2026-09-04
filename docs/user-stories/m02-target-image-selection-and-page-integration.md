# M02: Target Image Selection And Page Integration

**Order:** 2  
**Type:** Port / adapt

---

## User Story

As a user, I want the extension to select the only image automatically or let me manually pick one so actions affect the intended image only.

## Source Context

This milestone ports target image detection, manual picking, image application hooks, preview styling, DOM observation, and cleanup behavior.

---

## Scope

- Auto-select exactly one qualifying image when appropriate.
- Add manual target-pick mode with visible hover/selection indication.
- Track the selected target image through a page adapter.
- Apply the persisted preview styling on auto-select, with fullscreen preview as the default and an explicit host-image page-layout toggle.
- Restore original image/page styles on close or target change.
- Observe late-loaded images during target-pick mode.
- Preserve previous target state enough to recover from failed operations.

## Out Of Scope

- Full URL field editor.
- Durable history persistence.
- Original image capture.
- Full automation.

## Exit Criteria

- On a page with exactly one qualifying image, the extension selects it automatically.
- On a page with multiple images, the user can select the intended target manually.
- Target selection is visually clear.
- Closing the panel restores extension-owned styling.
- Late-added images can be selected during pick mode.
- No extension action mutates unrelated page images.

## Primary Modules

- `extension/src/content/target-image.ts`
- `extension/src/content/page-adapter.ts`
- `extension/src/content/page-style.ts`
- `extension/src/content/dom-observer.ts`
- `extension/src/ui/components/target-picker-view.ts`
- `extension/src/ui/components/status-view.ts`

---

## Documentation Review Complete

- **Reviewed source context:** Bookmarklet behavior map target selection section, target-picker plan, acceptance baseline M02 tests.
- **Most important build guardrails:** single-image autodetect, manual pick mode, listener/style restoration, mutation observer cleanup.
- **Acceptance criteria added from review:** exact image-selection rules, style cleanup, navigation suppression, target recovery.
- **Still intentionally out of scope:** URL editing, durable history, original capture, and automation.

## Acceptance Scenarios

- Exactly one qualifying visible image is selected automatically at injection time; zero or multiple candidates require manual pick.
- Single-image auto-select applies the persisted preview layout without a transient first-open size jump; the user can toggle page layout or change object-fit mode.
- Candidate selection honors bookmarklet URL precedence (`currentSrc`, `src` attr, `src`, `data-src`, `data-original`) and visibility/score rules.
- Pick mode shows crosshair/hover/selected indicators, suppresses accidental link navigation, and exits after a successful pick.
- Switching targets restores previous target styles/listeners before marking the new target.
- MutationObserver keeps pick-mode bindings current for late-added images and disconnects on close.
- Only the selected image is mutated; unrelated images retain original attributes/styles.
- Panel close restores page/image styles owned by the extension, including selected/hover attributes.

## Planning Discipline To Apply Before Build

- **Shift-left validation:** confirm contracts, threat model notes, edge cases, and regression checks before implementation begins. Add fixtures or manual checks before wiring broad UI behavior.
- **DRY and explicit interfaces:** centralize repeated schemas, actions, repository calls, status codes, and DOM cleanup primitives rather than copying logic into views.
- **Single responsibility:** keep parser, storage, crypto, target DOM integration, background permissions, and UI rendering in their own bounded modules.
- **React-ready modularity:** views should render from serializable state and dispatch named actions; no view should own parser, crypto, persistence, network governance, or target-image business rules.
- **Change isolation:** volatile browser APIs, storage formats, permission prompts, LLM endpoints, and future React/Vite rendering must sit behind adapters.
- **Secure/testable defaults:** default to least privilege, bounded storage/request behavior, typed validation, and pure core functions that can be tested without DOM, network, or extension APIs.

## Implementation Notes

- Use Page Adapter and Resource Handle patterns: target image references are opaque handles managed by content code, not stored directly in core state.
- Centralize style snapshot/restore in `page-style.ts`; never scatter direct style mutations through UI components.
- Use an Observer pattern for late images with a debounced refresh to avoid layout thrash.
- Expose target status as serializable state so React can later render indicators without owning DOM selection logic.
- Make target selection fail closed when image URL is absent or the element disconnects.

## Test Notes

- Manual page with one image: auto-selected and status names target URL; fullscreen preview applies without a first-open jump, object-fit can be changed, and page layout can be toggled intentionally.
- Manual page with multiple images: pick target and verify only that image changes indicator.
- Add an image dynamically during pick mode and verify it can be selected.
- Close panel and verify styles/listeners/attributes are removed.

## Acceptance Criteria Coverage Review

### Missing Before This Planning Pass

- Placeholder sections made the story impossible to execute or verify without rediscovering requirements from the broader docs.
- The story did not explicitly state the reviewed source documents, the module boundaries that must not be crossed, or the framework-adoption constraints.
- The story did not call out the concrete pass/fail acceptance criteria needed to prove exact image-selection rules, style cleanup, navigation suppression, target recovery.
- The story did not explicitly separate URL editing, durable history, original capture, and automation from the work that should be implemented in this milestone.

### Added In This Planning Pass

- Added a documentation-review completion block tying this story to: Bookmarklet behavior map target selection section, target-picker plan, acceptance baseline M02 tests.
- Added concrete acceptance scenarios for exact image-selection rules, style cleanup, navigation suppression, target recovery.
- Added implementation notes that preserve single-image autodetect, manual pick mode, listener/style restoration, mutation observer cleanup.
- Added test notes that can be converted into manual regression checks or automated fixtures before integration.
- Added open questions for decisions that remain unresolved but should not block documenting the intended architecture.

### Coverage Status

- All placeholder planning sections for this story are filled.
- The milestone is now traceable from docs to acceptance criteria to implementation patterns and test notes.
- Remaining uncertainty is isolated under **Open Questions** rather than hidden as missing acceptance criteria.

## Open Questions

- Should Shift+click-to-history parity land here or wait for M05 history UI?
- How much structural selector recovery is required before dynamic-page support is considered acceptable?
