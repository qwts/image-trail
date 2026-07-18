# Claude Code environment (#671)

Implementation record for the Claude Code track of the agent-environment
hardening tickets (#670 Codex, #671 Claude Code, #672 VS Code, #673 Cursor).
The shared process-tree guard is documented in `docs/agent-process-guard.md`;
this file covers the Claude Code environment end to end: settings
architecture, permissions, hooks, sandboxing, isolation surfaces, execution
behavior, and how to reproduce the setup in another repo.

Facts below were verified against the current Claude Code docs
(code.claude.com/docs) on 2026-07-18; re-verify version-sensitive behavior
when the app updates.

## Settings architecture

Precedence (high → low): managed policy → CLI flags →
`.claude/settings.local.json` → `.claude/settings.json` → `~/.claude/settings.json`.
Permission rules MERGE across scopes; a deny anywhere wins over an allow
anywhere. Placement policy for this repo:

- **`.claude/settings.json` (checked in) — repo policy.** Everything an agent
  session must get mechanically in every checkout and worktree: the
  permissions posture, the guard hooks, `env`, worktree cleanup. This file is
  the enforcement surface; changes to it are reviewed like code.
- **`.claude/settings.local.json` (auto-gitignored) — personal/machine state.**
  Interactive "always allow" approvals accumulate here (since v2.1.211 they
  land in the main checkout even for worktree sessions, so they survive
  worktree removal). Periodically promote durable rules into
  `settings.json` deliberately; do not let the local file become the de facto
  policy.
- **`~/.claude/settings.json` — cross-repo personal preference** (plugins,
  personal allows). Never repo policy.

## Permissions design

The posture: agents here are trusted and fairly unrestricted; permission
rules are backstops and prompt-eliminators, not gates on normal work. Encoded
in `.claude/settings.json` as broad allows plus narrow deny/ask carve-outs
(evaluation order is deny → ask → allow, so the carve-outs win):

- **`defaultMode: "acceptEdits"`** — edits and workspace commands proceed
  without per-action prompts.
- **allow** — the paved road, so approvals do not accumulate ad hoc:
  `npm run *`, `npm test`, `npm ci` / `npm install`, `npx *`,
  `node scripts/*`, `git *`, `gh *`. Anything else still prompts once and can
  be promoted deliberately.
- **deny** — `npm run test:e2e:ui*` / `test:e2e:headed*`: human-only,
  focus-stealing entry points. Layered with the PreToolUse hook (same
  verdict, richer explanation); the permission rule holds even if hooks are
  stripped.
- **ask** — outward-facing, rare, hard to reverse: `npm publish*`,
  `gh release *`, `npm run package:release*`. A single confirmation on a rare
  operation is a checkpoint, not a gate. Routine force-pushes after a rebase
  are deliberately NOT gated (AGENTS.md documents that flow).

Not used: `bypassPermissions` (reserved for container-isolated sessions) and
broad `deny` lists of destructive shell (`rm -rf` theater) — Claude Code's own
protections plus trust cover those.

## Hooks

Hook lifecycle evaluated for mechanical controls; two hooks are wired, the
rest deliberately skipped:

| Event                                     | Decision                                                                                                                                                                                                                                                                                                                                                                         |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PreToolUse` (Bash)                       | **Wired** — `scripts/guard-agent-command.mjs --protocol=claude` denies unguarded test entrypoints (see below).                                                                                                                                                                                                                                                                   |
| `SessionStart`                            | **Wired** — `scripts/guard-session-context.mjs` injects guard state into a new/resumed/compacted session: an ACTIVE guarded run (poll it, don't relaunch) or a previous run KILLED for rss-limit/timeout (real failure; don't rerun with higher limits). This closes the incident's compounding loop — a fresh context no longer discovers a live run by crashing into the lock. |
| `PostToolUse`, `Stop`, `UserPromptSubmit` | Skipped — nothing to enforce mechanically that the guard/lock does not already own; they'd be gates on normal work.                                                                                                                                                                                                                                                              |
| `SessionEnd`, `WorktreeCreate/Remove`     | Skipped — the guard's lock is stale-safe and Claude Code terminates Bash child trees on exit (SIGTERM, exit 143), so there is nothing left to sweep.                                                                                                                                                                                                                             |

Both hooks fail open by design: the guard wrapper is the primary control; the
hooks close the direct-entrypoint bypass and add context.

### Hook scoping (defect fix)

The first hook version pattern-matched raw command text session-wide and
produced false denials (a cross-repo command; a command that merely mentioned
a blocked script inside a string). The hook is now scoped:

- **cwd-aware.** The PreToolUse payload's `cwd` (adjusted for a leading
  `cd <path> &&`) is resolved; commands executing outside a guarded checkout
  are allowed untouched. "Guarded checkout" = inside `CLAUDE_PROJECT_DIR`
  (fallback: the script's own repo root) or any directory whose ancestry
  carries the rollout marker `scripts/run-guarded.mjs` — so other
  checkouts/worktrees of guarded repos stay covered (including their
  subdirectories), and unrelated repos are out of scope.
- **Mentions are not invocations — but nested shell payloads are.** Quoted
  strings and heredoc bodies are stripped before matching, so commit
  messages, PR bodies, and grep patterns that mention `node --test` or
  `test-storybook` pass. The exception: a quoted string that is the payload
  of a nested shell (`bash -lc "…"`, `sh -c '…'`) is executable, so it is
  unwrapped and scanned instead of stripped, recursively. Anything deeper
  (payloads assembled from variables, `node -e` spawning children) falls
  through to the guard wrapper itself — that is the accepted fail-open
  trade.
- **`IMAGE_TRAIL_GUARD_DISABLE` is agent-denied.** The env escape hatch stays
  human-only; the check runs before the `run-guarded.mjs` allowlist so a
  disabled guard invocation cannot slip through.

Covered by `tests/guard-agent-command.test.ts` (verdicts, scoping, stripping,
and both stdin protocols end to end).

Because project settings are checked in, the same hooks apply in the desktop
app, CLI, IDE integration, headless `claude -p`, and SDK runs with project
setting sources enabled (`--bare` skips hooks — treat `--bare` runs as
unguarded-hook environments where the npm scripts are the enforcement point).

## Bash sandboxing (macOS seatbelt) — evaluated, not enabled

Claude Code's built-in sandbox (`sandbox.enabled`) gives OS-enforced
filesystem write containment (working dir + `$TMPDIR`) and a proxy-enforced
network domain allowlist, with auto-allow for sandboxed commands. Evaluated
against this repo's posture:

- It does **not** cap memory, processes, or CPU — it does not address the
  incident class this ticket exists for.
- It breaks or frictions real workflows here: Playwright/Chromium spawning
  under seatbelt, `gh` (Go TLS verification under the proxy), first-use
  domain prompts — gates on normal work for agents we trust.
- Its real wins (blocking `open`/Apple Events → no focus stealing; write
  containment) are covered elsewhere: headless-by-default e2e + hook denial
  of headed scripts, and git worktree isolation.

Decision: **not part of the checked-in posture.** It remains a personal
opt-in via `.claude/settings.local.json` for hostile-input work
(`{"sandbox": {"enabled": true, "excludedCommands": ["gh *"]}}`); the hard
isolation tier for this repo is the devcontainer (kernel cgroup cap), per
`docs/agent-process-guard.md`.

## Isolation surfaces

| Surface                          | What enforces the guard                                                                                                   | Notes                                                                                                |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Desktop app / CLI / IDE (host)   | Checked-in settings: hooks + permissions + guarded npm scripts                                                            | The default tier. Worktree sessions load the same checked-in files.                                  |
| Devcontainer (`.devcontainer/`)  | Guarded scripts + kernel 12 GB cgroup cap; project settings apply inside                                                  | The hard-wall tier for autonomous/long-running sessions; no macOS desktop presence at all.           |
| claude.ai/code cloud sessions    | Guarded npm scripts only — repo `.claude` hooks do NOT transport to cloud VMs (GitHub-sourced, Anthropic-managed VM)      | Acceptable: the VM is isolated from this Mac by construction; a runaway there cannot touch the host. |
| Headless `claude -p` / Agent SDK | Same checked-in settings (project setting sources on by default); `--bare` or disabled setting sources → npm scripts only | Background tasks get ~5 s grace after the final result, then the child process tree is terminated.   |

## Execution behavior

- **Background Bash & poll-before-replace.** Claude Code has no built-in
  "poll before replacing a live command" rule; here it is mechanical anyway:
  the guard's per-worktree lock refuses a second run with instructions to
  poll or terminate, and the SessionStart hook tells a fresh context about an
  active run before it tries. The written rule stays in AGENTS.md as the
  secondary layer.
- **Timeouts.** `env.BASH_MAX_TIMEOUT_MS=1800000` in repo settings aligns the
  Bash tool's ceiling with the guard's largest wall-clock budget (1800 s for
  stories:ci/e2e), so the guard — which kills the whole group and records a
  diagnostic — is the timeout authority for test runs, not the Bash tool's
  10-minute default (which kills only what it can see). The 2-minute default
  timeout for ordinary commands is unchanged.
- **Process-group cleanup.** The guard owns a detached process group with
  TERM→KILL escalation and an exit sweep; Claude Code itself terminates Bash
  child process trees and runs SessionEnd hooks on SIGTERM/app exit (exit
  code 143). Interrupting a session therefore kills the guard, which kills
  the tree.
- **Worktrees.** Sessions run in `.claude/worktrees/<name>` on
  `claude/<name>` branches. `cleanupPeriodDays: 14` (repo settings) bounds
  how long orphaned worktrees and stale session state persist — Claude Code
  sweeps orphaned worktrees at startup on that clock, and since v2.1.210
  stale worktree locks from killed processes are released by the sweep. After
  merge/abandon, remove the worktree from the main checkout
  (`git worktree remove` + `git worktree prune`, per AGENTS.md). If the main
  repo directory ever moves, worktree links break silently — run
  `git worktree repair` from the main checkout. Manual `/tmp` worktrees
  (outside `.claude/worktrees`) are invisible to the sweep; prefer the
  managed location.

## Resource limits

Claude Code has **no native child-process RSS/CPU cap** (doc-verified: Bash
tool limits are time- and output-based only). The compensation stack for this
machine, outermost first:

1. `.devcontainer` cgroup cap — kernel wall, opt-in tier.
2. `scripts/run-guarded.mjs` — aggregate-RSS/heap/timeout/lock, always on
   through the npm entrypoints.
3. PreToolUse hook + permission deny — keeps agents on those entrypoints.
4. Bash tool timeouts + Claude Code's exit-time tree termination — bounds
   anything that escapes the above.

## Reproducing this environment in another repo

Image Trail is the pilot; the rollout is scripted. **Invariants** (identical
everywhere): the three guard scripts, the two hook registrations, the
settings shape (`acceptEdits` + broad-allow/narrow-carve-out permissions,
`BASH_MAX_TIMEOUT_MS`, `cleanupPeriodDays`), `.guard/` gitignored, and a CI
drift check. **Parameters** (decided per repo): which npm scripts are test
entrypoints (wrap them), per-script RSS/timeout ceilings (measure baselines
first — `.guard/history.jsonl`), repo-specific allow/ask/deny rules,
repo-specific blocked patterns, and the devcontainer memory cap.

```sh
# apply to a repo (copies invariants, merges settings, wraps entrypoints):
node scripts/bootstrap-agent-env.mjs --target /path/to/repo --wrap test,test:unit

# verify (also wired into `npm run ci` here as check:agent-env):
node scripts/bootstrap-agent-env.mjs --check --exempt test:compile,test:e2e:coverage
```

`--check` verifies files, settings wiring, hook verdicts on live probe
payloads (in-repo deny, cross-repo silence, quoted-mention silence), and that
every `test*` npm script routes through the guard (transitively; compile-only
helpers are exempted explicitly, never heuristically). The remaining manual
steps are printed by `apply` and are the parameter decisions above plus the
guard selftest from `docs/agent-process-guard.md` ("Safe validation
procedure").
