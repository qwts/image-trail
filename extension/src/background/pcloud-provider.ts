import {
  parsePCloudOAuthRedirect,
  type PCloudBackupDownloadInput,
  type PCloudBackupDownloadResult,
  type PCloudBackupListResult,
  type PCloudBackupRestoreCandidate,
  type PCloudBackupUploadInput,
  type PCloudBackupUploadResult,
  type PCloudApiHost,
  type PCloudProviderResult,
  type PCloudProviderStatus,
} from '../core/cloud/pcloud-provider.js';
import { appendBackupHistory, loadBackupHistory } from './backup-history-store.js';
import {
  clearPCloudConnectionRecord,
  loadPCloudConnectionRecord,
  pcloudStatusFromRecord,
  savePCloudConnectionRecord,
  type PCloudConnectionRecord,
} from './pcloud-connection-store.js';

const PCLOUD_CLIENT_ID = '83ag1CIbJd7';
const PCLOUD_AUTHORIZE_URL = 'https://my.pcloud.com/oauth2/authorize';
const PCLOUD_DOWNLOAD_REFERRER = 'https://my.pcloud.com/';
const PCLOUD_REQUEST_HEADER_RULE_ID_BASE = 900199;
const DEFAULT_PCLOUD_API_HOST: PCloudApiHost = 'api.pcloud.com';
const PCLOUD_ROOT_FOLDER_NAME = 'Image Trail';
const PCLOUD_BACKUP_FOLDER_NAME = 'backups';
const PCLOUD_BACKUP_FOLDER_PATH = '/Image Trail/backups';
const PCLOUD_LIST_RETRY_ATTEMPTS = 5;
const PCLOUD_LIST_RETRY_BASE_MS = 500;
let pcloudRequestHeaderRuleId = PCLOUD_REQUEST_HEADER_RULE_ID_BASE;

