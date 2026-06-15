# M05: Runtime History And Bookmarks Parity

**Order:** 5  
**Type:** Port / replace storage

---

## User Story

As a user, I want recent image activity and bookmarks to survive normal browsing workflows without losing the behavior I already have in the bookmarklet.

## Source Context

This milestone ports runtime history and favorites/bookmarks into the extension model, replacing the old large localStorage blob with runtime state plus encrypted durable IndexedDB records.

---

## Scope

- Add runtime-visible history for recent active-session items.
- Add encrypted durable history records.
- Add bookmark/favorite current image URL.
- Add bookmark list, load bookmark, remove bookmark, and basic dedupe.
- Preserve display fields: URL, title, label, thumbnail reference when available, timestamp, and downloaded/captured metadata placeholders.
- Add bounded visible history behavior.
- Add delete/remove actions and session undo for accidental UI actions.
- Keep favorites naming compatibility for imported bookmarklet data while using `bookmarks` in new code.

## Out Of Scope

- Stored original image bytes.
- Cross-origin capture permission flow.
- Full encrypted-history search.
- Import/export files.
- LLM metadata.
- Advanced batch selection unless required for baseline parity.

## Exit Criteria

- Loading/navigating an image adds a runtime history item.
- Recent runtime history is visible without decrypt/recall during active use.
- Durable history and bookmarks are stored through encrypted repository boundaries.
- Bookmark, load, remove, and basic dedupe work.
- The active visible history list is bounded.
- Delete/remove behavior does not orphan obvious related state.

## Primary Modules

- `extension/src/data/runtime/runtime-history.ts`
- `extension/src/data/runtime/undo-stack.ts`
- `extension/src/data/repositories/history-repository.ts`
- `extension/src/data/repositories/bookmarks-repository.ts`
- `extension/src/ui/components/history-view.ts`
- `extension/src/ui/components/bookmarks-view.ts`

---

## Documentation Review Complete

- **Reviewed source context:** Bookmarklet behavior map history/favorites sections, deprecated architecture notes, bugs-and-fixes notes, acceptance baseline M05 parity.
- **Most important build guardrails:** newest-first runtime history, durable encrypted records, bookmark compatibility, thumbnail reference safety, session undo.
- **Acceptance criteria added from review:** history commit rules, bookmark CRUD/dedupe, bounded visible history, storage boundary.
- **Still intentionally out of scope:** stored originals, permission flows, full import/export, LLM metadata, advanced batch selection.

## Acceptance Scenarios

- Successful image loads add newest-first runtime history entries; failed/pending loads do not.
- Visible runtime history is bounded and does not require decrypting older durable records during active use.
- History/bookmark records preserve URL, title, label, thumbnail reference, timestamp, downloaded/captured placeholders, and source compatibility fields.
- Bookmark current URL, load bookmark, remove bookmark, and dedupe by URL work through named actions.
- Durable history/bookmarks are encrypted through repositories; UI never writes storage directly.
- Remove/delete supports session undo and does not leave obvious orphan references.
- Bookmarklet `favorites` terminology is accepted for compatibility while new code uses `bookmarks`.

## Planning Discipline To Apply Before Build

- **Shift-left validation:** confirm contracts, threat model notes, edge cases, and regression checks before implementation begins. Add fixtures or manual checks before wiring broad UI behavior.
- **DRY and explicit interfaces:** centralize repeated schemas, actions, repository calls, status codes, and DOM cleanup primitives rather than copying logic into views.
- **Single responsibility:** keep parser, storage, crypto, target DOM integration, background permissions, and UI rendering in their own bounded modules.
- **React-ready modularity:** views should render from serializable state and dispatch named actions; no view should own parser, crypto, persistence, network governance, or target-image business rules.
- **Change isolation:** volatile browser APIs, storage formats, permission prompts, LLM endpoints, and future React/Vite rendering must sit behind adapters.
- **Secure/testable defaults:** default to least privilege, bounded storage/request behavior, typed validation, and pure core functions that can be tested without DOM, network, or extension APIs.

## Implementation Notes

- Use Runtime Cache plus Repository patterns: active-session list is separate from encrypted durable records.
- Use action reducers for add/remove/bookmark/load so UI remains React-ready.
- Normalize display-label/title creation in a shared formatter to avoid duplication between history and bookmarks.
- Keep thumbnail bytes/references abstract because M06 may move them to blob storage.
- Implement undo as a session command stack, not durable audit history.

## Test Notes

- Load a valid image and verify it appears at top of history.
- Load a 404 and verify it does not appear.
- Bookmark current URL, close/reopen panel or browser, and verify persistence.
- Remove a bookmark/history item and undo within the session.

## Acceptance Criteria Coverage Review

### Missing Before This Planning Pass

- Placeholder sections made the story impossible to execute or verify without rediscovering requirements from the broader docs.
- The story did not explicitly state the reviewed source documents, the module boundaries that must not be crossed, or the framework-adoption constraints.
- The story did not call out the concrete pass/fail acceptance criteria needed to prove history commit rules, bookmark CRUD/dedupe, bounded visible history, storage boundary.
- The story did not explicitly separate stored originals, permission flows, full import/export, LLM metadata, advanced batch selection from the work that should be implemented in this milestone.

### Added In This Planning Pass

- Added a documentation-review completion block tying this story to: Bookmarklet behavior map history/favorites sections, deprecated architecture notes, bugs-and-fixes notes, acceptance baseline M05 parity.
- Added concrete acceptance scenarios for history commit rules, bookmark CRUD/dedupe, bounded visible history, storage boundary.
- Added implementation notes that preserve newest-first runtime history, durable encrypted records, bookmark compatibility, thumbnail reference safety, session undo.
- Added test notes that can be converted into manual regression checks or automated fixtures before integration.
- Added open questions for decisions that remain unresolved but should not block documenting the intended architecture.

### Coverage Status

- All placeholder planning sections for this story are filled.
- The milestone is now traceable from docs to acceptance criteria to implementation patterns and test notes.
- Remaining uncertainty is isolated under **Open Questions** rather than hidden as missing acceptance criteria.

## Open Questions

- Should visible history cap remain bookmarklet-compatible 30 or move to the planned runtime cap around 200 with a visible first-30 window?
- Which downloaded/captured placeholders are required before M06/M07?
