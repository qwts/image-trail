# Deterministic Reviewed Sync

## Purpose

Verify that opt-in Sync converges by canonical product role, survives restart,
retains auditable conflict and delete choices, and does not mutate unrelated
Image Trail product state.

Tracking: [#587](https://github.com/qwts/image-trail/issues/587)

Architecture:
[ADR-0007](../adr/0007-deterministic-reviewed-sync-journals.md)

## Automated procedure

1. Migrate a v10 profile to v11 and inspect the session, item, receipt, and audit
   stores and session indexes.
2. Analyze Image Trail and Overlook fixtures with causally newer values on
   different fields; repeat with the same product roles and compare results.
3. Analyze concurrent title edits, require a decision, choose Keep both, and
   inspect the primary and secondary outcomes.
4. Start a reviewed two-way/all-record session, receive the conflict, persist its
   apply-to-all decision, close IndexedDB, reopen it, and reload the item.
5. Replay the exact message, then reuse its pairing/message id with changed
   content.
6. Receive a newer tombstone and attempt apply before review. Repeat with a
   tombstone that is also concurrent with another field; resolve the field first.
7. Exercise pause/resume, cancel, and disconnect and attempt later work after
   each terminal boundary.
8. Advance and regress a checkpoint and inspect incremental changes.
9. Count Bookmarks, history, albums, and album memberships before and after the
   journal flow.
10. Run the full source command check.

## Expected result

- v11 contains all four stores; existing profiles migrate without changing
  unrelated stores.
- Causally newer per-field values converge and concurrent values require an
  explicit product or Keep both decision.
- Session choices, conflict decisions, delete reviews, receipts, checkpoints,
  controls, and audit events survive database reopen.
- Exact replay returns the durable item; changed replay content fails closed.
- No tombstone reaches the apply seam before delete review, including after all
  concurrent field conflicts are resolved.
- Pause blocks work until resume; cancelled and disconnected sessions cannot
  resume; disconnect deletes neither library.
- Checkpoints only advance and incremental results are ordered by canonical id.
- Queue, Recall, Recents, albums, selection, thumbnails, and originals are not
  written by the Sync journal.

## Manual review

This slice intentionally has no transport or Sync UI. In IndexedDB DevTools,
confirm that only the four `sync*` stores change during the harness flow. Suspend
and restart the extension between receipt and review, then confirm the same
decision and audit rows return. A tombstone row must show `delete-review` until a
separate decision is recorded. Transport and user-facing targeted refresh are
reviewed under #588 and #589.
