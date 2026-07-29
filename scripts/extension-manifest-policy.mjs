import { isInteropFeatureEnabled } from './extension-build-policy.mjs';

export const NATIVE_MESSAGING_PERMISSION = 'nativeMessaging';

export function extensionManifestForBuild(manifest, { interopEnabled = isInteropFeatureEnabled() } = {}) {
  const permissions = Array.isArray(manifest.permissions)
    ? manifest.permissions.filter((permission) => permission !== NATIVE_MESSAGING_PERMISSION)
    : [];

  return {
    ...manifest,
    permissions: interopEnabled ? [...permissions, NATIVE_MESSAGING_PERMISSION] : permissions,
  };
}
