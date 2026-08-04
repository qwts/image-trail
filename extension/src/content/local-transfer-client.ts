import { createLocalTransferMessage, isLocalTransferResultMessage } from '../background/local-transfer-messages.js';
import { sendRuntimeMessage } from './runtime-message.js';

export interface LocalTransferOutcome {
  readonly ok: boolean;
  readonly message: string;
  readonly needsSyncString: boolean;
}

export async function requestLocalTransfer(recordId: string, syncString?: string): Promise<LocalTransferOutcome> {
  const response = await sendRuntimeMessage(createLocalTransferMessage(recordId, syncString));
  if (isLocalTransferResultMessage(response)) return response.payload;
  return { ok: false, needsSyncString: false, message: 'Transfer did not respond. Try again.' };
}
