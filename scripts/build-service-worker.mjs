#!/usr/bin/env node

import { buildExtensionEntry } from './extension-build-policy.mjs';

await buildExtensionEntry({
  entryPoint: 'extension/src/background/service-worker.ts',
  outfile: 'extension/dist/src/background/service-worker.js',
  format: 'esm',
});
