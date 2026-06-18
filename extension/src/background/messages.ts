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
  GrantPermissionAndCapture: 'imageTrail.grantPermissionAndCapture',
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

export interface GrantPermissionAndCaptureMessage {
  readonly type: typeof MessageType.GrantPermissionAndCapture;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: {
    readonly url: string;
    readonly sourceType: CaptureSourceType;
    readonly sourceRecordId?: string;
  };
}

export type ExtensionRequest =
  | TogglePanelMessage
  | PingMessage
  | CaptureImageMessage
  | StorageUsageRequestMessage
  | DeleteBlobMessage
  | GrantPermissionAndCaptureMessage;
export type ExtensionResponse =
  | StatusMessage
  | UnknownMessageResponse
  | CaptureResultMessage
  | StorageUsageResponseMessage
  | DeleteBlobResultMessage;
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
    value.type === MessageType.GrantPermissionAndCapture
  );
}

export function isExtensionResponse(value: unknown): value is ExtensionResponse {
  if (!hasVersionedObjectShape(value)) return false;
  return (
    value.type === MessageType.Status ||
    value.type === MessageType.Unknown ||
    value.type === MessageType.CaptureResult ||
    value.type === MessageType.StorageUsageResponse ||
    value.type === MessageType.DeleteBlobResult
  );
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
