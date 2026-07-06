import * as v from 'valibot';
import type { StoredWorkspaceLayout } from '../../core/workspace-layout.js';
import { workspaceLayoutSchema } from '../../core/workspace-layout.schema.js';
import { requestToPromise, transactionDone } from '../idb-helpers.js';
import { DataStore } from '../schema.js';
import { hydrateRecord } from './hydration.js';

export interface WorkspaceLayoutRecord {
  readonly key: string;
  readonly kind: 'workspaceLayout';
  readonly hostname: string;
  readonly sections: StoredWorkspaceLayout['sections'];
  readonly updatedAt: string;
}

const workspaceLayoutRecordSchema = v.object({
  ...workspaceLayoutSchema.entries,
  key: v.string(),
  kind: v.literal('workspaceLayout'),
  hostname: v.string(),
  updatedAt: v.string(),
}) as v.GenericSchema<unknown, WorkspaceLayoutRecord>;

const WORKSPACE_LAYOUT_KEY_PREFIX = 'workspace-layout:';

export class WorkspaceLayoutRepository {
  constructor(private readonly db: IDBDatabase) {}

  async get(hostname: string): Promise<StoredWorkspaceLayout | null> {
    const transaction = this.db.transaction(DataStore.Metadata, 'readonly');
    const raw = await requestToPromise<unknown>(transaction.objectStore(DataStore.Metadata).get(workspaceLayoutKey(hostname)));
    await transactionDone(transaction);
    const record = hydrateRecord(DataStore.Metadata, workspaceLayoutRecordSchema, raw);
    return record ? { sections: record.sections } : null;
  }

  async put(hostname: string, layout: StoredWorkspaceLayout): Promise<void> {
    const transaction = this.db.transaction(DataStore.Metadata, 'readwrite');
    const record: WorkspaceLayoutRecord = {
      key: workspaceLayoutKey(hostname),
      kind: 'workspaceLayout',
      hostname,
      sections: layout.sections,
      updatedAt: new Date().toISOString(),
    };
    transaction.objectStore(DataStore.Metadata).put(record);
    await transactionDone(transaction);
  }

  async delete(hostname: string): Promise<void> {
    const transaction = this.db.transaction(DataStore.Metadata, 'readwrite');
    transaction.objectStore(DataStore.Metadata).delete(workspaceLayoutKey(hostname));
    await transactionDone(transaction);
  }
}

function workspaceLayoutKey(hostname: string): string {
  return `${WORKSPACE_LAYOUT_KEY_PREFIX}${hostname.toLowerCase()}`;
}
