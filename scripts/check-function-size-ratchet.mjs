#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

import { parseNameStatus } from './check-file-size-ratchet.mjs';

export const UI_FUNCTION_MAX_LINES = 99;
const GUARDED_UI_SOURCE = /^extension\/src\/ui\/.*\.tsx?$/u;

function isFunctionLike(node) {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node) ||
    ts.isConstructorDeclaration(node)
  );
}

function nodeName(node, sourceFile) {
  if (ts.isConstructorDeclaration(node)) return 'constructor';
  if ('name' in node && node.name) return node.name.getText(sourceFile);
  const parent = node.parent;
  if (ts.isVariableDeclaration(parent) || ts.isPropertyAssignment(parent) || ts.isPropertyDeclaration(parent)) {
    return parent.name.getText(sourceFile);
  }
  if (ts.isCallExpression(parent)) return `${parent.expression.getText(sourceFile)} callback`;
  return '<anonymous>';
}

function functionLineCount(node, sourceFile) {
  const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line;
  const endPosition = Math.max(node.getStart(sourceFile), node.end - 1);
  const end = sourceFile.getLineAndCharacterOfPosition(endPosition).line;
  return end - start + 1;
}

export function collectFunctionSizes(sourceText, fileName = 'source.ts') {
  const scriptKind = fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.Latest, true, scriptKind);
  const metrics = [];
  const occurrences = new Map();

  const visit = (node, scope) => {
    let childScope = scope;
    if (isFunctionLike(node)) {
      const name = nodeName(node, sourceFile);
      const identity = [...scope, name].join(' > ');
      const occurrence = (occurrences.get(identity) ?? 0) + 1;
      occurrences.set(identity, occurrence);
      const key = `${identity}#${occurrence}`;
      metrics.push({ key, name, lines: functionLineCount(node, sourceFile) });
      childScope = [...scope, `${name}#${occurrence}`];
    }
    ts.forEachChild(node, (child) => visit(child, childScope));
  };

  visit(sourceFile, []);
  return metrics;
}

export function evaluateFunctionSizeChanges(changes) {
  const results = [];
  for (const change of changes) {
    if (!GUARDED_UI_SOURCE.test(change.path) || change.currentText === null) continue;
    const baseFile = change.previousPath ?? change.path;
    const baseline = new Map(
      (change.baseText === null ? [] : collectFunctionSizes(change.baseText, baseFile)).map((metric) => [metric.key, metric]),
    );
    for (const metric of collectFunctionSizes(change.currentText, change.path)) {
      if (metric.lines <= UI_FUNCTION_MAX_LINES) continue;
      const previous = baseline.get(metric.key);
      const ok = previous !== undefined && metric.lines <= previous.lines;
      results.push({
        path: change.path,
        functionName: metric.name,
        key: metric.key,
        baseLines: previous?.lines ?? null,
        currentLines: metric.lines,
        ok,
        status: previous === undefined ? 'new-oversized' : metric.lines > previous.lines ? 'oversized-grew' : 'oversized-not-grown',
      });
    }
  }
  return { ok: results.every((result) => result.ok), results };
}

function splitNullList(value) {
  return value.split('\0').filter(Boolean);
}

function resolveBaseRef() {
  for (const ref of ['origin/main', 'main']) {
    try {
      execFileSync('git', ['rev-parse', '--verify', '--quiet', ref], { stdio: 'ignore' });
      return ref;
    } catch {
      continue;
    }
  }
  return null;
}

function readGitText(revision, file) {
  try {
    return execFileSync('git', ['show', `${revision}:${file}`], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
  } catch {
    return null;
  }
}

function gatherChanges() {
  if (process.env.FUNCTION_SIZE_CHECK_CHANGES) return JSON.parse(process.env.FUNCTION_SIZE_CHECK_CHANGES);
  const baseRef = resolveBaseRef();
  if (!baseRef) return null;
  const mergeBase = execFileSync('git', ['merge-base', 'HEAD', baseRef], { encoding: 'utf8' }).trim();
  const output = execFileSync('git', ['diff', '--name-status', '-z', '-M', mergeBase, '--'], {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });
  const changes = parseNameStatus(output);
  const trackedPaths = new Set(changes.map((change) => change.path));
  for (const path of splitNullList(execFileSync('git', ['ls-files', '--others', '--exclude-standard', '-z'], { encoding: 'utf8' }))) {
    if (!trackedPaths.has(path)) changes.push({ status: 'A', path });
  }
  return changes.map((change) => ({
    ...change,
    baseText: change.status === 'A' ? null : readGitText(mergeBase, change.previousPath ?? change.path),
    currentText: change.status === 'D' || !existsSync(change.path) ? null : readFileSync(change.path, 'utf8'),
  }));
}

function printReport(result) {
  if (result.results.length === 0) {
    console.log(`Function-size ratchet OK: changed UI functions are at most ${UI_FUNCTION_MAX_LINES} lines.`);
    return;
  }
  console.log(`Function-size ratchet report (physical lines, ceiling ${UI_FUNCTION_MAX_LINES}):`);
  for (const item of result.results) {
    const before = item.baseLines === null ? '-' : item.baseLines;
    console.log(`  ${item.ok ? 'PASS' : 'FAIL'} ${item.path} :: ${item.functionName}: ${before} -> ${item.currentLines} (${item.status})`);
  }
}

function main() {
  const changes = gatherChanges();
  if (!changes) {
    console.log('No origin/main or main ref found; skipping function-size ratchet.');
    return;
  }
  const result = evaluateFunctionSizeChanges(changes);
  printReport(result);
  if (!result.ok) {
    console.error('Function-size ratchet failed: split new 100+ line UI functions and do not grow legacy oversized functions.');
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
