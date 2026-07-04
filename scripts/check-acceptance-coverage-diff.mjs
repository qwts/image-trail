#!/usr/bin/env node

// Diff-aware forcing function for the acceptance coverage map (#343). When a PR changes user-facing
// source (extension/src/ui or extension/src/content, excluding tests/stories) it must also touch
// tests/e2e/coverage-map.json — i.e. account for the change's acceptance impact by adding/updating
// an entry (automated, or manual/deferred with justification). A change with genuinely no
// acceptance impact opts out with a `no-acceptance-impact` token in the PR body or a label of the
// same name.
//
// This is intentionally strict: on an agent-driven repo a false positive is cheap (add the entry or
// the opt-out), while a silent coverage gap compounds. Runs as a step inside the required `CI` job.
//
// Inputs come from the pull_request event + `gh` (live PR body/labels, so editing the body and
// re-running picks it up). For local runs, override via env: ACCEPTANCE_CHECK_FILES (newline/comma
// list), ACCEPTANCE_CHECK_BODY, ACCEPTANCE_CHECK_LABELS (comma list).

import process from 'node:process';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const COVERAGE_MAP_PATH = 'tests/e2e/coverage-map.json';
const ACK_TOKEN = 'no-acceptance-impact';
const ACCEPTANCE_SOURCE = /^extension\/src\/(ui|content)\/.*\.ts$/u;
const NON_FLOW = /(\.test\.ts|\.stories\.ts)$/u;

/**
 * Pure decision: given the PR's changed files and opt-out signals, decide whether the acceptance
 * coverage map has been accounted for. Returns { ok, acceptanceFiles, reason }.
 */
export function evaluateAcceptanceCoverage({ changedFiles, body = '', labels = [] }) {
  const acceptanceFiles = changedFiles.filter((file) => ACCEPTANCE_SOURCE.test(file) && !NON_FLOW.test(file));
  if (acceptanceFiles.length === 0) {
    return { ok: true, acceptanceFiles, reason: 'no acceptance-relevant source changed' };
  }
  if (changedFiles.includes(COVERAGE_MAP_PATH)) {
    return { ok: true, acceptanceFiles, reason: 'coverage-map.json updated alongside the change' };
  }
  const acknowledged = body.toLowerCase().includes(ACK_TOKEN) || labels.some((label) => label.toLowerCase() === ACK_TOKEN);
  if (acknowledged) {
    return { ok: true, acceptanceFiles, reason: `opted out via "${ACK_TOKEN}"` };
  }
  return { ok: false, acceptanceFiles, reason: 'acceptance-relevant source changed with no coverage-map update or opt-out' };
}

function splitList(value) {
  return (value ?? '')
    .split(/[\n,]/u)
    .map((item) => item.trim())
    .filter(Boolean);
}

function gh(args) {
  return execFileSync('gh', args, { encoding: 'utf8' });
}

async function gatherInputs() {
  if (process.env.ACCEPTANCE_CHECK_FILES) {
    return {
      changedFiles: splitList(process.env.ACCEPTANCE_CHECK_FILES),
      body: process.env.ACCEPTANCE_CHECK_BODY ?? '',
      labels: splitList(process.env.ACCEPTANCE_CHECK_LABELS),
      context: 'local override',
    };
  }

  if (process.env.GITHUB_EVENT_NAME !== 'pull_request' || !process.env.GITHUB_EVENT_PATH) {
    return null;
  }

  const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, 'utf8'));
  const repo = process.env.GITHUB_REPOSITORY;
  const number = event.pull_request?.number ?? event.number;
  const changedFiles = splitList(gh(['api', `repos/${repo}/pulls/${number}/files`, '--paginate', '--jq', '.[].filename']));
  // Read PR body/labels live so an edited opt-out is honored on a re-run without a new commit.
  const pr = JSON.parse(gh(['api', `repos/${repo}/pulls/${number}`]));
  return {
    changedFiles,
    body: pr.body ?? '',
    labels: (pr.labels ?? []).map((label) => label.name),
    context: `PR #${number}`,
  };
}

async function main() {
  const inputs = await gatherInputs();
  if (!inputs) {
    console.log('Not a pull_request event and no local override; skipping acceptance-coverage diff check.');
    return;
  }

  const result = evaluateAcceptanceCoverage(inputs);
  if (result.ok) {
    console.log(`Acceptance coverage OK (${inputs.context}): ${result.reason}.`);
    return;
  }

  console.error(`Acceptance coverage check failed (${inputs.context}).`);
  console.error('');
  console.error('These changed files touch user-facing flows:');
  for (const file of result.acceptanceFiles) console.error(`  - ${file}`);
  console.error('');
  console.error(`Update ${COVERAGE_MAP_PATH} to account for the change — add or update an entry with`);
  console.error('automated coverage (playwright-e2e / storybook / unit-dom), or manual (with a reason)');
  console.error('or deferred (with an issue). See the wiki Testing Strategy page.');
  console.error('');
  console.error(`If this change genuinely has no acceptance-flow impact, add "${ACK_TOKEN}" to the PR`);
  console.error(`description (or apply the "${ACK_TOKEN}" label) and re-run.`);
  process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
