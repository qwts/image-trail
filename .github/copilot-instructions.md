# Copilot Review Instructions

Review Image Trail changes against the product model and repo workflow, not only
general TypeScript style.

## Product Model

- Recents are transient session state. Do not treat them as durable memory unless
  the user explicitly pins/bookmarks.
- Pins are durable queue records and should persist when they enter the queue.
- Bookmarks are pins with an associated captured original photo.
- Original-photo bytes live in the encrypted blob/original store. They are
  separate from pin/bookmark metadata and encrypted thumbnail storage.
- Recall pages durable pins/bookmarks from the queue producer. It must not page
  encrypted blobs directly or clone visible queue state.
- Queue order is `queueUpdatedAt`. Do not reseal encrypted metadata only to
  reorder records.

## Review Priorities

- Flag privacy leaks where URL, title, thumbnail, dimensions, generated metadata,
  or other sensitive pin data moves into plaintext storage without an explicit
  setting or documented exception.
- Flag destructive storage paths that delete original-photo blobs without going
  through the existing relationship/reference-count rules.
- Flag UI changes that blur selected state with stored/captured-original state.
  A stored original should be an indicator, not a selected-row background.
- Flag broad rewrites, unrelated refactors, or formatting churn in narrow PRs.
- Prefer comments that identify user-visible bugs, state corruption, storage
  loss, privacy regressions, or missing tests.

## Clear And Delete Language

- `Clear` means undoable or presentation-only removal.
- `Delete` means destructive removal.
- Delete recents is destructive because recents are transient and unrecoverable.
- Queue and Recall clear actions must not delete durable pins/bookmarks or
  original blobs.
- Bulk destructive queue and Recall delete actions belong in Settings.

## GitHub And Branch Workflow

- The integration branch is `codex/dev`; do not assume `main` is the active base.
- Tracked work should link the pull request to its issue and include an explicit
  closing reference such as `Closes #123` when the PR completes the issue.
- Branch linkage is only a claim signal. The PR relationship and closing
  reference are still required.
- When a PR changes behavior, storage, security, CI, automation, or workflow
  expectations, expect a matching repo doc, ADR, acceptance test, or wiki update.

## Expected Validation

Before a PR is called ready, expect these checks unless the PR clearly explains
why one could not run:

- `npm run lint`
- `npm run format:check`
- `npm test`
- `npm run build`
