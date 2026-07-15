#!/usr/bin/env node

import { buildExtensionEntry } from './extension-build-policy.mjs';

await buildExtensionEntry({
  entryPoint: 'extension/src/destinations/destination-page.tsx',
  outfile: 'extension/dist/src/destinations/destination-page.js',
  format: 'esm',
  jsx: 'automatic',
});
