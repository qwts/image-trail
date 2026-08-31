import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, test } from 'node:test';

import { RELEASED_IMAGE_TRAIL_EXTENSION_ID, type NativeRuntime } from '../extension/src/background/interop-icloud-client.js';
import {
  OverlookLiveLocalNativeClient,
  probeLiveLocalNativeAvailability,
  probeLiveLocalNativeSupport,
} from '../extension/src/background/interop-live-local-native.js';
import { LiveLocalOverlookClient, type LiveLocalNativeBootstrapClient } from '../extension/src/background/interop-live-local-client.js';
import {
  LiveLocalOverlookObjectStore,
  type LiveLocalIncomingObjectRepository,
  type LiveLocalObjectChannel,
} from '../extension/src/background/interop-live-local-object-store.js';
import {
  LIVE_LOCAL_MAX_IN_FLIGHT_BYTES,
  LIVE_LOCAL_OBJECT_CHUNK_BYTES,
  LIVE_LOCAL_PROTOCOL_VERSION,
  LIVE_LOCAL_WEB_SOCKET_PROTOCOL,
  createLiveLocalOpen,
  decodeLiveLocalObjectChunk,
  encodeLiveLocalObjectChunk,
  type LiveLocalCapability,
} from '../extension/src/background/interop-live-local-protocol.js';
import {
  LiveLocalSessionError,
  type LiveLocalSessionState,
  type LiveLocalWebSocketFactory,
  type LiveLocalWebSocketLike,
} from '../extension/src/background/interop-live-local-session.js';
import { INTEROP_CHUNK_BYTES, InteropTransportError, sha256, type InteropObjectPage } from '../extension/src/core/interop/transport.js';

const PAIRING_ID = '11111111-1111-4111-8111-111111111111';
const SESSION_ID = '22222222-2222-4222-8222-222222222222';
const OPERATION_ID = '33333333-3333-4333-8333-333333333333';
const REMOTE_SESSION_ID = '44444444-4444-4444-8444-444444444444';

function capability(overrides: Partial<LiveLocalCapability> = {}): LiveLocalCapability {
  const issuedAtMs = Date.now();
  return {
    schemaVersion: 1,
    sessionId: SESSION_ID,
    secret: 'A'.repeat(43),
    endpoint: `ws://127.0.0.1:32123/session/${SESSION_ID}`,
    extensionId: RELEASED_IMAGE_TRAIL_EXTENSION_ID,
    pairingId: PAIRING_ID,
    operation: 'move',
    protocolVersion: LIVE_LOCAL_PROTOCOL_VERSION,
    issuedAtMs,
    expiresAtMs: issuedAtMs + 15_000,
    maxCiphertextFrameBytes: 4 * 1024 * 1024,
    maxInFlightBytes: LIVE_LOCAL_MAX_IN_FLIGHT_BYTES,
    ...overrides,
  };
}

function nativeRuntime(response: unknown | (() => Promise<unknown>), messages: object[] = []): NativeRuntime {
  return {
    id: RELEASED_IMAGE_TRAIL_EXTENSION_ID,
    getPlatformInfo: () => Promise.resolve({ os: 'mac', arch: 'arm64', nacl_arch: 'arm' }),
    sendNativeMessage: (_application, message) => {
      messages.push(message);
      return typeof response === 'function' ? response() : Promise.resolve(response);
    },
  };
}

async function waitFor(condition: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (condition()) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  assert.fail('Timed out waiting for the live local test condition.');
}

class MemoryRepository implements LiveLocalIncomingObjectRepository {
  readonly objects = new Map<string, Uint8Array>();

  put(path: string, bytes: Uint8Array): Promise<void> {
    this.objects.set(path, bytes.slice());
    return Promise.resolve();
  }

  get(path: string): Promise<Uint8Array> {
    const bytes = this.objects.get(path);
    return bytes === undefined ? Promise.reject(new InteropTransportError('missing', 'not-found', false)) : Promise.resolve(bytes.slice());
  }

  list(prefix: string, _cursor: string | null): Promise<InteropObjectPage> {
    return Promise.resolve({
      entries: [...this.objects].filter(([path]) => path.startsWith(prefix)).map(([path, bytes]) => ({ path, bytes: bytes.byteLength })),
      nextCursor: null,
    });
  }

