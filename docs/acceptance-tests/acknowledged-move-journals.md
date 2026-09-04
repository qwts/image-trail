# Acknowledged Move Journals

## Purpose

Verify that Move is resumable and idempotent and cannot delete an Image Trail
source before a matching acknowledgement proves target metadata and, when
claimed, captured-original custody.

Tracking: [#586](https://github.com/qwts/image-trail/issues/586)

Architecture:
[ADR-0006](../adr/0006-acknowledged-move-journals-and-source-deletion-guards.md)

## Automated procedure

1. Migrate a fresh profile to the Move journal, item, outbox, receipt, and audit
   stores and inspect their transfer indexes.
2. Queue a metadata-only Move, replay it, close the database, reopen it, and
   inspect the outbox and exact counts.
3. Receive the request, confirm byte verification is not called, restart the
   target, and replay the same request.
4. Apply and replay the acknowledgement, fault source finalization, restart, and
   resume it.
5. Queue an available-original Move; reject target verification, retry with
   verified custody, then deliver a delayed stale rejection.
6. Attempt an accepted acknowledgement that claims no verified original custody.
7. Reuse a pairing/message id under another transfer.
8. Queue eligible, duplicate, and skipped items twice, restart, and compare
   derived counts and pending outbox rows.
9. Run the full source command check.

## Expected result

- Every store and index exists after migration; no journal row appears in
  history/Recents.
- Queue and message replay preserve one item/outbox identity and stable counts.
- Accepted replay returns the exact durable acknowledgement; cross-transfer
  identity reuse fails closed.
- Metadata-only acknowledgement reports `metadata-only`, never verifies bytes,
  and finalizes with `preserve-original`.
- Failed original verification leaves the source finalizer untouched. A later
  verified acknowledgement permits `remove-after-verified-copy` exactly once;
  a stale rejection does not regress it.
- Forged custody proof is rejected before source finalization.
- Faulted finalization is audit-visible and restart-resumable without count drift
  or duplicate final completion.

## Manual review

This slice has no transfer UI. In IndexedDB DevTools, confirm Move state is in the
five dedicated stores and contains canonical ids/status rather than thumbnail or
original plaintext. Suspend/restart the extension between queue, receive,
acknowledge, and finalize calls in a development harness; the next call should
resume from the stored phase. Do not manually delete a source unless the accepted
acknowledgement shows verified original custody for an available original.
