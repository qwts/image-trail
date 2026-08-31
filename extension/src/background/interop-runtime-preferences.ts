import type { InteropOperation } from '../core/interop/contract.js';
import type { InteropProviderId } from '../core/interop/runtime-state.js';

export interface InteropRuntimePreferences {
  readonly provider: InteropProviderId;
  readonly operation: InteropOperation;
  readonly activeTransferId?: string | undefined;
  readonly activeTransferProvider?: InteropProviderId | undefined;
  readonly activeTransferRemoteSessionId?: string | undefined;
  readonly activeRecordIds?: readonly string[] | undefined;
  readonly activeSyncSessionId?: string | undefined;
  readonly activeSyncProvider?: InteropProviderId | undefined;
  readonly activeSyncRemoteSessionId?: string | undefined;
  readonly activeSyncRecordIds?: readonly string[] | undefined;
}

export function parseInteropRuntimePreferences(value: unknown): InteropRuntimePreferences {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { provider: 'icloud-drive', operation: 'move' };
  const record = value as Record<string, unknown>;
  const provider = providerValue(record['provider']) ?? 'icloud-drive';
  const activeTransferId = typeof record['activeTransferId'] === 'string' ? record['activeTransferId'] : undefined;
  const activeTransferProvider = providerValue(record['activeTransferProvider']);
  const activeTransferRemoteSessionId =
    typeof record['activeTransferRemoteSessionId'] === 'string' ? record['activeTransferRemoteSessionId'] : undefined;
  const activeRecordIds = Array.isArray(record['activeRecordIds'])
    ? record['activeRecordIds'].filter((id): id is string => typeof id === 'string' && id !== '')
    : undefined;
  const activeSyncSessionId = typeof record['activeSyncSessionId'] === 'string' ? record['activeSyncSessionId'] : undefined;
  const activeSyncProvider = providerValue(record['activeSyncProvider']);
  const activeSyncRemoteSessionId =
    typeof record['activeSyncRemoteSessionId'] === 'string' ? record['activeSyncRemoteSessionId'] : undefined;
  const activeSyncRecordIds = Array.isArray(record['activeSyncRecordIds'])
    ? record['activeSyncRecordIds'].filter((id): id is string => typeof id === 'string' && id !== '')
    : undefined;
  return {
    provider,
    operation: record['operation'] === 'sync' ? 'sync' : 'move',
    ...(activeTransferId && activeRecordIds
      ? {
          activeTransferId,
          activeRecordIds,
          ...(activeTransferProvider ? { activeTransferProvider } : {}),
          ...(activeTransferRemoteSessionId ? { activeTransferRemoteSessionId } : {}),
        }
      : {}),
    ...(activeSyncSessionId && activeSyncRecordIds
      ? {
          activeSyncSessionId,
          activeSyncRecordIds,
          ...(activeSyncProvider ? { activeSyncProvider } : {}),
          ...(activeSyncRemoteSessionId ? { activeSyncRemoteSessionId } : {}),
        }
      : {}),
  };
}

export function activeInteropRuntimeSelection(value: InteropRuntimePreferences): {
  readonly id: string | undefined;
  readonly provider: InteropProviderId | undefined;
  readonly remoteSessionId: string | undefined;
  readonly recordIds: readonly string[] | undefined;
} {
  return value.operation === 'sync'
    ? {
        id: value.activeSyncSessionId,
        provider: value.activeSyncProvider,
        remoteSessionId: value.activeSyncRemoteSessionId,
        recordIds: value.activeSyncRecordIds,
      }
    : {
        id: value.activeTransferId,
        provider: value.activeTransferProvider,
        remoteSessionId: value.activeTransferRemoteSessionId,
        recordIds: value.activeRecordIds,
      };
}

function providerValue(value: unknown): InteropProviderId | undefined {
  return ['pcloud', 'google-drive', 'icloud-drive'].includes(String(value)) ? (value as InteropProviderId) : undefined;
}

export function selectInteropRuntimeOperation(value: InteropRuntimePreferences, operation: InteropOperation): InteropRuntimePreferences {
  const activeProvider = operation === 'sync' ? value.activeSyncProvider : value.activeTransferProvider;
  return { ...value, operation, provider: activeProvider ?? value.provider };
}

export function clearActiveInteropRuntimeSelection(value: InteropRuntimePreferences): InteropRuntimePreferences {
  if (value.operation === 'sync') return clearActiveSyncRuntimeSelection(value);
  return {
    provider: value.provider,
    operation: value.operation,
    ...(value.activeSyncSessionId && value.activeSyncRecordIds
      ? {
          activeSyncSessionId: value.activeSyncSessionId,
          activeSyncRecordIds: value.activeSyncRecordIds,
          ...(value.activeSyncProvider ? { activeSyncProvider: value.activeSyncProvider } : {}),
          ...(value.activeSyncRemoteSessionId ? { activeSyncRemoteSessionId: value.activeSyncRemoteSessionId } : {}),
        }
      : {}),
  };
}

export function clearActiveSyncRuntimeSelection(value: InteropRuntimePreferences): InteropRuntimePreferences {
  return {
    provider: value.provider,
    operation: value.operation,
    ...(value.activeTransferId && value.activeRecordIds
      ? {
          activeTransferId: value.activeTransferId,
          activeRecordIds: value.activeRecordIds,
          ...(value.activeTransferProvider ? { activeTransferProvider: value.activeTransferProvider } : {}),
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
    ? {
        ...value,
        activeSyncSessionId: id,
        activeSyncProvider: value.provider,
        activeSyncRemoteSessionId: remoteSessionId,
        activeSyncRecordIds: [...recordIds],
      }
    : {
        ...value,
        activeTransferId: id,
        activeTransferProvider: value.provider,
        activeTransferRemoteSessionId: remoteSessionId,
        activeRecordIds: [...recordIds],
      };
}
