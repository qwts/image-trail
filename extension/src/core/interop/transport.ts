import * as v from 'valibot';

import { interopUuidSchema, sha256Schema } from './contract.js';

export const INTEROP_CHUNK_BYTES = 4 * 1024 * 1024;
export const INTEROP_CONTROL_FRAME_BYTES = 64 * 1024;
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const safePathSchema = v.pipe(
  v.string(),
  v.minLength(1),
  v.check(
    (path) =>
      !path.startsWith('/') &&
      !path.includes('\\') &&
      !path.includes(':') &&
      path.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..'),
    'Interop paths must be provider-relative and traversal-free.',
  ),
);

export type InteropTransportProvider = 'pcloud' | 'google-drive' | 'icloud';
export type InteropTransportFailure =
  'offline' | 'auth-expired' | 'quota' | 'provider-unavailable' | 'partial-failure' | 'not-found' | 'corrupt' | 'unsupported';

export class InteropTransportError extends Error {
  constructor(
    message: string,
    readonly code: InteropTransportFailure,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'InteropTransportError';
  }
}

export interface InteropTransportScope {
  readonly pairingId: string;
  readonly transferId: string;
}

export interface InteropObjectEntry {
  readonly path: string;
  readonly bytes: number;
}

export interface InteropObjectPage {
  readonly entries: readonly InteropObjectEntry[];
  readonly nextCursor: string | null;
}

/** Provider-specific authority over one dedicated interoperability root. */
export interface InteropObjectStore {
  readonly provider: InteropTransportProvider;
  authState(): Promise<'connected' | 'not-connected' | 'expired'>;
  put(path: string, bytes: Uint8Array): Promise<{ readonly bytes: number }>;
  get(path: string): Promise<Uint8Array>;
  list(prefix: string, cursor: string | null): Promise<InteropObjectPage>;
  delete(path: string): Promise<void>;
  quota(): Promise<{ readonly usedBytes: number; readonly totalBytes: number | null }>;
  verify(path: string): Promise<{ readonly sha256: string; readonly bytes: number }>;
}

const manifestSchema = v.strictObject({
  schemaVersion: v.literal(1),
  pairingId: interopUuidSchema,
  transferId: interopUuidSchema,
  path: safePathSchema,
  bytes: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(Number.MAX_SAFE_INTEGER)),
  sha256: sha256Schema,
  chunks: v.array(
    v.strictObject({
      index: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(Number.MAX_SAFE_INTEGER)),
      bytes: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(INTEROP_CHUNK_BYTES)),
      sha256: sha256Schema,
    }),
  ),
});

type InteropTransportManifest = v.InferOutput<typeof manifestSchema>;

function hex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function sha256(bytes: Uint8Array): Promise<string> {
  const input = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', input)));
}

export function assertSafeInteropPath(path: string): string {
  return v.parse(safePathSchema, path);
}

function scopePath(scope: InteropTransportScope): string {
  return `pairings/${v.parse(interopUuidSchema, scope.pairingId)}/transfers/${v.parse(interopUuidSchema, scope.transferId)}`;
}

function objectRoot(scope: InteropTransportScope): string {
  return `${scopePath(scope)}/objects`;
}

function objectKey(scope: InteropTransportScope, path: string): string {
  const safe = assertSafeInteropPath(path);
  return `${objectRoot(scope)}/${safe}`;
}

function chunkKey(scope: InteropTransportScope, path: string, index: number): string {
  return `${objectKey(scope, path)}.chunks/${String(index).padStart(8, '0')}.bin`;
}

function manifestKey(scope: InteropTransportScope, path: string): string {
  return `${objectKey(scope, path)}.manifest.json`;
}

async function verified(
  store: InteropObjectStore,
  path: string,
  expected: { readonly sha256: string; readonly bytes: number },
): Promise<boolean> {
  try {
    const actual = await store.verify(path);
    return actual.bytes === expected.bytes && actual.sha256.toLowerCase() === expected.sha256;
  } catch (error) {
    if (error instanceof InteropTransportError && error.code === 'not-found') return false;
    throw error;
  }
}

/**
 * Provider-neutral encrypted-file transfer. Chunks are immutable verified
 * objects, so retries resume by checksum instead of trusting local counters.
 */
export class EncryptedInteropTransport {
  constructor(
    private readonly store: InteropObjectStore,
    private readonly chunkBytes = INTEROP_CHUNK_BYTES,
  ) {
    if (!Number.isSafeInteger(chunkBytes) || chunkBytes < 1 || chunkBytes > INTEROP_CHUNK_BYTES) {
      throw new InteropTransportError('Invalid interoperability chunk size.', 'corrupt', false);
    }
  }

