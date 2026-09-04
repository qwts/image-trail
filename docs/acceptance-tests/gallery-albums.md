# Gallery Albums

Purpose: verify that Gallery albums are durable ordered collections of existing pins/bookmarks without changing queue, Recall, Recents, thumbnail, or encrypted-original semantics.

## Product Rules

- Albums are ordered collections, not tags or filters.
- Album membership references durable bookmark/pin record IDs only.
- Album membership must not copy URLs, thumbnails, metadata, encrypted blob IDs, or original-photo bytes.
- Creating, renaming, deleting, adding to, or removing from an album must not change durable queue order.
- All Images remains the default Gallery view.
- While Gallery is open, durable pins/bookmarks/captures and album membership changes from other extension contexts refresh the Gallery without a browser reload.
- Selecting an album shows only durable records referenced by that album.
- Search in an album filters within that album, not across the whole durable library.
- The Gallery search control lives in the header with the page controls.
- Add-to-album is a styled per-card popover, not a native browser selector.
- Pending add-to-album choices are per record; applying one record must not reset pending choices for other visible records.
- Dragging a Gallery card onto an album adds that record to the album when the browser supports drag/drop.
- Missing or deleted referenced records are omitted and reported without breaking the album view.
- Privacy mode must continue masking URL-derived labels, titles, thumbnails, status text, and hidden/title attributes.
- Bookmark-only export remains bookmark-only.
- Full backup and pCloud backup include album metadata and memberships.
- Restoring a full backup remaps backup record UUIDs to imported or duplicate local durable record IDs and skips unmapped memberships explicitly.

## Manual Scenario

1. Load the built extension.
2. Create at least one uncaptured durable pin and one captured bookmark with a stored original.
3. Open Gallery from the Queue menu.
4. Verify All Images is selected by default and the durable records are visible.
5. From another tab, pin/capture another durable record and verify the open Gallery updates without refreshing the browser tab.
6. Create a new album.
7. Verify search is in the Gallery header, not a standalone page section.
8. Use the `+` popover on each card to add both durable records to the album; verify the controls use the Gallery styling rather than native browser selectors.
9. Open `+` popovers for multiple cards, choose different albums, apply only one card, and verify the other cards keep their pending choices.
10. Drag a card onto an album chip and verify the record is added without opening the record preview.
11. Select the album and verify only the album members are shown.
12. Search inside the selected album and verify results are filtered within the album only.
13. Remove one record from the album and verify it disappears from the album view but remains in All Images and the queue.
14. Rename the album and verify the selected album keeps its membership.
15. Delete the album and verify the durable records remain in All Images and the queue.
16. Recreate an album, add records, then delete one referenced durable record outside the album flow.
17. Reopen the album and verify the missing reference is omitted with status text.
18. Enable privacy mode and verify album controls remain usable while record URL-derived labels, titles, thumbnails, and hidden/title attributes stay masked.
19. Verify the Gallery uses the panel-like dark surface with green highlights instead of the previous light/tan theme.
20. Verify Recents, Recall ordering, visible queue order, stored-original indicators, and encrypted original bytes did not change during album membership edits.
21. Run a pCloud/full-backup export and restore into a clean profile with one duplicate durable record already present.
22. Verify albums restore with memberships remapped to imported or duplicate local records, unmapped memberships are skipped, and encrypted originals are not duplicated or resealed by album restore.

## Expected Result

- Users can organize durable Gallery records into named albums.
- Users can add records through per-card popovers or supported drag/drop without global add-state resets.
- Gallery stays reactive to durable record and album changes made from other tabs.
- Album membership is durable and ordered by append position.
- Album operations do not affect Recents, queue ordering, Recall paging, thumbnails, or encrypted original storage.
- Full backup restores album metadata safely across imported, duplicate, and missing durable records.
