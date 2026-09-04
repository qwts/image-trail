# Contributing to Image Trail

This is the canonical contributor and agent workflow guide. Read it before
starting tracked work, and update it when workflow, documentation, issue-claim,
branch, PR, or validation rules change.

Image Trail is built in small, milestone-scoped slices. The canonical milestone,
user-story, acceptance-test, ADR, and project notes live in source-controlled
markdown under `docs/`. Repository documentation is the source of truth.

The changeset requirement, development/release build identity, and automated
version PR flow are defined in [Versioning and Releases](versioning-and-releases.md).

## Before you open a PR

1. **Read the relevant user story** and matching milestone page in `docs/`.
   Scope your change to that milestone's deliverables
   and exit criteria — do not pull forward work from a later milestone unless the
   exit criteria explicitly require it.
2. **Don't reopen unresolved review feedback under a new PR.** Several PRs in this
   repo (#16 → #17 → #18) reintroduced the same defects (`document.documentElement`
   instead of `body`/`head`, leading-edge vs. trailing-edge debounce, `"latest"`
   dependency pins, `moduleResolution: "Bundler"` with no bundler) across multiple
   PRs because the previous PR was closed/abandoned rather than fixed up. If a PR is
   superseded, carry forward every open review comment into the new PR description
   and confirm each one is actually resolved in the diff.
3. **Run the full check locally before pushing:**
   ```
   npm run lint
   npm run format:check
   npm test
   npm run build
   ```
   A PR whose description claims checks passed but that fails CI will be sent back
   without review. If your local Node version cannot run the same reporter as CI,
   use an equivalent ESLint reporter and note the exact command in the PR until
   the repo has a single `npm run ci` wrapper.
4. **Review documentation before merge.** If the PR changes behavior,
   architecture, storage, security boundaries, automation checks, or CI
   expectations, update the relevant markdown documentation under `docs/` in the
   same PR workflow. If no doc update is needed, say why in the PR description.
5. **Capture development decisions as durable rules.** When implementation work
   clarifies product behavior, data flow, security/storage constraints, UI
   invariants, or edge-case handling, write those decisions into the relevant
   markdown documentation under `docs/` before opening the PR. Scope the note to
   the area actually touched:
   UI work should capture UI behavior, service-worker work should capture image
   loading flow, DB/crypto work should capture storage and encryption
   invariants, and cross-cutting work should document each affected boundary.
   These notes are the source material for future automation and must not live
   only in chat, commit messages, or a PR summary.
6. **Write a manual test script for user-visible behavior.** When a PR changes
   UI, browser integration, image loading, storage flows, imports/exports, or
   any behavior that CI cannot fully exercise, include a short step-by-step
   manual test in the PR description. The script should state expected results
   for success, failure, and reset/collapse cases where relevant so reviewers
   can test while CI is still running.

## PR scope control

Large regression bundles are hard to review and easy to destabilize. Agents and
engineers must keep PRs intentionally small:

- **One behavioral objective per PR.** A PR may contain several files only when
  they are required to complete the same user-visible behavior or regression fix.
- **Separate follow-up work into issues.** If a review reveals a legitimate but
  non-blocking adjacent concern, create or link a GitHub issue instead of expanding
  the PR by default.
- **Keep review-fix commits focused.** Review commits should address the reviewed
  concern directly. Do not sneak in unrelated refactors while responding to review.
- **Stop and split when scope changes.** If a PR starts collecting unrelated fixes,
  pause, write down the remaining items, and open separate branches/PRs.
- **Prefer incremental commits.** Once a change reaches roughly 50-100 meaningful
  lines or completes one regression/feature fix, commit it with a specific message.
- **No silent ignored feedback.** Every unresolved review thread must end in one of
  three states before merge:
  - fixed in code, with the commit/test named in a reply;
  - explicitly deferred to a linked issue, with why it is outside this PR;
  - intentionally rejected, with a short technical rationale.
    After the response is posted, mark the review thread resolved in GitHub. If
    no code action is needed, leave the rationale as a PR review-thread reply
    before resolving it. Do not leave the user guessing from chat summaries, and
    do not resolve feedback without a visible explanation on the feedback itself.

