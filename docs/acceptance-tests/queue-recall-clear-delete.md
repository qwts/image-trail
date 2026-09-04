# Queue And Recall Clear/Delete Semantics

## Product Rules

- Recents remain transient session state.
- Delete recents removes transient recent history rows and any linked captured originals because recents are not recoverable durable memory.
- A recent row for a URL already saved in the durable queue must reflect that saved queue row before offering pin/capture/delete-original controls.
- Pinning a recent row whose URL already exists in the durable queue reuses the saved row instead of creating a duplicate durable record.
- Capturing a URL that already has a saved original must not create a duplicate original blob; capturing a URL with an uncaptured saved pin updates that saved pin.
- Looking up a saved queue row by URL is read-only for queue ordering. It must not mutate `queueUpdatedAt`.
- Delete Original from a recent row must resolve the durable queue row by `pinnedRecordId` or URL, including saved rows outside the visible queue page.
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

## Manual Acceptance: Recents-to-Queue State

1. Unlock encrypted originals.
2. Load image A, pin it, and capture its original from the queue row.
3. Load image B and pin it.
4. Lower the visible queue soft max so image A is no longer visible and appears through Recall.
5. Delete visible Recents.
6. Load image A again.
7. Confirm the new recent row shows pinned/captured state from the saved queue row.
8. Confirm the recent row does not offer duplicate `Pin` or `Capture` actions.
9. Confirm `Delete original` is available on the recent row.
10. Open Recall and confirm image A is still present as a durable saved row.
11. Use `Delete original` from the recent row.
12. Confirm the durable saved row for image A loses stored-original state even when it was not on the visible queue page.
13. Confirm the queue order is unchanged by reloading image A into Recents; lookup must not move the row forward.
14. Confirm Recents still disappear after panel reload and are not persisted as durable memory.

## Automated Coverage

- `tests/messages.test.ts`: saved-row lookup message creation and response guard coverage.
- `tests/indexeddb-data.test.ts`: plain and protected saved-row lookup by URL, including queue-order preservation.
- `tests/record-library-controller.test.ts`: recent enrichment and pin reuse for existing durable rows.
- `tests/captured-originals-controller.test.ts`: capture skip/update paths, failed-save blob cleanup, and non-visible durable delete-original resolution.
- `tests/dom/record-library-controller.test.ts`: linked recent cleanup leaves durable originals intact.
- `tests/dom/captured-originals-controller.test.ts`: failed recent capture save clears transient captured state and deletes the new blob reference.
- `tests/e2e/recents-queue-recall.spec.ts`: Recents reflect captured queue state when the saved row is only reachable through Recall.
