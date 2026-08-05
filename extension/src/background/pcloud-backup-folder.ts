import { PCLOUD_BACKUP_FOLDER_SEGMENTS } from '../core/cloud/pcloud-provider.js';
import type { PCloudConnectionRecord } from './pcloud-connection-store.js';

type EnsureFolder = (record: PCloudConnectionRecord, parentFolderId: number, name: string) => Promise<number>;

export async function ensurePCloudBackupFolder(record: PCloudConnectionRecord, ensureFolder: EnsureFolder): Promise<number> {
  let folderId = 0;
  for (const segment of PCLOUD_BACKUP_FOLDER_SEGMENTS) folderId = await ensureFolder(record, folderId, segment);
  return folderId;
}
