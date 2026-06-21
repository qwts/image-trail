import { createAesGcmIv, decryptAesGcm, encryptAesGcm } from '../crypto/webcrypto.js';
import { createPasswordSalt, deriveEncryptionKey } from '../crypto/password-wrap.js';
import type { KeyKind, StoredKeyRecord } from '../crypto/types.js';
import type { RecoverableDataStatus } from '../types.js';
import { buildExportFileHeader, fromBase64, parseExportFile, serializeExportFile, toBase64 } from './encrypted-file-format.js';

type RecoverableKeyKind = Extract<KeyKind, 'blob' | 'download'>;
const KEY_BACKUP_ITERATIONS = 600_000;
const MIN_KEY_BACKUP_ITERATIONS = 100_000;

export interface KeyBackupExportResult {
  readonly status: RecoverableDataStatus;
  readonly fileContent?: string;
  readonly fileName?: string;
}

export interface KeyBackupImportResult {
  readonly status: RecoverableDataStatus;
  readonly record?: StoredKeyRecord<RecoverableKeyKind>;
}

interface KeyBackupPayload {
  readonly schemaVersion: 1;
  readonly record: StoredKeyRecord<RecoverableKeyKind>;
}

export async function exportStoredKeyBackupWithPassword(
  record: StoredKeyRecord<RecoverableKeyKind>,
  password: string,
  now = new Date().toISOString(),
): Promise<KeyBackupExportResult> {
  try {
    const portableRecord = stripRuntimeKey(record);
    const salt = createPasswordSalt();
    const iterations = KEY_BACKUP_ITERATIONS;
    const encryptionKey = await deriveEncryptionKey(password, { salt, iterations });
    const iv = createAesGcmIv();
    const plaintext = new TextEncoder().encode(JSON.stringify({ schemaVersion: 1, record: portableRecord } satisfies KeyBackupPayload));
    const ciphertext = await encryptAesGcm(encryptionKey, plaintext, iv);
    const fileContent = serializeExportFile({
      header: buildExportFileHeader({
        payloadType: 'keys',
        algorithm: 'AES-GCM',
        wrappingMode: 'password',
        keyKind: portableRecord.kind,
        keyReference: portableRecord.reference,
        salt,
        iv,
        iterations,
        recordCount: 1,
        now,
      }),
      payload: toBase64(ciphertext),
    });
    return {
      status: { ok: true, code: 'ok', message: `Exported key backup for ${portableRecord.reference}.` },
      fileContent,
      fileName: `image-trail-key-backup-${portableRecord.kind}-${now.slice(0, 10)}.json`,
    };
  } catch (cause) {
    return { status: { ok: false, code: 'encryption-failed', message: 'Failed to export key backup.', cause } };
  }
}

export async function importStoredKeyBackupWithPassword(fileContent: string, password: string): Promise<KeyBackupImportResult> {
  let envelope;
  try {
    envelope = parseExportFile(fileContent);
  } catch {
    return { status: { ok: false, code: 'decryption-failed', message: 'Invalid key backup file format.' } };
  }
  if (envelope.header.payloadType !== 'keys') {
    return { status: { ok: false, code: 'decryption-failed', message: `Unexpected payload type: ${envelope.header.payloadType}.` } };
  }
  if (envelope.header.iterations < MIN_KEY_BACKUP_ITERATIONS) {
    return { status: { ok: false, code: 'decryption-failed', message: 'Key backup has unsafe encryption parameters.' } };
  }

  try {
    const encryptionKey = await deriveEncryptionKey(password, {
      salt: fromBase64(envelope.header.salt),
      iterations: envelope.header.iterations,
    });
    const plaintext = await decryptAesGcm(encryptionKey, fromBase64(envelope.payload), fromBase64(envelope.header.iv));
    const parsed = JSON.parse(new TextDecoder().decode(plaintext)) as unknown;
    if (!isKeyBackupPayload(parsed)) {
      return { status: { ok: false, code: 'decryption-failed', message: 'Key backup payload is invalid.' } };
    }
    if (envelope.header.keyKind !== parsed.record.kind || envelope.header.keyReference !== parsed.record.reference) {
      return { status: { ok: false, code: 'decryption-failed', message: 'Key backup header does not match payload.' } };
    }
    return { status: { ok: true, code: 'ok', message: `Imported key backup for ${parsed.record.reference}.` }, record: parsed.record };
  } catch {
    return { status: { ok: false, code: 'decryption-failed', message: 'Key backup import failed. Wrong password or corrupted file.' } };
  }
}

function stripRuntimeKey<K extends RecoverableKeyKind>(record: StoredKeyRecord<K>): StoredKeyRecord<K> {
  const { key: _key, ...portable } = record;
  return portable;
}

function isKeyBackupPayload(value: unknown): value is KeyBackupPayload {
  if (!value || typeof value !== 'object') return false;
  const payload = value as { schemaVersion?: unknown; record?: unknown };
  return payload.schemaVersion === 1 && isRecoverableStoredKeyRecord(payload.record);
}

function isRecoverableStoredKeyRecord(value: unknown): value is StoredKeyRecord<RecoverableKeyKind> {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  if (record.kind !== 'blob' && record.kind !== 'download') return false;
  if (typeof record.uuid !== 'string' || typeof record.reference !== 'string') return false;
  if (record.reference !== `${record.kind}:${record.uuid}`) return false;
  if (typeof record.createdAt !== 'string' || typeof record.updatedAt !== 'string') return false;
  if (record.extractable !== false) return false;
  if (!record.wrapping || typeof record.wrapping !== 'object') return false;
  const wrapping = record.wrapping as Record<string, unknown>;
  return (
    wrapping.mode === 'password' &&
    wrapping.algorithm === 'AES-GCM' &&
    typeof wrapping.salt === 'string' &&
    typeof wrapping.iv === 'string' &&
    typeof wrapping.wrappedKey === 'string' &&
    typeof wrapping.iterations === 'number'
  );
}
