import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

interface AgentPrimitiveCheck {
  label: string;
  ok: boolean;
  detail: string;
}

interface AgentPrimitiveModule {
  findBroadAllows(settings: unknown): string[];
  findMissingSourceCheckGates(skillText: string): string[];
  findOutwardAllows(settings: unknown): string[];
  validateAgentPrimitives(root?: string): {
    ok: boolean;
    checks: AgentPrimitiveCheck[];
  };
  validateGoldenTasks(document: unknown): string[];
}

const projectRoot = process.cwd();
const modulePath = join(projectRoot, 'scripts/check-agent-primitives.mjs');
const primitives = (await import(pathToFileURL(modulePath).href)) as AgentPrimitiveModule;

void test('current agent primitives satisfy the governed inventory', () => {
  const result = primitives.validateAgentPrimitives(projectRoot);
  assert.equal(
    result.ok,
    true,
    result.checks
      .filter((check) => !check.ok)
      .map((check) => `${check.label}: ${check.detail}`)
      .join('\n'),
  );
});

void test('least-privilege check rejects command-family wildcard allows', () => {
  const settings = {
    permissions: {
      allow: ['Bash(npm run *)', 'Bash(npx *)', 'Bash(git *)', 'Bash(gh *)', 'Bash(npm run lint)'],
    },
  };
  assert.deepEqual(primitives.findBroadAllows(settings), ['Bash(npm run *)', 'Bash(npx *)', 'Bash(git *)', 'Bash(gh *)']);
});

void test('least-privilege check catches outward writes in allow', () => {
  const settings = {
    permissions: {
      allow: ['Bash(git push*)', 'Bash(gh issue comment*)', 'Bash(gh pr merge*)', 'Bash(npm publish*)', 'Bash(gh issue view*)'],
    },
  };
  assert.deepEqual(primitives.findOutwardAllows(settings), [
    'Bash(git push*)',
    'Bash(gh issue comment*)',
    'Bash(gh pr merge*)',
    'Bash(npm publish*)',
  ]);
});

void test('source-command check cannot silently drop acceptance coverage', () => {
  const incompleteSkill = [
    'npm run lint',
    'npm run format:check',
    'npm test',
    'npm run build',
    'npm run test:e2e',
    'npm run test:cov',
    'npm run test:stories:ci',
  ].join('\n');

  assert.deepEqual(primitives.findMissingSourceCheckGates(incompleteSkill), ['npm run check:acceptance-coverage']);
});

void test('golden-task schema requires representative evidence fields', () => {
  const invalid = {
    schemaVersion: 1,
    tasks: [
      {
        id: 'duplicate',
        category: '',
        referenceIssue: 0,
        prompt: '',
        successCriteria: [],
        failureSignals: [],
      },
      {
        id: 'duplicate',
        category: 'quality',
        referenceIssue: 1,
        prompt: 'Do work.',
        successCriteria: ['one', 'two', 'three'],
        failureSignals: ['one', 'two', 'three'],
      },
    ],
  };
  const errors = primitives.validateGoldenTasks(invalid);
  assert.ok(errors.some((error) => error.includes('3-5 tasks')));
  assert.ok(errors.some((error) => error.includes('id must be unique')));
  assert.ok(errors.some((error) => error.includes('referenceIssue')));
  assert.ok(errors.some((error) => error.includes('successCriteria')));
});
