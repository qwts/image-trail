import * as v from 'valibot';
import {
  migrateLegacyWorkspaceLayout,
  type LegacyStoredWorkspaceLayout,
  type StoredWorkspaceLayout,
  type WorkspaceLayoutScope,
} from '../../core/workspace-layout.js';
import { legacyWorkspaceLayoutSchema, workspaceLayoutSchema } from '../../core/workspace-layout.schema.js';
import {
  createWorkspaceLayoutInstallSecret,
  decodeWorkspaceLayoutInstallSecret,
  deriveWorkspaceLayoutKey,
  encodeWorkspaceLayoutInstallSecret,
} from '../../core/workspace-layout-key.js';
import { requestToPromise, transactionDone } from '../idb-helpers.js';
import { DataStore } from '../schema.js';
import { hydrateRecord } from './hydration.js';

interface WorkspaceLayoutRecord {
  readonly key: string;
  readonly kind: 'workspaceLayoutV2';
  readonly schemaVersion: StoredWorkspaceLayout['schemaVersion'];
  readonly persistenceKeyVersion: StoredWorkspaceLayout['persistenceKeyVersion'];
  readonly panelPosition: StoredWorkspaceLayout['panelPosition'];
  readonly sections: StoredWorkspaceLayout['sections'];
  readonly updatedAt: string;
}

interface LegacyWorkspaceLayoutRecord extends LegacyStoredWorkspaceLayout {
  readonly key: string;
  readonly kind: 'workspaceLayout';
  readonly hostname: string;
  readonly updatedAt: string;
}

interface WorkspaceLayoutSecretRecord {
  readonly key: typeof WORKSPACE_LAYOUT_SECRET_KEY;
  readonly kind: 'workspaceLayoutSecret';
  readonly encodedSecret: string;
  readonly createdAt: string;
}

const workspaceLayoutRecordSchema = v.object({
  ...workspaceLayoutSchema.entries,
  key: v.string(),
  kind: v.literal('workspaceLayoutV2'),
  updatedAt: v.string(),
}) as v.GenericSchema<unknown, WorkspaceLayoutRecord>;

const legacyWorkspaceLayoutRecordSchema = v.object({
  ...legacyWorkspaceLayoutSchema.entries,
  key: v.string(),
  kind: v.literal('workspaceLayout'),
  hostname: v.string(),
  updatedAt: v.string(),
}) as v.GenericSchema<unknown, LegacyWorkspaceLayoutRecord>;

const workspaceLayoutSecretRecordSchema = v.object({
  key: v.literal('workspace-layout-install-secret'),
  kind: v.literal('workspaceLayoutSecret'),
  encodedSecret: v.string(),
  createdAt: v.string(),
}) as v.GenericSchema<unknown, WorkspaceLayoutSecretRecord>;

const LEGACY_WORKSPACE_LAYOUT_KEY_PREFIX = 'workspace-layout:';
const WORKSPACE_LAYOUT_SECRET_KEY = 'workspace-layout-install-secret' as const;

export class WorkspaceLayoutRepository {
  constructor(private readonly db: IDBDatabase) {}

  async get(scope: WorkspaceLayoutScope): Promise<StoredWorkspaceLayout | null> {
    const key = await this.derivedKey(scope.pageUrl);
    const current = await this.getCurrent(key);
    return current ?? this.migrateLegacy(scope, key);
  }

  async put(scope: WorkspaceLayoutScope, layout: StoredWorkspaceLayout): Promise<void> {
    const key = await this.derivedKey(scope.pageUrl);
    const transaction = this.db.transaction(DataStore.Metadata, 'readwrite');
    transaction.objectStore(DataStore.Metadata).put(workspaceLayoutRecord(key, layout));
    await transactionDone(transaction);
  }

  async delete(scope: WorkspaceLayoutScope): Promise<void> {
    const key = await this.derivedKey(scope.pageUrl);
    const transaction = this.db.transaction(DataStore.Metadata, 'readwrite');
    const store = transaction.objectStore(DataStore.Metadata);
    store.delete(key);
    store.delete(legacyWorkspaceLayoutKey(scope.hostname));
    await transactionDone(transaction);
  }

  private async getCurrent(key: string): Promise<StoredWorkspaceLayout | null> {
    const transaction = this.db.transaction(DataStore.Metadata, 'readonly');
    const raw = await requestToPromise<unknown>(transaction.objectStore(DataStore.Metadata).get(key));
    await transactionDone(transaction);
    const record = hydrateRecord(DataStore.Metadata, workspaceLayoutRecordSchema, raw);
    return record ? workspaceLayoutFromRecord(record) : null;
  }

  private async migrateLegacy(scope: WorkspaceLayoutScope, key: string): Promise<StoredWorkspaceLayout | null> {
    const transaction = this.db.transaction(DataStore.Metadata, 'readwrite');
    const store = transaction.objectStore(DataStore.Metadata);
    const legacyKey = legacyWorkspaceLayoutKey(scope.hostname);
    const raw = await requestToPromise<unknown>(store.get(legacyKey));
    const record = hydrateRecord(DataStore.Metadata, legacyWorkspaceLayoutRecordSchema, raw);
    if (!record) {
      await transactionDone(transaction);
      return null;
    }
    const layout = migrateLegacyWorkspaceLayout(record);
    store.put(workspaceLayoutRecord(key, layout));
    store.delete(legacyKey);
    await transactionDone(transaction);
    return layout;
  }

  private async derivedKey(pageUrl: string): Promise<string> {
    return deriveWorkspaceLayoutKey(pageUrl, await this.installSecret());
  }

  private async installSecret(): Promise<Uint8Array> {
    const transaction = this.db.transaction(DataStore.Metadata, 'readwrite');
    const store = transaction.objectStore(DataStore.Metadata);
    const raw = await requestToPromise<unknown>(store.get(WORKSPACE_LAYOUT_SECRET_KEY));
    const record = hydrateRecord(DataStore.Metadata, workspaceLayoutSecretRecordSchema, raw);
    const existing = record ? decodeWorkspaceLayoutInstallSecret(record.encodedSecret) : null;
    if (existing) {
      await transactionDone(transaction);
      return existing;
    }
    const secret = createWorkspaceLayoutInstallSecret();
    const created: WorkspaceLayoutSecretRecord = {
      key: WORKSPACE_LAYOUT_SECRET_KEY,
      kind: 'workspaceLayoutSecret',
      encodedSecret: encodeWorkspaceLayoutInstallSecret(secret),
      createdAt: new Date().toISOString(),
    };
    store.put(created);
    await transactionDone(transaction);
    return secret;
  }
}

function workspaceLayoutRecord(key: string, layout: StoredWorkspaceLayout): WorkspaceLayoutRecord {
  return {
    key,
    kind: 'workspaceLayoutV2',
    schemaVersion: layout.schemaVersion,
    persistenceKeyVersion: layout.persistenceKeyVersion,
    panelPosition: layout.panelPosition,
    sections: layout.sections,
    updatedAt: new Date().toISOString(),
  };
}

function workspaceLayoutFromRecord(record: WorkspaceLayoutRecord): StoredWorkspaceLayout {
  return {
    schemaVersion: record.schemaVersion,
    persistenceKeyVersion: record.persistenceKeyVersion,
    panelPosition: record.panelPosition,
    sections: record.sections,
  };
}

function legacyWorkspaceLayoutKey(hostname: string): string {
  return `${LEGACY_WORKSPACE_LAYOUT_KEY_PREFIX}${hostname.toLowerCase()}`;
}
