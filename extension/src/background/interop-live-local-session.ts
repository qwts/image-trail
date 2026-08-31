import { InteropTransportError, assertBoundedControlFrame } from '../core/interop/transport.js';
import {
  LIVE_LOCAL_CAPABILITY_TTL_MS,
  LIVE_LOCAL_WEB_SOCKET_PROTOCOL,
  liveLocalRedemption,
  parseLiveLocalControl,
  type LiveLocalCapability,
  type LiveLocalOpen,
  type LiveLocalOperationReview,
} from './interop-live-local-protocol.js';
import {
  LiveLocalOverlookObjectStore,
  type LiveLocalIncomingObjectRepository,
  type LiveLocalObjectChannel,
  type LiveLocalObjectProgress,
} from './interop-live-local-object-store.js';
import { LiveLocalResultBarrier } from './interop-live-local-result-barrier.js';

const SOCKET_CONNECT_TIMEOUT_MS = 5_000;
const HEARTBEAT_TIMEOUT_MS = 5_000;
const SOCKET_POLL_MS = 10;
const SOCKET_OPEN = 1;

export type LiveLocalSessionFailure = 'capability-rejected' | 'origin-rejected' | 'protocol-error' | 'peer-unavailable';

export class LiveLocalSessionError extends InteropTransportError {
  constructor(
    message: string,
    readonly state: LiveLocalSessionFailure,
    code: 'offline' | 'provider-unavailable' | 'corrupt' | 'unsupported',
    retryable: boolean,
  ) {
    super(message, code, retryable);
    this.name = 'LiveLocalSessionError';
  }
}

export interface LiveLocalWebSocketLike {
  readonly readyState: number;
  readonly bufferedAmount: number;
  binaryType: 'arraybuffer' | 'blob';
  send(data: string | ArrayBuffer | ArrayBufferView | Blob): void;
  close(code?: number, reason?: string): void;
  addEventListener(type: 'open' | 'message' | 'close' | 'error', listener: (event: Event) => void): void;
  removeEventListener(type: 'open' | 'message' | 'close' | 'error', listener: (event: Event) => void): void;
}

export type LiveLocalWebSocketFactory = (endpoint: string, protocol: string) => LiveLocalWebSocketLike;

export interface LiveLocalConnectInput {
  readonly pairingId: string;
  readonly operation: import('../core/interop/contract.js').InteropOperation;
  readonly operationId: string;
  readonly remoteSessionId: string;
  readonly review: LiveLocalOperationReview;
  readonly repository: LiveLocalIncomingObjectRepository;
  readonly signal?: AbortSignal | undefined;
  readonly progress?: ((progress: LiveLocalObjectProgress) => void) | undefined;
  readonly stateChanged?: ((state: LiveLocalSessionState) => void) | undefined;
  readonly resultChanged?: ((result: { readonly operationId: string; readonly status: 'completed' | 'reviewing' }) => void) | undefined;
}

export interface LiveLocalSessionState {
  readonly state: 'connecting' | 'connected' | 'paused' | 'closed';
  readonly operationId: string;
  readonly retryable: boolean;
}

interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value: T): void;
  reject(error: Error): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  void promise.catch(() => undefined);
  return { promise, resolve, reject };
}

export function defaultLiveLocalSocketFactory(endpoint: string, protocol: string): LiveLocalWebSocketLike {
  return new WebSocket(endpoint, protocol) as unknown as LiveLocalWebSocketLike;
}

function protocolError(message: string): LiveLocalSessionError {
  return new LiveLocalSessionError(message, 'protocol-error', 'corrupt', false);
}

function closeError(code: number, phase: LiveLocalOverlookSession['phase']): LiveLocalSessionError {
  if (code === 1008 && phase === 'connecting') {
    return new LiveLocalSessionError('Overlook rejected the extension WebSocket origin.', 'origin-rejected', 'unsupported', false);
  }
  if (code === 1008 && (phase === 'redeeming' || phase === 'opening')) {
    return new LiveLocalSessionError('Overlook rejected the short-lived capability.', 'capability-rejected', 'unsupported', false);
  }
  if (code === 1002 || code === 1003 || code === 1009) {
    return protocolError('Overlook closed the live local session for a protocol violation.');
  }
  return new LiveLocalSessionError('Overlook live local session became unavailable.', 'peer-unavailable', 'offline', true);
}

