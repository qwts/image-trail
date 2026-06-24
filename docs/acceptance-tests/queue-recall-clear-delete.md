# Queue And Recall Clear/Delete Semantics

## Product Rules

- Recents remain transient session state.
- Delete recents removes transient recent history rows and any linked captured originals because recents are not recoverable durable memory.
- Queue and Recall clear actions are non-destructive presentation actions. They must not delete durable pin/bookmark records or original blobs.
- Queue row `Clear` is undoable/presentation-only; Cmd/Ctrl-clicking the same row action changes it to destructive `Delete` and removes the durable pin/bookmark.
- Bulk destructive queue and Recall delete actions live in Settings and delete through the durable pin/bookmark relationship row.
- Protected pins may render as locked private placeholders. Delete must still work from the safe relationship/linkage fields without decrypting protected metadata.
- Deleting a protected pin removes the relationship row, encrypted pin metadata, encrypted pin thumbnail, and any linked original through the existing original delete/reference-count path.
- Encrypted pin thumbnails are not original-photo blobs. Do not bulk-delete original blobs as thumbnail cleanup.
- Recall delete starts after the visible queue soft max and covers loaded and offscreen Recall rows for the active queue scope.
- Selected Recall rows participate in existing bookmark and image export flows. Locked protected rows fail closed when export needs unavailable private metadata.

## Manual Acceptance

1. Add enough pins to exceed the visible queue soft max.
2. Add recent history rows, then use Delete recents.
3. Confirm recent rows do not return after panel reload, and durable queue rows are unchanged.
4. Use the queue menu Clear action.
5. Confirm visible queue rows disappear without reducing durable storage counts, and Reload restores them.
6. On a visible queue row, click `Clear`.
7. Confirm the row hides without durable storage count changes, and Reload restores it.
8. On the same visible queue row, hold Cmd on macOS or Ctrl on Windows/Linux and confirm `Clear` changes to `Delete`.
9. Cmd/Ctrl-click `Delete`.
10. Confirm the durable pin/bookmark is removed, Reload does not restore it, and any linked original follows the existing original delete/reference-count rules.
11. Open Recall, select rows, then Clear results.
12. Confirm Recall rows disappear for the current drawer session and return after closing/reopening or reloading.
13. Save at least one protected pin with an encrypted thumbnail and captured original, then lock encrypted storage.
14. Confirm the locked placeholder appears without sensitive URL/title/thumbnail data.
15. In Settings, delete current queue items and verify visible relationship rows and protected backing rows are removed.
16. Add enough protected and unprotected pins to exceed soft max, then delete Recall items from Settings.
17. Verify post-softmax Recall rows are removed, encrypted pin thumbnails are cleaned, and original blob totals change only for linked originals.
18. Select Recall rows and export bookmarks/images.
19. Verify selected unlocked Recall rows export/download like selected queue rows, while locked private placeholders report a clear failure.
