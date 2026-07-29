import type { CaptureStore } from '../../content/capture-controller.js';
import type { ImportedImageFile } from '../../core/types.js';
import type { CapturedImportedMedia } from './imported-media-record.js';

export interface ImportedMediaBatchDeps {
  captureStore(): CaptureStore | null;
  refreshBlobKeyStatus(): Promise<void>;
  addImportedImage(file: ImportedImageFile, captured?: CapturedImportedMedia): Promise<boolean>;
}

export interface ImportedMediaBatchResult {
  readonly imported: number;
  readonly failed: number;
  readonly firstFailureMessage: string | null;
}

export async function importMediaFiles(
  files: readonly ImportedImageFile[],
  deps: ImportedMediaBatchDeps,
): Promise<ImportedMediaBatchResult> {
  let imported = 0;
  let failed = 0;
  let firstFailureMessage: string | null = null;
  for (const file of files) {
    const capture = await captureImportedOriginal(file, deps);
    if (!capture.ok) {
      failed += 1;
      firstFailureMessage ??= capture.message;
      continue;
    }
    if (await deps.addImportedImage(file, capture.captured)) {
      imported += 1;
      continue;
    }
    failed += 1;
    firstFailureMessage ??= 'The selected media could not be added to the durable queue.';
    if (capture.captured) await deps.captureStore()?.requestDeleteBlob(capture.captured.blobId);
  }
  return { imported, failed, firstFailureMessage };
}

async function captureImportedOriginal(
  file: ImportedImageFile,
  deps: ImportedMediaBatchDeps,
): Promise<{ readonly ok: true; readonly captured: CapturedImportedMedia | undefined } | { readonly ok: false; readonly message: string }> {
  const remote = /^https?:\/\//iu.test(file.dataUrl);
  if (!file.dataUrl.startsWith('data:video/mp2t') && !remote) return { ok: true, captured: undefined };
  const store = deps.captureStore();
  if (!store) return { ok: false, message: 'Encrypted original storage is unavailable.' };
  const result = remote
    ? await store.requestPermissionAndRetry(file.dataUrl, 'bookmark', undefined, file.name)
    : await store.requestCapture(file.dataUrl, 'bookmark', undefined, file.name);
  if (result.status === 'captured') return { ok: true, captured: result };
  if (result.reason === 'encryption-locked') await deps.refreshBlobKeyStatus();
  return { ok: false, message: result.message };
}
