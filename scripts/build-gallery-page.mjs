#!/usr/bin/env node

import { buildExtensionEntry } from './extension-build-policy.mjs';

await buildExtensionEntry({
  entryPoint: 'extension/src/gallery/gallery.ts',
  outfile: 'extension/dist/src/gallery/gallery.js',
  format: 'esm',
  jsx: 'automatic',
});