async function messageBytes(data: unknown): Promise<Uint8Array | null> {
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
  if (typeof Blob !== 'undefined' && data instanceof Blob) return new Uint8Array(await data.arrayBuffer());
  return null;
}

/** Background-only authenticated WebSocket session. Capabilities are consumed
 * during open and are neither exposed by the returned result nor persisted. */
export class LiveLocalOverlookSession implements LiveLocalObjectChannel {
  readonly #opened = deferred<void>();
  readonly #redeemed = deferred<void>();
  readonly #connected = deferred<void>();
  readonly #closed = deferred<void>();
  readonly #heartbeats: Deferred<void>[] = [];
  readonly #operationResults = new LiveLocalResultBarrier();
  readonly #socket: LiveLocalWebSocketLike;
  readonly #store: LiveLocalOverlookObjectStore;
  readonly #open: LiveLocalOpen;
  readonly #stateChanged: (state: LiveLocalSessionState) => void;
  readonly #resultChanged: (result: { readonly operationId: string; readonly status: 'completed' | 'reviewing' }) => void;
  #phase: 'connecting' | 'redeeming' | 'opening' | 'connected' | 'closing' | 'closed' = 'connecting';
  #messages: Promise<void> = Promise.resolve();
  #failure: Error | null = null;

  private constructor(
    socket: LiveLocalWebSocketLike,
    capability: LiveLocalCapability,
    open: LiveLocalOpen,
    repository: LiveLocalIncomingObjectRepository,
    progress: (progress: LiveLocalObjectProgress) => void,
    stateChanged: (state: LiveLocalSessionState) => void,
    resultChanged: (result: { readonly operationId: string; readonly status: 'completed' | 'reviewing' }) => void,
  ) {
    this.#socket = socket;
    this.#open = open;
    this.#stateChanged = stateChanged;
    this.#resultChanged = resultChanged;
    this.#store = new LiveLocalOverlookObjectStore(capability, this, repository, progress);
    socket.binaryType = 'arraybuffer';
    socket.addEventListener('open', this.onOpen);
    socket.addEventListener('message', this.onMessage);
    socket.addEventListener('close', this.onClose);
    socket.addEventListener('error', this.onError);
  }

  get phase(): 'connecting' | 'redeeming' | 'opening' | 'connected' | 'closing' | 'closed' {
    return this.#phase;
  }

  get store(): LiveLocalOverlookObjectStore {
    return this.#store;
  }

