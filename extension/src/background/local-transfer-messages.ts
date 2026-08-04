import { MESSAGE_PROTOCOL_VERSION, MessageType, hasVersionedObjectShape } from './message-protocol.js';
import type { LocalTransferResult } from './local-transfer.js';

export interface LocalTransferMessage {
  readonly type: typeof MessageType.LocalTransfer;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: {
    readonly recordId: string;
    /** Present when the user just pasted the Overlook sync code. */
    readonly syncString?: string | undefined;
  };
}

export interface LocalTransferResultMessage {
  readonly type: typeof MessageType.LocalTransferResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: LocalTransferResult & { readonly needsSyncString: boolean };
}

export function createLocalTransferMessage(recordId: string, syncString?: string): LocalTransferMessage {
  return {
    type: MessageType.LocalTransfer,
    version: MESSAGE_PROTOCOL_VERSION,
    payload: { recordId, ...(syncString === undefined ? {} : { syncString }) },
  };
}

export function createLocalTransferResultMessage(payload: LocalTransferResultMessage['payload']): LocalTransferResultMessage {
  return { type: MessageType.LocalTransferResult, version: MESSAGE_PROTOCOL_VERSION, payload };
}

export function isLocalTransferResultMessage(value: unknown): value is LocalTransferResultMessage {
  return hasVersionedObjectShape(value) && value.type === MessageType.LocalTransferResult;
}
