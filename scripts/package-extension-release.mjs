#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import { evaluateVersionArtifacts } from './check-version-policy.mjs';

const execFileAsync = promisify(execFile);
const STABLE_SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u;
const DIST_DIRECTORY = 'extension/dist';
const RELEASE_DIRECTORY = 'release';

export function expectedReleaseTag(version) {
  return `v${version}`;
}

export function validateReleaseTag(tag, version) {
  if (!STABLE_SEMVER.test(version)) return [`release version must be stable three-component semver, got "${version}"`];
  const expected = expectedReleaseTag(version);
  return tag === expected ? [] : [`release tag must be exactly "${expected}", got "${tag}"`];
}

export function validateArchiveEntries(entries) {
  const errors = [];
  const normalizedEntries = entries.filter(Boolean);
  if (!normalizedEntries.includes('manifest.json')) errors.push('archive must contain manifest.json at its root');
  if (!normalizedEntries.includes('build-info.json')) errors.push('archive must contain build-info.json at its root');

  for (const entry of normalizedEntries) {
    if (entry.startsWith('/') || entry.startsWith('../') || entry.includes('/../') || entry.includes('\\')) {
      errors.push(`archive entry is not a safe relative POSIX path: "${entry}"`);
    }
    if (entry.startsWith('extension/dist/')) errors.push(`archive must contain dist contents, not the dist directory: "${entry}"`);
    if (entry.endsWith('/.DS_Store') || entry === '.DS_Store') errors.push(`archive contains forbidden metadata file: "${entry}"`);
  }
  return errors;
}

export function releaseArtifactNames(version) {
  const archive = `image-trail-${expectedReleaseTag(version)}.zip`;
  return { archive, checksum: `${archive}.sha256` };
}

async function collectFiles(directory, relativeDirectory = '') {
  const files = [];
  const entries = await readdir(path.join(directory, relativeDirectory), { withFileTypes: true });
  for (const entry of entries) {
    const relativePath = path.posix.join(relativeDirectory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Release build contains a symbolic link: ${relativePath}`);
    if (entry.isDirectory()) files.push(...(await collectFiles(directory, relativePath)));
    if (entry.isFile()) files.push(relativePath);
  }
  return files.sort();
}

function requestedTag(args) {
  const index = args.indexOf('--tag');
  if (index === -1) return null;
  const tag = args[index + 1];
  if (!tag || tag.startsWith('--')) throw new Error('--tag requires a value');
  return tag;
}

async function main() {
  const pkg = JSON.parse(await readFile('package.json', 'utf8'));
  const manifest = JSON.parse(await readFile(`${DIST_DIRECTORY}/manifest.json`, 'utf8'));
  const packageLock = JSON.parse(await readFile('package-lock.json', 'utf8'));
  const buildInfo = JSON.parse(await readFile(`${DIST_DIRECTORY}/build-info.json`, 'utf8'));
  const version = String(pkg.version);
  const errors = evaluateVersionArtifacts({
    packageVersion: version,
    manifestVersion: String(manifest.version),
    lockVersion: packageLock.version,
    lockRootVersion: packageLock.packages?.['']?.version,
    buildInfo,
    requiredBuildMode: 'release',
  });
  const tag = requestedTag(process.argv.slice(2));
  if (tag) errors.push(...validateReleaseTag(tag, version));

  const files = await collectFiles(DIST_DIRECTORY);
  errors.push(...validateArchiveEntries(files));
  if (errors.length > 0) {
    throw new Error(`Release package validation failed:\n${errors.map((error) => `  - ${error}`).join('\n')}`);
  }

  await rm(RELEASE_DIRECTORY, { recursive: true, force: true });
  await mkdir(RELEASE_DIRECTORY, { recursive: true });
  const names = releaseArtifactNames(version);
  const archivePath = path.resolve(RELEASE_DIRECTORY, names.archive);
  await execFileAsync('zip', ['-X', '-q', archivePath, ...files], { cwd: DIST_DIRECTORY });

  const { stdout } = await execFileAsync('unzip', ['-Z1', archivePath]);
  const archivedFiles = stdout.split(/\r?\n/u).filter(Boolean);
  const archiveErrors = validateArchiveEntries(archivedFiles);
  if (archiveErrors.length > 0 || archivedFiles.join('\n') !== files.join('\n')) {
    throw new Error(
      `Created archive does not exactly match the validated release build${archiveErrors.length ? `:\n${archiveErrors.join('\n')}` : '.'}`,
    );
  }

  const digest = createHash('sha256')
    .update(await readFile(archivePath))
    .digest('hex');
  await writeFile(path.join(RELEASE_DIRECTORY, names.checksum), `${digest}  ${names.archive}\n`);
  console.log(`Release package: ${path.relative(process.cwd(), archivePath)}`);
  console.log(`SHA-256: ${digest}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
