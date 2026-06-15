# M06: Stored Originals, Capture Pipeline, And Cross-Origin Permissions

**Order:** 6  
**Type:** New extension capability

---

## User Story

As a user, I want to explicitly store selected online images locally and recall them later even when the remote source is unavailable.

## Source Context

This milestone adds bounded stored-original capture, local blob persistence, image-byte hashing, permission-aware extension fetches, clear failure states, retry behavior, and storage usage reporting.

---

## Scope

- Add explicit `store original` / `capture original` action for the current target, history item, or bookmark.
- Add local blob storage for original image bytes and optional thumbnail bytes.
- Attach stored-original references to history/bookmark records without making stored originals the center of the entire app model.
- Fetch image bytes from the extension context when content-script/page context is insufficient.
- Request specific optional origin permission only when needed.
- Record recoverable failure reasons: permission needed, fetch forbidden, not image, too large, network error, auth required, canvas tainted, unknown.
- Add remote-only fallback records when the user attempted capture but bytes cannot be stored.
- Add SHA-256 or equivalent exact-byte identity for dedupe and future vector/idempotency workflows.
- Add storage usage and deletion behavior for stored originals.

## Out Of Scope

- Server storage.
- Vector embeddings.
- Perceptual hash search.
- Face/object recognition.
- Automatic capture of every visible page image.
- Broad host permissions requested up front.

## Exit Criteria

- User can explicitly store the selected image locally.
- Stored image bytes can be recalled from extension storage without loading the remote URL.
- Cross-origin failure states are visible and actionable.
- Optional permission prompts are origin-specific, not broad by default.
- Deleting a stored original removes associated blob records or marks references cleanly.
- Storage usage is visible enough to prevent silent unbounded growth.

## Primary Modules

- `extension/src/background/permissions.ts`
- `extension/src/background/downloads.ts`
- `extension/src/background/messages.ts`
- `extension/src/core/image/image-metadata.ts`
- `extension/src/core/image/thumbnails.ts`
- `extension/src/core/image/fingerprints.ts`
- `extension/src/data/repositories/downloads-repository.ts`
- `extension/src/data/repositories/history-repository.ts`
- `extension/src/data/repositories/bookmarks-repository.ts`
- `extension/src/ui/components/history-view.ts`
- `extension/src/ui/components/bookmarks-view.ts`
- `extension/src/ui/components/status-view.ts`

## Suggested Additional Modules

These can be added if the existing repository names become too ambiguous:

- `extension/src/data/blob-store.ts`
- `extension/src/data/repositories/blobs-repository.ts`
- `extension/src/background/fetch-image.ts`

---

## Acceptance Scenarios

TBD

## Implementation Notes

TBD

## Test Notes

TBD

## Open Questions

TBD
