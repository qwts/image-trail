import * as v from 'valibot';
import { decryptAesGcm } from '../crypto/webcrypto.js';
import { deriveEncryptionKey } from '../crypto/password-wrap.js';
import type { DurableHistoryPayloadV1, RecoverableDataStatus } from '../types.js';
import { durableHistoryPayloadSchema } from '../types.schema.js';
import { fromBase64, parseExportFile } from './encrypted-file-format.js';
import { parsePlainRecordsExport } from './plain-records-format.js';
import { firstIssueReason } from './schema-issues.js';
import { createImportValidationReport, type ImportValidationReport } from './validation-report.js';

const historyImportEntrySchema = v.object({
  uuid: v.string(),
  payload: durableHistoryPayloadSchema,
});

export interface HistoryImportEntry {
  readonly uuid: string;
  readonly payload: DurableHistoryPayloadV1;
}

export interface HistoryImportResult {
  readonly status: RecoverableDataStatus;
  readonly entries: readonly HistoryImportEntry[];
  readonly skipped: readonly string[];
  readonly validationReport: ImportValidationReport;
  readonly plaintext: boolean;
}

export async function importEncryptedHistory(fileContent: string, password: string): Promise<HistoryImportResult> {
  const plain = tryImportPlainHistory(fileContent);
  if (plain) return { ...plain, plaintext: true };

  const fail = (message: string): HistoryImportResult => ({
    status: { ok: false, code: 'decryption-failed', message },
    entries: [],
    skipped: [],
    validationReport: createImportValidationReport([]),
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
    validationReport: createImportValidationReport([]),
  });

  if (!Array.isArray(parsed)) {
    return fail('History payload is not an array.');
  }

  const entries: HistoryImportEntry[] = [];
  const skipped: string[] = [];
  const rejectionReasons: string[] = [];

  for (const item of parsed) {
    const rejectionReason = historyEntryRejectionReason(item);
    if (!rejectionReason) {
      entries.push(item as HistoryImportEntry);
    } else {
      skipped.push(typeof item === 'object' && item !== null && 'uuid' in item ? String(item.uuid) : 'unknown');
      rejectionReasons.push(rejectionReason);
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
    validationReport: createImportValidationReport(rejectionReasons),
  };
}

function historyEntryRejectionReason(value: unknown): string | null {
  const result = v.safeParse(historyImportEntrySchema, value);
  return result.success ? null : firstIssueReason(result.issues, 'Invalid history entry');
}
