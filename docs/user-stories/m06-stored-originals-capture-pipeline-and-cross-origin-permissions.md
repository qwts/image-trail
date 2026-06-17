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

## Documentation Review Complete

- **Reviewed source context:** Brave extension port plan stored-original constraints, acceptance tests for capture, CDN permission, oversized originals.
- **Most important build guardrails:** explicit capture only, origin-specific permission prompts, bounded blob storage, byte hashing, remote-loss recall.
- **Acceptance criteria added from review:** capture result states, blob/reference cleanup, storage usage reporting, fallback records.
- **Still intentionally out of scope:** server storage, embeddings, recognition, automatic page-wide capture, broad upfront permissions.

## Acceptance Scenarios

- Capture occurs only from explicit user action on current target, history item, or bookmark.
- Same-origin or already-permitted image bytes are fetched, type-validated as image data, size-bounded, hashed, stored, and linked to the source record.
- Cross-origin failures produce actionable states and may request origin-specific optional permission only when needed.
- Oversized originals are rejected or downshifted according to 25 MB default and 100 MB hard maximum policy.
- Stored original recall displays local bytes without remote network dependency.
- Delete removes or cleanly detaches blob records and updates storage usage.
- Remote-only fallback records preserve the attempted capture state when bytes cannot be stored.

## Planning Discipline To Apply Before Build

- **Shift-left validation:** confirm contracts, threat model notes, edge cases, and regression checks before implementation begins. Add fixtures or manual checks before wiring broad UI behavior.
- **DRY and explicit interfaces:** centralize repeated schemas, actions, repository calls, status codes, and DOM cleanup primitives rather than copying logic into views.
- **Single responsibility:** keep parser, storage, crypto, target DOM integration, background permissions, and UI rendering in their own bounded modules.
- **React-ready modularity:** views should render from serializable state and dispatch named actions; no view should own parser, crypto, persistence, network governance, or target-image business rules.
- **Change isolation:** volatile browser APIs, storage formats, permission prompts, LLM endpoints, and future React/Vite rendering must sit behind adapters.
- **Secure/testable defaults:** default to least privilege, bounded storage/request behavior, typed validation, and pure core functions that can be tested without DOM, network, or extension APIs.

## Implementation Notes

- Use Background Fetch Adapter for extension-context image retrieval; content scripts request capture but do not bypass CORS themselves.
- Use Blob Repository and Fingerprint service behind interfaces so future dedupe/vector work does not rewrite UI.
- Use explicit CaptureResult status codes, not exception strings, across background/content/UI.
- Keep permission prompts narrowly scoped to image origin and document why the prompt appears.
- Make storage accounting a first-class service called after writes/deletes.

## Test Notes

- Capture current same-origin image and recall after blocking/changing remote URL.
- Attempt third-party CDN capture, grant permission, and verify success.
- Attempt oversized image and verify bounded rejection/status.
- Delete captured original and verify blob/reference cleanup and storage usage update.

## Acceptance Criteria Coverage Review

### Missing Before This Planning Pass

- Placeholder sections made the story impossible to execute or verify without rediscovering requirements from the broader docs.
- The story did not explicitly state the reviewed source documents, the module boundaries that must not be crossed, or the framework-adoption constraints.
- The story did not call out the concrete pass/fail acceptance criteria needed to prove capture result states, blob/reference cleanup, storage usage reporting, fallback records.
- The story did not explicitly separate server storage, embeddings, recognition, automatic page-wide capture, broad upfront permissions from the work that should be implemented in this milestone.

### Added In This Planning Pass

- Added a documentation-review completion block tying this story to: Brave extension port plan stored-original constraints, acceptance tests for capture, CDN permission, oversized originals.
- Added concrete acceptance scenarios for capture result states, blob/reference cleanup, storage usage reporting, fallback records.
- Added implementation notes that preserve explicit capture only, origin-specific permission prompts, bounded blob storage, byte hashing, remote-loss recall.
- Added test notes that can be converted into manual regression checks or automated fixtures before integration.
- Added open questions for decisions that remain unresolved but should not block documenting the intended architecture.

### Coverage Status

- All placeholder planning sections for this story are filled.
- The milestone is now traceable from docs to acceptance criteria to implementation patterns and test notes.
- Remaining uncertainty is isolated under **Open Questions** rather than hidden as missing acceptance criteria.

## Open Questions

- Should thumbnails be stored in the same blob store as originals or as separate bounded records?
- What is the exact UX wording for optional origin permission prompts?
