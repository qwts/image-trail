# Contributing to Image Trail

Image Trail is built in small, milestone-scoped slices (see `docs/milestones.md` and
`docs/user-stories/`). This document codifies the rules that recent PRs (#15–#19) have
repeatedly needed in review, so they're enforced _before_ a PR is opened instead of
caught after the fact.

## Before you open a PR

1. **Read the relevant user story** in `docs/user-stories/` and the matching milestone
   section in `docs/milestones.md`. Scope your change to that milestone's deliverables
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
   npm test      # typecheck + unit tests
   npm run build # production build
   ```
   A PR whose description claims tests/build passed but that fails CI will be sent
   back without review.

## Branching and PR hygiene

- One PR = one user story / one milestone slice. Don't bundle unrelated modules.
- Don't force-push a stale branch with unrelated content over an open PR. If the
  scope changes substantially, close the PR and open a new one with a clean diff.
- Rebase onto the latest commit of the PR's base branch before requesting review (check
  the PR's own "base" field — it is not always the same branch for every PR in this
  repo). A PR in `dirty` or `blocked` mergeable state will not be reviewed until it's
  rebased.
- PR descriptions must include, at minimum:
  - **Motivation** — why this change exists, tied to a milestone/user story.
  - **Description** — what changed, file by file or module by module.
  - **Testing** — exact commands run and their results. "All tests passed" without
    naming which tests were run is not sufficient.

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

- No required linter/formatter is wired up yet (see the tracking issue for adding
  one). Until then, match the existing style in the file you're editing rather than
  introducing a new convention, and prefer readable multi-line code over dense
  single-line classes/functions — reviewers need to be able to diff individual
  statements.
- Comments should explain _why_, not _what_. Don't restate what a well-named
  function already says.

## Documentation

- If your change affects a milestone's deliverables or exit criteria, update
  `docs/milestones.md` and the relevant file in `docs/user-stories/` in the same PR.
- If your change resolves or adds an open question from a user story, update that
  story's "Open Questions" / "Acceptance Criteria Coverage Review" sections.
