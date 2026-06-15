# M11: Hardening, Regression Validation, And Release Readiness

**Order:** 11  
**Type:** Hardening

---

## User Story

As a developer, I want the extension to be reliable, recoverable, and privacy-conscious before treating it as the primary workflow.

## Source Context

This milestone validates Brave/Chromium behavior, storage migrations, encryption boundaries, permission prompts, request throttling, data recovery, and regression parity against the bookmarklet baseline.

---

## Scope

- Run manual regression tests against M00 fixtures.
- Verify Brave-specific behavior for extension injection, storage, permissions, image loading, canvas restrictions, and downloads.
- Review host permission posture.
- Review encrypted record and key-wrapping assumptions.
- Test migration failure and recovery behavior.
- Test import/export restore path with a clean profile.
- Test storage growth, deletion, and orphan cleanup.
- Test automation stop/throttle behavior.
- Document known limitations and recovery steps.

## Out Of Scope

- Server integration.
- Mobile ingestion.
- Photo-library replacement semantics.
- Vector search.

## Exit Criteria

- Known bookmarklet workflows pass or have documented intentional changes.
- Clean install, upgrade, import, export, and delete flows are manually verified.
- Permission prompts are narrow and understandable.
- Storage usage and cleanup behavior are verified.
- No known migration can silently destroy readable prior data.
- Known limitations are documented before daily use.

## Primary Artifacts

- `docs/manual-regression-checklist.md`
- `docs/privacy-and-permissions-review.md`
- `docs/storage-and-recovery-notes.md`
- `docs/known-limitations.md`

---

## Acceptance Scenarios

- All known bookmarklet parity workflows pass or are documented as intentional changes with migration notes.
- Clean install, upgrade, migration failure, export/import restore, delete/orphan cleanup, and storage pressure paths are verified.
- Permission prompts are narrow, understandable, and tied to explicit user actions.
- Encryption/key wrapping assumptions are reviewed; no long-lived raw keys are found in plaintext storage.
- Automation/request governance cannot runaway under stress/manual interruption.
- Known limitations and recovery steps are documented before daily use.
- Manual regression checklist, privacy review, storage/recovery notes, and known limitations artifacts exist.

## Planning Discipline To Apply Before Build

- **Shift-left validation:** confirm contracts, threat model notes, edge cases, and regression checks before implementation begins. Add fixtures or manual checks before wiring broad UI behavior.
- **DRY and explicit interfaces:** centralize repeated schemas, actions, repository calls, status codes, and DOM cleanup primitives rather than copying logic into views.
- **Single responsibility:** keep parser, storage, crypto, target DOM integration, background permissions, and UI rendering in their own bounded modules.
- **React-ready modularity:** views should render from serializable state and dispatch named actions; no view should own parser, crypto, persistence, network governance, or target-image business rules.
- **Change isolation:** volatile browser APIs, storage formats, permission prompts, LLM endpoints, and future React/Vite rendering must sit behind adapters.
- **Secure/testable defaults:** default to least privilege, bounded storage/request behavior, typed validation, and pure core functions that can be tested without DOM, network, or extension APIs.

## Implementation Notes

- Use Release Checklist and Threat Model Review patterns; hardening is evidence collection, not feature expansion.
- Run parity tests from M00 through M09 and update docs with exact pass/fail/deferral.
- Audit module boundaries for React-ready and framework-independent core promises.
- Verify observability/status messages are sufficient for user recovery without exposing sensitive data.

## Test Notes

- Run manual regression checklist across Brave/Chromium.
- Test clean profile import/export restore.
- Inspect storage for raw key/plaintext sensitive data.
- Stress automation/request caps and stop behavior.

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

- Which items block daily use versus can be documented known limitations?
- What minimal automated regression suite should gate future changes after M11?
