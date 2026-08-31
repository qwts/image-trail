import { createHash } from 'node:crypto';
import { isExperimentalBuild, isInteropFeatureEnabled } from './extension-build-policy.mjs';

export const NATIVE_MESSAGING_PERMISSION = 'nativeMessaging';
export const RELEASED_IMAGE_TRAIL_EXTENSION_ID = 'kopcjofaojfpgdoianeddagpenhijphi';
export const RELEASED_IMAGE_TRAIL_PUBLIC_KEY =
  'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA04/ySHp4s0rRYVtzR0wsF2t9dozmkpmHWPJGdoZM6bRdfF8jQYLBUbpPI5vr8WU3yd2dx5dEfITdPfnaUXKdU9ju4Mam/JcM0cF67wxa2slKAqitq5/xtLVYSbcCtnQuUTPylf6Xg7lq6notwUPOLLQRe4L2DN5frLIp21oW4rTRMuUwHRbC7ZoxhnloYvq7fBt0g51IsoIvtqJpRtjcDup5oG/qOVZmIaotLThPtkbnQWueBTQQh3SXpFeL649nH/oVGS1zg8JySVo+k+ZJH6ex80B2LgYcm1hPMFp338q1mNPqx0uK3koLxnButdJlGnHExV5C0o2fHCkEcY8zPQIDAQAB';

export function chromeExtensionIdFromPublicKey(publicKey) {
  const digest = createHash('sha256').update(Buffer.from(publicKey, 'base64')).digest().subarray(0, 16);
  const alphabet = 'abcdefghijklmnop';
  return [...digest].map((byte) => `${alphabet[byte >> 4]}${alphabet[byte & 0x0f]}`).join('');
}

export function extensionManifestForBuild(
  manifest,
  { interopEnabled = isInteropFeatureEnabled(), experimentalBuild = isExperimentalBuild() } = {},
) {
  const permissions = Array.isArray(manifest.permissions)
    ? manifest.permissions.filter((permission) => permission !== NATIVE_MESSAGING_PERMISSION)
    : [];
  const { key: _sourceKey, ...baseManifest } = manifest;
  if (experimentalBuild && !interopEnabled) throw new Error('Experimental builds require interoperability to be enabled.');
  if (chromeExtensionIdFromPublicKey(RELEASED_IMAGE_TRAIL_PUBLIC_KEY) !== RELEASED_IMAGE_TRAIL_EXTENSION_ID) {
    throw new Error('Released Image Trail public key does not derive the expected extension id.');
  }

  return {
    ...baseManifest,
    permissions: interopEnabled ? [...permissions, NATIVE_MESSAGING_PERMISSION] : permissions,
    ...(experimentalBuild ? { key: RELEASED_IMAGE_TRAIL_PUBLIC_KEY } : {}),
  };
}