  async upload(
    scope: InteropTransportScope,
    pathInput: string,
    ciphertext: Uint8Array,
    onProgress: (progress: { readonly completedChunks: number; readonly totalChunks: number }) => void = () => undefined,
  ): Promise<{ readonly sha256: string; readonly bytes: number; readonly resumedChunks: number }> {
    const path = assertSafeInteropPath(pathInput);
    const chunks: Array<{ index: number; bytes: number; sha256: string }> = [];
    const totalChunks = Math.max(1, Math.ceil(ciphertext.byteLength / this.chunkBytes));
    let resumedChunks = 0;
    for (let index = 0; index < totalChunks; index += 1) {
      const start = index * this.chunkBytes;
      const chunk = ciphertext.slice(start, Math.min(ciphertext.byteLength, start + this.chunkBytes));
      const digest = await sha256(chunk);
      const expected = { bytes: chunk.byteLength, sha256: digest };
      const key = chunkKey(scope, path, index);
      if (await verified(this.store, key, expected)) {
        resumedChunks += 1;
      } else {
        const stored = await this.store.put(key, chunk);
        if (stored.bytes !== chunk.byteLength || !(await verified(this.store, key, expected))) {
          throw new InteropTransportError(`Provider did not verify chunk ${String(index)}.`, 'partial-failure', true);
        }
      }
      chunks.push({ index, ...expected });
      onProgress({ completedChunks: index + 1, totalChunks });
    }
    const manifest: InteropTransportManifest = {
      schemaVersion: 1,
      pairingId: scope.pairingId,
      transferId: scope.transferId,
      path,
      bytes: ciphertext.byteLength,
      sha256: await sha256(ciphertext),
      chunks,
    };
    const manifestBytes = encoder.encode(JSON.stringify(manifest));
    const key = manifestKey(scope, path);
    await this.store.put(key, manifestBytes);
    if (!(await verified(this.store, key, { bytes: manifestBytes.byteLength, sha256: await sha256(manifestBytes) }))) {
      throw new InteropTransportError('Provider did not verify the transfer manifest.', 'partial-failure', true);
    }
    return { sha256: manifest.sha256, bytes: manifest.bytes, resumedChunks };
  }

  async download(scope: InteropTransportScope, pathInput: string): Promise<Uint8Array> {
    const path = assertSafeInteropPath(pathInput);
    let manifest: InteropTransportManifest;
    try {
      manifest = v.parse(manifestSchema, JSON.parse(decoder.decode(await this.store.get(manifestKey(scope, path)))) as unknown);
    } catch (error) {
      if (error instanceof InteropTransportError) throw error;
      throw new InteropTransportError('Interop transfer manifest is invalid.', 'corrupt', false);
    }
    if (manifest.pairingId !== scope.pairingId || manifest.transferId !== scope.transferId || manifest.path !== path) {
      throw new InteropTransportError('Interop transfer manifest crossed its reviewed scope.', 'corrupt', false);
    }
    const output = new Uint8Array(manifest.bytes);
    let offset = 0;
    for (const chunk of manifest.chunks) {
      const bytes = await this.store.get(chunkKey(scope, path, chunk.index));
      if (bytes.byteLength !== chunk.bytes || (await sha256(bytes)) !== chunk.sha256 || offset + bytes.byteLength > output.byteLength) {
        throw new InteropTransportError(`Interop chunk ${String(chunk.index)} failed verification.`, 'corrupt', false);
      }
      output.set(bytes, offset);
      offset += bytes.byteLength;
    }
    if (offset !== manifest.bytes || (await sha256(output)) !== manifest.sha256) {
      throw new InteropTransportError('Interop ciphertext failed whole-file verification.', 'corrupt', false);
    }
    return output;
  }

  list(scope: InteropTransportScope, cursor: string | null = null): Promise<InteropObjectPage> {
    return this.store.list(objectRoot(scope), cursor);
  }

  /** Lists logical encrypted objects, hiding provider manifests and chunks. */
  async listPaths(scope: InteropTransportScope, prefixInput: string): Promise<readonly string[]> {
    const prefix = assertSafeInteropPath(prefixInput);
    const root = `${objectRoot(scope)}/`;
    const providerPrefix = `${root}${prefix}`;
    const paths = new Set<string>();
    const cursors = new Set<string>();
    let cursor: string | null = null;
    do {
      const page = await this.store.list(providerPrefix, cursor);
      for (const entry of page.entries) {
        if (!entry.path.startsWith(root) || !entry.path.endsWith('.manifest.json')) continue;
        const logical = entry.path.slice(root.length, -'.manifest.json'.length);
        if (logical.includes('.chunks/') || !logical.startsWith(prefix)) continue;
        paths.add(assertSafeInteropPath(logical));
      }
      cursor = page.nextCursor;
      if (cursor !== null) {
        if (cursors.has(cursor)) throw new InteropTransportError('Provider repeated an interoperability list cursor.', 'corrupt', false);
        cursors.add(cursor);
      }
    } while (cursor !== null);
    return [...paths].sort((left, right) => left.localeCompare(right));
  }

  quota(): Promise<{ readonly usedBytes: number; readonly totalBytes: number | null }> {
    return this.store.quota();
  }
}

export function assertBoundedControlFrame(value: unknown): void {
  const record = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  if (
    record === null ||
    'bytes' in record ||
    'ciphertext' in record ||
    encoder.encode(JSON.stringify(value)).byteLength > INTEROP_CONTROL_FRAME_BYTES
  ) {
    throw new InteropTransportError('Native control frame is invalid or contains payload bytes.', 'corrupt', false);
  }
}
