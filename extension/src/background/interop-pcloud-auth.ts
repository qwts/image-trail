import { parsePCloudOAuthRedirect } from '../core/cloud/pcloud-provider.js';
import type { InteropObjectStore } from '../core/interop/transport.js';
import {
  createChromePCloudInteropConnectionStore,
  type PCloudInteropConnectionStore,
  type PCloudInteropConnectionRecord,
} from './interop-pcloud-connection-store.js';
import { PCloudInteropObjectStore } from './interop-pcloud-store.js';

const PCLOUD_INTEROP_CLIENT_ID = '83ag1CIbJd7';
const PCLOUD_AUTHORIZE_URL = 'https://my.pcloud.com/oauth2/authorize';

export interface PCloudInteropAuthOptions {
  readonly store: PCloudInteropConnectionStore;
  readonly redirectUrl: string;
  readonly launchAuthFlow: (url: string) => Promise<string>;
  readonly fetchImpl?: typeof fetch | undefined;
  readonly now?: (() => string) | undefined;
  readonly createState?: (() => string) | undefined;
}

export class PCloudInteropAuth {
  readonly #now: () => string;
  readonly #createState: () => string;

  constructor(private readonly options: PCloudInteropAuthOptions) {
    this.#now = options.now ?? (() => new Date().toISOString());
    this.#createState = options.createState ?? (() => crypto.randomUUID());
  }

  async probe(interactive: boolean): Promise<boolean> {
    if (interactive) {
      await this.connect();
      return true;
    }
    const record = await this.options.store.load();
    if (!record) return false;
    await this.provider(record).quota();
    return true;
  }

  async connect(): Promise<void> {
    const state = this.#createState();
    const url = new URL(PCLOUD_AUTHORIZE_URL);
    url.searchParams.set('client_id', PCLOUD_INTEROP_CLIENT_ID);
    url.searchParams.set('response_type', 'token');
    url.searchParams.set('redirect_uri', this.options.redirectUrl);
    url.searchParams.set('state', state);
    const redirect = await this.options.launchAuthFlow(url.toString());
    const authorized = parsePCloudOAuthRedirect(redirect, state, 'api.pcloud.com');
    const record: PCloudInteropConnectionRecord = {
      schemaVersion: 1,
      provider: 'pcloud-interop',
      accessToken: authorized.accessToken,
      apiHost: authorized.apiHost,
      connectedAt: this.#now(),
    };
    await this.provider(record).quota();
    await this.options.store.save(record);
  }

  disconnect(): Promise<void> {
    return this.options.store.clear();
  }

  async openProvider(): Promise<InteropObjectStore | null> {
    const record = await this.options.store.load();
    return record ? this.provider(record) : null;
  }

  private provider(record: PCloudInteropConnectionRecord): PCloudInteropObjectStore {
    return new PCloudInteropObjectStore({
      credential: () => record,
      ...(this.options.fetchImpl ? { fetchImpl: this.options.fetchImpl } : {}),
    });
  }
}

function launchChromePCloudInteropAuth(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    chrome.identity.launchWebAuthFlow({ url, interactive: true }, (redirectUrl) => {
      const error = chrome.runtime.lastError;
      if (error || !redirectUrl) {
        reject(new Error(error?.message || 'pCloud interoperability authorization was cancelled.'));
        return;
      }
      resolve(redirectUrl);
    });
  });
}

export function createChromePCloudInteropAuth(): PCloudInteropAuth {
  return new PCloudInteropAuth({
    store: createChromePCloudInteropConnectionStore(),
    redirectUrl: chrome.identity.getRedirectURL('pcloud-interop'),
    launchAuthFlow: launchChromePCloudInteropAuth,
  });
}
