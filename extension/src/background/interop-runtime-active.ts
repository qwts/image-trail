import type { InteropProviderId, InteropRuntimeContext } from '../core/interop/runtime-state.js';
import type { MoveOutboxProgress } from '../data/interop/move-outbox-publisher.js';
import type { SecureSyncProgress } from '../data/interop/secure-sync-outbox-repository.js';
import type { InteropMoveRuntime } from './interop-move-runtime.js';
import { activeInteropRuntimeSelection, sameInteropRecordIds, type InteropRuntimePreferences } from './interop-runtime-preferences.js';
import type { InteropSyncRuntime } from './interop-sync-runtime.js';

export async function activeInteropProgress(
  context: InteropRuntimeContext,
  selected: InteropRuntimePreferences,
  provider: InteropProviderId | undefined,
  moveRuntime: InteropMoveRuntime,
  syncRuntime: InteropSyncRuntime,
): Promise<MoveOutboxProgress | SecureSyncProgress | null> {
  const active = activeInteropRuntimeSelection(selected);
  if (!active.id || !active.remoteSessionId || !sameInteropRecordIds(active.recordIds, context.recordIds)) return null;
  if (selected.operation === 'sync')
    return syncRuntime.status(active.id, context.locked ? undefined : provider, active.remoteSessionId, context.recordIds);
  return moveRuntime.status({
    transferId: active.id,
    total: context.total,
    provider,
    remoteSessionId: active.remoteSessionId,
    recordIds: context.recordIds,
    allowFinalization: !!provider && !context.locked,
  });
}
