import { isInteropFeatureEnabled } from './extension-build-policy.mjs';

export const NATIVE_MESSAGING_PERMISSION = 'nativeMessaging';
export const LOOPBACK_TRANSFER_HOST_PERMISSION = 'http://127.0.0.1/*';

export function extensionManifestForBuild(manifest, { interopEnabled = isInteropFeatureEnabled() } = {}) {
  const permissions = Array.isArray(manifest.permissions)
    ? manifest.permissions.filter((permission) => permission !== NATIVE_MESSAGING_PERMISSION)
    : [];

  const hostPermissions = Array.isArray(manifest.host_permissions)
    ? manifest.host_permissions.filter((pattern) => pattern !== LOOPBACK_TRANSFER_HOST_PERMISSION)
    : [];
  const base = { ...manifest, permissions: interopEnabled ? [...permissions, NATIVE_MESSAGING_PERMISSION] : permissions };
  if (interopEnabled) return { ...base, host_permissions: [...hostPermissions, LOOPBACK_TRANSFER_HOST_PERMISSION] };
  if (hostPermissions.length > 0) return { ...base, host_permissions: hostPermissions };
  const { host_permissions: _dropped, ...withoutHosts } = base;
  return withoutHosts;
}
