import {
  normalizePCloudApiHost,
  parsePCloudOAuthRedirect,
  type PCloudApiHost,
  type PCloudProviderResult,
  type PCloudProviderStatus,
} from '../core/cloud/pcloud-provider.js';

interface PCloudConnectionRecord {
  readonly schemaVersion: 1;
  readonly provider: 'pcloud';
  readonly accessToken: string;
  readonly apiHost: PCloudApiHost;
  readonly connectedAt: string;
  readonly accountPremium?: boolean;
  readonly quotaBytes?: number;
  readonly usedQuotaBytes?: number;
}

const PCLOUD_CONNECTION_KEY = 'imageTrail.pcloudConnection';
const PCLOUD_CLIENT_ID = '83ag1CIbJd7';
const PCLOUD_AUTHORIZE_URL = 'https://my.pcloud.com/oauth2/authorize';
const DEFAULT_PCLOUD_API_HOST: PCloudApiHost = 'api.pcloud.com';

function hasChromeStorage(): boolean {
  return typeof chrome !== 'undefined' && !!chrome.storage?.local;
}

function hasChromeIdentity(): boolean {
  return typeof chrome !== 'undefined' && !!chrome.identity?.launchWebAuthFlow && !!chrome.identity?.getRedirectURL;
}

function pcloudStatusFromRecord(record: PCloudConnectionRecord | null, message?: string): PCloudProviderStatus {
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

function sanitizeError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message.replace(/access_token=[^&#\s]+/giu, 'access_token=redacted');
  return 'pCloud request failed.';
}

function numberOrUndefined(value: unknown): number | undefined {
  const numberValue = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
  return Number.isFinite(numberValue) ? numberValue : undefined;
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function booleanOrUndefined(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function recordOrNull(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

async function restrictStorageToTrustedContexts(): Promise<void> {
  if (!hasChromeStorage()) throw new Error('Extension storage is unavailable.');
  const setAccessLevel = chrome.storage.local.setAccessLevel;
  if (typeof setAccessLevel !== 'function') throw new Error('Trusted extension storage is unavailable.');
  await setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
}

async function loadConnectionRecord(): Promise<PCloudConnectionRecord | null> {
  if (!hasChromeStorage()) return null;
  await restrictStorageToTrustedContexts();
  const value = await chrome.storage.local.get(PCLOUD_CONNECTION_KEY);
  const candidate = recordOrNull(value[PCLOUD_CONNECTION_KEY]);
  if (!candidate || candidate.schemaVersion !== 1 || candidate.provider !== 'pcloud') return null;
  const accessToken = stringOrUndefined(candidate.accessToken);
  if (!accessToken) return null;
  let apiHost: PCloudApiHost;
  try {
    apiHost = normalizePCloudApiHost(stringOrUndefined(candidate.apiHost));
  } catch {
    return null;
  }
  return {
    schemaVersion: 1,
    provider: 'pcloud',
    accessToken,
    apiHost,
    connectedAt: stringOrUndefined(candidate.connectedAt) ?? new Date(0).toISOString(),
    accountPremium: booleanOrUndefined(candidate.accountPremium),
    quotaBytes: numberOrUndefined(candidate.quotaBytes),
    usedQuotaBytes: numberOrUndefined(candidate.usedQuotaBytes),
  };
}

async function saveConnectionRecord(record: PCloudConnectionRecord): Promise<void> {
  await restrictStorageToTrustedContexts();
  await chrome.storage.local.set({ [PCLOUD_CONNECTION_KEY]: record });
}

async function clearConnectionRecord(): Promise<void> {
  if (!hasChromeStorage()) return;
  await restrictStorageToTrustedContexts();
  await chrome.storage.local.remove(PCLOUD_CONNECTION_KEY);
}

function launchWebAuthFlow(url: string): Promise<string> {
  if (!hasChromeIdentity()) throw new Error('Chrome identity OAuth is unavailable.');
  return new Promise((resolve, reject) => {
    chrome.identity.launchWebAuthFlow({ url, interactive: true }, (redirectUrl) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        reject(new Error(lastError.message || 'pCloud authorization was cancelled.'));
        return;
      }
      if (!redirectUrl) {
        reject(new Error('pCloud authorization did not return a redirect URL.'));
        return;
      }
      resolve(redirectUrl);
    });
  });
}

async function fetchPCloudJson(apiHost: PCloudApiHost, method: string, accessToken: string): Promise<Record<string, unknown>> {
  const body = new URLSearchParams({ access_token: accessToken });
  const response = await fetch(`https://${apiHost}/${method}`, { method: 'POST', body });
  const data = (await response.json()) as Record<string, unknown>;
  const resultCode = numberOrUndefined(data.result);
  if (!response.ok || resultCode !== 0) {
    const error = typeof data.error === 'string' ? data.error : `pCloud ${method} failed.`;
    throw new Error(error);
  }
  return data;
}

async function loadValidatedStatus(record: PCloudConnectionRecord): Promise<PCloudProviderStatus> {
  const userInfo = await fetchPCloudJson(record.apiHost, 'userinfo', record.accessToken);
  const refreshed: PCloudConnectionRecord = {
    ...record,
    accountPremium: Boolean(userInfo.premium),
    quotaBytes: numberOrUndefined(userInfo.quota),
    usedQuotaBytes: numberOrUndefined(userInfo.usedquota),
  };
  await saveConnectionRecord(refreshed);
  return pcloudStatusFromRecord(refreshed, 'pCloud is connected.');
}

export async function loadPCloudProviderStatus(): Promise<PCloudProviderStatus> {
  const record = await loadConnectionRecord();
  if (!record) return { connected: false };
  try {
    return await loadValidatedStatus(record);
  } catch (error) {
    return { ...pcloudStatusFromRecord(record), message: sanitizeError(error), messageIsError: true };
  }
}

export async function connectPCloudProvider(): Promise<PCloudProviderResult> {
  try {
    const state = crypto.randomUUID();
    const redirectUri = chrome.identity.getRedirectURL('pcloud');
    const authorizeUrl = new URL(PCLOUD_AUTHORIZE_URL);
    authorizeUrl.searchParams.set('client_id', PCLOUD_CLIENT_ID);
    authorizeUrl.searchParams.set('response_type', 'token');
    authorizeUrl.searchParams.set('redirect_uri', redirectUri);
    authorizeUrl.searchParams.set('state', state);

    const redirectUrl = await launchWebAuthFlow(authorizeUrl.toString());
    const oauth = parsePCloudOAuthRedirect(redirectUrl, state, DEFAULT_PCLOUD_API_HOST);
    const userInfo = await fetchPCloudJson(oauth.apiHost, 'userinfo', oauth.accessToken);
    const record: PCloudConnectionRecord = {
      schemaVersion: 1,
      provider: 'pcloud',
      accessToken: oauth.accessToken,
      apiHost: oauth.apiHost,
      connectedAt: new Date().toISOString(),
      accountPremium: Boolean(userInfo.premium),
      quotaBytes: numberOrUndefined(userInfo.quota),
      usedQuotaBytes: numberOrUndefined(userInfo.usedquota),
    };
    await saveConnectionRecord(record);
    const status = pcloudStatusFromRecord(record, 'pCloud is connected.');
    return { ok: true, status, message: 'pCloud is connected.' };
  } catch (error) {
    const status = { connected: false, message: sanitizeError(error) };
    return { ok: false, status, message: status.message };
  }
}

export async function disconnectPCloudProvider(): Promise<PCloudProviderResult> {
  await clearConnectionRecord();
  const status = { connected: false, message: 'pCloud disconnected.' };
  return { ok: true, status, message: status.message };
}
