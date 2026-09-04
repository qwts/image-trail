# Overlook Record Translation

## Purpose

Verify that canonical Overlook records become durable Image Trail pins without
fabricating web provenance, exposing canonical metadata at rest, persisting
Recents, changing queue order through envelope timestamps, or confusing remote
blob references with locally available bytes.

Tracking: [#585](https://github.com/qwts/image-trail/issues/585)

Architecture:
[ADR-0005](../adr/0005-overlook-record-translation-and-durable-pin-custody.md)

## Automated procedure

1. Parse and import the canonical valid and round-trip record fixtures.
2. Preview a new record, the same record, a divergent same-identity record, a
   content duplicate, an unsupported record, and a deleted record.
3. Reload the bookmark store and export the canonical record by interop id.
4. Re-save the visible pin and export it again.
5. Import a photo whose canonical `sourceUrl` and `sourceCompatibility` are null;
   load global and site-scoped Queue pages.
6. Import two records with different canonical queue times and a canonical album
   whose member order is the reverse of import order.
7. Inspect raw bookmark and history stores.
8. Attempt to attach a non-image thumbnail and mismatched original metadata.
9. Run `npm run ci`, `npm run test:e2e`, `npm run test:cov`, and
   `npm run test:stories:ci`.

## Expected result

- New eligible/metadata-only records produce one durable bookmark row each and
  round-trip exact canonical records, albums, revisions, provenance, and
  namespaced metadata.
- Identical custody is `duplicate`; divergent stable identity or origin is
  `conflict`; unsupported and deleted records do not write queue rows.
- A no-URL photo displays an explicit `image-trail-interop:` identity globally,
  does not appear in a site-scoped page, exports `sourceUrl: null`, and is not
  labeled `favorites`.
- Queue order follows `queueUpdatedAt` derived from canonical time, not encrypted
  envelope `updatedAt`. Canonical album positions affect only album memberships.
- Re-saving the pin does not remove interop custody.
- Raw bookmark rows contain ciphertext rather than title, thumbnail id, album
  round-trip data, or Overlook fields. The history store remains empty.
- A remote original/thumbnail reference without verified local bytes renders no
  local thumbnail or captured-original state. Mismatched custody claims fail
  before any write.
- Recall still reads the bookmark producer and does not enumerate encrypted blob
  storage.

## Manual review

This slice adds no transfer or review UI. In a development profile, inspect the
translated row in global Queue and Gallery: a web record should render its real
source URL, while a desktop-only photo should show the explicit internal identity
and disappear under site scope. Lock/reopen the extension and confirm the durable
row remains. IndexedDB inspection should show only the opaque interop index and
AES-GCM envelope outside ciphertext. Do not expect provider transfer, conflict
buttons, journals, or missing-byte recovery until #586-#590.
