import type { BlobKeyResultMessage } from '../background/blob-key-messages.js';
import { isSecureSessionChangeMessage } from '../background/secure-session-change-message.js';
import type { SecureSessionStatus } from '../core/secure-session-state.js';
import { CaptureController, type CaptureStore } from './capture-controller.js';

interface RuntimeMessageEvents {
  readonly onMessage: {
    addListener(listener: (message: unknown) => boolean): void;
    removeListener(listener: (message: unknown) => boolean): void;
  };
}

export interface SecureSessionClient {
  status(): Promise<SecureSessionStatus>;
  unlock(password: string): Promise<BlobKeyResultMessage['payload']>;
  lock(): Promise<BlobKeyResultMessage['payload']>;
  subscribe(listener: (status: SecureSessionStatus) => void): () => void;
}

export function createSecureSessionClient(
  captureStore: Pick<CaptureStore, 'requestBlobKeyStatus' | 'unlockBlobKey' | 'lockBlobKey'> = new CaptureController(),
  runtime: RuntimeMessageEvents = chrome.runtime,
): SecureSessionClient {
  return {
    status: () => captureStore.requestBlobKeyStatus(),
    unlock: (password) => captureStore.unlockBlobKey(password),
    lock: () => captureStore.lockBlobKey(),
    subscribe(listener) {
      const onMessage = (message: unknown): boolean => {
        if (!isSecureSessionChangeMessage(message)) return false;
        listener(message.payload);
        return false;
      };
      runtime.onMessage.addListener(onMessage);
      return () => runtime.onMessage.removeListener(onMessage);
    },
  };
}
