# Multi-Select Image Download

Purpose: verify that selected recent-history and bookmark rows can be downloaded as images from the Image transfer controls and keyboard shortcut.

## Behavior Rules

- The Image transfer button is labeled `Export images`.
- When recent-history or bookmark rows are selected, the button shows the selected count, for example `Export images (3)`.
- Recent-history selections download before bookmark selections; normal selection behavior keeps those lists mutually exclusive.
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
6. Select multiple bookmark rows with Cmd/Ctrl-click.
7. Press `d`.
8. Verify one browser download starts for each selected bookmark row, in visible order.
9. Press `ArrowDown`.
10. Verify the same selected bookmark export behavior starts.
11. Capture one selected record as an encrypted original, unlock blob storage, then export that selected row.
12. Verify the captured original is downloaded instead of fetching the record URL.
13. Clear all row selections and select a host image.
14. Press `d`.
15. Verify the current selected host image downloads.
16. Press `Shift+D`.
17. Verify the same fallback path requests Save As before downloading.
18. Clear the host image selection while leaving recent history populated.
19. Click `Export images`.
20. Verify the most recent history image downloads without requesting Save As.
21. Shift-click `Export images`.
22. Verify the most recent history image requests Save As before downloading.

## Expected Result

- Multi-select image export starts one browser download per selected row.
- Single-image fallback remains available from the same button and shortcut.
- Captured originals are preferred for selected records when available and unlocked.
- Save As only appears for shifted image export actions.
- The `d` and `ArrowDown` shortcuts trigger the same normal image export behavior.
