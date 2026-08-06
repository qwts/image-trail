import type { CaptureSourceType } from '../../core/image/capture-result.js';
import { MESSAGE_PROTOCOL_VERSION, MessageType } from '../message-protocol.js';

export type { CaptureSourceType } from '../../core/image/capture-result.js';

export interface CaptureImageMessage {
  readonly type: typeof MessageType.CaptureImage;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: {
    readonly url: string;
    readonly sourceRecordId?: string | undefined;
    readonly sourceType: CaptureSourceType;
    readonly fileName?: string | undefined;
  };
}

export interface CaptureResultMessage {
  readonly type: typeof MessageType.CaptureResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: import('../../core/image/capture-result.js').CaptureResult;
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

export interface ExportEncryptedImageMessage {
  readonly type: typeof MessageType.ExportEncryptedImage;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: {
    readonly url: string;
    readonly fileName: string;
    readonly blobId?: string | undefined;
  };
}

export interface ExportEncryptedImageResultMessage {
  readonly type: typeof MessageType.ExportEncryptedImageResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload:
    | { readonly ok: true; readonly fileContent: string; readonly fileName: string; readonly message: string }
    | { readonly ok: false; readonly reason: string; readonly message: string };
}

export interface ImportEncryptedImageMessage {
  readonly type: typeof MessageType.ImportEncryptedImage;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly fileContent: string };
}

export interface ImportEncryptedImageResultMessage {
  readonly type: typeof MessageType.ImportEncryptedImageResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload:
    | {
        readonly ok: true;
        readonly fileName: string;
        readonly record: import('../../core/display-records.js').ImageDisplayRecord;
      }
    | { readonly ok: false; readonly reason: string; readonly message: string };
}

export interface StorageUsageRequestMessage {
  readonly type: typeof MessageType.StorageUsageRequest;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: Record<string, never>;
}

export interface StorageUsageResponseMessage {
  readonly type: typeof MessageType.StorageUsageResponse;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: import('../../core/image/capture-result.js').StorageUsageSummary;
}

export interface DeleteBlobMessage {
  readonly type: typeof MessageType.DeleteBlob;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly blobId: string };
}

export interface DeleteBlobResultMessage {
  readonly type: typeof MessageType.DeleteBlobResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly deleted: boolean; readonly usage: import('../../core/image/capture-result.js').StorageUsageSummary };
}

export interface CleanupOrphanedBlobsMessage {
  readonly type: typeof MessageType.CleanupOrphanedBlobs;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: Record<string, never>;
}

export interface CleanupOrphanedBlobsResultMessage {
  readonly type: typeof MessageType.CleanupOrphanedBlobsResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly deletedCount: number; readonly usage: import('../../core/image/capture-result.js').StorageUsageSummary };
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
    | ({ readonly ok: true; readonly dataUrl: string } & import('../../core/image/capture-result.js').StoredOriginalReference)
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

export interface GrantPermissionAndCaptureMessage {
  readonly type: typeof MessageType.GrantPermissionAndCapture;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: {
    readonly url: string;
    readonly sourceType: CaptureSourceType;
    readonly sourceRecordId?: string | undefined;
    readonly fileName?: string | undefined;
  };
}

export function createCaptureImageMessage(
  url: string,
  sourceType: CaptureSourceType,
  sourceRecordId?: string,
  fileName?: string,
): CaptureImageMessage {
  return {
    type: MessageType.CaptureImage,
    version: MESSAGE_PROTOCOL_VERSION,
    payload: { url, sourceType, ...(sourceRecordId ? { sourceRecordId } : {}), ...(fileName ? { fileName } : {}) },
  };
}

export function createCaptureResultMessage(result: import('../../core/image/capture-result.js').CaptureResult): CaptureResultMessage {
  return { type: MessageType.CaptureResult, version: MESSAGE_PROTOCOL_VERSION, payload: result };
}

export function createDownloadImageMessage(url: string, fileName: string, saveAs: boolean): DownloadImageMessage {
  return { type: MessageType.DownloadImage, version: MESSAGE_PROTOCOL_VERSION, payload: { url, fileName, saveAs } };
}

