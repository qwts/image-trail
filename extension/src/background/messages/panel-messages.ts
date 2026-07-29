import type { BuildIdentity } from '../../core/build-info.js';
import type { SaveLocalSettingsInput } from '../../data/local-settings.js';
import { MESSAGE_PROTOCOL_VERSION, MessageType } from '../message-protocol.js';

export interface ToggleBuildIdentityOverlayMessage {
  readonly type: typeof MessageType.ToggleBuildIdentityOverlay;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly source: 'browserCommand' };
}

export interface LoadBuildIdentityMessage {
  readonly type: typeof MessageType.LoadBuildIdentity;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly requestedAt: number };
}

export interface LoadBuildIdentityResultMessage {
  readonly type: typeof MessageType.LoadBuildIdentityResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload:
    { readonly ok: true; readonly identity: BuildIdentity } | { readonly ok: false; readonly identity: null; readonly message: string };
}

export interface LoadParsedFieldStateMessage {
  readonly type: typeof MessageType.LoadParsedFieldState;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly hostname: string; readonly pageUrl: string };
}

export interface LoadParsedFieldStateResultMessage {
  readonly type: typeof MessageType.LoadParsedFieldStateResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload:
    | { readonly ok: true; readonly record: import('../../core/types.js').ParsedFieldStateRecord | null }
    | { readonly ok: false; readonly message: string };
}

export interface LoadParsedFieldStateBySourceMessage {
  readonly type: typeof MessageType.LoadParsedFieldStateBySource;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly hostname: string; readonly sourceUrl: string };
}

export interface LoadParsedFieldStateBySourceResultMessage {
  readonly type: typeof MessageType.LoadParsedFieldStateBySourceResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload:
    | { readonly ok: true; readonly record: import('../../core/types.js').ParsedFieldStateRecord | null }
    | { readonly ok: false; readonly message: string };
}

export interface SaveParsedFieldStateMessage {
  readonly type: typeof MessageType.SaveParsedFieldState;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly record: import('../../core/types.js').ParsedFieldStateRecord };
}

export interface SaveParsedFieldStateResultMessage {
  readonly type: typeof MessageType.SaveParsedFieldStateResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly ok: boolean };
}

export interface LoadLocalSettingsMessage {
  readonly type: typeof MessageType.LoadLocalSettings;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly requestedAt: number };
}

export interface LoadLocalSettingsResultMessage {
  readonly type: typeof MessageType.LoadLocalSettingsResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload:
    | { readonly ok: true; readonly settings: import('../../data/local-settings.js').PlaintextLocalSettings }
    | { readonly ok: false; readonly message: string };
}

type BackwardCompatibleLocalSettingsKey =
  | 'recentSparseRowDisplayMode'
  | 'recentDisplayOrder'
  | 'queueDisplayOrder'
  | 'downArrowAction'
  | 'pageContextOverrides'
  | 'blobKeyInactivityTimeoutMinutes';

type BackwardCompatibleLocalSettings = {
  readonly [Key in BackwardCompatibleLocalSettingsKey]?: SaveLocalSettingsInput[Key] | undefined;
};

export type SaveLocalSettingsPayloadSettings = Omit<SaveLocalSettingsInput, BackwardCompatibleLocalSettingsKey> &
  BackwardCompatibleLocalSettings;

export interface SaveLocalSettingsMessage {
  readonly type: typeof MessageType.SaveLocalSettings;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly settings: SaveLocalSettingsPayloadSettings };
}

export interface SaveLocalSettingsResultMessage {
  readonly type: typeof MessageType.SaveLocalSettingsResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly ok: boolean };
}

export function createToggleBuildIdentityOverlayMessage(): ToggleBuildIdentityOverlayMessage {
  return { type: MessageType.ToggleBuildIdentityOverlay, version: MESSAGE_PROTOCOL_VERSION, payload: { source: 'browserCommand' } };
}

