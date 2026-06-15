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

- User can recall selected encrypted durable records into visible runtime history after unlock/decrypt.
- Bookmarklet JSON import is explicit, validates shape, maps `favorites` to `bookmarks`, and treats imported plaintext as a trust-boundary event.
- Encrypted export includes versioned records plus metadata needed for clean-profile import without exposing plaintext.
- Key export/import wraps/unlocks keys with password-derived material and fails closed on wrong password or tampering.
- Manual password-protected export/import mode works for selected records/groups.
- Encrypted download files include header metadata for format version, algorithm, salt, IV, wrapping mode, key reference, and payload type.
- Partial import failures report which records were skipped without corrupting successfully imported data.

## Planning Discipline To Apply Before Build

- **Shift-left validation:** confirm contracts, threat model notes, edge cases, and regression checks before implementation begins. Add fixtures or manual checks before wiring broad UI behavior.
- **DRY and explicit interfaces:** centralize repeated schemas, actions, repository calls, status codes, and DOM cleanup primitives rather than copying logic into views.
- **Single responsibility:** keep parser, storage, crypto, target DOM integration, background permissions, and UI rendering in their own bounded modules.
- **React-ready modularity:** views should render from serializable state and dispatch named actions; no view should own parser, crypto, persistence, network governance, or target-image business rules.
- **Change isolation:** volatile browser APIs, storage formats, permission prompts, LLM endpoints, and future React/Vite rendering must sit behind adapters.
- **Secure/testable defaults:** default to least privilege, bounded storage/request behavior, typed validation, and pure core functions that can be tested without DOM, network, or extension APIs.

## Implementation Notes

- Use Importer/Exporter Strategy pattern per source/format and a shared validation layer.
- Treat file formats as public contracts with magic/version headers, not implicit JSON dumps.
- Keep decrypt/recall separate from search; recalling selected records is a user-mediated operation.
- Use streaming/chunk-aware design notes for future large exports even if initial implementation is simple.
- Never log plaintext imported/exported payloads or passwords.

## Test Notes

- Export selected encrypted records and import into a clean profile with correct password/key.
- Attempt import with wrong password and verify no plaintext/write side effects.
- Import bookmarklet JSON with history and favorites and verify mapped records.
- Create encrypted download and validate header fields.

## Acceptance Criteria Coverage Review

### Missing Before This Planning Pass

- The original story had placeholder acceptance scenarios, implementation notes, test notes, and open questions.
- Shift-left validation expectations were not stated at the story level.
- DRY/modularity, single-responsibility, secure-by-default, testability, observability/status, and React-ready boundaries were implicit rather than traceable.
- The story did not explicitly identify which acceptance criteria close parity or planning gaps for later implementation.

### Added In This Planning Pass

- Filled acceptance scenarios with concrete pass/fail criteria grounded in the docs, bookmarklet behavior map, and extension acceptance baseline.
- Added planning discipline notes that must be reviewed before implementation begins.
- Added implementation notes naming the software patterns, adapters, contracts, and module boundaries to preserve.
- Added test notes so manual or automated checks can be prepared before code is integrated.
- Added open questions for decisions that should be resolved before or during implementation rather than discovered late.

### Coverage Status

- All previously missing placeholder sections in this story are now filled.
- Any remaining uncertainty is captured under **Open Questions** instead of hidden in the implementation plan.

## Open Questions

- What password KDF parameters are acceptable for initial PBKDF2 browser support?
- Should exports include stored originals from M06 by default or require explicit selection?