  delete(path: string): Promise<void> {
    this.objects.delete(path);
    return Promise.resolve();
  }

  quota(): Promise<{ readonly usedBytes: number; readonly totalBytes: null }> {
    return Promise.resolve({
      usedBytes: [...this.objects.values()].reduce((total, bytes) => total + bytes.byteLength, 0),
      totalBytes: null,
    });
  }

  async verify(path: string): Promise<{ readonly sha256: string; readonly bytes: number }> {
    const bytes = await this.get(path);
    return { sha256: await sha256(bytes), bytes: bytes.byteLength };
  }
}

describe('live local native bootstrap (#675)', () => {
  test('reports pairing-scoped availability without exposing the one-use capability', async () => {
    const calls: unknown[] = [];
    const running = {
      bootstrap: (pairingId: string, operation: 'move' | 'sync') => {
        calls.push({ pairingId, operation });
        return Promise.resolve({ schemaVersion: 1 as const, state: 'running' as const, capability: capability() });
      },
    };
    assert.equal(await probeLiveLocalNativeAvailability(PAIRING_ID, 'move', running), 'connected');
    assert.deepEqual(calls, [{ pairingId: PAIRING_ID, operation: 'move' }]);

    const closed = {
      bootstrap: () => Promise.resolve({ schemaVersion: 1 as const, state: 'not-running' as const }),
    };
    assert.equal(await probeLiveLocalNativeAvailability(PAIRING_ID, 'sync', closed), 'not-running');
  });

  test('sends the exact schema-v2 request and accepts only a matching bounded capability', async () => {
    const messages: object[] = [];
    const client = new OverlookLiveLocalNativeClient(
      RELEASED_IMAGE_TRAIL_EXTENSION_ID,
      nativeRuntime({ schemaVersion: 1, ok: true, result: { schemaVersion: 1, state: 'running', capability: capability() } }, messages),
    );
    const result = await client.bootstrap(PAIRING_ID, 'move');
    assert.equal(result.state, 'running');
    assert.deepEqual(messages, [
      {
        schemaVersion: 2,
        operation: 'live-local-bootstrap',
        request: {
          schemaVersion: 1,
          extensionId: RELEASED_IMAGE_TRAIL_EXTENSION_ID,
          pairingId: PAIRING_ID,
          operation: 'move',
          protocolMin: 1,
          protocolMax: 1,
        },
      },
    ]);
  });

  test('classifies missing host and desktop availability without inventing a connection', async () => {
    const missing = new OverlookLiveLocalNativeClient(
      RELEASED_IMAGE_TRAIL_EXTENSION_ID,
      nativeRuntime(() => Promise.reject(new Error('Specified native messaging host not found.'))),
    );
    assert.deepEqual(await missing.bootstrap(PAIRING_ID, 'move'), { schemaVersion: 1, state: 'missing-host' });
    for (const state of ['not-running', 'locked', 'incompatible', 'unavailable'] as const) {
      const client = new OverlookLiveLocalNativeClient(
        RELEASED_IMAGE_TRAIL_EXTENSION_ID,
        nativeRuntime({ schemaVersion: 1, ok: true, result: { schemaVersion: 1, state } }),
      );
      assert.deepEqual(await client.bootstrap(PAIRING_ID, 'move'), { schemaVersion: 1, state });
    }
    const messages: object[] = [];
    const wrongIdentity = new OverlookLiveLocalNativeClient(RELEASED_IMAGE_TRAIL_EXTENSION_ID, {
      ...nativeRuntime({ schemaVersion: 1, ok: true }, messages),
      id: 'a'.repeat(32),
    });
    assert.deepEqual(await wrongIdentity.bootstrap(PAIRING_ID, 'move'), { schemaVersion: 1, state: 'unsupported' });
    assert.deepEqual(messages, []);
  });

  test('preserves native bootstrap retryability classifications', async () => {
    const native = new OverlookLiveLocalNativeClient(
      RELEASED_IMAGE_TRAIL_EXTENSION_ID,
      nativeRuntime({ schemaVersion: 1, ok: false, code: 'unavailable', retryable: false }),
    );
    assert.deepEqual(await native.bootstrap(PAIRING_ID, 'move'), {
      schemaVersion: 1,
      state: 'unavailable',
      retryable: false,
    });
  });

  test('allows the live-local authority probe on Windows without invoking the legacy macOS client', async () => {
    const runtime = {
      ...nativeRuntime({ schemaVersion: 1, ok: true }),
      getPlatformInfo: () => Promise.resolve({ os: 'win' as const, arch: 'x86-64' as const, nacl_arch: 'x86-64' as const }),
    };
    await probeLiveLocalNativeSupport(RELEASED_IMAGE_TRAIL_EXTENSION_ID, runtime);
    await assert.rejects(
      probeLiveLocalNativeSupport(RELEASED_IMAGE_TRAIL_EXTENSION_ID, {
        ...runtime,
        getPlatformInfo: () => Promise.resolve({ os: 'linux' as const, arch: 'x86-64' as const, nacl_arch: 'x86-64' as const }),
      }),
      (error: unknown) => error instanceof InteropTransportError && error.code === 'unsupported' && !error.retryable,
    );
  });

  test('fails closed on malformed, non-loopback, downgraded, or cross-pairing capability data', async () => {
    const issuedAtMs = Date.now();
    const candidates = [
      { schemaVersion: 1 },
      { schemaVersion: 1, state: 'running', capability: capability({ endpoint: `ws://localhost:32123/session/${SESSION_ID}` }) },
      { schemaVersion: 1, state: 'running', capability: capability({ endpoint: `ws://127.0.0.1:032123/session/${SESSION_ID}` }) },
      { schemaVersion: 1, state: 'running', capability: capability({ protocolVersion: 2 }) },
      { schemaVersion: 1, state: 'running', capability: capability({ pairingId: REMOTE_SESSION_ID }) },
      { schemaVersion: 1, state: 'running', capability: capability({ issuedAtMs, expiresAtMs: issuedAtMs + 15_001 }) },
    ];
    for (const result of candidates) {
      const client = new OverlookLiveLocalNativeClient(
        RELEASED_IMAGE_TRAIL_EXTENSION_ID,
        nativeRuntime({ schemaVersion: 1, ok: true, result }),
      );
      await assert.rejects(client.bootstrap(PAIRING_ID, 'move'), (error: unknown) => {
        return error instanceof InteropTransportError && !error.retryable;
      });
    }
  });
});