export function createLoadBuildIdentityMessage(): LoadBuildIdentityMessage {
  return { type: MessageType.LoadBuildIdentity, version: MESSAGE_PROTOCOL_VERSION, payload: { requestedAt: Date.now() } };
}

export function createLoadBuildIdentityResultMessage(payload: LoadBuildIdentityResultMessage['payload']): LoadBuildIdentityResultMessage {
  return { type: MessageType.LoadBuildIdentityResult, version: MESSAGE_PROTOCOL_VERSION, payload };
}

export function createLoadParsedFieldStateMessage(hostname: string, pageUrl: string): LoadParsedFieldStateMessage {
  return { type: MessageType.LoadParsedFieldState, version: MESSAGE_PROTOCOL_VERSION, payload: { hostname, pageUrl } };
}

export function createLoadParsedFieldStateResultMessage(
  payload: LoadParsedFieldStateResultMessage['payload'],
): LoadParsedFieldStateResultMessage {
  return { type: MessageType.LoadParsedFieldStateResult, version: MESSAGE_PROTOCOL_VERSION, payload };
}

export function createLoadParsedFieldStateBySourceMessage(hostname: string, sourceUrl: string): LoadParsedFieldStateBySourceMessage {
  return { type: MessageType.LoadParsedFieldStateBySource, version: MESSAGE_PROTOCOL_VERSION, payload: { hostname, sourceUrl } };
}

export function createLoadParsedFieldStateBySourceResultMessage(
  payload: LoadParsedFieldStateBySourceResultMessage['payload'],
): LoadParsedFieldStateBySourceResultMessage {
  return { type: MessageType.LoadParsedFieldStateBySourceResult, version: MESSAGE_PROTOCOL_VERSION, payload };
}

export function createSaveParsedFieldStateMessage(
  record: import('../../core/types.js').ParsedFieldStateRecord,
): SaveParsedFieldStateMessage {
  return { type: MessageType.SaveParsedFieldState, version: MESSAGE_PROTOCOL_VERSION, payload: { record } };
}

export function createSaveParsedFieldStateResultMessage(
  payload: SaveParsedFieldStateResultMessage['payload'],
): SaveParsedFieldStateResultMessage {
  return { type: MessageType.SaveParsedFieldStateResult, version: MESSAGE_PROTOCOL_VERSION, payload };
}

export function createLoadLocalSettingsMessage(): LoadLocalSettingsMessage {
  return { type: MessageType.LoadLocalSettings, version: MESSAGE_PROTOCOL_VERSION, payload: { requestedAt: Date.now() } };
}

export function createLoadLocalSettingsResultMessage(payload: LoadLocalSettingsResultMessage['payload']): LoadLocalSettingsResultMessage {
  return { type: MessageType.LoadLocalSettingsResult, version: MESSAGE_PROTOCOL_VERSION, payload };
}

export function createSaveLocalSettingsMessage(settings: SaveLocalSettingsPayloadSettings): SaveLocalSettingsMessage {
  return { type: MessageType.SaveLocalSettings, version: MESSAGE_PROTOCOL_VERSION, payload: { settings } };
}

export function createSaveLocalSettingsResultMessage(payload: SaveLocalSettingsResultMessage['payload']): SaveLocalSettingsResultMessage {
  return { type: MessageType.SaveLocalSettingsResult, version: MESSAGE_PROTOCOL_VERSION, payload };
}

export type PanelRequest =
  | ToggleBuildIdentityOverlayMessage
  | LoadBuildIdentityMessage
  | LoadParsedFieldStateMessage
  | LoadParsedFieldStateBySourceMessage
  | SaveParsedFieldStateMessage
  | LoadLocalSettingsMessage
  | SaveLocalSettingsMessage;

export type PanelResponse =
  | LoadBuildIdentityResultMessage
  | LoadParsedFieldStateResultMessage
  | LoadParsedFieldStateBySourceResultMessage
  | SaveParsedFieldStateResultMessage
  | LoadLocalSettingsResultMessage
  | SaveLocalSettingsResultMessage;
