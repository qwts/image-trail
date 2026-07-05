#!/usr/bin/env node

// Runs after `changeset version` (see the changeset:version script): the extension ships from
// extension/manifest.json, so its version must follow the package.json version changesets bumped —
// that is what ties CHANGELOG.md entries to the extension version users actually install.

import { readFile, writeFile } from 'node:fs/promises';

const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const manifestText = await readFile('extension/manifest.json', 'utf8');
const manifest = JSON.parse(manifestText);

if (manifest.version === pkg.version) {
  console.log(`extension/manifest.json already at ${pkg.version}.`);
} else {
  const updated = manifestText.replace(`"version": "${manifest.version}"`, `"version": "${pkg.version}"`);
  if (JSON.parse(updated).version !== pkg.version) {
    console.error(`Could not rewrite the version field in extension/manifest.json (${manifest.version} -> ${pkg.version}).`);
    process.exit(1);
  }
  await writeFile('extension/manifest.json', updated);
  console.log(`extension/manifest.json version: ${manifest.version} -> ${pkg.version}.`);
}
