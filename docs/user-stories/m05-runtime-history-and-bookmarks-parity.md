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

## Acceptance Scenarios

TBD

## Implementation Notes

TBD

## Test Notes

TBD

## Open Questions

TBD
