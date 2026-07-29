import test from 'node:test';
import assert from 'node:assert/strict';
import { createKeyReference } from '../extension/src/data/crypto/key-reference.js';
import { importBookmarks } from '../extension/src/data/import-export/bookmarks-import.js';
import { parseExportFile } from '../extension/src/data/import-export/encrypted-file-format.js';
import {
  exportEncryptedFullBackup,
  portableStoredBlobRecord,
  storedBlobRecordFromPortable,
} from '../extension/src/data/import-export/full-backup.js';
import type { StoredBlobRecord } from '../extension/src/data/types.js';

test('full-backup: preserves animated-media metadata with encrypted original blob records', async () => {
  const keyReference = createKeyReference('blob', 'full-backup-key');
  const ciphertext = Uint8Array.from({ length: 96_937 }, (_, index) => index % 251);
  const blobRecord: StoredBlobRecord = {
    id: 'blob-full-backup',
    kind: 'original',
    schemaVersion: 1,
    algorithm: 'AES-GCM',
    iv: 'iv-value',
    ciphertext: ciphertext.buffer,
    encryptedByteLength: ciphertext.byteLength,
    createdAt: '2026-06-28T00:00:00.000Z',
    key: keyReference,
    referenceCount: 1,
  };
  const exported = await exportEncryptedFullBackup({
    bookmarks: [
      {
        uuid: 'bookmark-full-backup',
        payload: {
          url: 'https://example.test/full.jpg',
          bookmarkedAt: '2026-06-28T00:00:00.000Z',
          storedOriginal: {
            blobId: 'blob-full-backup',
            mimeType: 'image/gif',
            byteLength: 123,
            capturedAt: '2026-06-28T00:00:00.000Z',
            fileName: 'party.gif',
            width: 8,
            height: 8,
            mediaInfo: { kind: 'gif', animated: true, frameCount: 3, loopCount: 0 },
          },
        },
      },
    ],
    albums: [
      {
        id: 'album-full-backup',
        name: 'Restored set',
        createdAt: '2026-06-28T00:00:00.000Z',
        updatedAt: '2026-06-28T00:00:01.000Z',
        recordIds: ['bookmark-full-backup'],
      },
    ],
    originalBlobs: [blobRecord],
    blobKeyBackups: [{ keyReference: 'blob:full-backup-key', fileContent: '{"header":{"payloadType":"keys"}}' }],
    password: 'backup-password',
    now: '2026-06-28T00:00:00.000Z',
  });

  assert.ok(exported.status.ok, exported.status.message);
  assert.equal(exported.originalBlobCount, 1);
  assert.ok(exported.fileContent!.length > ciphertext.byteLength, 'full backup file should include encrypted original bytes');
  const envelope = parseExportFile(exported.fileContent!);
  assert.equal(envelope.header.payloadType, 'mixed');
  assert.equal(envelope.header.recordCount, 1);

  const importedBookmarks = await importBookmarks(exported.fileContent!, 'backup-password');
  assert.ok(importedBookmarks.status.ok, importedBookmarks.status.message);
  assert.equal(importedBookmarks.fullBackup, true);
  assert.equal(importedBookmarks.entries.length, 1);
  assert.equal(importedBookmarks.externalOriginalCount, 1);
  assert.equal(importedBookmarks.originalBlobs.length, 1);
  assert.equal(importedBookmarks.blobKeyBackups.length, 1);
  assert.deepEqual(
    importedBookmarks.albums.map((album) => ({ id: album.id, name: album.name, recordIds: album.recordIds })),
    [{ id: 'album-full-backup', name: 'Restored set', recordIds: ['bookmark-full-backup'] }],
  );
  assert.deepEqual(importedBookmarks.entries[0]?.payload.storedOriginal, {
    blobId: 'blob-full-backup',
    mimeType: 'image/gif',
    byteLength: 123,
    capturedAt: '2026-06-28T00:00:00.000Z',
    fileName: 'party.gif',
    width: 8,
    height: 8,
    mediaInfo: { kind: 'gif', animated: true, frameCount: 3, loopCount: 0 },
  });

  const portable = portableStoredBlobRecord(blobRecord);
  const restored = storedBlobRecordFromPortable(portable);
  assert.equal(restored.id, blobRecord.id);
  assert.equal(restored.key.reference, 'blob:full-backup-key');
  assert.equal(restored.ciphertext.byteLength, ciphertext.byteLength);
  assert.deepEqual(Array.from(new Uint8Array(restored.ciphertext).slice(0, 4)), [0, 1, 2, 3]);
});
