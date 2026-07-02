#!/usr/bin/env node

import { build } from 'esbuild';

await build({
  entryPoints: ['extension/src/background/service-worker.ts'],
  outfile: 'extension/dist/src/background/service-worker.js',
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  logLevel: 'info',
});
