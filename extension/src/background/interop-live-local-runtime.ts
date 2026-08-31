import { InteropTransportError, type InteropObjectPage, type InteropObjectStore } from '../core/interop/transport.js';
import { IndexedDbLiveLocalObjectRepository } from '../data/interop/live-local-object-repository.js';
import { LiveLocalOverlookClient, type LiveLocalUnavailableState } from './interop-live-local-client.js';
import type { LiveLocalConnectInput } from './interop-live-local-session.js';
import type { InteropProviderOpenContext, InteropRuntimeProviderStore } from './interop-runtime-dependencies.js';

interface ActiveLiveLocalRuntime {
  readonly key: string;
  readonly session: LiveLocalRuntimeSession;
  readonly store: InteropRuntimeProviderStore;
}

export interface LiveLocalRuntimeSession {
  readonly phase: string;
  readonly store: InteropObjectStore;
  commit(): void;
  close(): void;
}

export interface LiveLocalRuntimeClient {
  connect(
    input: LiveLocalConnectInput,
  ): Promise<
    | { readonly state: 'connected'; readonly session: LiveLocalRuntimeSession }
    | { readonly state: LiveLocalUnavailableState; readonly retryable: boolean }
  >;
}

function runtimeKey(context: InteropProviderOpenContext): string {
  return JSON.stringify([context.pairingId, context.operation, context.operationId, context.remoteSessionId, ...context.recordIds]);
}

function unavailableMessage(state: string): string {
  if (state === 'missing-host') return 'The signed Overlook interoperability host is not installed.';
  if (state === 'not-running') return 'Open Overlook before starting the live local transfer.';
  if (state === 'locked') return 'Unlock Overlook before starting the live local transfer.';
  if (state === 'incompatible') return 'The installed Overlook version does not support this live local protocol.';
  if (state === 'unsupported') return 'Live local Overlook transfer is unsupported on this build or platform.';
  return 'Overlook live local transfer is unavailable.';
}

class LiveLocalRuntimeStore implements InteropRuntimeProviderStore {
  readonly provider = 'local-overlook' as const;

  constructor(
    private readonly session: LiveLocalRuntimeSession,
    private readonly repository: IndexedDbLiveLocalObjectRepository,
  ) {}

  authState(): Promise<'connected' | 'not-connected' | 'expired'> {
    return this.session.store.authState();
  }

  put(path: string, bytes: Uint8Array): Promise<{ readonly bytes: number }> {
    return this.session.store.put(path, bytes);
  }

  get(path: string): Promise<Uint8Array> {
    return this.session.store.get(path);
  }

  list(prefix: string, cursor: string | null): Promise<InteropObjectPage> {
    return this.session.store.list(prefix, cursor);
  }

  delete(path: string): Promise<void> {
    return this.session.store.delete(path);
  }

  quota(): Promise<{ readonly usedBytes: number; readonly totalBytes: number | null }> {
    return this.session.store.quota();
  }

  verify(path: string): Promise<{ readonly sha256: string; readonly bytes: number }> {
    return this.session.store.verify(path);
  }

  commit(): void {
    this.session.commit();
  }

  clearStaged(): Promise<void> {
    return this.repository.clear();
  }
}

/** Owns at most one authenticated live session in an MV3 worker lifetime.
 * Persisted operation and remote-session ids allow exact route resumption after
 * suspension without persisting the one-use bootstrap capability. */
export class LiveLocalInteropRuntime {
  #active: ActiveLiveLocalRuntime | null = null;

  constructor(
    private readonly getDb: () => Promise<IDBDatabase | null>,
    private readonly client: LiveLocalRuntimeClient = new LiveLocalOverlookClient(),
  ) {}

  async open(context: InteropProviderOpenContext): Promise<InteropRuntimeProviderStore> {
    const key = runtimeKey(context);
    if (this.#active?.key === key && this.#active.session.phase === 'connected') return this.#active.store;
    this.closeActive();

    const db = await this.getDb();
    if (!db) throw new InteropTransportError('Live local encrypted staging is unavailable.', 'provider-unavailable', true);
    const repository = new IndexedDbLiveLocalObjectRepository(db, context.operationId);
    const result = await this.client.connect({
      pairingId: context.pairingId,
      operation: context.operation,
      operationId: context.operationId,
      remoteSessionId: context.remoteSessionId,
      review:
        context.operation === 'move'
          ? { operation: 'move' }
          : {
              operation: 'sync',
              sourceProduct: 'image-trail',
              targetProduct: 'overlook',
              direction: 'two-way',
              scope: { kind: 'selected', localIds: [...context.recordIds] },
            },
      repository,
      stateChanged: (state) => {
        if (state.operationId === context.operationId && state.state === 'closed' && this.#active?.key === key) this.#active = null;
      },
    });
    if (result.state !== 'connected') {
      throw new InteropTransportError(
        unavailableMessage(result.state),
        result.state === 'incompatible' || result.state === 'unsupported' ? 'unsupported' : 'provider-unavailable',
        result.retryable,
      );
    }
    const store = new LiveLocalRuntimeStore(result.session, repository);
    this.#active = { key, session: result.session, store };
    return store;
  }

  disconnect(): Promise<void> {
    this.closeActive();
    return Promise.resolve();
  }

  private closeActive(): void {
    const active = this.#active;
    this.#active = null;
    active?.session.close();
  }
}
