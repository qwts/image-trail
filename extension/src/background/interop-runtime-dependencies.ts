import type { InteropProviderId } from '../core/interop/runtime-state.js';
import type { InteropObjectStore } from '../core/interop/transport.js';
import type { ActiveBlobKey } from '../data/crypto/blob-keyring.js';

export interface InteropRuntimeDependencies {
  readonly storage: {
    get(key: string): Promise<Record<string, unknown>>;
    set(items: Record<string, unknown>): Promise<void>;
  };
  readonly getDb: () => Promise<IDBDatabase | null>;
  readonly getActiveBlobKey: () => Promise<ActiveBlobKey | null>;
  readonly probePCloud: (interactive: boolean) => Promise<boolean>;
  readonly disconnectPCloud: () => Promise<void>;
  readonly probeGoogleDrive: (interactive: boolean) => Promise<void>;
  readonly disconnectGoogleDrive: () => Promise<void>;
  readonly probeICloud: () => Promise<void>;
  readonly openProvider: (provider: InteropProviderId) => Promise<InteropObjectStore | null>;
  readonly finalizeSourceRecord: (sourceLocalId: string, sourceUpdatedAt: string) => Promise<void>;
}
