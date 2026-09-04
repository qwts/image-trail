# Multi-Select Image Download

Purpose: verify that selected recent-history and bookmark rows can be downloaded as images from the Image transfer controls and keyboard shortcut.

## Behavior Rules

- The Image transfer button is labeled `Export images`.
- When recent-history or bookmark rows are selected, the button shows the selected count, for example `Export images (3)`.
- Recent-history, visible queue, and Recall selections can be active at the same time; selected downloads run in recent-history, visible-queue, then Recall order.
- Recents expose `Select all recents`; queue and Recall expose select-all plus pin/bookmark filtered selection controls for their visible rows.
- Image transfer exposes `Select everything shown`, which selects visible recents, the visible queue page, and loaded Recall rows.
- Cmd/Ctrl-click toggles individual rows. Shift-click adds the visible range from the most recently selected row in the same list.
- Selected record downloads use captured encrypted originals when a captured original is available and unlocked.
- Selected records without a retrievable captured original download from their record URL.
- If no records are selected, image export downloads the current selected host image.
- If no records are selected and no host image is selected, image export downloads the most recent history row.
- Plain `Export images` clicks, the `d` key, and `ArrowDown` start browser downloads without requesting Save As.
- Shift-clicking `Export images`, `Shift+D`, and `Shift+Enter` request Save As.

## Steps

1. Open a page with several usable image URLs and open the Image Trail panel.
2. Select multiple recent-history rows with Cmd/Ctrl-click.
3. Verify the Image transfer button reads `Export images (N)`.
4. Click `Export images (N)`.
5. Verify one browser download starts for each selected recent-history row, in visible order.
6. Use `Select all recents` and verify every visible recent row is selected.
7. Select multiple queue rows with Cmd/Ctrl-click.
8. Shift-click another queue row and verify the visible range is added to the queue selection.
9. Use the queue menu to select all visible queue rows, then select only queue pins and only queue bookmarks.
10. Press `d`.
11. Verify downloads include selected recents followed by selected visible queue rows, each in visible order.
12. Open Recall, use `Select all Recall`, `Select Recall pins`, and `Select Recall bookmarks`, then Shift-click a Recall range.
13. Press `ArrowDown`.
14. Verify selected Recall rows export after selected visible queue rows.
15. Use `Select everything shown` from Image transfer.
16. Verify every visible recent, visible queue, and loaded Recall row is selected.
17. Capture one selected record as an encrypted original, unlock blob storage, then export that selected row.
18. Verify the captured original is downloaded instead of fetching the record URL.
19. Clear all row selections and select a host image.
20. Press `d`.
21. Verify the current selected host image downloads.
22. Press `Shift+D`.
23. Verify the same fallback path requests Save As before downloading.
24. Clear the host image selection while leaving recent history populated.
25. Click `Export images`.
26. Verify the most recent history image downloads without requesting Save As.
27. Shift-click `Export images`.
28. Verify the most recent history image requests Save As before downloading.

## Expected Result

- Multi-select image export starts one browser download per selected row.
- Single-image fallback remains available from the same button and shortcut.
- Captured originals are preferred for selected records when available and unlocked.
- Save As only appears for shifted image export actions.
- The `d` and `ArrowDown` shortcuts trigger the same normal image export behavior.
