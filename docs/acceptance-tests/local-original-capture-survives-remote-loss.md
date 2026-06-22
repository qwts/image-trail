# Local Original Capture Survives Remote Loss

Purpose: verify that an explicitly captured original image is stored locally in extension-owned durable storage and remains displayable without the remote source.

## Steps

1. Open a fixture page with exactly one qualifying image.
2. Click the extension action.
3. Verify the panel injects and auto-selects the image.
4. Click `Capture`.
5. Verify the extension stores a durable metadata/history record.
6. Verify the extension stores the original image bytes in IndexedDB, with byte-size metadata available for storage usage reporting.
7. Close and reopen the browser, or otherwise restart the extension context.
8. Open the extension panel.
9. Verify the captured image appears from local durable storage.
10. Disable network access or remove the remote image from the fixture server.
11. Verify the captured image still displays locally.
12. Delete the captured image.
13. Verify the storage record, local blob, thumbnail if present, and related key references are removed or marked according to the final deletion policy.

## Recent Pin/Capture Coverage

1. Load an image so it appears in Recent history.
2. Use `Pin` on the recent row.
3. Verify the row is added to the bookmark queue as a durable pin.
4. Verify the pinned row is removed from Recent history.
5. Load another image into Recent history, unlock encrypted storage, then use `Capture` on the recent row.
6. Verify capture also adds the row to the bookmark queue with the captured-original link intact.
7. Verify the captured row is removed from Recent history.
8. Reload the panel.
9. Verify the captured bookmark remains in the queue and can preview/download from the stored original when unlocked.

## Expected Result

- The image is not dependent on the original remote URL after capture.
- The UI does not report success until durable metadata and local bytes are both written.
- Storage usage counts and byte totals reflect the capture and deletion.
- Pinning a recent persists only the chosen row, while capturing a recent persists both the durable pin/bookmark metadata and the linked original bytes.
- Successful Pin and Capture actions move the row out of transient Recent history once the durable queue save succeeds.
