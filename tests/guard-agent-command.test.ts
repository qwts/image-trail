import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

interface Verdict {
  allow: boolean;
  reason?: string;
}

interface GuardHookModule {
  evaluateCommand(command: unknown): Verdict;
  evaluateHookInput(input: { command: unknown; cwd?: unknown }, projectDir: string): Verdict;
  resolveExecutionDir(cwd: unknown, command: unknown): string | null;
  stripInertText(command: string): string;
  normalizeCommand(command: unknown): unknown;
}

const projectRoot = process.cwd();
const scriptPath = join(projectRoot, 'scripts/guard-agent-command.mjs');
const mod = (await import(pathToFileURL(scriptPath).href)) as GuardHookModule;

void test('denies unguarded test entrypoints', () => {
  const blocked = [
    'node --test .test-dist/tests/foo.test.js',
    'node --import ./.test-dist/tests/dom/register.js --test',
    'npx playwright test tests/e2e',
    'test-storybook --url http://127.0.0.1:6006',
    'npx c8 npm run test:dom:run',
    'npm run test:unit:run',
    'npm run test:dom:inner',
    'npm run test:e2e:ui',
    'npm run test:e2e:headed',
    'IMAGE_TRAIL_GUARD_DISABLE=1 npm test',
  ];
  for (const command of blocked) {
    const verdict = mod.evaluateCommand(command);
    assert.equal(verdict.allow, false, `expected deny: ${command}`);
    assert.ok(verdict.reason, `expected reason: ${command}`);
  }
});

void test('allows guarded entrypoints and unrelated commands', () => {
  const allowed = [
    'npm test',
    'npm run test:dom',
    'npm run test:e2e',
    'IMAGE_TRAIL_GUARD_RSS_MB=300 node scripts/run-guarded.mjs --label selftest -- node -e "x"',
    'grep -- --test-concurrency package.json',
    'rm -rf .test-dist && npm run build',
    'npm run lint',
  ];
  for (const command of allowed) {
    assert.equal(mod.evaluateCommand(command).allow, true, `expected allow: ${command}`);
  }
});

void test('mentions inside quotes and heredocs are not invocations', () => {
  const mentionsOnly = [
    'git commit -m "guard: deny direct test-storybook runs"',
    "git commit -m 'block node --test bypass'",
    'echo "npm run test:unit:run is unguarded"',
    ['gh pr create --body "$(cat <<EOF', 'Denies direct node --test and playwright test.', 'EOF', ')"'].join('\n'),
  ];
  for (const command of mentionsOnly) {
    assert.equal(mod.evaluateCommand(command).allow, true, `expected allow: ${command}`);
  }
  // A real invocation alongside a quoted mention still trips the pattern.
  assert.equal(mod.evaluateCommand('echo "not a test" && node --test foo.js').allow, false);
});

void test('nested shell -c payloads are executable, not mentions', () => {
  const blocked = [
    'bash -lc "node --test .test-dist/tests/foo.test.js"',
    "sh -c 'npm run test:unit:run'",
    'zsh -c "npx playwright test"',
    'env CI=1 bash -c "test-storybook --url http://127.0.0.1:6006"',
    // Nested one level deeper: the unwrapped payload rejoins the scan.
    'bash -c \'sh -c "node --test x.js"\'',
  ];
  for (const command of blocked) {
    assert.equal(mod.evaluateCommand(command).allow, false, `expected deny: ${command}`);
  }
  // Quoted text inside a shell payload is still a mention...
  assert.equal(mod.evaluateCommand('bash -c "echo \'node --test is denied\'"').allow, true);
  // ...and a commit message that mentions a wrapper is blanked before its
  // inner text is ever inspected.
  assert.equal(mod.evaluateCommand('git commit -m \'wrap it in bash -c "node --test" instead\'').allow, true);
});

void test('resolveExecutionDir follows a leading cd', () => {
  assert.equal(mod.resolveExecutionDir('/repo', 'npm test'), '/repo');
  assert.equal(mod.resolveExecutionDir('/repo', 'cd /elsewhere && npm test'), '/elsewhere');
  assert.equal(mod.resolveExecutionDir('/repo', 'cd sub ; npm test'), '/repo/sub');
  assert.equal(mod.resolveExecutionDir('/repo', 'cd "some dir" && npm test'), '/repo/some dir');
  assert.equal(mod.resolveExecutionDir(undefined, 'npm test'), null);
});

