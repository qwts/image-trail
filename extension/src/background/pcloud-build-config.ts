declare const __IMAGE_TRAIL_PCLOUD_CLIENT_ID__: string | undefined;

const clientId = typeof __IMAGE_TRAIL_PCLOUD_CLIENT_ID__ === 'string' ? __IMAGE_TRAIL_PCLOUD_CLIENT_ID__.trim() : '';

export const PCLOUD_BUILD_CONFIG = {
  authorizeUrl: 'https://my.pcloud.com/oauth2/authorize',
  clientId,
  downloadReferrer: 'https://my.pcloud.com/',
  enabled: clientId.length > 0,
  unavailableMessage: 'pCloud backup is not configured in this build.',
} as const;
