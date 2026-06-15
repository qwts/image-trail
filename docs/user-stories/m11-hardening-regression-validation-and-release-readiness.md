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

## Documentation Review Complete

- **Reviewed source context:** Acceptance baseline, behavior map parity checklist, permission/privacy/storage plans, all milestone outputs.
- **Most important build guardrails:** evidence-based release review, clean install/upgrade/recovery validation, permission audit, storage/key audit.
- **Acceptance criteria added from review:** manual regression artifacts, known limitations, recovery notes, documented intentional behavior changes.
- **Still intentionally out of scope:** new feature expansion, server integration, mobile ingestion, photo-library replacement, vector search.

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

- Placeholder sections made the story impossible to execute or verify without rediscovering requirements from the broader docs.
- The story did not explicitly state the reviewed source documents, the module boundaries that must not be crossed, or the framework-adoption constraints.
- The story did not call out the concrete pass/fail acceptance criteria needed to prove manual regression artifacts, known limitations, recovery notes, documented intentional behavior changes.
- The story did not explicitly separate new feature expansion, server integration, mobile ingestion, photo-library replacement, vector search from the work that should be implemented in this milestone.

### Added In This Planning Pass

- Added a documentation-review completion block tying this story to: Acceptance baseline, behavior map parity checklist, permission/privacy/storage plans, all milestone outputs.
- Added concrete acceptance scenarios for manual regression artifacts, known limitations, recovery notes, documented intentional behavior changes.
- Added implementation notes that preserve evidence-based release review, clean install/upgrade/recovery validation, permission audit, storage/key audit.
- Added test notes that can be converted into manual regression checks or automated fixtures before integration.
- Added open questions for decisions that remain unresolved but should not block documenting the intended architecture.

### Coverage Status

- All placeholder planning sections for this story are filled.
- The milestone is now traceable from docs to acceptance criteria to implementation patterns and test notes.
- Remaining uncertainty is isolated under **Open Questions** rather than hidden as missing acceptance criteria.

## Open Questions

- Which items block daily use versus can be documented known limitations?
- What minimal automated regression suite should gate future changes after M11?
