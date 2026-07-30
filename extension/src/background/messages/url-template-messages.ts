import { MESSAGE_PROTOCOL_VERSION, MessageType } from '../message-protocol.js';

export interface ListUrlReviewStatusMessage {
  readonly type: typeof MessageType.ListUrlReviewStatus;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly hostname: string };
}

export interface ListUrlReviewStatusResultMessage {
  readonly type: typeof MessageType.ListUrlReviewStatusResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload:
    | { readonly ok: true; readonly records: readonly import('../../core/types.js').UrlReviewStatusRecord[] }
    | { readonly ok: false; readonly message: string };
}

export interface SaveUrlReviewStatusMessage {
  readonly type: typeof MessageType.SaveUrlReviewStatus;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly record: import('../../core/types.js').UrlReviewStatusRecord };
}

export interface SaveUrlReviewStatusResultMessage {
  readonly type: typeof MessageType.SaveUrlReviewStatusResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly ok: boolean };
}

export interface ImportUrlReviewStatusMessage {
  readonly type: typeof MessageType.ImportUrlReviewStatus;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly records: readonly import('../../core/types.js').UrlReviewStatusRecord[] };
}

export interface ImportUrlReviewStatusResultMessage {
  readonly type: typeof MessageType.ImportUrlReviewStatusResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly ok: true; readonly importedCount: number } | { readonly ok: false; readonly message: string };
}

export interface ClearUrlReviewStatusMessage {
  readonly type: typeof MessageType.ClearUrlReviewStatus;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly filter: import('../../core/types.js').UrlReviewStatusClearFilter };
}

export interface ClearUrlReviewStatusResultMessage {
  readonly type: typeof MessageType.ClearUrlReviewStatusResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly ok: true; readonly deletedCount: number } | { readonly ok: false; readonly message: string };
}

export interface ListUrlTemplatesMessage {
  readonly type: typeof MessageType.ListUrlTemplates;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly hostname: string };
}

export interface ListUrlTemplatesResultMessage {
  readonly type: typeof MessageType.ListUrlTemplatesResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload:
    | { readonly ok: true; readonly templates: readonly import('../../core/url/templates.js').UrlTemplateRecord[] }
    | { readonly ok: false; readonly message: string };
}

export interface SaveUrlTemplateMessage {
  readonly type: typeof MessageType.SaveUrlTemplate;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly template: import('../../core/url/templates.js').UrlTemplateRecord };
}

export interface SaveUrlTemplateResultMessage {
  readonly type: typeof MessageType.SaveUrlTemplateResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly ok: boolean };
}

export interface DeleteUrlTemplateMessage {
  readonly type: typeof MessageType.DeleteUrlTemplate;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly hostname: string; readonly id: string };
}

export interface DeleteUrlTemplateResultMessage {
  readonly type: typeof MessageType.DeleteUrlTemplateResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly ok: boolean };
}

export interface ListGrabSourcePatternsMessage {
  readonly type: typeof MessageType.ListGrabSourcePatterns;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly hostname: string };
}

export interface ListGrabSourcePatternsResultMessage {
  readonly type: typeof MessageType.ListGrabSourcePatternsResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload:
    | { readonly ok: true; readonly patterns: readonly import('../../core/url/templates.js').GrabSourcePattern[] }
    | { readonly ok: false; readonly message: string };
}

export interface SaveGrabSourcePatternMessage {
  readonly type: typeof MessageType.SaveGrabSourcePattern;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly pattern: import('../../core/url/templates.js').GrabSourcePattern };
}

export interface SaveGrabSourcePatternResultMessage {
  readonly type: typeof MessageType.SaveGrabSourcePatternResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly ok: boolean };
}

export interface DeleteGrabSourcePatternMessage {
  readonly type: typeof MessageType.DeleteGrabSourcePattern;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly hostname: string; readonly id: string };
}

export interface DeleteGrabSourcePatternResultMessage {
  readonly type: typeof MessageType.DeleteGrabSourcePatternResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly ok: boolean };
}

export function createListUrlReviewStatusMessage(hostname: string): ListUrlReviewStatusMessage {
  return { type: MessageType.ListUrlReviewStatus, version: MESSAGE_PROTOCOL_VERSION, payload: { hostname } };
}

export function createListUrlReviewStatusResultMessage(
  payload: ListUrlReviewStatusResultMessage['payload'],
): ListUrlReviewStatusResultMessage {
  return { type: MessageType.ListUrlReviewStatusResult, version: MESSAGE_PROTOCOL_VERSION, payload };
}

export function createSaveUrlReviewStatusMessage(record: import('../../core/types.js').UrlReviewStatusRecord): SaveUrlReviewStatusMessage {
  return { type: MessageType.SaveUrlReviewStatus, version: MESSAGE_PROTOCOL_VERSION, payload: { record } };
}

export function createSaveUrlReviewStatusResultMessage(
  payload: SaveUrlReviewStatusResultMessage['payload'],
): SaveUrlReviewStatusResultMessage {
  return { type: MessageType.SaveUrlReviewStatusResult, version: MESSAGE_PROTOCOL_VERSION, payload };
}

export function createImportUrlReviewStatusMessage(
  records: readonly import('../../core/types.js').UrlReviewStatusRecord[],
): ImportUrlReviewStatusMessage {
  return { type: MessageType.ImportUrlReviewStatus, version: MESSAGE_PROTOCOL_VERSION, payload: { records } };
}

