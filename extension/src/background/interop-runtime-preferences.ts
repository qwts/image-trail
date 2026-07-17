import type { InteropOperation } from '../core/interop/contract.js';
import type { InteropProviderId } from '../core/interop/runtime-state.js';

export interface InteropRuntimePreferences {
  readonly provider: InteropProviderId;
  readonly operation: InteropOperation;
  readonly activeTransferId?: string | undefined;
  readonly activeRecordIds?: readonly string[] | undefined;
  readonly activeSyncSessionId?: string | undefined;
  readonly activeSyncRecordIds?: readonly string[] | undefined;
}

export function parseInteropRuntimePreferences(value: unknown): InteropRuntimePreferences {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { provider: 'pcloud', operation: 'move' };
  const record = value as Record<string, unknown>;
  const provider = ['pcloud', 'google-drive', 'icloud-drive'].includes(String(record['provider']))
    ? (record['provider'] as InteropProviderId)
    : 'pcloud';
  const activeTransferId = typeof record['activeTransferId'] === 'string' ? record['activeTransferId'] : undefined;
  const activeRecordIds = Array.isArray(record['activeRecordIds'])
    ? record['activeRecordIds'].filter((id): id is string => typeof id === 'string' && id !== '')
    : undefined;
  const activeSyncSessionId = typeof record['activeSyncSessionId'] === 'string' ? record['activeSyncSessionId'] : undefined;
  const activeSyncRecordIds = Array.isArray(record['activeSyncRecordIds'])
    ? record['activeSyncRecordIds'].filter((id): id is string => typeof id === 'string' && id !== '')
    : undefined;
  return {
    provider,
    operation: record['operation'] === 'sync' ? 'sync' : 'move',
    ...(activeTransferId && activeRecordIds ? { activeTransferId, activeRecordIds } : {}),
    ...(activeSyncSessionId && activeSyncRecordIds ? { activeSyncSessionId, activeSyncRecordIds } : {}),
  };
}

export function activeInteropRuntimeSelection(value: InteropRuntimePreferences): {
  readonly id: string | undefined;
  readonly recordIds: readonly string[] | undefined;
} {
  return value.operation === 'sync'
    ? { id: value.activeSyncSessionId, recordIds: value.activeSyncRecordIds }
    : { id: value.activeTransferId, recordIds: value.activeRecordIds };
}

export function clearActiveSyncRuntimeSelection(value: InteropRuntimePreferences): InteropRuntimePreferences {
  return {
    provider: value.provider,
    operation: value.operation,
    ...(value.activeTransferId && value.activeRecordIds
      ? { activeTransferId: value.activeTransferId, activeRecordIds: value.activeRecordIds }
      : {}),
  };
}

export function sameInteropRecordIds(left: readonly string[] | undefined, right: readonly string[]): boolean {
  return !!left && left.length === right.length && left.every((id, index) => id === right[index]);
}
