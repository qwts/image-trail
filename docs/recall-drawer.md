# Recall Drawer

Purpose: verify that durable pins/bookmarks beyond the visible bookmark queue soft max can be paged from the pin queue in a side drawer and recalled into the visible bookmark queue.

## Product Model

- Recents are fully transient session state and do not become durable recall records.
- Pins are durable queue records with encrypted identifying metadata such as URL, domain, and thumbnail.
- Original Photo storage contains captured original bytes and remains separate from the pin queue.
- Bookmarks are pins associated with an Original Photo.
- Recall pages durable pins/bookmarks only; it does not page Original Photo or blob storage directly.
- Capture links a pin/bookmark to stored original bytes and updates captured state; Recall does not create captured originals.

## Acceptance Steps

1. Start from a profile with more saved bookmark queue records than fit in the visible bookmark list.
2. Optionally capture one bookmark original and verify it shows the existing captured/green state.
3. Click `Recall` in the Bookmarks section.
4. Verify the Recall drawer opens beside the panel, using the side with available viewport space.
5. Select one or more rows in the drawer.
6. Click `Recall selected`.
7. Verify selected records appear at the top of the visible bookmark queue.
8. Verify the visible bookmark queue remains capped to the configured bookmark soft max.
9. Reload or inspect bookmark storage and verify recalled records remain durable and keep their recalled queue order.
10. Verify ordinary recent-history rows do not become recallable unless they were intentionally added to the bookmark queue.
11. On an image-search page with a strict CSP, such as DuckDuckGo Images, verify bookmark and Recall thumbnails render from stored `data:image/...` thumbnails instead of display-time `blob:` URLs.

## Expected Results

- The drawer does not change the main panel section heights or scroll position.
- Refreshing Recall after a queue add does not close/reopen the drawer or replay the first-open slide animation.
- Recall rows can be selected and cleared without affecting bookmarks or current image target.
- Partial failures report recalled and failed counts.
- Recall loads additional records in bounded pages instead of loading every durable pin at once.
- Recalled records do not automatically load onto the host image or recent history.
- Capture remains about durable original image bytes. A captured/green bookmark can be recalled, but Recall itself does not create captured originals.
- Stored thumbnail data is durable pin metadata and must not be converted to page-scoped `blob:` URLs for rendering because host page CSP can block them.