function hasChromeIdentity(): boolean {
  return typeof chrome !== 'undefined' && !!chrome.identity?.launchWebAuthFlow && !!chrome.identity?.getRedirectURL;
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

function recordOrNull(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
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

async function requestPCloudJson(apiHost: PCloudApiHost, method: string, body: BodyInit): Promise<Record<string, unknown>> {
  const isUrlEncodedBody = body instanceof URLSearchParams;
  const urlEncodedInit: RequestInit = isUrlEncodedBody
    ? {
        mode: 'cors',
        credentials: 'include',
        referrer: PCLOUD_DOWNLOAD_REFERRER,
        referrerPolicy: 'origin',
        headers: {
          accept: '*/*',
          'accept-language': 'en-US,en;q=0.9',
          'cache-control': 'no-cache',
          'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
          pragma: 'no-cache',
        },
      }
    : {};
  const response = await fetch(`https://${apiHost}/${method}`, {
    method: 'POST',
    ...urlEncodedInit,
    body,
  });
  const data = (await response.json()) as Record<string, unknown>;
  const resultCode = numberOrUndefined(data['result']);
  if (!response.ok || resultCode !== 0) {
    const error = typeof data['error'] === 'string' ? data['error'] : `pCloud ${method} failed.`;
    throw new Error(error);
  }
  return data;
}

async function fetchPCloudJson(
  apiHost: PCloudApiHost,
  method: string,
  accessToken: string,
  params: Record<string, string> = {},
): Promise<Record<string, unknown>> {
  return requestPCloudJson(apiHost, method, new URLSearchParams({ access_token: accessToken, ...params }));
}

async function fetchPCloudJsonWithReferer(
  apiHost: PCloudApiHost,
  method: string,
  accessToken: string,
  params: Record<string, string> = {},
): Promise<Record<string, unknown>> {
  const url = `https://${apiHost}/${method}`;
  const removeRule = await installPCloudRequestHeaderRule(url);
  try {
    return await requestPCloudJson(apiHost, method, new URLSearchParams({ access_token: accessToken, ...params }));
  } finally {
    await removeRule();
  }
}

async function loadValidatedStatus(record: PCloudConnectionRecord): Promise<PCloudProviderStatus> {
  const userInfo = await fetchPCloudJson(record.apiHost, 'userinfo', record.accessToken);
  const refreshed: PCloudConnectionRecord = {
    ...record,
    accountPremium: Boolean(userInfo['premium']),
    quotaBytes: numberOrUndefined(userInfo['quota']),
    usedQuotaBytes: numberOrUndefined(userInfo['usedquota']),
  };
  await savePCloudConnectionRecord(refreshed);
  return pcloudStatusFromRecord(refreshed, 'pCloud is connected.');
}

function folderIdFromMetadata(data: Record<string, unknown>): number {
  const metadata = recordOrNull(data['metadata']);
  const folderId = numberOrUndefined(metadata?.['folderid']);
  if (!metadata || metadata['isfolder'] !== true || folderId === undefined)
    throw new Error('pCloud did not return the expected folder metadata.');
  return folderId;
}

async function ensureFolder(record: PCloudConnectionRecord, parentFolderId: number, name: string): Promise<number> {
  const data = await fetchPCloudJson(record.apiHost, 'createfolderifnotexists', record.accessToken, {
    folderid: String(parentFolderId),
    name,
  });
  return folderIdFromMetadata(data);
}

function uploadMetadataFromResponse(data: Record<string, unknown>): Record<string, unknown> {
  const metadataList = Array.isArray(data['metadata']) ? data['metadata'] : [data['metadata']];
  const metadata = metadataList.map(recordOrNull).find((item): item is Record<string, unknown> => !!item);
  if (!metadata) throw new Error('pCloud did not return upload metadata.');
  return metadata;
}

function backupCandidateFromMetadata(value: unknown): PCloudBackupRestoreCandidate | null {
  const metadata = recordOrNull(value);
  if (!metadata || metadata['isfolder'] === true) return null;
  const fileId = numberOrUndefined(metadata['fileid']);
  const fileName = stringOrUndefined(metadata['name']);
  const sizeBytes = numberOrUndefined(metadata['size']);
  if (fileId === undefined || !fileName || sizeBytes === undefined) return null;
  if (!fileName.endsWith('.image-trail-encrypted.json')) return null;
  return {
    fileId,
    fileName,
    sizeBytes,
    modifiedAt: stringOrUndefined(metadata['modified']),
    sha1: stringOrUndefined(metadata['sha1'])?.toLowerCase(),
  };
}

function sortRestoreCandidates(candidates: readonly PCloudBackupRestoreCandidate[]): readonly PCloudBackupRestoreCandidate[] {
  return [...candidates].sort((left, right) => {
    const rightTime = Date.parse(right.modifiedAt ?? '');
    const leftTime = Date.parse(left.modifiedAt ?? '');
    if (Number.isFinite(rightTime) && Number.isFinite(leftTime) && rightTime !== leftTime) return rightTime - leftTime;
    return right.fileId - left.fileId;
  });
}

function arrayBufferFromBytes(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function uploadBackupFile(
  record: PCloudConnectionRecord,
  folderId: number,
  input: PCloudBackupUploadInput,
  bytes: Uint8Array,
): Promise<{ readonly fileId: number; readonly sizeBytes: number; readonly fileName: string }> {
  const form = new FormData();
  form.set('access_token', record.accessToken);
  form.set('folderid', String(folderId));
  form.set('filename', input.fileName);
  form.set('nopartial', '1');
  form.set('renameifexists', '1');
  form.set('file', new Blob([arrayBufferFromBytes(bytes)], { type: 'application/json' }), input.fileName);

  const data = await requestPCloudJson(record.apiHost, 'uploadfile', form);
  const metadata = uploadMetadataFromResponse(data);
  const fileId = numberOrUndefined(metadata['fileid']);
  const sizeBytes = numberOrUndefined(metadata['size']);
  const fileName = stringOrUndefined(metadata['name']) ?? input.fileName;
  if (fileId === undefined || sizeBytes === undefined) throw new Error('pCloud did not return uploaded file metadata.');
  return { fileId, sizeBytes, fileName };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function waitForListedFile(record: PCloudConnectionRecord, folderId: number, fileId: number): Promise<void> {
  for (let attempt = 1; attempt <= PCLOUD_LIST_RETRY_ATTEMPTS; attempt += 1) {
    const data = await fetchPCloudJson(record.apiHost, 'listfolder', record.accessToken, {
      folderid: String(folderId),
      noshares: '1',
    });
    const metadata = recordOrNull(data['metadata']);
    const contents = Array.isArray(metadata?.['contents']) ? metadata['contents'] : [];
    const listed = contents.map(recordOrNull).some((item) => numberOrUndefined(item?.['fileid']) === fileId);
    if (listed) return;
    if (attempt < PCLOUD_LIST_RETRY_ATTEMPTS) await sleep(PCLOUD_LIST_RETRY_BASE_MS * attempt);
  }
  throw new Error('Uploaded pCloud backup was not visible in the backup folder listing.');
}

function validateDownloadHost(host: string): string {
  const normalized = host.trim().toLowerCase();
  if (normalized === 'pcloud.com' || normalized.endsWith('.pcloud.com')) return normalized;
  throw new Error('pCloud returned an unexpected download host.');
}

async function downloadPCloudFile(record: PCloudConnectionRecord, fileId: number): Promise<Uint8Array> {
  const data = await fetchPCloudJsonWithReferer(record.apiHost, 'getfilelink', record.accessToken, {
    fileid: String(fileId),
    forcedownload: '1',
    skipfilename: '1',
  });
  const hosts = Array.isArray(data['hosts']) ? data['hosts'] : [];
  const path = stringOrUndefined(data['path']);
  if (hosts.length === 0 || !path) throw new Error('pCloud did not return a download link.');

  let lastError = 'pCloud backup download failed.';
  for (const hostValue of hosts) {
    const host = stringOrUndefined(hostValue);
    if (!host) continue;
    const response = await fetchPCloudDownloadUrl(`https://${validateDownloadHost(host)}${path}`);
    if (response.ok) return new Uint8Array(await response.arrayBuffer());
    const text = await response.text();
    lastError = text.trim() || lastError;
  }
  throw new Error(lastError);
}

async function fetchPCloudDownloadUrl(url: string): Promise<Response> {
  const removeRule = await installPCloudRequestHeaderRule(url);
  try {
    return await fetch(url, {
      referrer: PCLOUD_DOWNLOAD_REFERRER,
      referrerPolicy: 'origin',
    });
  } finally {
    await removeRule();
  }
}

function nextPCloudRequestHeaderRuleId(): number {
  pcloudRequestHeaderRuleId += 1;
  return pcloudRequestHeaderRuleId;
}

async function installPCloudRequestHeaderRule(url: string): Promise<() => Promise<void>> {
  if (typeof chrome === 'undefined' || !chrome.declarativeNetRequest?.updateSessionRules) return async () => {};
  const ruleId = nextPCloudRequestHeaderRuleId();
  const regexFilter = `^${escapeRegExp(url)}$`;
  await chrome.declarativeNetRequest.updateSessionRules({
    addRules: [
      {
        id: ruleId,
        priority: 1,
        action: {
          type: chrome.declarativeNetRequest.RuleActionType.MODIFY_HEADERS,
          requestHeaders: [
            {
              header: 'Referer',
              operation: chrome.declarativeNetRequest.HeaderOperation.SET,
              value: PCLOUD_DOWNLOAD_REFERRER,
            },
            {
              header: 'Origin',
              operation: chrome.declarativeNetRequest.HeaderOperation.SET,
              value: PCLOUD_DOWNLOAD_REFERRER,
            },
          ],
        },
        condition: {
          regexFilter,
          resourceTypes: [chrome.declarativeNetRequest.ResourceType.XMLHTTPREQUEST],
        },
      },
    ],
  });
  return async () => {
    await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [ruleId] });
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

async function digestHex(algorithm: 'SHA-1' | 'SHA-256', bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest(algorithm, arrayBufferFromBytes(bytes));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function verifyPCloudChecksum(record: PCloudConnectionRecord, fileId: number, bytes: Uint8Array): Promise<void> {
  const data = await fetchPCloudJson(record.apiHost, 'checksumfile', record.accessToken, { fileid: String(fileId) });
  const remoteSha1 = stringOrUndefined(data['sha1'])?.toLowerCase();
  if (!remoteSha1) throw new Error('pCloud did not return a SHA-1 checksum for backup verification.');
  const localSha1 = await digestHex('SHA-1', bytes);
  if (remoteSha1 !== localSha1) throw new Error('pCloud backup checksum did not match the local export.');
}

async function verifyPCloudBackupBytes(
  record: PCloudConnectionRecord,
  fileId: number,
  bytes: Uint8Array,
): Promise<'download' | 'checksum'> {
  let downloaded: Uint8Array;
  try {
    downloaded = await downloadPCloudFile(record, fileId);
  } catch {
    await verifyPCloudChecksum(record, fileId, bytes);
    return 'checksum';
  }
  if (!bytesEqual(bytes, downloaded)) throw new Error('Downloaded pCloud backup bytes did not match the local export.');
  return 'download';
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

async function deletePCloudFile(record: PCloudConnectionRecord, fileId: number): Promise<void> {
  await fetchPCloudJson(record.apiHost, 'deletefile', record.accessToken, { fileid: String(fileId) });
}

function failedUploadResult(
  record: PCloudConnectionRecord | null,
  reason: string,
  message: string,
  cleanup?: { readonly fileId: number; readonly needed: boolean },
): PCloudBackupUploadResult {
  return {
    ok: false,
    status: { ...pcloudStatusFromRecord(record), message, messageIsError: true },
    reason,
    message,
    cleanupFileId: cleanup?.fileId,
    cleanupNeeded: cleanup?.needed,
  };
}

function failedListResult(record: PCloudConnectionRecord | null, reason: string, message: string): PCloudBackupListResult {
  return {
    ok: false,
    status: { ...pcloudStatusFromRecord(record), message, messageIsError: true },
    reason,
    message,
  };
}

function failedDownloadResult(record: PCloudConnectionRecord | null, reason: string, message: string): PCloudBackupDownloadResult {
  return {
    ok: false,
    status: { ...pcloudStatusFromRecord(record), message, messageIsError: true },
    reason,
    message,
  };
}

async function failVerifiedUpload(
  record: PCloudConnectionRecord,
  fileId: number,
  reason: string,
  message: string,
): Promise<PCloudBackupUploadResult> {
  try {
    await deletePCloudFile(record, fileId);
    return failedUploadResult(record, reason, `${message} The unverified pCloud file was deleted.`, { fileId, needed: false });
  } catch {
    return failedUploadResult(record, reason, `${message} Cleanup needed: delete pCloud fileid ${fileId}.`, { fileId, needed: true });
  }
}

export async function loadPCloudProviderStatus(): Promise<PCloudProviderStatus> {
  const backupHistory = await loadBackupHistory().catch(() => []);
  const record = await loadPCloudConnectionRecord();
  if (!record) return { connected: false, backupHistory };
  try {
    return { ...(await loadValidatedStatus(record)), backupHistory };
  } catch (error) {
    return { ...pcloudStatusFromRecord(record), backupHistory, message: sanitizeError(error), messageIsError: true };
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
      accountPremium: Boolean(userInfo['premium']),
      quotaBytes: numberOrUndefined(userInfo['quota']),
      usedQuotaBytes: numberOrUndefined(userInfo['usedquota']),
    };
    await savePCloudConnectionRecord(record);
    const status = pcloudStatusFromRecord(record, 'pCloud is connected.');
    return { ok: true, status, message: 'pCloud is connected.' };
  } catch (error) {
    const status = { connected: false, message: sanitizeError(error) };
    return { ok: false, status, message: status.message };
  }
}

export async function disconnectPCloudProvider(): Promise<PCloudProviderResult> {
  await clearPCloudConnectionRecord();
  const status = { connected: false, message: 'pCloud disconnected.' };
  return { ok: true, status, message: status.message };
}

export async function uploadPCloudBackup(input: PCloudBackupUploadInput): Promise<PCloudBackupUploadResult> {
  const fileName = input.fileName.trim();
  if (!fileName || !input.fileContent) {
    return failedUploadResult(null, 'invalid-input', 'A backup file name and encrypted file content are required.');
  }

  const record = await loadPCloudConnectionRecord();
  if (!record) return failedUploadResult(null, 'not-connected', 'Connect pCloud before backing up.');

  try {
    const bytes = new TextEncoder().encode(input.fileContent);
    const sha256 = await digestHex('SHA-256', bytes);
    const rootFolderId = await ensureFolder(record, 0, PCLOUD_ROOT_FOLDER_NAME);
    const backupFolderId = await ensureFolder(record, rootFolderId, PCLOUD_BACKUP_FOLDER_NAME);
    const uploaded = await uploadBackupFile(record, backupFolderId, { fileName, fileContent: input.fileContent }, bytes);

    let verificationMethod: 'download' | 'checksum';
    try {
      await waitForListedFile(record, backupFolderId, uploaded.fileId);
      verificationMethod = await verifyPCloudBackupBytes(record, uploaded.fileId, bytes);
    } catch (error) {
      return await failVerifiedUpload(record, uploaded.fileId, 'verification-failed', sanitizeError(error));
    }

    const uploadedAt = new Date().toISOString();
    const historyRecord = {
      schemaVersion: 1,
      provider: 'pcloud',
      destination: PCLOUD_BACKUP_FOLDER_PATH,
      fileName: uploaded.fileName,
      completedAt: uploadedAt,
      sizeBytes: uploaded.sizeBytes,
      sha256,
      verificationMethod: verificationMethod === 'download' ? 'download-byte-match' : 'provider-checksum',
    } as const;
    let historyPersisted = true;
    try {
      await appendBackupHistory(historyRecord);
    } catch {
      historyPersisted = false;
    }
    let message =
      verificationMethod === 'download'
        ? `Uploaded and verified ${uploaded.fileName}.`
        : `Uploaded and verified ${uploaded.fileName} with pCloud checksum.`;
    if (!historyPersisted) message += ' Backup history could not be saved.';
    return {
      ok: true,
      status: pcloudStatusFromRecord(record, message),
      fileId: uploaded.fileId,
      fileName: uploaded.fileName,
      folderPath: PCLOUD_BACKUP_FOLDER_PATH,
      apiHost: record.apiHost,
      sizeBytes: uploaded.sizeBytes,
      sha256,
      uploadedAt,
      verificationMethod: historyRecord.verificationMethod,
      historyRecord,
      historyPersisted,
      message,
    };
  } catch (error) {
    return failedUploadResult(record, 'upload-failed', sanitizeError(error));
  }
}

export async function listPCloudBackups(): Promise<PCloudBackupListResult> {
  const record = await loadPCloudConnectionRecord();
  if (!record) return failedListResult(null, 'not-connected', 'Connect pCloud before choosing a restore file.');

  try {
    const rootFolderId = await ensureFolder(record, 0, PCLOUD_ROOT_FOLDER_NAME);
    const backupFolderId = await ensureFolder(record, rootFolderId, PCLOUD_BACKUP_FOLDER_NAME);
    const data = await fetchPCloudJson(record.apiHost, 'listfolder', record.accessToken, {
      folderid: String(backupFolderId),
      noshares: '1',
    });
    const metadata = recordOrNull(data['metadata']);
    const contents = Array.isArray(metadata?.['contents']) ? metadata['contents'] : [];
    const candidates = sortRestoreCandidates(
      contents.map(backupCandidateFromMetadata).filter((item): item is PCloudBackupRestoreCandidate => !!item),
    );
    const message =
      candidates.length === 0
        ? 'No encrypted pCloud backups were found in /Image Trail/backups.'
        : `Found ${candidates.length} encrypted pCloud backup${candidates.length === 1 ? '' : 's'}.`;
    return {
      ok: true,
      status: pcloudStatusFromRecord(record, message),
      folderPath: PCLOUD_BACKUP_FOLDER_PATH,
      apiHost: record.apiHost,
      candidates,
      message,
    };
  } catch (error) {
    return failedListResult(record, 'list-failed', sanitizeError(error));
  }
}

export async function downloadPCloudBackup(input: PCloudBackupDownloadInput): Promise<PCloudBackupDownloadResult> {
  const fileName = input.fileName.trim();
  if (!fileName || !fileName.endsWith('.image-trail-encrypted.json')) {
    return failedDownloadResult(null, 'invalid-input', 'Choose an Image Trail encrypted backup file before restoring.');
  }
  if (!Number.isFinite(input.fileId) || input.fileId <= 0) {
    return failedDownloadResult(null, 'invalid-input', 'Choose a valid pCloud backup file before restoring.');
  }

  const record = await loadPCloudConnectionRecord();
  if (!record) return failedDownloadResult(null, 'not-connected', 'Connect pCloud before restoring.');

  try {
    const bytes = await downloadPCloudFile(record, input.fileId);
    const fileContent = new TextDecoder().decode(bytes);
    const sha256 = await digestHex('SHA-256', bytes);
    const downloadedAt = new Date().toISOString();
    const message = `Downloaded ${fileName}. Review the restore preview before importing.`;
    return {
      ok: true,
      status: pcloudStatusFromRecord(record, message),
      folderPath: PCLOUD_BACKUP_FOLDER_PATH,
      apiHost: record.apiHost,
      fileId: input.fileId,
      fileName,
      fileContent,
      sizeBytes: bytes.byteLength,
      sha256,
      downloadedAt,
      message,
    };
  } catch (error) {
    return failedDownloadResult(record, 'download-failed', sanitizeError(error));
  }
}
