import { BACKUP_HISTORY_LIMIT, type BackupHistoryRecord } from '../core/cloud/pcloud-provider.js';
import { hasTrustedExtensionStorage, restrictStorageToTrustedContexts } from './trusted-storage.js';

export const BACKUP_HISTORY_STORAGE_KEY = 'imageTrail.backupHistory';
interface BackupHistoryEnvelopeV1 {
  readonly schemaVersion: 1;
  readonly records: readonly BackupHistoryRecord[];
}

let writeQueue: Promise<void> = Promise.resolve();

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isVerificationMethod(value: unknown): value is BackupHistoryRecord['verificationMethod'] {
  return value === 'download-byte-match' || value === 'provider-checksum';
}

function parseBackupHistoryRecord(value: unknown): BackupHistoryRecord | null {
  const record = objectRecord(value);
  if (!record || record['schemaVersion'] !== 1 || record['provider'] !== 'pcloud') return null;
  const destination = record['destination'];
  const fileName = record['fileName'];
  const completedAt = record['completedAt'];
  const sizeBytes = record['sizeBytes'];
  const sha256 = record['sha256'];
  const verificationMethod = record['verificationMethod'];
  if (
    !nonEmptyString(destination) ||
    !nonEmptyString(fileName) ||
    !nonEmptyString(completedAt) ||
    !Number.isFinite(Date.parse(completedAt)) ||
    typeof sizeBytes !== 'number' ||
    !Number.isSafeInteger(sizeBytes) ||
    sizeBytes < 0 ||
    !nonEmptyString(sha256) ||
    !/^[a-f0-9]{64}$/u.test(sha256) ||
    !isVerificationMethod(verificationMethod)
  ) {
    return null;
  }
  return {
    schemaVersion: 1,
    provider: 'pcloud',
    destination: destination.trim(),
    fileName: fileName.trim(),
    completedAt,
    sizeBytes,
    sha256,
    verificationMethod,
  };
}

function newestFirst(records: readonly BackupHistoryRecord[]): readonly BackupHistoryRecord[] {
  return [...records].sort((left, right) => Date.parse(right.completedAt) - Date.parse(left.completedAt));
}

function recordIdentity(record: BackupHistoryRecord): string {
  return [record.provider, record.destination, record.fileName, record.completedAt, record.sha256].join('\n');
}

export async function loadBackupHistory(): Promise<readonly BackupHistoryRecord[]> {
  if (!hasTrustedExtensionStorage()) return [];
  await restrictStorageToTrustedContexts();
  const stored = await chrome.storage.local.get(BACKUP_HISTORY_STORAGE_KEY);
  const envelope = objectRecord(stored[BACKUP_HISTORY_STORAGE_KEY]);
  if (!envelope || envelope['schemaVersion'] !== 1 || !Array.isArray(envelope['records'])) return [];
  return newestFirst(envelope['records'].map(parseBackupHistoryRecord).filter((record) => record !== null)).slice(0, BACKUP_HISTORY_LIMIT);
}

export function appendBackupHistory(record: BackupHistoryRecord): Promise<readonly BackupHistoryRecord[]> {
  const operation = writeQueue.then(async () => {
    const existing = await loadBackupHistory();
    const identity = recordIdentity(record);
    const records = newestFirst([record, ...existing.filter((candidate) => recordIdentity(candidate) !== identity)]).slice(
      0,
      BACKUP_HISTORY_LIMIT,
    );
    await restrictStorageToTrustedContexts();
    await chrome.storage.local.set({
      [BACKUP_HISTORY_STORAGE_KEY]: {
        schemaVersion: 1,
        records,
      } satisfies BackupHistoryEnvelopeV1,
    });
    return records;
  });
  writeQueue = operation.then(
    () => undefined,
    () => undefined,
  );
  return operation;
}
