export function originPermissionPattern(url: string): string {
  const parsed = new URL(url);
  return `${parsed.origin}/*`;
}

export interface HostPermissionAdapter {
  readonly contains: (permissions: chrome.permissions.Permissions) => Promise<boolean>;
  readonly request: (permissions: chrome.permissions.Permissions) => Promise<boolean>;
}

export const chromeHostPermissions: HostPermissionAdapter = {
  contains: (permissions) => chrome.permissions.contains(permissions),
  request: (permissions) => chrome.permissions.request(permissions),
};

export async function ensureOriginPermission(url: string, permissions: HostPermissionAdapter = chromeHostPermissions): Promise<boolean> {
  const origins = [originPermissionPattern(url)];
  if (await permissions.contains({ origins })) return true;
  return permissions.request({ origins });
}
