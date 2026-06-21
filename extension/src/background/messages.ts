export const MESSAGE_PROTOCOL_VERSION = 1;

export const MessageType = {
  TogglePanel: 'imageTrail.togglePanel',
  Ping: 'imageTrail.ping',
  Status: 'imageTrail.status',
  Unknown: 'imageTrail.unknown',
  CaptureImage: 'imageTrail.captureImage',
  CaptureResult: 'imageTrail.captureResult',
  DownloadImage: 'imageTrail.downloadImage',
  DownloadImageResult: 'imageTrail.downloadImageResult',
  StorageUsageRequest: 'imageTrail.storageUsageRequest',
  StorageUsageResponse: 'imageTrail.storageUsageResponse',
  DeleteBlob: 'imageTrail.deleteBlob',
  DeleteBlobResult: 'imageTrail.deleteBlobResult',
  CleanupOrphanedBlobs: 'imageTrail.cleanupOrphanedBlobs',
  CleanupOrphanedBlobsResult: 'imageTrail.cleanupOrphanedBlobsResult',
  RetrieveBlob: 'imageTrail.retrieveBlob',
  RetrieveBlobResult: 'imageTrail.retrieveBlobResult',
  CreateBlobPreview: 'imageTrail.createBlobPreview',
  CreateDataUrlPreview: 'imageTrail.createDataUrlPreview',
  CreateBlobPreviewResult: 'imageTrail.createBlobPreviewResult',
  FetchThumbnailSource: 'imageTrail.fetchThumbnailSource',
  FetchThumbnailSourceResult: 'imageTrail.fetchThumbnailSourceResult',
  GrantPermissionAndCapture: 'imageTrail.grantPermissionAndCapture',
  BlobKeyStatus: 'imageTrail.blobKeyStatus',
  BlobKeyStatusResult: 'imageTrail.blobKeyStatusResult',
  SetupBlobKey: 'imageTrail.setupBlobKey',
  UnlockBlobKey: 'imageTrail.unlockBlobKey',
  ClearBlobKey: 'imageTrail.clearBlobKey',
  ExportBlobKeyBackup: 'imageTrail.exportBlobKeyBackup',
  ExportBlobKeyBackupResult: 'imageTrail.exportBlobKeyBackupResult',
  ImportBlobKeyBackup: 'imageTrail.importBlobKeyBackup',
  ImportBlobKeyBackupResult: 'imageTrail.importBlobKeyBackupResult',
  BlobKeyResult: 'imageTrail.blobKeyResult',
  LoadBookmarks: 'imageTrail.loadBookmarks',
  LoadBookmarksResult: 'imageTrail.loadBookmarksResult',
  SaveBookmark: 'imageTrail.saveBookmark',
  SaveBookmarkResult: 'imageTrail.saveBookmarkResult',
  RemoveBookmark: 'imageTrail.removeBookmark',
  RemoveBookmarkResult: 'imageTrail.removeBookmarkResult',
  LoadRecentHistory: 'imageTrail.loadRecentHistory',
  LoadRecentHistoryResult: 'imageTrail.loadRecentHistoryResult',
  AddRecentHistory: 'imageTrail.addRecentHistory',
  AddRecentHistoryResult: 'imageTrail.addRecentHistoryResult',
  RemoveRecentHistory: 'imageTrail.removeRecentHistory',
  RemoveRecentHistoryResult: 'imageTrail.removeRecentHistoryResult',
} as const;

export type MessageType = (typeof MessageType)[keyof typeof MessageType];

export interface TogglePanelMessage {
  readonly type: typeof MessageType.TogglePanel;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly source: 'browserAction' };
}

export interface PingMessage {
  readonly type: typeof MessageType.Ping;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly sentAt: number };
}

export interface StatusMessage {
  readonly type: typeof MessageType.Status;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly panelVisible: boolean; readonly status: string };
}

export interface UnknownMessageResponse {
  readonly type: typeof MessageType.Unknown;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly reason: string };
}

export type CaptureSourceType = 'target' | 'history' | 'bookmark';

