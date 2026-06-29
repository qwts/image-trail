# Agent Instructions

Repo-local agent orientation layer. Read `CONTRIBUTING.md` first, then the wiki
contributor guide it links: https://github.com/qwtm/image-trail/wiki/Contributing

Keep this file compact; use references instead of duplicating long procedures.
Detailed workflow, SOP, and project documentation belong in the wiki.

Codex loads this file (and `~/.codex/AGENTS.md`) at session start. If behavior
drifts, verify the active checkout — Codex worktrees under `~/.codex/worktrees/`
can carry a stale copy until rebased or restarted from the main repo.

## Communication

- Be brief: minimum words, bullets over paragraphs, no preamble, recap, or filler.
- Fix the problem; no sycophancy, apologies, or narrating past mistakes unless
  required for the fix.
- On correction: one-sentence restatement of updated requirements, then proceed.
- Disagree plainly when mistaken; cite code or docs.
- Do not narrate unsolicited intent or process. No play-by-play ("I'm going back
  into the code", "I'll make the cache do X"), no partial-completion confessions
  ("I fixed A but not B"), no argumentative or defensive tone. Required
  pre-edit checkpoints in **Before Changing Code** are exempt — deliver those
  once, then implement without ongoing narration.
- Do not announce next steps. If more work is needed, do it or ask one direct
  question; do not describe what you will try.
- Status updates belong in issue comments during issue work, not in chat unless
  the user asked for progress.

## Before Changing Code

- **New issue work:** investigate and root-cause (or confirm scope) before
  editing. State your understanding — problem, cause or confirmed scope, and
  intended changes — and ask if it is correct. Do not edit files until the user
  confirms or explicitly tells you to proceed.
- **After confirmation:** update the issue with the agreed problem, root cause
  or scope, and plan (issue comment per wiki claim flow).
- **During implementation:** post issue comments for each meaningful change
  slice: what changed and why.
- **Before editing:** state in one short line each: likely fix, why it may not
  work, confidence (low/medium/high), possible regressions. Then implement.

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
- For issue work, follow the wiki branch-link/claim-comment flow; post progress
  on the active issue as you implement. Do not add agent identity labels unless
  the user explicitly asks.
- Link the working branch/PR through the issue's GitHub Development sidebar; text comments alone do not power automatic issue close-out.
- Open PRs with explicit close/fix references when the PR should complete an issue.
- Review/issue feedback must get a visible reply before it is resolved or left open: say what commit/code fixed it, why no action was needed, or what linked follow-up owns it.
- Do not resolve GitHub review threads silently. If no code change is needed, reply with the rationale first.
- Commit intentional, scoped slices regularly after validating them; do not push, open PRs, close issues, resolve threads, or update broad project state unless the user has asked for that step.

## Documentation And Validation

- Wiki-first: long-lived docs, SOP, ADRs, acceptance tests, and agent pitfalls
  belong in the wiki. Other repo markdown (except `AGENTS.md`, `CONTRIBUTING.md`,
  root `README.md`) should be pointer stubs.
- Before claiming done on any change (code, docs, or config), run `npm run lint`,
  `npm run format:check`, `npm test`, and `npm run build`. CI runs the same
  gates; do not skip them locally. Do not report a build you did not run; do
  not break the build.
- Every change summary (chat reply, issue comment, PR body) must end with:
  - **Working path:** output of `pwd` — the directory actually edited (Codex
    worktrees are often under `~/.codex/worktrees/`, not the main checkout).
  - **Build identity:** read `extension/dist/build-info.json` after `npm run
build` and paste **Built local** time plus commit, branch, and worktree when
    present (any may be null/absent). Do not omit this block; do not paraphrase
    from memory.
- After the first implementation stretch, provide a manual test run before asking for final signoff or PR approval.

## Tool Paths

If a tool is missing from `PATH`, use:

- `gh`: `/opt/homebrew/bin/gh`
- `npm`: `/Users/chris/.nvm/versions/node/v20.10.0/bin/npm`
- `node`: `/Users/chris/.nvm/versions/node/v20.10.0/bin/node`
- `gpg`: `/opt/homebrew/bin/gpg`
