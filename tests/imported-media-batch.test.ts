import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { CaptureStore } from '../extension/src/content/capture-controller.js';
import type { CaptureResult } from '../extension/src/core/image/capture-result.js';
import type { ImportedImageFile } from '../extension/src/core/types.js';
import { importMediaFiles, type ImportedMediaBatchDeps } from '../extension/src/ui/panel/imported-media-batch.js';
import type { CapturedImportedMedia } from '../extension/src/ui/panel/imported-media-record.js';

const captured: CapturedImportedMedia = {
  status: 'captured',
  blobId: 'blob-ts',
  mimeType: 'video/mp2t',
  byteLength: 188,
  fileName: 'camera.ts',
  sha256: 'a327f9d90565a7672ce85ac341066e0da7ea89caf9b053c32352ece756dfd754',
};

interface BatchHarness {
  readonly deps: ImportedMediaBatchDeps;
  readonly log: string[];
  readonly added: Array<{ readonly file: ImportedImageFile; readonly captured: CapturedImportedMedia | undefined }>;
}

function createHarness(
  options: {
    readonly captureResult?: CaptureResult;
    readonly addResult?: boolean;
    readonly storeAvailable?: boolean;
  } = {},
): BatchHarness {
  const log: string[] = [];
  const added: Array<{ readonly file: ImportedImageFile; readonly captured: CapturedImportedMedia | undefined }> = [];
  const result = options.captureResult ?? captured;
  const store = {
    requestCapture: async (url: string, sourceType: string, sourceRecordId?: string, fileName?: string) => {
      log.push(`capture:${url}:${sourceType}:${String(sourceRecordId)}:${String(fileName)}`);
      return result;
    },
    requestPermissionAndRetry: async (url: string, sourceType: string, sourceRecordId?: string, fileName?: string) => {
      log.push(`permission:${url}:${sourceType}:${String(sourceRecordId)}:${String(fileName)}`);
      return result;
    },
    requestDeleteBlob: async (blobId: string) => {
      log.push(`delete:${blobId}`);
      return { deleted: true, usage: { totalBytes: 0, blobCount: 0 } };
    },
  } as unknown as CaptureStore;
  return {
    deps: {
      captureStore: () => (options.storeAvailable === false ? null : store),
      refreshBlobKeyStatus: async () => {
        log.push('refresh-key');
      },
      addImportedImage: async (file, capturedMedia) => {
        added.push({ file, captured: capturedMedia });
        return options.addResult ?? true;
      },
    },
    log,
    added,
  };
}

test('image imports bypass original recapture while local video/audio imports capture exact bytes first', async () => {
  const harness = createHarness();
  const image = { name: 'photo.png', dataUrl: 'data:image/png;base64,iVBORw0KGgo=' };
  const media = { name: 'camera.ts', dataUrl: 'data:video/mp2t;base64,R0RBVEE=' };
  const common = { name: 'clip.mp4', dataUrl: 'data:video/mp4;base64,AAAA' };
  const audio = { name: 'sound.mp2', dataUrl: 'data:audio/mpeg;base64,AAAA' };
  assert.deepEqual(await importMediaFiles([image, media, common, audio], harness.deps), {
    imported: 4,
    failed: 0,
    firstFailureMessage: null,
  });
  assert.deepEqual(harness.log, [
    `capture:${media.dataUrl}:bookmark:undefined:camera.ts`,
    `capture:${common.dataUrl}:bookmark:undefined:clip.mp4`,
    `capture:${audio.dataUrl}:bookmark:undefined:sound.mp2`,
  ]);
  assert.equal(harness.added[0]?.captured, undefined);
  assert.equal(harness.added[1]?.captured?.blobId, 'blob-ts');
  assert.equal(harness.added[2]?.captured?.blobId, 'blob-ts');
  assert.equal(harness.added[3]?.captured?.blobId, 'blob-ts');
});

test('remote MPEG-TS uses the intentional permission request and preserves its filename', async () => {
  const harness = createHarness();
  const file = { name: 'remote.m2ts', dataUrl: 'https://media.example/archive/remote.m2ts' };
  assert.deepEqual(await importMediaFiles([file], harness.deps), {
    imported: 1,
    failed: 0,
    firstFailureMessage: null,
  });
  assert.deepEqual(harness.log, [`permission:${file.dataUrl}:bookmark:undefined:remote.m2ts`]);
});

test('failed encrypted capture never adds a queue record and refreshes a locked key state', async () => {
  const harness = createHarness({
    captureResult: {
      status: 'failed',
      reason: 'encryption-locked',
      message: 'Unlock encrypted originals.',
    },
  });
  const result = await importMediaFiles([{ name: 'camera.ts', dataUrl: 'data:video/mp2t;base64,R0RBVEE=' }], harness.deps);
  assert.deepEqual(result, { imported: 0, failed: 1, firstFailureMessage: 'Unlock encrypted originals.' });
  assert.deepEqual(harness.log, ['capture:data:video/mp2t;base64,R0RBVEE=:bookmark:undefined:camera.ts', 'refresh-key']);
  assert.deepEqual(harness.added, []);
});

test('a queue-write failure deletes the newly captured blob instead of leaving partial state', async () => {
  const harness = createHarness({ addResult: false });
  const result = await importMediaFiles([{ name: 'camera.ts', dataUrl: 'data:video/mp2t;base64,R0RBVEE=' }], harness.deps);
  assert.deepEqual(result, {
    imported: 0,
    failed: 1,
    firstFailureMessage: 'The selected media could not be added to the durable queue.',
  });
  assert.deepEqual(harness.log, ['capture:data:video/mp2t;base64,R0RBVEE=:bookmark:undefined:camera.ts', 'delete:blob-ts']);
});

test('media import fails closed when encrypted original storage is unavailable', async () => {
  const harness = createHarness({ storeAvailable: false });
  const result = await importMediaFiles([{ name: 'camera.ts', dataUrl: 'data:video/mp2t;base64,R0RBVEE=' }], harness.deps);
  assert.deepEqual(result, { imported: 0, failed: 1, firstFailureMessage: 'Encrypted original storage is unavailable.' });
  assert.deepEqual(harness.log, []);
  assert.deepEqual(harness.added, []);
});
