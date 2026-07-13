import assert from 'node:assert/strict';
import test from 'node:test';

import { appendBackupHistory, BACKUP_HISTORY_STORAGE_KEY, loadBackupHistory } from '../extension/src/background/backup-history-store.js';
import { BACKUP_HISTORY_LIMIT, type BackupHistoryRecord } from '../extension/src/core/cloud/pcloud-provider.js';

function historyRecord(index: number, overrides: Partial<BackupHistoryRecord> = {}): BackupHistoryRecord {
  return {
    schemaVersion: 1,
    provider: 'pcloud',
    destination: '/Image Trail/backups',
    fileName: `backup-${index}.image-trail-encrypted.json`,
    completedAt: new Date(Date.UTC(2026, 6, 1, 0, index)).toISOString(),
    sizeBytes: 1024 + index,
    sha256: index.toString(16).padStart(64, '0'),
    verificationMethod: 'download-byte-match',
    ...overrides,
  };
}

function installStorage(initial: Record<string, unknown> = {}): {
  readonly values: Record<string, unknown>;
  readonly accessLevels: string[];
  readonly restore: () => void;
} {
  const originalChrome = globalThis.chrome;
  const values = { ...initial };
  const accessLevels: string[] = [];
  globalThis.chrome = {
    storage: {
      local: {
        get: async () => ({ ...values }),
        set: async (items: Record<string, unknown>) => {
          Object.assign(values, items);
        },
        setAccessLevel: async ({ accessLevel }: { readonly accessLevel: string }) => {
          accessLevels.push(accessLevel);
        },
      },
    },
  } as unknown as typeof chrome;
  return {
    values,
    accessLevels,
    restore: () => {
      globalThis.chrome = originalChrome;
    },
  };
}

test('loadBackupHistory returns newest valid user-visible records from trusted extension storage', async () => {
  const older = historyRecord(1);
  const newer = historyRecord(2, { verificationMethod: 'provider-checksum' });
  const storage = installStorage({
    [BACKUP_HISTORY_STORAGE_KEY]: {
      schemaVersion: 1,
      records: [
        older,
        { ...newer, accessToken: 'must-not-survive' },
        { ...historyRecord(3), sha256: 'invalid' },
        { ...historyRecord(4), provider: 'other' },
      ],
    },
  });

  try {
    const loaded = await loadBackupHistory();

    assert.deepEqual(loaded, [newer, older]);
    assert.equal(JSON.stringify(loaded).includes('must-not-survive'), false);
    assert.deepEqual(storage.accessLevels, ['TRUSTED_CONTEXTS']);
  } finally {
    storage.restore();
  }
});

test('appendBackupHistory deduplicates, sorts, and enforces the retention limit', async () => {
  const existing = Array.from({ length: BACKUP_HISTORY_LIMIT }, (_, index) => historyRecord(index));
  const storage = installStorage({
    [BACKUP_HISTORY_STORAGE_KEY]: { schemaVersion: 1, records: existing },
  });
  const newest = historyRecord(40);

  try {
    const afterAppend = await appendBackupHistory(newest);
    const afterDuplicate = await appendBackupHistory(newest);

    assert.equal(afterAppend.length, BACKUP_HISTORY_LIMIT);
    assert.equal(afterAppend[0]?.fileName, newest.fileName);
    assert.equal(afterDuplicate.filter((record) => record.fileName === newest.fileName).length, 1);
    assert.deepEqual(await loadBackupHistory(), afterDuplicate);
    assert.equal(JSON.stringify(storage.values).includes('accessToken'), false);
  } finally {
    storage.restore();
  }
});

test('loadBackupHistory degrades to an empty history when extension storage is unavailable', async () => {
  const originalChrome = globalThis.chrome;
  globalThis.chrome = undefined as unknown as typeof chrome;
  try {
    assert.deepEqual(await loadBackupHistory(), []);
  } finally {
    globalThis.chrome = originalChrome;
  }
});
