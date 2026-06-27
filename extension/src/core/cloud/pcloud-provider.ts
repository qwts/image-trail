export type PCloudApiHost = 'api.pcloud.com' | 'eapi.pcloud.com';

export interface PCloudProviderStatus {
  readonly connected: boolean;
  readonly apiHost?: PCloudApiHost;
  readonly connectedAt?: string;
  readonly accountPremium?: boolean;
  readonly quotaBytes?: number;
  readonly usedQuotaBytes?: number;
  readonly message?: string;
  readonly messageIsError?: boolean;
}

export interface PCloudProviderResult {
  readonly ok: boolean;
  readonly status: PCloudProviderStatus;
  readonly message: string;
}

export interface PCloudBackupUploadInput {
  readonly fileName: string;
  readonly fileContent: string;
}

export interface PCloudBackupRestoreCandidate {
  readonly fileId: number;
  readonly fileName: string;
  readonly sizeBytes: number;
  readonly modifiedAt?: string;
  readonly sha1?: string;
}

export interface PCloudBackupDownloadInput {
  readonly fileId: number;
  readonly fileName: string;
}

export type PCloudBackupUploadResult =
  | {
      readonly ok: true;
      readonly status: PCloudProviderStatus;
      readonly fileId: number;
      readonly fileName: string;
      readonly folderPath: string;
      readonly apiHost: PCloudApiHost;
      readonly sizeBytes: number;
      readonly sha256: string;
      readonly uploadedAt: string;
      readonly message: string;
    }
  | {
      readonly ok: false;
      readonly status: PCloudProviderStatus;
      readonly reason: string;
      readonly message: string;
      readonly cleanupFileId?: number;
      readonly cleanupNeeded?: boolean;
    };

export type PCloudBackupListResult =
  | {
      readonly ok: true;
      readonly status: PCloudProviderStatus;
      readonly folderPath: string;
      readonly apiHost: PCloudApiHost;
      readonly candidates: readonly PCloudBackupRestoreCandidate[];
      readonly message: string;
    }
  | {
      readonly ok: false;
      readonly status: PCloudProviderStatus;
      readonly reason: string;
      readonly message: string;
    };

export type PCloudBackupDownloadResult =
  | {
      readonly ok: true;
      readonly status: PCloudProviderStatus;
      readonly folderPath: string;
      readonly apiHost: PCloudApiHost;
      readonly fileId: number;
      readonly fileName: string;
      readonly fileContent: string;
      readonly sizeBytes: number;
      readonly sha256: string;
      readonly downloadedAt: string;
      readonly message: string;
    }
  | {
      readonly ok: false;
      readonly status: PCloudProviderStatus;
      readonly reason: string;
      readonly message: string;
    };

export interface ParsedPCloudOAuthRedirect {
  readonly accessToken: string;
  readonly apiHost: PCloudApiHost;
  readonly state: string | null;
}

const ALLOWED_PCLOUD_API_HOSTS = new Set<PCloudApiHost>(['api.pcloud.com', 'eapi.pcloud.com']);

export function normalizePCloudApiHost(input: string | null | undefined, fallback: PCloudApiHost = 'api.pcloud.com'): PCloudApiHost {
  const raw = input?.trim();
  if (!raw) return fallback;
  const candidate = raw.includes('://') ? new URL(raw).hostname : raw.split('/')[0]!;
  const host = candidate.trim().toLowerCase();
  if (ALLOWED_PCLOUD_API_HOSTS.has(host as PCloudApiHost)) return host as PCloudApiHost;
  throw new Error('pCloud API host must be api.pcloud.com or eapi.pcloud.com.');
}

export function parsePCloudOAuthRedirect(
  redirectUrl: string,
  expectedState: string,
  fallbackApiHost: PCloudApiHost = 'api.pcloud.com',
): ParsedPCloudOAuthRedirect {
  const url = new URL(redirectUrl);
  const search = new URLSearchParams(url.search);
  const hash = new URLSearchParams(url.hash.startsWith('#') ? url.hash.slice(1) : url.hash);
  const params = new URLSearchParams(search);
  for (const [key, value] of hash) params.set(key, value);

  const error = params.get('error');
  if (error) {
    const description = params.get('error_description') || error;
    throw new Error(`pCloud authorization failed: ${description}`);
  }

  const state = params.get('state');
  if (state !== expectedState) throw new Error('pCloud authorization returned an unexpected state.');

  const accessToken = params.get('access_token');
  if (!accessToken) throw new Error('pCloud authorization did not return an access token.');

  return {
    accessToken,
    apiHost: normalizePCloudApiHost(params.get('hostname'), fallbackApiHost),
    state,
  };
}
