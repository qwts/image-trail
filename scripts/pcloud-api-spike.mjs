#!/usr/bin/env node

import { createHash, randomUUID } from 'node:crypto';
import process from 'node:process';

const DEFAULT_API_HOST = 'api.pcloud.com';
const ALLOWED_API_HOSTS = new Set([DEFAULT_API_HOST, 'eapi.pcloud.com']);
const DEFAULT_ROOT_FOLDER_NAME = 'Image Trail API Spike';
const DEFAULT_BACKUP_FOLDER_NAME = 'backups';

const token = process.env.PCLOUD_ACCESS_TOKEN;
const apiHost = normalizeApiHost(process.env.PCLOUD_API_HOST ?? DEFAULT_API_HOST);
const rootFolderName = process.env.PCLOUD_SPIKE_ROOT_FOLDER ?? DEFAULT_ROOT_FOLDER_NAME;
const keepFile = process.env.PCLOUD_SPIKE_KEEP_FILE === '1';
const cleanupFileId = process.env.PCLOUD_SPIKE_DELETE_FILEID;

if (!token) {
  console.error('Missing PCLOUD_ACCESS_TOKEN. Set it in your shell or an ignored local env file before running this spike.');
  console.error('Optional: PCLOUD_API_HOST=api.pcloud.com or eapi.pcloud.com, PCLOUD_SPIKE_KEEP_FILE=1.');
  process.exit(2);
}

const artifact = createTestArtifact();
const created = {
  fileId: undefined,
  fileName: artifact.fileName,
};

try {
  console.log(`pCloud API spike starting against ${apiHost}.`);

  if (cleanupFileId) {
    await apiJson('deletefile', { fileid: cleanupFileId });
    console.log(`Deleted requested pCloud fileid=${cleanupFileId}.`);
    process.exit(0);
  }

  const user = await apiJson('userinfo');
  console.log(
    `Authenticated. premium=${Boolean(user.premium)} quotaBytes=${numberOrUnknown(user.quota)} usedQuotaBytes=${numberOrUnknown(
      user.usedquota,
    )}`,
  );

  const rootFolder = await ensureFolder(0, rootFolderName);
  console.log(`Using root folder "${rootFolder.name}" folderid=${rootFolder.folderid}.`);

  const backupFolder = await ensureFolder(rootFolder.folderid, DEFAULT_BACKUP_FOLDER_NAME);
  console.log(`Using backup folder "${backupFolder.name}" folderid=${backupFolder.folderid}.`);

  const upload = await uploadArtifact(backupFolder.folderid, artifact);
  const metadata = upload.metadata?.[0];
  if (!metadata?.fileid) throw new Error('Upload response did not include metadata[0].fileid.');
  created.fileId = metadata.fileid;
  console.log(`Uploaded ${metadata.name} fileid=${metadata.fileid} size=${metadata.size}.`);

  const listed = await waitForListedFile(backupFolder.folderid, metadata.fileid);
  if (!listed) throw new Error(`Uploaded fileid=${metadata.fileid} was not present in listfolder output.`);
  console.log(`Listed uploaded artifact in folder contents.`);

  const checksum = await apiJson('checksumfile', { fileid: String(metadata.fileid) });
  console.log(
    `Checksum available. sha1=${Boolean(checksum.sha1)} md5=${Boolean(checksum.md5)} sha256=${Boolean(checksum.sha256)}.`,
  );

  const downloaded = await downloadFile(metadata.fileid);
  const downloadedSha256 = sha256(downloaded);
  if (!downloaded.equals(artifact.bytes)) {
    throw new Error(`Downloaded artifact mismatch. expectedSha256=${artifact.sha256} actualSha256=${downloadedSha256}`);
  }
  console.log(`Downloaded artifact matched byte-for-byte. sha256=${downloadedSha256}.`);

  if (keepFile) {
    console.log(`Keeping test artifact in pCloud because PCLOUD_SPIKE_KEEP_FILE=1.`);
  } else {
    await apiJson('deletefile', { fileid: String(metadata.fileid) });
    created.fileId = undefined;
    console.log(`Deleted test artifact fileid=${metadata.fileid}.`);
  }

  console.log('pCloud API spike passed.');
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  if (process.exitCode && created.fileId && !keepFile) {
    try {
      await apiJson('deletefile', { fileid: String(created.fileId) });
      console.error(`Deleted test artifact during failure cleanup: fileid=${created.fileId} (${created.fileName}).`);
    } catch {
      console.error(`Cleanup needed: delete pCloud fileid=${created.fileId} (${created.fileName}).`);
    }
  }
}

