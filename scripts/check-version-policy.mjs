#!/usr/bin/env node

// Version-policy gate for #387. The extension's installable version stays numeric and identical
// to package.json; local/release metadata belongs in build-info.json. Product-source PRs carry a
// changeset unless they explicitly acknowledge that the change has no release impact.

import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const ACK_TOKEN = 'no-version-impact';
const CHANGESET_FILE = /^\.changeset\/(?!README\.md$)[^/]+\.md$/u;
const PRODUCT_SOURCE = /^extension\/(?!dist\/)/u;
const NON_SHIPPING_SOURCE = /(\.test\.ts|\.stories\.ts)$/u;
const STORYBOOK_ONLY = /^extension\/src\/ui\/stories\//u;
const STABLE_SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u;

export function validateChromeExtensionVersion(version) {
  if (typeof version !== 'string') return ['version must be a string'];
  const parts = version.split('.');
  const errors = [];
  if (parts.length < 1 || parts.length > 4) errors.push('version must contain one to four integers');
  if (parts.some((part) => !/^\d+$/u.test(part))) errors.push('version components must be decimal integers');

  const numericParts = [];
  for (const part of parts) {
    if (!/^\d+$/u.test(part)) continue;
    if (part.length > 1 && part.startsWith('0')) errors.push(`version component "${part}" has a leading zero`);
    const value = Number(part);
    numericParts.push(value);
    if (!Number.isSafeInteger(value) || value > 65_535) {
      errors.push(`version component "${part}" must be between 0 and 65535`);
    }
  }
  if (numericParts.length === parts.length && numericParts.every((part) => part === 0)) {
    errors.push('version components must not all be zero');
  }
  return errors;
}

export function evaluateVersionArtifacts({ packageVersion, manifestVersion, buildInfo = null, requiredBuildMode = null }) {
  const errors = [];
  if (!STABLE_SEMVER.test(packageVersion)) {
    errors.push('package.json version must be stable three-component semver with no prerelease/build suffix');
  }
  errors.push(...validateChromeExtensionVersion(manifestVersion).map((error) => `extension/manifest.json: ${error}`));
  if (packageVersion !== manifestVersion) {
    errors.push(`package.json (${packageVersion}) and extension/manifest.json (${manifestVersion}) versions differ`);
  }

  if (buildInfo) {
    if (buildInfo.version !== manifestVersion) {
      errors.push(`extension/dist/build-info.json (${String(buildInfo.version)}) does not match ${manifestVersion}`);
    }
    if (buildInfo.mode !== 'local' && buildInfo.mode !== 'release') {
      errors.push(`extension/dist/build-info.json mode must be "local" or "release", got ${String(buildInfo.mode)}`);
    }
    if (buildInfo.mode === 'local' && (typeof buildInfo.worktree !== 'string' || buildInfo.worktree.length === 0)) {
      errors.push('local build identity must include a worktree label');
    }
    if (buildInfo.mode === 'release' && buildInfo.worktree !== null) {
      errors.push('release build identity must set worktree to null');
    }
    if (requiredBuildMode && buildInfo.mode !== requiredBuildMode) {
      errors.push(`build mode must be "${requiredBuildMode}", got ${String(buildInfo.mode)}`);
    }
  } else if (requiredBuildMode) {
    errors.push('a build identity is required when checking build mode');
  }
  return errors;
}

export function evaluateChangesetCoverage({ changedFiles, body = '', labels = [] }) {
  const productFiles = changedFiles.filter(isProductSource);
  if (productFiles.length === 0) {
    return { ok: true, productFiles, reason: 'no release-impacting extension source changed' };
  }
  if (changedFiles.some((file) => CHANGESET_FILE.test(file))) {
    return { ok: true, productFiles, reason: 'changeset added or consumed alongside the change' };
  }
  const acknowledged = body.toLowerCase().includes(ACK_TOKEN) || labels.some((label) => label.toLowerCase() === ACK_TOKEN);
  if (acknowledged) {
    return { ok: true, productFiles, reason: `opted out via "${ACK_TOKEN}"` };
  }
  return { ok: false, productFiles, reason: 'release-impacting extension source changed with no changeset or opt-out' };
}

function isProductSource(file) {
  return PRODUCT_SOURCE.test(file) && !NON_SHIPPING_SOURCE.test(file) && !STORYBOOK_ONLY.test(file);
}

function splitList(value) {
  return (value ?? '')
    .split(/[\n,]/u)
    .map((item) => item.trim())
    .filter(Boolean);
}

function command(args, options = {}) {
  return execFileSync(args[0], args.slice(1), { encoding: 'utf8', ...options });
}

