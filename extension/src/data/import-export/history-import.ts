import { decryptAesGcm } from '../crypto/webcrypto.js';
import { deriveEncryptionKey } from '../crypto/password-wrap.js';
import type { DurableHistoryPayloadV1, RecoverableDataStatus } from '../types.js';
import { fromBase64, parseExportFile } from './encrypted-file-format.js';
import { parsePlainRecordsExport } from './plain-records-format.js';

export interface HistoryImportEntry {
  readonly uuid: string;
  readonly payload: DurableHistoryPayloadV1;
}

export interface HistoryImportResult {
  readonly status: RecoverableDataStatus;
  readonly entries: readonly HistoryImportEntry[];
  readonly skipped: readonly string[];
  readonly plaintext: boolean;
}

export async function importEncryptedHistory(fileContent: string, password: string): Promise<HistoryImportResult> {
  const plain = tryImportPlainHistory(fileContent);
  if (plain) return { ...plain, plaintext: true };

  const fail = (message: string): HistoryImportResult => ({
    status: { ok: false, code: 'decryption-failed', message },
    entries: [],
    skipped: [],
    plaintext: false,
  });

  let envelope;
  try {
    envelope = parseExportFile(fileContent);
  } catch {
    return fail('Invalid export file format.');
  }

  if (envelope.header.payloadType !== 'history' && envelope.header.payloadType !== 'mixed') {
    return fail(`Unexpected payload type: ${envelope.header.payloadType}.`);
  }

  try {
    const salt = fromBase64(envelope.header.salt);
    const iv = fromBase64(envelope.header.iv);
    const ciphertext = fromBase64(envelope.payload);

    const encryptionKey = await deriveEncryptionKey(password, {
      salt,
      iterations: envelope.header.iterations,
    });

    const plaintext = await decryptAesGcm(encryptionKey, ciphertext, iv);
    const decoded = new TextDecoder().decode(plaintext);
    const parsed: unknown = JSON.parse(decoded);

    return { ...parseHistoryEntries(parsed), plaintext: false };
  } catch {
    return fail('Decryption failed. Wrong password or corrupted file.');
  }
}

function tryImportPlainHistory(fileContent: string): Omit<HistoryImportResult, 'plaintext'> | null {
  try {
    const envelope = parsePlainRecordsExport(fileContent);
    if (envelope.payloadType !== 'history') return null;
    return parseHistoryEntries(envelope.entries);
  } catch {
    return null;
  }
}

function parseHistoryEntries(parsed: unknown): Omit<HistoryImportResult, 'plaintext'> {
  const fail = (message: string): Omit<HistoryImportResult, 'plaintext'> => ({
    status: { ok: false, code: 'decryption-failed', message },
    entries: [],
    skipped: [],
  });

  if (!Array.isArray(parsed)) {
    return fail('History payload is not an array.');
  }

  const entries: HistoryImportEntry[] = [];
  const skipped: string[] = [];

  for (const item of parsed) {
    if (isValidHistoryEntry(item)) {
      entries.push(item);
    } else {
      skipped.push(typeof item === 'object' && item !== null && 'uuid' in item ? String(item.uuid) : 'unknown');
    }
  }

  return {
    status: {
      ok: true,
      code: 'ok',
      message: `Imported ${entries.length} record(s)${skipped.length ? `, skipped ${skipped.length}` : ''}.`,
    },
    entries,
    skipped,
  };
}

const VALID_CAPTURE_STATUSES = new Set(['remote-only', 'downloaded', 'failed']);

function isValidHistoryEntry(value: unknown): value is HistoryImportEntry {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  if (typeof obj.uuid !== 'string') return false;
  if (typeof obj.payload !== 'object' || obj.payload === null) return false;
  const payload = obj.payload as Record<string, unknown>;
  return (
    typeof payload.url === 'string' && typeof payload.capturedAt === 'string' && VALID_CAPTURE_STATUSES.has(payload.captureStatus as string)
  );
}
