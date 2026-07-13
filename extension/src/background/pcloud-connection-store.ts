import { normalizePCloudApiHost, type PCloudApiHost, type PCloudProviderStatus } from '../core/cloud/pcloud-provider.js';
import { hasTrustedExtensionStorage, restrictStorageToTrustedContexts } from './trusted-storage.js';

export interface PCloudConnectionRecord {
  readonly schemaVersion: 1;
  readonly provider: 'pcloud';
  readonly accessToken: string;
  readonly apiHost: PCloudApiHost;
  readonly connectedAt: string;
  readonly accountPremium?: boolean | undefined;
  readonly quotaBytes?: number | undefined;
  readonly usedQuotaBytes?: number | undefined;
}

const PCLOUD_CONNECTION_KEY = 'imageTrail.pcloudConnection';

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function pcloudStatusFromRecord(record: PCloudConnectionRecord | null, message?: string): PCloudProviderStatus {
  if (!record) return { connected: false, message };
  return {
    connected: true,
    apiHost: record.apiHost,
    connectedAt: record.connectedAt,
    accountPremium: record.accountPremium,
    quotaBytes: record.quotaBytes,
    usedQuotaBytes: record.usedQuotaBytes,
    message,
  };
}

export async function loadPCloudConnectionRecord(): Promise<PCloudConnectionRecord | null> {
  if (!hasTrustedExtensionStorage()) return null;
  await restrictStorageToTrustedContexts();
  const value = await chrome.storage.local.get(PCLOUD_CONNECTION_KEY);
  const candidate = objectRecord(value[PCLOUD_CONNECTION_KEY]);
  if (!candidate || candidate['schemaVersion'] !== 1 || candidate['provider'] !== 'pcloud') return null;
  const accessToken = optionalString(candidate['accessToken']);
  if (!accessToken) return null;
  let apiHost: PCloudApiHost;
  try {
    apiHost = normalizePCloudApiHost(optionalString(candidate['apiHost']));
  } catch {
    return null;
  }
  return {
    schemaVersion: 1,
    provider: 'pcloud',
    accessToken,
    apiHost,
    connectedAt: optionalString(candidate['connectedAt']) ?? new Date(0).toISOString(),
    accountPremium: typeof candidate['accountPremium'] === 'boolean' ? candidate['accountPremium'] : undefined,
    quotaBytes: optionalNumber(candidate['quotaBytes']),
    usedQuotaBytes: optionalNumber(candidate['usedQuotaBytes']),
  };
}

export async function savePCloudConnectionRecord(record: PCloudConnectionRecord): Promise<void> {
  await restrictStorageToTrustedContexts();
  await chrome.storage.local.set({ [PCLOUD_CONNECTION_KEY]: record });
}

export async function clearPCloudConnectionRecord(): Promise<void> {
  if (!hasTrustedExtensionStorage()) return;
  await restrictStorageToTrustedContexts();
  await chrome.storage.local.remove(PCLOUD_CONNECTION_KEY);
}
