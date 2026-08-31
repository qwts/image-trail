import {
  InteropTransportError,
  assertSafeInteropPath,
  sha256,
  type InteropObjectEntry,
  type InteropObjectPage,
  type InteropObjectStore,
} from '../core/interop/transport.js';
import {
  LIVE_LOCAL_MAX_OBJECT_BYTES,
  LIVE_LOCAL_OBJECT_CHUNK_BYTES,
  LIVE_LOCAL_OBJECT_HEADER_BYTES,
  decodeLiveLocalObjectChunk,
  encodeLiveLocalObjectChunk,
  type LiveLocalCapability,
  type LiveLocalObjectHeader,
} from './interop-live-local-protocol.js';

export interface LiveLocalIncomingObjectRepository {
  put(path: string, bytes: Uint8Array, sha256: string): Promise<void>;
  get(path: string): Promise<Uint8Array>;
  list(prefix: string, cursor: string | null): Promise<InteropObjectPage>;
  delete(path: string): Promise<void>;
  quota(): Promise<{ readonly usedBytes: number; readonly totalBytes: number | null }>;
  verify(path: string): Promise<{ readonly sha256: string; readonly bytes: number }>;
}

export interface LiveLocalObjectChannel {
  sendBinary(bytes: Uint8Array, signal?: AbortSignal): Promise<void>;
  sendControl(value: unknown): void;
}

export interface LiveLocalObjectProgress {
  readonly path: string;
  readonly sentBytes: number;
  readonly acknowledgedBytes: number;
  readonly totalBytes: number;
}

interface PendingAcknowledgement {
  readonly sha256: string;
  readonly resolve: () => void;
  readonly reject: (error: Error) => void;
}

interface IncomingObject {
  readonly header: LiveLocalObjectHeader;
  readonly chunks: Map<number, Uint8Array>;
}

interface WindowWaiter {
  readonly bytes: number;
  readonly signal: AbortSignal | undefined;
  readonly resolve: (release: () => void) => void;
  readonly reject: (error: Error) => void;
}

function interrupted(message: string): InteropTransportError {
  return new InteropTransportError(message, 'offline', true);
}

class AcknowledgementWindow {
  #inFlight = 0;
  readonly #waiting: WindowWaiter[] = [];

  constructor(private readonly maximum: number) {}

