import type { CaptureSourceType } from '../core/image/capture-result.js';
import { MESSAGE_PROTOCOL_VERSION, MessageType } from './message-protocol.js';

export type { CaptureSourceType } from '../core/image/capture-result.js';

interface CaptureRequestPayload {
  readonly url: string;
  readonly sourceType: CaptureSourceType;
  readonly sourceRecordId?: string | undefined;
  readonly fileName?: string | undefined;
}

export interface CaptureImageMessage {
  readonly type: typeof MessageType.CaptureImage;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: CaptureRequestPayload;
}

export interface GrantPermissionAndCaptureMessage {
  readonly type: typeof MessageType.GrantPermissionAndCapture;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: CaptureRequestPayload;
}

export function createCaptureImageMessage(
  url: string,
  sourceType: CaptureSourceType,
  sourceRecordId?: string,
  fileName?: string,
): CaptureImageMessage {
  return captureRequestMessage(MessageType.CaptureImage, url, sourceType, sourceRecordId, fileName);
}

export function createGrantPermissionAndCaptureMessage(
  url: string,
  sourceType: CaptureSourceType,
  sourceRecordId?: string,
  fileName?: string,
): GrantPermissionAndCaptureMessage {
  return captureRequestMessage(MessageType.GrantPermissionAndCapture, url, sourceType, sourceRecordId, fileName);
}

function captureRequestMessage<T extends typeof MessageType.CaptureImage | typeof MessageType.GrantPermissionAndCapture>(
  type: T,
  url: string,
  sourceType: CaptureSourceType,
  sourceRecordId?: string,
  fileName?: string,
): {
  readonly type: T;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: CaptureRequestPayload;
} {
  return {
    type,
    version: MESSAGE_PROTOCOL_VERSION,
    payload: { url, sourceType, ...(sourceRecordId ? { sourceRecordId } : {}), ...(fileName ? { fileName } : {}) },
  };
}
