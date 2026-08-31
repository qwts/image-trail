import type { InteropOperation } from '../core/interop/contract.js';
import type { InteropProviderId, InteropProviderState, InteropRuntimeError } from '../core/interop/runtime-state.js';
import { InteropKeysRepository } from '../data/repositories/interop-keys-repository.js';
import * as progressViews from './interop-runtime-progress.js';
import type { InteropLocalAvailability } from './interop-runtime-dependencies.js';

export const INTEROP_PROVIDERS: Record<InteropProviderId, { readonly label: string; readonly disconnected: string }> = {
  pcloud: { label: 'pCloud', disconnected: 'Separate pCloud interoperability access is not configured.' },
  'google-drive': { label: 'Google Drive', disconnected: 'Connect Google Drive for the dedicated Image Trail Interop folder.' },
  'icloud-drive': {
    label: 'Local — Overlook on this computer',
    disconnected: 'Import the matching Overlook pairing before checking the local connection.',
  },
};

const LOCAL_UNAVAILABLE: Record<
  Exclude<InteropLocalAvailability, 'connected'>,
  { readonly detail: string; readonly code: InteropRuntimeError['code']; readonly retryable: boolean }
> = {
  'missing-host': {
    detail: 'The signed Overlook local connection host is not installed.',
    code: 'provider-unavailable',
    retryable: false,
  },
  'not-running': { detail: 'Open Overlook on this computer, then retry.', code: 'provider-unavailable', retryable: true },
  locked: { detail: 'Unlock Overlook on this computer, then retry.', code: 'provider-unavailable', retryable: true },
  incompatible: {
    detail: 'The installed Overlook version is incompatible with this local protocol.',
    code: 'unsupported-version',
    retryable: false,
  },
  unavailable: { detail: 'The Overlook local connection is temporarily unavailable.', code: 'provider-unavailable', retryable: true },
  unsupported: {
    detail: 'Local Overlook transfer is unsupported on this build or platform.',
    code: 'provider-unavailable',
    retryable: false,
  },
};

async function interopPairingId(getDb: () => Promise<IDBDatabase | null>): Promise<string | undefined> {
  try {
    const db = await getDb();
    return db ? (await new InteropKeysRepository(db).list()).at(0)?.pairingId : undefined;
  } catch {
    return undefined;
  }
}

export async function interopPairingState(getDb: () => Promise<IDBDatabase | null>): Promise<'paired' | 'unpaired' | 'invalid'> {
  try {
    const db = await getDb();
    if (!db) return 'invalid';
    return (await new InteropKeysRepository(db).list()).length > 0 ? 'paired' : 'unpaired';
  } catch {
    return 'invalid';
  }
}

export async function interopProviderStatus(
  dependencies: {
    readonly getDb: () => Promise<IDBDatabase | null>;
    readonly probePCloud: (interactive: boolean) => Promise<boolean>;
    readonly probeGoogleDrive: (interactive: boolean) => Promise<void>;
    readonly probeICloud: (pairingId: string, operation: InteropOperation) => Promise<InteropLocalAvailability | void>;
  },
  provider: InteropProviderId,
  interactive: boolean,
  operation: InteropOperation,
): Promise<{ readonly state: InteropProviderState; readonly detail: string; readonly error: InteropRuntimeError | null }> {
  try {
    if (provider === 'pcloud') {
      if (!(await dependencies.probePCloud(interactive))) {
        return { state: 'disconnected', detail: INTEROP_PROVIDERS.pcloud.disconnected, error: null };
      }
    } else if (provider === 'google-drive') await dependencies.probeGoogleDrive(interactive);
    else {
      const pairingId = await interopPairingId(dependencies.getDb);
      if (!pairingId) return { state: 'disconnected', detail: INTEROP_PROVIDERS[provider].disconnected, error: null };
      const availability = await dependencies.probeICloud(pairingId, operation);
      if (availability && availability !== 'connected') {
        const failure = LOCAL_UNAVAILABLE[availability];
        return {
          state: 'unavailable',
          detail: failure.detail,
          error: { code: failure.code, message: failure.detail, retryable: failure.retryable },
        };
      }
    }
    return { state: 'connected', detail: `${INTEROP_PROVIDERS[provider].label} is connected.`, error: null };
  } catch (error) {
    const normalized = progressViews.interopRuntimeError(error);
    return { state: progressViews.interopProviderFailureState(normalized), detail: normalized.message, error: normalized };
  }
}