  reserve(bytes: number, signal?: AbortSignal): Promise<() => void> {
    if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > this.maximum) {
      throw new InteropTransportError('Live local object exceeds its acknowledgement window.', 'partial-failure', true);
    }
    if (signal?.aborted === true) return Promise.reject(interrupted('Live local transfer was cancelled before it entered the window.'));
    return new Promise<() => void>((resolve, reject) => {
      const waiter = { bytes, signal, resolve, reject };
      this.#waiting.push(waiter);
      signal?.addEventListener('abort', () => this.abort(waiter), { once: true });
      this.drain();
    });
  }

  close(error: Error): void {
    for (const waiter of this.#waiting.splice(0)) waiter.reject(error);
  }

  private abort(waiter: WindowWaiter): void {
    const index = this.#waiting.indexOf(waiter);
    if (index < 0) return;
    this.#waiting.splice(index, 1);
    waiter.reject(interrupted('Live local transfer was cancelled while waiting for acknowledgement capacity.'));
  }

  private drain(): void {
    while (this.#waiting.length > 0) {
      const next = this.#waiting[0] as WindowWaiter;
      if (next.signal?.aborted === true) {
        this.#waiting.shift();
        next.reject(interrupted('Live local transfer was cancelled while waiting for acknowledgement capacity.'));
        continue;
      }
      if (this.#inFlight + next.bytes > this.maximum) return;
      this.#waiting.shift();
      this.#inFlight += next.bytes;
      let released = false;
      next.resolve(() => {
        if (released) return;
        released = true;
        this.#inFlight -= next.bytes;
        this.drain();
      });
    }
  }
}

/** Session-scoped encrypted object adapter for Overlook's live transport. It
 * acknowledges incoming objects only after the injected repository durably
 * stores the complete verified ciphertext. */
export class LiveLocalOverlookObjectStore implements InteropObjectStore {
  readonly provider = 'local-overlook' as const;
  readonly #window: AcknowledgementWindow;
  readonly #pending = new Map<string, PendingAcknowledgement>();
  readonly #incoming = new Map<string, IncomingObject>();
  readonly #remote = new Map<string, { readonly sha256: string; readonly bytes: Uint8Array }>();
  #incomingBytes = 0;
  #closed = false;

  constructor(
    private readonly capability: Pick<LiveLocalCapability, 'maxCiphertextFrameBytes' | 'maxInFlightBytes'>,
    private readonly channel: LiveLocalObjectChannel,
    private readonly repository: LiveLocalIncomingObjectRepository,
    private readonly progress: (progress: LiveLocalObjectProgress) => void = () => undefined,
  ) {
    this.#window = new AcknowledgementWindow(capability.maxInFlightBytes);
  }

  get maxInFlightBytes(): number {
    return this.capability.maxInFlightBytes;
  }

  authState(): Promise<'connected' | 'not-connected'> {
    return Promise.resolve(this.#closed ? 'not-connected' : 'connected');
  }

  async put(pathInput: string, bytesInput: Uint8Array, signal?: AbortSignal): Promise<{ readonly bytes: number }> {
    this.assertOpen();
    const path = assertSafeInteropPath(pathInput);
    const bytes = bytesInput.slice();
    if (bytes.byteLength > LIVE_LOCAL_MAX_OBJECT_BYTES || bytes.byteLength > this.capability.maxInFlightBytes) {
      bytes.fill(0);
      throw new InteropTransportError('Live local encrypted object exceeds its negotiated bound.', 'partial-failure', true);
    }
    if (this.#pending.has(path)) {
      bytes.fill(0);
      throw new InteropTransportError('Live local object already awaits acknowledgement.', 'partial-failure', true);
    }
    let release: (() => void) | undefined;
    let abortAcknowledgement: (() => void) | undefined;
    let pending = false;
    try {
      release = await this.#window.reserve(bytes.byteLength, signal);
      const objectSha256 = await sha256(bytes);
      const acknowledgement = new Promise<void>((resolve, reject) => {
        this.#pending.set(path, { sha256: objectSha256, resolve, reject });
      });
      void acknowledgement.catch(() => undefined);
      abortAcknowledgement = () => {
        this.#pending.get(path)?.reject(interrupted('Live local transfer was cancelled while awaiting durable acknowledgement.'));
      };
      signal?.addEventListener('abort', abortAcknowledgement, { once: true });
      if (signal?.aborted === true) abortAcknowledgement();
      pending = true;
      let sentBytes = 0;
      const negotiatedChunkBytes = Math.min(
        LIVE_LOCAL_OBJECT_CHUNK_BYTES,
        this.capability.maxCiphertextFrameBytes - LIVE_LOCAL_OBJECT_HEADER_BYTES - 4,
      );
      if (negotiatedChunkBytes < 1) {
        throw new InteropTransportError('Live local ciphertext frame cannot contain an object payload.', 'partial-failure', false);
      }
      const chunkCount = Math.max(1, Math.ceil(bytes.byteLength / negotiatedChunkBytes));
      for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex += 1) {
        this.assertOpen();
        if (signal?.aborted === true) throw interrupted('Live local transfer was cancelled.');
        const payload = bytes.subarray(
          chunkIndex * negotiatedChunkBytes,
          Math.min(bytes.byteLength, (chunkIndex + 1) * negotiatedChunkBytes),
        );
        const frame = await encodeLiveLocalObjectChunk(
          { path, objectBytes: bytes.byteLength, objectSha256, chunkIndex, chunkCount },
          payload,
        );
        if (frame.byteLength > this.capability.maxCiphertextFrameBytes) {
          frame.fill(0);
          throw new InteropTransportError('Live local ciphertext frame exceeds its negotiated bound.', 'partial-failure', true);
        }
        await this.channel.sendBinary(frame, signal);
        frame.fill(0);
        sentBytes += payload.byteLength;
        this.progress({ path, sentBytes, acknowledgedBytes: 0, totalBytes: bytes.byteLength });
      }
      await acknowledgement;
      this.#remote.get(path)?.bytes.fill(0);
      this.#remote.set(path, { sha256: objectSha256, bytes: bytes.slice() });
      this.progress({ path, sentBytes, acknowledgedBytes: bytes.byteLength, totalBytes: bytes.byteLength });
      return { bytes: bytes.byteLength };
    } catch (error) {
      if (pending) this.#pending.delete(path);
      throw error;
    } finally {
      if (abortAcknowledgement !== undefined) signal?.removeEventListener('abort', abortAcknowledgement);
      release?.();
      bytes.fill(0);
    }
  }

  get(pathInput: string): Promise<Uint8Array> {
    const path = assertSafeInteropPath(pathInput);
    const remote = this.#remote.get(path);
    return remote === undefined ? this.repository.get(path) : Promise.resolve(remote.bytes.slice());
  }

  async list(prefixInput: string, cursor: string | null): Promise<InteropObjectPage> {
    const prefix = assertSafeInteropPath(prefixInput);
    const page = await this.repository.list(prefix, cursor);
    if (cursor !== null) return page;
    const entries = new Map<string, InteropObjectEntry>(page.entries.map((entry) => [entry.path, entry]));
    for (const [path, metadata] of this.#remote) {
      if (path.startsWith(prefix)) entries.set(path, { path, bytes: metadata.bytes.byteLength });
    }
    return { entries: [...entries.values()].sort((left, right) => left.path.localeCompare(right.path)), nextCursor: page.nextCursor };
  }

  async delete(pathInput: string): Promise<void> {
    const path = assertSafeInteropPath(pathInput);
    this.#remote.get(path)?.bytes.fill(0);
    this.#remote.delete(path);
    await this.repository.delete(path);
  }

  async quota(): Promise<{ readonly usedBytes: number; readonly totalBytes: number | null }> {
    const local = await this.repository.quota();
    const remoteBytes = [...this.#remote.values()].reduce((total, entry) => total + entry.bytes.byteLength, 0);
    return { usedBytes: local.usedBytes + remoteBytes, totalBytes: null };
  }

  async verify(pathInput: string): Promise<{ readonly sha256: string; readonly bytes: number }> {
    const path = assertSafeInteropPath(pathInput);
    const remote = this.#remote.get(path);
    return remote === undefined ? this.repository.verify(path) : { sha256: remote.sha256, bytes: remote.bytes.byteLength };
  }

  acknowledge(pathInput: string, digest: string): void {
    const path = assertSafeInteropPath(pathInput);
    const pending = this.#pending.get(path);
    if (pending === undefined || pending.sha256 !== digest) {
      throw new InteropTransportError('Live local acknowledgement did not match an outstanding object.', 'corrupt', false);
    }
    this.#pending.delete(path);
    pending.resolve();
  }

  async receive(frame: Uint8Array): Promise<void> {
    this.assertOpen();
    if (frame.byteLength > this.capability.maxCiphertextFrameBytes) {
      throw new InteropTransportError('Live local incoming frame exceeds its negotiated bound.', 'partial-failure', false);
    }
    const { header, payload } = await decodeLiveLocalObjectChunk(frame);
    try {
      if (header.objectBytes > this.capability.maxInFlightBytes) {
        throw new InteropTransportError('Live local incoming object exceeds its session budget.', 'partial-failure', true);
      }
      const durable = await this.findDurable(header.path);
      if (durable !== null) {
        if (durable.sha256 !== header.objectSha256 || durable.bytes !== header.objectBytes) {
          throw new InteropTransportError('Live local object identity was replayed with different content.', 'corrupt', false);
        }
        this.channel.sendControl({ schemaVersion: 1, type: 'object-ack', path: header.path, sha256: header.objectSha256 });
        return;
      }
      const existing = this.#incoming.get(header.path);
      if (
        existing !== undefined &&
        (existing.header.objectBytes !== header.objectBytes ||
          existing.header.objectSha256 !== header.objectSha256 ||
          existing.header.chunkCount !== header.chunkCount)
      ) {
        throw new InteropTransportError('Live local object identity was replayed with different content.', 'corrupt', false);
      }
      const incoming = existing ?? { header, chunks: new Map<number, Uint8Array>() };
      const prior = incoming.chunks.get(header.chunkIndex);
      if (prior !== undefined && (prior.byteLength !== payload.byteLength || prior.some((byte, index) => byte !== payload[index]))) {
        throw new InteropTransportError('Live local chunk identity was replayed with different content.', 'corrupt', false);
      }
      if (prior === undefined) {
        if (this.#incomingBytes + payload.byteLength > this.capability.maxInFlightBytes) {
          throw new InteropTransportError('Live local in-flight ciphertext exceeded its session budget.', 'partial-failure', true);
        }
        incoming.chunks.set(header.chunkIndex, payload.slice());
        this.#incomingBytes += payload.byteLength;
      }
      this.#incoming.set(header.path, incoming);
      if (incoming.chunks.size !== header.chunkCount) return;
      const chunks = [...incoming.chunks.entries()].sort(([left], [right]) => left - right).map(([, chunk]) => chunk);
      if (chunks.reduce((total, chunk) => total + chunk.byteLength, 0) !== header.objectBytes) {
        throw new InteropTransportError('Live local encrypted object chunks do not match its declared size.', 'corrupt', false);
      }
      const object = new Uint8Array(header.objectBytes);
      let offset = 0;
      for (const chunk of chunks) {
        object.set(chunk, offset);
        offset += chunk.byteLength;
      }
      if (offset !== header.objectBytes || (await sha256(object)) !== header.objectSha256) {
        object.fill(0);
        throw new InteropTransportError('Live local encrypted object failed whole-object verification.', 'corrupt', false);
      }
      try {
        await this.repository.put(header.path, object, header.objectSha256);
      } finally {
        object.fill(0);
      }
      this.releaseIncoming(header.path, chunks);
      this.channel.sendControl({ schemaVersion: 1, type: 'object-ack', path: header.path, sha256: header.objectSha256 });
    } finally {
      payload.fill(0);
    }
  }

  close(error: Error = interrupted('Live local peer disappeared before durable acknowledgement.')): void {
    if (this.#closed) return;
    this.#closed = true;
    for (const pending of this.#pending.values()) pending.reject(error);
    this.#pending.clear();
    this.#window.close(error);
    for (const [path, incoming] of this.#incoming) this.releaseIncoming(path, [...incoming.chunks.values()]);
    for (const remote of this.#remote.values()) remote.bytes.fill(0);
    this.#remote.clear();
  }

  private releaseIncoming(path: string, chunks: readonly Uint8Array[]): void {
    this.#incoming.delete(path);
    for (const chunk of chunks) {
      this.#incomingBytes -= chunk.byteLength;
      chunk.fill(0);
    }
  }

  private async findDurable(path: string): Promise<{ readonly sha256: string; readonly bytes: number } | null> {
    try {
      return await this.repository.verify(path);
    } catch (error) {
      if (error instanceof InteropTransportError && error.code === 'not-found') return null;
      throw error;
    }
  }

  private assertOpen(): void {
    if (this.#closed) throw interrupted('Live local session is closed.');
  }
}
