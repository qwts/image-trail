import {
  InteropTransportError,
  assertSafeInteropPath,
  sha256,
  type InteropObjectPage,
  type InteropObjectStore,
} from '../core/interop/transport.js';
import { ChromeIdentityInteropDriveAuth } from './interop-chrome-identity.js';

const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
const ROOT_NAME = 'Image Trail Interop';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const OWNER = 'qwts-image-trail-interop-v1';

interface DriveFile {
  readonly id?: unknown;
  readonly name?: unknown;
  readonly mimeType?: unknown;
  readonly size?: unknown;
  readonly sha256Checksum?: unknown;
  readonly appProperties?: unknown;
}

export interface GoogleDriveInteropStoreOptions {
  /** Must use chrome.identity with only drive.file; no backup token fallback. */
  readonly accessToken: () => Promise<string>;
  readonly invalidateToken?: (token: string) => Promise<void>;
  readonly fetchImpl?: typeof fetch;
}

function bytesValue(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function idOf(file: DriveFile): string | null {
  return typeof file.id === 'string' && file.id !== '' ? file.id : null;
}

function driveFailure(status: number, reason: string | null): InteropTransportError {
  if (status === 401 || (status === 403 && reason !== 'storageQuotaExceeded' && reason !== 'quotaExceeded'))
    return new InteropTransportError('Google Drive interoperability authorization expired.', 'auth-expired', false);
  if (status === 403) return new InteropTransportError('Google Drive interoperability quota is exhausted.', 'quota', false);
  if (status === 404) return new InteropTransportError('Google Drive interoperability object was not found.', 'not-found', false);
  if (status === 400) return new InteropTransportError('Google Drive rejected corrupt interoperability metadata.', 'corrupt', false);
  return new InteropTransportError('Google Drive interoperability provider is unavailable.', 'provider-unavailable', true);
}

export class GoogleDriveInteropObjectStore implements InteropObjectStore {
  readonly provider = 'google-drive' as const;
  private readonly fetchImpl: typeof fetch;
  private rootId: string | null = null;

  constructor(private readonly options: GoogleDriveInteropStoreOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  authState(): Promise<'connected'> {
    return Promise.resolve('connected');
  }

  async put(pathInput: string, bytes: Uint8Array): Promise<{ readonly bytes: number }> {
    const path = assertSafeInteropPath(pathInput);
    const existing = await this.resolve(path);
    const rootId = await this.resolveRoot(true);
    if (rootId === null)
      throw new InteropTransportError('Google Drive interoperability root is unavailable.', 'provider-unavailable', true);
    const metadata = {
      name: await sha256(new TextEncoder().encode(path)),
      mimeType: 'application/octet-stream',
      appProperties: { imageTrailInteropOwner: OWNER, imageTrailInteropPath: path },
      ...(existing === null ? { parents: [rootId] } : {}),
    };
    const endpoint =
      existing === null
        ? `${UPLOAD_API}/files?uploadType=resumable&fields=id,size,sha256Checksum,appProperties`
        : `${UPLOAD_API}/files/${encodeURIComponent(existing.id)}?uploadType=resumable&fields=id,size,sha256Checksum,appProperties`;
    const started = await this.authorized(endpoint, {
      method: existing === null ? 'POST' : 'PATCH',
      headers: {
        'content-type': 'application/json; charset=UTF-8',
        'x-upload-content-type': 'application/octet-stream',
        'x-upload-content-length': String(bytes.byteLength),
      },
      body: JSON.stringify(metadata),
    });
    if (!started.ok) throw await this.responseError(started);
    const location = started.headers.get('location');
    if (location === null || new URL(location).hostname !== 'www.googleapis.com')
      throw new InteropTransportError('Google Drive returned an unsafe resumable location.', 'corrupt', false);
    const uploaded = await this.uploadResumable(location, bytes);
    const file = (await uploaded.json()) as DriveFile;
    const stored = bytesValue(file.size);
    if (stored === null) throw new InteropTransportError('Google Drive returned incomplete upload metadata.', 'partial-failure', true);
    return { bytes: stored };
  }

  async get(pathInput: string): Promise<Uint8Array> {
    const file = await this.resolve(assertSafeInteropPath(pathInput));
    if (file === null) throw driveFailure(404, null);
    const response = await this.authorized(`${API}/files/${encodeURIComponent(file.id)}?alt=media`);
    if (!response.ok) throw await this.responseError(response);
    return new Uint8Array(await response.arrayBuffer());
  }

  async list(prefixInput: string, cursor: string | null): Promise<InteropObjectPage> {
    const prefix = assertSafeInteropPath(prefixInput);
    const rootId = await this.resolveRoot(false);
    if (rootId === null) return { entries: [], nextCursor: null };
    const url = new URL(`${API}/files`);
    url.searchParams.set('q', `'${rootId.replaceAll("'", "\\'")}' in parents and trashed = false`);
    url.searchParams.set('spaces', 'drive');
    url.searchParams.set('pageSize', '1000');
    url.searchParams.set('fields', 'nextPageToken,files(id,size,appProperties)');
    if (cursor !== null) url.searchParams.set('pageToken', cursor);
    const response = await this.authorized(url.toString());
    if (!response.ok) throw await this.responseError(response);
    const data = (await response.json()) as { files?: unknown; nextPageToken?: unknown };
    const entries = (Array.isArray(data.files) ? (data.files as DriveFile[]) : [])
      .flatMap((file) => {
        const properties =
          file.appProperties && typeof file.appProperties === 'object' ? (file.appProperties as Record<string, unknown>) : {};
        const path = typeof properties['imageTrailInteropPath'] === 'string' ? properties['imageTrailInteropPath'] : null;
        const bytes = bytesValue(file.size);
        return properties['imageTrailInteropOwner'] === OWNER && path?.startsWith(prefix) && bytes !== null ? [{ path, bytes }] : [];
      })
      .sort((left, right) => left.path.localeCompare(right.path));
    return { entries, nextCursor: typeof data.nextPageToken === 'string' && data.nextPageToken !== '' ? data.nextPageToken : null };
  }

  async delete(pathInput: string): Promise<void> {
    const file = await this.resolve(assertSafeInteropPath(pathInput));
    if (file === null) return;
    const response = await this.authorized(`${API}/files/${encodeURIComponent(file.id)}`, { method: 'DELETE' });
    if (!response.ok && response.status !== 404) throw await this.responseError(response);
  }

  async quota(): Promise<{ readonly usedBytes: number; readonly totalBytes: number | null }> {
    const response = await this.authorized(`${API}/about?fields=storageQuota(usage,limit)`);
    if (!response.ok) throw await this.responseError(response);
    const data = (await response.json()) as { storageQuota?: Record<string, unknown> };
    const usedBytes = bytesValue(data.storageQuota?.['usage']);
    if (usedBytes === null) throw new InteropTransportError('Google Drive quota response was incomplete.', 'provider-unavailable', true);
    return { usedBytes, totalBytes: bytesValue(data.storageQuota?.['limit']) };
  }

  async verify(pathInput: string): Promise<{ readonly sha256: string; readonly bytes: number }> {
    const file = await this.resolve(assertSafeInteropPath(pathInput), true);
    if (file === null) throw driveFailure(404, null);
    const bytes = bytesValue(file.metadata.size);
    const digest =
      typeof file.metadata.sha256Checksum === 'string' && /^[a-f0-9]{64}$/iu.test(file.metadata.sha256Checksum)
        ? file.metadata.sha256Checksum.toLowerCase()
        : null;
    if (bytes !== null && digest !== null) return { sha256: digest, bytes };
    const downloaded = await this.get(pathInput);
    return { sha256: await sha256(downloaded), bytes: downloaded.byteLength };
  }

  private async resolveRoot(create: boolean): Promise<string | null> {
    if (this.rootId !== null) return this.rootId;
    const query = `name = '${ROOT_NAME}' and mimeType = '${FOLDER_MIME}' and 'root' in parents and trashed = false and appProperties has { key='imageTrailInteropOwner' and value='${OWNER}' }`;
    const found = await this.queryOne(query);
    const foundId = found === null ? null : idOf(found);
    if (foundId !== null) {
      this.rootId = foundId;
      return foundId;
    }
    if (!create) return null;
    const response = await this.authorized(`${API}/files?fields=id`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: ROOT_NAME,
        mimeType: FOLDER_MIME,
        parents: ['root'],
        appProperties: { imageTrailInteropOwner: OWNER },
      }),
    });
    if (!response.ok) throw await this.responseError(response);
    const id = idOf((await response.json()) as DriveFile);
    if (id === null) throw new InteropTransportError('Google Drive returned no interoperability root id.', 'provider-unavailable', true);
    this.rootId = id;
    return id;
  }

  private async resolve(path: string, refresh = false): Promise<{ id: string; metadata: DriveFile } | null> {
    const rootId = await this.resolveRoot(false);
    if (rootId === null) return null;
    const escapedPath = path.replaceAll('\\', '\\\\').replaceAll("'", "\\'");
    const found = await this.queryOne(
      `'${rootId.replaceAll("'", "\\'")}' in parents and trashed = false and appProperties has { key='imageTrailInteropOwner' and value='${OWNER}' } and appProperties has { key='imageTrailInteropPath' and value='${escapedPath}' }`,
    );
    if (found === null) return null;
    const id = idOf(found);
    if (id === null) return null;
    if (!refresh) return { id, metadata: found };
    const response = await this.authorized(`${API}/files/${encodeURIComponent(id)}?fields=id,size,sha256Checksum,appProperties`);
    if (!response.ok) throw await this.responseError(response);
    return { id, metadata: (await response.json()) as DriveFile };
  }

  private async queryOne(query: string): Promise<DriveFile | null> {
    const url = new URL(`${API}/files`);
    url.searchParams.set('q', query);
    url.searchParams.set('spaces', 'drive');
    url.searchParams.set('pageSize', '2');
    url.searchParams.set('fields', 'files(id,name,mimeType,size,sha256Checksum,appProperties)');
    const response = await this.authorized(url.toString());
    if (!response.ok) throw await this.responseError(response);
    const files = ((await response.json()) as { files?: unknown }).files;
    return Array.isArray(files)
      ? ((files as DriveFile[]).sort((left, right) => String(left.id).localeCompare(String(right.id)))[0] ?? null)
      : null;
  }

  private async authorized(url: string, init: RequestInit = {}, retried = false): Promise<Response> {
    const token = await this.options.accessToken();
    let response: Response;
    try {
      response = await this.fetchImpl(url, { ...init, headers: { ...init.headers, authorization: `Bearer ${token}` } });
    } catch {
      throw new InteropTransportError('Google Drive interoperability is offline.', 'offline', true);
    }
    if (response.status === 401 && !retried && this.options.invalidateToken !== undefined) {
      await this.options.invalidateToken(token);
      return this.authorized(url, init, true);
    }
    return response;
  }

  private async uploadResumable(location: string, bytes: Uint8Array): Promise<Response> {
    let offset = 0;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const remaining = bytes.subarray(offset);
      const response = await this.authorized(location, {
        method: 'PUT',
        headers: {
          'content-length': String(remaining.byteLength),
          'content-range':
            bytes.byteLength === 0 ? 'bytes */0' : `bytes ${String(offset)}-${String(bytes.byteLength - 1)}/${String(bytes.byteLength)}`,
        },
        body: remaining.buffer.slice(remaining.byteOffset, remaining.byteOffset + remaining.byteLength) as ArrayBuffer,
      });
      if (response.ok) return response;
      if (response.status !== 308) throw await this.responseError(response);
      const range = response.headers.get('range')?.match(/^bytes=0-(\d+)$/u);
      const nextOffset = range?.[1] === undefined ? 0 : Number(range[1]) + 1;
      if (!Number.isSafeInteger(nextOffset) || nextOffset <= offset || nextOffset >= bytes.byteLength)
        throw new InteropTransportError('Google Drive returned an invalid resumable upload range.', 'partial-failure', true);
      offset = nextOffset;
    }
    throw new InteropTransportError('Google Drive did not complete the resumable upload.', 'partial-failure', true);
  }

  private async responseError(response: Response): Promise<InteropTransportError> {
    let reason: string | null = null;
    try {
      const data = (await response.clone().json()) as { error?: { errors?: Array<{ reason?: unknown }> } };
      const value = data.error?.errors?.[0]?.reason;
      reason = typeof value === 'string' ? value : null;
    } catch {
      // Provider response bodies are untrusted; status still maps deterministically.
    }
    return driveFailure(response.status, reason);
  }
}

export function createChromeIdentityInteropDriveStore(interactive = false): GoogleDriveInteropObjectStore {
  const auth = new ChromeIdentityInteropDriveAuth();
  return new GoogleDriveInteropObjectStore({
    accessToken: () => auth.accessToken(interactive),
    invalidateToken: (token) => auth.invalidateToken(token),
  });
}