describe('live local encrypted object frames (#675)', () => {
  test('matches Overlook framing and rejects tampering and unsafe paths', async () => {
    const payload = new Uint8Array([1, 2, 3, 4]);
    const objectSha256 = await sha256(payload);
    const frame = await encodeLiveLocalObjectChunk(
      { path: 'objects/a.bin', objectBytes: payload.byteLength, objectSha256, chunkIndex: 0, chunkCount: 1 },
      payload,
    );
    const decoded = await decodeLiveLocalObjectChunk(frame);
    assert.equal(decoded.header.path, 'objects/a.bin');
    assert.deepEqual(decoded.payload, payload);
    const tampered = frame.slice();
    tampered[tampered.length - 1] = (tampered[tampered.length - 1] as number) ^ 0xff;
    await assert.rejects(decodeLiveLocalObjectChunk(tampered), /verification/u);
    await assert.rejects(decodeLiveLocalObjectChunk(new Uint8Array(INTEROP_CHUNK_BYTES + 1)), /exceeds/u);
    await assert.rejects(
      encodeLiveLocalObjectChunk(
        { path: '../escape', objectBytes: payload.byteLength, objectSha256, chunkIndex: 0, chunkCount: 1 },
        payload,
      ),
      /provider-relative/u,
    );
  });

  test('binds the open-frame review hash to Overlook canonical JSON', async () => {
    const open = await createLiveLocalOpen(OPERATION_ID, REMOTE_SESSION_ID, { operation: 'move' });
    assert.equal(
      open.scopeHash,
      createHash('sha256')
        .update(JSON.stringify({ operation: 'move' }), 'utf8')
        .digest('hex'),
    );
  });

  test('acknowledges incoming ciphertext only after durable storage and re-acks exact resume', async () => {
    const repository = new MemoryRepository();
    const controls: unknown[] = [];
    const channel: LiveLocalObjectChannel = {
      sendBinary: () => Promise.resolve(),
      sendControl: (value) => controls.push(value),
    };
    const store = new LiveLocalOverlookObjectStore(capability(), channel, repository);
    const payload = new Uint8Array([5, 6, 7]);
    const objectSha256 = await sha256(payload);
    const frame = await encodeLiveLocalObjectChunk(
      { path: 'incoming/object.bin', objectBytes: payload.byteLength, objectSha256, chunkIndex: 0, chunkCount: 1 },
      payload,
    );
    await store.receive(frame);
    assert.deepEqual(await repository.get('incoming/object.bin'), payload);
    assert.deepEqual(controls, [{ schemaVersion: 1, type: 'object-ack', path: 'incoming/object.bin', sha256: objectSha256 }]);
    await store.receive(frame);
    assert.equal(controls.length, 2);
    const replay = new Uint8Array([8, 9, 10]);
    const replayFrame = await encodeLiveLocalObjectChunk(
      { path: 'incoming/object.bin', objectBytes: replay.byteLength, objectSha256: await sha256(replay), chunkIndex: 0, chunkCount: 1 },
      replay,
    );
    await assert.rejects(store.receive(replayFrame), /replayed/u);
  });

  test('enforces the acknowledgement window and exact outgoing progress', async () => {
    const repository = new MemoryRepository();
    const sent: Array<{ readonly path: string; readonly sha256: string }> = [];
    const progress: unknown[] = [];
    const channel: LiveLocalObjectChannel = {
      sendBinary: async (frame) => {
        const decoded = await decodeLiveLocalObjectChunk(frame);
        sent.push({ path: decoded.header.path, sha256: decoded.header.objectSha256 });
      },
      sendControl: () => undefined,
    };
    const store = new LiveLocalOverlookObjectStore(
      { maxCiphertextFrameBytes: 4 * 1024 * 1024, maxInFlightBytes: 4 },
      channel,
      repository,
      (value) => progress.push(value),
    );
    const first = store.put('one.bin', new Uint8Array([1, 2, 3, 4]));
    const second = store.put('two.bin', new Uint8Array([5, 6, 7, 8]));
    await waitFor(() => sent.length === 1);
    assert.deepEqual(
      sent.map(({ path }) => path),
      ['one.bin'],
    );
    store.acknowledge('one.bin', sent[0]?.sha256 ?? '');
    await first;
    assert.deepEqual(await store.get('one.bin'), new Uint8Array([1, 2, 3, 4]));
    assert.deepEqual(await store.list('one', null), {
      entries: [{ path: 'one.bin', bytes: 4 }],
      nextCursor: null,
    });
    await waitFor(() => sent.length === 2);
    assert.deepEqual(
      sent.map(({ path }) => path),
      ['one.bin', 'two.bin'],
    );
    store.acknowledge('two.bin', sent[1]?.sha256 ?? '');
    await second;
    assert.deepEqual(progress, [
      { path: 'one.bin', sentBytes: 4, acknowledgedBytes: 0, totalBytes: 4 },
      { path: 'one.bin', sentBytes: 4, acknowledgedBytes: 4, totalBytes: 4 },
      { path: 'two.bin', sentBytes: 4, acknowledgedBytes: 0, totalBytes: 4 },
      { path: 'two.bin', sentBytes: 4, acknowledgedBytes: 4, totalBytes: 4 },
    ]);
    assert.equal(LIVE_LOCAL_OBJECT_CHUNK_BYTES < 4 * 1024 * 1024, true);
  });

  test('uses and enforces the negotiated ciphertext frame limit', async () => {
    const sent: Uint8Array[] = [];
    const maxCiphertextFrameBytes = 2_600;
    const store = new LiveLocalOverlookObjectStore(
      { maxCiphertextFrameBytes, maxInFlightBytes: 8_000 },
      {
        sendBinary: (frame) => {
          sent.push(frame.slice());
          return Promise.resolve();
        },
        sendControl: () => undefined,
      },
      new MemoryRepository(),
    );
    const pending = store.put('chunked.bin', new Uint8Array(1_500));
    await waitFor(() => sent.length > 1);
    assert.equal(
      sent.every((frame) => frame.byteLength <= maxCiphertextFrameBytes),
      true,
    );
    const decoded = await decodeLiveLocalObjectChunk(sent[0] as Uint8Array);
    store.acknowledge('chunked.bin', decoded.header.objectSha256);
    await pending;

    const oversizedPayload = new Uint8Array(2_500);
    const oversizedFrame = await encodeLiveLocalObjectChunk(
      {
        path: 'incoming/oversized.bin',
        objectBytes: oversizedPayload.byteLength,
        objectSha256: await sha256(oversizedPayload),
        chunkIndex: 0,
        chunkCount: 1,
      },
      oversizedPayload,
    );
    await assert.rejects(store.receive(oversizedFrame), /negotiated bound/u);
  });

  test('cancels an object waiting for durable acknowledgement without closing the session', async () => {
    const sent: Uint8Array[] = [];
    const controller = new AbortController();
    const store = new LiveLocalOverlookObjectStore(
      { maxCiphertextFrameBytes: 4 * 1024 * 1024, maxInFlightBytes: 4 },
      {
        sendBinary: (frame) => {
          sent.push(frame.slice());
          return Promise.resolve();
        },
        sendControl: () => undefined,
      },
      new MemoryRepository(),
    );
    const pending = store.put('cancelled.bin', new Uint8Array([1, 2, 3, 4]), controller.signal);
    await waitFor(() => sent.length === 1);
    controller.abort();
    await assert.rejects(pending, /cancelled/u);
    assert.equal(await store.authState(), 'connected');
  });
});

