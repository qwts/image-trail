# ADR-0006: Acknowledged Move Journals and Source Deletion Guards

## Status

Accepted — 2026-07-16

Parent: [#560](https://github.com/qwts/image-trail/issues/560)

Implementation: [#586](https://github.com/qwts/image-trail/issues/586)

Companion: [qwts/photos#333](https://github.com/qwts/photos/issues/333)

Foundations:
[ADR-0004](0004-overlook-interop-contract-and-pairing-custody.md) and
[ADR-0005](0005-overlook-record-translation-and-durable-pin-custody.md)

## Context

A Move cannot be modeled as a transient send followed by source deletion. The
extension service worker may suspend between any two operations, messages may be
replayed, and the target may durably store metadata without successfully taking
custody of a captured original. Deleting the source before a durable, matching
acknowledgement would risk the sole original. Counting message attempts would
also make retries inflate progress.

## Decision

### Durable state machine

IndexedDB owns five extension-private stores:

- journals bind transfer, pairing, source, target, phase, sequence, and time;
- items bind one canonical interop id to its source message, native source id,
  review category, canonical record, acknowledgement proof, and finalization;
- outbox rows retain canonical requests and acknowledgements until delivery;
- receipts bind `(pairingId, messageId)` to exactly one transfer and optional
  response message;
- audit rows retain idempotent phase evidence.

These stores contain no Recents/history records. Counts are derived from durable
items, never incremented from attempts, so replay and restart cannot inflate
eligible, duplicate, skipped, failed, acknowledged, or finalized totals.

### Receive and acknowledgement

The receiver validates canonical identity before translation. Replaying an
accepted or terminal response returns the exact durable acknowledgement. A
retryable rejection may be replaced by a fresh acknowledgement after target
verification succeeds; the superseded outbox response is marked delivered.
Reusing a pairing/message identity under another transfer fails closed. Replay
identity is also bound to the immutable canonical record id and body, album
membership, and review category; changing any of them under the same message
identity is rejected instead of returning a stale acknowledgement.

An accepted acknowledgement proves durable metadata. If the canonical original
is `available`, it must also report `originalVerification: verified`; the target
verifier is responsible for matching byte custody before that claim. A
metadata-only or unavailable record uses its exact non-custody state and cannot
claim that an original moved. Conflict and unsupported classifications remain
rejections.

### Source finalization guard

Only the source product applies an acknowledgement. Transfer, pairing, product,
record, and acknowledged source-message identities must all match the durable
journal. A forged accepted response without metadata proof or verified original
custody is rejected before finalization.

Finalization is separately journaled and retryable. The source finalizer is not
invoked for an available original until verified target custody is durable. For
metadata-only/unavailable records it receives `preserve-original`; for verified
available originals it receives `remove-after-verified-copy`. A delayed rejection
cannot regress an already accepted item.

## Consequences

- Service-worker restart and replay resume from IndexedDB without duplicate
  deletion or count drift.
- Translation remains the sole durable pin producer; the journal does not become
  a queue, Recall, or blob producer.
- Actual transport and content-hash byte verification remain #588; this decision
  defines the proof boundary they must satisfy.
- Conflict decisions remain #587 and convergence remains #589/#590.

## Evidence

- `tests/interop-move-protocol.test.ts`
- `tests/indexeddb-migrations.test.ts`
- [Acknowledged Move Journals acceptance](../acceptance-tests/acknowledged-move-journals.md)
- `npm run ci`
