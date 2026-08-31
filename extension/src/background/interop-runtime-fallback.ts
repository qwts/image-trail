import type { InteropRuntimeContext, InteropRuntimeResult } from '../core/interop/runtime-state.js';
import * as progressViews from './interop-runtime-progress.js';

/** Privacy-safe response when the service-worker runtime cannot load status. */
export function fallbackInteropRuntime(context: InteropRuntimeContext): InteropRuntimeResult {
  const detail = 'Local Overlook connection status could not be loaded.';
  return {
    ok: false,
    snapshot: {
      entry: context.entry,
      operation: 'move',
      target: 'overlook',
      provider: { id: 'icloud-drive', label: 'Local — Overlook on this computer', state: 'unavailable', detail },
      pairing: 'invalid',
      phase: 'failed',
      counts: progressViews.emptyInteropCounts(context.total),
      processed: 0,
      conflicts: [],
      error: { code: 'provider-unavailable', message: detail, retryable: true },
      active: false,
      locked: context.locked,
    },
  };
}
