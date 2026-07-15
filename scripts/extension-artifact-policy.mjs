import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const STATIC_APPLICATION_ARTIFACTS = [
  'build-info.json',
  'manifest.json',
  'src/content/content-script.js',
  'src/preview/preview.html',
  'src/preview/preview.css',
  'src/preview/preview.js',
  'src/gallery/gallery.html',
  'src/gallery/gallery-tokens.css',
  'src/gallery/gallery.css',
  'src/gallery/gallery-filters.css',
  'src/gallery/gallery.js',
  'src/destinations/view.html',
  'src/destinations/destination-tokens.css',
  'src/destinations/destination-page.css',
  'src/destinations/destination-surfaces.css',
  'src/destinations/destination-page.js',
];
const TEXT_ARTIFACT = /\.(?:css|html|js|json)$/u;
const RELEASE_BUILD_INFO_KEYS = ['branch', 'builtAt', 'commit', 'mode', 'schemaVersion', 'timezone', 'version', 'worktree'];
const FORBIDDEN_RELEASE_TEXT = [
  { pattern: /(?:\/\/|\/\*)#\s*source(?:Mapping)?URL=/u, message: 'contains source mapping metadata' },
  { pattern: /\bdebugger\b/u, message: 'contains a debugger statement' },
  { pattern: /\bconsole\.debug\b/u, message: 'contains development debug logging' },
  { pattern: /\bprocess\.env\b|\bimport\.meta\.env\b/u, message: 'contains an unresolved environment reference' },
  { pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u, message: 'contains private key material' },
  { pattern: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/u, message: 'contains a GitHub token-shaped value' },
  { pattern: /\bAKIA[0-9A-Z]{16}\b/u, message: 'contains an AWS access-key-shaped value' },
  { pattern: /(?:^|["'\s])\/Users\/[^"'\s]+/u, message: 'contains a macOS user path' },
  { pattern: /(?:^|["'\s])\/home\/[^"'\s]+/u, message: 'contains a Linux home path' },
  { pattern: /\b[A-Za-z]:\\Users\\[^"'\s]+/u, message: 'contains a Windows user path' },
];

export function expectedExtensionArtifacts(manifest) {
  const expected = new Set(STATIC_APPLICATION_ARTIFACTS);
  if (typeof manifest.background?.service_worker === 'string') expected.add(manifest.background.service_worker);
  for (const iconPath of Object.values(manifest.icons ?? {})) expected.add(iconPath);
  for (const iconPath of Object.values(manifest.action?.default_icon ?? {})) expected.add(iconPath);
  for (const resourceGroup of manifest.web_accessible_resources ?? []) {
    for (const resource of resourceGroup.resources ?? []) expected.add(resource);
  }
  return [...expected].sort();
}

export function validateArtifactPaths(files, manifest) {
  const actual = new Set(files);
  const expected = new Set(expectedExtensionArtifacts(manifest));
  const errors = [];

  for (const file of expected) {
    if (!actual.has(file)) errors.push(`missing required release artifact: "${file}"`);
  }
  for (const file of actual) {
    if (!expected.has(file)) errors.push(`unexpected release artifact: "${file}"`);
    if (file.startsWith('/') || file.startsWith('../') || file.includes('/../') || file.includes('\\')) {
      errors.push(`release artifact is not a safe relative POSIX path: "${file}"`);
    }
  }
  return errors;
}

export function validateReleaseArtifactText(file, content, rootDirectory) {
  if (!TEXT_ARTIFACT.test(file)) return [];
  const errors = [];
  const normalizedRoot = path.resolve(rootDirectory);
  if (normalizedRoot.length > 1 && content.includes(normalizedRoot)) {
    errors.push(`${file} contains the build worktree path`);
  }
  for (const rule of FORBIDDEN_RELEASE_TEXT) {
    if (rule.pattern.test(content)) errors.push(`${file} ${rule.message}`);
  }
  return errors;
}

export function validateReleaseBuildInfo(buildInfo) {
  const errors = [];
  const keys = Object.keys(buildInfo).sort();
  if (keys.join('\n') !== RELEASE_BUILD_INFO_KEYS.join('\n')) {
    errors.push(`release build identity keys must be exactly: ${RELEASE_BUILD_INFO_KEYS.join(', ')}`);
  }
  if (buildInfo.mode !== 'release') errors.push(`release artifact audit requires release mode, got "${String(buildInfo.mode)}"`);
  if (buildInfo.worktree !== null) errors.push('release build identity must not include a worktree');
  return errors;
}

export async function collectArtifactFiles(directory, relativeDirectory = '') {
  const files = [];
  const entries = await readdir(path.join(directory, relativeDirectory), { withFileTypes: true });
  for (const entry of entries) {
    const relativePath = path.posix.join(relativeDirectory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Release build contains a symbolic link: ${relativePath}`);
    if (entry.isDirectory()) files.push(...(await collectArtifactFiles(directory, relativePath)));
    if (entry.isFile()) files.push(relativePath);
  }
  return files.sort();
}

export async function auditExtensionArtifacts({ directory, rootDirectory, requireRelease = false }) {
  const files = await collectArtifactFiles(directory);
  const manifest = JSON.parse(await readFile(path.join(directory, 'manifest.json'), 'utf8'));
  const buildInfo = JSON.parse(await readFile(path.join(directory, 'build-info.json'), 'utf8'));
  const release = buildInfo.mode === 'release';
  const errors = validateArtifactPaths(files, manifest);

  if (requireRelease || release) {
    errors.push(...validateReleaseBuildInfo(buildInfo));
    for (const file of files) {
      if (!TEXT_ARTIFACT.test(file)) continue;
      const content = await readFile(path.join(directory, file), 'utf8');
      errors.push(...validateReleaseArtifactText(file, content, rootDirectory));
    }
  }
  return { buildInfo, errors, files, manifest };
}