## File-size and architecture ratchet

`npm run lint:size` compares changed source, test, and tooling files with the
merge base on `main`. New production/tooling files are capped at 400 physical
lines and new test files at 600. A legacy file already above its ceiling may
stay the same size or shrink, but must not grow. The report includes a
non-blocking next reduction target so cleanup can proceed incrementally without
forcing cosmetic edits into feature work.

When practical, a change that touches an oversized file should extract one
coherent responsibility. Split by architectural role — domain rules,
reducer/state transitions, adapters or repositories, controllers, views,
registries, or shared test support — and preserve the existing import-layer
boundaries. Do not satisfy the check by moving unrelated code into a generic
helper or by deleting useful comments and whitespace. If a safe extraction is
outside the PR's objective, leave the file no larger and create or link a
focused follow-up issue.

## Agent operating rules

Automated coding agents working in this repository must follow the same hygiene as
human contributors, plus these extra rules:

- Continue the current task branch when it cleanly matches the requested work;
  otherwise start from a clean branch off the latest `main`. Branch selection does
  not require separate user approval. Development is trunk-based: there is no
  separate integration branch.
- Before starting implementation from a GitHub issue, claim the issue as the
  first write. Check for active claim signals first: `[WIP]` in the title, an
  assignee, an in-progress/status label, an open linked PR, or a recent claim
  comment. Treat an active claim as a coordination signal: inspect the linked work
  and leave a visible handoff or takeover comment before continuing. Do not pause
  for separate user approval.
- If the issue is unclaimed, create or link the working branch through GitHub's
  Development sidebar before implementation. This makes active work visible
  before a PR exists, but **branch linkage is only a claim signal**. It does not
  create the PR relationship that closes an issue on merge. A text-only branch
  comment is useful context, but it is not enough. Prefer `gh issue develop` so
  the issue shows the branch before a PR exists:

  ```sh
  gh issue develop <issue-number> --base main --name <issue-number>-<short-slug> --checkout
  ```

  If the branch already exists, link it from the issue's Development sidebar
  before opening a PR, then list linked branches with
  `gh issue develop --list <issue-number>` and add a claim comment naming the
  existing branch. Prefer assigning the active developer/agent when possible. If
  assignment is unavailable or unclear, prefix the issue title with `[WIP]` and
  add this claim comment before branch work begins:

  ```
  Claiming this for implementation.

  Branch: `<issue-number>-<short-slug>`
  Scope: <one sentence>
  Plan:
  - <implementation step 1>
  - <implementation step 2>
  - <validation/manual test focus>
  Split risk: <none, or what may need separate issues/PRs>
  Out of scope: <anything intentionally deferred>
  Expected PR: ready PR opened automatically when local validation passes
  ```

  The plan can be brief, but it must be specific enough that another developer
  can tell what files/behavior are likely to change before implementation
  begins. If the issue looks too broad, agents may split it into two tracked
  issues without asking first; document the split on the original issue and name
  what remains in scope for the current branch. If the plan changes materially
  during the work, update the issue with a follow-up comment before continuing
  down the new path.

- If work is abandoned before merge, release the claim with a comment, remove
  `[WIP]` or in-progress labels, and close/delete stale development branches
  where appropriate:
  ```
  Releasing this claim without a PR. No remaining branch work is active from me.
  ```
- If work is abandoned after a PR opened, close the PR when appropriate, remove
  stale claim markers from the issue, and comment:
  ```
  Releasing this claim after closing PR #<number>. No remaining branch work is active from me.
  ```
- When a PR opens, link the **pull request** to the issue through GitHub's
  Development relationship, not just the branch. In the issue sidebar, the
  Development section should show the PR; if it still says "Create a branch or
  link a pull request," the close-out relationship is missing. Also include an
  explicit close/fix reference such as `Closes #123` in the PR body when the PR
  is intended to complete the issue. The linked PR plus the close/fix reference
  is what lets GitHub close the issue automatically on merge. The linked PR
  becomes the active claim signal until merge or abandonment.
- After merge, verify the issue closed and remove any stale `[WIP]` or
  in-progress markers.
