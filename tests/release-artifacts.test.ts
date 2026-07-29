import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, win32 } from 'node:path';
import { pathToFileURL } from 'node:url';

type ArtifactPolicyModule = {
  expectedExtensionArtifacts(manifest: Record<string, unknown>): string[];
  validateArtifactPaths(files: string[], manifest: Record<string, unknown>): string[];
  validateReleaseArtifactText(file: string, content: string, rootDirectory: string): string[];
  validateReleaseBuildInfo(buildInfo: Record<string, unknown>): string[];
  validateReleaseManifest(manifest: Record<string, unknown>): string[];
};

type BuildPolicyModule = {
  bundleStylesheet(sourcePath: string, outputPath: string, options?: { release?: boolean }): Promise<void>;
  extensionOutputPath(sourcePath: string, pathApi?: typeof win32): string;
  extensionBuildOptions(input: {
    entryPoint: string;
    outfile: string;
    format: string;
    jsx?: string | null;
    release?: boolean;
    interopEnabled?: boolean;
    openPanelShadowForE2E?: boolean;
  }): Record<string, unknown>;
  isInteropFeatureEnabled(environment?: Record<string, string | undefined>): boolean;
  isReleaseBuild(environment?: Record<string, string | undefined>): boolean;
  opensPanelShadowForE2E(environment?: Record<string, string | undefined>): boolean;
  minificationImproved(unminifiedBytes: number, minifiedBytes: number): boolean;
};

type ManifestPolicyModule = {
  extensionManifestForBuild(
    manifest: Record<string, unknown>,
    options?: { interopEnabled?: boolean },
  ): Record<string, unknown> & { permissions: string[] };
};

const artifacts = (await import(pathToFileURL(join(process.cwd(), 'scripts/extension-artifact-policy.mjs')).href)) as ArtifactPolicyModule;
const builds = (await import(pathToFileURL(join(process.cwd(), 'scripts/extension-build-policy.mjs')).href)) as BuildPolicyModule;
const manifests = (await import(pathToFileURL(join(process.cwd(), 'scripts/extension-manifest-policy.mjs')).href)) as ManifestPolicyModule;

function manifestFixture() {
  return {
    background: { service_worker: 'src/background/service-worker.js' },
    icons: { 16: 'icons/icon16.png' },
    action: { default_icon: { 16: 'icons/icon16.png' } },
    web_accessible_resources: [{ resources: ['src/ui/styles/panel.css'] }],
  };
}

function releaseBuildInfo(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    version: '0.10.1',
    builtAt: '2026-07-15T03:00:00.000Z',
    commit: 'abc123def456',
    branch: '558-minify-harden-release-artifacts',
    worktree: null,
    timezone: 'America/Chicago',
    mode: 'release',
    ...overrides,
  };
}

test('central release build policy minifies and removes development-only debugging', () => {
  const local = builds.extensionBuildOptions({ entryPoint: 'source.ts', outfile: 'output.js', format: 'esm', release: false });
  assert.equal(local['minify'], false);
  assert.equal(local['legalComments'], 'inline');
  assert.equal(local['drop'], undefined);
  assert.equal(local['pure'], undefined);

  const release = builds.extensionBuildOptions({ entryPoint: 'source.ts', outfile: 'output.js', format: 'esm', release: true });
  assert.equal(release['minify'], true);
  assert.equal(release['legalComments'], 'eof');
  assert.deepEqual(release['drop'], ['debugger']);
  assert.deepEqual(release['pure'], ['console.debug']);
  assert.deepEqual(release['define'], {
    'process.env.NODE_ENV': '"production"',
    __IMAGE_TRAIL_E2E_OPEN_SHADOW__: 'false',
    __IMAGE_TRAIL_INTEROP_ENABLED__: 'false',
  });

  const e2e = builds.extensionBuildOptions({
    entryPoint: 'source.ts',
    outfile: 'output.js',
    format: 'esm',
    openPanelShadowForE2E: true,
  });
  assert.equal((e2e['define'] as Record<string, string>)['__IMAGE_TRAIL_E2E_OPEN_SHADOW__'], 'true');

  const interop = builds.extensionBuildOptions({
    entryPoint: 'source.ts',
    outfile: 'output.js',
    format: 'esm',
    interopEnabled: true,
  });
  assert.equal((interop['define'] as Record<string, string>)['__IMAGE_TRAIL_INTEROP_ENABLED__'], 'true');
});

