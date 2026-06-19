export const MESSAGE_PROTOCOL_VERSION = 1;

export const MessageType = {
  TogglePanel: 'imageTrail.togglePanel',
  Ping: 'imageTrail.ping',
  Status: 'imageTrail.status',
  Unknown: 'imageTrail.unknown',
  CaptureImage: 'imageTrail.captureImage',
  CaptureResult: 'imageTrail.captureResult',
  StorageUsageRequest: 'imageTrail.storageUsageRequest',
  StorageUsageResponse: 'imageTrail.storageUsageResponse',
  DeleteBlob: 'imageTrail.deleteBlob',
  DeleteBlobResult: 'imageTrail.deleteBlobResult',
  RetrieveBlob: 'imageTrail.retrieveBlob',
  RetrieveBlobResult: 'imageTrail.retrieveBlobResult',
  CreateBlobPreview: 'imageTrail.createBlobPreview',
  CreateBlobPreviewResult: 'imageTrail.createBlobPreviewResult',
  GrantPermissionAndCapture: 'imageTrail.grantPermissionAndCapture',
  SetupBlobKey: 'imageTrail.setupBlobKey',
  UnlockBlobKey: 'imageTrail.unlockBlobKey',
  BlobKeyResult: 'imageTrail.blobKeyResult',
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
    readonly sourceRecordId?: string;
  };
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

export interface BlobKeyResultMessage {
  readonly type: typeof MessageType.BlobKeyResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload:
    | { readonly ok: true; readonly keyReference: string; readonly message: string }
    | { readonly ok: false; readonly reason: string; readonly message: string };
}

export type ExtensionRequest =
  | TogglePanelMessage
  | PingMessage
  | CaptureImageMessage
  | StorageUsageRequestMessage
  | DeleteBlobMessage
  | RetrieveBlobMessage
  | CreateBlobPreviewMessage
  | GrantPermissionAndCaptureMessage
  | SetupBlobKeyMessage
  | UnlockBlobKeyMessage;
export type ExtensionResponse =
  | StatusMessage
  | UnknownMessageResponse
  | CaptureResultMessage
  | StorageUsageResponseMessage
  | DeleteBlobResultMessage
  | RetrieveBlobResultMessage
  | CreateBlobPreviewResultMessage
  | BlobKeyResultMessage;
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

export function createRetrieveBlobMessage(blobId: string): RetrieveBlobMessage {
  return { type: MessageType.RetrieveBlob, version: MESSAGE_PROTOCOL_VERSION, payload: { blobId } };
}

export function createCreateBlobPreviewMessage(blobId: string): CreateBlobPreviewMessage {
  return { type: MessageType.CreateBlobPreview, version: MESSAGE_PROTOCOL_VERSION, payload: { blobId } };
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
): GrantPermissionAndCaptureMessage {
  return { type: MessageType.GrantPermissionAndCapture, version: MESSAGE_PROTOCOL_VERSION, payload: { url, sourceType, sourceRecordId } };
}

export function createDeleteBlobResultMessage(
  deleted: boolean,
  usage: import('../core/image/capture-result.js').StorageUsageSummary,
): DeleteBlobResultMessage {
  return { type: MessageType.DeleteBlobResult, version: MESSAGE_PROTOCOL_VERSION, payload: { deleted, usage } };
}

export function createSetupBlobKeyMessage(password: string): SetupBlobKeyMessage {
  return { type: MessageType.SetupBlobKey, version: MESSAGE_PROTOCOL_VERSION, payload: { password } };
}

export function createUnlockBlobKeyMessage(password: string, keyReference?: string): UnlockBlobKeyMessage {
  return { type: MessageType.UnlockBlobKey, version: MESSAGE_PROTOCOL_VERSION, payload: { password, keyReference } };
}

export function createBlobKeyResultMessage(payload: BlobKeyResultMessage['payload']): BlobKeyResultMessage {
  return { type: MessageType.BlobKeyResult, version: MESSAGE_PROTOCOL_VERSION, payload };
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
    value.type === MessageType.StorageUsageRequest ||
    value.type === MessageType.DeleteBlob ||
    value.type === MessageType.RetrieveBlob ||
    value.type === MessageType.CreateBlobPreview ||
    value.type === MessageType.GrantPermissionAndCapture ||
    value.type === MessageType.SetupBlobKey ||
    value.type === MessageType.UnlockBlobKey
  );
}

export function isExtensionResponse(value: unknown): value is ExtensionResponse {
  if (!hasVersionedObjectShape(value)) return false;
  return (
    value.type === MessageType.Status ||
    value.type === MessageType.Unknown ||
    value.type === MessageType.CaptureResult ||
    value.type === MessageType.StorageUsageResponse ||
    value.type === MessageType.DeleteBlobResult ||
    value.type === MessageType.RetrieveBlobResult ||
    value.type === MessageType.CreateBlobPreviewResult ||
    value.type === MessageType.BlobKeyResult
  );
}

export function isBlobKeyResultMessage(value: unknown): value is BlobKeyResultMessage {
  if (!hasVersionedObjectShape(value)) return false;
  return value.type === MessageType.BlobKeyResult;
}

export function isRetrieveBlobResultMessage(value: unknown): value is RetrieveBlobResultMessage {
  if (!hasVersionedObjectShape(value)) return false;
  return value.type === MessageType.RetrieveBlobResult;
}

export function isCreateBlobPreviewResultMessage(value: unknown): value is CreateBlobPreviewResultMessage {
  if (!hasVersionedObjectShape(value)) return false;
  return value.type === MessageType.CreateBlobPreviewResult;
}

export function isCaptureResultMessage(value: unknown): value is CaptureResultMessage {
  if (!hasVersionedObjectShape(value)) return false;
  return value.type === MessageType.CaptureResult;
}

export function isStatusMessage(value: unknown): value is StatusMessage {
  if (!isExtensionResponse(value) || value.type !== MessageType.Status) return false;
  const payload = value.payload as { panelVisible?: unknown; status?: unknown };
  return typeof payload.panelVisible === 'boolean' && typeof payload.status === 'string';
}
