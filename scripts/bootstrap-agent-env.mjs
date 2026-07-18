#!/usr/bin/env node

// Claude Code agent-environment bootstrap (#671). Image Trail is the pilot;
// this script makes the setup reproducible in any other repo without
// re-derivation:
//
//   apply:  node scripts/bootstrap-agent-env.mjs --target /path/to/repo
//           [--wrap test,test:unit,...]
//   check:  node scripts/bootstrap-agent-env.mjs --check [--target /path]
//
// Apply copies the INVARIANT files (guard runner, command hook, session-
// context hook), merges the invariant .claude/settings.json keys (hooks,
// cleanupPeriodDays, BASH_MAX_TIMEOUT_MS), adds the .guard/ gitignore entry,
// optionally wraps named npm test scripts in the guard, and prints the
// remaining manual steps (the PARAMETERS that vary per repo).
//
// Check verifies an already-bootstrapped repo: files present, settings wired,
// the hook answering probe payloads correctly, and every test* npm script
// routed through the guard. CI runs check so the environment cannot drift.

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SOURCE_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// Invariant layer: identical in every repo. Copied verbatim by apply,
// required verbatim-present by check.
const INVARIANT_SCRIPTS = [
  'scripts/run-guarded.mjs',
  'scripts/guard-agent-command.mjs',
  'scripts/guard-session-context.mjs',
  'scripts/bootstrap-agent-env.mjs',
];

const INVARIANT_SETTINGS = {
  cleanupPeriodDays: 14,
  env: { BASH_MAX_TIMEOUT_MS: '1800000' },
  hooks: {
    PreToolUse: [
      {
        matcher: 'Bash',
        hooks: [
          {
            type: 'command',
            command: 'node "$CLAUDE_PROJECT_DIR"/scripts/guard-agent-command.mjs --protocol=claude',
          },
        ],
      },
    ],
    SessionStart: [
      {
        hooks: [
          {
            type: 'command',
            command: 'node "$CLAUDE_PROJECT_DIR"/scripts/guard-session-context.mjs',
            timeout: 10,
          },
        ],
      },
    ],
  },
};

// Default permission posture for a fresh repo (a PARAMETER: repos tune the
// lists, but the shape — broad allows, narrow deny/ask — is the design).
const DEFAULT_PERMISSIONS = {
  defaultMode: 'acceptEdits',
  allow: [
    'Bash(npm run *)',
    'Bash(npm test)',
    'Bash(npm test *)',
    'Bash(npm ci)',
    'Bash(npm install)',
    'Bash(npx *)',
    'Bash(node scripts/*)',
    'Bash(git *)',
    'Bash(gh *)',
  ],
  ask: ['Bash(npm publish*)', 'Bash(gh release *)'],
  deny: [],
};

function parseArgs(argv) {
  const args = { target: SOURCE_ROOT, check: false, wrap: [], exempt: [] };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--check') args.check = true;
    else if (arg === '--target') args.target = path.resolve(argv[(i += 1)]);
    else if (arg === '--wrap') args.wrap = argv[(i += 1)].split(',').filter(Boolean);
    else if (arg === '--exempt') args.exempt = argv[(i += 1)].split(',').filter(Boolean);
    else {
      process.stderr.write(`unknown argument: ${arg}\n`);
      process.exit(2);
    }
  }
  return args;
}

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Merge invariants into existing settings without clobbering repo-specific
// keys: objects merge recursively, hook groups append only when the command
// is not already registered, scalars/arrays fill only when absent.
function mergeSettings(existing, invariants) {
  const out = { ...existing };
  for (const [key, value] of Object.entries(invariants)) {
    if (key === 'hooks') {
      out.hooks = mergeHooks(existing.hooks ?? {}, value);
    } else if (isPlainObject(value)) {
      out[key] = { ...value, ...(isPlainObject(existing[key]) ? existing[key] : {}) };
    } else if (!(key in out)) {
      out[key] = value;
    }
  }
  return out;
}

function hookCommands(groups) {
  return (groups ?? []).flatMap((group) => (group.hooks ?? []).map((hook) => hook.command ?? ''));
}

