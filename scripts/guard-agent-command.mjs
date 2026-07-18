#!/usr/bin/env node

// Agent command hook (#670 Codex, #671 Claude Code, #673 Cursor): denies
// shell commands that would run Image Trail test entrypoints WITHOUT the
// process-tree guard (scripts/run-guarded.mjs). The guarded npm scripts are
// the allowed path.
//
// Protocols (selected with --protocol=claude|cursor|codex):
//   claude — Claude Code PreToolUse hook. Reads the full hook payload
//     ({cwd, tool_input:{command}}) on stdin; denies via
//     hookSpecificOutput.permissionDecision.
//   cursor — Cursor beforeShellExecution hook. Reads {command, cwd?} on
//     stdin; replies {permission:"deny"|"allow", ...}.
//   codex — Codex PreToolUse hook (.codex/hooks.json). Same payload and wire
//     format as claude, but tool_input.command may be an argv array (Codex's
//     shell tool takes ["bash","-lc","…"]); arrays are joined before
//     matching. Codex's execpolicy rules (.codex/rules/) hard-forbid the
//     clean argv prefixes; this hook closes the argument-order and
//     shell-wrapped variants the prefix matcher cannot see
//     (e.g. `node --import … --test`).
//
// Scoping: the hook only polices commands that execute inside a guarded
// checkout — this repo (or worktree), or any directory whose ancestry
// carries the guard marker (scripts/run-guarded.mjs). Commands whose
// working directory is elsewhere (cross-repo work from the same session)
// are allowed untouched, as are blocked-pattern mentions inside quoted
// strings or heredocs (commit messages, PR bodies, grep patterns) — except
// nested shell payloads (`bash -c "..."`), which are executable and are
// unwrapped and scanned.
//
// Fail-open by design: a malformed payload allows the command rather than
// bricking every shell call — the guard wrapper itself is the primary control;
// this hook only closes the direct-entrypoint bypass.

import { existsSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, resolve, sep } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const GUIDANCE =
  'Use the guarded npm scripts instead: npm test, npm run test:unit / test:dom / test:cov / ' +
  'test:stories / test:e2e. They wrap scripts/run-guarded.mjs (aggregate RSS ceiling, heap cap, ' +
  'timeout, one-run-per-worktree). See docs/agent-process-guard.md.';

