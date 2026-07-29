#!/usr/bin/env node

import { buildExtensionEntry, EXTENSION_ENTRY_POINTS } from './extension-build-policy.mjs';

await buildExtensionEntry(EXTENSION_ENTRY_POINTS.destination);
await buildExtensionEntry(EXTENSION_ENTRY_POINTS.interopPairingImport);
