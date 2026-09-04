# ADR-0007: Deterministic Reviewed Sync Journals

## Status

Accepted — 2026-07-16

Parent: [#560](https://github.com/qwts/image-trail/issues/560)

Implementation: [#587](https://github.com/qwts/image-trail/issues/587)

Companion: [qwts/photos#334](https://github.com/qwts/photos/issues/334)

Foundations:
[ADR-0004](0004-overlook-interop-contract-and-pairing-custody.md),
[ADR-0005](0005-overlook-record-translation-and-durable-pin-custody.md), and
[ADR-0006](0006-acknowledged-move-journals-and-source-deletion-guards.md)

## Context

Sync can receive the same canonical record repeatedly, after either product has
changed different fields, and across extension service-worker or browser
restarts. Last-message-wins behavior would make delivery order determine the
result. Applying tombstones as ordinary newer values could silently delete a
library record. Transient conflict choices would force a reviewer to repeat work
after every suspension.

## Decision

### Product-role revision resolution

The resolver always compares the Image Trail record as Image Trail and the
Overlook record as Overlook; transport arrival order does not assign roles.
Every supported field uses its field revision, falling back to the record vector.
A causally newer field wins, equal values converge without review, and concurrent
different values become an explicit per-field conflict. The merged record takes
the component-wise maximum record and field vectors.

Conflict choices are `keep-image-trail`, `keep-overlook`, or `keep-both`.
`keep-both` produces an explicit secondary apply outcome; it is never inferred
from a duplicate or conflict. Apply-to-all is recorded as one reviewed action
over the current item's conflict fields.

### Durable review journal

IndexedDB schema v11 owns four extension-private stores:

- sessions retain reviewed direction, scope, participants, connection state,
  control phase, and monotonic per-product checkpoints;
- items retain both product records, deterministic analysis, conflict decisions,
  delete decision, result state, and apply evidence;
- receipts bind pairing/message identity to the exact canonical envelope and
  item, making exact replay idempotent and changed replay content invalid;
- audit rows retain starts, receipt analysis, decisions, controls, checkpoints,
  applies, and failures.

Pause blocks receive, decision, checkpoint, and apply work until resume. Cancel
cannot be resumed. Disconnect marks the session disconnected and cancelled but
does not remove either library or its journal. Reopening the same database
hydrates the session, decisions, receipts, and audit trail.

### Delete review boundary

A tombstone is never an ordinary ready item. A causally newer tombstone enters
delete review directly. If a tombstone is also part of a concurrent conflict,
resolving all per-field conflicts transitions to delete review rather than ready.
The apply seam remains blocked until an explicit `apply` delete decision exists;
`keep` skips the item and preserves the target library.

### Product-state isolation

The protocol ends at an injected canonical-record apply seam. The journal does
not write Bookmarks, album membership, queue order, Recall, Recents, visible
selection, thumbnails, or original blobs. Product translation and targeted UI
refresh remain the owners of those states. Transport ordering and peer exchange
remain #588.

## Consequences

- Resolution and stored choices are deterministic and restart-resumable.
- Exact message replay cannot inflate progress or duplicate application.
- Tombstones cannot cross the apply boundary without a separately durable review.
- Queue ordering remains `queueUpdatedAt`; Sync does not reseal or reorder pins.
- Recents remain transient and Recall continues to page the durable queue producer.

## Evidence

- `tests/interop-sync-resolution.test.ts`
- `tests/interop-sync-protocol.test.ts`
- `tests/indexeddb-migrations.test.ts`
- [Deterministic Reviewed Sync acceptance](../acceptance-tests/deterministic-reviewed-sync.md)
- `npm run ci`