function resolveBaseRef() {
  for (const ref of ['origin/main', 'main']) {
    try {
      command(['git', 'rev-parse', '--verify', '--quiet', ref], { stdio: 'ignore' });
      return ref;
    } catch {
      continue;
    }
  }
  return null;
}

async function gatherChangesetInputs() {
  if (process.env.VERSION_POLICY_CHECK_FILES) {
    return {
      changedFiles: splitList(process.env.VERSION_POLICY_CHECK_FILES),
      body: process.env.VERSION_POLICY_CHECK_BODY ?? '',
      labels: splitList(process.env.VERSION_POLICY_CHECK_LABELS),
      context: 'local override',
    };
  }

  if (process.env.GITHUB_EVENT_NAME === 'pull_request' && process.env.GITHUB_EVENT_PATH) {
    const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, 'utf8'));
    const repo = process.env.GITHUB_REPOSITORY;
    const number = event.pull_request?.number ?? event.number;
    const changedFiles = splitList(command(['gh', 'api', `repos/${repo}/pulls/${number}/files`, '--paginate', '--jq', '.[].filename']));
    const pullRequest = JSON.parse(command(['gh', 'api', `repos/${repo}/pulls/${number}`]));
    return {
      changedFiles,
      body: pullRequest.body ?? '',
      labels: (pullRequest.labels ?? []).map((label) => label.name),
      context: `PR #${number}`,
    };
  }

  const baseRef = resolveBaseRef();
  if (!baseRef) return null;
  let mergeBase;
  try {
    mergeBase = command(['git', 'merge-base', 'HEAD', baseRef]).trim();
  } catch {
    return null;
  }
  const committed = splitList(command(['git', 'diff', '--name-only', `${mergeBase}...HEAD`]));
  const unstaged = splitList(command(['git', 'diff', '--name-only', 'HEAD']));
  const staged = splitList(command(['git', 'diff', '--name-only', '--cached']));
  const commitMessages = command(['git', 'log', '--format=%B', `${mergeBase}..HEAD`]);
  return {
    changedFiles: [...new Set([...committed, ...unstaged, ...staged])],
    body: `${commitMessages}\n${process.env.VERSION_POLICY_ACK ?? ''}`,
    labels: [],
    context: `local diff vs ${baseRef}`,
  };
}

async function checkArtifacts({ includeBuildInfo, requiredBuildMode }) {
  const pkg = JSON.parse(await readFile('package.json', 'utf8'));
  const manifest = JSON.parse(await readFile('extension/manifest.json', 'utf8'));
  const buildInfo = includeBuildInfo ? JSON.parse(await readFile('extension/dist/build-info.json', 'utf8')) : null;
  const errors = evaluateVersionArtifacts({
    packageVersion: String(pkg.version),
    manifestVersion: String(manifest.version),
    buildInfo,
    requiredBuildMode,
  });
  if (errors.length > 0) {
    console.error('Version artifact check failed:');
    for (const error of errors) console.error(`  - ${error}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Version artifacts OK: ${pkg.version}${buildInfo ? ` (${buildInfo.mode} build)` : ''}.`);
}

async function checkChangeset() {
  const inputs = await gatherChangesetInputs();
  if (!inputs) {
    console.log('No main ref or PR context found; skipping changeset diff check.');
    return;
  }
  const result = evaluateChangesetCoverage(inputs);
  if (result.ok) {
    console.log(`Changeset coverage OK (${inputs.context}): ${result.reason}.`);
    return;
  }
  console.error(`Changeset coverage check failed (${inputs.context}).`);
  console.error('Release-impacting extension files:');
  for (const file of result.productFiles) console.error(`  - ${file}`);
  console.error('Add a changeset with `npm run changeset`.');
  if (inputs.context.startsWith('PR #')) {
    console.error(`For a genuinely internal change, add "${ACK_TOKEN}" to the PR body or labels.`);
  } else {
    console.error(`For a genuinely internal change, include "${ACK_TOKEN}" in a commit message or set VERSION_POLICY_ACK=${ACK_TOKEN}.`);
  }
  process.exitCode = 1;
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const artifactsOnly = args.has('--artifacts-only');
  const changesetOnly = args.has('--changeset-only');
  const includeBuildInfo = args.has('--build-info') || [...args].some((arg) => arg.startsWith('--require-build-mode='));
  const requiredBuildMode = [...args].find((arg) => arg.startsWith('--require-build-mode='))?.split('=')[1] ?? null;
  if (!changesetOnly) await checkArtifacts({ includeBuildInfo, requiredBuildMode });
  if (!artifactsOnly) await checkChangeset();
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
