import type { InteropErrorCode, InteropTransferPhase } from '../../core/interop/contract.js';
import type { InteropCounts } from '../../core/interop/messages.js';
import type { InteropEntryContext, InteropRuntimeSnapshot } from '../../core/interop/runtime-state.js';

export type InteropVisibleWorkflow = InteropRuntimeSnapshot;
export type { InteropEntryContext } from '../../core/interop/runtime-state.js';

export const EMPTY_INTEROP_COUNTS: InteropCounts = Object.freeze({
  total: 0,
  eligible: 0,
  duplicate: 0,
  conflict: 0,
  metadataOnly: 0,
  unsupported: 0,
  skipped: 0,
  failed: 0,
  acknowledged: 0,
  finalized: 0,
});

export function blockedInteropWorkflow(entry: InteropEntryContext, total: number, locked = false): InteropVisibleWorkflow {
  return {
    entry,
    operation: 'move',
    target: 'overlook',
    provider: {
      id: 'pcloud',
      label: 'pCloud',
      state: 'unavailable',
      detail: 'Separate pCloud interoperability access is not configured.',
    },
    pairing: 'unpaired',
    phase: 'queued',
    counts: { ...EMPTY_INTEROP_COUNTS, total },
    processed: 0,
    conflicts: [],
    error: {
      code: 'provider-unavailable',
      message: 'Eligibility has not been checked. No records or originals have been transferred.',
      retryable: true,
    },
    locked,
  };
}

export const INTEROP_REVIEW_LABELS = Object.freeze({
  eligible: 'Eligible',
  duplicate: 'Duplicate',
  conflict: 'Conflict',
  metadataOnly: 'Metadata only',
  unsupported: 'Unsupported',
  skipped: 'Skipped',
});

export function interopPhaseLabel(phase: InteropTransferPhase): string {
  return phase === 'awaiting-acknowledgement'
    ? 'Awaiting verified acknowledgement'
    : phase
        .split('-')
        .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
        .join(' ');
}

export function interopRecoveryLabel(code: InteropErrorCode): string {
  if (code === 'auth-expired') return 'Reconnect';
  if (code === 'offline' || code === 'interrupted' || code === 'partial-failure') return 'Resume';
  if (code === 'quota') return 'Review quota';
  if (code === 'wrong-key') return 'Import pairing again';
  return 'Retry check';
}
