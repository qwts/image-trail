#!/usr/bin/env node

// SessionStart hook (#671): surfaces process-tree guard state to a starting
// (or resumed/compacted) Claude Code session so the agent begins with the
// facts a fresh context would otherwise miss:
//   - a guarded run is still active in this worktree (poll it, don't relaunch);
//   - the previous guarded run was killed (rss-limit/timeout is a real
//     failure — report it, don't rerun with higher limits).
//
// Prints plain text to stdout (added to the session context) only when there
// is something to say; otherwise stays silent. Fail-open: any error exits 0
// with no output — this hook informs, it never gates.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function isProcessAlive(pid) {
  if (typeof pid !== 'number') return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

function main() {
  const projectDir = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
  const guardDir = path.join(projectDir, '.guard');
  const lines = [];

  const active = readJson(path.join(guardDir, 'active.json'));
  if (active && isProcessAlive(active.pid)) {
    lines.push(
      `[guard] A guarded run is ACTIVE in this worktree: "${active.label}" ` +
        `(pid ${active.pid}, started ${active.startedAt}). Poll or terminate it before ` +
        'launching any test command; a second guarded run will refuse to start.',
    );
  }

  const last = readJson(path.join(guardDir, 'last-run.json'));
  if (last && last.terminationReason && last.terminationReason !== 'completed') {
    lines.push(
      `[guard] The previous guarded run in this worktree was KILLED: "${last.label}" ` +
        `terminated for ${last.terminationReason} (peak RSS ${last.peakRssMb} MB, ` +
        `limit ${last.limits?.rssMb} MB, ${Math.round((last.durationMs ?? 0) / 1000)}s). ` +
        'Treat this as a real test failure: read .guard/last-run.json and report it; ' +
        'do not rerun with higher limits to make it pass. See docs/agent-process-guard.md.',
    );
  }

  if (lines.length > 0) process.stdout.write(`${lines.join('\n')}\n`);
}

try {
  main();
} catch {
  // Fail open: informational hook only.
}
