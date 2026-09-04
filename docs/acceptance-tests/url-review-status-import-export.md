# URL Review Status Import/Export

## Product Rules

- URL review status is extension-owned parser workflow state.
- URL review status is not Recent history, a durable pin, a bookmark, or an original-photo blob.
- Recording URL review status must not insert rows into Recents or the durable pin/bookmark queue.
- Only parsed-field URL attempts create URL review status records.
- A URL attempt that loads a different image is recorded as `passed`.
- A URL attempt that fails to load is recorded as `failed` with a reason.
- A URL attempt that loads but does not change the selected image is recorded as `unchanged`.
- Import/export moves URL review status records only; it must not rewrite pins, bookmarks, recents, downloads, thumbnails, or original blobs.
- URL review status is capped per site by an extension-owned setting; oldest records fall off when the cap is exceeded.
- Clearing URL review status can target the current site, current page URL, current selected/generated source URL, or all URL review status records.
- The clear-after-export setting deletes current-site URL review status only after a successful current-site export.
- Settings exposes URL review history as a read-only, extension-owned view with site and status filters plus first, last, and elapsed review timing.
- Privacy Mode keeps status categories and opaque site choices usable while masking hostnames, page and source URLs, field ids, reasons, and exact timestamps.

## Manual Scenario

1. Open a page with a selected host image and parsed URL fields.
2. Increment an included numeric field to a URL that loads a different image.
3. Verify the field shows the existing successful treatment and the image changes.
4. Increment to a URL that fails to load.
5. Verify the field shows the existing failure treatment and the image remains usable.
6. Create URL review records for a second site and include `passed`, `failed`, and `unchanged` outcomes across the retained history.
7. Open Settings > URL review history and verify all retained sites and statuses appear without opening Queue, Recents, or Recall.
8. Filter to one site and then one status. Verify only matching records remain and the matching count plus first, last, and elapsed timing recompute from the filtered records.
9. Verify long page/source URLs and reasons remain readable, Reload refreshes the view, and no control edits or deletes review records.
10. Enable Privacy Mode. Verify site choices become opaque and hostnames, page/source URLs, field ids, reasons, and exact timestamps are absent while status filtering still works.
11. Disable Privacy Mode and verify the exact metadata becomes visible again.
12. Use Import / Export to export URL review status.
13. Verify the exported JSON uses `image-trail.url-review-status` and contains `passed` and `failed` records for the attempted URLs.
14. Clear extension storage in a test profile, import that JSON, and export URL review status again.
15. Verify the re-export includes the imported records.
16. Verify Recents, bookmarks/pins, Recall, thumbnails, downloads, and encrypted originals are unchanged by the review and import/export flows.
17. Open Settings and change `Max records per site`; verify the value persists after panel close/reopen.
18. Enable `Clear current-site review status after export`, export URL review status again, and verify the export downloads before the current-site records are cleared.
19. Re-import the exported JSON.
20. Use the URL review status clear buttons to clear the selected URL, current page, current site, and all records in separate passes.
21. Export URL review status after each clear pass and verify only records in the chosen scope were removed.
22. Verify Recents, bookmarks/pins, Recall, thumbnails, downloads, and encrypted originals are unchanged by every review/import/export/clear flow.

## Expected Result

- Parsed-field review work can be backed up and restored as URL review status.
- The review state stays scoped to extension-owned metadata storage.
- Recents remain transient unless explicitly pinned/bookmarked.
- Retention trimming and clear-after-export affect URL review status records only.
- Site/status review is read-only, recomputes timing for the visible records, and masks private metadata in Privacy Mode.
