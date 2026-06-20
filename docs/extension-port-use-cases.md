# Extension Port Use Cases for Test Automation

Living notes from manual Mile 9 testing. These scenarios should be converted into automated browser/extension tests as the foundation stabilizes.

## Host target projection

- Selecting a host image should populate the Host target URL field with the selected element URL.
- Clicking a bookmark row should project that image into the selected host image.
- Clicking a recent-history row should project that image into the selected host image.
- Clicking a captured row should retrieve/decrypt the stored original and project it into the selected host image.
- If projection is blocked or fails, preview should fall back to opening a new tab.
- If projection fails, the host image should return to the URL it had before the failed projection attempt.
- Releasing the host image should restore the image element to the original URL it had when selected.
- Releasing the host image should clear the active host target state.

## Recent history

- Recent history should grow beyond one row during image traversal.
- Recent history should be domain-wide, not path-specific.
- Recent history should only add URLs after the host image successfully loads.
- 404s and other failed image loads should not be added to recent history.
- Traversing through parsed URL fields should update recent history after successful load.
- Traversing through the full URL editor should update recent history after successful load.
- Hosted image traversal should generate a visible thumbnail for the recent-history row when possible.
- Recent-history rows should be vertically scrollable when the list grows.

## Bookmarks

- Shift-clicking an image should add it to bookmarks.
- Bookmark labels should derive from the source image filename where possible.
- Long bookmark labels should truncate with ellipsis instead of breaking layout.
- Bookmark format badge should match known extensions: PNG, JPG, JPEG, GIF, WEBP.
- Captured bookmark rows should show captured state with a green glow, not a janky Stored button.
- Bookmark paging should load newest/older pages according to the soft max setting.
- Bookmark scope should be configurable between all sites and current site.

## Capture and encrypted originals

- Capture should fetch actual image bytes, not store a blob URL string.
- Capture should fail closed when encrypted blob storage is locked.
- Captured original blobs should be encrypted in extension-origin IndexedDB.
- Plain image metadata that can leak source content should not be visible in blob storage.
- Previewing a captured original should require unlock if the active key is unavailable.
- Deleting a captured original should remove the blob reference from the row.
- Deleting or removing visible rows should keep encrypted storage and visible state consistent.

## URL editing and parsed fields

- Parsed fields must stay editable without focus being stolen by panel rerender.
- Full URL editor should edit the selected/location URL, not become a URL picker.
- Parsed field edits should update the host image and page URL where same-origin rules allow.
- Invalid or failed image URL edits should not pollute recent history.

## Backup, download, and recall

- Capture means storing encrypted original image bytes in extension storage.
- Download means saving an image to disk.
- Backup/share means exporting stored history/bookmarks/originals, encrypted or unencrypted depending on settings.
- Reloading the browser/extension should recall saved bookmarks from extension storage.
- Future gallery views should build on the same durable storage and recall behavior.

## Data URL containment

- Decrypted captured originals may project into a host image as `data:` URLs.
- The panel must never render a full `data:` URL into the Host target loaded display.
- The Host target loaded display should show a short sentinel such as `data URL` and remain constrained with ellipsis/hidden overflow.
- The status message should say `Loaded data URL`, not include the full payload.
- The top URL editor should fall back to the page location URL when the selected host image currently contains a `data:` URL.
- Focus restoration must not reinsert an old raw `data:` URL into the top URL editor after rerender.

## Orphaned encrypted originals cleanup

- `Delete original` removes only the encrypted original blob reference and keeps the visible row.
- `Remove` removes the visible row and must also decrement/delete any captured original blob reference attached to that row.
- Orphan cleanup must not decrypt blob contents.
- Orphan cleanup should compare plaintext operational blob IDs against referenced blob IDs from durable bookmarks and current recent-history rows.
- Orphan cleanup must be unavailable while encrypted originals are locked.
- The service worker must refuse orphan cleanup while locked even if a stale UI or direct message tries to invoke it.
- Manual orphan tests are easiest when deleting bookmark metadata while leaving the blob row intact; recent-history-only tests may look flaky because recent history is service-worker memory.
- Future improvement: show cleanup only when unused originals are detected, or show an unused-original count before deletion.

## Sensitive metadata and future encryption work

- Source URLs are sensitive metadata and should be treated as security-relevant, not harmless bookkeeping.
- Blob payload source URL is intended to live inside encrypted authenticated payload metadata.
- Durable bookmark/history URL storage should be reviewed for plaintext leakage.
- Plaintext URL indexes and dedupe paths should be removed, encrypted, or replaced with a private/keyed lookup design.
- Thumbnail storage should be reviewed with the same sensitivity as original images because thumbnails can reveal content.
- Before LLM features consume stored data, sensitive URLs, thumbnails, and originals should have clear encrypted-at-rest and unlock semantics.
