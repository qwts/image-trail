# Oversized Original Is Bounded

Purpose: verify that local original storage respects the day-one size limits.

## Steps

1. Open a fixture page with an image larger than the configured default max original size.
2. Click the extension action.
3. Select the oversized image.
4. Click `Capture`.
5. Verify the extension refuses to store the original bytes.
6. Verify the extension records metadata as remote-only or failed according to the final capture-status model.
7. Verify storage usage counts the failed/remote-only result without increasing original-byte totals.

## Expected Result

- Oversized originals are never stored past the configured limit.
- The user receives a clear status explaining why the original was not stored.
- The record remains valid for metadata/history display.
