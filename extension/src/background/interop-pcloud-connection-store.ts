import * as v from 'valibot';

import type { InteropPCloudCredential } from './interop-pcloud-store.js';
import { restrictStorageToTrustedContexts } from './trusted-storage.js';

export const PCLOUD_INTEROP_CONNECTION_KEY = 'imageTrail.interop.pcloudConnection';

const connectionSchema = v.strictObject({
  schemaVersion: v.literal(1),
  provider: v.literal('pcloud-interop'),
  accessToken: v.pipe(v.string(), v.minLength(1)),
  apiHost: v.picklist(['api.pcloud.com', 'eapi.pcloud.com']),
  connectedAt: v.pipe(v.string(), v.isoTimestamp()),
});

export interface PCloudInteropConnectionRecord extends InteropPCloudCredential {
  readonly schemaVersion: 1;
  readonly provider: 'pcloud-interop';
  readonly connectedAt: string;
}

export interface InteropConnectionStorage {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(key: string): Promise<void>;
}

export class PCloudInteropConnectionStore {
  constructor(
    private readonly storage: InteropConnectionStorage,
    private readonly restrict: () => Promise<void> = restrictStorageToTrustedContexts,
  ) {}

  async load(): Promise<PCloudInteropConnectionRecord | null> {
    await this.restrict();
    const values = await this.storage.get(PCLOUD_INTEROP_CONNECTION_KEY);
    const parsed = v.safeParse(connectionSchema, values[PCLOUD_INTEROP_CONNECTION_KEY]);
    return parsed.success ? parsed.output : null;
  }

  async save(record: PCloudInteropConnectionRecord): Promise<void> {
    await this.restrict();
    await this.storage.set({ [PCLOUD_INTEROP_CONNECTION_KEY]: v.parse(connectionSchema, record) });
  }

  async clear(): Promise<void> {
    await this.restrict();
    await this.storage.remove(PCLOUD_INTEROP_CONNECTION_KEY);
  }
}

export function createChromePCloudInteropConnectionStore(): PCloudInteropConnectionStore {
  return new PCloudInteropConnectionStore(chrome.storage.local);
}
