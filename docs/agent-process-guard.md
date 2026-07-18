# Agent process-tree memory guard

Implementation record for #670 (Codex), #671 (Claude Code), #672 (VS Code),
#673 (Cursor): every local Image Trail test command now runs through a
repository-owned process-tree guard so a runaway test tree can no longer
exhaust the machine (2026-07-18 incident: a happy-dom `node:test` run grew
~2 GB/s, macOS attributed ~89 GB to the launcher coalition, and the machine was
force-reset twice).

## The guard: `scripts/run-guarded.mjs`

Wraps a command in its own process group (`spawn` with `detached: true`) and
polls `ps -axo pid,ppid,pgid,rss` every 250 ms. Enforced, per run:

| Control               | Default                                                      | Override                                      |
| --------------------- | ------------------------------------------------------------ | --------------------------------------------- |
| Aggregate RSS ceiling | 4096 MB (6144 MB for e2e)                                    | `IMAGE_TRAIL_GUARD_RSS_MB` / `--rss-mb`       |
| Per-process V8 heap   | 2048 MB (`--max-old-space-size`)                             | `IMAGE_TRAIL_GUARD_HEAP_MB` / `--heap-mb`     |
| Wall-clock timeout    | 900 s (1800 s stories:ci/e2e; 0 = off for `--ui`/`--headed`) | `IMAGE_TRAIL_GUARD_TIMEOUT_S` / `--timeout-s` |
| Concurrency           | one guarded run per worktree                                 | `.guard/active.json` lock (stale-safe)        |
| DOM test workers      | 1 (`--test-concurrency=1`)                                   | `test:dom:run` script                         |

Environment variables override the per-script flags, so CI or a human can tune
limits without editing `package.json`. The aggregate-RSS sum counts every
descendant of the wrapped command plus anything still in its process group
(catching orphans that reparent to `launchd`/`init`), so browsers and helper
binaries count — not just V8 heaps.

Termination is graceful-then-forced: `SIGTERM` to the whole group on breach,
`SIGKILL` after 2 s — or immediately if RSS passes 1.25× the ceiling, because a
runaway allocating ~2 GB/s outruns a polite shutdown. `SIGINT`/`SIGTERM`/
`SIGHUP` to the guard (Ctrl-C, client exit, task cancellation) forward the same
group termination, and a final `SIGKILL` sweep runs when the wrapped command
exits, so no descendants survive the guard.

Every run writes a diagnostic record — label, command, peak RSS, peak process
count, duration, limits, exit code, termination reason — to
`.guard/last-run.json` and appends it to `.guard/history.jsonl` (both
gitignored). A run killed for `rss-limit` or `timeout` exits non-zero, so a
test that "passes" while eating 50 GB is a failed test, locally and in CI.

Nested guards pass through (`IMAGE_TRAIL_GUARDED=1` in the child environment),
so chained npm scripts do not deadlock on the worktree lock.
`IMAGE_TRAIL_GUARD_DISABLE=1` is a human escape hatch; it prints a warning.
Windows falls back to passthrough (the guard targets macOS/Linux `ps`).

## Guarded entrypoints

`npm test`, `test:unit`, `test:dom`, `test:cov`, `test:stories`,
`test:stories:ci`, `test:e2e`, `test:e2e:ui`, `test:e2e:headed` (and
`test:e2e:release` via `test:e2e`) all invoke the guard, which runs the
matching `*:inner` script. The `*:run` / `*:inner` scripts are implementation
details — never call them directly.

## Enforcement by environment

### Claude Code (#671)

`.claude/settings.json` registers a `PreToolUse` hook on `Bash`
(`scripts/guard-agent-command.mjs --protocol=claude`) that denies direct
`node --test`, `.test-dist` execution, `playwright test`, `test-storybook`,
`c8`, and `:run`/`:inner` scripts, steering the agent to the guarded
entrypoints. Applies to terminal, IDE integration, and headless runs alike
because project settings are checked in. Background-shell etiquette (poll or
terminate a live command before starting another) is enforced mechanically by
the worktree lock: a second guarded run refuses to start while one is active.

### Cursor (#673)

