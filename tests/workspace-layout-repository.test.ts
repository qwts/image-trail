import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';

import { floatingSection, type StoredWorkspaceLayout, type WorkspaceLayoutScope } from '../extension/src/core/workspace-layout.js';
import { WorkspaceLayoutRepository } from '../extension/src/data/repositories/workspace-layout-repository.js';
import { DataStore } from '../extension/src/data/schema.js';
import { openFreshImageTrailDb, requestToPromise, transactionDone } from './indexeddb-test-helpers.js';

const privateScope: WorkspaceLayoutScope = {
  hostname: 'private.example.test',
  pageUrl: 'https://private.example.test/gallery/2026/07/img-0042.jpg?token=private-one&size=large#secret',
};

test('repository stores only an opaque derived key and restores matching URL structure', async (t) => {
  const db = await openFreshImageTrailDb();
  t.after(() => db.close());
  const repository = new WorkspaceLayoutRepository(db);
  const expected = workspaceLayout();
  await repository.put(privateScope, expected);

  const records = await metadataRecords(db);
  const workspaceRecord = records.find((record) => record['kind'] === 'workspaceLayoutV2');
  assert.match(String(workspaceRecord?.['key']), /^workspace-layout:v2:[A-Za-z0-9_-]{43}$/u);
  assert.doesNotMatch(JSON.stringify(workspaceRecord), /private|example|gallery|token|secret|img-0042/iu);

  const sameStructure = {
    hostname: privateScope.hostname,
    pageUrl: 'https://private.example.test/gallery/2027/08/img-9999.jpg?size=small&token=private-two',
  };
  assert.deepEqual(await repository.get(sameStructure), expected);
  assert.equal(
    await repository.get({ hostname: 'other.example.test', pageUrl: 'https://other.example.test/gallery/2027/08/img-9999.jpg' }),
    null,
  );
});

test('legacy hostname layout migrates atomically to v2 and removes the private legacy record', async (t) => {
  const db = await openFreshImageTrailDb();
  t.after(() => db.close());
  const repository = new WorkspaceLayoutRepository(db);
  await putMetadata(db, {
    key: `workspace-layout:${privateScope.hostname}`,
    kind: 'workspaceLayout',
    hostname: privateScope.hostname,
    updatedAt: '2026-07-14T00:00:00.000Z',
    sections: [{ sectionId: 'history', position: { left: 14, top: 28 }, minimized: true }],
  });

  const migrated = await repository.get(privateScope);
  assert.equal(migrated?.schemaVersion, 2);
  assert.deepEqual(migrated?.sections[0], floatingSection('history', { left: 14, top: 28, width: 340, height: 160 }, { shaded: true }));

  const records = await metadataRecords(db);
  assert.equal(
    records.some((record) => record['kind'] === 'workspaceLayout'),
    false,
  );
  assert.equal(
    records.some((record) => record['kind'] === 'workspaceLayoutV2'),
    true,
  );
});

test('reset removes current and leftover legacy records without deleting the install secret', async (t) => {
  const db = await openFreshImageTrailDb();
  t.after(() => db.close());
  const repository = new WorkspaceLayoutRepository(db);
  await repository.put(privateScope, workspaceLayout());
  await putMetadata(db, {
    key: `workspace-layout:${privateScope.hostname}`,
    kind: 'workspaceLayout',
    hostname: privateScope.hostname,
    updatedAt: '2026-07-14T00:00:00.000Z',
    sections: [],
  });

  await repository.delete(privateScope);
  const records = await metadataRecords(db);
  assert.equal(
    records.some((record) => String(record['kind']).startsWith('workspaceLayoutV')),
    false,
  );
  assert.equal(
    records.some((record) => record['kind'] === 'workspaceLayout'),
    false,
  );
  assert.equal(
    records.some((record) => record['kind'] === 'workspaceLayoutSecret'),
    true,
  );
});

function workspaceLayout(): StoredWorkspaceLayout {
  return {
    schemaVersion: 2,
    persistenceKeyVersion: 1,
    panelPosition: { left: 12, top: 18 },
    sections: [floatingSection('history', { left: 32, top: 48, width: 340, height: 320 })],
  };
}

async function metadataRecords(db: IDBDatabase): Promise<Record<string, unknown>[]> {
  const transaction = db.transaction(DataStore.Metadata, 'readonly');
  const result = await requestToPromise(transaction.objectStore(DataStore.Metadata).getAll());
  await transactionDone(transaction);
  return result as Record<string, unknown>[];
}

async function putMetadata(db: IDBDatabase, record: Record<string, unknown>): Promise<void> {
  const transaction = db.transaction(DataStore.Metadata, 'readwrite');
  transaction.objectStore(DataStore.Metadata).put(record);
  await transactionDone(transaction);
}
