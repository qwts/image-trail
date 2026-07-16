import { createSecureSessionChangeMessage, type SecureSessionStatus } from './secure-session-change-message.js';
import type { SessionUnlockSnapshot } from '../data/runtime/session-unlock.js';

export type SecureSessionChangeNotifier = (status: SecureSessionStatus) => void;

interface RuntimeMessageBroadcaster {
  readonly lastError: { readonly message?: string } | undefined;
  sendMessage(message: unknown, responseCallback?: () => void): void;
}

interface TabMessageBroadcaster {
  query(queryInfo: chrome.tabs.QueryInfo): Promise<ReadonlyArray<{ readonly id?: number | undefined }>>;
  sendMessage(tabId: number, message: unknown): Promise<unknown>;
}

export const noopSecureSessionChangeNotifier: SecureSessionChangeNotifier = () => undefined;

export function createSecureSessionChangeNotifier(
  runtime: RuntimeMessageBroadcaster,
  tabs: TabMessageBroadcaster,
): SecureSessionChangeNotifier {
  return (status) => {
    const message = createSecureSessionChangeMessage(status);
    try {
      runtime.sendMessage(message, () => {
        void runtime.lastError;
      });
    } catch {
      // Extension pages are optional observers; session transitions must still complete.
    }
    void tabs
      .query({})
      .then((openTabs) =>
        Promise.allSettled(
          openTabs.map((tab) => (typeof tab.id === 'number' ? tabs.sendMessage(tab.id, message) : Promise.resolve(undefined))),
        ),
      )
      .catch(() => undefined);
  };
}

export function connectBlobKeySessionChangeNotifier(
  configure: (listener: (snapshot: SessionUnlockSnapshot<'blob'>) => void) => void,
  notify: SecureSessionChangeNotifier,
): void {
  configure((snapshot) => {
    if (snapshot.status === 'unlocked') {
      notify({ unlocked: true, keyReference: snapshot.keyReference.reference, hasKey: true });
      return;
    }
    const reason = snapshot.reason;
    const message =
      reason === 'timeout'
        ? 'Encrypted storage locked after the configured inactivity period. Unlock to continue.'
        : reason === 'manual'
          ? 'Encrypted storage locked.'
          : undefined;
    notify({
      unlocked: false,
      keyReference: null,
      hasKey: true,
      ...(reason ? { reason } : {}),
      ...(message ? { message } : {}),
    });
  });
}
