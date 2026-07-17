import type { InteropConflictAction, InteropErrorCode, InteropOperation, InteropTransferPhase } from './contract.js';
import type { InteropCounts } from './messages.js';

export type InteropEntryContext = 'bookmark' | 'selection' | 'album' | 'gallery' | 'captured-original' | 'settings';
export type InteropProviderId = 'pcloud' | 'google-drive' | 'icloud-drive';
export type InteropProviderState = 'disconnected' | 'connecting' | 'connected' | 'reconnect-required' | 'unavailable';
export type InteropPairingState = 'unpaired' | 'pairing' | 'paired' | 'invalid';

export interface InteropRuntimeContext {
  readonly entry: InteropEntryContext;
  readonly total: number;
  readonly locked: boolean;
}

export type InteropRuntimeAction =
  | { readonly name: 'status' }
  | { readonly name: 'select-provider'; readonly provider: InteropProviderId }
  | { readonly name: 'connect' }
  | { readonly name: 'disconnect' }
  | { readonly name: 'import-pairing'; readonly fileContent: string; readonly password: string }
  | { readonly name: 'set-operation'; readonly operation: InteropOperation }
  | { readonly name: 'start' }
  | { readonly name: 'pause' }
  | { readonly name: 'resume' }
  | { readonly name: 'cancel' }
  | { readonly name: 'reconnect' }
  | {
      readonly name: 'resolve-conflict';
      readonly interopId: string;
      readonly action: InteropConflictAction;
      readonly applyToAll: boolean;
    };

export interface InteropRuntimeConflict {
  readonly interopId: string;
  readonly label: string;
  readonly fields: readonly string[];
}

export interface InteropRuntimeError {
  readonly code: InteropErrorCode;
  readonly message: string;
  readonly retryable: boolean;
}

export interface InteropRuntimeSnapshot {
  readonly entry: InteropEntryContext;
  readonly operation: InteropOperation;
  readonly target: 'overlook';
  readonly provider: {
    readonly id: InteropProviderId;
    readonly label: string;
    readonly state: InteropProviderState;
    readonly detail: string;
  };
  readonly pairing: InteropPairingState;
  readonly phase: InteropTransferPhase;
  readonly counts: InteropCounts;
  readonly processed: number;
  readonly conflicts: readonly InteropRuntimeConflict[];
  readonly error: InteropRuntimeError | null;
  readonly locked: boolean;
}

export interface InteropRuntimeResult {
  readonly ok: boolean;
  readonly snapshot: InteropRuntimeSnapshot;
}