test('release-mode detection and minification regression threshold are explicit', () => {
  assert.equal(builds.isReleaseBuild({ IMAGE_TRAIL_RELEASE_BUILD: '1' }), true);
  assert.equal(builds.isReleaseBuild({ IMAGE_TRAIL_RELEASE_BUILD: '0' }), false);
  assert.equal(builds.isInteropFeatureEnabled({ IMAGE_TRAIL_ENABLE_INTEROP: '1' }), true);
  assert.equal(builds.isInteropFeatureEnabled({ IMAGE_TRAIL_ENABLE_INTEROP: '0' }), false);
  assert.equal(builds.opensPanelShadowForE2E({ IMAGE_TRAIL_E2E_OPEN_SHADOW: '1' }), true);
  assert.equal(builds.opensPanelShadowForE2E({ IMAGE_TRAIL_E2E_OPEN_SHADOW: '0' }), false);
  assert.equal(builds.minificationImproved(1_000, 1_000), true);
  assert.equal(builds.minificationImproved(10_000, 9_900), false);
  assert.equal(builds.minificationImproved(10_000, 8_000), true);
});

test('baseline manifests omit native messaging and experimental interop builds opt in', () => {
  const source = {
    name: 'Image Trail',
    permissions: ['activeTab', 'nativeMessaging', 'storage'],
  };

  assert.deepEqual(manifests.extensionManifestForBuild(source, { interopEnabled: false }).permissions, ['activeTab', 'storage']);
  assert.deepEqual(manifests.extensionManifestForBuild(source, { interopEnabled: true }).permissions, [
    'activeTab',
    'storage',
    'nativeMessaging',
  ]);
  assert.deepEqual(source.permissions, ['activeTab', 'nativeMessaging', 'storage']);
});

test('artifact allowlist is derived from the manifest plus explicit application entrypoints', () => {
  const manifest = manifestFixture();
  const expected = artifacts.expectedExtensionArtifacts(manifest);
  assert.ok(expected.includes('manifest.json'));
  // Third-party attribution must ship inside the packaged extension.
  assert.ok(expected.includes('THIRD-PARTY-LICENSES.txt'));
  assert.ok(expected.includes('src/background/service-worker.js'));
  assert.ok(expected.includes('src/content/content-script.js'));
  assert.ok(expected.includes('src/preview/preview.css'));
  assert.ok(expected.includes('src/gallery/gallery-filters.css'));
  assert.ok(expected.includes('src/ui/styles/panel.css'));
  assert.ok(expected.includes('icons/icon16.png'));
  assert.deepEqual(artifacts.validateArtifactPaths(expected, manifest), []);
  assert.match(artifacts.validateArtifactPaths([...expected, 'src/core/source.js'], manifest).join(' '), /unexpected release artifact/u);
  assert.match(
    artifacts
      .validateArtifactPaths(
        expected.filter((file) => file !== 'manifest.json'),
        manifest,
      )
      .join(' '),
    /missing required release artifact/u,
  );
});

test('release text audit rejects debug metadata, secrets, and build-machine paths', () => {
  const cases = [
    ['bundle.js', 'debugger;'],
    ['bundle.js', 'console.debug("private URL")'],
    ['bundle.js', 'process.env.NODE_ENV'],
    ['bundle.js', "process.env['NODE_ENV']"],
    ['bundle.js', 'process.env[key]'],
    ['bundle.js', '//# sourceMappingURL=bundle.js.map'],
    ['bundle.js', '//#sourceMappingURL=bundle.js.map'],
    ['bundle.css', '/*# sourceMappingURL=bundle.css.map */'],
    ['bundle.js', '-----BEGIN PRIVATE KEY-----'],
    ['bundle.js', 'AKIA1234567890ABCDEF'],
    ['bundle.js', 'const source = "/Users/example/image-trail"'],
    ['bundle.js', 'const source = "/workspace/image-trail"'],
  ] as const;

  for (const [file, content] of cases) {
    assert.notDeepEqual(artifacts.validateReleaseArtifactText(file, content, '/workspace/image-trail'), []);
  }
  assert.deepEqual(
    artifacts.validateReleaseArtifactText('bundle.js', 'console.warn("bounded failure");console.error("fatal failure")', '/workspace'),
    [],
  );
});

