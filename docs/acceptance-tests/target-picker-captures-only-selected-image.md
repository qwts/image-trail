# Target Picker Captures Only The Selected Image

Purpose: verify that manual target selection does not persist unrelated page images.

## Steps

1. Open a fixture page with many qualifying images.
2. Click the extension action.
3. Use the target picker.
4. Select one page image.
5. Click `Capture`.
6. Verify only the selected image receives a durable metadata/blob record.
7. Verify other page images are not stored as originals.

## Expected Result

- Exactly one selected image is captured.
- Non-selected page images are not silently persisted.
- If runtime discovery lists other images, those records remain session-only unless a future feature intentionally stores them.
