import type { ImageProbeMethod, ImageRequestIntent, ImageSourceProfile } from '../../core/image/request-policy.js';
import { MESSAGE_PROTOCOL_VERSION, MessageType } from '../message-protocol.js';

export interface FetchThumbnailSourceMessage {
  readonly type: typeof MessageType.FetchThumbnailSource;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: {
    readonly url: string;
    readonly referrer?: string | undefined;
    readonly intent?: ImageRequestIntent | undefined;
    readonly contextKey?: string | undefined;
    readonly sourceProfile?: ImageSourceProfile | undefined;
  };
}

export interface FetchThumbnailSourceResultMessage {
  readonly type: typeof MessageType.FetchThumbnailSourceResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload:
    | {
        readonly ok: true;
        readonly dataUrl: string;
        readonly mimeType: string;
        readonly byteLength: number;
        readonly sha256?: string | undefined;
      }
    | { readonly ok: false; readonly reason: string; readonly message: string };
}

export interface ProbeImageSourceMessage {
  readonly type: typeof MessageType.ProbeImageSource;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: {
    readonly url: string;
    readonly referrer?: string | undefined;
    readonly timeoutMs: number;
    readonly contextKey?: string | undefined;
    readonly probeMethod?: ImageProbeMethod | undefined;
  };
}

export interface ProbeImageSourceResultMessage {
  readonly type: typeof MessageType.ProbeImageSourceResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload:
    | { readonly ok: true; readonly status: number; readonly finalUrl: string }
    | { readonly ok: false; readonly status?: number; readonly reason: string; readonly message: string };
}

export interface FetchBufferedImageSourceMessage {
  readonly type: typeof MessageType.FetchBufferedImageSource;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: {
    readonly url: string;
    readonly referrer?: string | undefined;
    readonly intent?: ImageRequestIntent | undefined;
    readonly contextKey?: string | undefined;
  };
}

export interface FetchBufferedImageSourceResultMessage {
  readonly type: typeof MessageType.FetchBufferedImageSourceResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload:
    | {
        readonly ok: true;
        readonly dataUrl: string;
        readonly mimeType: string;
        readonly byteLength: number;
        readonly sha256?: string | undefined;
      }
    | { readonly ok: false; readonly reason: string; readonly message: string };
}

export interface CheckImageRequestPolicyMessage {
  readonly type: typeof MessageType.CheckImageRequestPolicy;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: {
    readonly url: string;
    readonly referrer?: string | undefined;
    readonly intent?: ImageRequestIntent | undefined;
    readonly contextKey?: string | undefined;
  };
}

export interface CheckImageRequestPolicyResultMessage {
  readonly type: typeof MessageType.CheckImageRequestPolicyResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload:
    | { readonly status: 'unknown' }
    | { readonly status: 'cached-success' }
    | { readonly status: 'skippable-failed'; readonly reason: string; readonly message: string };
}

export interface FetchLinkedPageMessage {
  readonly type: typeof MessageType.FetchLinkedPage;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly url: string; readonly referrer: string; readonly maxBytes: number; readonly timeoutMs: number };
}

export interface FetchLinkedPageResultMessage {
  readonly type: typeof MessageType.FetchLinkedPageResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload:
    | { readonly ok: true; readonly text: string; readonly byteLength: number; readonly finalUrl: string }
    | { readonly ok: false; readonly reason: string; readonly message: string; readonly origin?: string };
}

export function createFetchThumbnailSourceMessage(
  url: string,
  referrer?: string,
  options: {
    readonly intent?: ImageRequestIntent | undefined;
    readonly contextKey?: string | undefined;
    readonly sourceProfile?: ImageSourceProfile | undefined;
  } = {},
): FetchThumbnailSourceMessage {
  return { type: MessageType.FetchThumbnailSource, version: MESSAGE_PROTOCOL_VERSION, payload: { url, referrer, ...options } };
}

export function createProbeImageSourceMessage(
  url: string,
  referrer: string | undefined,
  timeoutMs: number,
  options: { readonly contextKey?: string; readonly probeMethod?: ImageProbeMethod } = {},
): ProbeImageSourceMessage {
  return { type: MessageType.ProbeImageSource, version: MESSAGE_PROTOCOL_VERSION, payload: { url, referrer, timeoutMs, ...options } };
}

export function createFetchBufferedImageSourceMessage(
  url: string,
  referrer?: string,
  options: { readonly intent?: ImageRequestIntent; readonly contextKey?: string } = {},
): FetchBufferedImageSourceMessage {
  return { type: MessageType.FetchBufferedImageSource, version: MESSAGE_PROTOCOL_VERSION, payload: { url, referrer, ...options } };
}

export function createCheckImageRequestPolicyMessage(
  url: string,
  referrer?: string,
  options: { readonly intent?: ImageRequestIntent; readonly contextKey?: string } = {},
): CheckImageRequestPolicyMessage {
  return { type: MessageType.CheckImageRequestPolicy, version: MESSAGE_PROTOCOL_VERSION, payload: { url, referrer, ...options } };
}

export function createFetchLinkedPageMessage(url: string, referrer: string, maxBytes: number, timeoutMs: number): FetchLinkedPageMessage {
  return { type: MessageType.FetchLinkedPage, version: MESSAGE_PROTOCOL_VERSION, payload: { url, referrer, maxBytes, timeoutMs } };
}

export function createFetchThumbnailSourceResultMessage(
  payload: FetchThumbnailSourceResultMessage['payload'],
): FetchThumbnailSourceResultMessage {
  return { type: MessageType.FetchThumbnailSourceResult, version: MESSAGE_PROTOCOL_VERSION, payload };
}

export function createProbeImageSourceResultMessage(payload: ProbeImageSourceResultMessage['payload']): ProbeImageSourceResultMessage {
  return { type: MessageType.ProbeImageSourceResult, version: MESSAGE_PROTOCOL_VERSION, payload };
}

export function createFetchBufferedImageSourceResultMessage(
  payload: FetchBufferedImageSourceResultMessage['payload'],
): FetchBufferedImageSourceResultMessage {
  return { type: MessageType.FetchBufferedImageSourceResult, version: MESSAGE_PROTOCOL_VERSION, payload };
}

export function createCheckImageRequestPolicyResultMessage(
  payload: CheckImageRequestPolicyResultMessage['payload'],
): CheckImageRequestPolicyResultMessage {
  return { type: MessageType.CheckImageRequestPolicyResult, version: MESSAGE_PROTOCOL_VERSION, payload };
}

export function createFetchLinkedPageResultMessage(payload: FetchLinkedPageResultMessage['payload']): FetchLinkedPageResultMessage {
  return { type: MessageType.FetchLinkedPageResult, version: MESSAGE_PROTOCOL_VERSION, payload };
}

export type ImageFetchRequest =
  | FetchThumbnailSourceMessage
  | ProbeImageSourceMessage
  | FetchBufferedImageSourceMessage
  | CheckImageRequestPolicyMessage
  | FetchLinkedPageMessage;

export type ImageFetchResponse =
  | FetchThumbnailSourceResultMessage
  | ProbeImageSourceResultMessage
  | FetchBufferedImageSourceResultMessage
  | CheckImageRequestPolicyResultMessage
  | FetchLinkedPageResultMessage;
