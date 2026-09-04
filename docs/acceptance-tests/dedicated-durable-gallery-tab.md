# Dedicated Durable Gallery Tab

Purpose: verify that the Gallery is a dedicated view over durable queue records that renders in a bounded, paged grid without exposing locked/private record metadata or disturbing Recents, Recall, albums, or encrypted-original semantics.

## Product Rules

- The Gallery renders durable pins/bookmarks/captures (not Recents) in a bounded page.
- Paging requests are bounded windows; a total of zero is distinct from an empty durable library.
- Locked private records render disabled without exposing metadata.
- Privacy mode masks unlocked thumbnails and URL-derived metadata.
- Search input and clear control dispatch query changes without mutating durable state.
- The limit form treats zero as unlimited.
- Album controls create, rename, select, and delete albums; per-card album choices remain independent.
- The selected-album status reports missing durable records without breaking the view.
- Opening the Gallery and interacting with it must not change Recents, queue ordering, Recall paging, or encrypted original bytes.

## Manual Scenario

1. Load the built extension and pin/capture several durable records in more than one context.
2. Open the Gallery from the queue menu and verify the durable records render in a bounded grid.
3. Page forward and back and verify each request is a bounded window and queue order is preserved.
4. Confirm the library-empty and loading/error states are distinct and semantic.
5. Lock a private record and verify it appears disabled with no metadata exposed.
6. Enable privacy mode and verify unlocked thumbnails and URL-derived labels are masked.
7. Type into the search box and clear it; verify queries dispatch and results follow.
8. Set the limit to zero and verify it is treated as unlimited.
9. Create and rename an album, add records to it, and verify the selected-album view reports any missing durable records.
10. Verify Recents, Recall ordering, visible queue order, and stored-original indicators did not change during any Gallery interaction.

## Expected Result

- The Gallery is a bounded, paged view of durable records that stays in sync across contexts.
- Locked and privacy-mode state never leaks metadata.
- Album and search interactions are independent and do not disturb Recents, Recall, queue order, or encrypted originals.

Automated evidence:

- `tests/dom/gallery-view.test.ts`
