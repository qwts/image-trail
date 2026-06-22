import type { PanelPosition } from '../../core/types.js';
import { requestToPromise, transactionDone } from '../idb-helpers.js';
import { DataStore } from '../schema.js';

export interface PanelPositionRecord extends PanelPosition {
  readonly key: string;
  readonly kind: 'panelPosition';
  readonly hostname: string;
  readonly updatedAt: string;
}

const PANEL_POSITION_KEY_PREFIX = 'panel-position:';

export class PanelPositionRepository {
  constructor(private readonly db: IDBDatabase) {}

  async get(hostname: string): Promise<PanelPosition | null> {
    const transaction = this.db.transaction(DataStore.Metadata, 'readonly');
    const record = await requestToPromise<PanelPositionRecord | undefined>(
      transaction.objectStore(DataStore.Metadata).get(panelPositionKey(hostname)),
    );
    await transactionDone(transaction);
    return record ? { left: record.left, top: record.top } : null;
  }

  async put(hostname: string, position: PanelPosition): Promise<void> {
    const transaction = this.db.transaction(DataStore.Metadata, 'readwrite');
    const record: PanelPositionRecord = {
      key: panelPositionKey(hostname),
      kind: 'panelPosition',
      hostname,
      left: position.left,
      top: position.top,
      updatedAt: new Date().toISOString(),
    };
    transaction.objectStore(DataStore.Metadata).put(record);
    await transactionDone(transaction);
  }

  async delete(hostname: string): Promise<void> {
    const transaction = this.db.transaction(DataStore.Metadata, 'readwrite');
    transaction.objectStore(DataStore.Metadata).delete(panelPositionKey(hostname));
    await transactionDone(transaction);
  }
}

function panelPositionKey(hostname: string): string {
  return `${PANEL_POSITION_KEY_PREFIX}${hostname.toLowerCase()}`;
}
