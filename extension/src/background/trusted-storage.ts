export function hasTrustedExtensionStorage(): boolean {
  return typeof chrome !== 'undefined' && !!chrome.storage?.local;
}

export async function restrictStorageToTrustedContexts(): Promise<void> {
  if (!hasTrustedExtensionStorage()) throw new Error('Extension storage is unavailable.');
  if (typeof chrome.storage.local.setAccessLevel !== 'function') throw new Error('Trusted extension storage is unavailable.');
  await chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
}
