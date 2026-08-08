import { reducePanelAction } from '../../core/actions.js';
import type { PCloudBackupCleanupResult, PCloudBackupFileUploadResult, PCloudProviderStatus } from '../../core/cloud/pcloud-provider.js';
import type { ImageDisplayRecord } from '../../core/display-records.js';
import type { PanelState } from '../../core/types.js';
import type { CaptureStore } from '../../content/capture-controller.js';
import {
  chunkCloudBackupBookmarks,
  cloudBackupPartFileName,
  createCloudBackupCryptoSession,
  encryptCloudBackupManifest,
  encryptCloudBackupPart,
  type AlbumBackupEntry,
  type CloudBackupCryptoSession,
  type CloudBackupManifestV1,
  type CloudBackupPartPayload,
  type CloudBackupPartReference,
  type FullBackupBlobKeyBackup,
  type PortableStoredBlobRecord,
} from '../../content/panel-services.js';
import type { uploadPCloudBackup } from '../../content/pcloud-provider-client.js';
import {
  bookmarkRecordToExportEntry,
  isLockedPrivatePin,
  originalBlobIdsForFullBackup,
  pcloudBackupFileName,
  pcloudBackupUploadMessage,
  PRIVATE_PIN_EXPORT_LOCKED_MESSAGE,
} from './record-export-helpers.js';

export interface PCloudBackupExportDeps {
  getState(): PanelState;
  setState(state: PanelState): void;
  render(): void;
  captureStore(): CaptureStore | null;
  albumStore(): { readonly listBackupEntries: () => Promise<readonly AlbumBackupEntry[]> } | null;
  uploadPCloudBackup: typeof uploadPCloudBackup;
  loadAllBookmarks(): Promise<readonly ImageDisplayRecord[]>;
  backupCompleted?(): void;
}

interface ActiveBackup {
  cancelled: boolean;
  committing: boolean;
  readonly uploadedFileIds: number[];
}

interface OriginalPartsResult {
  readonly parts: readonly CloudBackupPartReference[];
  readonly blobKeyBackups: readonly FullBackupBlobKeyBackup[];
  readonly missingOriginalBlobIds: readonly string[];
  readonly originalBytes: number;
}

class CloudBackupFlowError extends Error {
  constructor(
    message: string,
    readonly status?: PCloudProviderStatus,
    readonly cleanupFileId?: number,
  ) {
    super(message);
  }
}

class CloudBackupCancelledError extends Error {}

export class PCloudBackupExportCoordinator {
  private active: ActiveBackup | null = null;

  constructor(
    private readonly deps: PCloudBackupExportDeps,
    private readonly encryptPart: typeof encryptCloudBackupPart = encryptCloudBackupPart,
  ) {}

  cancel(): void {
    if (!this.active) return;
    if (this.active.committing) {
      this.progress('The encrypted manifest is being finalized and can no longer be canceled.');
      return;
    }
    this.active.cancelled = true;
    this.progress('Cancel requested. Finishing the current step, then cleaning up uploaded parts...');
  }

  async backup(password: string): Promise<void> {
    if (this.deps.getState().pcloudBackup.connectionState === 'busy') return;
    if (password.length < 4) {
      this.failState('Enter a cloud backup password with at least 4 characters before uploading.');
      return;
    }

    const active: ActiveBackup = { cancelled: false, committing: false, uploadedFileIds: [] };
    this.active = active;
    this.busy('Creating encrypted backup parts...');
    try {
      await this.runBackup(password, active);
    } catch (error) {
      await this.finishFailure(error, active);
    } finally {
      if (this.active === active) this.active = null;
    }
  }

  private async runBackup(password: string, active: ActiveBackup): Promise<void> {
    const bookmarks = await this.deps.loadAllBookmarks();
    const albums = (await this.deps.albumStore()?.listBackupEntries()) ?? [];
    this.assertNotCancelled(active);
    if (bookmarks.some(isLockedPrivatePin)) throw new CloudBackupFlowError(PRIVATE_PIN_EXPORT_LOCKED_MESSAGE);
    if (bookmarks.length === 0 && albums.length === 0) {
      throw new CloudBackupFlowError('No durable pins, bookmarks, or albums to back up.');
    }

    const now = new Date().toISOString();
    const session = await createCloudBackupCryptoSession(password);
    const bookmarkEntries = bookmarks.map(bookmarkRecordToExportEntry);
    const recordChunks = chunkCloudBackupBookmarks(bookmarkEntries);
    const originalIds = originalBlobIdsForFullBackup(bookmarks);
    const originalStartOrder = recordChunks.length + 1;
    const originals = await this.uploadOriginalParts(session, originalIds, originalStartOrder, password, active);
    const metadata = await this.uploadMetadataPart(session, albums, originals, active);
    const records = await this.uploadRecordParts(session, recordChunks, active);
    const parts = [metadata, ...records, ...originals.parts].sort((left, right) => left.restoreOrder - right.restoreOrder);

    active.committing = true;
    this.progress('Publishing the encrypted manifest after all parts were verified...');
    const manifest = createManifest(now, session.backupId, bookmarkEntries.length, albums.length, originals, parts);
    const fileContent = await encryptCloudBackupManifest(session, manifest);
    const upload = await this.deps.uploadPCloudBackup({ fileName: pcloudBackupFileName(now), fileContent });
    if (!upload.ok) throw new CloudBackupFlowError(upload.message, upload.status);
    this.complete(upload, originals);
  }

