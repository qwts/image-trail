import { restoreActiveBlobKey } from '../data/crypto/blob-keyring.js';
import { InteropRecordExportStore } from '../data/interop/record-export.js';

/**
 * Same-machine transfer to Overlook: POST one decrypted-then-resealed original
 * to the loopback inbox Overlook opens from Settings. The sync code pasted
 * once by the user carries the port and the 32-byte secret; auth token and
 * payload key are HKDF-derived from it exactly as Overlook derives them.
 */

const SYNC_STRING_PREFIX = 'OV1.';
const SECRET_BYTES = 32;
const AUTH_INFO = 'overlook-transfer-v1/auth';
const KEY_INFO = 'overlook-transfer-v1/key';
export const LOCAL_TRANSFER_STORAGE_KEY = 'imageTrail.localTransfer.sync';

export interface LocalTransferTarget {
  readonly port: number;
  readonly secret: Uint8Array;
}

function base64UrlDecode(value: string): Uint8Array {
  const padded = value.replace(/-/gu, '+').replace(/_/gu, '/');
  const raw = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

function base64UrlEncode(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/gu, '-')
    .replace(/\//gu, '_')
    .replace(/=+$/u, '');
}

export function parseLocalTransferSyncString(value: string): LocalTransferTarget {
  const trimmed = value.trim();
  if (!trimmed.startsWith(SYNC_STRING_PREFIX)) throw new Error('Unrecognized sync code.');
  const packed = base64UrlDecode(trimmed.slice(SYNC_STRING_PREFIX.length));
  if (packed.byteLength !== 2 + SECRET_BYTES) throw new Error('Sync code is incomplete.');
  const port = ((packed[0] ?? 0) << 8) | (packed[1] ?? 0);
  if (port < 1) throw new Error('Sync code port is invalid.');
  return { port, secret: packed.slice(2) };
}

async function hkdf(secret: Uint8Array, info: string, crypto: Crypto): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', secret as BufferSource, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: new TextEncoder().encode(info) },
    key,
    256,
  );
  return new Uint8Array(bits);
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export interface LocalTransferStorage {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(key: string): Promise<void>;
}

export async function saveLocalTransferTarget(storage: LocalTransferStorage, syncString: string): Promise<void> {
  const target = parseLocalTransferSyncString(syncString);
  await storage.set({
    [LOCAL_TRANSFER_STORAGE_KEY]: { schemaVersion: 1, port: target.port, secret: base64UrlEncode(target.secret) },
  });
}

export async function loadLocalTransferTarget(storage: LocalTransferStorage): Promise<LocalTransferTarget | null> {
  const values = await storage.get(LOCAL_TRANSFER_STORAGE_KEY);
  const stored = values[LOCAL_TRANSFER_STORAGE_KEY] as { schemaVersion?: unknown; port?: unknown; secret?: unknown } | undefined;
  if (!stored || stored.schemaVersion !== 1 || typeof stored.port !== 'number' || typeof stored.secret !== 'string') return null;
  const secret = base64UrlDecode(stored.secret);
  if (secret.byteLength !== SECRET_BYTES || !Number.isInteger(stored.port) || stored.port < 1 || stored.port > 65535) return null;
  return { port: stored.port, secret };
}

export interface LocalTransferResult {
  readonly ok: boolean;
  readonly message: string;
}

export interface LocalTransferDependencies {
  readonly getDb: () => Promise<IDBDatabase | null>;
  readonly fetchImpl?: typeof fetch;
  readonly cryptoImpl?: Crypto;
}

export async function transferRecordLocally(
  target: LocalTransferTarget,
  recordId: string,
  dependencies: LocalTransferDependencies,
): Promise<LocalTransferResult> {
  const cryptoImpl = dependencies.cryptoImpl ?? crypto;
  const fetchImpl = dependencies.fetchImpl ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));
  const db = await dependencies.getDb();
  if (!db) return { ok: false, message: 'The library is unavailable.' };
  const activeBlobKey = await restoreActiveBlobKey();
  if (!activeBlobKey) return { ok: false, message: 'Unlock the workspace before transferring.' };
  const review = await new InteropRecordExportStore(db).review([recordId], activeBlobKey, { includeOriginalBytes: true });
  const record = review.records[0];
  const original = record?.original ?? null;
  if (!record || !original) return { ok: false, message: 'This pin has no stored original to transfer.' };
  try {
    const extensionByMime: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/gif': 'gif',
      'image/avif': 'avif',
      'video/mp4': 'mp4',
      'video/webm': 'webm',
    };
    const safeId = recordId.replace(/[^A-Za-z0-9]/gu, '').slice(0, 12) || 'transfer';
    const name = `image-trail-${safeId}.${extensionByMime[original.reference.mimeType] ?? 'bin'}`;
    const digest = new Uint8Array(await cryptoImpl.subtle.digest('SHA-256', original.bytes as BufferSource));
    const iv = cryptoImpl.getRandomValues(new Uint8Array(12));
    const payloadKey = await cryptoImpl.subtle.importKey(
      'raw',
      (await hkdf(target.secret, KEY_INFO, cryptoImpl)) as BufferSource,
      'AES-GCM',
      false,
      ['encrypt'],
    );
    const ciphertext = new Uint8Array(
      await cryptoImpl.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, payloadKey, original.bytes as BufferSource),
    );
    const authToken = hex(await hkdf(target.secret, AUTH_INFO, cryptoImpl));
    const meta = base64UrlEncode(new TextEncoder().encode(JSON.stringify({ name, iv: base64UrlEncode(iv), sha256: hex(digest) })));
    let response: Response;
    try {
      response = await fetchImpl(`http://127.0.0.1:${String(target.port)}/v1/transfer`, {
        method: 'POST',
        headers: { authorization: `Bearer ${authToken}`, 'x-transfer-meta': meta },
        body: ciphertext,
      });
    } catch {
      return { ok: false, message: 'Overlook is not listening. Enable Transfer & Sync in Overlook and try again.' };
    }
    if (response.status === 401) return { ok: false, message: 'The sync code is stale. Paste the current code from Overlook.' };
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      return { ok: false, message: body?.error ?? 'Overlook rejected the transfer.' };
    }
    return { ok: true, message: `Transferred ${name} to Overlook.` };
  } finally {
    original.bytes.fill(0);
  }
}
