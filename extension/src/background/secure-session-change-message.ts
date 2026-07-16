import type { SecureSessionStatus } from '../core/secure-session-state.js';

export const SECURE_SESSION_CHANGE_MESSAGE_TYPE = 'imageTrail.secureSessionChanged';
export const SECURE_SESSION_CHANGE_MESSAGE_VERSION = 1;

export type { SecureSessionStatus } from '../core/secure-session-state.js';

export interface SecureSessionChangeMessage {
  readonly type: typeof SECURE_SESSION_CHANGE_MESSAGE_TYPE;
  readonly version: typeof SECURE_SESSION_CHANGE_MESSAGE_VERSION;
  readonly payload: SecureSessionStatus & { readonly changedAt: number };
}

export function createSecureSessionChangeMessage(status: SecureSessionStatus, changedAt: number = Date.now()): SecureSessionChangeMessage {
  return {
    type: SECURE_SESSION_CHANGE_MESSAGE_TYPE,
    version: SECURE_SESSION_CHANGE_MESSAGE_VERSION,
    payload: { ...status, changedAt },
  };
}

export function isSecureSessionChangeMessage(value: unknown): value is SecureSessionChangeMessage {
  if (!value || typeof value !== 'object') return false;
  const message = value as Partial<SecureSessionChangeMessage>;
  return (
    message.type === SECURE_SESSION_CHANGE_MESSAGE_TYPE &&
    message.version === SECURE_SESSION_CHANGE_MESSAGE_VERSION &&
    isSecureSessionStatus(message.payload) &&
    typeof message.payload.changedAt === 'number'
  );
}

function isSecureSessionStatus(value: unknown): value is SecureSessionChangeMessage['payload'] {
  if (!value || typeof value !== 'object') return false;
  const status = value as Partial<SecureSessionChangeMessage['payload']>;
  if (typeof status.unlocked !== 'boolean' || typeof status.hasKey !== 'boolean') return false;
  if (status.unlocked) {
    return status.hasKey === true && typeof status.keyReference === 'string';
  }
  return (
    status.keyReference === null &&
    (status.reason === undefined || status.reason === 'manual' || status.reason === 'timeout' || status.reason === 'worker-restart') &&
    (status.message === undefined || typeof status.message === 'string')
  );
}
