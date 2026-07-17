import type { InteropErrorCode } from '../core/interop/contract.js';
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
import { restoreActiveBlobKey, type ActiveBlobKey } from '../data/crypto/blob-keyring.js';
import { MoveOutboxPublishError, type MoveOutboxProgress } from '../data/interop/move-outbox-publisher.js';
import { InteropKeysRepository } from '../data/repositories/interop-keys-repository.js';
import { OverlookICloudNativeClient } from './interop-icloud-client.js';
import { InteropTransportError, type InteropObjectStore } from '../core/interop/transport.js';
import { InteropMoveRuntime, InteropMoveSetupError } from './interop-move-runtime.js';
import { emptyInteropCounts, moveProgressFailureView, moveProgressView, moveSetupFailureView } from './interop-runtime-progress.js';
import {
  parseInteropRuntimePreferences,
  sameInteropRecordIds,
  type InteropRuntimePreferences as RuntimePreferences,
} from './interop-runtime-preferences.js';

const STORAGE_KEY = 'interopRuntimePreferences';

interface RuntimeStorage {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

export interface InteropRuntimeDependencies {
  readonly storage: RuntimeStorage;
  readonly getDb: () => Promise<IDBDatabase | null>;
  readonly getActiveBlobKey: () => Promise<ActiveBlobKey | null>;
  readonly probeGoogleDrive: (interactive: boolean) => Promise<void>;
  readonly disconnectGoogleDrive: () => Promise<void>;
  readonly probeICloud: () => Promise<void>;
  readonly openProvider: (provider: InteropProviderId) => Promise<InteropObjectStore | null>;
}

const PROVIDERS: Record<InteropProviderId, { readonly label: string; readonly disconnected: string }> = {
  pcloud: { label: 'pCloud', disconnected: 'Separate pCloud interoperability access is not configured.' },
  'google-drive': { label: 'Google Drive', disconnected: 'Connect Google Drive for the dedicated Image Trail Interop folder.' },
  'icloud-drive': { label: 'iCloud Drive', disconnected: 'Install and authorize the signed Overlook interoperability host.' },
};

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
    const stored = parseInteropRuntimePreferences((await this.dependencies.storage.get(STORAGE_KEY))[STORAGE_KEY]);
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
    if (action.name === 'resolve-conflict')
      return this.unsupportedAction(context, selected, 'failed', 'The selected conflict is no longer available.');

