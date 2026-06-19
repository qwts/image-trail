#!/usr/bin/env node

import { build } from 'esbuild';

await build({
  entryPoints: ['extension/src/content/content-script.ts'],
  outfile: 'extension/dist/src/content/content-script.js',
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2022',
  logLevel: 'info',
});
