# Queue And Recall Clear/Delete Semantics

## Product Rules

- Recents remain transient session state.
- Queue and Recall clear actions are non-destructive presentation actions. They must not delete durable pin/bookmark records or original blobs.
- Destructive delete actions live in Settings and delete through the durable pin/bookmark relationship row.
- Protected pins may render as locked private placeholders. Delete must still work from the safe relationship/linkage fields without decrypting protected metadata.
- Deleting a protected pin removes the relationship row, encrypted pin metadata, encrypted pin thumbnail, and any linked original through the existing original delete/reference-count path.
- Encrypted pin thumbnails are not original-photo blobs. Do not bulk-delete original blobs as thumbnail cleanup.
- Recall delete starts after the visible queue soft max and covers loaded and offscreen Recall rows for the active queue scope.
- Selected Recall rows participate in existing bookmark and image export flows. Locked protected rows fail closed when export needs unavailable private metadata.

## Manual Acceptance

1. Add enough pins to exceed the visible queue soft max.
2. Use the queue menu Clear action.
3. Confirm visible queue rows disappear without reducing durable storage counts, and Reload restores them.
4. Open Recall, select rows, then Clear results.
5. Confirm Recall rows disappear for the current drawer session and return after closing/reopening or reloading.
6. Save at least one protected pin with an encrypted thumbnail and captured original, then lock encrypted storage.
7. Confirm the locked placeholder appears without sensitive URL/title/thumbnail data.
8. In Settings, delete current queue items and verify visible relationship rows and protected backing rows are removed.
9. Add enough protected and unprotected pins to exceed soft max, then delete Recall items from Settings.
10. Verify post-softmax Recall rows are removed, encrypted pin thumbnails are cleaned, and original blob totals change only for linked originals.
11. Select Recall rows and export bookmarks/images.
12. Verify selected unlocked Recall rows export/download like selected queue rows, while locked private placeholders report a clear failure.
