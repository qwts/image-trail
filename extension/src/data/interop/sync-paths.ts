import * as v from 'valibot';

import { interopUuidSchema } from '../../core/interop/contract.js';

export const SYNC_MESSAGE_PREFIX = 'messages/outbox';
const pathPattern = /^messages\/outbox\/([0-9]{12})-([0-9a-f-]{36})\.json\.aesgcm$/iu;

export function syncMessagePath(sequence: number, messageId: string): string {
  if (!Number.isSafeInteger(sequence) || sequence < 1 || sequence > 999_999_999_999) {
    throw new Error('Sync message sequence is outside the provider path range.');
  }
  return `${SYNC_MESSAGE_PREFIX}/${String(sequence).padStart(12, '0')}-${v.parse(interopUuidSchema, messageId)}.json.aesgcm`;
}

export function parseSyncMessagePath(path: string): { readonly sequence: number; readonly messageId: string } {
  const match = pathPattern.exec(path);
  if (!match) throw new Error('Sync provider path is invalid.');
  const sequence = Number(match[1]);
  if (sequence < 1) throw new Error('Sync provider path sequence must be positive.');
  return { sequence, messageId: v.parse(interopUuidSchema, match[2]) };
}
