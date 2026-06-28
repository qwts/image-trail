#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const rootDirectory = process.cwd();
const manifest = JSON.parse(await readFile('extension/manifest.json', 'utf8'));
const mode = process.env.IMAGE_TRAIL_RELEASE_BUILD === '1' ? 'release' : 'local';

const buildInfo = {
  schemaVersion: 1,
  version: String(manifest.version ?? '0.0.0'),
  builtAt: new Date().toISOString(),
  commit: await gitValue(['rev-parse', '--short=12', 'HEAD']),
  branch: await gitValue(['branch', '--show-current']),
  worktree: mode === 'release' ? null : localWorktreeLabel(rootDirectory),
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? null,
  mode,
};

await mkdir('extension/dist', { recursive: true });
await writeFile('extension/dist/build-info.json', `${JSON.stringify(buildInfo, null, 2)}\n`);

async function gitValue(args) {
  try {
    const { stdout } = await execFileAsync('git', args, { cwd: rootDirectory });
    const value = stdout.trim();
    return value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

function localWorktreeLabel(absolutePath) {
  const override = process.env.IMAGE_TRAIL_BUILD_LABEL?.trim();
  if (override) return sanitizeLabel(override);
  const segments = absolutePath.split(path.sep).filter(Boolean);
  return sanitizeLabel(segments.slice(-2).join('/'));
}

function sanitizeLabel(label) {
  return label.replace(/[^a-zA-Z0-9._/-]+/gu, '-').slice(0, 80) || null;
}
