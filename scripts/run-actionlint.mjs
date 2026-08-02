#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const VERSION = '1.7.12';
const RELEASE_BASE = `https://github.com/rhysd/actionlint/releases/download/v${VERSION}`;
const ARCHIVES = new Map([
  ['darwin-arm64', ['darwin_arm64', 'aba9ced2dee8d27fecca3dc7feb1a7f9a52caefa1eb46f3271ea66b6e0e6953f']],
  ['darwin-x64', ['darwin_amd64', '5b44c3bc2255115c9b69e30efc0fecdf498fdb63c5d58e17084fd5f16324c644']],
  ['linux-arm64', ['linux_arm64', '325e971b6ba9bfa504672e29be93c24981eeb1c07576d730e9f7c8805afff0c6']],
  ['linux-x64', ['linux_amd64', '8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8']],
]);

async function download(url) {
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) throw new Error(`actionlint download failed: ${response.status} ${response.statusText}`);
  return Buffer.from(await response.arrayBuffer());
}

function verifyArchive(archive, expectedDigest) {
  const actualDigest = createHash('sha256').update(archive).digest('hex');
  if (actualDigest !== expectedDigest) {
    throw new Error(`actionlint archive digest mismatch: expected ${expectedDigest}, received ${actualDigest}`);
  }
}

async function installBinary(cacheDirectory, archiveId, expectedDigest) {
  const archiveName = `actionlint_${VERSION}_${archiveId}.tar.gz`;
  const archivePath = path.join(cacheDirectory, archiveName);
  let archive;
  try {
    archive = await readFile(archivePath);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    archive = await download(`${RELEASE_BASE}/${archiveName}`);
    await writeFile(archivePath, archive);
  }
  verifyArchive(archive, expectedDigest);

  const cachePath = path.join(cacheDirectory, 'actionlint');
  execFileSync('tar', ['-xzf', archivePath, '-C', cacheDirectory, 'actionlint'], { stdio: 'inherit' });
  await chmod(cachePath, 0o755);
  return cachePath;
}

async function resolveBinary() {
  const target = ARCHIVES.get(`${process.platform}-${process.arch}`);
  if (!target) throw new Error(`actionlint v${VERSION} is unsupported on ${process.platform}-${process.arch}`);

  const cacheDirectory = path.resolve('node_modules/.cache', `actionlint-v${VERSION}`);
  await mkdir(cacheDirectory, { recursive: true });
  return installBinary(cacheDirectory, target[0], target[1]);
}

const binary = await resolveBinary();
execFileSync(binary, process.argv.slice(2), { stdio: 'inherit' });
