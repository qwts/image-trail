import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

type VersionPolicyModule = {
  validateChromeExtensionVersion(version: unknown): string[];
  evaluateVersionArtifacts(input: {
    packageVersion: string;
    manifestVersion: string;
    lockVersion: string;
    lockRootVersion: string;
    buildInfo?: Record<string, unknown> | null;
    requiredBuildMode?: string | null;
  }): string[];
  evaluateChangesetCoverage(input: {
    changedFiles: string[];
    changesets?: { path: string; content: string }[];
    releaseVersionAdvanced?: boolean;
    body?: string;
    labels?: string[];
  }): {
    ok: boolean;
    productFiles: string[];
    reason: string;
    errors?: string[];
  };
};

type ReleasePackageModule = {
  expectedReleaseTag(version: string): string;
  validateReleaseTag(tag: string, version: string): string[];
  validateArchiveEntries(entries: string[]): string[];
  releaseArtifactNames(version: string): { archive: string; checksum: string };
};

const policy = (await import(pathToFileURL(join(process.cwd(), 'scripts/check-version-policy.mjs')).href)) as VersionPolicyModule;
const releasePackage = (await import(
  pathToFileURL(join(process.cwd(), 'scripts/package-extension-release.mjs')).href
)) as ReleasePackageModule;

function versionArtifacts(packageVersion = '0.1.0', manifestVersion = packageVersion) {
  return { packageVersion, manifestVersion, lockVersion: packageVersion, lockRootVersion: packageVersion };
}

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
  assert.deepEqual(policy.evaluateVersionArtifacts(versionArtifacts()), []);
  assert.match(policy.evaluateVersionArtifacts(versionArtifacts('0.1.1', '0.1.0')).join(' '), /versions differ/u);
  assert.match(policy.evaluateVersionArtifacts(versionArtifacts('0.2.0-beta.1', '0.2.0')).join(' '), /stable three-component semver/u);
});

test('requires both package-lock version fields to match package.json', () => {
  assert.match(
    policy.evaluateVersionArtifacts({ ...versionArtifacts(), lockVersion: '0.0.9' }).join(' '),
    /package-lock\.json \(0\.0\.9\)/u,
  );
  assert.match(policy.evaluateVersionArtifacts({ ...versionArtifacts(), lockRootVersion: '0.0.9' }).join(' '), /root package \(0\.0\.9\)/u);
});

