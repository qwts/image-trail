import {
  PCLOUD_BACKUP_FOLDER_PATH,
  PCLOUD_BACKUP_PART_SUFFIX,
  type PCloudBackupCleanupInput,
  type PCloudBackupCleanupResult,
} from '../core/cloud/pcloud-provider.js';
import { ensurePCloudBackupFolder } from './pcloud-backup-folder.js';
import { loadPCloudConnectionRecord, pcloudStatusFromRecord, type PCloudConnectionRecord } from './pcloud-connection-store.js';
import { numberOrUndefined, recordOrNull } from './pcloud-provider-utils.js';

const PART_FILE_NAME = /^image-trail-cloud-([a-zA-Z0-9-]{1,36})-\d{6}-(?:metadata|records|original)\.image-trail-part\.json$/u;
const PART_CATALOG_TTL_MS = 60_000;

let partCatalogCache: {
  readonly key: string;
  readonly expiresAt: number;
  readonly files: ReadonlyMap<number, string>;
} | null = null;

async function fetchPCloudJson(
  record: PCloudConnectionRecord,
  method: string,
  params: Record<string, string>,
): Promise<Record<string, unknown>> {
  const response = await fetch(`https://${record.apiHost}/${method}`, {
    method: 'POST',
    mode: 'cors',
    credentials: 'include',
    referrer: 'https://my.pcloud.com/',
    referrerPolicy: 'origin',
    headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body: new URLSearchParams({ access_token: record.accessToken, ...params }),
  });
  const data = (await response.json()) as Record<string, unknown>;
  if (!response.ok || numberOrUndefined(data['result']) !== 0) {
    throw new Error(typeof data['error'] === 'string' ? data['error'] : `pCloud ${method} failed.`);
  }
  return data;
}

async function ensureFolder(record: PCloudConnectionRecord, parentFolderId: number, name: string): Promise<number> {
  const data = await fetchPCloudJson(record, 'createfolderifnotexists', { folderid: String(parentFolderId), name });
  const metadata = recordOrNull(data['metadata']);
  const folderId = numberOrUndefined(metadata?.['folderid']);
  if (metadata?.['isfolder'] !== true || folderId === undefined) throw new Error('pCloud folder metadata was invalid.');
  return folderId;
}

async function loadPartCatalog(record: PCloudConnectionRecord): Promise<ReadonlyMap<number, string>> {
  const backupFolderId = await ensurePCloudBackupFolder(record, ensureFolder);
  const data = await fetchPCloudJson(record, 'listfolder', { folderid: String(backupFolderId), noshares: '1' });
  const metadata = recordOrNull(data['metadata']);
  const contents = Array.isArray(metadata?.['contents']) ? metadata['contents'] : [];
  return new Map(
    contents
      .map(recordOrNull)
      .filter((item) => typeof item?.['name'] === 'string' && item['name'].endsWith(PCLOUD_BACKUP_PART_SUFFIX))
      .map((item) => [numberOrUndefined(item?.['fileid']), item?.['name']] as const)
      .filter((entry): entry is readonly [number, string] => entry[0] !== undefined && typeof entry[1] === 'string'),
  );
}

export async function assertPCloudBackupPartReference(record: PCloudConnectionRecord, fileId: number, fileName: string): Promise<void> {
  const backupId = PART_FILE_NAME.exec(fileName)?.[1];
  if (!backupId) throw new Error('pCloud backup part filename was invalid.');
  const cacheKey = `${record.apiHost}\u0000${record.connectedAt}\u0000${backupId}`;
  if (!partCatalogCache || partCatalogCache.key !== cacheKey || partCatalogCache.expiresAt <= Date.now()) {
    partCatalogCache = { key: cacheKey, expiresAt: Date.now() + PART_CATALOG_TTL_MS, files: await loadPartCatalog(record) };
  }
  if (partCatalogCache.files.get(fileId) !== fileName) {
    throw new Error(`pCloud backup part was not found under its exact manifest filename in ${PCLOUD_BACKUP_FOLDER_PATH}.`);
  }
}

async function deletePart(record: PCloudConnectionRecord, fileId: number): Promise<void> {
  await fetchPCloudJson(record, 'deletefile', { fileid: String(fileId) });
}

function disconnectedResult(fileIds: readonly number[]): PCloudBackupCleanupResult {
  const message = 'Connect pCloud before cleaning up partial backup files.';
  return {
    ok: false,
    status: { connected: false, message, messageIsError: true },
    reason: 'not-connected',
    deletedFileIds: [],
    failedFileIds: fileIds,
    message,
  };
}

export async function cleanupPCloudBackupParts(input: PCloudBackupCleanupInput): Promise<PCloudBackupCleanupResult> {
  const requestedFileIds = [...new Set(input.fileIds)];
  const record = await loadPCloudConnectionRecord();
  if (!record) return disconnectedResult(requestedFileIds);
  if (requestedFileIds.length === 0) {
    return { ok: true, status: pcloudStatusFromRecord(record), deletedFileIds: [], message: 'No partial backup files needed cleanup.' };
  }

  const deletedFileIds: number[] = [];
  const failedFileIds: number[] = [];
  try {
    const allowedFiles = await loadPartCatalog(record);
    for (const fileId of requestedFileIds) {
      if (!allowedFiles.has(fileId)) {
        failedFileIds.push(fileId);
        continue;
      }
      try {
        await deletePart(record, fileId);
        deletedFileIds.push(fileId);
      } catch {
        failedFileIds.push(fileId);
      }
    }
  } catch {
    failedFileIds.push(...requestedFileIds);
  }
  partCatalogCache = null;
  return cleanupResult(record, deletedFileIds, [...new Set(failedFileIds)]);
}

function cleanupResult(
  record: PCloudConnectionRecord,
  deletedFileIds: readonly number[],
  failedFileIds: readonly number[],
): PCloudBackupCleanupResult {
  if (failedFileIds.length > 0) {
    const message = `Cleaned up ${deletedFileIds.length} partial backup part(s). Cleanup still needed for pCloud fileid ${failedFileIds.join(', ')}.`;
    return {
      ok: false,
      status: { ...pcloudStatusFromRecord(record), message, messageIsError: true },
      reason: 'cleanup-failed',
      deletedFileIds,
      failedFileIds,
      message,
    };
  }
  const message = `Cleaned up ${deletedFileIds.length} partial backup part(s).`;
  return { ok: true, status: pcloudStatusFromRecord(record, message), deletedFileIds, message };
}
