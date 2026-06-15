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

TBD

## Implementation Notes

TBD

## Test Notes

TBD

## Open Questions

TBD