export interface CaptureImageMessage {
  readonly type: typeof MessageType.CaptureImage;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: {
    readonly url: string;
    readonly sourceRecordId?: string;
    readonly sourceType: CaptureSourceType;
  };
}

export interface CaptureResultMessage {
  readonly type: typeof MessageType.CaptureResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: import('../core/image/capture-result.js').CaptureResult;
}

export interface DownloadImageMessage {
  readonly type: typeof MessageType.DownloadImage;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: {
    readonly url: string;
    readonly fileName: string;
    readonly saveAs: boolean;
  };
}

export interface DownloadImageResultMessage {
  readonly type: typeof MessageType.DownloadImageResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly ok: true; readonly downloadId: number } | { readonly ok: false; readonly message: string };
}

export interface StorageUsageRequestMessage {
  readonly type: typeof MessageType.StorageUsageRequest;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: Record<string, never>;
}

export interface StorageUsageResponseMessage {
  readonly type: typeof MessageType.StorageUsageResponse;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: import('../core/image/capture-result.js').StorageUsageSummary;
}

export interface DeleteBlobMessage {
  readonly type: typeof MessageType.DeleteBlob;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly blobId: string };
}

export interface DeleteBlobResultMessage {
  readonly type: typeof MessageType.DeleteBlobResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly deleted: boolean; readonly usage: import('../core/image/capture-result.js').StorageUsageSummary };
}

export interface CleanupOrphanedBlobsMessage {
  readonly type: typeof MessageType.CleanupOrphanedBlobs;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: Record<string, never>;
}

export interface CleanupOrphanedBlobsResultMessage {
  readonly type: typeof MessageType.CleanupOrphanedBlobsResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly deletedCount: number; readonly usage: import('../core/image/capture-result.js').StorageUsageSummary };
}

export interface RetrieveBlobMessage {
  readonly type: typeof MessageType.RetrieveBlob;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly blobId: string };
}

export interface RetrieveBlobResultMessage {
  readonly type: typeof MessageType.RetrieveBlobResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload:
    | {
        readonly ok: true;
        readonly blobId: string;
        readonly dataUrl: string;
        readonly mimeType: string;
        readonly byteLength: number;
        readonly capturedAt: string;
      }
    | { readonly ok: false; readonly reason: string; readonly message: string };
}

export interface CreateBlobPreviewMessage {
  readonly type: typeof MessageType.CreateBlobPreview;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly blobId: string };
}

export interface CreateDataUrlPreviewMessage {
  readonly type: typeof MessageType.CreateDataUrlPreview;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly dataUrl: string };
}

export interface CreateBlobPreviewResultMessage {
  readonly type: typeof MessageType.CreateBlobPreviewResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload:
    | { readonly ok: true; readonly previewUrl: string; readonly byteLength: number }
    | { readonly ok: false; readonly reason: string; readonly message: string };
}

export interface FetchThumbnailSourceMessage {
  readonly type: typeof MessageType.FetchThumbnailSource;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly url: string; readonly referrer?: string };
}

export interface FetchThumbnailSourceResultMessage {
  readonly type: typeof MessageType.FetchThumbnailSourceResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload:
    | { readonly ok: true; readonly dataUrl: string; readonly mimeType: string; readonly byteLength: number; readonly sha256?: string }
    | { readonly ok: false; readonly reason: string; readonly message: string };
}

export interface GrantPermissionAndCaptureMessage {
  readonly type: typeof MessageType.GrantPermissionAndCapture;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: {
    readonly url: string;
    readonly sourceType: CaptureSourceType;
    readonly sourceRecordId?: string;
  };
}

export interface BlobKeyStatusMessage {
  readonly type: typeof MessageType.BlobKeyStatus;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: Record<string, never>;
}

export interface BlobKeyStatusResultMessage {
  readonly type: typeof MessageType.BlobKeyStatusResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload:
    | { readonly unlocked: true; readonly keyReference: string; readonly hasKey: true }
    | { readonly unlocked: false; readonly keyReference: null; readonly hasKey: boolean };
}

