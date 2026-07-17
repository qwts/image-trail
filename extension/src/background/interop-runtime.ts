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
import type { ActiveBlobKey } from '../data/crypto/blob-keyring.js';
import { MoveOutboxPublishError, type MoveOutboxProgress } from '../data/interop/move-outbox-publisher.js';
import { InteropKeysRepository } from '../data/repositories/interop-keys-repository.js';
import type { InteropObjectStore } from '../core/interop/transport.js';
import { InteropMoveRuntime, InteropMoveSetupError } from './interop-move-runtime.js';
import * as progressViews from './interop-runtime-progress.js';
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
  readonly probePCloud: (interactive: boolean) => Promise<boolean>;
  readonly disconnectPCloud: () => Promise<void>;
  readonly probeGoogleDrive: (interactive: boolean) => Promise<void>;
  readonly disconnectGoogleDrive: () => Promise<void>;
  readonly probeICloud: () => Promise<void>;
  readonly openProvider: (provider: InteropProviderId) => Promise<InteropObjectStore | null>;
  readonly finalizeSourceRecord: (sourceLocalId: string) => Promise<void>;
}

const PROVIDERS: Record<InteropProviderId, { readonly label: string; readonly disconnected: string }> = {
  pcloud: { label: 'pCloud', disconnected: 'Separate pCloud interoperability access is not configured.' },
  'google-drive': { label: 'Google Drive', disconnected: 'Connect Google Drive for the dedicated Image Trail Interop folder.' },
  'icloud-drive': { label: 'iCloud Drive', disconnected: 'Install and authorize the signed Overlook interoperability host.' },
};

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

    if ((action.name === 'connect' || action.name === 'reconnect') && action.provider !== selected.provider)
      return this.unsupportedAction(context, selected, 'failed', 'The selected provider changed before connection started.');

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
      try {
        const active = await this.activeProgress(context, selected, provider.state === 'connected' ? selected.provider : undefined);
        if (active) return this.progressResult(context, selected, provider, active);
      } catch (error) {
        const normalized = progressViews.interopRuntimeError(error);
        const local = await this.activeProgress(context, selected);
        return local
          ? this.progressResult(context, selected, provider, local, normalized, 'failed')
          : this.result(context, selected, 'failed', provider.state, provider.detail, normalized);
      }
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
        counts: progressViews.emptyInteropCounts(context.total),
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
    if (selected.provider === 'pcloud') await this.dependencies.disconnectPCloud();
    else if (selected.provider === 'google-drive') await this.dependencies.disconnectGoogleDrive();
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
        const failure = progressViews.moveSetupFailureView(error, provider.state);
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
    if (context.locked) {
      return this.result(context, selected, 'failed', provider.state, provider.detail, {
        code: 'wrong-key',
        message: 'Unlock Image Trail before applying Move acknowledgements or finalizing source records.',
        retryable: true,
      });
    }
    try {
      const progress = await this.moveRuntime().resume({
        provider: selected.provider,
        transferId: selected.activeTransferId,
        total: context.total,
        allowFinalization: true,
      });
      return this.progressResult(context, selected, provider, progress);
    } catch (error) {
      if (error instanceof MoveOutboxPublishError) return this.progressFailure(context, selected, provider, error);
      if (error instanceof InteropMoveSetupError) {
        const failure = progressViews.moveSetupFailureView(error, provider.state);
        return this.result(context, selected, 'failed', failure.providerState, provider.detail, failure.error);
      }
      const normalized = progressViews.interopRuntimeError(error);
      return this.result(context, selected, 'failed', provider.state, provider.detail, normalized);
    }
  }

  private async activeProgress(
    context: InteropRuntimeContext,
    selected: RuntimePreferences,
    provider?: InteropProviderId,
  ): Promise<MoveOutboxProgress | null> {
    if (!selected.activeTransferId || !sameInteropRecordIds(selected.activeRecordIds, context.recordIds)) return null;
    return this.moveRuntime().status({
      transferId: selected.activeTransferId,
      total: context.total,
      provider,
      allowFinalization: !!provider && !context.locked,
    });
  }

  private moveRuntime(): InteropMoveRuntime {
    return new InteropMoveRuntime(this.dependencies.getDb, this.dependencies.openProvider, this.dependencies.getActiveBlobKey, {
      finalize: this.dependencies.finalizeSourceRecord,
    });
  }

  private progressResult(
    context: InteropRuntimeContext,
    selected: RuntimePreferences,
    provider: { readonly state: InteropProviderState; readonly detail: string; readonly error: InteropRuntimeError | null },
    progress: MoveOutboxProgress,
    error = provider.error,
    phase?: InteropRuntimeSnapshot['phase'],
  ): Promise<InteropRuntimeResult> {
    const view = progressViews.moveProgressView(progress, error);
    return this.result(
      context,
      selected,
      phase ?? view.phase,
      provider.state,
      provider.detail,
      view.error,
      'paired',
      view.counts,
      view.processed,
    );
  }

  private progressFailure(
    context: InteropRuntimeContext,
    selected: RuntimePreferences,
    provider: { readonly state: InteropProviderState; readonly detail: string; readonly error: InteropRuntimeError | null },
    error: MoveOutboxPublishError,
  ): Promise<InteropRuntimeResult> {
    const cause = progressViews.interopRuntimeError(error.sourceError);
    const view = progressViews.moveProgressFailureView(error.progress, cause, error.message);
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
    try {
      if (provider === 'pcloud') {
        const connected = await this.dependencies.probePCloud(interactive);
        if (!connected) return { state: 'disconnected', detail: PROVIDERS.pcloud.disconnected, error: null };
      } else if (provider === 'google-drive') await this.dependencies.probeGoogleDrive(interactive);
      else await this.dependencies.probeICloud();
      return { state: 'connected', detail: `${PROVIDERS[provider].label} is connected.`, error: null };
    } catch (error) {
      const normalized = progressViews.interopRuntimeError(error);
      return { state: progressViews.interopProviderFailureState(normalized), detail: normalized.message, error: normalized };
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
    counts: InteropCounts = progressViews.emptyInteropCounts(context.total),
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
