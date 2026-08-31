#!/usr/bin/env node

import process from 'node:process';
import { auditExtensionArtifacts } from './extension-artifact-policy.mjs';

const requireRelease = process.argv.slice(2).includes('--require-release');
const requireExperimental = process.argv.slice(2).includes('--require-experimental');
const result = await auditExtensionArtifacts({
  directory: 'extension/dist',
  rootDirectory: process.cwd(),
  requireRelease,
  requireExperimental,
  allowE2ETestBuild: process.env.IMAGE_TRAIL_E2E_TEST_BUILD === '1',
});

if (result.errors.length > 0) {
  throw new Error(`Extension artifact audit failed:\n${result.errors.map((error) => `  - ${error}`).join('\n')}`);
}

console.log(`Extension artifact audit OK: ${result.files.length} allowlisted files (${result.buildInfo.mode} build).`);