type SocketMode = 'accept' | 'reject-origin' | 'reject-capability';

class FakeSocket implements LiveLocalWebSocketLike {
  readyState = 0;
  bufferedAmount = 0;
  binaryType: 'arraybuffer' | 'blob' = 'blob';
  failNextSend = false;
  readonly sent: unknown[] = [];
  readonly #listeners = new Map<string, Set<(event: Event) => void>>();
  readonly #objects = new Map<string, number>();
  #operationId: string | undefined;

  constructor(private readonly mode: SocketMode) {
    queueMicrotask(() => {
      if (mode === 'reject-origin') this.emit('close', { code: 1008 });
      else {
        this.readyState = 1;
        this.emit('open');
      }
    });
  }

  send(data: string | ArrayBuffer | ArrayBufferView | Blob): void {
    if (this.failNextSend) {
      this.failNextSend = false;
      throw new Error('socket send failed');
    }
    this.sent.push(data);
    if (typeof data === 'string') {
      const value = JSON.parse(data) as { readonly type?: string; readonly operationId?: string };
      if (value.type === 'redeem') {
        if (this.mode === 'reject-capability') queueMicrotask(() => this.emit('close', { code: 1008 }));
        else queueMicrotask(() => this.message({ schemaVersion: 1, ok: true }));
      } else if (value.type === 'open') {
        this.#operationId = value.operationId;
        queueMicrotask(() => this.message({ schemaVersion: 1, type: 'state', status: 'connected', operationId: value.operationId }));
      } else if (value.type === 'heartbeat') queueMicrotask(() => this.message({ schemaVersion: 1, type: 'heartbeat-ack' }));
      else if (value.type === 'commit') {
        queueMicrotask(() =>
          this.message({ schemaVersion: 1, type: 'operation-result', operationId: this.#operationId, status: 'reviewing' }),
        );
      } else if (value.type === 'cancel') queueMicrotask(() => this.close(1000));
      return;
    }
    const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : ArrayBuffer.isView(data) ? new Uint8Array(data.buffer) : null;
    if (bytes !== null) {
      void decodeLiveLocalObjectChunk(bytes).then(({ header }) => {
        const received = (this.#objects.get(header.path) ?? 0) + 1;
        this.#objects.set(header.path, received);
        if (received === header.chunkCount) {
          this.message({ schemaVersion: 1, type: 'object-ack', path: header.path, sha256: header.objectSha256 });
        }
      });
    }
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
    this.emit('message', { data: JSON.stringify(value) });
  }

  private emit(type: string, properties: Record<string, unknown> = {}): void {
    const event = Object.assign(new Event(type), properties);
    for (const listener of this.#listeners.get(type) ?? []) listener(event);
  }
}

describe('authenticated live local WebSocket session (#675)', () => {
  function harness(mode: SocketMode = 'accept') {
    let bootstraps = 0;
    const sockets: FakeSocket[] = [];
    const native: LiveLocalNativeBootstrapClient = {
      bootstrap: () => {
        bootstraps += 1;
        return Promise.resolve({
          schemaVersion: 1,
          state: 'running',
          capability: capability({
            sessionId: bootstraps === 1 ? SESSION_ID : '55555555-5555-4555-8555-555555555555',
            secret: (bootstraps === 1 ? 'A' : 'B').repeat(43),
            endpoint: `ws://127.0.0.1:32123/session/${bootstraps === 1 ? SESSION_ID : '55555555-5555-4555-8555-555555555555'}`,
          }),
        });
      },
    };
    const factory: LiveLocalWebSocketFactory = (_endpoint, protocol) => {
      assert.equal(protocol, LIVE_LOCAL_WEB_SOCKET_PROTOCOL);
      const socket = new FakeSocket(mode);
      sockets.push(socket);
      return socket;
    };
    return { client: new LiveLocalOverlookClient(native, factory), sockets, getBootstraps: () => bootstraps };
  }

  const input = (repository = new MemoryRepository()) => ({
    pairingId: PAIRING_ID,
    operation: 'move' as const,
    operationId: OPERATION_ID,
    remoteSessionId: REMOTE_SESSION_ID,
    review: { operation: 'move' as const },
    repository,
  });

  test('redeems in the first frame, opens reviewed scope, transfers, heartbeats, and cancels', async () => {
    const { client, sockets } = harness();
    const result = await client.connect(input());
    assert.equal(result.state, 'connected');
    if (result.state !== 'connected') return;
    const controls = sockets[0]?.sent.filter((value): value is string => typeof value === 'string').map((value) => JSON.parse(value));
    assert.equal(controls?.[0]?.type, 'redeem');
    assert.equal(controls?.[0]?.secret, 'A'.repeat(43));
    assert.equal(controls?.[1]?.type, 'open');
    await result.store.put('outbound/object.bin', new Uint8Array([9, 8, 7]));
    await result.session.commit();
    await result.session.heartbeat();
    result.session.cancel();
    await result.session.waitForClose();
  });

  test('keeps a connected session retryable when sending the cancel frame fails', async () => {
    const { client, sockets } = harness();
    const result = await client.connect(input());
    assert.equal(result.state, 'connected');
    if (result.state !== 'connected') return;
    const socket = sockets[0];
    assert.ok(socket);
    socket.failNextSend = true;

    assert.throws(() => result.session.cancel(), /socket send failed/u);
    assert.equal(result.session.phase, 'connected');

    result.session.cancel();
    await result.session.waitForClose();
    const controls = socket.sent.filter((value): value is string => typeof value === 'string').map((value) => JSON.parse(value));
    assert.equal(controls.filter((value) => value.type === 'cancel').length, 1);
  });

  test('fresh reconnect reboots authority instead of persisting or replaying a capability', async () => {
    const { client, sockets, getBootstraps } = harness();
    const first = await client.connect(input());
    assert.equal(first.state, 'connected');
    if (first.state !== 'connected') return;
    first.session.close();
    await first.session.waitForClose();
    const second = await client.connect(input());
    assert.equal(second.state, 'connected');
    assert.equal(getBootstraps(), 2);
    assert.equal(JSON.parse(sockets[1]?.sent[0] as string).secret, 'B'.repeat(43));
    if (second.state === 'connected') second.session.close();
  });

  test('maps origin and capability rejection to non-retryable fail-closed states', async () => {
    for (const [mode, state] of [
      ['reject-origin', 'origin-rejected'],
      ['reject-capability', 'capability-rejected'],
    ] as const) {
      const { client } = harness(mode);
      await assert.rejects(client.connect(input()), (error: unknown) => {
        return error instanceof LiveLocalSessionError && error.state === state && !error.retryable;
      });
    }
  });

  test('preserves explicit native unavailability and treats a peer close as retryable', async () => {
    const unavailable = new LiveLocalOverlookClient({
      bootstrap: () => Promise.resolve({ schemaVersion: 1, state: 'unavailable', retryable: false }),
    });
    assert.deepEqual(await unavailable.connect(input()), { state: 'unavailable', retryable: false });

    const states: LiveLocalSessionState[] = [];
    const { client, sockets } = harness();
    const result = await client.connect({ ...input(), stateChanged: (state) => states.push(state) });
    assert.equal(result.state, 'connected');
    if (result.state !== 'connected') return;
    sockets[0]?.close(1000);
    await result.session.waitForClose();
    assert.deepEqual(states.at(-1), { state: 'closed', operationId: OPERATION_ID, retryable: true });
  });
});