  private async uploadOriginalParts(
    session: CloudBackupCryptoSession,
    originalIds: readonly string[],
    startOrder: number,
    password: string,
    active: ActiveBackup,
  ): Promise<OriginalPartsResult> {
    const parts: CloudBackupPartReference[] = [];
    const blobKeyBackups: FullBackupBlobKeyBackup[] = [];
    const backedKeys = new Set<string>();
    const missingOriginalBlobIds = new Set<string>();
    let originalBytes = 0;
    const captureStore = this.deps.captureStore();
    for (const [index, blobId] of originalIds.entries()) {
      this.assertNotCancelled(active);
      this.progress(`Preparing encrypted original ${index + 1} of ${originalIds.length}...`);
      const result = captureStore
        ? await captureStore.requestOriginalBlobRecords([blobId])
        : { ok: true as const, records: [], missingBlobIds: [blobId] };
      if (!result.ok) throw new CloudBackupFlowError(result.message);
      result.missingBlobIds.forEach((missingId) => missingOriginalBlobIds.add(missingId));
      const record = result.records.find((candidate) => candidate.id === blobId);
      if (!record) {
        missingOriginalBlobIds.add(blobId);
        continue;
      }
      await this.addBlobKeyBackup(captureStore, record, password, backedKeys, blobKeyBackups);
      const restoreOrder = startOrder + parts.length;
      const partId = `original-${String(parts.length + 1).padStart(6, '0')}`;
      const payload = { schemaVersion: 1, backupId: session.backupId, partId, kind: 'original', originalBlob: record } as const;
      parts.push(await this.uploadPart(session, payload, restoreOrder, blobId, active));
      originalBytes += record.encryptedByteLength;
    }
    return { parts, blobKeyBackups, missingOriginalBlobIds: [...missingOriginalBlobIds], originalBytes };
  }

  private async addBlobKeyBackup(
    captureStore: CaptureStore | null,
    record: PortableStoredBlobRecord,
    password: string,
    backedKeys: Set<string>,
    backups: FullBackupBlobKeyBackup[],
  ): Promise<void> {
    if (backedKeys.has(record.key.reference)) return;
    if (!captureStore) throw new CloudBackupFlowError('Encrypted original storage is unavailable; no bookmarks were backed up.');
    const backup = await captureStore.exportBlobKeyBackup(password, record.key.reference);
    if (!backup.ok) throw new CloudBackupFlowError(backup.message);
    backups.push({ keyReference: backup.keyReference, fileContent: backup.fileContent });
    backedKeys.add(record.key.reference);
  }

  private async uploadMetadataPart(
    session: CloudBackupCryptoSession,
    albums: readonly AlbumBackupEntry[],
    originals: OriginalPartsResult,
    active: ActiveBackup,
  ): Promise<CloudBackupPartReference> {
    const payload = {
      schemaVersion: 1,
      backupId: session.backupId,
      partId: 'metadata-000001',
      kind: 'metadata',
      albums,
      blobKeyBackups: originals.blobKeyBackups,
      missingOriginalBlobIds: originals.missingOriginalBlobIds,
    } as const;
    return this.uploadPart(session, payload, 0, undefined, active);
  }

  private async uploadRecordParts(
    session: CloudBackupCryptoSession,
    chunks: readonly (readonly ReturnType<typeof bookmarkRecordToExportEntry>[])[],
    active: ActiveBackup,
  ): Promise<readonly CloudBackupPartReference[]> {
    const parts: CloudBackupPartReference[] = [];
    for (const [index, bookmarks] of chunks.entries()) {
      const partId = `records-${String(index + 1).padStart(6, '0')}`;
      const payload = { schemaVersion: 1, backupId: session.backupId, partId, kind: 'records', bookmarks } as const;
      parts.push(await this.uploadPart(session, payload, index + 1, undefined, active));
    }
    return parts;
  }

