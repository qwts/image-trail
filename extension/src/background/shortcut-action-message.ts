import { MESSAGE_PROTOCOL_VERSION } from './message-protocol.js';

const SHORTCUT_ACTION_MESSAGE_TYPE = 'imageTrail.shortcutAction';

export interface ShortcutActionMessage {
  readonly type: typeof SHORTCUT_ACTION_MESSAGE_TYPE;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly action: string };
}

export function createShortcutActionMessage(action: string): ShortcutActionMessage {
  return { type: SHORTCUT_ACTION_MESSAGE_TYPE, version: MESSAGE_PROTOCOL_VERSION, payload: { action } };
}

export function isShortcutActionMessage(value: unknown): value is ShortcutActionMessage {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as { type?: unknown; version?: unknown; payload?: { action?: unknown } };
  return (
    candidate.type === SHORTCUT_ACTION_MESSAGE_TYPE &&
    candidate.version === MESSAGE_PROTOCOL_VERSION &&
    typeof candidate.payload?.action === 'string'
  );
}
