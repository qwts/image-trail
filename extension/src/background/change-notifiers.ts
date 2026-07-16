import { configureBlobKeySessionChangeListener } from '../data/crypto/blob-keyring.js';
import { createRuntimeLibraryChangeNotifier } from './library-change-notifier.js';
import { connectBlobKeySessionChangeNotifier, createSecureSessionChangeNotifier } from './secure-session-change-notifier.js';

export function createChangeNotifiers(
  runtime: Parameters<typeof createRuntimeLibraryChangeNotifier>[0],
  tabs: Parameters<typeof createSecureSessionChangeNotifier>[1],
) {
  const notifyLibraryChange = createRuntimeLibraryChangeNotifier(runtime);
  const notifySecureSessionChange = createSecureSessionChangeNotifier(runtime, tabs);
  connectBlobKeySessionChangeNotifier(configureBlobKeySessionChangeListener, notifySecureSessionChange);
  return { notifyLibraryChange, notifySecureSessionChange };
}