- When a PR merges or work is abandoned and no local follow-up remains, clean up
  the task worktree from the **main checkout** so worktrees are not left
  registered indefinitely:
  1. If the worktree directory still exists, remove it with
     `git worktree remove <path>` (add `--force` only when the work is truly done
     and local changes can be discarded).
  2. Run `git worktree prune` to drop stale worktree metadata for directories
     already deleted out of band.
     Agents often work in isolated paths such as Codex worktrees under
     `~/.codex/worktrees/`; treat those the same way. Run both steps from the
     repository that owns the worktree list, not from inside the task worktree.
- If the branch name changes before a PR opens, update the issue claim comment
  or add a follow-up issue comment with the replacement branch name.
- Do not merge unrelated user changes into the task. If the worktree is dirty,
  inspect it and preserve user work.
- Verify before claiming success. At minimum run the same gate CI runs: lint,
  format check, tests, and build.
- After implementation and required local validation pass, commit and push the
  scoped branch and open a ready PR automatically. Do not stop at an uncommitted,
  unpushed, draft, or unpublished handoff merely because the user did not
  separately request publication or review.
- After opening the ready PR, inspect its checks and review feedback. Reply to
  and address actionable comments, then resolve review threads only after the
  fix or rationale is visible on the thread. Start the five-minute review window
  only after the PR is ready. When the window has elapsed, required checks pass,
  and all actionable feedback is visibly addressed, enable auto-merge or merge
  without requesting separate approval.
- If GitHub CodeQL or required checks exist on the PR, wait for them after pushing.
- Keep the user-facing summary short and factual: what changed, what was tested,
  what remains.
- Create tracking issues for legitimate follow-ups that are not fixed in the PR.
  Do not leave "we should later" only in chat.
- When an agent repeats or discovers a local pitfall, record the lesson in the
  issue, PR, or relevant documentation under `docs/`. Fixes and lessons should
  not live only in chat.

## Documentation policy

- Canonical documentation lives in source-controlled markdown under `docs/`.
- Milestone and user-story criteria live in `docs/user-stories/`; acceptance
  coverage lives in `docs/acceptance-tests/`; decisions live in `docs/adr/`;
  versioning and release guidance in `docs/versioning-and-releases.md`; the
  contributor guide in this file.
- Do not add new `https://github.com/qwts/image-trail/wiki` references; the wiki
  is retired. Keep guidance versioned with the code in `docs/`.

## Local environment notes

- Storybook should be run with the repository's expected Node/npm environment and
  the plain command `npm run storybook`.
- If Storybook, browser probes, or dev-server checks fail in an agent sandbox,
  report the exact command and failure. Do not infer visual state from a failed
  sandbox run.

## Branching and PR hygiene

- One PR = one user story / one milestone slice. Don't bundle unrelated modules.
- Don't force-push a stale branch with unrelated content over an open PR. If the
  scope changes substantially, close the PR and open a new one with a clean diff.
- Rebase onto the latest commit of `main` before requesting review. PRs should target
  `main` unless an issue explicitly calls for a different base. A PR in `dirty` or
  `blocked` mergeable state will not be reviewed until it's rebased.
- PR descriptions must include, at minimum:
  - **Motivation** — why this change exists, tied to a milestone/user story.
  - **Description** — what changed, file by file or module by module.
  - **Documentation** — docs updated, ADR/user story/acceptance test linked, or
    why no documentation change is needed.
  - **Testing** — exact commands run and their results. "All tests passed" without
    naming which tests were run is not sufficient.
  - **Manual testing** — step-by-step browser/manual checks for user-visible
    behavior, or why the change is fully covered by automated tests.

## Code review expectations

These are the recurring defect categories from past reviews. Check your own diff
against this list before requesting review — it is the fastest way to avoid a
round-trip:

### Correctness

- **DOM mount targets:** UI elements must be appended to `document.body` (or
  `document.head` for stylesheets), never to `document.documentElement` directly.
- **Idempotent injection:** content-script/listener registration must guard against
  double-injection (ping-before-inject, a `window.__*Controller` guard, or
  equivalent). Never register a second `chrome.runtime.onMessage` listener on the
  same page.
