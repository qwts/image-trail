# ADR-0005: Overlook Record Translation and Durable Pin Custody

## Status

Accepted — 2026-07-16

Parent: [#560](https://github.com/qwts/image-trail/issues/560)

Implementation: [#585](https://github.com/qwts/image-trail/issues/585)

Contract foundation:
[ADR-0004](0004-overlook-interop-contract-and-pairing-custody.md)

## Context

The canonical contract can represent Overlook photos that have no semantic web
URL, metadata-only originals, unavailable thumbnails, independent two-product
revisions, and application-specific round-trip fields. Native Image Trail
bookmarks historically require a URL and carry only Image Trail display fields.
Coercing a desktop photo into that legacy shape would invent web provenance,
lose revision/album metadata, or make a remote blob reference look like locally
available bytes.

Canonical records still need to participate in the durable pin queue. Creating a
parallel record list would violate the queue producer and Recall invariants, while
placing original or thumbnail bytes directly in metadata would violate encrypted
blob custody.

## Decision

### Canonical custody is part of the durable pin

Each translated record is one ordinary encrypted bookmark envelope and therefore
one durable queue row. Its payload contains a versioned interop custody object
with the exact canonical record, exact canonical albums, and incoming review
category. Identity, origin, content hash, revision vectors, source compatibility,
blob states, album members, and both products' namespaced round-trip metadata are
not flattened or inferred.

The plaintext IndexedDB bookmark index uses
`image-trail-interop:<interopId>` for new interop records, even when the encrypted
payload has a real source URL. This prevents source URL disclosure and avoids the
legacy unique URL index collapsing two stable canonical identities. A record with
no semantic source URL also uses that explicit non-web value as its display
identity. The canonical `sourceUrl` remains `null`, site-scoped Queue/Recall does
not match the internal value, and Image Trail does not fabricate `favorites` or
another compatibility source.

Re-saving or moving a translated pin retains its interop custody. Queue movement
updates only `queueUpdatedAt`; it does not reseal metadata merely to reorder the
queue.

### Translation and review

The translation boundary validates records, albums, review categories, and
timestamps with the strict canonical Valibot schemas. Preview matching is
deterministic:

- identical identity plus identical record/albums is `duplicate`;
- the same identity with divergent custody is `conflict`;
- a matching content hash under another identity is `duplicate`;
- the same native origin under another interop identity is `conflict`;
- a deleted record is `skipped`;
- otherwise the canonical review category is retained.

Only `eligible` and `metadata-only` records enter the queue in this slice.
Conflicts, unsupported records, skipped records, and duplicates remain non-writing
review results. Conflict decisions and later convergence belong to #587.

### Albums and byte custody

Exact canonical album objects remain inside the encrypted pin custody. Their
visible name and currently available member pins are projected into deterministic
native albums so Gallery can use the existing album producer. Membership order is
the canonical member position and changing it does not move queue records. Missing
members remain absent until their pins exist; canonical membership is not lost.

Canonical original and thumbnail references are metadata, not proof of local
bytes. Translation shows no image/original unless a transport supplies verified
local custody. A verified original must match canonical MIME type and byte length
and continues to point at the separate encrypted original store. A verified
thumbnail must be image data and is sealed inside the bookmark envelope. Blob
transfer and content-hash verification belong to #588.

## Consequences

- Recents remain transient: translation writes only the durable bookmark and
  native album producers.
- Recall continues to page bookmarks and never pages blob storage or a parallel
  interop list.
- Plaintext bookmark index data reveals only the interop UUID for a new canonical
  record, not its title, source URL, album metadata, thumbnail id, or Overlook
  fields.
- Native album names follow the existing user-visible album storage policy; the
  complete canonical album remains encrypted for exact round trip.
- #586 can journal these stable pin/interop identities, #587 can resolve
  divergences without inventing fields, and #588 can attach verified bytes to the
  existing custody references.

## Evidence

- `tests/interop-record-translation.test.ts`
- `tests/invariants.test.ts`
- `npm run ci`
- [Overlook Record Translation acceptance](../acceptance-tests/overlook-record-translation.md)
