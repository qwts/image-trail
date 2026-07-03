#!/usr/bin/env node

import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const rootDirectory = process.cwd();
const coverageMapPath = path.join(rootDirectory, 'tests/e2e/coverage-map.json');
const allowedCoverageTypes = new Set(['playwright-e2e', 'storybook', 'unit-dom', 'manual', 'deferred']);

async function pathExists(relativePath) {
  try {
    await stat(path.join(rootDirectory, relativePath));
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

async function listE2eSpecs(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const specs = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      specs.push(...(await listE2eSpecs(entryPath)));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.spec.ts')) {
      specs.push(path.relative(rootDirectory, entryPath));
    }
  }

  return specs;
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  return typeof value === 'string' ? [value] : [];
}

const coverageMap = JSON.parse(await readFile(coverageMapPath, 'utf8'));
const failures = [];

if (!Array.isArray(coverageMap.entries)) {
  failures.push('coverage-map.json must contain an entries array.');
}

const e2eSpecPaths = new Set(await listE2eSpecs(path.join(rootDirectory, 'tests/e2e')));
const coveredE2eSpecPaths = new Set();

for (const [entryIndex, entry] of (coverageMap.entries ?? []).entries()) {
  const entryLabel = typeof entry?.id === 'string' ? entry.id : `entries[${entryIndex}]`;
  if (typeof entry?.id !== 'string' || entry.id.length === 0) {
    failures.push(`${entryLabel}: id is required.`);
  }
  if (typeof entry?.wiki !== 'string' || entry.wiki.length === 0) {
    failures.push(`${entryLabel}: wiki is required.`);
  }
  if (!Array.isArray(entry?.coverage) || entry.coverage.length === 0) {
    failures.push(`${entryLabel}: coverage must list at least one coverage source.`);
  }
  if (typeof entry?.repoPath === 'string' && !(await pathExists(entry.repoPath))) {
    failures.push(`${entryLabel}: repoPath does not exist: ${entry.repoPath}`);
  }

  for (const [coverageIndex, coverage] of (entry.coverage ?? []).entries()) {
    const coverageLabel = `${entryLabel}.coverage[${coverageIndex}]`;
    if (!allowedCoverageTypes.has(coverage?.type)) {
      failures.push(`${coverageLabel}: unsupported type "${coverage?.type}".`);
      continue;
    }

    const paths = asArray(coverage.path ?? coverage.paths);
    for (const coveredPath of paths) {
      if (!(await pathExists(coveredPath))) {
        failures.push(`${coverageLabel}: path does not exist: ${coveredPath}`);
      }
      if (coverage.type === 'playwright-e2e') {
        coveredE2eSpecPaths.add(coveredPath);
        if (!coveredPath.endsWith('.spec.ts')) {
          failures.push(`${coverageLabel}: Playwright coverage path must be a .spec.ts file: ${coveredPath}`);
        }
      }
    }

    if (coverage.type === 'manual' && typeof coverage.reason !== 'string') {
      failures.push(`${coverageLabel}: manual coverage requires a reason.`);
    }
    if (coverage.type === 'deferred' && typeof coverage.issue !== 'number') {
      failures.push(`${coverageLabel}: deferred coverage requires a numeric issue.`);
    }
  }
}

for (const specPath of e2eSpecPaths) {
  if (!coveredE2eSpecPaths.has(specPath)) {
    failures.push(`Missing coverage-map entry for Playwright spec: ${specPath}`);
  }
}

for (const specPath of coveredE2eSpecPaths) {
  if (!e2eSpecPaths.has(specPath)) {
    failures.push(`Coverage map references missing Playwright spec: ${specPath}`);
  }
}

if (failures.length > 0) {
  console.error('E2E coverage map validation failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(`Validated ${coverageMap.entries.length} E2E coverage-map entries and ${e2eSpecPaths.size} Playwright spec file.`);