export function createDownloadImageResultMessage(payload: DownloadImageResultMessage['payload']): DownloadImageResultMessage {
  return { type: MessageType.DownloadImageResult, version: MESSAGE_PROTOCOL_VERSION, payload };
}

export function createExportEncryptedImageMessage(url: string, fileName: string, blobId?: string): ExportEncryptedImageMessage {
  return { type: MessageType.ExportEncryptedImage, version: MESSAGE_PROTOCOL_VERSION, payload: { url, fileName, blobId } };
}

export function createExportEncryptedImageResultMessage(
  payload: ExportEncryptedImageResultMessage['payload'],
): ExportEncryptedImageResultMessage {
  return { type: MessageType.ExportEncryptedImageResult, version: MESSAGE_PROTOCOL_VERSION, payload };
}

export function createImportEncryptedImageMessage(fileContent: string): ImportEncryptedImageMessage {
  return { type: MessageType.ImportEncryptedImage, version: MESSAGE_PROTOCOL_VERSION, payload: { fileContent } };
}

export function createImportEncryptedImageResultMessage(
  payload: ImportEncryptedImageResultMessage['payload'],
): ImportEncryptedImageResultMessage {
  return { type: MessageType.ImportEncryptedImageResult, version: MESSAGE_PROTOCOL_VERSION, payload };
}

export function createStorageUsageRequestMessage(): StorageUsageRequestMessage {
  return { type: MessageType.StorageUsageRequest, version: MESSAGE_PROTOCOL_VERSION, payload: {} };
}

export function createStorageUsageResponseMessage(
  usage: import('../../core/image/capture-result.js').StorageUsageSummary,
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

export function createRetrieveBlobResultMessage(payload: RetrieveBlobResultMessage['payload']): RetrieveBlobResultMessage {
  return { type: MessageType.RetrieveBlobResult, version: MESSAGE_PROTOCOL_VERSION, payload };
}

export function createCreateBlobPreviewResultMessage(payload: CreateBlobPreviewResultMessage['payload']): CreateBlobPreviewResultMessage {
  return { type: MessageType.CreateBlobPreviewResult, version: MESSAGE_PROTOCOL_VERSION, payload };
}

export function createGrantPermissionAndCaptureMessage(
  url: string,
  sourceType: CaptureSourceType,
  sourceRecordId?: string,
  fileName?: string,
): GrantPermissionAndCaptureMessage {
  return {
    type: MessageType.GrantPermissionAndCapture,
    version: MESSAGE_PROTOCOL_VERSION,
    payload: { url, sourceType, ...(sourceRecordId ? { sourceRecordId } : {}), ...(fileName ? { fileName } : {}) },
  };
}

export function createDeleteBlobResultMessage(
  deleted: boolean,
  usage: import('../../core/image/capture-result.js').StorageUsageSummary,
): DeleteBlobResultMessage {
  return { type: MessageType.DeleteBlobResult, version: MESSAGE_PROTOCOL_VERSION, payload: { deleted, usage } };
}

export function createCleanupOrphanedBlobsResultMessage(
  payload: CleanupOrphanedBlobsResultMessage['payload'],
): CleanupOrphanedBlobsResultMessage {
  return { type: MessageType.CleanupOrphanedBlobsResult, version: MESSAGE_PROTOCOL_VERSION, payload };
}

export type BlobRequest =
  | CaptureImageMessage
  | DownloadImageMessage
  | ExportEncryptedImageMessage
  | ImportEncryptedImageMessage
  | StorageUsageRequestMessage
  | DeleteBlobMessage
  | CleanupOrphanedBlobsMessage
  | RetrieveBlobMessage
  | CreateBlobPreviewMessage
  | CreateDataUrlPreviewMessage
  | GrantPermissionAndCaptureMessage;

export type BlobResponse =
  | CaptureResultMessage
  | DownloadImageResultMessage
  | ExportEncryptedImageResultMessage
  | ImportEncryptedImageResultMessage
  | StorageUsageResponseMessage
  | DeleteBlobResultMessage
  | CleanupOrphanedBlobsResultMessage
  | RetrieveBlobResultMessage
  | CreateBlobPreviewResultMessage;