- **Single source of truth for state transitions:** a reducer/state update should run
  exactly once per dispatched action. Don't call the same reducer both inside
  `dispatch` and again inside whatever cleanup function `dispatch` delegates to.
- **Debounce direction:** when coalescing bursty events (`MutationObserver`,
  rapid input), default to **trailing-edge** debounce (reset the timer on every
  event) unless a leading-edge response is explicitly required and documented.
- **Mouse handlers:** click handlers that call `preventDefault()` /
  `stopImmediatePropagation()` must first check `event.button` so right-click /
  middle-click aren't silently suppressed.

### Configuration

- **No `"latest"` in `package.json` dependencies.** Pin an exact version or a `^`
  range; rely on `package-lock.json` for reproducibility, not the manifest.
- **`tsconfig.json` `moduleResolution` must match the actual build pipeline.** This
  project builds with plain `tsc` and no bundler. `"moduleResolution": "NodeNext"`
  requires `"module": "NodeNext"` as well (TypeScript rejects `NodeNext` resolution
  paired with `"module": "ES2022"` — TS5110) — change both settings together, not
  just one. If a bundler is introduced (see Milestone 10), update this
  intentionally, not by copy-paste.
- **Permissions stay least-privilege.** Don't add `host_permissions` or new
  `permissions` entries beyond what the current milestone's exit criteria require
  (see "Avoid broad host permissions up front" in `docs/milestones.md`).

### Architecture (see `.github/ISSUE_TEMPLATE/user-story.md` for the full list)

- Keep `core/`, `data/`, `content/`, `background/`, and `ui/` boundaries intact.
  Parser, storage, crypto, and navigation logic must not be absorbed into UI
  rendering code.
- Views render from serializable state and dispatch named actions only.
- Centralize repeated primitives (DB transaction helpers, status codes, DOM
  cleanup) instead of duplicating them across modules. If you find yourself
  copy-pasting a helper function into a second file, extract it instead.

### Testing

- Any new pure function (reducers, parsers, crypto envelope helpers, schema
  constants) must ship with unit tests in the same PR — these have no DOM or
  extension-API dependency and are always testable in `node --test`.
- Code that touches `IndexedDB`, `chrome.*` APIs, or the DOM should be reviewed for
  testability even where it isn't unit-tested yet (e.g. via `fake-indexeddb`
  or a documented manual acceptance test under `docs/acceptance-tests/`). "No
  automated tests" is acceptable only when the PR description explains why and
  links the manual acceptance scenario that covers it.
- Manual tests should be concrete enough for a reviewer to run without
  rediscovering the workflow: include setup URL/data, actions, expected visible
  result, expected failure behavior, and any state reset/collapse behavior.
- Don't leave unused function parameters as a way of silencing "declared but
  unused" - either use the parameter or remove it.

### Security (data/crypto code specifically)

- Long-lived raw key material must not be persisted in plaintext (see Milestone 4
  exit criteria). Session-only keys must actually be retained for reuse, not just
  represented as a reference with no backing `CryptoKey`.
- Encrypted envelope and key-record schemas are versioned independently
  (`schemaVersion`, `payloadVersion`) — don't collapse them into a single version
  number.
- New crypto primitives should be reviewed against the threat model implied by the
  user story before merge, not after.

## Style

- Required lint and formatting checks are wired into CI. Run them locally before
  pushing and do not mix formatting-only churn into feature commits unless the
  formatter is part of the requested change or required to make CI pass.
- Comments should explain _why_, not _what_. Don't restate what a well-named
  function already says.

## Documentation

- Keep repository docs limited to source-adjacent material that must version with
  the code: architecture contracts, acceptance tests, milestone criteria, and
  migration notes.
- Track automation-check and merge-gate decisions in
  `docs/adr/0001-automation-check-governance.md`. Update it when a PR changes CI
  requirements, code-owner enforcement, required local checks, security-scan
  policy, or the rationale for ignoring/deferring automation-related review
  feedback.
- If your change affects a milestone's deliverables or exit criteria, update
  `docs/milestones.md` and the relevant file in `docs/user-stories/` in the same
  PR.
- If your change resolves or adds an open question from a user story, update that
  story's "Open Questions" / "Acceptance Criteria Coverage Review" sections.