const BLOCKED = [
  {
    // Direct node:test invocations (the incident path): node --test ...
    pattern: /\bnode\b[^\n;&|]*\s--test(?![\w-])/u,
    what: 'direct `node --test` invocation',
  },
  {
    // Running compiled test output directly (node --import ./.test-dist/...).
    pattern: /\bnode\b[^\n;&|]*\.test-dist\b/u,
    what: 'direct execution of compiled tests in .test-dist',
  },
  {
    pattern: /\bplaywright\s+test\b/u,
    what: 'direct Playwright invocation',
  },
  {
    pattern: /\btest-storybook\b/u,
    what: 'direct Storybook test-runner invocation',
  },
  {
    pattern: /(^|[\s;(&|])(npx\s+)?c8\s/u,
    what: 'direct c8 coverage invocation',
  },
  {
    // Inner/unguarded npm scripts (test:unit:run, test:dom:run, *:inner).
    pattern: /\bnpm\s+run\s+[\w:.-]*:(run|inner)(?![\w:-])/u,
    what: 'unguarded inner npm script',
  },
  {
    // Headed/interactive runs open GUI windows on the shared desktop and steal
    // the user's focus. Human-only; agents use headless test:e2e.
    pattern: /\bnpm\s+run\s+test:e2e:(ui|headed)(?![\w:-])/u,
    what: 'headed/interactive e2e run',
    reason:
      "Blocked headed/interactive e2e run: GUI windows on the shared desktop steal the user's " +
      'focus. These scripts are human-only; agents run the headless `npm run test:e2e` instead. ' +
      'See docs/agent-process-guard.md.',
  },
];

// The guard's human escape hatch. Agents must not disable the guard to make a
// killed run pass; a human can export it in their own terminal. Checked before
// the run-guarded.mjs allowlist so "IMAGE_TRAIL_GUARD_DISABLE=1 node
// scripts/run-guarded.mjs ..." does not slip through as a sanctioned run.
const GUARD_DISABLE = {
  pattern: /\bIMAGE_TRAIL_GUARD_DISABLE=/u,
  reason:
    'Blocked IMAGE_TRAIL_GUARD_DISABLE: disabling the process-tree guard is a human-only ' +
    'escape hatch. A run killed for rss-limit/timeout is a real failure — read ' +
    '.guard/last-run.json and report it instead of bypassing the guard. ' +
    'See docs/agent-process-guard.md.',
};

// Marker that identifies a checkout governed by this policy — present in every
// repo the guard rollout covers, including worktrees of this one.
const GUARD_MARKER = 'scripts/run-guarded.mjs';

function tryRealpath(path) {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

function isWithin(child, parent) {
  const c = tryRealpath(child);
  const p = tryRealpath(parent);
  return c === p || c.startsWith(p + sep);
}

// The directory a command will actually execute in: the tool cwd, adjusted
// for a leading `cd <path> &&` / `cd <path> ;` prefix (the common way agents
// run commands against another checkout from the same session).
export function resolveExecutionDir(cwd, command) {
  if (typeof cwd !== 'string' || cwd.length === 0) return null;
  const match = typeof command === 'string' ? command.match(/^\s*cd\s+(?:--\s+)?(?:"([^"]+)"|'([^']+)'|([^\s;&|]+))\s*(?:&&|;)/u) : null;
  if (!match) return cwd;
  let target = match[1] ?? match[2] ?? match[3];
  if (target.startsWith('~')) {
    const home = process.env.HOME;
    if (!home) return cwd;
    target = home + target.slice(1);
  }
  return isAbsolute(target) ? target : resolve(cwd, target);
}

// Blocked-pattern text inside quotes or heredocs is a mention, not an
// invocation (commit messages, PR bodies, grep patterns) — EXCEPT when the
// quoted string is the payload of a nested shell (`bash -lc "..."`,
// `sh -c '...'`), where it is executable. Quotes are processed left to
// right: wrapper payloads are unwrapped so the blocked patterns can see
// them (recursively — the unwrapped text rejoins the scan), ordinary quoted
// text is blanked. Left-to-right matters: a commit message that merely
// mentions `bash -c "node --test"` is blanked before its inner text is ever
// inspected. Still naive by design for anything deeper (e.g. payloads built
// via variables or `node -e` spawning children); those fall through to the
// guard wrapper itself.
const QUOTED = /'[^']*'|"(?:[^"\\]|\\.)*"/u;
const SHELL_C_TAIL = /(?:^|[\s;&|(`{])(?:env\s+(?:\w+=\S*\s+)*)?(?:ba|da|z)?sh\s+(?:-\S+\s+)*-\S*c\s+$/u;

export function stripInertText(command) {
  let scanned = '';
  let rest = command.replace(/<<-?\s*(["']?)([A-Za-z_][A-Za-z0-9_]*)\1[\s\S]*?(\n\2(?=\n|$)|$)/gu, ' ');
  // Each iteration consumes at least the two quote characters, so this
  // terminates; the cap is a backstop against pathological input.
  for (let i = 0; i < 200; i += 1) {
    const match = QUOTED.exec(rest);
    if (!match) break;
    const quoted = match[0];
    scanned += rest.slice(0, match.index);
    rest = rest.slice(match.index + quoted.length);
    if (SHELL_C_TAIL.test(scanned)) {
      const inner = quoted.startsWith("'") ? quoted.slice(1, -1) : quoted.slice(1, -1).replace(/\\(["\\$`])/gu, '$1');
      rest = `${inner}${rest}`;
    } else {
      scanned += quoted.startsWith("'") ? "''" : '""';
    }
  }
  return scanned + rest;
}

