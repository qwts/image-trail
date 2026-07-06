#!/usr/bin/env node

import { build } from 'esbuild';

await build({
  entryPoints: ['extension/src/gallery/gallery.ts'],
  outfile: 'extension/dist/src/gallery/gallery.js',
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  logLevel: 'info',
});
