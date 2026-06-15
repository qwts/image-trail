# M07: Recall, Migration, Import/Export, And Encrypted Downloads

**Order:** 7  
**Type:** Data portability

---

## User Story

As a user, I want to recover older encrypted records and move data between installs without exposing plaintext.

## Source Context

This milestone adds recall/decrypt flows, explicit bookmarklet JSON import, encrypted import/export, password wrapping, key import/export, and encrypted download envelopes.

---

## Scope

- Add recall/decrypt flow for older encrypted history/bookmark records.
- Allow selected encrypted records to be brought into the visible runtime history view.
- Import old bookmarklet JSON as an explicit user action.
- Export/import encrypted history and bookmarks.
- Add key export/import with password wrapping.
- Add manually password-protected export/import mode for selected payloads or groups.
- Add encrypted download-to-disk file format with versioned header metadata.
- Preserve recovery messaging around migration and encryption-format changes.

## Out Of Scope

- Server sync.
- Automated cloud backup.
- WebAuthn/YubiKey unlock implementation unless separately promoted.
- Full-text search over encrypted records without explicit decrypt/recall.

## Exit Criteria

- User can recall selected encrypted records into the visible session view.
- Bookmarklet JSON import works only through an explicit trust-boundary action.
- Encrypted export can be imported into a clean install with the correct password/key material.
- Failed import/export operations fail closed and surface useful recovery status.
- Encrypted download files have enough header metadata to identify format, algorithm, salt, IV, wrapping mode, and key reference.

## Primary Modules

- `extension/src/data/import-export/history-export.ts`
- `extension/src/data/import-export/history-import.ts`
- `extension/src/data/import-export/key-export.ts`
- `extension/src/data/import-export/key-import.ts`
- `extension/src/data/import-export/encrypted-file-format.ts`
- `extension/src/data/crypto/password-wrap.ts`
- `extension/src/ui/components/import-export-view.ts`
- `extension/src/ui/components/lock-view.ts`
- `extension/src/data/repositories/downloads-repository.ts`

---

## Acceptance Scenarios

TBD

## Implementation Notes

TBD

## Test Notes

TBD

## Open Questions

TBD