  static async connect(
    capability: LiveLocalCapability,
    open: LiveLocalOpen,
    input: Pick<LiveLocalConnectInput, 'repository' | 'signal' | 'progress' | 'stateChanged' | 'resultChanged'>,
    socketFactory: LiveLocalWebSocketFactory,
  ): Promise<LiveLocalOverlookSession> {
    const socket = socketFactory(capability.endpoint, LIVE_LOCAL_WEB_SOCKET_PROTOCOL);
    const session = new LiveLocalOverlookSession(
      socket,
      capability,
      open,
      input.repository,
      input.progress ?? (() => undefined),
      input.stateChanged ?? (() => undefined),
      input.resultChanged ?? (() => undefined),
    );
    input.signal?.addEventListener('abort', () => session.cancel(), { once: true });
    if (input.signal?.aborted === true) session.cancel();
    session.#stateChanged({ state: 'connecting', operationId: open.operationId, retryable: true });
    const capabilityLifetime = Math.min(LIVE_LOCAL_CAPABILITY_TTL_MS, Math.max(1, capability.expiresAtMs - capability.issuedAtMs));
    try {
      await session.withDeadline(session.#opened.promise, SOCKET_CONNECT_TIMEOUT_MS, () => {
        throw new LiveLocalSessionError('Overlook did not accept the loopback WebSocket.', 'peer-unavailable', 'offline', true);
      });
      session.#phase = 'redeeming';
      session.sendControl(liveLocalRedemption(capability));
      await session.withDeadline(session.#redeemed.promise, capabilityLifetime, () => {
        throw new LiveLocalSessionError('Overlook capability expired before redemption.', 'capability-rejected', 'unsupported', false);
      });
      session.#phase = 'opening';
      session.sendControl(open);
      await session.withDeadline(session.#connected.promise, SOCKET_CONNECT_TIMEOUT_MS, () => {
        throw protocolError('Overlook did not confirm the reviewed operation.');
      });
      session.#phase = 'connected';
      session.#stateChanged({ state: 'connected', operationId: open.operationId, retryable: false });
      return session;
    } catch (error) {
      session.fail(error);
      throw error;
    }
  }

  async heartbeat(): Promise<void> {
    this.assertConnected();
    const response = deferred<void>();
    this.#heartbeats.push(response);
    this.sendControl({ schemaVersion: 1, type: 'heartbeat' });
    try {
      await this.withDeadline(response.promise, HEARTBEAT_TIMEOUT_MS, () => {
        throw new LiveLocalSessionError('Overlook heartbeat timed out.', 'peer-unavailable', 'offline', true);
      });
    } catch (error) {
      const index = this.#heartbeats.indexOf(response);
      if (index >= 0) this.#heartbeats.splice(index, 1);
      this.fail(error);
      throw error;
    }
  }

  async commit(): Promise<void> {
    this.assertConnected();
    try {
      await this.#operationResults.wait(() => this.sendControl({ schemaVersion: 1, type: 'commit' }));
    } catch (error) {
      this.fail(error);
      throw error;
    }
  }

  cancel(): void {
    if (this.#phase === 'closed' || this.#phase === 'closing') return;
    const wasConnected = this.#phase === 'connected';
    const error = new InteropTransportError('Live local operation was cancelled.', 'offline', true);
    this.rejectPending(error);
    this.#phase = 'closing';
    if (wasConnected) this.sendControl({ schemaVersion: 1, type: 'cancel' });
    this.#store.close(error);
    this.#socket.close(1000, 'cancelled');
    this.#stateChanged({ state: 'paused', operationId: this.#open.operationId, retryable: true });
  }

  close(): void {
    if (this.#phase === 'closed' || this.#phase === 'closing') return;
    this.#phase = 'closing';
    this.#store.close();
    this.#socket.close(1000);
  }

  waitForClose(): Promise<void> {
    return this.#closed.promise;
  }

  sendControl(value: unknown): void {
    assertBoundedControlFrame(value);
    if (this.#socket.readyState !== SOCKET_OPEN) throw new InteropTransportError('Live local WebSocket is not open.', 'offline', true);
    this.#socket.send(JSON.stringify(value));
  }

  async sendBinary(bytesInput: Uint8Array, signal?: AbortSignal): Promise<void> {
    this.assertConnected();
    const bytes = bytesInput.slice();
    try {
      while (this.#socket.bufferedAmount + bytes.byteLength > this.#store.maxInFlightBytes) {
        if (signal?.aborted === true) throw new InteropTransportError('Live local send was cancelled.', 'offline', true);
        if (this.#socket.readyState !== SOCKET_OPEN) throw new InteropTransportError('Live local peer disconnected.', 'offline', true);
        await new Promise<void>((resolve) => setTimeout(resolve, SOCKET_POLL_MS));
      }
      this.#socket.send(bytes);
    } finally {
      bytes.fill(0);
    }
  }

  private readonly onOpen = (): void => {
    this.#opened.resolve();
  };

  private readonly onMessage = (event: Event): void => {
    const data = (event as MessageEvent<unknown>).data;
    this.#messages = this.#messages.then(() => this.handleMessage(data)).catch((error: unknown) => this.fail(error));
  };

  private readonly onClose = (event: Event): void => {
    const close = event as CloseEvent;
    const expected = this.#phase === 'closing';
    const error = expected ? null : closeError(close.code, this.#phase);
    this.#phase = 'closed';
    if (error !== null) this.fail(error);
    else this.#store.close();
    this.#closed.resolve();
    this.#stateChanged({ state: 'closed', operationId: this.#open.operationId, retryable: error?.retryable ?? false });
    this.detach();
  };

  private readonly onError = (): void => {
    // Browsers hide failed WebSocket upgrade details. The close event carries
    // the only available protocol code; the connection deadline is the fallback.
  };

  private async handleMessage(data: unknown): Promise<void> {
    if (typeof data === 'string') {
      let value: unknown;
      try {
        value = JSON.parse(data) as unknown;
      } catch {
        throw protocolError('Overlook sent a malformed live local control frame.');
      }
      assertBoundedControlFrame(value);
      if (this.#phase === 'redeeming') {
        if (
          !value ||
          typeof value !== 'object' ||
          Array.isArray(value) ||
          (value as { readonly schemaVersion?: unknown }).schemaVersion !== 1 ||
          (value as { readonly ok?: unknown }).ok !== true ||
          Object.keys(value).some((key) => key !== 'schemaVersion' && key !== 'ok')
        ) {
          throw protocolError('Overlook sent an invalid capability acknowledgement.');
        }
        this.#redeemed.resolve();
        return;
      }
      const control = parseLiveLocalControl(value);
      if (control.type === 'state' && control.operationId === this.#open.operationId) {
        if (this.#phase === 'opening' && control.status === 'connected') this.#connected.resolve();
        else if (control.status === 'paused')
          this.#stateChanged({ state: 'paused', operationId: control.operationId, retryable: control.retryable ?? true });
        return;
      }
      if (this.#phase !== 'connected') throw protocolError('Overlook sent live local control data before the session opened.');
      if (control.type === 'heartbeat-ack') this.#heartbeats.shift()?.resolve();
      else if (control.type === 'object-ack') this.#store.acknowledge(control.path, control.sha256);
      else if (control.type === 'operation-result') {
        if (control.operationId !== this.#open.operationId) {
          throw protocolError('Overlook returned a result for a different live local operation.');
        }
        this.#operationResults.resolve(control.status);
        this.#resultChanged(control);
      }
      return;
    }
    const bytes = await messageBytes(data);
    if (bytes === null || this.#phase !== 'connected') throw protocolError('Overlook sent an unsupported live local frame.');
    await this.#store.receive(bytes);
    bytes.fill(0);
  }

  private fail(error: unknown): void {
    if (this.#failure !== null) return;
    this.#failure = error instanceof Error ? error : protocolError('Overlook live local session failed.');
    this.rejectPending(this.#failure);
    this.#store.close(this.#failure);
    if (this.#phase !== 'closed') {
      this.#phase = 'closing';
      this.#socket.close(1002, 'protocol error');
    }
  }

  private rejectPending(error: Error): void {
    this.#opened.reject(error);
    this.#redeemed.reject(error);
    this.#connected.reject(error);
    for (const heartbeat of this.#heartbeats.splice(0)) heartbeat.reject(error);
    this.#operationResults.close(error);
  }

  private async withDeadline<T>(operation: Promise<T>, timeoutMs: number, timeoutError: () => never): Promise<T> {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        operation,
        new Promise<T>((_resolve, reject) => {
          timeout = setTimeout(() => {
            try {
              timeoutError();
            } catch (error) {
              reject(error);
            }
          }, timeoutMs);
        }),
      ]);
    } finally {
      if (timeout !== undefined) clearTimeout(timeout);
    }
  }

  private assertConnected(): void {
    if (this.#phase !== 'connected' || this.#socket.readyState !== SOCKET_OPEN) {
      throw new InteropTransportError('Live local session is not connected.', 'offline', true);
    }
  }

  private detach(): void {
    this.#socket.removeEventListener('open', this.onOpen);
    this.#socket.removeEventListener('message', this.onMessage);
    this.#socket.removeEventListener('close', this.onClose);
    this.#socket.removeEventListener('error', this.onError);
  }
}
