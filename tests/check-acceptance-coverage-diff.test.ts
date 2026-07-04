import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

type AcceptanceResult = {
  ok: boolean;
  acceptanceFiles: string[];
  reason: string;
};

type CheckModule = {
  evaluateAcceptanceCoverage(input: { changedFiles: string[]; body?: string; labels?: string[] }): AcceptanceResult;
};

const mod = (await import(pathToFileURL(join(process.cwd(), 'scripts/check-acceptance-coverage-diff.mjs')).href)) as CheckModule;

const { evaluateAcceptanceCoverage } = mod;

test('passes when no acceptance-relevant source changed', () => {
  const result = evaluateAcceptanceCoverage({
    changedFiles: ['.github/workflows/ci.yml', 'package.json', 'extension/src/core/url/rebuild-url.ts'],
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.acceptanceFiles, []);
});

test('fails when ui/content source changes without a coverage-map update', () => {
  const result = evaluateAcceptanceCoverage({
    changedFiles: ['extension/src/ui/panel/parsed-field-navigation-controller.ts'],
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.acceptanceFiles, ['extension/src/ui/panel/parsed-field-navigation-controller.ts']);
});

test('passes when the coverage map is updated alongside the change', () => {
  const result = evaluateAcceptanceCoverage({
    changedFiles: ['extension/src/content/page-adapter.ts', 'tests/e2e/coverage-map.json'],
  });
  assert.equal(result.ok, true);
});

test('ignores test and story files as non-flow changes', () => {
  const result = evaluateAcceptanceCoverage({
    changedFiles: ['extension/src/ui/components/fields-view.stories.ts', 'tests/dom/parsed-field-navigation-controller.test.ts'],
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.acceptanceFiles, []);
});

test('opts out via the no-acceptance-impact token in the PR body', () => {
  const result = evaluateAcceptanceCoverage({
    changedFiles: ['extension/src/ui/render.ts'],
    body: 'Pure rename, no behavior change. no-acceptance-impact',
  });
  assert.equal(result.ok, true);
  assert.match(result.reason, /opted out/u);
});

test('opts out via the no-acceptance-impact label', () => {
  const result = evaluateAcceptanceCoverage({
    changedFiles: ['extension/src/ui/render.ts'],
    labels: ['No-Acceptance-Impact'],
  });
  assert.equal(result.ok, true);
});
