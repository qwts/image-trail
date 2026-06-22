# Agent Instructions

## Product Model: Do Not Confuse These

- Recents are transient session state only. Do not persist recents as durable memory unless the user explicitly pins/bookmarks.
- Pins are durable queue records. Persist pins immediately when they enter the queue.
- Bookmarks are pins with an associated captured original photo.
- Original-photo storage is separate from pin/bookmark metadata storage.
- Thumbnail, URL, dimensions, and display metadata live with the durable pin/bookmark record.
- Captured original bytes live in the encrypted blob/original store and are linked from the pin/bookmark.
- Recall pages offscreen durable pins/bookmarks from the queue producer.
- Recall must not page encrypted blobs directly.
- Recall must not clone visible queue state.
- Recall selected moves durable pins to the front of the queue, reloads visible queue page 0, and refreshes Recall from the post-softmax window.
- A future "pin without original" feature is still a durable pin. It is not the same thing as capture.

## Storage Rules

- Extension-owned settings and storage must not use host-page `localStorage`.
- Use IndexedDB or extension-owned message-backed repositories for cross-site extension state.
- Queue ordering is `queueUpdatedAt`, not encrypted envelope `updatedAt`.
- Refreshing metadata or thumbnails must preserve queue order unless the action intentionally moves a pin.
- Do not reseal encrypted bookmark metadata just to reorder queue records.
- Keep original-photo/blob APIs separate from bookmark queue APIs. Capture stores bytes first, then updates pin/bookmark metadata with captured state.

## UI Rules

- Main bookmark queue and Recall rows should stay visually consistent.
- Thumbnail and extension label treatments are stable UI primitives; do not casually redesign them.
- Selected state must remain visually distinct from stored/captured-original state.
- Stored original should be an indicator, not a competing selected-row background.
- Avoid full panel/list rerenders and visible flicker where targeted refresh is practical.
- Recall drawer positioning should remain relative to the panel.

## Branch Hygiene

1. Read `CONTRIBUTING.md` first.
2. Check repo status before changing anything.
3. Start clean from latest `codex/dev` unless the user explicitly says to continue the current branch:
   - `git fetch --prune`
   - `git switch codex/dev`
   - `git pull --ff-only`
   - create a new `codex/...` branch for the work.
4. Do not use `main` as the base. Base is `codex/dev`.
5. Clear direction with the user before making broad changes.
6. Keep changes scoped to what was requested.
7. Preserve unrelated user changes. Do not stage, revert, or format unrelated dirty files.
8. Do not commit, push, or open a PR until the user signs off.

## Documentation

- Document behavior and decisions worked out during a PR so future engineers/models do not lose product rules.
- Longer-lived narrative/project docs belong in the GitHub wiki.
- Repo docs are for source-adjacent contracts, acceptance tests, architecture notes, migrations, and CI/automation policy.
- If a PR changes behavior but repo docs are not updated, explain why in the PR description.

## GitHub And Wiki Operations

- Normal developer-flow git commands, GitHub issue/PR updates, and GitHub wiki edits are authorized by the CODEOWNER and user when they are requested, advised, or necessary to complete the tracked work.
- Before starting implementation from a GitHub issue, check the issue for an existing active claim/in-progress note. If it is unclaimed, update the issue by assignment, label/status change, or a short comment so parallel agents do not duplicate the work.
- When opening a PR for tracked issue work, link the issue in the PR body with an explicit close/fix reference when the PR is intended to complete it. After merge, verify the issue actually closed; if automation missed it, close the issue with a comment naming the merged PR.
- When a change request, follow-up, known bug, or deferred improvement is discovered, capture it as a GitHub issue or documented project note so it can be tracked and resolved in future work.
- Keep GitHub and wiki writes scoped to the current task. Do not close issues, resolve review threads, merge PRs, or make broad project-management changes unless the user explicitly asks.
- Prefer durable tracking over chat-only notes for decisions or follow-ups that future engineers/models will need.

## Validation

Before claiming done, run:

- `npm run lint`
- `npm run format:check`
- `npm test`
- `npm run build`

If a pre-existing unrelated file breaks a check, do not hide it. Report it clearly and run targeted validation for touched files when useful.

## Manual Verification Handoff

After the first implementation stretch, provide a manual test run before asking for final signoff or PR approval.

The manual test run should include:

- the primary user-facing flows changed by the PR
- expected results for each flow
- persistence, reload, and scope checks when storage or queue state is involved
- locked/private/encrypted-state checks when relevant
- nearby regression checks for behavior likely to be affected
- any risks or behavior not verified locally

If the change affects product rules, storage semantics, or acceptance criteria, update the relevant repo acceptance doc or wiki-linked project documentation in the same PR.

## Tool Paths

If Codex cannot resolve a tool from `PATH`, use these absolute paths:

- `gh`: `/opt/homebrew/bin/gh`
- `npm`: `/Users/chris/.nvm/versions/node/v20.10.0/bin/npm`
- `node`: `/Users/chris/.nvm/versions/node/v20.10.0/bin/node`
- `gpg`: `/opt/homebrew/bin/gpg`
