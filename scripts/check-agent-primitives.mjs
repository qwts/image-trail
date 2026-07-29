#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const ROOT_INSTRUCTION_MAX_LINES = 100;
const ADAPTERS = [
  { path: 'CLAUDE.md', maxLines: 20 },
  { path: '.github/copilot-instructions.md', maxLines: 40 },
  { path: '.cursor/rules/process-guard.mdc', maxLines: 20 },
];
const DIRECTORY_INSTRUCTIONS = ['extension/src/data/AGENTS.md', 'extension/src/ui/AGENTS.md'];
const BROAD_ALLOW_PATTERNS = [
  /^Bash\(npm run \*\)$/u,
  /^Bash\(npm test \*\)$/u,
  /^Bash\(npm install\*?\)$/u,
  /^Bash\(npx \*\)$/u,
  /^Bash\(node (?:scripts\/)?\*\)$/u,
  /^Bash\(git \*\)$/u,
  /^Bash\(gh \*\)$/u,
];
const OUTWARD_ALLOW_PATTERNS = [
  /^Bash\(npm publish/u,
  /^Bash\(npm run package:release/u,
  /^Bash\(git (?:push|rebase|worktree remove)/u,
  /^Bash\(gh issue (?:comment|create|develop|edit)/u,
  /^Bash\(gh pr (?:comment|create|merge|ready|review)/u,
  /^Bash\(gh (?:release|workflow run|run rerun)/u,
];
const REQUIRED_ASK_PREFIXES = [
  'Bash(npm publish',
  'Bash(npm run package:release',
  'Bash(git push',
  'Bash(gh issue comment',
  'Bash(gh pr create',
  'Bash(gh pr merge',
  'Bash(gh release ',
  'Bash(gh workflow run',
];
const SECRET_PATTERNS = [
  /-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----/u,
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/u,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/u,
  /\bsk-[A-Za-z0-9]{20,}\b/u,
  /\b(?:OPENAI|ANTHROPIC|GITHUB)_API_KEY\s*[:=]\s*["']?[^\s"'$<]{8,}/u,
];

function countLines(text) {
  if (text.length === 0) return 0;
  const normalized = text.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
  return normalized.endsWith('\n') ? normalized.slice(0, -1).split('\n').length : normalized.split('\n').length;
}

function readJson(root, relativePath) {
  return JSON.parse(readFileSync(path.join(root, relativePath), 'utf8'));
}

function listFiles(root, relativeDirectory) {
  const absoluteDirectory = path.join(root, relativeDirectory);
  if (!existsSync(absoluteDirectory)) return [];
  const found = [];
  for (const entry of readdirSync(absoluteDirectory)) {
    const relativePath = path.join(relativeDirectory, entry);
    const absolutePath = path.join(root, relativePath);
    if (statSync(absolutePath).isDirectory()) found.push(...listFiles(root, relativePath));
    else found.push(relativePath.split(path.sep).join('/'));
  }
  return found.sort();
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

export function findBroadAllows(settings) {
  const allow = Array.isArray(settings?.permissions?.allow) ? settings.permissions.allow : [];
  return allow.filter((rule) => typeof rule === 'string' && BROAD_ALLOW_PATTERNS.some((pattern) => pattern.test(rule)));
}

export function findOutwardAllows(settings) {
  const allow = Array.isArray(settings?.permissions?.allow) ? settings.permissions.allow : [];
  return allow.filter((rule) => typeof rule === 'string' && OUTWARD_ALLOW_PATTERNS.some((pattern) => pattern.test(rule)));
}

function validateCriteria(task, key, label) {
  const values = Array.isArray(task?.[key]) ? task[key] : [];
  return values.length >= 3 && values.every((value) => isNonEmptyString(value))
    ? null
    : `${label}: ${key} must contain at least three non-empty strings`;
}

function validateGoldenTask(task, index, ids) {
  const errors = [];
  const label = isNonEmptyString(task?.id) ? task.id : `task ${index + 1}`;
  if (!isNonEmptyString(task?.id)) errors.push(`${label}: id is required`);
  else if (ids.has(task.id)) errors.push(`${label}: id must be unique`);
  else ids.add(task.id);
  if (!isNonEmptyString(task?.category)) errors.push(`${label}: category is required`);
  if (!Number.isInteger(task?.referenceIssue) || task.referenceIssue <= 0) {
    errors.push(`${label}: referenceIssue must be a positive integer`);
  }
  if (!isNonEmptyString(task?.prompt)) errors.push(`${label}: prompt is required`);
  for (const key of ['successCriteria', 'failureSignals']) {
    const criteriaError = validateCriteria(task, key, label);
    if (criteriaError) errors.push(criteriaError);
  }
  return errors;
}

export function validateGoldenTasks(document) {
  const errors = [];
  if (document?.schemaVersion !== 1) errors.push('golden-task schemaVersion must be 1');
  const tasks = Array.isArray(document?.tasks) ? document.tasks : [];
  if (tasks.length < 3 || tasks.length > 5) errors.push('golden-task set must contain 3-5 tasks');
  const ids = new Set();
  for (const [index, task] of tasks.entries()) errors.push(...validateGoldenTask(task, index, ids));
  return errors;
}

function validateInventory(root, governance, add) {
  add('governance schemaVersion is 1', governance.schemaVersion === 1);
  add('AGENTS.md is the canonical instruction file', governance.canonicalInstructions === 'AGENTS.md');

  const declaredAdapters = (governance.vendorAdapters ?? []).map((entry) => entry.path).sort();
  const expectedAdapters = ADAPTERS.map((entry) => entry.path).sort();
  add('vendor adapter inventory matches the repository', JSON.stringify(declaredAdapters) === JSON.stringify(expectedAdapters));

  const declaredDirectories = [...(governance.directoryInstructions ?? [])].sort();
  add(
    'directory instruction inventory matches the repository',
    JSON.stringify(declaredDirectories) === JSON.stringify([...DIRECTORY_INSTRUCTIONS].sort()),
  );

  const actualSkills = listFiles(root, '.agents/skills').filter((file) => file.endsWith('/SKILL.md'));
  const declaredSkills = (governance.repoOwnedSkills ?? []).map((entry) => entry.path).sort();
  add('repo-owned skill inventory matches disk', JSON.stringify(declaredSkills) === JSON.stringify(actualSkills));

  const actualCommands = listFiles(root, '.claude/commands').filter((file) => file.endsWith('.md'));
  const declaredCommands = (governance.slashCommands ?? []).map((entry) => entry.path).sort();
  add('slash-command inventory matches disk', JSON.stringify(declaredCommands) === JSON.stringify(actualCommands));

  const supplyChain = governance.supplyChain;
  add('external MCP inventory is explicit', Array.isArray(supplyChain?.externalMcpServers));
  add('third-party skill inventory is explicit', Array.isArray(supplyChain?.thirdPartySkills));
  for (const entry of [...(supplyChain?.externalMcpServers ?? []), ...(supplyChain?.thirdPartySkills ?? [])]) {
    add(`external primitive ${entry?.name ?? '<unnamed>'} has an immutable pin`, isNonEmptyString(entry?.pin));
  }

  add('golden-task evaluation path is declared', governance.evaluationSet === '.agents/evals/golden-tasks.json');
}

function validatePermissions(settings, add) {
  const broad = findBroadAllows(settings);
  add('Claude allows contain no command-family wildcards', broad.length === 0, broad.join(', '));

  const outward = findOutwardAllows(settings);
  add('outward and history-changing commands are not pre-approved', outward.length === 0, outward.join(', '));

  const ask = Array.isArray(settings?.permissions?.ask) ? settings.permissions.ask : [];
  const missingAsk = REQUIRED_ASK_PREFIXES.filter((prefix) => !ask.some((rule) => rule.startsWith(prefix)));
  add('outward operations retain ask checkpoints', missingAsk.length === 0, missingAsk.join(', '));

  const deny = Array.isArray(settings?.permissions?.deny) ? settings.permissions.deny : [];
  const headedDenied = ['test:e2e:ui', 'test:e2e:headed'].every((name) => deny.some((rule) => rule.includes(name)));
  add('focus-stealing browser modes remain denied', headedDenied);
}

function validateAdapters(root, add, scannedFiles) {
  const duplicateHeadings = /## (?:Product Model|Storage Rules|Branch And GitHub Hygiene|Documentation And Validation)/u;
  for (const adapter of ADAPTERS) {
    const absolutePath = path.join(root, adapter.path);
    const exists = existsSync(absolutePath);
    add(`${adapter.path} exists`, exists);
    if (!exists) continue;
    const text = readFileSync(absolutePath, 'utf8');
    scannedFiles.add(adapter.path);
    add(`${adapter.path} points to AGENTS.md`, /AGENTS\.md/u.test(text));
    add(`${adapter.path} stays within ${adapter.maxLines} lines`, countLines(text) <= adapter.maxLines);
    add(`${adapter.path} does not duplicate shared instruction sections`, !duplicateHeadings.test(text));
  }
}

function validateSecrets(root, scannedFiles, add) {
  for (const file of scannedFiles) {
    const text = readFileSync(path.join(root, file), 'utf8');
    add(`${file} contains no embedded secret`, !SECRET_PATTERNS.some((pattern) => pattern.test(text)));
  }
}

export function validateAgentPrimitives(root = process.cwd()) {
  const checks = [];
  const add = (label, ok, detail = '') => checks.push({ label, ok, detail });
  const scannedFiles = new Set(['AGENTS.md', '.claude/settings.json']);

  const rootInstructions = readFileSync(path.join(root, 'AGENTS.md'), 'utf8');
  add(`AGENTS.md stays within ${ROOT_INSTRUCTION_MAX_LINES} lines`, countLines(rootInstructions) <= ROOT_INSTRUCTION_MAX_LINES);
  add('AGENTS.md links the governance inventory', rootInstructions.includes('.agents/governance.json'));
  add('AGENTS.md links the golden-task eval set', rootInstructions.includes('.agents/evals/golden-tasks.json'));

  validateAdapters(root, add, scannedFiles);
  for (const file of DIRECTORY_INSTRUCTIONS) {
    const exists = existsSync(path.join(root, file));
    add(`${file} exists`, exists);
    if (!exists) continue;
    const text = readFileSync(path.join(root, file), 'utf8');
    scannedFiles.add(file);
    add(`${file} points back to root AGENTS.md`, /\.\.\/\.\.\/\.\.\/AGENTS\.md/u.test(text));
  }

  const deepClaudeFiles = listFiles(root, 'extension/src').filter((file) => file.endsWith('/CLAUDE.md'));
  add('directory guidance is vendor-neutral', deepClaudeFiles.length === 0, deepClaudeFiles.join(', '));

  const checkCommand = readFileSync(path.join(root, '.claude/commands/check.md'), 'utf8');
  scannedFiles.add('.claude/commands/check.md');
  add(
    'check command delegates to the canonical source-command skill',
    checkCommand.includes('.agents/skills/source-command-check/SKILL.md'),
  );

  const releaseCommand = readFileSync(path.join(root, '.claude/commands/release.md'), 'utf8');
  scannedFiles.add('.claude/commands/release.md');
  add('release command delegates to the canonical release runbook', releaseCommand.includes('wiki/Versioning-and-Releases'));

  const settings = readJson(root, '.claude/settings.json');
  validatePermissions(settings, add);

  const governance = readJson(root, '.agents/governance.json');
  scannedFiles.add('.agents/governance.json');
  validateInventory(root, governance, add);

  const goldenTasks = readJson(root, governance.evaluationSet);
  scannedFiles.add(governance.evaluationSet);
  const goldenErrors = validateGoldenTasks(goldenTasks);
  add('golden-task evaluation set is valid', goldenErrors.length === 0, goldenErrors.join('; '));

  validateSecrets(root, scannedFiles, add);
  return { ok: checks.every((check) => check.ok), checks };
}

function printResult(result) {
  for (const check of result.checks) {
    const detail = check.detail ? ` (${check.detail})` : '';
    console.log(`[agent-primitives] ${check.ok ? 'ok  ' : 'FAIL'} ${check.label}${detail}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = validateAgentPrimitives();
    printResult(result);
    if (!result.ok) process.exitCode = 1;
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
