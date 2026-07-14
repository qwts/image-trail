#!/usr/bin/env node

import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const manifestPath = path.join(root, 'tests/e2e/visual-acceptance.json');
const expectedFiles = [
  '01-panel.png',
  '02-mocked-tab.png',
  '03-capture-flash.png',
  '04-dashboard.png',
  '05-gallery.png',
  '06-recall.png',
  '07-settings.png',
  '08-context-gallery.png',
  '09-context-feed.png',
  '10-help.png',
  '11-detached-windows.png',
  '11a-settings-display.png',
  '12-settings-privacy.png',
  '13-settings-automation.png',
  '14-settings-utilities.png',
  '15-settings-system.png',
];
const expectedChecksum = '5696d46897fcf6ca9ee50064c83d36b95c35a7c8448576df402eccefb6741e3d';

async function exists(relativePath) {
  if (typeof relativePath !== 'string' || path.isAbsolute(relativePath)) return false;
  const resolved = path.resolve(root, relativePath);
  if (!resolved.startsWith(`${root}${path.sep}`)) return false;
  try {
    await stat(resolved);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const failures = [];
const entries = Array.isArray(manifest.entries) ? manifest.entries : [];
const actualFiles = entries.map((entry) => entry?.file);

if (manifest.schemaVersion !== 1) failures.push('schemaVersion must be 1.');
if (manifest.handoff?.sha256 !== expectedChecksum) failures.push('handoff checksum does not match the approved archive.');
if (manifest.handoff?.referenceViewport?.width !== 924 || manifest.handoff?.referenceViewport?.height !== 540) {
  failures.push('reference viewport must remain 924x540.');
}
if (manifest.handoff?.narrowViewport?.width !== 360 || manifest.handoff?.narrowViewport?.height !== 740) {
  failures.push('narrow viewport must remain 360x740.');
}
if (JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles))
  failures.push('the manifest must name all 16 handoff screenshots in order.');

for (const entry of entries) {
  const label = entry?.id ?? '<missing id>';
  if (!Array.isArray(entry?.issues) || entry.issues.length === 0 || entry.issues.some((issue) => !Number.isInteger(issue))) {
    failures.push(`${label}: at least one numeric owner issue is required.`);
  }
  if (entry?.status === 'automated') {
    if (typeof entry.scenario !== 'string' || entry.scenario.length === 0) failures.push(`${label}: automated entries require a scenario.`);
    if (!(await exists(entry.test))) failures.push(`${label}: automated test path does not exist: ${entry.test}`);
  } else if (entry?.status !== 'deferred') {
    failures.push(`${label}: status must be automated or deferred.`);
  }
}

if (failures.length > 0) {
  console.error('Visual acceptance manifest validation failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`Validated ${entries.length} handoff screenshot mappings against the approved archive checksum.`);
