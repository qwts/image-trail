export const MESSAGE_PROTOCOL_VERSION = 1;

export const MessageType = {
  TogglePanel: 'imageTrail.togglePanel',
  Ping: 'imageTrail.ping',
  Status: 'imageTrail.status',
  Unknown: 'imageTrail.unknown',
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

export type ExtensionRequest = TogglePanelMessage | PingMessage;
export type ExtensionResponse = StatusMessage | UnknownMessageResponse;
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

function hasVersionedObjectShape(value: unknown): value is { type?: unknown; version?: unknown; payload?: unknown } {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as { version?: unknown; payload?: unknown };
  return candidate.version === MESSAGE_PROTOCOL_VERSION && !!candidate.payload && typeof candidate.payload === 'object';
}

export function isExtensionRequest(value: unknown): value is ExtensionRequest {
  if (!hasVersionedObjectShape(value)) return false;
  return value.type === MessageType.TogglePanel || value.type === MessageType.Ping;
}

export function isExtensionResponse(value: unknown): value is ExtensionResponse {
  if (!hasVersionedObjectShape(value)) return false;
  return value.type === MessageType.Status || value.type === MessageType.Unknown;
}

export function isStatusMessage(value: unknown): value is StatusMessage {
  if (!isExtensionResponse(value) || value.type !== MessageType.Status) return false;
  const payload = value.payload as { panelVisible?: unknown; status?: unknown };
  return typeof payload.panelVisible === 'boolean' && typeof payload.status === 'string';
}