`.cursor/hooks.json` (`beforeShellExecution`, same script with
`--protocol=cursor`) blocks agent-issued unguarded commands;
`.cursor/rules/process-guard.mdc` (`alwaysApply`) carries the written rule.
Cursor inherits the VS Code task definitions below, and the worktree lock
prevents overlapping agent retries. Hooks are a recent Cursor feature — if a
Cursor version does not honor them, the npm scripts themselves are still
guarded; only the direct-binary bypass reopens.

### VS Code (#672)

`.vscode/tasks.json` defines the test tasks on top of the guarded npm scripts,
so the task runner, npm-scripts explorer, and anything else that shells out to
`npm run …` is guarded with no extra configuration. Stopping a task sends the
usual signals, which the guard forwards to the whole group. A raw integrated
terminal can always type unguarded commands — that is a documented human
bypass, mitigated by the scripts being guard-by-default.

### Codex (#670)

Codex exposes no project-scoped command hook or child-process RSS/coalition
limit (confirmed against the current public manual and installed command
schema), so the enforcement point IS the npm scripts: any `npm test`-family
command Codex runs is guarded. `AGENTS.md` carries the written rules
(secondary control): use guarded entrypoints only; when an execution returns a
live session/cell ID, poll or terminate it before launching anything else —
the worktree lock also refuses a second run mechanically. Recommend
`sandbox_mode = "workspace-write"` in `~/.codex/config.toml` for filesystem
containment; it does not cap memory.

### CI (`.github/workflows/ci.yml`)

CI runs the same npm scripts, so every test step inherits the guard and its
RSS/timeout budgets; `timeout-minutes` on the jobs is the outer backstop.
A memory-runaway or hung suite now fails the build instead of passing on a
16 GB runner.

## Bypass cases (accepted, documented)

- A human (or agent whose environment lacks hooks — e.g. Codex) running raw
  `node --test` / `npx playwright test` in a terminal. Mitigation: guarded
  scripts are the paved road; AGENTS.md forbids the raw forms.
- `IMAGE_TRAIL_GUARD_DISABLE=1` — intentional, warns loudly.
- Non-test entrypoints (`npm run build`, `npm run storybook` dev server) are
  unguarded today; extend with a `--label build` wrapper if they ever misbehave.
- The Claude/Cursor hooks fail open on malformed payloads by design — the
  wrapper, not the hook, is the primary control.

## Safe validation procedure

Never validate with the real DOM suite unguarded. Use a synthetic allocator:

```sh
IMAGE_TRAIL_GUARD_RSS_MB=300 node scripts/run-guarded.mjs --label selftest -- \
  node -e 'const a=[];setInterval(()=>a.push(Buffer.alloc(64<<20,1)),50)'
```

Expected: the guard reports `rss-limit`, the group dies (TERM→KILL), the run
exits 1, and `.guard/last-run.json` records the reason and peak RSS. Timeout
path: same command with `IMAGE_TRAIL_GUARD_TIMEOUT_S=5`. Lock path: start a
guarded run, then a second in the same worktree — it must refuse.

## Baselines (measured 2026-07-18, Apple Silicon, Node 24.18)

See `.guard/history.jsonl` in a working checkout for current numbers; the
ceilings above were set from measured peaks of the full `npm test` and
`npm run test:cov` chains (typecheck + compile + unit + single-worker DOM)
with ~2× headroom. The tickets' 1 GiB research floor was too tight: `tsc`
alone peaks near it. Ratchet ceilings DOWN as measurements allow; never raise
them casually to make a leaking suite pass.

## Limitations (macOS)

- Polling at 250 ms with a ~2 GB/s runaway can overshoot the ceiling by
  ~0.5 GB before SIGTERM lands; the 1.25× hard-kill bounds the tail. There is
  no unprivileged macOS API for a hard aggregate-RSS cap on a process tree
  (`ulimit -v` is ineffective on modern macOS; jetsam limits and
  `ledger`/coalition caps are not settable for user processes).
- `MallocGuardEdges` is a debugging aid, not a memory ceiling; do not enable
  `MallocStackLogging` during runaway reproduction (its logs explode).
- The guard cannot govern processes an agent starts completely outside the
  repo scripts and hooks; VM/container isolation is the next escalation tier
  if that trust boundary is ever crossed.