function mergeHooks(existing, invariants) {
  const out = { ...existing };
  for (const [event, groups] of Object.entries(invariants)) {
    const current = out[event] ?? [];
    const known = hookCommands(current);
    const missing = groups.filter((group) => !group.hooks.every((hook) => known.some((cmd) => cmd.includes(hookScriptName(hook)))));
    out[event] = [...current, ...missing];
  }
  return out;
}

function hookScriptName(hook) {
  const match = /scripts\/([\w-]+\.mjs)/u.exec(hook.command ?? '');
  return match ? match[1] : (hook.command ?? '');
}

function wrapScript(scripts, name) {
  const inner = `${name}:inner`;
  if (typeof scripts[name] !== 'string') return `skip ${name}: no such npm script`;
  if (scripts[name].includes('run-guarded.mjs')) return `ok   ${name}: already guarded`;
  scripts[inner] = scripts[name];
  scripts[name] = `node scripts/run-guarded.mjs --label ${name} -- npm run ${inner}`;
  return `wrap ${name}: moved to ${inner}, guarded entrypoint installed`;
}

function apply(target, wrap) {
  const notes = [];
  mkdirSync(path.join(target, '.claude'), { recursive: true });
  mkdirSync(path.join(target, 'scripts'), { recursive: true });

  for (const rel of INVARIANT_SCRIPTS) {
    copyFileSync(path.join(SOURCE_ROOT, rel), path.join(target, rel));
    notes.push(`copy ${rel}`);
  }

  const settingsPath = path.join(target, '.claude/settings.json');
  const existing = existsSync(settingsPath) ? readJson(settingsPath) : {};
  const merged = mergeSettings(existing, INVARIANT_SETTINGS);
  if (!merged.permissions) {
    merged.permissions = DEFAULT_PERMISSIONS;
    notes.push('write .claude/settings.json permissions (default posture — review per repo)');
  }
  writeFileSync(settingsPath, `${JSON.stringify(merged, null, 2)}\n`);
  notes.push('merge .claude/settings.json hooks/env/cleanupPeriodDays');

  const gitignorePath = path.join(target, '.gitignore');
  const gitignore = existsSync(gitignorePath) ? readFileSync(gitignorePath, 'utf8') : '';
  if (!gitignore.split('\n').includes('.guard/')) {
    writeFileSync(gitignorePath, `${gitignore.replace(/\n?$/u, '\n')}.guard/\n`);
    notes.push('append .guard/ to .gitignore');
  }

  const pkgPath = path.join(target, 'package.json');
  if (wrap.length > 0 && existsSync(pkgPath)) {
    const pkg = readJson(pkgPath);
    pkg.scripts ??= {};
    for (const name of wrap) notes.push(wrapScript(pkg.scripts, name));
    writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
  }

  process.stdout.write(`${notes.map((n) => `[apply] ${n}`).join('\n')}\n`);
  process.stdout.write(
    [
      '',
      'Manual steps (parameters — decide per repo):',
      '  1. Review .claude/settings.json permissions: repo-specific allow/ask/deny',
      '     rules (human-only scripts into deny, publish/release ops into ask).',
      '  2. Wrap any remaining test entrypoints: --wrap <name,...> moves the',
      '     script to <name>:inner behind scripts/run-guarded.mjs; tune --rss-mb /',
      '     --timeout-s per script from measured baselines (.guard/history.jsonl).',
      '  3. Add repo-specific blocked patterns to scripts/guard-agent-command.mjs',
      '     if the repo has unguarded direct runners beyond the generic set.',
      '  4. Copy .devcontainer/devcontainer.json if the hard-isolation tier is',
      '     wanted; set the memory cap for the machine.',
      '  5. Wire "node scripts/bootstrap-agent-env.mjs --check" into the repo CI',
      '     gate so the environment cannot drift.',
      '  6. Document the setup (see docs/claude-code-environment.md in the pilot',
      '     repo) and validate: node scripts/bootstrap-agent-env.mjs --check',
      '',
    ].join('\n'),
  );
}

