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
import { MoveOutboxPublishError, type MoveOutboxProgress } from '../data/interop/move-outbox-publisher.js';
import { SyncOutboxPublishError } from '../data/interop/sync-outbox-publisher.js';
import type { SecureSyncProgress } from '../data/interop/secure-sync-outbox-repository.js';
import { InteropMoveRuntime, InteropMoveSetupError } from './interop-move-runtime.js';
import { InteropSyncRuntime, InteropSyncSetupError } from './interop-sync-runtime.js';
import { INTEROP_PROVIDERS, interopPairingState, interopProviderStatus } from './interop-runtime-provider.js';
import * as progressViews from './interop-runtime-progress.js';
import type { InteropRuntimeDependencies } from './interop-runtime-dependencies.js';
export type { InteropRuntimeDependencies } from './interop-runtime-dependencies.js';
import {
  activeInteropRuntimeSelection,
  clearActiveSyncRuntimeSelection,
  parseInteropRuntimePreferences,
  sameInteropRecordIds,
  type InteropRuntimePreferences as RuntimePreferences,
} from './interop-runtime-preferences.js';

const STORAGE_KEY = 'interopRuntimePreferences';

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
    if (action.name === 'cancel' || action.name === 'pause') {
      const active = activeInteropRuntimeSelection(selected);
      if (selected.operation === 'sync' && active.id) {
        try {
          const progress = await this.syncRuntime().control(active.id, action.name);
          const provider = await interopProviderStatus(this.dependencies, selected.provider, false);
          const resultPreferences = action.name === 'cancel' ? clearActiveSyncRuntimeSelection(selected) : selected;
          if (action.name === 'cancel') await this.save(resultPreferences);
          return this.progressResult(context, resultPreferences, provider, progress);
        } catch (error) {
          return this.unsupportedAction(context, selected, 'failed', error instanceof Error ? error.message : 'Sync control failed.');
        }
      }
      return action.name === 'cancel'
        ? this.result(context, selected, 'cancelled', 'disconnected')
        : this.unsupportedAction(context, selected, 'paused', 'Transfer is not currently running.');
    }
    if (action.name === 'resolve-conflict')
      return this.unsupportedAction(context, selected, 'failed', 'The selected conflict is no longer available.');

    const interactive = action.name === 'connect' || action.name === 'reconnect';
    const provider = await interopProviderStatus(this.dependencies, selected.provider, interactive);
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
          label: INTEROP_PROVIDERS[selected.provider].label,
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
      const provider = await interopProviderStatus(this.dependencies, selected.provider, false);
      return this.result(context, selected, 'queued', provider.state, provider.detail, provider.error, 'paired');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Overlook pairing key could not be imported.';
      return this.result(
        context,
        selected,
        'failed',
        'disconnected',
        INTEROP_PROVIDERS[selected.provider].disconnected,
        { code: 'wrong-key', message, retryable: false },
        'invalid',
      );
    }
  }

  private async disconnect(context: InteropRuntimeContext, selected: RuntimePreferences): Promise<InteropRuntimeResult> {
    if (selected.provider === 'pcloud') await this.dependencies.disconnectPCloud();
    else if (selected.provider === 'google-drive') await this.dependencies.disconnectGoogleDrive();
    return this.result(context, selected, 'queued', 'disconnected', INTEROP_PROVIDERS[selected.provider].disconnected);
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
    if ((await interopPairingState(this.dependencies.getDb)) !== 'paired')
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
    if (context.recordIds.length === 0 || context.recordIds.length !== context.total)
      return this.unsupportedAction(
        context,
        selected,
        'failed',
        'The reviewed Move selection is empty or incomplete.',
        'unsupported-record',
      );
    const id = crypto.randomUUID();
    const active: RuntimePreferences =
      selected.operation === 'sync'
        ? { ...selected, activeSyncSessionId: id, activeSyncRecordIds: [...context.recordIds] }
        : { ...selected, activeTransferId: id, activeRecordIds: [...context.recordIds] };
    await this.save(active);
    try {
      if (selected.operation === 'sync') {
        const progress = await this.syncRuntime().start({
          provider: selected.provider,
          sessionId: id,
          recordIds: context.recordIds,
        });
        return this.progressResult(context, active, provider, progress);
      }
      const progress = await this.moveRuntime().start({
        provider: selected.provider,
        transferId: id,
        recordIds: context.recordIds,
      });
      return this.progressResult(context, active, provider, progress);
    } catch (error) {
      if (error instanceof SyncOutboxPublishError || error instanceof MoveOutboxPublishError)
        return this.progressFailure(context, active, provider, error);
      if (error instanceof InteropMoveSetupError || error instanceof InteropSyncSetupError) {
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
    const active = activeInteropRuntimeSelection(selected);
    if (!active.id || !sameInteropRecordIds(active.recordIds, context.recordIds)) {
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
      if (selected.operation === 'sync') {
        const progress = await this.syncRuntime().resume(selected.provider, active.id);
        return this.progressResult(context, selected, provider, progress);
      }
      const progress = await this.moveRuntime().resume({
        provider: selected.provider,
        transferId: active.id,
        total: context.total,
        allowFinalization: true,
      });
      return this.progressResult(context, selected, provider, progress);
    } catch (error) {
      if (error instanceof SyncOutboxPublishError || error instanceof MoveOutboxPublishError)
        return this.progressFailure(context, selected, provider, error);
      if (error instanceof InteropMoveSetupError || error instanceof InteropSyncSetupError) {
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
  ): Promise<MoveOutboxProgress | SecureSyncProgress | null> {
    const active = activeInteropRuntimeSelection(selected);
    if (!active.id || !sameInteropRecordIds(active.recordIds, context.recordIds)) return null;
    if (selected.operation === 'sync') return this.syncRuntime().status(active.id, context.locked ? undefined : provider);
    return this.moveRuntime().status({
      transferId: active.id,
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

  private syncRuntime(): InteropSyncRuntime {
    return new InteropSyncRuntime(this.dependencies.getDb, this.dependencies.openProvider, this.dependencies.getActiveBlobKey);
  }

  private progressResult(
    context: InteropRuntimeContext,
    selected: RuntimePreferences,
    provider: { readonly state: InteropProviderState; readonly detail: string; readonly error: InteropRuntimeError | null },
    progress: MoveOutboxProgress | SecureSyncProgress,
    error = provider.error,
    phase?: InteropRuntimeSnapshot['phase'],
  ): Promise<InteropRuntimeResult> {
    const view = 'session' in progress ? progressViews.syncProgressView(progress, error) : progressViews.moveProgressView(progress, error);
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
      view.conflicts,
    );
  }

  private progressFailure(
    context: InteropRuntimeContext,
    selected: RuntimePreferences,
    provider: { readonly state: InteropProviderState; readonly detail: string; readonly error: InteropRuntimeError | null },
    error: MoveOutboxPublishError | SyncOutboxPublishError,
  ): Promise<InteropRuntimeResult> {
    const cause = progressViews.interopRuntimeError(error.sourceError);
    const view =
      error instanceof SyncOutboxPublishError
        ? progressViews.syncProgressFailureView(error.progress, cause, error.message)
        : progressViews.moveProgressFailureView(error.progress, cause, error.message);
    return this.result(
      context,
      selected,
      view.phase,
      provider.state,
      provider.detail,
      view.error,
      'paired',
      view.counts,
      view.processed,
      view.conflicts,
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
      this.result(context, selected, phase, 'disconnected', INTEROP_PROVIDERS[selected.provider].disconnected, {
        code,
        message,
        retryable: false,
      }),
    );
  }

  private async result(
    context: InteropRuntimeContext,
    selected: RuntimePreferences,
    phase: InteropRuntimeSnapshot['phase'],
    providerState: InteropProviderState,
    detail = INTEROP_PROVIDERS[selected.provider].disconnected,
    error: InteropRuntimeError | null = null,
    pairing?: InteropRuntimeSnapshot['pairing'],
    counts: InteropCounts = progressViews.emptyInteropCounts(context.total),
    processed = 0,
    conflicts: InteropRuntimeSnapshot['conflicts'] = [],
  ): Promise<InteropRuntimeResult> {
    const snapshot: InteropRuntimeSnapshot = {
      entry: context.entry,
      operation: selected.operation,
      target: 'overlook',
      provider: { id: selected.provider, label: INTEROP_PROVIDERS[selected.provider].label, state: providerState, detail },
      pairing: pairing ?? (await interopPairingState(this.dependencies.getDb)),
      phase,
      counts,
      processed,
      conflicts,
      error,
      locked: context.locked,
    };
    return { ok: error === null, snapshot };
  }

  private save(value: RuntimePreferences): Promise<void> {
    return this.dependencies.storage.set({ [STORAGE_KEY]: value });
  }
}