export interface SetupBlobKeyMessage {
  readonly type: typeof MessageType.SetupBlobKey;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly password: string };
}

export interface UnlockBlobKeyMessage {
  readonly type: typeof MessageType.UnlockBlobKey;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly password: string; readonly keyReference?: string };
}

export interface ClearBlobKeyMessage {
  readonly type: typeof MessageType.ClearBlobKey;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: Record<string, never>;
}

export interface ExportBlobKeyBackupMessage {
  readonly type: typeof MessageType.ExportBlobKeyBackup;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly password: string; readonly keyReference?: string };
}

export interface ExportBlobKeyBackupResultMessage {
  readonly type: typeof MessageType.ExportBlobKeyBackupResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload:
    | {
        readonly ok: true;
        readonly keyReference: string;
        readonly fileContent: string;
        readonly fileName: string;
        readonly message: string;
      }
    | { readonly ok: false; readonly reason: string; readonly message: string };
}

export interface ImportBlobKeyBackupMessage {
  readonly type: typeof MessageType.ImportBlobKeyBackup;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly fileContent: string; readonly password: string };
}

export interface ImportBlobKeyBackupResultMessage {
  readonly type: typeof MessageType.ImportBlobKeyBackupResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload:
    | { readonly ok: true; readonly keyReference: string; readonly imported: boolean; readonly message: string }
    | { readonly ok: false; readonly reason: string; readonly message: string };
}

export interface BlobKeyResultMessage {
  readonly type: typeof MessageType.BlobKeyResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload:
    | { readonly ok: true; readonly keyReference: string; readonly message: string }
    | { readonly ok: false; readonly reason: string; readonly message: string };
}

export interface LoadBookmarksMessage {
  readonly type: typeof MessageType.LoadBookmarks;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: {
    readonly offset: number;
    readonly limit: number;
    readonly scope?: 'global' | 'site';
    readonly currentPageUrl?: string;
  };
}

export interface LoadBookmarksResultMessage {
  readonly type: typeof MessageType.LoadBookmarksResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: {
    readonly items: readonly import('../core/display-records.js').ImageDisplayRecord[];
    readonly offset: number;
    readonly limit: number;
    readonly total: number;
    readonly hasOlder: boolean;
    readonly hasNewer: boolean;
  };
}

export interface SaveBookmarkMessage {
  readonly type: typeof MessageType.SaveBookmark;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly record: import('../core/display-records.js').ImageDisplayRecord };
}

export interface SaveBookmarkResultMessage {
  readonly type: typeof MessageType.SaveBookmarkResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload:
    | { readonly ok: true; readonly record: import('../core/display-records.js').ImageDisplayRecord }
    | { readonly ok: false; readonly message: string };
}

export interface RemoveBookmarkMessage {
  readonly type: typeof MessageType.RemoveBookmark;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly record: import('../core/display-records.js').ImageDisplayRecord };
}

export interface RemoveBookmarkResultMessage {
  readonly type: typeof MessageType.RemoveBookmarkResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly ok: boolean };
}

export interface LoadRecentHistoryMessage {
  readonly type: typeof MessageType.LoadRecentHistory;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly pageUrl: string };
}

export interface LoadRecentHistoryResultMessage {
  readonly type: typeof MessageType.LoadRecentHistoryResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly items: readonly import('../core/display-records.js').ImageDisplayRecord[] };
}

export interface AddRecentHistoryMessage {
  readonly type: typeof MessageType.AddRecentHistory;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly pageUrl: string; readonly item: import('../core/display-records.js').ImageDisplayRecord };
}

export interface AddRecentHistoryResultMessage {
  readonly type: typeof MessageType.AddRecentHistoryResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly items: readonly import('../core/display-records.js').ImageDisplayRecord[] };
}

export interface RemoveRecentHistoryMessage {
  readonly type: typeof MessageType.RemoveRecentHistory;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly pageUrl: string; readonly id: string };
}

export interface RemoveRecentHistoryResultMessage {
  readonly type: typeof MessageType.RemoveRecentHistoryResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly items: readonly import('../core/display-records.js').ImageDisplayRecord[] };
}

