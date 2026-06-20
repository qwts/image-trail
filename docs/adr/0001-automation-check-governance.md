# ADR-0001: Automation Check Governance

## Status

Accepted

## Context

Image Trail relies on automation checks to catch regressions before merge:
formatting, linting, unit tests, builds, CodeQL, and future targeted quality gates.
As PRs and review cleanup grow, the project needs one repo-versioned place to track
why each automation check exists, which use cases it protects, and when PR authors
must update documentation before merging.

This ADR applies to repository automation and review gates. Product automation
features such as slideshow, retry, preload, and request throttling are covered by
the M08 user story and implementation docs.

## Decision

Automation check decisions must be tracked in ADRs when they affect merge
requirements, CI behavior, security review, repository ownership, or the expected
local verification flow.

Every PR author must complete a documentation review before merge:

- If the PR changes behavior, architecture, storage, security boundaries, or CI
  expectations, update the relevant repo doc, user story, acceptance test, or ADR.
- If no documentation update is needed, state that in the PR description with a
  short reason.
- If a reviewer identifies a missing document update, resolve it before merge or
  defer it to a linked issue with rationale.

The PR template must keep documentation review visible beside testing so it is not
treated as optional cleanup after approval.

## Automation Check Use Cases

| Check                  | Protected use case                                                                         | Documentation update trigger                                                      |
| ---------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| `npm run format:check` | Prevent formatting-only churn and unreviewable diffs.                                      | Formatter rules or generated-file expectations change.                            |
| `npm run lint`         | Catch unsafe TypeScript, unused code, and policy drift before review.                      | Lint rules, allowed exceptions, or module-boundary conventions change.            |
| `npm test`             | Protect parser, crypto, storage, UI state, request governance, and import/export behavior. | Test coverage expectations or regression fixtures change.                         |
| `npm run build`        | Verify the extension can compile and package source assets.                                | Build pipeline, module format, manifest handling, or asset-copy behavior changes. |
| CodeQL                 | Catch security and dependency-analysis findings before merge.                              | Security posture, ignored findings, or required query coverage changes.           |
| CODEOWNERS review      | Keep governance files and broad repo changes under owner review.                           | Ownership rules, protected branches, or required reviewer policy changes.         |

## Consequences

- PRs should be blocked from merge when docs are stale for the behavior being
  reviewed.
- Small PRs remain small by documenting follow-up decisions in linked issues or
  ADR updates instead of expanding unrelated implementation scope.
- Review comments that are intentionally ignored or deferred must leave an audit
  trail in the PR, linked issue, or ADR.

## Follow-Up Decisions To Track

- Whether to add a single `npm run ci` command that mirrors GitHub Actions.
- Whether branch protection should require CODEOWNERS review on `main`,
  `codex/dev`, or both.
- Whether future automation checks need their own ADRs or can extend this record.
