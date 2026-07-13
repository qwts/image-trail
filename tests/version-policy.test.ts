import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

type VersionPolicyModule = {
  validateChromeExtensionVersion(version: unknown): string[];
  evaluateVersionArtifacts(input: {
    packageVersion: string;
    manifestVersion: string;
    buildInfo?: Record<string, unknown> | null;
    requiredBuildMode?: string | null;
  }): string[];
  evaluateChangesetCoverage(input: { changedFiles: string[]; body?: string; labels?: string[] }): {
    ok: boolean;
    productFiles: string[];
    reason: string;
  };
};

const policy = (await import(pathToFileURL(join(process.cwd(), 'scripts/check-version-policy.mjs')).href)) as VersionPolicyModule;

test('accepts Chrome numeric extension versions and rejects invalid components', () => {
  assert.deepEqual(policy.validateChromeExtensionVersion('0.1.0'), []);
  assert.deepEqual(policy.validateChromeExtensionVersion('3.1.2.4567'), []);
  assert.match(policy.validateChromeExtensionVersion('1.2.3.4.5').join(' '), /one to four/u);
  assert.match(policy.validateChromeExtensionVersion('1.02.3').join(' '), /leading zero/u);
  assert.match(policy.validateChromeExtensionVersion('1.65536.0').join(' '), /65535/u);
  assert.match(policy.validateChromeExtensionVersion('0.0.0').join(' '), /must not all be zero/u);
  assert.match(policy.validateChromeExtensionVersion('1.2-beta').join(' '), /decimal integers/u);
});

test('requires stable synchronized package and manifest versions', () => {
  assert.deepEqual(policy.evaluateVersionArtifacts({ packageVersion: '0.1.0', manifestVersion: '0.1.0' }), []);
  assert.match(policy.evaluateVersionArtifacts({ packageVersion: '0.1.1', manifestVersion: '0.1.0' }).join(' '), /versions differ/u);
  assert.match(
    policy.evaluateVersionArtifacts({ packageVersion: '0.2.0-beta.1', manifestVersion: '0.2.0' }).join(' '),
    /stable three-component semver/u,
  );
});

test('validates local and release build identity policy', () => {
  assert.deepEqual(
    policy.evaluateVersionArtifacts({
      packageVersion: '0.1.0',
      manifestVersion: '0.1.0',
      buildInfo: { version: '0.1.0', mode: 'local', worktree: 'image-trail' },
      requiredBuildMode: 'local',
    }),
    [],
  );
  assert.deepEqual(
    policy.evaluateVersionArtifacts({
      packageVersion: '0.1.0',
      manifestVersion: '0.1.0',
      buildInfo: { version: '0.1.0', mode: 'release', worktree: null },
      requiredBuildMode: 'release',
    }),
    [],
  );
  assert.match(
    policy
      .evaluateVersionArtifacts({
        packageVersion: '0.1.0',
        manifestVersion: '0.1.0',
        buildInfo: { version: '0.1.1', mode: 'release', worktree: 'dev' },
        requiredBuildMode: 'release',
      })
      .join(' '),
    /does not match.*worktree/u,
  );
});

test('requires changesets for shipping extension source', () => {
  const result = policy.evaluateChangesetCoverage({ changedFiles: ['extension/src/core/url/rebuild-url.ts'] });
  assert.equal(result.ok, false);
  assert.deepEqual(result.productFiles, ['extension/src/core/url/rebuild-url.ts']);
});

test('accepts added or consumed changesets for shipping extension source', () => {
  const result = policy.evaluateChangesetCoverage({
    changedFiles: ['extension/manifest.json', '.changeset/user-visible-fix.md'],
  });
  assert.equal(result.ok, true);
  assert.match(result.reason, /changeset/u);
});

test('supports explicit no-version-impact PR exemptions', () => {
  assert.equal(
    policy.evaluateChangesetCoverage({
      changedFiles: ['extension/src/core/url/rebuild-url.ts'],
      body: 'Internal refactor only. no-version-impact',
    }).ok,
    true,
  );
  assert.equal(
    policy.evaluateChangesetCoverage({
      changedFiles: ['extension/src/core/url/rebuild-url.ts'],
      labels: ['No-Version-Impact'],
    }).ok,
    true,
  );
});

test('ignores tests, Storybook-only files, and repository tooling', () => {
  const result = policy.evaluateChangesetCoverage({
    changedFiles: [
      'extension/src/core/url/rebuild-url.test.ts',
      'extension/src/ui/components/fields-view.stories.ts',
      'extension/src/ui/stories/harness.ts',
      'tests/version-policy.test.ts',
      'scripts/check-version-policy.mjs',
      '.github/workflows/version-pr.yml',
    ],
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.productFiles, []);
});