test('validates local and release build identity policy', () => {
  assert.deepEqual(
    policy.evaluateVersionArtifacts({
      ...versionArtifacts(),
      buildInfo: { version: '0.1.0', mode: 'local', worktree: 'image-trail' },
      requiredBuildMode: 'local',
    }),
    [],
  );
  assert.deepEqual(
    policy.evaluateVersionArtifacts({
      ...versionArtifacts(),
      buildInfo: { version: '0.1.0', mode: 'release', worktree: null },
      requiredBuildMode: 'release',
    }),
    [],
  );
  assert.match(
    policy
      .evaluateVersionArtifacts({
        ...versionArtifacts(),
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

test('accepts a valid image-trail changeset for shipping extension source', () => {
  const result = policy.evaluateChangesetCoverage({
    changedFiles: ['extension/manifest.json', '.changeset/user-visible-fix.md'],
    changesets: [
      {
        path: '.changeset/user-visible-fix.md',
        content: '---\n"image-trail": patch\n---\nFix a user-visible issue.\n',
      },
    ],
  });
  assert.equal(result.ok, true);
  assert.match(result.reason, /valid image-trail changeset/u);
});

test('rejects empty, malformed, none, and unknown-package changesets', () => {
  const cases = [
    { content: '---\n---\n', message: /missing a release/u },
    { content: 'not changeset frontmatter', message: /could not parse/u },
    { content: '---\n"image-trail": none\n---\nNo release.\n', message: /patch, minor, or major/u },
    { content: '---\n"other-package": patch\n---\nWrong package.\n', message: /unknown package/u },
  ];

  for (const { content, message } of cases) {
    const result = policy.evaluateChangesetCoverage({
      changedFiles: ['extension/manifest.json', '.changeset/invalid.md'],
      changesets: [{ path: '.changeset/invalid.md', content }],
    });
    assert.equal(result.ok, false);
    assert.match(result.errors?.join(' ') ?? '', message);
  }
});

test('accepts consumed changesets only when a release version advances', () => {
  const input = {
    changedFiles: ['extension/manifest.json', '.changeset/consumed.md'],
    changesets: [],
  };
  assert.equal(policy.evaluateChangesetCoverage({ ...input, releaseVersionAdvanced: true }).ok, true);
  assert.equal(policy.evaluateChangesetCoverage(input).ok, false);
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
      '.github/workflows/version-cut.yml',
    ],
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.productFiles, []);
});

test('version-cut workflow refreshes a checked Changesets PR and tags only fresh version merges', () => {
  const workflow = readFileSync('.github/workflows/version-cut.yml', 'utf8');

  assert.match(workflow, /uses: changesets\/action@v1/u);
  assert.match(workflow, /version: npm run changeset:version/u);
  assert.match(workflow, /pull-requests: write/u);
  assert.match(workflow, /actions: write/u);
  assert.match(workflow, /gh workflow run ci\.yml --ref changeset-release\/main/u);
  assert.match(workflow, /Version unchanged \(\$cur\) — not a version-cut merge/u);
  assert.match(workflow, /Changesets pending — nothing to tag/u);
  assert.match(workflow, /package, manifest, and lockfile versions are not synchronized/u);
  assert.match(workflow, /git tag -a "\$version"/u);
  assert.match(workflow, /git push origin "\$version"/u);
  assert.match(workflow, /gh workflow run release\.yml --ref main -f tag="\$version"/u);
  assert.doesNotMatch(workflow, /^\s+publish:/mu);
  assert.doesNotMatch(workflow, /^\s+prDraft:/mu);
  assert.doesNotMatch(workflow, /gh pr merge|auto-merge/u);
});

test('required CI runs the version-policy gate', () => {
  const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');

  assert.match(workflow, /run: npm run check:version-policy/u);
  assert.match(workflow, /workflow_dispatch:/u);
  assert.match(workflow, /github\.event_name == 'workflow_dispatch'.*'true'/u);
});

test('required CI retains PR base history for consumed-changeset validation', () => {
  const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');
  const ciJob = workflow.slice(workflow.indexOf('\n  ci:'), workflow.indexOf('\n  e2e:'));

  assert.ok(ciJob.includes('uses: actions/checkout@v7'));
  assert.ok(ciJob.includes('fetch-depth: 0'));
});

test('release packaging requires an exact version tag and stable artifact names', () => {
  assert.equal(releasePackage.expectedReleaseTag('1.2.3'), 'v1.2.3');
  assert.deepEqual(releasePackage.validateReleaseTag('v1.2.3', '1.2.3'), []);
  assert.match(releasePackage.validateReleaseTag('1.2.3', '1.2.3').join(' '), /exactly "v1\.2\.3"/u);
  assert.match(releasePackage.validateReleaseTag('v1.2.3', '1.2.3-beta.1').join(' '), /stable three-component semver/u);
  assert.deepEqual(releasePackage.releaseArtifactNames('1.2.3'), {
    archive: 'image-trail-v1.2.3.zip',
    checksum: 'image-trail-v1.2.3.zip.sha256',
  });
});

test('release packaging enforces a Chrome Web Store-compatible archive root', () => {
  assert.deepEqual(releasePackage.validateArchiveEntries(['build-info.json', 'manifest.json', 'src/content/content-script.js']), []);
  assert.match(releasePackage.validateArchiveEntries(['extension/dist/manifest.json']).join(' '), /manifest\.json at its root/u);
  assert.match(releasePackage.validateArchiveEntries(['manifest.json', '../secret', '.DS_Store']).join(' '), /safe relative.*forbidden/u);
});

test('release workflow checks out a supplied tag and publishes assets without store publication', () => {
  const workflow = readFileSync('.github/workflows/release.yml', 'utf8');

  assert.match(workflow, /workflow_dispatch:/u);
  assert.match(workflow, /tags:\s*\n\s*- 'v\*\.\*\.\*'/u);
  assert.match(workflow, /tag:\s*\n\s+description: 'Existing exact v<package-version> tag/u);
  assert.match(workflow, /ref: \$\{\{ steps\.release\.outputs\.tag \}\}/u);
  assert.match(workflow, /run: npm run ci/u);
  assert.match(workflow, /npm run package:release -- --tag/u);
  assert.match(workflow, /Release tag must be stable three-component semver/u);
  assert.match(workflow, /git merge-base --is-ancestor "\$\(git rev-list -n 1 "\$TAG_NAME"\)" origin\/main/u);
  assert.match(workflow, /gh release create/u);
  assert.match(workflow, /--prerelease/u);
  assert.match(workflow, /gh release edit.*--prerelease/u);
  assert.match(workflow, /gh release upload.*--clobber/u);
  assert.doesNotMatch(workflow, /git tag -a|git push origin/u);
  assert.doesNotMatch(workflow, /chrome-webstore-upload|webstore.*publish/iu);
});

test('version sync updates manifest and lockfile versions and refuses invalid Chrome versions', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'image-trail-version-sync-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  mkdirSync(join(directory, 'extension'));
  const manifestPath = join(directory, 'extension/manifest.json');
  const packageLockPath = join(directory, 'package-lock.json');
  const syncScript = join(process.cwd(), 'scripts/sync-manifest-version.mjs');

  writeFileSync(join(directory, 'package.json'), '{"name":"image-trail","version":"1.2.3"}\n');
  writeFileSync(manifestPath, '{\n  "version": "1.2.2"\n}\n');
  writeFileSync(
    packageLockPath,
    '{"name":"image-trail","version":"1.2.2","lockfileVersion":3,"packages":{"":{"name":"image-trail","version":"1.2.2"}}}\n',
  );
  execFileSync(process.execPath, [syncScript], { cwd: directory });
  assert.equal(JSON.parse(readFileSync(manifestPath, 'utf8')).version, '1.2.3');
  const packageLock = JSON.parse(readFileSync(packageLockPath, 'utf8')) as { version: string; packages: { '': { version: string } } };
  assert.equal(packageLock.version, '1.2.3');
  assert.equal(packageLock.packages[''].version, '1.2.3');

  writeFileSync(join(directory, 'package.json'), '{"name":"image-trail","version":"1.2.3-beta.1"}\n');
  assert.throws(() => execFileSync(process.execPath, [syncScript], { cwd: directory, stdio: 'pipe' }));
  assert.equal(JSON.parse(readFileSync(manifestPath, 'utf8')).version, '1.2.3');
  assert.equal(JSON.parse(readFileSync(packageLockPath, 'utf8')).version, '1.2.3');
});
