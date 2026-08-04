import { defineMessage, type MessageDef } from '../message-dispatch.js';
import * as requestSchemas from '../message-schemas.js';
import { createUnknownMessageResponse, MessageType, type ExtensionRequest, type ExtensionResponse } from '../messages.js';
import { loadLocalTransferTarget, saveLocalTransferTarget, transferRecordLocally, type LocalTransferStorage } from '../local-transfer.js';
import { createLocalTransferResultMessage, type LocalTransferMessage } from '../local-transfer-messages.js';

type Registry = Record<typeof MessageType.LocalTransfer, MessageDef<ExtensionRequest, ExtensionResponse>>;

export function createLocalTransferMessageRegistry(
  getDb: () => Promise<IDBDatabase | null>,
  storage: LocalTransferStorage = chrome.storage.local,
): Registry {
  return {
    [MessageType.LocalTransfer]: defineMessage({
      requestSchema: requestSchemas.localTransferRequestSchema,
      handle: async (message: LocalTransferMessage) => {
        const { recordId, syncString } = message.payload;
        if (syncString !== undefined) await saveLocalTransferTarget(storage, syncString);
        const target = await loadLocalTransferTarget(storage);
        if (target === null) return { ok: false, message: 'Paste the sync code shown in Overlook.', needsSyncString: true };
        const result = await transferRecordLocally(target, recordId, { getDb });
        return { ...result, needsSyncString: false };
      },
      respond: createLocalTransferResultMessage,
      fallback: (error) =>
        createLocalTransferResultMessage({
          ok: false,
          needsSyncString: false,
          message: error instanceof Error ? error.message : 'Transfer failed.',
        }),
    }),
  };
}

export function createDisabledLocalTransferMessageRegistry(): Registry {
  const reason = 'Transfer is not enabled in this build.';
  return {
    [MessageType.LocalTransfer]: defineMessage({
      requestSchema: requestSchemas.localTransferRequestSchema,
      handle: () => Promise.reject(new Error(reason)),
      respond: () => createUnknownMessageResponse(reason),
      fallback: () => createUnknownMessageResponse(reason),
    }),
  };
}
