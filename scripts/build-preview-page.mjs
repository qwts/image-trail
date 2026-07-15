#!/usr/bin/env node

import { buildExtensionEntry } from './extension-build-policy.mjs';

await buildExtensionEntry({
  entryPoint: 'extension/src/preview/preview.js',
  outfile: 'extension/dist/src/preview/preview.js',
  format: 'iife',
});