export type ExtensionRequest =
  | TogglePanelMessage
  | PingMessage
  | CaptureImageMessage
  | DownloadImageMessage
  | StorageUsageRequestMessage
  | DeleteBlobMessage
  | CleanupOrphanedBlobsMessage
  | RetrieveBlobMessage
  | CreateBlobPreviewMessage
  | CreateDataUrlPreviewMessage
  | FetchThumbnailSourceMessage
  | GrantPermissionAndCaptureMessage
  | BlobKeyStatusMessage
  | SetupBlobKeyMessage
  | UnlockBlobKeyMessage
  | ClearBlobKeyMessage
  | ExportBlobKeyBackupMessage
  | ImportBlobKeyBackupMessage
  | LoadBookmarksMessage
  | SaveBookmarkMessage
  | RemoveBookmarkMessage
  | LoadRecentHistoryMessage
  | AddRecentHistoryMessage
  | RemoveRecentHistoryMessage;
export type ExtensionResponse =
  | StatusMessage
  | UnknownMessageResponse
  | CaptureResultMessage
  | DownloadImageResultMessage
  | StorageUsageResponseMessage
  | DeleteBlobResultMessage
  | CleanupOrphanedBlobsResultMessage
  | RetrieveBlobResultMessage
  | CreateBlobPreviewResultMessage
  | FetchThumbnailSourceResultMessage
  | BlobKeyStatusResultMessage
  | BlobKeyResultMessage
  | ExportBlobKeyBackupResultMessage
  | ImportBlobKeyBackupResultMessage
  | LoadBookmarksResultMessage
  | SaveBookmarkResultMessage
  | RemoveBookmarkResultMessage
  | LoadRecentHistoryResultMessage
  | AddRecentHistoryResultMessage
  | RemoveRecentHistoryResultMessage;
export type ExtensionMessage = ExtensionRequest | ExtensionResponse;

export function createTogglePanelMessage(): TogglePanelMessage {
  return { type: MessageType.TogglePanel, version: MESSAGE_PROTOCOL_VERSION, payload: { source: 'browserAction' } };
}

export function createPingMessage(): PingMessage {
  return { type: MessageType.Ping, version: MESSAGE_PROTOCOL_VERSION, payload: { sentAt: Date.now() } };
}

export function createStatusMessage(panelVisible: boolean, status: string): StatusMessage {
  return { type: MessageType.Status, version: MESSAGE_PROTOCOL_VERSION, payload: { panelVisible, status } };
}

export function createUnknownMessageResponse(reason: string): UnknownMessageResponse {
  return { type: MessageType.Unknown, version: MESSAGE_PROTOCOL_VERSION, payload: { reason } };
}

export function createCaptureImageMessage(url: string, sourceType: CaptureSourceType, sourceRecordId?: string): CaptureImageMessage {
  return { type: MessageType.CaptureImage, version: MESSAGE_PROTOCOL_VERSION, payload: { url, sourceType, sourceRecordId } };
}

export function createCaptureResultMessage(result: import('../core/image/capture-result.js').CaptureResult): CaptureResultMessage {
  return { type: MessageType.CaptureResult, version: MESSAGE_PROTOCOL_VERSION, payload: result };
}

export function createDownloadImageMessage(url: string, fileName: string, saveAs: boolean): DownloadImageMessage {
  return { type: MessageType.DownloadImage, version: MESSAGE_PROTOCOL_VERSION, payload: { url, fileName, saveAs } };
}

export function createDownloadImageResultMessage(payload: DownloadImageResultMessage['payload']): DownloadImageResultMessage {
  return { type: MessageType.DownloadImageResult, version: MESSAGE_PROTOCOL_VERSION, payload };
}

export function createStorageUsageRequestMessage(): StorageUsageRequestMessage {
  return { type: MessageType.StorageUsageRequest, version: MESSAGE_PROTOCOL_VERSION, payload: {} };
}

