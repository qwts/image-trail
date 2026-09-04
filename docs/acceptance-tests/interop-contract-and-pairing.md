# Interop Contract and Pairing

## Purpose

Verify that Image Trail adopts the exact Photos v1 contract and can import its
password-protected random interoperability key without persisting plaintext key
material or opening a transfer/provider path.

Tracking: [#584](https://github.com/qwts/image-trail/issues/584)

Architecture:
[ADR-0004](../adr/0004-overlook-interop-contract-and-pairing-custody.md)

## Automated procedure

1. Run `npm run check:interop-contract`.
2. Run the contract and invariant tests through `npm test` or `npm run ci`.
3. Confirm the canonical valid and round-trip fixtures parse unchanged.
4. Confirm invalid, corrupt, replay, unknown-field, unsafe-path/chunk,
   same-product, mismatched-kind, and future-version cases fail.
5. Open the canonical Photos pairing fixture with `fixture-password` and compare
   AES-GCM output against the deterministic raw-key fixture.
6. Import the bundle into a fresh fake IndexedDB profile, close/reopen the DB,
   and use the restored key for the same deterministic crypto operation.
7. Attempt WebCrypto raw export and inspect serialized key-record output.
8. Run the source invariant that scans pairing/import/repository modules for
   host storage, `chrome.storage`, provider, and logging access.

## Expected result

- The pinned Photos commit, manifest digest, all nine canonical files, and each
  file checksum match exactly.
- Both valid record fixtures retain identity, revision, album, blob, and
  namespaced round-trip metadata without lossy translation.
- Wrong password and corruption have the same generic decryption failure; no
  key record is written.
- Unsupported versions and unknown fields fail closed before crypto or storage.
- Repeated `(pairingId, messageId)` is rejected, while the same message id under
  a different pairing is distinct.
- The stored interop record contains a non-extractable `CryptoKey`, pairing/key
  ids, timestamps, and no password or raw/base64 interoperability key.
- Restart persistence retains crypto capability and raw export remains denied.
- No interop custody module can reach host-page storage, extension serializable
  storage, providers, logs, or persistent temp files.

## Manual review

This foundation has no user-visible panel flow. Review the built extension's
service-worker bundle and IndexedDB `keys` row only to confirm that the new
record is an opaque `CryptoKey` record and that no pairing action or provider
permission appears in UI/manifest. End-to-end Move/Sync and pairing UI are not
accepted here; they remain in #585-#590.
