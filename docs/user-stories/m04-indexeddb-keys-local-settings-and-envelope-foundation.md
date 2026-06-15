# M04: IndexedDB, Keys, Local Settings, And Envelope Foundation

**Order:** 4  
**Type:** Data/security foundation

---

## User Story

As a user, I want durable data to be encrypted and settings to load predictably so private image history and configuration are protected.

## Source Context

This milestone creates the versioned IndexedDB schema, migration system, key records, encryption envelope interfaces, local settings wrappers, and session unlock scaffolding.

---

## Scope

- Define IndexedDB database name, version, stores, indexes, and record shapes.
- Add idempotent migration scaffolding.
- Add key table records keyed by `kind`, `uuid`, and `reference`.
- Add AES-GCM envelope interfaces and WebCrypto wrappers.
- Add local settings wrapper for plaintext non-sensitive settings.
- Add local settings migration scaffolding.
- Add session unlock shape without overbuilding password export/import UI.
- Add repository boundary for durable history writes.

## Out Of Scope

- Full import/export UX.
- WebAuthn/YubiKey implementation.
- Full key rotation UX.
- Search over encrypted history.
- Storing original image bytes.

## Exit Criteria

- IndexedDB initializes and migrates predictably.
- Local settings are accessed only through the wrapper.
- Durable encrypted record format has explicit schema and payload versions.
- Key metadata can support future wrapping changes without rewriting unrelated records.
- A minimal encrypted history record can be written and read through repository boundaries.
- Migration failure surfaces a recoverable status instead of silently corrupting state.

## Primary Modules

- `extension/src/data/db.ts`
- `extension/src/data/schema.ts`
- `extension/src/data/migrations.ts`
- `extension/src/data/local-settings.ts`
- `extension/src/data/local-settings-migrations.ts`
- `extension/src/data/types.ts`
- `extension/src/data/crypto/webcrypto.ts`
- `extension/src/data/crypto/envelope.ts`
- `extension/src/data/crypto/keyring.ts`
- `extension/src/data/crypto/lock.ts`
- `extension/src/data/crypto/types.ts`
- `extension/src/data/repositories/keys-repository.ts`
- `extension/src/data/repositories/history-repository.ts`
- `extension/src/data/runtime/session-unlock.ts`

---

## Acceptance Scenarios

TBD

## Implementation Notes

TBD

## Test Notes

TBD

## Open Questions

TBD
