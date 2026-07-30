#!/usr/bin/env node

import { buildExtensionEntry, EXTENSION_ENTRY_POINTS, isInteropFeatureEnabled } from './extension-build-policy.mjs';

await buildExtensionEntry(EXTENSION_ENTRY_POINTS.destination);
if (isInteropFeatureEnabled()) await buildExtensionEntry(EXTENSION_ENTRY_POINTS.interopPairingImport);
