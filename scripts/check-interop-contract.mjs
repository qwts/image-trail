#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const EXPECTED_SOURCE_COMMIT = '760e23ba1abeaf15bf6d56e029ebdd47d521a7e7';
const EXPECTED_MANIFEST_SHA256 = '16a7a610104d9c62c44a952aa682e56932740b6a65c633afe5ea19a0f752f657';
const contractRoot = path.resolve('contracts/interop/v1');
const sourcePath = path.resolve('contracts/interop/source.json');

function sha256(contents) {
  return createHash('sha256').update(contents).digest('hex');
}

async function contractFiles() {
  const rootFiles = (await readdir(contractRoot)).filter((fileName) => fileName.endsWith('.json') || fileName.endsWith('.md'));
  const fixtureFiles = (await readdir(path.join(contractRoot, 'fixtures')))
    .filter((fileName) => fileName.endsWith('.json'))
    .map((fileName) => path.join('fixtures', fileName));
  return [...rootFiles, ...fixtureFiles].sort();
}

async function verifySource() {
  const source = JSON.parse(await readFile(sourcePath, 'utf8'));
  const expected = {
    canonicalRepository: 'qwts/photos',
    canonicalCommit: EXPECTED_SOURCE_COMMIT,
    contractVersion: 1,
    manifestSha256: EXPECTED_MANIFEST_SHA256,
  };
  for (const [key, value] of Object.entries(expected)) {
    if (source[key] !== value) throw new Error('Interop contract provenance does not match the reviewed canonical source.');
  }
}

function parseChecksumLine(line) {
  const match = /^(?<hash>[a-f0-9]{64}) {2}(?<relativePath>.+)$/u.exec(line);
  const expectedHash = match?.groups?.['hash'];
  const relativePath = match?.groups?.['relativePath'];
  if (!expectedHash || !relativePath) throw new Error(`Invalid interop checksum entry: ${line}`);
  return { expectedHash, relativePath };
}

async function verifyChecksumEntry(line, listed) {
  const { expectedHash, relativePath } = parseChecksumLine(line);
  if (listed.has(relativePath)) throw new Error(`Duplicate interop checksum entry: ${relativePath}`);
  const absolutePath = path.resolve(contractRoot, relativePath);
  if (!absolutePath.startsWith(`${contractRoot}${path.sep}`)) throw new Error(`Unsafe interop contract path: ${relativePath}`);
  const contents = await readFile(absolutePath);
  if (sha256(contents) !== expectedHash) throw new Error(`Interop contract checksum mismatch: ${relativePath}`);
  if (relativePath.endsWith('.json')) JSON.parse(contents.toString('utf8'));
  listed.add(relativePath);
}

export async function verifyInteropContract() {
  await verifySource();

  const manifest = await readFile(path.join(contractRoot, 'SHA256SUMS'));
  if (sha256(manifest) !== EXPECTED_MANIFEST_SHA256) {
    throw new Error('Interop contract manifest does not match the pinned canonical checksum.');
  }

  const lines = manifest.toString('utf8').trim().split('\n');
  const listed = new Set();
  for (const line of lines) await verifyChecksumEntry(line, listed);

  const actual = await contractFiles();
  if (actual.length !== listed.size || actual.some((relativePath) => !listed.has(relativePath))) {
    throw new Error('Interop contract files and canonical checksum manifest differ.');
  }

  return { sourceCommit: EXPECTED_SOURCE_COMMIT, manifestSha256: EXPECTED_MANIFEST_SHA256, files: actual };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await verifyInteropContract();
  console.log(`Verified ${result.files.length} canonical interop files from ${result.sourceCommit}.`);
}
