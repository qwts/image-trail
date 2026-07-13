export const PCLOUD_HOST_PERMISSION = 'https://*.pcloud.com/*';

export function extractOrigin(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

export async function hasHostPermission(pattern: string): Promise<boolean> {
  if (typeof chrome === 'undefined' || !chrome.permissions?.contains) return false;
  return chrome.permissions.contains({ origins: [pattern] });
}

export async function requestHostPermission(pattern: string): Promise<boolean> {
  if (typeof chrome === 'undefined' || !chrome.permissions?.request) return false;
  return chrome.permissions.request({ origins: [pattern] });
}

export async function hasOriginPermission(origin: string): Promise<boolean> {
  return hasHostPermission(`${origin}/*`);
}

export async function requestOriginPermission(origin: string): Promise<boolean> {
  return requestHostPermission(`${origin}/*`);
}
