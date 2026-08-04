import {
  InteropTransportError,
  assertSafeInteropPath,
  sha256,
  type InteropObjectPage,
  type InteropObjectStore,
} from '../core/interop/transport.js';
import { PCLOUD_DOWNLOAD_REFERRER, installPCloudRequestHeaderRule } from './pcloud-provider.js';

// Shared mount point with Overlook: the canonical side scans
// `/Overlook Interop/v1/pairings/<pairingId>/transfers/...`, so moves must be
// published under the same root or discovery finds nothing.
const ROOT = '/Overlook Interop/v1';

export interface InteropPCloudCredential {
  readonly accessToken: string;
  readonly apiHost: 'api.pcloud.com' | 'eapi.pcloud.com';
}

export interface PCloudInteropStoreOptions {
  readonly credential: () => InteropPCloudCredential | null;
  readonly fetchImpl?: typeof fetch;
}

function numberValue(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function resultError(result: number): InteropTransportError {
  if ([1000, 2000, 2003, 2094, 2095, 4000].includes(result))
    return new InteropTransportError('pCloud interoperability authorization expired.', 'auth-expired', false);
  if (result === 2008) return new InteropTransportError('pCloud interoperability quota is exhausted.', 'quota', false);
  if ([2002, 2005, 2009].includes(result))
    return new InteropTransportError('pCloud interoperability object was not found.', 'not-found', false);
  return new InteropTransportError('pCloud interoperability request failed.', 'provider-unavailable', true);
}

export class PCloudInteropObjectStore implements InteropObjectStore {
  readonly provider = 'pcloud' as const;
  private readonly fetchImpl: typeof fetch;
  private readonly folders = new Set<string>();

  constructor(private readonly options: PCloudInteropStoreOptions) {
    // Bind the global: assigning bare `fetch` to a property and invoking it as a
    // method makes Chromium throw "Illegal invocation" (receiver is the store).
    this.fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
  }

  authState(): Promise<'connected' | 'not-connected'> {
    return Promise.resolve(this.options.credential() === null ? 'not-connected' : 'connected');
  }

  async put(pathInput: string, bytes: Uint8Array): Promise<{ readonly bytes: number }> {
    const path = this.remote(pathInput);
    const folder = path.slice(0, path.lastIndexOf('/'));
    const filename = path.slice(path.lastIndexOf('/') + 1);
    await this.ensureFolder(folder);
    const form = new FormData();
    form.set('path', folder);
    form.set('filename', filename);
    form.set('nopartial', '1');
    const payload = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    form.set('file', new Blob([payload]), filename);
    const data = await this.request('uploadfile', form);
    const metadata = Array.isArray(data['metadata']) ? record(data['metadata'][0]) : record(data['metadata']);
    const stored = numberValue(metadata?.['size']);
    if (stored === null) throw new InteropTransportError('pCloud returned incomplete upload metadata.', 'partial-failure', true);
    return { bytes: stored };
  }

  async get(pathInput: string): Promise<Uint8Array> {
    const data = await this.apiWithReferer('getfilelink', { path: this.remote(pathInput), forcedownload: '1' });
    const hosts = Array.isArray(data['hosts']) ? data['hosts'] : [];
    const host = typeof hosts[0] === 'string' ? hosts[0].toLowerCase() : '';
    const path = typeof data['path'] === 'string' ? data['path'] : '';
    const origin = `https://${host}`;
    let downloadUrl: URL;
    try {
      downloadUrl = new URL(path, origin);
    } catch {
      throw new InteropTransportError('pCloud returned an unsafe download location.', 'corrupt', false);
    }
    if ((host !== 'pcloud.com' && !host.endsWith('.pcloud.com')) || !path.startsWith('/') || downloadUrl.origin !== origin)
      throw new InteropTransportError('pCloud returned an unsafe download location.', 'corrupt', false);
    const removeRule = await installPCloudRequestHeaderRule(downloadUrl.toString());
    let response: Response;
    try {
      response = await this.fetchImpl(downloadUrl, { referrer: PCLOUD_DOWNLOAD_REFERRER, referrerPolicy: 'origin' });
    } catch {
      throw new InteropTransportError('pCloud interoperability download is offline.', 'offline', true);
    } finally {
      await removeRule();
    }
    if (response.status === 404) throw resultError(2009);
    if (!response.ok) throw new InteropTransportError('pCloud interoperability download failed.', 'provider-unavailable', true);
    return new Uint8Array(await response.arrayBuffer());
  }

  async list(prefixInput: string, cursor: string | null): Promise<InteropObjectPage> {
    const prefix = assertSafeInteropPath(prefixInput);
    let data: Record<string, unknown>;
    try {
      data = await this.api('listfolder', { path: this.remote(prefix), recursive: '1' });
    } catch (error) {
      if (error instanceof InteropTransportError && error.code === 'not-found') return { entries: [], nextCursor: null };
      throw error;
    }
    const entries: Array<{ path: string; bytes: number }> = [];
    const walk = (nodes: unknown, parent: string): void => {
      if (!Array.isArray(nodes)) return;
      for (const value of nodes) {
        const item = record(value);
        const name = typeof item?.['name'] === 'string' && !item['name'].includes('/') ? item['name'] : null;
        if (name === null) continue;
        const path = `${parent}/${name}`;
        if (item?.['isfolder'] === true) walk(item['contents'], path);
        else {
          const bytes = numberValue(item?.['size']);
          if (bytes !== null) entries.push({ path, bytes });
        }
      }
    };
    walk(record(data['metadata'])?.['contents'], prefix);
    entries.sort((left, right) => left.path.localeCompare(right.path));
    const offset = cursor === null ? 0 : Number(cursor);
    if (!Number.isSafeInteger(offset) || offset < 0) throw new InteropTransportError('Invalid pCloud list cursor.', 'corrupt', false);
    const page = entries.slice(offset, offset + 100);
    return { entries: page, nextCursor: offset + page.length < entries.length ? String(offset + page.length) : null };
  }

  async delete(pathInput: string): Promise<void> {
    try {
      await this.api('deletefile', { path: this.remote(pathInput) });
    } catch (error) {
      if (!(error instanceof InteropTransportError && error.code === 'not-found')) throw error;
    }
  }

  async quota(): Promise<{ readonly usedBytes: number; readonly totalBytes: number | null }> {
    const data = await this.api('userinfo');
    const usedBytes = numberValue(data['usedquota']);
    if (usedBytes === null) throw new InteropTransportError('pCloud quota response was incomplete.', 'provider-unavailable', true);
    return { usedBytes, totalBytes: numberValue(data['quota']) };
  }

  async verify(pathInput: string): Promise<{ readonly sha256: string; readonly bytes: number }> {
    const data = await this.api('checksumfile', { path: this.remote(pathInput) });
    const metadata = record(data['metadata']);
    const bytes = numberValue(metadata?.['size']);
    const digest = typeof data['sha256'] === 'string' && /^[a-f0-9]{64}$/iu.test(data['sha256']) ? data['sha256'].toLowerCase() : null;
    if (bytes !== null && digest !== null) return { sha256: digest, bytes };
    const downloaded = await this.get(pathInput);
    return { sha256: await sha256(downloaded), bytes: downloaded.byteLength };
  }

  private remote(pathInput: string): string {
    return `${ROOT}/${assertSafeInteropPath(pathInput)}`;
  }

  private credential(): InteropPCloudCredential {
    const credential = this.options.credential();
    if (credential === null) throw new InteropTransportError('pCloud interoperability is not connected.', 'auth-expired', false);
    return credential;
  }

  private async ensureFolder(folder: string): Promise<void> {
    let current = '';
    for (const segment of folder.split('/').filter(Boolean)) {
      current += `/${segment}`;
      if (this.folders.has(current)) continue;
      await this.api('createfolderifnotexists', { path: current });
      this.folders.add(current);
    }
  }

  private api(method: string, params: Record<string, string> = {}): Promise<Record<string, unknown>> {
    return this.request(method, new URLSearchParams(params));
  }

  /** pCloud rejects some endpoints without a pCloud Referer/Origin; force them via a scoped DNR rule. */
  private async apiWithReferer(method: string, params: Record<string, string> = {}): Promise<Record<string, unknown>> {
    const credential = this.credential();
    const removeRule = await installPCloudRequestHeaderRule(`https://${credential.apiHost}/${method}`);
    try {
      return await this.request(method, new URLSearchParams(params));
    } finally {
      await removeRule();
    }
  }

  private async request(method: string, body: FormData | URLSearchParams): Promise<Record<string, unknown>> {
    const credential = this.credential();
    body.set('access_token', credential.accessToken);
    // Mirror the proven backup-flow request shape: pCloud's API is strict about
    // referrer and browser-like headers for URL-encoded calls.
    const urlEncodedInit: RequestInit =
      body instanceof URLSearchParams
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
    let response: Response;
    try {
      response = await this.fetchImpl(`https://${credential.apiHost}/${method}`, { method: 'POST', ...urlEncodedInit, body });
    } catch {
      throw new InteropTransportError('pCloud interoperability is offline.', 'offline', true);
    }
    if (!response.ok) throw new InteropTransportError('pCloud interoperability provider is unavailable.', 'provider-unavailable', true);
    const data = (await response.json()) as Record<string, unknown>;
    const result = numberValue(data['result']);
    if (result === null || result !== 0) throw resultError(result ?? -1);
    return data;
  }
}