  private async uploadPart(
    session: CloudBackupCryptoSession,
    payload: CloudBackupPartPayload,
    restoreOrder: number,
    originalBlobId: string | undefined,
    active: ActiveBackup,
  ): Promise<CloudBackupPartReference> {
    this.assertNotCancelled(active);
    this.progress(`Uploading and verifying ${payload.kind} part ${restoreOrder + 1}...`);
    const fileContent = await this.encryptPart(session, payload);
    this.assertNotCancelled(active);
    const upload = await this.deps.uploadPCloudBackup({
      operation: 'upload',
      fileName: cloudBackupPartFileName(session.backupId, restoreOrder, payload.kind),
      fileContent,
      recordHistory: false,
    });
    if (!upload.ok) {
      throw new CloudBackupFlowError(upload.message, upload.status, upload.cleanupNeeded ? upload.cleanupFileId : undefined);
    }
    active.uploadedFileIds.push(upload.fileId);
    this.assertNotCancelled(active);
    return partReference(upload, payload, restoreOrder, originalBlobId);
  }

  private async finishFailure(error: unknown, active: ActiveBackup): Promise<void> {
    const flowError = error instanceof CloudBackupFlowError ? error : null;
    const cleanupIds = [...active.uploadedFileIds];
    if (flowError?.cleanupFileId !== undefined) cleanupIds.push(flowError.cleanupFileId);
    const cleanup = await this.cleanupParts(cleanupIds);
    if (error instanceof CloudBackupCancelledError && cleanup.ok) {
      const message = `Backup canceled. ${cleanup.message}`;
      this.deps.setState(reducePanelAction(this.deps.getState(), { name: 'pcloud-backup/status', status: { ...cleanup.status, message } }));
      this.deps.render();
      return;
    }
    const baseMessage = error instanceof Error ? error.message : 'Cloud backup failed.';
    const message = cleanupIds.length > 0 ? `${baseMessage} ${cleanup.message}` : baseMessage;
    this.failState(message, cleanup.status ?? flowError?.status);
  }

  private async cleanupParts(fileIds: readonly number[]): Promise<PCloudBackupCleanupResult> {
    return this.deps.uploadPCloudBackup({ operation: 'cleanup', fileIds });
  }

  private complete(upload: Extract<PCloudBackupFileUploadResult, { readonly ok: true }>, originals: OriginalPartsResult): void {
    this.deps.setState(
      reducePanelAction(this.deps.getState(), {
        name: 'pcloud-backup/upload-complete',
        apiHost: upload.apiHost,
        originalCount: originals.parts.length,
        originalBytes: originals.originalBytes,
        missingOriginalCount: originals.missingOriginalBlobIds.length,
        historyRecord: upload.historyRecord,
        message: pcloudBackupUploadMessage(
          upload.message,
          originals.parts.length,
          originals.originalBytes,
          originals.missingOriginalBlobIds.length,
        ),
      }),
    );
    if (originals.missingOriginalBlobIds.length === 0) this.deps.backupCompleted?.();
    this.deps.render();
  }

  private assertNotCancelled(active: ActiveBackup): void {
    if (active.cancelled) throw new CloudBackupCancelledError('Cloud backup canceled.');
  }

  private busy(message: string): void {
    this.deps.setState(reducePanelAction(this.deps.getState(), { name: 'pcloud-backup/busy', pendingOperation: 'backing-up', message }));
    this.deps.render();
  }

  private progress(message: string): void {
    this.deps.setState(reducePanelAction(this.deps.getState(), { name: 'pcloud-backup/message', message }));
    this.deps.render();
  }

  private failState(message: string, status?: PCloudProviderStatus): void {
    const action =
      status === undefined
        ? ({ name: 'pcloud-backup/upload-error', message } as const)
        : ({ name: 'pcloud-backup/upload-error', message, status } as const);
    this.deps.setState(reducePanelAction(this.deps.getState(), action));
    this.deps.render();
  }
}

function partReference(
  upload: Extract<PCloudBackupFileUploadResult, { readonly ok: true }>,
  payload: CloudBackupPartPayload,
  restoreOrder: number,
  originalBlobId: string | undefined,
): CloudBackupPartReference {
  const base = {
    partId: payload.partId,
    kind: payload.kind,
    restoreOrder,
    fileId: upload.fileId,
    fileName: upload.fileName,
    sizeBytes: upload.sizeBytes,
    sha256: upload.sha256,
  };
  return originalBlobId === undefined ? base : { ...base, originalBlobId };
}

function createManifest(
  createdAt: string,
  backupId: string,
  recordCount: number,
  albumCount: number,
  originals: OriginalPartsResult,
  parts: readonly CloudBackupPartReference[],
): CloudBackupManifestV1 {
  return {
    schemaVersion: 1,
    backupId,
    createdAt,
    recordCount,
    albumCount,
    originalCount: originals.parts.length,
    originalBytes: originals.originalBytes,
    missingOriginalCount: originals.missingOriginalBlobIds.length,
    parts,
  };
}
