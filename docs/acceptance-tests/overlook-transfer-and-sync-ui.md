# Overlook Transfer and Sync UI

Last reviewed: 2026-08-30

## Purpose

Verify that Image Trail exposes one compact, truthful workflow for Move to
Overlook and Sync with Overlook without changing Queue, Gallery, selection, or
detached-workspace state.

## Automated evidence

- `tests/e2e/interop-ui.spec.ts` proves the baseline package omits
  `nativeMessaging`, the live-local Chromium probe, the Queue and Gallery entry
  points, and the active interop runtime. The same spec retains an explicitly
  enabled experimental path that injects fake Native Messaging and WebSocket
  boundaries inside the service worker and verifies redemption, reviewed open,
  encrypted-object acknowledgement, exact progress, heartbeat, and close.
- `tests/interop-live-local.test.ts` covers strict schema-v2 bootstrap,
  released-extension and pairing authority, exact loopback endpoint and
  protocol, ready/not-running/missing-host/locked/incompatible/unavailable and
  expired/rejected states, ciphertext frame and in-flight bounds, checksums,
  one/many-object acknowledgement flow, cancellation, and fresh-bootstrap
  reconnect after worker loss.
- `tests/dom/interop-workflow-view.test.ts` covers exact review and custody
  counts, provider and pairing gating, apply-to-all conflict intent, and the
  opaque locked surface. It also mounts a production-style closed Shadow DOM
  and proves the opener roots the workflow inside the extension panel rather
  than the host page body.
- `extension/src/ui/components/interop-workflow-view.stories.ts` covers review,
  conflicts, transferring, paused, awaiting acknowledgement, partial failure,
  completion, disconnected provider, narrow, keyboard, and locked states.
- Existing Queue, Gallery, secure-session, and detached-window Playwright specs
  remain the regression gate for targeted overlay behavior.

## Feature-gate boundary

Baseline and release builds keep Transfer & Sync disabled. Build with
`IMAGE_TRAIL_ENABLE_INTEROP=1` to add the experimental UI/runtime and
`nativeMessaging` permission for the manual script below. Do not ship or
advertise that build until #590, #608, and #609 close with released-product
evidence.

## Manual script

1. Build with `IMAGE_TRAIL_ENABLE_INTEROP=1`. Open Transfer & Sync from one
   Queue row, a multi-selection, Gallery, a
   captured original, and the Queue collection action.
2. In the in-page production panel, confirm the workflow is visible and styled
   inside the panel. Inspect the host page and confirm its `document.body` did
   not gain an `.image-trail-interop-scrim` child. Close the workflow and
   confirm focus returns to the invoking control.
3. Confirm the entry context and exact total are retained. Until an isolated
   provider and pairing bundle exist, eligibility remains unchecked, all review
   and acknowledgement counts remain zero, and Start stays disabled.
4. In Storybook, exercise Move and Sync, every review category, all three
   conflict choices, Apply to all, pause, cancel, resume, reconnect, disconnect,
   partial failure, awaiting acknowledgement, and completion.
5. Confirm progress always displays processed, acknowledged, and finalized
   counts separately. Metadata-only and unavailable originals must never be
   described as verified originals.
6. Repeat in a narrow panel and a detached Queue window. Close the workflow and
   confirm Queue order, selection, Gallery context, scroll, and window geometry
   did not change.
7. Lock Image Trail while protected content exists. The workflow must render
   only the lock explanation and Close action: no rows, thumbnails, names,
   counts, conflicts, or provider details may exist beneath or inside it.
8. With the signed Overlook build running and an existing pairing, start a local
   Move. Confirm only the released Image Trail extension reaches
   `com.qwts.overlook.interop`; the returned endpoint is the exact
   `127.0.0.1` session URL, and the WebSocket advertises
   `overlook.interop.v1`. Stop Overlook, lock it, expire a capability, and reject
   the extension Origin in turn; confirm the runtime reports a truthful
   unavailable, locked, capability-rejected, or origin-rejected state without
   silently choosing a cloud provider.
9. Transfer one object and then enough objects to exercise the negotiated byte
   window. Confirm progress distinguishes sent from durably acknowledged bytes,
   checksum corruption and oversized frames fail closed, cancellation pauses
   without source deletion, and a browser sleep or service-worker restart uses
   a new native bootstrap before resuming the durable journal.
10. Inspect the host page DOM, content messages, extension storage, service
    worker logs, and Overlook logs. No capability secret, plaintext original,
    filename, or ciphertext payload may appear there; only encrypted objects
    cross the background-owned WebSocket.

## Live-provider boundary

pCloud, Google Drive, and signed iCloud host credentials are owner-run evidence
for issue #590. This UI must not reuse backup connection state or simulate a
successful pairing, provider check, acknowledgement, verification, or transfer.

## Reset

Close the workflow. Disconnecting interop stops future sync but does not delete
either product's local library. No source removal may occur before verified
target acknowledgement.
