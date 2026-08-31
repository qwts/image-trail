import { RELEASED_IMAGE_TRAIL_EXTENSION_ID } from './interop-icloud-client.js';
import { LiveLocalOverlookClient, type LiveLocalNativeBootstrapClient } from './interop-live-local-client.js';
import type { LiveLocalIncomingObjectRepository } from './interop-live-local-object-store.js';
import { LIVE_LOCAL_MAX_IN_FLIGHT_BYTES, decodeLiveLocalObjectChunk, type LiveLocalCapability } from './interop-live-local-protocol.js';
import type { LiveLocalWebSocketLike } from './interop-live-local-session.js';
import { InteropTransportError, type InteropObjectPage } from '../core/interop/transport.js';

const PAIRING_ID = '11111111-1111-4111-8111-111111111111';
const SESSION_ID = '22222222-2222-4222-8222-222222222222';
const OPERATION_ID = '33333333-3333-4333-8333-333333333333';
const REMOTE_SESSION_ID = '44444444-4444-4444-8444-444444444444';

export interface LiveLocalE2EProbeResult {
  readonly connected: boolean;
  readonly bootstrapCalls: number;
  readonly socketProtocol: string;
  readonly controlTypes: readonly string[];
  readonly acknowledgedBytes: number;
}

class ProbeRepository implements LiveLocalIncomingObjectRepository {
  put(): Promise<void> {
    return Promise.resolve();
  }

  get(): Promise<Uint8Array> {
    return Promise.reject(new InteropTransportError('Probe object not found.', 'not-found', false));
  }

  list(): Promise<InteropObjectPage> {
    return Promise.resolve({ entries: [], nextCursor: null });
  }

  delete(): Promise<void> {
    return Promise.resolve();
  }

  quota(): Promise<{ readonly usedBytes: number; readonly totalBytes: null }> {
    return Promise.resolve({ usedBytes: 0, totalBytes: null });
  }

  verify(): Promise<{ readonly sha256: string; readonly bytes: number }> {
    return Promise.reject(new InteropTransportError('Probe object not found.', 'not-found', false));
  }
}

class ProbeSocket implements LiveLocalWebSocketLike {
  readyState = 0;
  bufferedAmount = 0;
  binaryType: 'arraybuffer' | 'blob' = 'blob';
  readonly controlTypes: string[] = [];
  readonly #listeners = new Map<string, Set<(event: Event) => void>>();

  constructor() {
    queueMicrotask(() => {
      this.readyState = 1;
      this.emit('open');
    });
  }

  send(data: string | ArrayBuffer | ArrayBufferView | Blob): void {
    if (typeof data === 'string') {
      const control = JSON.parse(data) as { readonly type?: string; readonly operationId?: string };
      this.controlTypes.push(control.type ?? 'unknown');
      if (control.type === 'redeem') this.message({ schemaVersion: 1, ok: true });
      else if (control.type === 'open') {
        this.message({ schemaVersion: 1, type: 'state', status: 'connected', operationId: control.operationId });
      } else if (control.type === 'heartbeat') this.message({ schemaVersion: 1, type: 'heartbeat-ack' });
      return;
    }
    if (!ArrayBuffer.isView(data)) return;
    const bytes = new Uint8Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
    void decodeLiveLocalObjectChunk(bytes).then(({ header, payload }) => {
      payload.fill(0);
      this.message({ schemaVersion: 1, type: 'object-ack', path: header.path, sha256: header.objectSha256 });
    });
  }

  close(code = 1000): void {
    if (this.readyState === 3) return;
    this.readyState = 3;
    queueMicrotask(() => this.emit('close', { code }));
  }

  addEventListener(type: string, listener: (event: Event) => void): void {
    const listeners = this.#listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.#listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: (event: Event) => void): void {
    this.#listeners.get(type)?.delete(listener);
  }

  private message(value: unknown): void {
    queueMicrotask(() => this.emit('message', { data: JSON.stringify(value) }));
  }

  private emit(type: string, properties: Record<string, unknown> = {}): void {
    const event = Object.assign(new Event(type), properties);
    for (const listener of this.#listeners.get(type) ?? []) listener(event);
  }
}

function probeCapability(): LiveLocalCapability {
  const issuedAtMs = Date.now();
  return {
    schemaVersion: 1,
    sessionId: SESSION_ID,
    secret: 'A'.repeat(43),
    endpoint: `ws://127.0.0.1:32123/session/${SESSION_ID}`,
    extensionId: RELEASED_IMAGE_TRAIL_EXTENSION_ID,
    pairingId: PAIRING_ID,
    operation: 'move',
    protocolVersion: 1,
    issuedAtMs,
    expiresAtMs: issuedAtMs + 15_000,
    maxCiphertextFrameBytes: 4 * 1024 * 1024,
    maxInFlightBytes: LIVE_LOCAL_MAX_IN_FLIGHT_BYTES,
  };
}

async function runLiveLocalE2EProbe(): Promise<LiveLocalE2EProbeResult> {
  let bootstrapCalls = 0;
  let socketProtocol = '';
  let socket: ProbeSocket | undefined;
  const native: LiveLocalNativeBootstrapClient = {
    bootstrap: () => {
      bootstrapCalls += 1;
      return Promise.resolve({ schemaVersion: 1, state: 'running', capability: probeCapability() });
    },
  };
  const client = new LiveLocalOverlookClient(native, (_endpoint, protocol) => {
    socketProtocol = protocol;
    socket = new ProbeSocket();
    return socket;
  });
  const progress: Array<{ readonly acknowledgedBytes: number }> = [];
  const result = await client.connect({
    pairingId: PAIRING_ID,
    operation: 'move',
    operationId: OPERATION_ID,
    remoteSessionId: REMOTE_SESSION_ID,
    review: { operation: 'move' },
    repository: new ProbeRepository(),
    progress: (value) => progress.push(value),
  });
  if (result.state !== 'connected' || socket === undefined) throw new Error('Live local Chromium probe did not connect.');
  await result.store.put('probe/object.bin', new Uint8Array([1, 2, 3, 4]));
  await result.session.heartbeat();
  result.session.close();
  await result.session.waitForClose();
  return {
    connected: true,
    bootstrapCalls,
    socketProtocol,
    controlTypes: socket.controlTypes,
    acknowledgedBytes: progress.at(-1)?.acknowledgedBytes ?? 0,
  };
}

export function installLiveLocalE2EProbe(): void {
  const scope = globalThis as typeof globalThis & {
    __imageTrailRunLiveLocalE2EProbe?: () => Promise<LiveLocalE2EProbeResult>;
  };
  scope.__imageTrailRunLiveLocalE2EProbe = runLiveLocalE2EProbe;
}
