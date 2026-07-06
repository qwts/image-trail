import { createLibraryChangeMessage, type LibraryChangeInput } from './library-change-messages.js';

export type LibraryChangeNotifier = (change: LibraryChangeInput) => void;

interface RuntimeMessageBroadcaster {
  readonly lastError: { readonly message?: string } | undefined;
  sendMessage(message: unknown, responseCallback?: () => void): void;
}

export const noopLibraryChangeNotifier: LibraryChangeNotifier = () => undefined;

export function createRuntimeLibraryChangeNotifier(runtime: RuntimeMessageBroadcaster): LibraryChangeNotifier {
  return (change) => {
    try {
      runtime.sendMessage(createLibraryChangeMessage(change), () => {
        void runtime.lastError;
      });
    } catch {
      // No Gallery page may be listening; mutation success must not depend on observers.
    }
  };
}
