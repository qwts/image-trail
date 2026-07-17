import type { InteropCounts } from '../core/interop/messages.js';
import type { InteropErrorCode, InteropTransferPhase } from '../core/interop/contract.js';
import type { InteropProviderState, InteropRuntimeConflict, InteropRuntimeError } from '../core/interop/runtime-state.js';
import { InteropTransportError } from '../core/interop/transport.js';
import type { MoveOutboxProgress } from '../data/interop/move-outbox-publisher.js';
import type { SecureSyncProgress } from '../data/interop/secure-sync-outbox-repository.js';
import { InteropMoveSetupError } from './interop-move-runtime.js';
import { InteropSyncSetupError } from './interop-sync-runtime.js';
import { SyncInboxScanError } from '../data/interop/sync-inbox-scanner.js';

export interface InteropRuntimeProgressView {
  readonly phase: InteropTransferPhase;
  readonly error: InteropRuntimeError | null;
  readonly counts: InteropCounts;
  readonly processed: number;
  readonly conflicts: readonly InteropRuntimeConflict[];
}

export function interopRuntimeError(error: unknown): InteropRuntimeError {
  if (error instanceof InteropMoveSetupError) return { code: error.code, message: error.message, retryable: error.retryable };
  if (error instanceof InteropSyncSetupError) return { code: error.code, message: error.message, retryable: error.retryable };
  if (error instanceof SyncInboxScanError) return { code: error.code, message: error.message, retryable: false };
  if (error instanceof InteropTransportError) {
    const code: InteropErrorCode =
      error.code === 'unsupported' ? 'provider-unavailable' : error.code === 'not-found' ? 'provider-unavailable' : error.code;
    return { code, message: error.message, retryable: error.retryable };
  }
  return {
    code: 'provider-unavailable',
    message: error instanceof Error ? error.message : 'Interoperability provider is unavailable.',
    retryable: false,
  };
}

export function syncProgressView(progress: SecureSyncProgress, error: InteropRuntimeError | null = null): InteropRuntimeProgressView {
  const interrupted = progress.session.phase === 'transferring' && progress.pending > 0;
  return {
    phase: interrupted ? 'failed' : progress.session.phase,
    error: interrupted
      ? { code: 'interrupted', message: 'Encrypted Sync publication is incomplete. Resume to continue.', retryable: true }
      : error,
    counts: progress.inbound?.counts ?? progress.counts,
    processed: Math.max(progress.delivered, progress.inbound?.received ?? 0),
    conflicts: [],
  };
}

export function syncProgressFailureView(
  progress: SecureSyncProgress,
  cause: InteropRuntimeError,
  message: string,
): InteropRuntimeProgressView {
  return {
    phase: 'failed',
    error: { code: cause.code === 'provider-unavailable' ? 'partial-failure' : cause.code, message, retryable: true },
    counts: progress.inbound?.counts ?? progress.counts,
    processed: Math.max(progress.delivered, progress.inbound?.received ?? 0),
    conflicts: [],
  };
}

export function interopProviderFailureState(error: InteropRuntimeError): InteropProviderState {
  return error.code === 'auth-expired' ? 'reconnect-required' : error.code === 'provider-unavailable' ? 'unavailable' : 'disconnected';
}

export function emptyInteropCounts(total: number): InteropCounts {
  return {
    total,
    eligible: 0,
    duplicate: 0,
    conflict: 0,
    metadataOnly: 0,
    unsupported: 0,
    skipped: 0,
    failed: 0,
    acknowledged: 0,
    finalized: 0,
  };
}

export function moveProgressView(progress: MoveOutboxProgress, providerError: InteropRuntimeError | null): InteropRuntimeProgressView {
  return {
    phase: progress.pending > 0 ? 'failed' : progress.journal.phase,
    error:
      progress.pending > 0
        ? { code: 'interrupted', message: 'Encrypted Move outbox publication is incomplete. Resume to continue.', retryable: true }
        : providerError,
    counts: progress.counts,
    processed: progress.delivered,
    conflicts: [],
  };
}

export function moveProgressFailureView(
  progress: MoveOutboxProgress,
  cause: InteropRuntimeError,
  message: string,
): InteropRuntimeProgressView {
  return {
    phase: 'failed',
    error: { code: cause.code === 'provider-unavailable' ? 'partial-failure' : cause.code, message, retryable: true },
    counts: progress.counts,
    processed: progress.delivered,
    conflicts: [],
  };
}

export function moveSetupFailureView(
  error: InteropMoveSetupError | InteropSyncSetupError,
  providerState: InteropProviderState,
): { readonly providerState: InteropProviderState; readonly error: InteropRuntimeError } {
  return {
    providerState: error.code === 'provider-unavailable' ? 'unavailable' : providerState,
    error: { code: error.code, message: error.message, retryable: error.retryable },
  };
}