export function createStorageUsageResponseMessage(
  usage: import('../core/image/capture-result.js').StorageUsageSummary,
): StorageUsageResponseMessage {
  return { type: MessageType.StorageUsageResponse, version: MESSAGE_PROTOCOL_VERSION, payload: usage };
}

export function createDeleteBlobMessage(blobId: string): DeleteBlobMessage {
  return { type: MessageType.DeleteBlob, version: MESSAGE_PROTOCOL_VERSION, payload: { blobId } };
}

export function createCleanupOrphanedBlobsMessage(): CleanupOrphanedBlobsMessage {
  return { type: MessageType.CleanupOrphanedBlobs, version: MESSAGE_PROTOCOL_VERSION, payload: {} };
}

export function createRetrieveBlobMessage(blobId: string): RetrieveBlobMessage {
  return { type: MessageType.RetrieveBlob, version: MESSAGE_PROTOCOL_VERSION, payload: { blobId } };
}

export function createCreateBlobPreviewMessage(blobId: string): CreateBlobPreviewMessage {
  return { type: MessageType.CreateBlobPreview, version: MESSAGE_PROTOCOL_VERSION, payload: { blobId } };
}

export function createCreateDataUrlPreviewMessage(dataUrl: string): CreateDataUrlPreviewMessage {
  return { type: MessageType.CreateDataUrlPreview, version: MESSAGE_PROTOCOL_VERSION, payload: { dataUrl } };
}

export function createFetchThumbnailSourceMessage(url: string, referrer?: string): FetchThumbnailSourceMessage {
  return { type: MessageType.FetchThumbnailSource, version: MESSAGE_PROTOCOL_VERSION, payload: { url, referrer } };
}

export function createRetrieveBlobResultMessage(payload: RetrieveBlobResultMessage['payload']): RetrieveBlobResultMessage {
  return { type: MessageType.RetrieveBlobResult, version: MESSAGE_PROTOCOL_VERSION, payload };
}

export function createCreateBlobPreviewResultMessage(payload: CreateBlobPreviewResultMessage['payload']): CreateBlobPreviewResultMessage {
  return { type: MessageType.CreateBlobPreviewResult, version: MESSAGE_PROTOCOL_VERSION, payload };
}

export function createFetchThumbnailSourceResultMessage(
  payload: FetchThumbnailSourceResultMessage['payload'],
): FetchThumbnailSourceResultMessage {
  return { type: MessageType.FetchThumbnailSourceResult, version: MESSAGE_PROTOCOL_VERSION, payload };
}

export function createGrantPermissionAndCaptureMessage(
  url: string,
  sourceType: CaptureSourceType,
  sourceRecordId?: string,
): GrantPermissionAndCaptureMessage {
  return { type: MessageType.GrantPermissionAndCapture, version: MESSAGE_PROTOCOL_VERSION, payload: { url, sourceType, sourceRecordId } };
}

export function createBlobKeyStatusMessage(): BlobKeyStatusMessage {
  return { type: MessageType.BlobKeyStatus, version: MESSAGE_PROTOCOL_VERSION, payload: {} };
}

export function createBlobKeyStatusResultMessage(payload: BlobKeyStatusResultMessage['payload']): BlobKeyStatusResultMessage {
  return { type: MessageType.BlobKeyStatusResult, version: MESSAGE_PROTOCOL_VERSION, payload };
}

export function createDeleteBlobResultMessage(
  deleted: boolean,
  usage: import('../core/image/capture-result.js').StorageUsageSummary,
): DeleteBlobResultMessage {
  return { type: MessageType.DeleteBlobResult, version: MESSAGE_PROTOCOL_VERSION, payload: { deleted, usage } };
}

export function createCleanupOrphanedBlobsResultMessage(
  payload: CleanupOrphanedBlobsResultMessage['payload'],
): CleanupOrphanedBlobsResultMessage {
  return { type: MessageType.CleanupOrphanedBlobsResult, version: MESSAGE_PROTOCOL_VERSION, payload };
}

export function createSetupBlobKeyMessage(password: string): SetupBlobKeyMessage {
  return { type: MessageType.SetupBlobKey, version: MESSAGE_PROTOCOL_VERSION, payload: { password } };
}