export function createImportUrlReviewStatusResultMessage(
  payload: ImportUrlReviewStatusResultMessage['payload'],
): ImportUrlReviewStatusResultMessage {
  return { type: MessageType.ImportUrlReviewStatusResult, version: MESSAGE_PROTOCOL_VERSION, payload };
}

export function createClearUrlReviewStatusMessage(
  filter: import('../../core/types.js').UrlReviewStatusClearFilter,
): ClearUrlReviewStatusMessage {
  return { type: MessageType.ClearUrlReviewStatus, version: MESSAGE_PROTOCOL_VERSION, payload: { filter } };
}

export function createClearUrlReviewStatusResultMessage(
  payload: ClearUrlReviewStatusResultMessage['payload'],
): ClearUrlReviewStatusResultMessage {
  return { type: MessageType.ClearUrlReviewStatusResult, version: MESSAGE_PROTOCOL_VERSION, payload };
}

export function createListUrlTemplatesMessage(hostname: string): ListUrlTemplatesMessage {
  return { type: MessageType.ListUrlTemplates, version: MESSAGE_PROTOCOL_VERSION, payload: { hostname } };
}

export function createListUrlTemplatesResultMessage(payload: ListUrlTemplatesResultMessage['payload']): ListUrlTemplatesResultMessage {
  return { type: MessageType.ListUrlTemplatesResult, version: MESSAGE_PROTOCOL_VERSION, payload };
}

export function createSaveUrlTemplateMessage(template: import('../../core/url/templates.js').UrlTemplateRecord): SaveUrlTemplateMessage {
  return { type: MessageType.SaveUrlTemplate, version: MESSAGE_PROTOCOL_VERSION, payload: { template } };
}

export function createSaveUrlTemplateResultMessage(payload: SaveUrlTemplateResultMessage['payload']): SaveUrlTemplateResultMessage {
  return { type: MessageType.SaveUrlTemplateResult, version: MESSAGE_PROTOCOL_VERSION, payload };
}

export function createDeleteUrlTemplateMessage(hostname: string, id: string): DeleteUrlTemplateMessage {
  return { type: MessageType.DeleteUrlTemplate, version: MESSAGE_PROTOCOL_VERSION, payload: { hostname, id } };
}

export function createDeleteUrlTemplateResultMessage(payload: DeleteUrlTemplateResultMessage['payload']): DeleteUrlTemplateResultMessage {
  return { type: MessageType.DeleteUrlTemplateResult, version: MESSAGE_PROTOCOL_VERSION, payload };
}

export function createListGrabSourcePatternsMessage(hostname: string): ListGrabSourcePatternsMessage {
  return { type: MessageType.ListGrabSourcePatterns, version: MESSAGE_PROTOCOL_VERSION, payload: { hostname } };
}

export function createListGrabSourcePatternsResultMessage(
  payload: ListGrabSourcePatternsResultMessage['payload'],
): ListGrabSourcePatternsResultMessage {
  return { type: MessageType.ListGrabSourcePatternsResult, version: MESSAGE_PROTOCOL_VERSION, payload };
}

export function createSaveGrabSourcePatternMessage(
  pattern: import('../../core/url/templates.js').GrabSourcePattern,
): SaveGrabSourcePatternMessage {
  return { type: MessageType.SaveGrabSourcePattern, version: MESSAGE_PROTOCOL_VERSION, payload: { pattern } };
}

export function createSaveGrabSourcePatternResultMessage(
  payload: SaveGrabSourcePatternResultMessage['payload'],
): SaveGrabSourcePatternResultMessage {
  return { type: MessageType.SaveGrabSourcePatternResult, version: MESSAGE_PROTOCOL_VERSION, payload };
}

export function createDeleteGrabSourcePatternMessage(hostname: string, id: string): DeleteGrabSourcePatternMessage {
  return { type: MessageType.DeleteGrabSourcePattern, version: MESSAGE_PROTOCOL_VERSION, payload: { hostname, id } };
}

export function createDeleteGrabSourcePatternResultMessage(
  payload: DeleteGrabSourcePatternResultMessage['payload'],
): DeleteGrabSourcePatternResultMessage {
  return { type: MessageType.DeleteGrabSourcePatternResult, version: MESSAGE_PROTOCOL_VERSION, payload };
}

export type UrlTemplateRequest =
  | ListUrlReviewStatusMessage
  | SaveUrlReviewStatusMessage
  | ImportUrlReviewStatusMessage
  | ClearUrlReviewStatusMessage
  | ListUrlTemplatesMessage
  | SaveUrlTemplateMessage
  | DeleteUrlTemplateMessage
  | ListGrabSourcePatternsMessage
  | SaveGrabSourcePatternMessage
  | DeleteGrabSourcePatternMessage;

export type UrlTemplateResponse =
  | ListUrlReviewStatusResultMessage
  | SaveUrlReviewStatusResultMessage
  | ImportUrlReviewStatusResultMessage
  | ClearUrlReviewStatusResultMessage
  | ListUrlTemplatesResultMessage
  | SaveUrlTemplateResultMessage
  | DeleteUrlTemplateResultMessage
  | ListGrabSourcePatternsResultMessage
  | SaveGrabSourcePatternResultMessage
  | DeleteGrabSourcePatternResultMessage;
