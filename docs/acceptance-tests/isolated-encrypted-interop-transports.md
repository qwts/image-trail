# Acceptance Test: Isolated Encrypted Interop Transports

Issues: [#588](https://github.com/qwts/image-trail/issues/588) and
[qwts/photos#335](https://github.com/qwts/photos/issues/335)

1. Upload ciphertext larger than one test chunk, interrupt after at least one
   verified chunk, then retry. Already verified chunks are not uploaded again;
   the downloaded bytes and whole-file SHA-256 match exactly.
2. Change one stored chunk or manifest identity. Download fails as corrupt and
   does not publish partial plaintext or ciphertext as a completed transfer.
3. Attempt absolute, traversal, Windows-drive, backslash, empty-segment, or
   cross-pairing paths. Every request fails before provider access.
4. pCloud requests use separate credential custody and only
   `/Image Trail Interop/v1`; neither `/Image Trail/backups` nor `/Overlook` can
   be listed or overwritten through the adapter.
5. Google Drive requests use only `drive.file`, an app-owned interop root,
   resumable uploads, pagination, token invalidation/reconnect, quota mapping,
   and checksum or download-hash verification.
6. Offline, expired auth, quota, provider unavailable, not found, corrupt, and
   partial verification failures retain their typed retry semantics.
7. The iCloud client sends only to `com.qwts.overlook.interop` on macOS after
   matching the released extension id. Missing host, wrong id, unsupported
   platform, unavailable iCloud, malformed response, or oversized frame fails
   closed.
8. Native frames reject embedded bytes/ciphertext. Originals remain encrypted
   files referenced by bounded control messages.
9. Live pCloud/Drive/iCloud checks run only when their explicit environment and
   signed-host prerequisites are present; deterministic fakes remain the CI
   gate.

Automated evidence:

- `tests/interop-transport.test.ts`
- `tests/interop-provider-adapters.test.ts`
- `tests/invariants.test.ts`

Released-provider evidence and recovery steps are recorded through
[Interop Closeout Evidence](../interop-closeout-evidence.md). Mocked provider results
cannot mark those owner-run checks verified.
