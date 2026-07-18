# Agent Instructions

Repo-local agent orientation layer. Read `CONTRIBUTING.md` first, then the wiki
contributor guide it links: https://github.com/qwts/image-trail/wiki/Contributing

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

- **New issue work:** treat the user's request as authorization to implement the
  stated scope. Investigate and root-cause (or confirm scope), state your
  understanding — problem, cause or confirmed scope, and intended changes — then
  proceed without a separate confirmation pause.
- **After scope is established:** update the issue with the problem, root cause
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

- Development is trunk-based: base work on a short-lived branch cut from latest
  `main` and merge back via PR. There is no separate `dev` integration branch.
- Check `git status` before changing anything and preserve unrelated user work.
- For issue work, follow the wiki branch-link/claim-comment flow; post progress
  on the active issue as you implement. Do not add agent identity labels unless
  the user explicitly asks.
- Link the working branch/PR through the issue's GitHub Development sidebar; text comments alone do not power automatic issue close-out.
- Open PRs with explicit close/fix references when the PR should complete an issue.
- Review/issue feedback must get a visible reply before it is resolved or left open: say what commit/code fixed it, why no action was needed, or what linked follow-up owns it.
- Do not resolve GitHub review threads silently. If no code change is needed, reply with the rationale first.
- Commit and push intentional, scoped slices after validation; open the PR ready
  for review, resolve threads after a visible reply, merge when the documented
  checks and review window pass, and complete linked issue state without asking
  for separate approval. Keep every operation scoped to the requested work and
  leave unrelated project state unchanged.