function probeHook(target, payload, protocol) {
  const result = spawnSync(process.execPath, [path.join(target, 'scripts/guard-agent-command.mjs'), `--protocol=${protocol}`], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: target },
  });
  return result.stdout.trim();
}

// A script counts as guarded when it invokes run-guarded.mjs itself or
// delegates (npm run X) to a guarded script — e.g. test:e2e:release wrapping
// test:e2e. Helpers that run no tests (compile-only, map checks) are named
// per repo via --exempt; that list is a parameter, not a heuristic.
function isGuardedScript(scripts, name, seen) {
  if (seen.has(name)) return false;
  seen.add(name);
  const body = String(scripts[name] ?? '');
  if (body.includes('run-guarded.mjs')) return true;
  const delegations = [...body.matchAll(/\bnpm\s+run\s+([\w:.-]+)/gu)].map((m) => m[1]);
  return delegations.some((dep) => isGuardedScript(scripts, dep, seen));
}

function checkSettings(target, report) {
  const settingsPath = path.join(target, '.claude/settings.json');
  if (!existsSync(settingsPath)) {
    report('.claude/settings.json present', false);
    return;
  }
  const settings = readJson(settingsPath);
  const pre = hookCommands(settings.hooks?.PreToolUse).join(' ');
  const start = hookCommands(settings.hooks?.SessionStart).join(' ');
  report('PreToolUse hook registered', pre.includes('guard-agent-command.mjs'));
  report('SessionStart hook registered', start.includes('guard-session-context.mjs'));
  report(`permissions.defaultMode=${settings.permissions?.defaultMode}`, Boolean(settings.permissions?.defaultMode));
}

function checkHookVerdicts(target, report) {
  if (!existsSync(path.join(target, 'scripts/guard-agent-command.mjs'))) return;
  const probe = (payload) => probeHook(target, payload, 'claude');
  const denied = probe({ cwd: target, tool_input: { command: 'node --test x.js' } });
  report('hook denies unguarded node --test in-repo', /"permissionDecision":\s*"deny"/u.test(denied));
  const crossRepo = probe({
    cwd: path.parse(target).root,
    tool_input: { command: 'node --test x.js' },
  });
  report('hook ignores cross-repo commands', crossRepo === '');
  const mention = probe({
    cwd: target,
    tool_input: { command: 'git commit -m "mentions node --test only"' },
  });
  report('hook ignores quoted mentions', mention === '');
}

function checkNpmScripts(target, exempt, report) {
  const pkgPath = path.join(target, 'package.json');
  if (!existsSync(pkgPath)) return;
  const scripts = readJson(pkgPath).scripts ?? {};
  const unguarded = Object.keys(scripts).filter(
    (name) =>
      /^test(:|$)/u.test(name) && !/:(inner|run)$/u.test(name) && !exempt.includes(name) && !isGuardedScript(scripts, name, new Set()),
  );
  report(
    unguarded.length === 0 ? 'all test* npm entrypoints guarded' : `unguarded test entrypoints: ${unguarded.join(', ')}`,
    unguarded.length === 0,
  );
}

function check(target, exempt) {
  let failures = 0;
  const report = (label, passed) => {
    if (!passed) failures += 1;
    process.stdout.write(`[check] ${passed ? 'ok  ' : 'FAIL'} ${label}\n`);
  };

  for (const rel of INVARIANT_SCRIPTS) report(rel, existsSync(path.join(target, rel)));
  checkSettings(target, report);
  const gitignorePath = path.join(target, '.gitignore');
  report('.gitignore covers .guard/', existsSync(gitignorePath) && readFileSync(gitignorePath, 'utf8').split('\n').includes('.guard/'));
  checkHookVerdicts(target, report);
  checkNpmScripts(target, exempt, report);

  process.stdout.write(failures === 0 ? '[check] agent environment OK\n' : `[check] ${failures} failure(s)\n`);
  process.exit(failures === 0 ? 0 : 1);
}

const args = parseArgs(process.argv);
if (args.check) check(args.target, args.exempt);
else apply(args.target, args.wrap);
