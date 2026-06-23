# Agent Instructions

This file is a compact orientation layer. Read `CONTRIBUTING.md` first, then the
canonical GitHub wiki contributor guide it links:

- https://github.com/qwtm/image-trail/wiki/Contributing

Keep detailed workflow/SOP changes in the wiki. Keep this file under roughly
100 lines and use references instead of duplicating long procedures.

## Product Model

- Recents are transient session state only. Do not persist them unless the user explicitly pins/bookmarks.
- Pins are durable queue records and must persist immediately when they enter the queue.
- Bookmarks are pins with an associated captured original photo.
- Thumbnail, URL, dimensions, and display metadata live with the durable pin/bookmark record.
- Captured original bytes live separately in the encrypted blob/original store and are linked from the pin/bookmark.
- Recall pages offscreen durable pins/bookmarks from the queue producer.
- Recall must not page encrypted blobs directly, clone visible queue state, or add records to recents.
- Recall selected moves durable pins to the front of the queue, reloads visible queue page 0, and refreshes Recall from the post-softmax window.
- A future "pin without original" feature is still a durable pin. It is not capture.

## Storage Rules

- Extension-owned settings and storage must not use host-page `localStorage`.
- Use IndexedDB or extension-owned message-backed repositories for cross-site extension state.
- Queue ordering is `queueUpdatedAt`, not encrypted envelope `updatedAt`.
- Refreshing metadata or thumbnails must preserve queue order unless the action intentionally moves a pin.
- Do not reseal encrypted bookmark metadata just to reorder queue records.
- Keep original-photo/blob APIs separate from bookmark queue APIs.

## UI Rules

- Main bookmark queue and Recall rows should stay visually consistent.
- Thumbnail and extension label treatments are stable UI primitives; do not casually redesign them.
- Selected state must remain visually distinct from stored/captured-original state.
- Stored original should be an indicator, not a competing selected-row background.
- Avoid full panel/list rerenders and visible flicker where targeted refresh is practical.
- Recall drawer positioning should remain relative to the panel.

## Branch And GitHub Hygiene

- Base work on latest `codex/dev`; do not use `main` as the base.
- Check `git status` before changing anything and preserve unrelated user work.
- For issue work, follow the wiki claim flow before implementation.
- Link the working branch/PR through the issue's GitHub Development sidebar; text comments alone do not power automatic issue close-out.
- Open PRs with explicit close/fix references when the PR should complete an issue.
- Do not commit, push, open PRs, close issues, resolve threads, or update broad project state unless the user has asked for that step.

## Documentation And Validation

- Long-lived narrative/project docs and workflow/SOP rules belong in the GitHub wiki.
- Repo docs are for source-adjacent contracts, acceptance tests, architecture notes, migrations, and CI/automation policy.
- After the first implementation stretch, provide a manual test run before asking for final signoff or PR approval.
- Before claiming done, run:
  - `npm run lint`
  - `npm run format:check`
  - `npm test`
  - `npm run build`

## Tool Paths

If a tool is missing from `PATH`, use:

- `gh`: `/opt/homebrew/bin/gh`
- `npm`: `/Users/chris/.nvm/versions/node/v20.10.0/bin/npm`
- `node`: `/Users/chris/.nvm/versions/node/v20.10.0/bin/node`
- `gpg`: `/opt/homebrew/bin/gpg`