- When a PR merges or issue work is abandoned, clean up the task worktree from the main checkout (`git worktree remove` then `git worktree prune`); see wiki [Contributing](https://github.com/qwts/image-trail/wiki/Contributing).
- If a push seems to not trigger CI, or a PR shows a stale failing check from an
  older commit: check `gh pr view <n> --json mergeable` FIRST. GitHub silently
  creates no `pull_request` workflow runs for a CONFLICTING PR (no merge ref
  exists). Rebase onto `main`, then push — do not rerun or debug the stale check.

## Documentation And Validation

- Wiki-first: long-lived docs, SOP, ADRs, acceptance tests, and agent pitfalls
  belong in the wiki. Other repo markdown should be pointer stubs, except agent
  instruction files (`AGENTS.md`, `CLAUDE.md` files, `.github/copilot-instructions.md`),
  `CONTRIBUTING.md`, root `README.md`, and root `DESIGN.md`.
- Before claiming done on any change (code, docs, or config), run `npm run lint`,
  `npm run format:check`, `npm test`, and `npm run build` for the fast inner loop.
  Before pushing, run `npm run ci`, which chains lint → format:check →
  `check:acceptance-coverage` → `test:cov` → build — the same gates CI enforces,
  including the `.c8rc.json` coverage floor, so a coverage drop or a missing
  acceptance-coverage-map update fails locally instead of on the PR. (`npm test`
  skips the c8 gate for speed; `npm run ci` does not.) Do not report a build you
  did not run; do not break the build.
- **Acceptance coverage map** (`tests/e2e/coverage-map.json`, #343): any change to a
  `.ts`/`.css` file under `extension/src/ui` or `extension/src/content` (excluding
  `*.test.ts`, `*.stories.ts`, and `extension/src/ui/stories/`) must also touch
  `tests/e2e/coverage-map.json` — add or update an entry naming the automated
  (playwright-e2e / storybook / unit-dom), manual, or deferred coverage for that
  change — or the PR needs a `no-acceptance-impact` label/body token.
  `npm run check:acceptance-coverage` (`scripts/check-acceptance-coverage-diff.mjs`)
  enforces this: on a GitHub Actions PR run it reads the PR's changed files/body/
  labels via `gh`; run locally (as part of `npm run ci`, before a PR exists) it
  diffs against the merge-base with `origin/main` instead, so a missing map update
  is caught before pushing rather than first on CI. The local fallback can't read a
  PR body, so it can't honor the opt-out — that only works once the PR exists.
- `npm test` includes the happy-dom suite (`npm run test:dom`, files under
  `tests/dom/`), which runs `node:test` with a real DOM registered via
  `tests/dom/register.ts`. Storybook interaction (`play`) tests run with
  `npm run test:stories` against a dev server on port 6006, or standalone with
  `npm run test:stories:ci` (builds and serves a static Storybook); CI runs the
  latter.
- CI enforces a coverage gate: `npm run test:cov` runs the unit + DOM suites under
  `c8` and fails below the ratcheting thresholds in `.c8rc.json` (currently lines 71 /
  branches 80), writing `coverage/lcov.info` (uploaded as a CI artifact). Raise the
  floor over time as coverage improves; do not lower it to make a change pass.
- **E2E runs as its own path-filtered CI job**, in parallel with the lint/unit/build/
  Storybook `CI` job. The extension is built once in `tests/e2e/global-setup.ts` and
  specs run across workers (`workers: 3`, `fullyParallel: false` — files parallel,
  tests-within-a-spec serial). Parallelism is file-level, so **wall-clock ≈ the slowest
  single spec file**: as flows grow, prefer a _new focused spec file_ over piling onto a
  large one, and split large specs when they dominate. The E2E job is skipped on PRs that
  cannot affect it; the required ruleset check is **`E2E gate`** (a small always-run job),
  not `E2E`. Design, ceiling, and follow-ups: wiki → _Testing Strategy → E2E execution
  model and the parallelism ceiling_ (issue #379).
- **E2E cold-start flake:** the first local parallel run after a build can fail 3–4
  specs with the panel stuck at `visibility: hidden` (styles-ready race under
  worker contention). Rerun the failing spec with `--workers=1` (or rerun the
  suite) before debugging; treat it as a regression only if it fails serially.
- `npm run lint` ends with a type-coverage ratchet (`lint:types`: strict
  `type-coverage` over `extension/src`, floor 99.8%). Same rule as the c8 gate:
  raise the floor as `any`/unsafe spots are removed; never lower it.
- The highest-stakes product invariants (Product Model / Storage Rules) are enforced as
  executable checks: `tests/invariants.test.ts` (recents never persisted, queue order is
  `queueUpdatedAt` not envelope `updatedAt`, Recall pages the queue producer not the blob
  store) plus a `no-restricted-syntax` rule in `eslint.config.js` banning an
  `envelope.updatedAt` sort. Run them together via the `/check` command
  (`.claude/commands/check.md`), which wraps the gates above and reports each invariant.
- Include the following block in change summaries only during an active,
  synchronous collaboration where the agent is building the extension and the
  user is manually testing that build:
  - **Working path:** output of `pwd` — the directory actually edited (Codex
    worktrees are often under `~/.codex/worktrees/`, not the main checkout).
  - **Build identity:** read `extension/dist/build-info.json` after `npm run
build` and paste **Built local** time plus commit, branch, and worktree when
    present (any may be null/absent). Do not paraphrase from memory.
- Omit the Working path / Build identity block from autonomous goal runs,
  background work, routine issue or PR updates, documentation-only changes, and
  any task where the user is not manually testing the build alongside the agent.
- After the first implementation stretch, provide a manual test run before the
  PR enters final review.

## Process-Tree Guard

- Every test entrypoint (`npm test`, `test:unit`, `test:dom`, `test:cov`,
  `test:stories*`, `test:e2e*`) runs through `scripts/run-guarded.mjs`: an
  aggregate RSS ceiling over the whole descendant tree, a per-process Node heap
  cap, a wall-clock timeout, and one guarded run at a time per worktree.
- Never invoke `node --test`, `.test-dist` output, `playwright test`,
  `test-storybook`, or `c8` directly, and never call `:run`/`:inner` npm
  scripts — use the guarded entrypoints. Claude Code and Cursor deny these
  mechanically via checked-in hooks; Codex and raw terminals rely on this rule.
- If a command returns while still running (live session/cell), poll or
  terminate it before launching anything else. The guard refuses a second run
  in the same worktree ("another guarded run is active") — treat that as a
  stop, not a prompt to retry.
- A run killed for `rss-limit`/`timeout` is a real failure: read
  `.guard/last-run.json`, report it, and do not rerun with a higher limit to
  make it pass. Knobs and details: `docs/agent-process-guard.md`.

## Tooling

- Node version is pinned in `.nvmrc`; select it (`nvm use`, or an equivalent
  version manager) before installing dependencies. The GitHub Actions workflows
  read the same `.nvmrc` via `node-version-file`, so `.nvmrc` is the single
  source of truth for local and CI — bump it to move both together.
- Install with `npm ci`, then run the gate with `npm run ci` (equivalently the
  four commands from **Documentation And Validation**: `npm run lint`,
  `npm run format:check`, `npm test`, `npm run build`).
- `npm ci` also installs the husky pre-commit hook (`.husky/pre-commit`), which
  runs `lint-staged` (eslint --fix / prettier on staged files). Fix what it
  flags rather than bypassing it; `git commit --no-verify` is for emergencies.
- User-visible changes should include a changeset (`npx changeset`);
  `npm run changeset:version` consumes them into `CHANGELOG.md` and bumps both
  `package.json` and `extension/manifest.json` together.
- Invoke tools through `PATH` (or `npx` for project binaries). Do not hardcode
  machine-specific absolute paths; `gh`, `gpg`, and other CLIs must resolve from
  the environment.
