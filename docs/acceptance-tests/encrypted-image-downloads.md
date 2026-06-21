# Encrypted Image Downloads

## Purpose

Verify that image files can be exported to portable blob-key-encrypted JSON files and restored after key backup recovery.

## Preconditions

- The extension is installed in Brave or Chromium.
- Browser downloads are allowed for the test profile.
- Encrypted originals have been set up and unlocked.
- A blob key backup has been exported and can be imported in a clean profile.

## Steps

1. Open a page with several usable images and open Image Trail.
2. Capture one recent-history row as an encrypted original.
3. Select that captured recent-history row.
4. Verify the Image transfer section shows `Export encrypted (1)`.
5. Click `Export encrypted (1)`.
6. Verify a `.image-trail-encrypted.json` file downloads.
7. Select multiple uncaptured recent-history rows.
8. Click `Export encrypted (N)`.
9. Verify one encrypted JSON file downloads per selected row in visible order.
10. Select multiple bookmark rows and repeat encrypted export.
11. Lock or clear the encrypted originals key.
12. Verify encrypted export and encrypted import controls are disabled or report that encrypted originals must be unlocked.
13. Clear or reinstall the profile so extension IndexedDB data is empty.
14. Import the key backup, unlock encrypted originals, and choose the encrypted image JSON file.
15. Click `Import encrypted`.
16. Verify the decrypted image is imported into bookmarks and recent history.
17. Try importing the encrypted image with the wrong or missing blob key.
18. Verify import fails closed and does not add a plaintext bookmark or history row.
19. Try importing a normal history, bookmarks, or key backup JSON file through `Import encrypted`.
20. Verify import fails with an unexpected payload type message and does not add a plaintext bookmark or history row.
21. Confirm `Export images`, `d`, `ArrowDown`, Shift-click, `Shift+D`, and `Shift+Enter` still perform normal plain image export behavior.

## Expected Result

- Encrypted image export uses the active blob key and writes a portable versioned JSON file.
- Captured originals are exported from stored encrypted bytes instead of refetching their URL.
- Uncaptured records are fetched through the background image fetch path before encryption.
- Encrypted imports require the matching unlocked blob key and restore images into bookmarks and recent history.
- Non-image JSON exports are rejected by encrypted image import without decrypting or importing records.
- Plain image export and keyboard shortcuts are unchanged.