async function ensureFolder(parentFolderId, name) {
  const result = await apiJson('createfolderifnotexists', { folderid: String(parentFolderId), name });
  if (!result.metadata?.isfolder || typeof result.metadata.folderid !== 'number') {
    throw new Error(`createfolderifnotexists did not return folder metadata for "${name}".`);
  }
  return result.metadata;
}

async function uploadArtifact(folderId, input) {
  const form = new FormData();
  form.set('access_token', token);
  form.set('folderid', String(folderId));
  form.set('filename', input.fileName);
  form.set('nopartial', '1');
  form.set('renameifexists', '1');
  form.set('file', new Blob([input.bytes], { type: 'application/json' }), input.fileName);

  return pcloudJsonFetch('uploadfile', { method: 'POST', body: form });
}

async function downloadFile(fileId) {
  const link = await apiJson('getfilelink', { fileid: String(fileId), forcedownload: '1', skipfilename: '1' });
  const host = link.hosts?.[0];
  if (typeof host !== 'string' || typeof link.path !== 'string') {
    throw new Error('getfilelink did not return a usable host/path pair.');
  }

  const response = await fetch(`https://${host}${link.path}`, { redirect: 'follow' });
  if (!response.ok) {
    throw new Error(`Download failed with HTTP ${response.status}.`);
  }
  return Buffer.from(await response.arrayBuffer());
}

async function waitForListedFile(folderId, fileId) {
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const listing = await apiJson('listfolder', { folderid: String(folderId), noshares: '1' });
    const listed = listing.metadata?.contents?.some((item) => String(item.fileid) === String(fileId));
    if (listed) return true;
    if (attempt < 5) await sleep(500 * attempt);
  }
  return false;
}

async function apiJson(method, params = {}) {
  const body = new URLSearchParams({ access_token: token, ...params });
  return pcloudJsonFetch(method, { method: 'POST', body });
}

async function pcloudJsonFetch(method, init) {
  const response = await fetch(`https://${apiHost}/${method}`, init);
  const text = await response.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`${method} returned non-JSON HTTP ${response.status}.`);
  }
  if (!response.ok || parsed.result !== 0) {
    throw new Error(`${method} failed: result=${parsed.result ?? 'unknown'} message=${parsed.error ?? response.statusText}`);
  }
  return parsed;
}

function createTestArtifact() {
  const now = new Date().toISOString();
  const fileName = `image-trail-pcloud-spike-${now.replaceAll(':', '-').replace(/\.\d{3}Z$/u, 'Z')}.image-trail-encrypted.json`;
  const bytes = Buffer.from(
    JSON.stringify({
      header: {
        magic: 'IMAGE-TRAIL-EXPORT',
        formatVersion: 1,
        payloadType: 'mixed',
        algorithm: 'AES-GCM',
        wrappingMode: 'password',
        keyKind: 'export',
        keyReference: `spike:${randomUUID()}`,
        salt: '',
        iv: '',
        iterations: 0,
        createdAt: now,
        recordCount: 0,
      },
      payload: 'non-sensitive pCloud API spike payload',
    }),
  );
  return { bytes, fileName, sha256: sha256(bytes) };
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function normalizeApiHost(value) {
  const host = String(value).replace(/^https?:\/\//u, '').replace(/\/.*$/u, '').trim().toLowerCase();
  if (!host) throw new Error('PCLOUD_API_HOST resolved to an empty host.');
  if (!ALLOWED_API_HOSTS.has(host)) {
    throw new Error('PCLOUD_API_HOST must be api.pcloud.com or eapi.pcloud.com.');
  }
  return host;
}

function numberOrUnknown(value) {
  return typeof value === 'number' ? value : 'unknown';
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
