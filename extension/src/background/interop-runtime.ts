import type { InteropErrorCode, InteropOperation } from '../core/interop/contract.js';
import type { InteropCounts } from '../core/interop/messages.js';
import type {
  InteropProviderId,
  InteropProviderState,
  InteropRuntimeAction,
  InteropRuntimeContext,
  InteropRuntimeError,
  InteropRuntimeResult,
  InteropRuntimeSnapshot,
} from '../core/interop/runtime-state.js';
import { importInteropPairingBundle } from '../data/interop/pairing-import.js';
import { InteropKeysRepository } from '../data/repositories/interop-keys-repository.js';
import { OverlookICloudNativeClient } from './interop-icloud-client.js';
import { InteropTransportError } from '../core/interop/transport.js';

const STORAGE_KEY = 'interopRuntimePreferences';

interface RuntimePreferences {
  readonly provider: InteropProviderId;
  readonly operation: InteropOperation;
}

interface RuntimeStorage {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

export interface InteropRuntimeDependencies {
  readonly storage: RuntimeStorage;
  readonly getDb: () => Promise<IDBDatabase | null>;
  readonly probeGoogleDrive: (interactive: boolean) => Promise<void>;
  readonly disconnectGoogleDrive: () => Promise<void>;
  readonly probeICloud: () => Promise<void>;
}

const PROVIDERS: Record<InteropProviderId, { readonly label: string; readonly disconnected: string }> = {
  pcloud: { label: 'pCloud', disconnected: 'Separate pCloud interoperability access is not configured.' },
  'google-drive': { label: 'Google Drive', disconnected: 'Connect Google Drive for the dedicated Image Trail Interop folder.' },
  'icloud-drive': { label: 'iCloud Drive', disconnected: 'Install and authorize the signed Overlook interoperability host.' },
};

function emptyCounts(total: number): InteropCounts {
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

function preferences(value: unknown): RuntimePreferences {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { provider: 'pcloud', operation: 'move' };
  const record = value as Record<string, unknown>;
  const provider = ['pcloud', 'google-drive', 'icloud-drive'].includes(String(record['provider']))
    ? (record['provider'] as InteropProviderId)
    : 'pcloud';
  return { provider, operation: record['operation'] === 'sync' ? 'sync' : 'move' };
}

function runtimeError(error: unknown): InteropRuntimeError {
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

function providerFailureState(error: InteropRuntimeError): InteropProviderState {
  return error.code === 'auth-expired' ? 'reconnect-required' : error.code === 'provider-unavailable' ? 'unavailable' : 'disconnected';
}

export class InteropRuntime {
  constructor(private readonly dependencies: InteropRuntimeDependencies) {}

  async dispatch(context: InteropRuntimeContext, action: InteropRuntimeAction): Promise<InteropRuntimeResult> {
    const stored = preferences((await this.dependencies.storage.get(STORAGE_KEY))[STORAGE_KEY]);
    let selected = stored;
    if (action.name === 'select-provider') {
      selected = { ...stored, provider: action.provider };
      await this.save(selected);
    } else if (action.name === 'set-operation') {
      selected = { ...stored, operation: action.operation };
      await this.save(selected);
    }

    if (action.name === 'import-pairing') return this.importPairing(context, selected, action.fileContent, action.password);
    if (action.name === 'disconnect') return this.disconnect(context, selected);
    if (action.name === 'cancel') return this.result(context, selected, 'cancelled', 'disconnected');
    if (action.name === 'pause') return this.unsupportedAction(context, selected, 'paused', 'Transfer is not currently running.');
    if (action.name === 'resume') return this.unsupportedAction(context, selected, 'failed', 'There is no interrupted transfer to resume.');
    if (action.name === 'resolve-conflict')
      return this.unsupportedAction(context, selected, 'failed', 'The selected conflict is no longer available.');

    const interactive = action.name === 'connect' || action.name === 'reconnect';
    const provider = await this.providerStatus(selected.provider, interactive);
    if (action.name === 'start') return this.start(context, selected, provider);
    return this.result(context, selected, 'queued', provider.state, provider.detail, provider.error);
  }

  fallback(context: InteropRuntimeContext): InteropRuntimeResult {
    const selected: RuntimePreferences = { provider: 'pcloud', operation: 'move' };
    return {
      ok: false,
      snapshot: {
        entry: context.entry,
        operation: selected.operation,
        target: 'overlook',
        provider: {
          id: selected.provider,
          label: PROVIDERS[selected.provider].label,
          state: 'unavailable',
          detail: 'Interoperability status could not be loaded.',
        },
        pairing: 'invalid',
        phase: 'failed',
        counts: emptyCounts(context.total),
        processed: 0,
        conflicts: [],
        error: { code: 'provider-unavailable', message: 'Interoperability status could not be loaded.', retryable: true },
        locked: context.locked,
      },
    };
  }

  private async pairingState(): Promise<'paired' | 'unpaired' | 'invalid'> {
    try {
      const db = await this.dependencies.getDb();
      if (!db) return 'invalid';
      return (await new InteropKeysRepository(db).list()).length > 0 ? 'paired' : 'unpaired';
    } catch {
      return 'invalid';
    }
  }

  private async importPairing(
    context: InteropRuntimeContext,
    selected: RuntimePreferences,
    fileContent: string,
    password: string,
  ): Promise<InteropRuntimeResult> {
    try {
      const db = await this.dependencies.getDb();
      if (!db) throw new Error('Interop key storage is unavailable.');
      const bundle: unknown = JSON.parse(fileContent);
      await importInteropPairingBundle({ db, bundle, password });
      const provider = await this.providerStatus(selected.provider, false);
      return this.result(context, selected, 'queued', provider.state, provider.detail, provider.error, 'paired');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Overlook pairing key could not be imported.';
      return this.result(
        context,
        selected,
        'failed',
        'disconnected',
        PROVIDERS[selected.provider].disconnected,
        { code: 'wrong-key', message, retryable: false },
        'invalid',
      );
    }
  }

  private async disconnect(context: InteropRuntimeContext, selected: RuntimePreferences): Promise<InteropRuntimeResult> {
    if (selected.provider === 'google-drive') await this.dependencies.disconnectGoogleDrive();
    return this.result(context, selected, 'queued', 'disconnected', PROVIDERS[selected.provider].disconnected);
  }

  private async start(
    context: InteropRuntimeContext,
    selected: RuntimePreferences,
    provider: { readonly state: InteropProviderState; readonly detail: string; readonly error: InteropRuntimeError | null },
  ): Promise<InteropRuntimeResult> {
    if (context.locked)
      return this.result(context, selected, 'failed', provider.state, provider.detail, {
        code: 'wrong-key',
        message: 'Unlock Image Trail before starting interoperability.',
        retryable: true,
      });
    if ((await this.pairingState()) !== 'paired')
      return this.result(context, selected, 'failed', provider.state, provider.detail, {
        code: 'wrong-key',
        message: 'Import the Overlook pairing key before starting interoperability.',
        retryable: false,
      });
    if (provider.state !== 'connected')
      return this.result(
        context,
        selected,
        'failed',
        provider.state,
        provider.detail,
        provider.error ?? {
          code: 'provider-unavailable',
          message: provider.detail,
          retryable: provider.state === 'reconnect-required',
        },
      );
    return this.unsupportedAction(
      context,
      selected,
      'failed',
      'Image Trail record export is not available in this build; no records were changed.',
      'unsupported-record',
    );
  }

  private unsupportedAction(
    context: InteropRuntimeContext,
    selected: RuntimePreferences,
    phase: InteropRuntimeSnapshot['phase'],
    message: string,
    code: InteropErrorCode = 'interrupted',
  ): Promise<InteropRuntimeResult> {
    return Promise.resolve(
      this.result(context, selected, phase, 'disconnected', PROVIDERS[selected.provider].disconnected, {
        code,
        message,
        retryable: false,
      }),
    );
  }

  private async providerStatus(
    provider: InteropProviderId,
    interactive: boolean,
  ): Promise<{ readonly state: InteropProviderState; readonly detail: string; readonly error: InteropRuntimeError | null }> {
    if (provider === 'pcloud') return { state: 'unavailable', detail: PROVIDERS.pcloud.disconnected, error: null };
    try {
      if (provider === 'google-drive') await this.dependencies.probeGoogleDrive(interactive);
      else await this.dependencies.probeICloud();
      return { state: 'connected', detail: `${PROVIDERS[provider].label} is connected.`, error: null };
    } catch (error) {
      const normalized = runtimeError(error);
      return { state: providerFailureState(normalized), detail: normalized.message, error: normalized };
    }
  }

  private async result(
    context: InteropRuntimeContext,
    selected: RuntimePreferences,
    phase: InteropRuntimeSnapshot['phase'],
    providerState: InteropProviderState,
    detail = PROVIDERS[selected.provider].disconnected,
    error: InteropRuntimeError | null = null,
    pairing?: InteropRuntimeSnapshot['pairing'],
  ): Promise<InteropRuntimeResult> {
    const snapshot: InteropRuntimeSnapshot = {
      entry: context.entry,
      operation: selected.operation,
      target: 'overlook',
      provider: { id: selected.provider, label: PROVIDERS[selected.provider].label, state: providerState, detail },
      pairing: pairing ?? (await this.pairingState()),
      phase,
      counts: emptyCounts(context.total),
      processed: 0,
      conflicts: [],
      error,
      locked: context.locked,
    };
    return { ok: error === null, snapshot };
  }

  private save(value: RuntimePreferences): Promise<void> {
    return this.dependencies.storage.set({ [STORAGE_KEY]: value });
  }
}

export function createChromeInteropRuntime(getDb: () => Promise<IDBDatabase | null>): InteropRuntime {
  return new InteropRuntime({
    storage: chrome.storage.local,
    getDb,
    probeGoogleDrive: async (_interactive) => {
      throw new InteropTransportError(
        'Google Drive interoperability requires a configured extension OAuth client.',
        'provider-unavailable',
        false,
      );
    },
    disconnectGoogleDrive: () => chrome.identity.clearAllCachedAuthTokens(),
    probeICloud: async () => {
      await new OverlookICloudNativeClient(chrome.runtime.id).request({ operation: 'status' });
    },
  });
}
