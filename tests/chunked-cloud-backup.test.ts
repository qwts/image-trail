import assert from 'node:assert/strict';
import test from 'node:test';

import {
  chunkCloudBackupBookmarks,
  cloudBackupPartFileName,
  createCloudBackupCryptoSession,
  decryptCloudBackupManifest,
  decryptCloudBackupPart,
  encryptCloudBackupManifest,
  encryptCloudBackupPart,
  validateCloudBackupManifest,
  type CloudBackupManifestV1,
  type CloudBackupOriginalPartV1,
  type CloudBackupPartReference,
} from '../extension/src/data/import-export/chunked-cloud-backup.js';
import { createFullBackupImportResult } from '../extension/src/data/import-export/bookmarks-import.js';

const NOW = '2026-07-28T12:00:00.000Z';
const BACKUP_ID = '00000000-0000-4000-8000-000000000223';

function reference(
  restoreOrder: number,
  kind: CloudBackupPartReference['kind'],
  overrides: Partial<CloudBackupPartReference> = {},
): CloudBackupPartReference {
  const partId = `${kind}-${String(restoreOrder + 1).padStart(6, '0')}`;
  return {
    partId,
    kind,
    restoreOrder,
    fileId: 100 + restoreOrder,
    fileName: cloudBackupPartFileName(BACKUP_ID, restoreOrder, kind),
    sizeBytes: 128 + restoreOrder,
    sha256: String(restoreOrder).padStart(64, 'a'),
    ...overrides,
  };
}

function manifest(parts: readonly CloudBackupPartReference[]): CloudBackupManifestV1 {
  return {
    schemaVersion: 1,
    backupId: BACKUP_ID,
    createdAt: NOW,
    recordCount: 1,
    albumCount: 0,
    originalCount: 1,
    originalBytes: 3,
    missingOriginalCount: 0,
    parts,
  };
}

function originalPart(): CloudBackupOriginalPartV1 {
  return {
    schemaVersion: 1,
    backupId: BACKUP_ID,
    partId: 'original-000003',
    kind: 'original',
    originalBlob: {
      id: 'blob-1',
      kind: 'original',
      schemaVersion: 1,
      algorithm: 'AES-GCM',
      iv: 'part-iv',
      ciphertext: 'AQID',
      encryptedByteLength: 3,
      createdAt: NOW,
      key: { kind: 'blob', uuid: 'key-1', reference: 'blob:key-1' },
      referenceCount: 1,
    },
  };
}

test('chunked cloud backup encrypts the manifest and authenticates each independently encrypted part', async () => {
  const session = await createCloudBackupCryptoSession('backup-password', BACKUP_ID);
  const parts = [reference(0, 'metadata'), reference(1, 'records'), reference(2, 'original', { originalBlobId: 'blob-1' })];
  const fileContent = await encryptCloudBackupManifest(session, manifest(parts));
  const partContent = await encryptCloudBackupPart(session, originalPart());

  assert.doesNotMatch(fileContent, /blob-1|original-000003/u, 'manifest references remain encrypted');
  assert.doesNotMatch(partContent, /blob-1|AQID/u, 'part payload remains encrypted');

  const restored = await decryptCloudBackupManifest(fileContent, 'backup-password');
  assert.equal(restored.manifest.backupId, BACKUP_ID);
  const payload = await decryptCloudBackupPart(partContent, restored.session, parts[2]!);
  assert.equal(payload.kind, 'original');
  if (payload.kind === 'original') assert.equal(payload.originalBlob.id, 'blob-1');

  await assert.rejects(decryptCloudBackupManifest(fileContent, 'wrong-password'));
  await assert.rejects(decryptCloudBackupPart(partContent, restored.session, { partId: 'original-999999', kind: 'original' }), /identity/u);
});

test('chunkCloudBackupBookmarks creates bounded ordered record groups without dropping an oversized record', () => {
  const bookmarks = [
    { uuid: 'one', payload: { url: 'https://example.test/1.jpg', bookmarkedAt: NOW, title: 'a'.repeat(40) } },
    { uuid: 'two', payload: { url: 'https://example.test/2.jpg', bookmarkedAt: NOW, title: 'b'.repeat(40) } },
    { uuid: 'three', payload: { url: 'https://example.test/3.jpg', bookmarkedAt: NOW, title: 'c'.repeat(400) } },
  ];

  const chunks = chunkCloudBackupBookmarks(bookmarks, 180);

  assert.deepEqual(
    chunks.flat().map((entry) => entry.uuid),
    ['one', 'two', 'three'],
  );
  assert.ok(chunks.length >= 2);
  assert.deepEqual(
    chunks.at(-1)?.map((entry) => entry.uuid),
    ['three'],
    'one oversized record remains a recoverable single part',
  );
});

test('manifest validation rejects gaps, duplicate provider ids, and non-part file references', () => {
  const validParts = [reference(0, 'metadata'), reference(1, 'records'), reference(2, 'original', { originalBlobId: 'blob-1' })];
  assert.doesNotThrow(() => validateCloudBackupManifest(manifest(validParts)));
  assert.throws(() => validateCloudBackupManifest(manifest([validParts[0]!, { ...validParts[2]!, restoreOrder: 3 }])), /ordering/u);
  assert.throws(
    () => validateCloudBackupManifest(manifest([validParts[0]!, { ...validParts[1]!, fileId: validParts[0]!.fileId }, validParts[2]!])),
    /duplicate/u,
  );
  assert.throws(
    () => validateCloudBackupManifest(manifest([{ ...validParts[0]!, fileName: 'notes.txt' }, validParts[1]!, validParts[2]!])),
    /unexpected part file/u,
  );
});

test('chunked import components preserve only original references backed by manifest parts', () => {
  const result = createFullBackupImportResult({
    bookmarks: [
      {
        uuid: 'backed',
        payload: {
          url: 'https://example.test/backed.jpg',
          bookmarkedAt: NOW,
          storedOriginal: { blobId: 'blob-1', mimeType: 'image/jpeg', byteLength: 3, capturedAt: NOW },
        },
      },
      {
        uuid: 'missing',
        payload: {
          url: 'https://example.test/missing.jpg',
          bookmarkedAt: NOW,
          storedOriginal: { blobId: 'blob-missing', mimeType: 'image/jpeg', byteLength: 4, capturedAt: NOW },
        },
      },
    ],
    backedOriginalBlobIds: ['blob-1'],
    blobKeyBackups: [],
    missingOriginalBlobIds: ['blob-missing'],
    albums: [],
  });

  assert.equal(result.entries[0]?.payload.storedOriginal?.blobId, 'blob-1');
  assert.equal(result.entries[1]?.payload.storedOriginal, undefined);
  assert.deepEqual(result.backedOriginalBlobIds, ['blob-1']);
});
