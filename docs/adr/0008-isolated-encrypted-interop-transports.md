# ADR-0008: Isolated Encrypted Interop Transports

## Status

Accepted — 2026-07-16

Parent: [#560](https://github.com/qwts/image-trail/issues/560)

Implementation: [#588](https://github.com/qwts/image-trail/issues/588)

Companion: [qwts/photos#335](https://github.com/qwts/photos/issues/335)

Foundations: [ADR-0004](0004-overlook-interop-contract-and-pairing-custody.md),
[ADR-0006](0006-acknowledged-move-journals-and-source-deletion-guards.md), and
[ADR-0007](0007-deterministic-reviewed-sync-journals.md)

## Context

The durable Move and Sync protocols produce canonical encrypted files but do
not own provider credentials or remote paths. Image Trail's existing pCloud
integration is a manual backup boundary. Reusing that connection, its
`/Image Trail/backups` root, or Overlook's `/Overlook` backup root would let one
workflow enumerate or overwrite another. Browser-only code also cannot safely
claim access to Overlook's iCloud container.

## Decision

### Provider-neutral transfer

All transports implement encrypted object put, get, list, delete, quota, and
verify operations with one typed failure vocabulary. Files are split into
immutable chunks no larger than 4 MiB. Each retry verifies existing chunks by
size and SHA-256 and uploads only missing or mismatched chunks. A verified
manifest binds the pairing id, transfer id, relative path, chunk hashes, byte
length, and whole-file SHA-256. Paths are provider-relative and reject empty,
absolute, traversal, backslash, and drive-letter forms.

### Provider custody and roots

- pCloud uses separate interop credential custody and writes only below
  `/Image Trail Interop/v1`.
- Google Drive uses `chrome.identity`, requests only `drive.file`, creates an
  app-owned `Image Trail Interop` root, paginates listings, uses resumable
  uploads, retries after token invalidation, and verifies by Drive SHA-256 or a
  download hash.
- No interop adapter exposes Image Trail or Overlook backup discovery.

### Signed iCloud boundary

Image Trail calls only `com.qwts.overlook.interop`. The client requires macOS
and the released extension id before sending a request. Native JSON frames are
bounded to 64 KiB and reject `bytes` or `ciphertext` fields. Original custody is
passed as opaque encrypted file references; data bytes do not cross native
messaging. Missing host, wrong identity, unsupported platform, invalid response,
and unavailable iCloud fail closed.

## Consequences

- Interrupted transfers resume from verified chunks without trusting a local
  progress counter.
- Provider-specific auth, quota, offline, corrupt, unavailable, and partial
  failures map into one protocol vocabulary.
- Backup namespaces and credentials remain outside the interop authority.
- The released extension id, signed/notarized host, and Apple entitlement are
  deployment requirements rather than browser fallbacks.

## Evidence

- `tests/interop-transport.test.ts`
- `tests/interop-provider-adapters.test.ts`
- [Isolated encrypted transport acceptance](../acceptance-tests/isolated-encrypted-interop-transports.md)