export function createUnlockBlobKeyMessage(password: string, keyReference?: string): UnlockBlobKeyMessage {
  return { type: MessageType.UnlockBlobKey, version: MESSAGE_PROTOCOL_VERSION, payload: { password, keyReference } };
}

export function createClearBlobKeyMessage(): ClearBlobKeyMessage {
  return { type: MessageType.ClearBlobKey, version: MESSAGE_PROTOCOL_VERSION, payload: {} };
}

export function createExportBlobKeyBackupMessage(password: string, keyReference?: string): ExportBlobKeyBackupMessage {
  return { type: MessageType.ExportBlobKeyBackup, version: MESSAGE_PROTOCOL_VERSION, payload: { password, keyReference } };
}

export function createExportBlobKeyBackupResultMessage(
  payload: ExportBlobKeyBackupResultMessage['payload'],
): ExportBlobKeyBackupResultMessage {
  return { type: MessageType.ExportBlobKeyBackupResult, version: MESSAGE_PROTOCOL_VERSION, payload };
}

export function createImportBlobKeyBackupMessage(fileContent: string, password: string): ImportBlobKeyBackupMessage {
  return { type: MessageType.ImportBlobKeyBackup, version: MESSAGE_PROTOCOL_VERSION, payload: { fileContent, password } };
}

export function createImportBlobKeyBackupResultMessage(
  payload: ImportBlobKeyBackupResultMessage['payload'],
): ImportBlobKeyBackupResultMessage {
  return { type: MessageType.ImportBlobKeyBackupResult, version: MESSAGE_PROTOCOL_VERSION, payload };
}

export function createBlobKeyResultMessage(payload: BlobKeyResultMessage['payload']): BlobKeyResultMessage {
  return { type: MessageType.BlobKeyResult, version: MESSAGE_PROTOCOL_VERSION, payload };
}

export function createLoadBookmarksMessage(payload: LoadBookmarksMessage['payload']): LoadBookmarksMessage {
  return { type: MessageType.LoadBookmarks, version: MESSAGE_PROTOCOL_VERSION, payload };
}

export function createLoadBookmarksResultMessage(payload: LoadBookmarksResultMessage['payload']): LoadBookmarksResultMessage {
  return { type: MessageType.LoadBookmarksResult, version: MESSAGE_PROTOCOL_VERSION, payload };
}

export function createSaveBookmarkMessage(record: import('../core/display-records.js').ImageDisplayRecord): SaveBookmarkMessage {
  return { type: MessageType.SaveBookmark, version: MESSAGE_PROTOCOL_VERSION, payload: { record } };
}

export function createSaveBookmarkResultMessage(payload: SaveBookmarkResultMessage['payload']): SaveBookmarkResultMessage {
  return { type: MessageType.SaveBookmarkResult, version: MESSAGE_PROTOCOL_VERSION, payload };
}

export function createRemoveBookmarkMessage(record: import('../core/display-records.js').ImageDisplayRecord): RemoveBookmarkMessage {
  return { type: MessageType.RemoveBookmark, version: MESSAGE_PROTOCOL_VERSION, payload: { record } };
}

export function createRemoveBookmarkResultMessage(payload: RemoveBookmarkResultMessage['payload']): RemoveBookmarkResultMessage {
  return { type: MessageType.RemoveBookmarkResult, version: MESSAGE_PROTOCOL_VERSION, payload };
}

export function createLoadRecentHistoryMessage(pageUrl: string): LoadRecentHistoryMessage {
  return { type: MessageType.LoadRecentHistory, version: MESSAGE_PROTOCOL_VERSION, payload: { pageUrl } };
}

export function createLoadRecentHistoryResultMessage(
  items: readonly import('../core/display-records.js').ImageDisplayRecord[],
): LoadRecentHistoryResultMessage {
  return { type: MessageType.LoadRecentHistoryResult, version: MESSAGE_PROTOCOL_VERSION, payload: { items } };
}

