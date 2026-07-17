import { InteropTransportError } from '../core/interop/transport.js';
import { restoreActiveBlobKey } from '../data/crypto/blob-keyring.js';
import { DRIVE_FILE_SCOPE } from './interop-chrome-identity.js';
import { createChromeIdentityInteropDriveStore } from './interop-google-drive-store.js';
import { OverlookICloudNativeClient } from './interop-icloud-client.js';
import { createChromePCloudInteropAuth } from './interop-pcloud-auth.js';
import { InteropRuntime } from './interop-runtime.js';

export function hasConfiguredDriveOAuth(manifest: unknown): boolean {
  if (!manifest || typeof manifest !== 'object') return false;
  const oauth = (manifest as { readonly oauth2?: unknown }).oauth2;
  if (!oauth || typeof oauth !== 'object') return false;
  const candidate = oauth as { readonly client_id?: unknown; readonly scopes?: unknown };
  return (
    typeof candidate.client_id === 'string' &&
    candidate.client_id.trim() !== '' &&
    Array.isArray(candidate.scopes) &&
    candidate.scopes.includes(DRIVE_FILE_SCOPE)
  );
}

export function createChromeInteropRuntime(getDb: () => Promise<IDBDatabase | null>): InteropRuntime {
  const pcloud = createChromePCloudInteropAuth();
  return new InteropRuntime({
    storage: chrome.storage.local,
    getDb,
    getActiveBlobKey: restoreActiveBlobKey,
    probePCloud: (interactive) => pcloud.probe(interactive),
    disconnectPCloud: () => pcloud.disconnect(),
    probeGoogleDrive: async (interactive) => {
      if (!hasConfiguredDriveOAuth(chrome.runtime.getManifest())) {
        throw new InteropTransportError(
          'Google Drive interoperability requires a configured extension OAuth client.',
          'provider-unavailable',
          false,
        );
      }
      await createChromeIdentityInteropDriveStore(interactive).quota();
    },
    disconnectGoogleDrive: () => chrome.identity.clearAllCachedAuthTokens(),
    probeICloud: async () => {
      await new OverlookICloudNativeClient(chrome.runtime.id).request({ operation: 'status' });
    },
    openProvider: async (provider) => {
      if (provider === 'pcloud') return pcloud.openProvider();
      if (provider === 'google-drive' && hasConfiguredDriveOAuth(chrome.runtime.getManifest()))
        return createChromeIdentityInteropDriveStore(false);
      return null;
    },
  });
}
