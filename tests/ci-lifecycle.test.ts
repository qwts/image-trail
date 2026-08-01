import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = (name: string) => readFileSync(`.github/workflows/${name}`, 'utf8');

test('CI exposes only the governed lifecycle triggers and skips every draft job', () => {
  const ci = workflow('ci.yml');

  assert.match(ci, /types: \[opened, synchronize, reopened, ready_for_review, converted_to_draft\]/u);
  assert.match(ci, /merge_group:\s*\n\s+types: \[checks_requested\]/u);
  assert.match(ci, /push:\s*\n\s+branches: \[main\]/u);
  assert.match(ci, /- exact-sha-preflight[\s\S]*- explicit-rerun/u);
  assert.doesNotMatch(ci, /pull_request_target:|schedule:/u);

  const jobCount = ci.match(/^ {2}[a-z][a-z0-9-]*:\s*$/gmu)?.length ?? 0;
  const draftGuards = ci.match(/github\.event_name != 'pull_request' \|\| github\.event\.pull_request\.draft == false/gu)?.length ?? 0;
  assert.ok(jobCount > 0);
  assert.equal(draftGuards, 3, 'policy and both stable gates must be the only root jobs on a draft event');
});

test('CI loads immutable actor policy and scopes obsolete-run cancellation to PR or queue identity', () => {
  const ci = workflow('ci.yml');

  assert.match(ci, /uses: qwts\/playbook-engineering\/\.github\/actions\/ci-policy@012ec7b8cd101c528b587d969e8d21da4e589770/u);
  assert.match(ci, /format\('pr-\{0\}', github\.event\.pull_request\.number\)/u);
  assert.match(ci, /format\('merge-group-\{0\}', github\.event\.merge_group\.head_ref\)/u);
  assert.match(ci, /cancel-in-progress: \$\{\{ github\.event_name != 'push' \}\}/u);
});

test('ready PR and main evidence are exact-SHA and require the stable CI gate', () => {
  const ci = workflow('ci.yml');

  assert.match(ci, /event=workflow_dispatch&head_sha=\$TARGET_SHA/u);
  assert.match(ci, /head_sha=\$GITHUB_SHA/u);
  assert.equal(
    `${ci}\n${workflow('codeql.yml')}\n${workflow('zizmor.yml')}`.match(
      /ref: \$\{\{ github\.event_name == 'pull_request' && github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}/gu,
    )?.length,
    4,
  );
  assert.match(ci, /\.event == "merge_group" or \.event == "push"/u);
  assert.equal(ci.match(/\.name == "CI" and \.conclusion == "success"/gu)?.length, 2);
  assert.doesNotMatch(ci, /git (?:patch-id|merge-tree)|tree equivalence/iu);
});

test('complete suite retains repository, Storybook, E2E, workflow-security, and CodeQL gates', () => {
  const ci = workflow('ci.yml');
  const codeql = workflow('codeql.yml');
  const zizmor = workflow('zizmor.yml');

  assert.match(ci, /run: npm run ci/u);
  assert.match(ci, /run: npm run test:stories:ci/u);
  assert.match(ci, /run: npm run test:e2e/u);
  assert.match(ci, /uses: \.\/\.github\/workflows\/codeql\.yml/u);
  assert.match(ci, /uses: \.\/\.github\/workflows\/zizmor\.yml/u);
  assert.match(ci, /name: E2E gate/u);
  assert.match(ci, /name: CI/u);
  assert.doesNotMatch(ci, /dorny\/paths-filter/u);

  assert.match(codeql, /workflow_call:/u);
  assert.match(codeql, /language: \[actions, javascript-typescript\]/u);
  assert.equal(codeql.match(/github\/codeql-action\/(?:init|analyze)@[0-9a-f]{40}/gu)?.length, 2);
  assert.match(zizmor, /workflow_call:/u);
  assert.doesNotMatch(zizmor, /pull_request:|workflow_dispatch:|push:/u);
});

test('validated main runs a focused smoke while missing evidence falls back to every complete lane', () => {
  const ci = workflow('ci.yml');

  assert.match(ci, /needs\.merge-evidence\.outputs\.validated == 'true'/u);
  assert.match(ci, /npm run test:e2e -- tests\/e2e\/extension-smoke\.spec\.ts/u);
  assert.match(ci, /needs\.merge-evidence\.outputs\.validated != 'true'/u);
  assert.match(ci, /test "\$COMPLETE" = success[\s\S]*test "\$ZIZMOR" = success/u);
});

test('release reuses exact generic evidence and preserves release-specific validation', () => {
  const release = workflow('release.yml');
  const versionCut = workflow('version-cut.yml');

  assert.doesNotMatch(release, /run: npm run ci/u);
  assert.match(release, /head_sha=\$source_sha/u);
  assert.match(release, /event=pull_request&head_sha=\$pr_head/u);
  assert.match(release, /run: npm run test:e2e:release/u);
  assert.match(release, /npm run package:release -- --tag "\$RELEASE_TAG"/u);
  assert.match(release, /release\/\*\.zip release\/\*\.sha256/u);

  assert.match(versionCut, /actions\/runs\?event=push&head_sha=\$GITHUB_SHA/u);
  assert.match(versionCut, /gh run watch "\$run_id" --exit-status/u);
  assert.doesNotMatch(versionCut, /gh workflow run ci\.yml/u);
  assert.doesNotMatch(`${release}\n${versionCut}`, /RELEASE_TOKEN|secrets\.CHORES_DUMB\b/u);
});

test('actionlint is pinned by version and part of the local lint gate', () => {
  const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: Record<string, string> };

  assert.equal(packageJson.scripts['lint:workflows'], 'go run github.com/rhysd/actionlint/cmd/actionlint@v1.7.12');
  assert.match(packageJson.scripts['lint'] ?? '', /npm run lint:workflows/u);
});
