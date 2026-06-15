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

- IndexedDB opens with named stores, version metadata, and idempotent migrations.
- Repository methods are the only durable-data access path used by higher layers.
- Encrypted envelope records include schema version, payload version, algorithm, IV, key reference, created/updated timestamps, and authenticated metadata where appropriate.
- Key records are indexed by `kind`, `uuid`, and `reference` and contain enough wrapping metadata for future password/WebAuthn rotation.
- No raw long-lived key material is persisted in plaintext storage.
- Plaintext local settings are limited to non-sensitive values and flow through typed defaults/migrations.
- Migration/open/encryption failures surface recoverable statuses and leave prior readable state when possible.

## Planning Discipline To Apply Before Build

- **Shift-left validation:** confirm contracts, threat model notes, edge cases, and regression checks before implementation begins. Add fixtures or manual checks before wiring broad UI behavior.
- **DRY and explicit interfaces:** centralize repeated schemas, actions, repository calls, status codes, and DOM cleanup primitives rather than copying logic into views.
- **Single responsibility:** keep parser, storage, crypto, target DOM integration, background permissions, and UI rendering in their own bounded modules.
- **React-ready modularity:** views should render from serializable state and dispatch named actions; no view should own parser, crypto, persistence, network governance, or target-image business rules.
- **Change isolation:** volatile browser APIs, storage formats, permission prompts, LLM endpoints, and future React/Vite rendering must sit behind adapters.
- **Secure/testable defaults:** default to least privilege, bounded storage/request behavior, typed validation, and pure core functions that can be tested without DOM, network, or extension APIs.

## Implementation Notes

- Use Repository, Unit-of-Work-lite transaction helpers, and Envelope patterns.
- Keep WebCrypto wrappers small and injectable for tests; validate IV/key sizes and algorithm names at boundaries.
- Separate runtime unlock state from durable key metadata because MV3 service workers are disposable.
- Classify each setting as plaintext, encrypted, or session-only before adding it.
- Design payload schemas as versioned contracts, not ad hoc JSON blobs.

## Test Notes

- Open DB in a clean profile and verify stores/indexes/version.
- Write/read one encrypted history record through repository boundaries.
- Simulate unknown/corrupt envelope and verify safe failure.
- Persist a local setting, reload, and verify typed default/migration behavior.

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

- What is the initial unlock mode for developer builds: generated session key, password-wrapped key, or explicit test fixture key?
- Which settings are considered sensitive enough to move out of plaintext immediately?
