# ADR-0004: Overlook Interop Contract and Pairing Custody

## Status

Accepted — 2026-07-16

Parent: [#560](https://github.com/qwts/image-trail/issues/560)

Implementation: [#584](https://github.com/qwts/image-trail/issues/584)

Canonical cross-product decision:
[Photos ADR-0014](https://github.com/qwts/photos/wiki/ADR-0014-Image-Trail-Bidirectional-Interoperability)

## Context

Image Trail and Overlook need one bidirectional Move/Sync protocol without
sharing native databases, treating a provider as a plaintext exchange, or
letting the two repositories evolve similar-but-incompatible formats. Photos
owns the canonical v1 envelope, records, albums, encrypted blob references,
acknowledgements, journals, errors, pairing bundle, revision model, and golden
fixtures.

Image Trail uses Valibot and browser WebCrypto rather than Photos' Zod and Node
crypto implementation. Adoption therefore needs byte-exact artifact provenance
plus behavioral parity at the runtime boundary. Pairing also releases a random
interop key that must survive extension restart without becoming a serializable
raw-key string.

## Decision

### Canonical artifacts

`contracts/interop/v1/` is an exact vendored copy of Photos commit
`c159af6cab7d20539d55143165f5d6bf69fc751e`. Image Trail pins the SHA-256 digest
of Photos' `SHA256SUMS` in both provenance metadata and the verification script.
CI verifies the pinned source, manifest, every listed schema/fixture, the exact
file set, safe paths, and valid JSON before lint or tests.

Generated canonical files are excluded only from Prettier. The checksum gate,
not local formatting, owns their bytes. Contract changes originate in Photos,
then arrive in Image Trail as one explicit source-commit/checksum update with
matching runtime and fixture changes. Image Trail never repairs or extends v1
independently.

### Runtime validation

Image Trail implements the v1 semantics with strict Valibot schemas under
`extension/src/core/interop/`:

- unknown fields fail except inside the two namespaced round-trip metadata
  objects;
- source and target products differ and envelope/payload kinds match;
- stable UUID identity and SHA-256 content hashes replace filename identity;
- blob paths are provider-relative/traversal-free and chunk indexes are bounded;
- review, conflict, transfer, and error values exactly match the canonical
  vocabulary;
- two-actor and per-field revision vectors use deterministic compare,
  increment, and component-wise merge behavior;
- `(pairingId, messageId)` is the replay identity.

The in-memory replay guard protects this foundation's parse/dispatch boundary.
Durable replay history and resume checkpoints belong to the encrypted journals
in #586; the absence of those journals in #584 does not authorize transfer
execution.

### Pairing and key custody

The browser importer accepts only the canonical v1 password bundle. It
normalizes the password with NFKC, derives a separate AES-256-GCM key with
PBKDF2-SHA-256 at 600,000 iterations, authenticates the complete
domain-separated header as AAD, decrypts the payload, and verifies that payload
and header identities match. Wrong passwords, corruption, non-canonical base64,
unknown fields, unsupported versions, and identity conflicts fail before a
record is written.

The 32 plaintext key bytes exist only in a temporary `Uint8Array`, are imported
immediately as a non-extractable AES-GCM `CryptoKey`, and are zeroed in `finally`.
The existing extension-owned IndexedDB `keys` store persists the browser-managed
opaque `CryptoKey` with `{kind: "interop", wrapping: "indexeddb",
extractable: false}` plus non-secret pairing identity/timestamps. The record
contains no password, raw/base64 key, pairing plaintext, provider credential, or
native-product data. Reopening IndexedDB restores an encrypt/decrypt-capable key
that WebCrypto still refuses to export.

Pairing import is idempotent for the same pairing/key identity. Reusing one key
id for a different pairing, or one pairing id for a different key, fails closed.
No interop module writes host-page storage, `chrome.storage`, logs, provider
files, or persistent temporary files.

## Consequences

- #585 may translate native records only through these canonical schemas and
  the stored interop-key reference.
- #586 must add encrypted durable replay/journal state before Move can execute;
  #584 alone cannot delete or transfer a record.
- Later provider adapters transport only interop-key-encrypted protocol objects
  and never receive raw key material.
- A profile that loses its extension-owned key record must re-import the
  password-protected pairing bundle; there is no plaintext recovery shortcut.
- There is no user-visible pairing UI in #584. UI and complete browser acceptance
  arrive in #589/#590 after translation, journals, sync, and transports exist.

## Evidence

- `npm run check:interop-contract`
- `tests/interop-contract.test.ts`
- the interoperability custody check in `tests/invariants.test.ts`
- [Interop Contract and Pairing acceptance](../acceptance-tests/interop-contract-and-pairing.md)
- [Interop Closeout Evidence](../interop-closeout-evidence.md), whose canonical
  checksum-gated map separates automated proof from required released-provider
  evidence.
