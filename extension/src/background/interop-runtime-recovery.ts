import type { InteropMoveRuntime } from './interop-move-runtime.js';
import { activeInteropRuntimeSelection, type InteropRuntimePreferences } from './interop-runtime-preferences.js';
import type { InteropSyncRuntime } from './interop-sync-runtime.js';

export async function recoverInteropRuntimePreferences(
  value: InteropRuntimePreferences,
  syncRuntime: InteropSyncRuntime,
  save: (preferences: InteropRuntimePreferences) => Promise<void>,
): Promise<InteropRuntimePreferences> {
  if (!value.activeSyncSessionId) return value;
  try {
    const provider = (await syncRuntime.status(value.activeSyncSessionId))?.session.provider;
    if (!provider || (value.activeSyncProvider === provider && (value.operation !== 'sync' || value.provider === provider))) return value;
    const recovered = {
      ...value,
      activeSyncProvider: provider,
      ...(value.operation === 'sync' ? { provider } : {}),
    };
    await save(recovered);
    return recovered;
  } catch {
    return value;
  }
}

export async function activeInteropRuntimePairingId(
  value: InteropRuntimePreferences,
  total: number,
  moveRuntime: InteropMoveRuntime,
  syncRuntime: InteropSyncRuntime,
): Promise<string | null | undefined> {
  const active = activeInteropRuntimeSelection(value);
  if (!active.id) return undefined;
  try {
    if (value.operation === 'sync') return (await syncRuntime.status(active.id))?.session.pairingId ?? null;
    return (await moveRuntime.status({ transferId: active.id, total }))?.journal.pairingId ?? null;
  } catch {
    return null;
  }
}