export function createAddRecentHistoryMessage(
  pageUrl: string,
  item: import('../core/display-records.js').ImageDisplayRecord,
): AddRecentHistoryMessage {
  return { type: MessageType.AddRecentHistory, version: MESSAGE_PROTOCOL_VERSION, payload: { pageUrl, item } };
}

export function createAddRecentHistoryResultMessage(
  items: readonly import('../core/display-records.js').ImageDisplayRecord[],
): AddRecentHistoryResultMessage {
  return { type: MessageType.AddRecentHistoryResult, version: MESSAGE_PROTOCOL_VERSION, payload: { items } };
}

export function createRemoveRecentHistoryMessage(pageUrl: string, id: string): RemoveRecentHistoryMessage {
  return { type: MessageType.RemoveRecentHistory, version: MESSAGE_PROTOCOL_VERSION, payload: { pageUrl, id } };
}

export function createRemoveRecentHistoryResultMessage(
  items: readonly import('../core/display-records.js').ImageDisplayRecord[],
): RemoveRecentHistoryResultMessage {
  return { type: MessageType.RemoveRecentHistoryResult, version: MESSAGE_PROTOCOL_VERSION, payload: { items } };
}

function hasVersionedObjectShape(value: unknown): value is { type?: unknown; version?: unknown; payload?: unknown } {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as { version?: unknown; payload?: unknown };
  return candidate.version === MESSAGE_PROTOCOL_VERSION && !!candidate.payload && typeof candidate.payload === 'object';
}

export function isExtensionRequest(value: unknown): value is ExtensionRequest {
  if (!hasVersionedObjectShape(value)) return false;
  return (
    value.type === MessageType.TogglePanel ||
    value.type === MessageType.Ping ||
    value.type === MessageType.CaptureImage ||
    value.type === MessageType.DownloadImage ||
    value.type === MessageType.StorageUsageRequest ||
    value.type === MessageType.DeleteBlob ||
    value.type === MessageType.CleanupOrphanedBlobs ||
    value.type === MessageType.RetrieveBlob ||
    value.type === MessageType.CreateBlobPreview ||
    value.type === MessageType.CreateDataUrlPreview ||
    value.type === MessageType.FetchThumbnailSource ||
    value.type === MessageType.GrantPermissionAndCapture ||
    value.type === MessageType.BlobKeyStatus ||
    value.type === MessageType.SetupBlobKey ||
    value.type === MessageType.UnlockBlobKey ||
    value.type === MessageType.ClearBlobKey ||
    value.type === MessageType.ExportBlobKeyBackup ||
    value.type === MessageType.ImportBlobKeyBackup ||
    value.type === MessageType.LoadBookmarks ||
    value.type === MessageType.SaveBookmark ||
    value.type === MessageType.RemoveBookmark ||
    value.type === MessageType.LoadRecentHistory ||
    value.type === MessageType.AddRecentHistory ||
    value.type === MessageType.RemoveRecentHistory
  );
}

export function isExtensionResponse(value: unknown): value is ExtensionResponse {
  if (!hasVersionedObjectShape(value)) return false;
  return (
    value.type === MessageType.Status ||
    value.type === MessageType.Unknown ||
    value.type === MessageType.CaptureResult ||
    value.type === MessageType.DownloadImageResult ||
    value.type === MessageType.StorageUsageResponse ||
    value.type === MessageType.DeleteBlobResult ||
    value.type === MessageType.CleanupOrphanedBlobsResult ||
    value.type === MessageType.RetrieveBlobResult ||
    value.type === MessageType.CreateBlobPreviewResult ||
    value.type === MessageType.FetchThumbnailSourceResult ||
    value.type === MessageType.BlobKeyStatusResult ||
    value.type === MessageType.BlobKeyResult ||
    value.type === MessageType.ExportBlobKeyBackupResult ||
    value.type === MessageType.ImportBlobKeyBackupResult ||
    value.type === MessageType.LoadBookmarksResult ||
    value.type === MessageType.SaveBookmarkResult ||
    value.type === MessageType.RemoveBookmarkResult ||
    value.type === MessageType.LoadRecentHistoryResult ||
    value.type === MessageType.AddRecentHistoryResult ||
    value.type === MessageType.RemoveRecentHistoryResult
  );
}

