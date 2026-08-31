import type { InteropOperation } from '../core/interop/contract.js';
import type { InteropProviderId } from '../core/interop/runtime-state.js';

export interface InteropRuntimePreferences {
  readonly provider: InteropProviderId;
  readonly operation: InteropOperation;
  readonly activeTransferId?: string | undefined;
  readonly activeTransferRemoteSessionId?: string | undefined;
  readonly activeRecordIds?: readonly string[] | undefined;
  readonly activeSyncSessionId?: string | undefined;
  readonly activeSyncRemoteSessionId?: string | undefined;
  readonly activeSyncRecordIds?: readonly string[] | undefined;
}

export function parseInteropRuntimePreferences(value: unknown): InteropRuntimePreferences {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { provider: 'pcloud', operation: 'move' };
  const record = value as Record<string, unknown>;
  const provider = ['pcloud', 'google-drive', 'icloud-drive'].includes(String(record['provider']))
    ? (record['provider'] as InteropProviderId)
    : 'pcloud';
  const activeTransferId = typeof record['activeTransferId'] === 'string' ? record['activeTransferId'] : undefined;
  const activeTransferRemoteSessionId =
    typeof record['activeTransferRemoteSessionId'] === 'string' ? record['activeTransferRemoteSessionId'] : undefined;
  const activeRecordIds = Array.isArray(record['activeRecordIds'])
    ? record['activeRecordIds'].filter((id): id is string => typeof id === 'string' && id !== '')
    : undefined;
  const activeSyncSessionId = typeof record['activeSyncSessionId'] === 'string' ? record['activeSyncSessionId'] : undefined;
  const activeSyncRemoteSessionId =
    typeof record['activeSyncRemoteSessionId'] === 'string' ? record['activeSyncRemoteSessionId'] : undefined;
  const activeSyncRecordIds = Array.isArray(record['activeSyncRecordIds'])
    ? record['activeSyncRecordIds'].filter((id): id is string => typeof id === 'string' && id !== '')
    : undefined;
  return {
    provider,
    operation: record['operation'] === 'sync' ? 'sync' : 'move',
    ...(activeTransferId && activeRecordIds
      ? { activeTransferId, activeRecordIds, ...(activeTransferRemoteSessionId ? { activeTransferRemoteSessionId } : {}) }
      : {}),
    ...(activeSyncSessionId && activeSyncRecordIds
      ? { activeSyncSessionId, activeSyncRecordIds, ...(activeSyncRemoteSessionId ? { activeSyncRemoteSessionId } : {}) }
      : {}),
  };
}

export function activeInteropRuntimeSelection(value: InteropRuntimePreferences): {
  readonly id: string | undefined;
  readonly remoteSessionId: string | undefined;
  readonly recordIds: readonly string[] | undefined;
} {
  return value.operation === 'sync'
    ? { id: value.activeSyncSessionId, remoteSessionId: value.activeSyncRemoteSessionId, recordIds: value.activeSyncRecordIds }
    : { id: value.activeTransferId, remoteSessionId: value.activeTransferRemoteSessionId, recordIds: value.activeRecordIds };
}

export function clearActiveSyncRuntimeSelection(value: InteropRuntimePreferences): InteropRuntimePreferences {
  return {
    provider: value.provider,
    operation: value.operation,
    ...(value.activeTransferId && value.activeRecordIds
      ? {
          activeTransferId: value.activeTransferId,
          activeRecordIds: value.activeRecordIds,
          ...(value.activeTransferRemoteSessionId ? { activeTransferRemoteSessionId: value.activeTransferRemoteSessionId } : {}),
        }
      : {}),
  };
}

export function sameInteropRecordIds(left: readonly string[] | undefined, right: readonly string[]): boolean {
  return !!left && left.length === right.length && left.every((id, index) => id === right[index]);
}

export async function ensureInteropRuntimeRemoteSessionIds(
  value: InteropRuntimePreferences,
  save: (preferences: InteropRuntimePreferences) => Promise<void>,
): Promise<InteropRuntimePreferences> {
  let repaired = value;
  if (value.activeTransferId && value.activeRecordIds && !value.activeTransferRemoteSessionId) {
    repaired = { ...repaired, activeTransferRemoteSessionId: crypto.randomUUID() };
  }
  if (value.activeSyncSessionId && value.activeSyncRecordIds && !value.activeSyncRemoteSessionId) {
    repaired = { ...repaired, activeSyncRemoteSessionId: crypto.randomUUID() };
  }
  if (repaired !== value) await save(repaired);
  return repaired;
}

export function createActiveInteropRuntimePreferences(
  value: InteropRuntimePreferences,
  id: string,
  remoteSessionId: string,
  recordIds: readonly string[],
): InteropRuntimePreferences {
  return value.operation === 'sync'
    ? { ...value, activeSyncSessionId: id, activeSyncRemoteSessionId: remoteSessionId, activeSyncRecordIds: [...recordIds] }
    : { ...value, activeTransferId: id, activeTransferRemoteSessionId: remoteSessionId, activeRecordIds: [...recordIds] };
}