// Codex's shell tool submits argv arrays; the regexes match command text.
export function normalizeCommand(command) {
  if (Array.isArray(command) && command.every((part) => typeof part === 'string')) {
    return command.join(' ');
  }
  return command;
}

export function evaluateCommand(command) {
  if (typeof command !== 'string' || command.length === 0) return { allow: true };
  const effective = stripInertText(command);
  if (GUARD_DISABLE.pattern.test(effective)) return { allow: false, reason: GUARD_DISABLE.reason };
  // Explicit guard invocations (e.g. rerunning with custom limits) are the
  // sanctioned path even when the wrapped command matches a blocked pattern.
  if (command.includes('run-guarded.mjs')) return { allow: true };
  for (const { pattern, what, reason } of BLOCKED) {
    if (pattern.test(effective)) {
      return {
        allow: false,
        reason: reason ?? `Blocked ${what}: it bypasses the repository process-tree memory guard. ${GUIDANCE}`,
      };
    }
  }
  return { allow: true };
}

// A directory is inside a guarded checkout when the marker exists there or
// in ANY ancestor — commands routinely run from subdirectories of a checkout
// or worktree, so an exact-directory check would reopen the bypass there.
function inGuardedCheckout(dir) {
  let current = tryRealpath(dir);
  for (;;) {
    if (existsSync(resolve(current, GUARD_MARKER))) return true;
    const parent = dirname(current);
    if (parent === current) return false;
    current = parent;
  }
}

// Full payload evaluation: scope to guarded checkouts, then pattern-match.
export function evaluateHookInput({ command, cwd }, projectDir) {
  const executionDir = resolveExecutionDir(cwd, command);
  if (executionDir && projectDir) {
    const inScope = isWithin(executionDir, projectDir) || inGuardedCheckout(executionDir);
    if (!inScope) return { allow: true };
  }
  return evaluateCommand(command);
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

function respond(protocol, verdict) {
  if (protocol === 'cursor') {
    const body = verdict.allow
      ? { permission: 'allow' }
      : {
          permission: 'deny',
          agentMessage: verdict.reason,
          userMessage: 'Blocked by repo agent test policy (see docs/agent-process-guard.md).',
        };
    process.stdout.write(`${JSON.stringify(body)}\n`);
    return;
  }
  if (!verdict.allow) {
    process.stdout.write(
      `${JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: verdict.reason,
        },
      })}\n`,
    );
  }
}

async function main() {
  const protocol = process.argv.includes('--protocol=cursor')
    ? 'cursor'
    : process.argv.includes('--protocol=codex')
      ? 'codex'
      : 'claude';
  // The script lives in the checkout it protects, so its own location is the
  // authoritative project dir (CLAUDE_PROJECT_DIR matches it for Claude Code;
  // Cursor and Codex set no equivalent).
  const projectDir = process.env.CLAUDE_PROJECT_DIR ?? dirname(dirname(fileURLToPath(import.meta.url)));
  let verdict = { allow: true };
  try {
    const input = JSON.parse(await readStdin());
    const command = protocol === 'cursor' ? input.command : normalizeCommand(input.tool_input?.command);
    verdict = evaluateHookInput({ command, cwd: input.cwd }, projectDir);
  } catch {
    // Fail open (see header).
  }
  respond(protocol, verdict);
}

// Strict equality with the executed entrypoint (realpaths, so macOS
// /var → /private/var symlinks compare equal): an `endsWith` check is also
// true when a test imports this module, which would leave main() awaiting a
// stdin that never closes.
const invokedDirectly = process.argv[1] && tryRealpath(resolve(process.argv[1])) === tryRealpath(fileURLToPath(import.meta.url));
if (invokedDirectly) await main();