export function isBlobKeyResultMessage(value: unknown): value is BlobKeyResultMessage {
  if (!hasVersionedObjectShape(value)) return false;
  return value.type === MessageType.BlobKeyResult;
}

export function isExportBlobKeyBackupResultMessage(value: unknown): value is ExportBlobKeyBackupResultMessage {
  if (!hasVersionedObjectShape(value)) return false;
  return value.type === MessageType.ExportBlobKeyBackupResult;
}

export function isImportBlobKeyBackupResultMessage(value: unknown): value is ImportBlobKeyBackupResultMessage {
  if (!hasVersionedObjectShape(value)) return false;
  return value.type === MessageType.ImportBlobKeyBackupResult;
}

export function isBlobKeyStatusResultMessage(value: unknown): value is BlobKeyStatusResultMessage {
  if (!hasVersionedObjectShape(value)) return false;
  return value.type === MessageType.BlobKeyStatusResult;
}

export function isRetrieveBlobResultMessage(value: unknown): value is RetrieveBlobResultMessage {
  if (!hasVersionedObjectShape(value)) return false;
  return value.type === MessageType.RetrieveBlobResult;
}

export function isCleanupOrphanedBlobsResultMessage(value: unknown): value is CleanupOrphanedBlobsResultMessage {
  if (!hasVersionedObjectShape(value)) return false;
  return value.type === MessageType.CleanupOrphanedBlobsResult;
}

export function isCreateBlobPreviewResultMessage(value: unknown): value is CreateBlobPreviewResultMessage {
  if (!hasVersionedObjectShape(value)) return false;
  return value.type === MessageType.CreateBlobPreviewResult;
}

export function isFetchThumbnailSourceResultMessage(value: unknown): value is FetchThumbnailSourceResultMessage {
  if (!hasVersionedObjectShape(value)) return false;
  return value.type === MessageType.FetchThumbnailSourceResult;
}

export function isCaptureResultMessage(value: unknown): value is CaptureResultMessage {
  if (!hasVersionedObjectShape(value)) return false;
  return value.type === MessageType.CaptureResult;
}

export function isDownloadImageResultMessage(value: unknown): value is DownloadImageResultMessage {
  if (!hasVersionedObjectShape(value)) return false;
  return value.type === MessageType.DownloadImageResult;
}

export function isLoadBookmarksResultMessage(value: unknown): value is LoadBookmarksResultMessage {
  if (!hasVersionedObjectShape(value)) return false;
  return value.type === MessageType.LoadBookmarksResult;
}

export function isSaveBookmarkResultMessage(value: unknown): value is SaveBookmarkResultMessage {
  if (!hasVersionedObjectShape(value)) return false;
  return value.type === MessageType.SaveBookmarkResult;
}

export function isRemoveBookmarkResultMessage(value: unknown): value is RemoveBookmarkResultMessage {
  if (!hasVersionedObjectShape(value)) return false;
  return value.type === MessageType.RemoveBookmarkResult;
}

export function isLoadRecentHistoryResultMessage(value: unknown): value is LoadRecentHistoryResultMessage {
  if (!hasVersionedObjectShape(value)) return false;
  return value.type === MessageType.LoadRecentHistoryResult;
}

export function isAddRecentHistoryResultMessage(value: unknown): value is AddRecentHistoryResultMessage {
  if (!hasVersionedObjectShape(value)) return false;
  return value.type === MessageType.AddRecentHistoryResult;
}

export function isRemoveRecentHistoryResultMessage(value: unknown): value is RemoveRecentHistoryResultMessage {
  if (!hasVersionedObjectShape(value)) return false;
  return value.type === MessageType.RemoveRecentHistoryResult;
}

export function isStatusMessage(value: unknown): value is StatusMessage {
  if (!isExtensionResponse(value) || value.type !== MessageType.Status) return false;
  const payload = value.payload as { panelVisible?: unknown; status?: unknown };
  return typeof payload.panelVisible === 'boolean' && typeof payload.status === 'string';
}