void test('cross-repo commands are out of scope; guarded checkouts stay in scope', () => {
  const command = 'node --test foo.test.js';
  // Inside this checkout: enforced.
  assert.equal(mod.evaluateHookInput({ command, cwd: projectRoot }, projectRoot).allow, false);
  // No cwd in the payload: enforced (fail toward current behavior).
  assert.equal(mod.evaluateHookInput({ command }, projectRoot).allow, false);
  // Unrelated directory: allowed untouched.
  const plainDir = mkdtempSync(join(tmpdir(), 'guard-plain-'));
  assert.equal(mod.evaluateHookInput({ command, cwd: plainDir }, projectRoot).allow, true);
  // Another checkout carrying the guard marker: enforced.
  const guardedDir = mkdtempSync(join(tmpdir(), 'guard-marked-'));
  mkdirSync(join(guardedDir, 'scripts'));
  writeFileSync(join(guardedDir, 'scripts/run-guarded.mjs'), '// marker\n');
  assert.equal(mod.evaluateHookInput({ command, cwd: guardedDir }, projectRoot).allow, false);
  // A SUBDIRECTORY of a guarded checkout is still in scope (marker found in
  // an ancestor).
  const subDir = join(guardedDir, 'extension', 'src');
  mkdirSync(subDir, { recursive: true });
  assert.equal(mod.evaluateHookInput({ command, cwd: subDir }, projectRoot).allow, false);
  // Leading cd out of the checkout moves the command out of scope.
  assert.equal(mod.evaluateHookInput({ command: `cd ${plainDir} && node --test x`, cwd: projectRoot }, projectRoot).allow, true);
});

void test('claude protocol end to end: deny JSON in scope, silence out of scope', () => {
  const run = (payload: object) =>
    spawnSync(process.execPath, [scriptPath, '--protocol=claude'], {
      input: JSON.stringify(payload),
      encoding: 'utf8',
      env: { ...process.env, CLAUDE_PROJECT_DIR: projectRoot },
    });

  const denied = run({ cwd: projectRoot, tool_input: { command: 'npm run test:unit:run' } });
  assert.equal(denied.status, 0);
  const parsed = JSON.parse(denied.stdout) as {
    hookSpecificOutput: { permissionDecision: string; permissionDecisionReason: string };
  };
  assert.equal(parsed.hookSpecificOutput.permissionDecision, 'deny');
  assert.match(parsed.hookSpecificOutput.permissionDecisionReason, /run-guarded|guarded npm scripts/u);

  const crossRepo = mkdtempSync(join(tmpdir(), 'guard-e2e-'));
  const allowed = run({ cwd: crossRepo, tool_input: { command: 'npm run test:unit:run' } });
  assert.equal(allowed.status, 0);
  assert.equal(allowed.stdout, '');

  const malformed = spawnSync(process.execPath, [scriptPath, '--protocol=claude'], {
    input: 'not json',
    encoding: 'utf8',
  });
  assert.equal(malformed.status, 0);
  assert.equal(malformed.stdout, '');
});

void test('cursor protocol still answers allow/deny', () => {
  const run = (payload: object) =>
    spawnSync(process.execPath, [scriptPath, '--protocol=cursor'], {
      input: JSON.stringify(payload),
      encoding: 'utf8',
      env: { ...process.env, CLAUDE_PROJECT_DIR: projectRoot },
    });
  const denied = JSON.parse(run({ command: 'npx playwright test', cwd: projectRoot }).stdout) as {
    permission: string;
  };
  assert.equal(denied.permission, 'deny');
  const allowed = JSON.parse(run({ command: 'npm test', cwd: projectRoot }).stdout) as {
    permission: string;
  };
  assert.equal(allowed.permission, 'allow');
});

void test('normalizeCommand joins Codex argv arrays for matching', () => {
  const argv = ['bash', '-lc', 'node --import ./.test-dist/x.js ' + '--test y.test.js'];
  const normalized = mod.normalizeCommand(argv);
  assert.equal(typeof normalized, 'string');
  assert.equal(mod.evaluateCommand(normalized as string).allow, false);
});

void test('normalizeCommand passes through strings and rejects junk shapes', () => {
  assert.equal(mod.normalizeCommand('npm test'), 'npm test');
  const mixed = mod.normalizeCommand(['npm', 42]);
  assert.equal(mod.evaluateCommand(mixed).allow, true);
  assert.equal(mod.evaluateCommand(undefined).allow, true);
});

void test('codex protocol denies argv-array runner commands with the claude wire', () => {
  const run = (payload: object) =>
    spawnSync(process.execPath, [scriptPath, '--protocol=codex'], {
      input: JSON.stringify(payload),
      encoding: 'utf8',
      env: { ...process.env, CLAUDE_PROJECT_DIR: projectRoot },
    });
  const denied = run({
    tool_input: { command: ['bash', '-lc', 'npx playwright test'] },
    cwd: projectRoot,
  });
  assert.equal(denied.status, 0);
  const parsed = JSON.parse(denied.stdout) as {
    hookSpecificOutput: { permissionDecision: string };
  };
  assert.equal(parsed.hookSpecificOutput.permissionDecision, 'deny');
  const allowed = run({ tool_input: { command: ['npm', 'test'] }, cwd: projectRoot });
  assert.equal(allowed.status, 0);
  assert.equal(allowed.stdout, '');
});