    const interactive = action.name === 'connect' || action.name === 'reconnect';
    const provider = await this.providerStatus(selected.provider, interactive);
    if (action.name === 'start') return this.start(context, selected, provider);
    if (action.name === 'resume') return this.resume(context, selected, provider);
    if (action.name === 'status') {
      const active = await this.activeProgress(context, selected);
      if (active) return this.progressResult(context, selected, provider, active);
    }
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
        counts: emptyInteropCounts(context.total),
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
    if (selected.operation !== 'move')
      return this.unsupportedAction(
        context,
        selected,
        'failed',
        'Sync journal publication is not available in this build.',
        'unsupported-record',
      );
    if (context.recordIds.length === 0 || context.recordIds.length !== context.total)
      return this.unsupportedAction(
        context,
        selected,
        'failed',
        'The reviewed Move selection is empty or incomplete.',
        'unsupported-record',
      );
    const active: RuntimePreferences = {
      ...selected,
      activeTransferId: crypto.randomUUID(),
      activeRecordIds: [...context.recordIds],
    };
    await this.save(active);
    try {
      const progress = await this.moveRuntime().start({
        provider: selected.provider,
        transferId: active.activeTransferId!,
        recordIds: context.recordIds,
      });
      return this.progressResult(context, active, provider, progress);
    } catch (error) {
      if (error instanceof MoveOutboxPublishError) return this.progressFailure(context, active, provider, error);
      if (error instanceof InteropMoveSetupError) {
        const failure = moveSetupFailureView(error, provider.state);
        return this.result(context, active, 'failed', failure.providerState, provider.detail, failure.error);
      }
      return this.result(context, active, 'failed', provider.state, provider.detail, {
        code: 'unsupported-record',
        message: error instanceof Error ? error.message : 'Move review could not be queued.',
        retryable: false,
      });
    }
  }

  private async resume(
    context: InteropRuntimeContext,
    selected: RuntimePreferences,
    provider: { readonly state: InteropProviderState; readonly detail: string; readonly error: InteropRuntimeError | null },
  ): Promise<InteropRuntimeResult> {
    if (!selected.activeTransferId || !sameInteropRecordIds(selected.activeRecordIds, context.recordIds)) {
      return this.unsupportedAction(context, selected, 'failed', 'There is no interrupted transfer for this selection to resume.');
    }
    if (provider.state !== 'connected') {
      return this.result(
        context,
        selected,
        'failed',
        provider.state,
        provider.detail,
        provider.error ?? {
          code: 'provider-unavailable',
          message: 'The interrupted transfer provider is unavailable.',
          retryable: false,
        },
      );
    }
    try {
      const progress = await this.moveRuntime().resume({
        provider: selected.provider,
        transferId: selected.activeTransferId,
        total: context.total,
      });
      return this.progressResult(context, selected, provider, progress);
    } catch (error) {
      if (error instanceof MoveOutboxPublishError) return this.progressFailure(context, selected, provider, error);
      if (error instanceof InteropMoveSetupError) {
        const failure = moveSetupFailureView(error, provider.state);
        return this.result(context, selected, 'failed', failure.providerState, provider.detail, failure.error);
      }
      return this.result(context, selected, 'failed', provider.state, provider.detail, {
        code: 'interrupted',
        message: error instanceof Error ? error.message : 'Move resume failed.',
        retryable: true,
      });
    }
  }

  private async activeProgress(context: InteropRuntimeContext, selected: RuntimePreferences): Promise<MoveOutboxProgress | null> {
    if (!selected.activeTransferId || !sameInteropRecordIds(selected.activeRecordIds, context.recordIds)) return null;
    return this.moveRuntime().status(selected.activeTransferId, context.total);
  }

  private moveRuntime(): InteropMoveRuntime {
    return new InteropMoveRuntime(this.dependencies.getDb, this.dependencies.openProvider, this.dependencies.getActiveBlobKey);
  }

  private progressResult(
    context: InteropRuntimeContext,
    selected: RuntimePreferences,
    provider: { readonly state: InteropProviderState; readonly detail: string; readonly error: InteropRuntimeError | null },
    progress: MoveOutboxProgress,
  ): Promise<InteropRuntimeResult> {
    const view = moveProgressView(progress, provider.error);
    return this.result(context, selected, view.phase, provider.state, provider.detail, view.error, 'paired', view.counts, view.processed);
  }

  private progressFailure(
    context: InteropRuntimeContext,
    selected: RuntimePreferences,
    provider: { readonly state: InteropProviderState; readonly detail: string; readonly error: InteropRuntimeError | null },
    error: MoveOutboxPublishError,
  ): Promise<InteropRuntimeResult> {
    const cause = runtimeError(error.sourceError);
    const view = moveProgressFailureView(error.progress, cause, error.message);
    return this.result(context, selected, view.phase, provider.state, provider.detail, view.error, 'paired', view.counts, view.processed);
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
    counts: InteropCounts = emptyInteropCounts(context.total),
    processed = 0,
  ): Promise<InteropRuntimeResult> {
    const snapshot: InteropRuntimeSnapshot = {
      entry: context.entry,
      operation: selected.operation,
      target: 'overlook',
      provider: { id: selected.provider, label: PROVIDERS[selected.provider].label, state: providerState, detail },
      pairing: pairing ?? (await this.pairingState()),
      phase,
      counts,
      processed,
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
    getActiveBlobKey: restoreActiveBlobKey,
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
    openProvider: async (_provider) => null,
  });
}
