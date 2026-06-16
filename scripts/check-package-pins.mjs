#!/usr/bin/env node

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const DEPENDENCY_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];

const SKIPPED_DIRECTORIES = new Set(['.git', 'node_modules', 'dist', '.test-dist']);

async function findPackageManifests(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const manifests = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      if (!SKIPPED_DIRECTORIES.has(entry.name)) {
        manifests.push(...(await findPackageManifests(entryPath)));
      }
      continue;
    }

    if (entry.isFile() && entry.name === 'package.json') {
      manifests.push(entryPath);
    }
  }

  return manifests;
}

function collectLatestDependencies(manifestPath, manifest) {
  const violations = [];

  for (const field of DEPENDENCY_FIELDS) {
    const dependencies = manifest[field];
    if (!dependencies || typeof dependencies !== 'object' || Array.isArray(dependencies)) {
      continue;
    }

    for (const [dependencyName, version] of Object.entries(dependencies)) {
      if (version === 'latest') {
        violations.push({ dependencyName, field, manifestPath });
      }
    }
  }

  return violations;
}

const rootDirectory = process.cwd();
const manifestPaths = (await findPackageManifests(rootDirectory)).sort();
const violations = [];

for (const manifestPath of manifestPaths) {
  const manifestText = await readFile(manifestPath, 'utf8');
  const manifest = JSON.parse(manifestText);
  violations.push(...collectLatestDependencies(manifestPath, manifest));
}

if (violations.length > 0) {
  console.error('Do not use "latest" in package dependency fields. Pin an exact version or semver range instead.');
  for (const { dependencyName, field, manifestPath } of violations) {
    console.error(`- ${path.relative(rootDirectory, manifestPath)}: ${field}.${dependencyName}`);
  }
  process.exit(1);
}

console.log(`Checked ${manifestPaths.length} package manifest${manifestPaths.length === 1 ? '' : 's'} for "latest" dependency versions.`);
