#!/usr/bin/env node

// Dependency-license gate. Reads the lockfile, fails the build when any shipped
// (production) dependency carries a disallowed or missing license, and keeps the
// committed third-party attribution file in sync with what actually ships.
//
//   node scripts/check-licenses.mjs           validate policy + attribution freshness
//   node scripts/check-licenses.mjs --write    regenerate THIRD-PARTY-LICENSES.txt

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { describeViolation, evaluateLicenses, lockfileDependencies, manifestLicense, renderAttribution } from './license-policy.mjs';

export const ATTRIBUTION_FILE = 'THIRD-PARTY-LICENSES.txt';

// The lockfile frequently omits the `license` field, so treat the installed
// package.json as authoritative and fall back to the lockfile value only when
// the manifest cannot be read (e.g. an optional dependency not installed here).
async function resolveLicense(dependency) {
  if (!dependency.path) return dependency.license;
  try {
    const manifest = JSON.parse(await readFile(path.join(dependency.path, 'package.json'), 'utf8'));
    return manifestLicense(manifest) ?? dependency.license;
  } catch {
    return dependency.license;
  }
}

async function readAttribution() {
  try {
    return await readFile(ATTRIBUTION_FILE, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

async function main() {
  const write = process.argv.slice(2).includes('--write');
  const lock = JSON.parse(await readFile('package-lock.json', 'utf8'));
  const rawDependencies = lockfileDependencies(lock);
  const dependencies = await Promise.all(
    rawDependencies.map(async (dependency) => ({ ...dependency, license: await resolveLicense(dependency) })),
  );
  const production = dependencies.filter((dependency) => !dependency.dev);
  const { errors, warnings } = evaluateLicenses(dependencies);

  // Dev dependencies never ship, so surface only high-signal warnings inline
  // (a recognized but non-permissive license) and summarize missing-metadata
  // counts, which are usually just packages that omit the field.
  const disallowedDev = warnings.filter((warning) => warning.kind === 'disallowed');
  const unknownDev = warnings.filter((warning) => warning.kind === 'unknown');
  for (const warning of disallowedDev) console.warn(`license warning (devDependency): ${describeViolation(warning)}`);
  if (unknownDev.length > 0)
    console.warn(`license note: ${unknownDev.length} devDependencies have no resolvable license metadata (advisory only).`);

  const expectedAttribution = renderAttribution(production);
  if (write) {
    await writeFile(ATTRIBUTION_FILE, expectedAttribution);
    console.log(`Wrote ${ATTRIBUTION_FILE} (${production.length} bundled dependencies).`);
  }

  if (errors.length > 0) {
    console.error('Disallowed dependency licenses (production tree):');
    for (const error of errors) console.error(`  - ${describeViolation(error)}`);
    console.error('Add the identifier to ALLOWED_LICENSES in scripts/license-policy.mjs only if it is truly permissible.');
    process.exitCode = 1;
    return;
  }

  if (!write) {
    const actual = await readAttribution();
    if (actual !== expectedAttribution) {
      console.error(`${ATTRIBUTION_FILE} is stale. Run "npm run licenses:write" and commit the result.`);
      process.exitCode = 1;
      return;
    }
  }

  console.log(`License check OK: ${production.length} bundled and ${dependencies.length - production.length} dev dependencies scanned.`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