test('extension stylesheet output paths remain inside dist on Windows', () => {
  const source = win32.join('extension', 'src', 'ui', 'styles', 'panel.css');
  assert.equal(builds.extensionOutputPath(source, win32), win32.join('extension', 'dist', 'src', 'ui', 'styles', 'panel.css'));
  assert.throws(() => builds.extensionOutputPath(win32.join('extension', 'outside.css'), win32), /must be inside/u);
});

test('dynamic injected stylesheet packaging flattens relative imports into one resource', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'image-trail-css-bundle-'));
  const sourceDirectory = join(directory, 'source');
  const entry = join(sourceDirectory, 'entry.css');
  const output = join(directory, 'dist', 'entry.css');
  mkdirSync(sourceDirectory);
  writeFileSync(join(sourceDirectory, 'tokens.css'), ':root { --accent: #abc; }\n');
  writeFileSync(entry, "@import './tokens.css';\n.panel { color: var(--accent); }\n");

  try {
    await builds.bundleStylesheet(entry, output, { release: false });
    const bundled = readFileSync(output, 'utf8');
    assert.doesNotMatch(bundled, /@import/u);
    assert.match(bundled, /--accent:\s*#abc/u);
    assert.match(bundled, /\.panel\s*\{/u);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('release build identity rejects extra metadata and local build markers', () => {
  assert.deepEqual(artifacts.validateReleaseBuildInfo(releaseBuildInfo()), []);
  assert.match(artifacts.validateReleaseBuildInfo(releaseBuildInfo({ sourceRoot: '/tmp/repo' })).join(' '), /keys must be exactly/u);
  assert.match(
    artifacts.validateReleaseBuildInfo(releaseBuildInfo({ mode: 'local', worktree: 'image-trail' })).join(' '),
    /release mode.*worktree/u,
  );
});

test('release manifests reject the feature-gated native messaging permission', () => {
  assert.deepEqual(artifacts.validateReleaseManifest({ permissions: ['activeTab', 'storage'] }), []);
  assert.match(artifacts.validateReleaseManifest({ permissions: ['nativeMessaging'] }).join(' '), /must not request nativeMessaging/u);
});

test('release manifests require dynamic URLs for every web-accessible-resource group', () => {
  const resources = ['src/ui/styles/panel-entry.css'];
  assert.deepEqual(
    artifacts.validateReleaseManifest({
      web_accessible_resources: [{ resources, matches: ['https://*/*'], use_dynamic_url: true }],
    }),
    [],
  );
  assert.match(
    artifacts.validateReleaseManifest({ web_accessible_resources: [{ resources, matches: ['https://*/*'] }] }).join(' '),
    /group 0 must use a dynamic URL/u,
  );
});

test('build pipeline typechecks without emitting source-shaped modules and audits every build', () => {
  const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: Record<string, string> };
  assert.match(packageJson.scripts['build'] ?? '', /tsc --noEmit -p tsconfig\.json/u);
  assert.match(packageJson.scripts['build'] ?? '', /build-preview-page\.mjs/u);
  assert.match(packageJson.scripts['build'] ?? '', /npm run check:artifacts/u);
  assert.match(packageJson.scripts['build:release'] ?? '', /IMAGE_TRAIL_ENABLE_INTEROP=0/u);
  assert.match(packageJson.scripts['build:release'] ?? '', /audit-extension-artifacts\.mjs --require-release/u);
  assert.match(packageJson.scripts['test:e2e:release'] ?? '', /IMAGE_TRAIL_ENABLE_INTEROP=0/u);
  assert.match(packageJson.scripts['test:e2e:release'] ?? '', /IMAGE_TRAIL_RELEASE_BUILD=1 npm run test:e2e/u);
});
