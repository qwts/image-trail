import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { lockBlobKey } from '../extension/src/data/crypto/blob-keyring.js';
import { createBlobKeyMessageRegistry } from '../extension/src/background/handlers/blob-key-handlers.js';
import type { MessageDef } from '../extension/src/background/message-dispatch.js';
import {
  MessageType,
  createBlobKeyStatusMessage,
  createClearBlobKeyMessage,
  createExportBlobKeyBackupMessage,
  createImportBlobKeyBackupMessage,
  createSetupBlobKeyMessage,
  createUnlockBlobKeyMessage,
  type BlobKeyResultMessage,
  type BlobKeyStatusResultMessage,
  type ExportBlobKeyBackupResultMessage,
  type ExtensionRequest,
  type ExtensionResponse,
  type ImportBlobKeyBackupResultMessage,
} from '../extension/src/background/messages.js';
import { openFreshImageTrailDb } from './indexeddb-test-helpers.js';

type AnyEntry = MessageDef<ExtensionRequest, ExtensionResponse>;
type Registry = ReturnType<typeof createBlobKeyMessageRegistry>;

/** Runs an entry the way dispatchRequest does — handle, then wrap with respond. */
async function handleAndRespond<Res extends ExtensionResponse>(entry: AnyEntry, message: ExtensionRequest): Promise<Res> {
  return entry.respond(await entry.handle(message)) as Res;
}

// The registry runs against fake-indexeddb and the real keyring, so these tests share one
// database and walk the setup → lock → unlock → export → clear → import lifecycle in order.
const password = 'correct horse battery staple';
let db: IDBDatabase;
let registry: Registry;
const noDbRegistry: Registry = createBlobKeyMessageRegistry({ getDb: async () => null });
let keyReference = '';
let backupFileContent = '';

before(async () => {
  lockBlobKey();
  db = await openFreshImageTrailDb();
  registry = createBlobKeyMessageRegistry({ getDb: async () => db });
});

after(() => {
  lockBlobKey();
  db.close();
});

test('status reports no key before setup, and degrades the same when the db is unavailable', async () => {
  const status = await handleAndRespond<BlobKeyStatusResultMessage>(registry[MessageType.BlobKeyStatus], createBlobKeyStatusMessage());
  assert.equal(status.type, MessageType.BlobKeyStatusResult);
  assert.deepEqual(status.payload, { unlocked: false, keyReference: null, hasKey: false });

  const noDb = await handleAndRespond<BlobKeyStatusResultMessage>(noDbRegistry[MessageType.BlobKeyStatus], createBlobKeyStatusMessage());
  assert.deepEqual(noDb.payload, { unlocked: false, keyReference: null, hasKey: false });
});

test('setup refuses a blank password and an unavailable database', async () => {
  const blank = await handleAndRespond<BlobKeyResultMessage>(registry[MessageType.SetupBlobKey], createSetupBlobKeyMessage('   '));
  assert.equal(blank.type, MessageType.BlobKeyResult);
  assert.equal(blank.payload.ok, false);
  assert.equal(blank.payload.ok === false && blank.payload.reason, 'empty-password');

  const noDb = await handleAndRespond<BlobKeyResultMessage>(noDbRegistry[MessageType.SetupBlobKey], createSetupBlobKeyMessage(password));
  assert.equal(noDb.payload.ok === false && noDb.payload.reason, 'db-unavailable');
});

test('unlock refuses a blank password and reports missing-key before any setup', async () => {
  const blank = await handleAndRespond<BlobKeyResultMessage>(registry[MessageType.UnlockBlobKey], createUnlockBlobKeyMessage(' '));
  assert.equal(blank.payload.ok === false && blank.payload.reason, 'empty-password');

  const missing = await handleAndRespond<BlobKeyResultMessage>(registry[MessageType.UnlockBlobKey], createUnlockBlobKeyMessage(password));
  assert.equal(missing.payload.ok === false && missing.payload.reason, 'missing-key');
});

test('setup activates a new wrapped key and status reports it unlocked', async () => {
  const setup = await handleAndRespond<BlobKeyResultMessage>(registry[MessageType.SetupBlobKey], createSetupBlobKeyMessage(password));
  assert.equal(setup.payload.ok, true);
  assert.ok(setup.payload.keyReference);
  keyReference = setup.payload.keyReference ?? '';

  const status = await handleAndRespond<BlobKeyStatusResultMessage>(registry[MessageType.BlobKeyStatus], createBlobKeyStatusMessage());
  assert.deepEqual(status.payload, { unlocked: true, keyReference, hasKey: true });
});

test('export refuses a blank password, then produces a backup file for the stored key', async () => {
  const blank = await handleAndRespond<ExportBlobKeyBackupResultMessage>(
    registry[MessageType.ExportBlobKeyBackup],
    createExportBlobKeyBackupMessage(''),
  );
  assert.equal(blank.type, MessageType.ExportBlobKeyBackupResult);
  assert.equal(blank.payload.ok === false && blank.payload.reason, 'empty-password');

  const exported = await handleAndRespond<ExportBlobKeyBackupResultMessage>(
    registry[MessageType.ExportBlobKeyBackup],
    createExportBlobKeyBackupMessage(password),
  );
  assert.equal(exported.payload.ok, true);
  assert.equal(exported.payload.keyReference, keyReference);
  assert.ok(exported.payload.ok && exported.payload.fileContent);
  assert.ok(exported.payload.ok && exported.payload.fileName);
  backupFileContent = (exported.payload.ok && exported.payload.fileContent) || '';
});

test('a locked key reports hasKey without a reference, and unlock reactivates it', async () => {
  lockBlobKey();
  const locked = await handleAndRespond<BlobKeyStatusResultMessage>(registry[MessageType.BlobKeyStatus], createBlobKeyStatusMessage());
  assert.deepEqual(locked.payload, {
    unlocked: false,
    keyReference: null,
    hasKey: true,
    reason: 'manual',
    message: 'Encrypted storage locked.',
  });

  const unlocked = await handleAndRespond<BlobKeyResultMessage>(registry[MessageType.UnlockBlobKey], createUnlockBlobKeyMessage(password));
  assert.equal(unlocked.payload.ok, true);
  assert.equal(unlocked.payload.keyReference, keyReference);
});

test('clear locks the keyring and removes every stored blob key', async () => {
  const noDb = await handleAndRespond<BlobKeyResultMessage>(noDbRegistry[MessageType.ClearBlobKey], createClearBlobKeyMessage());
  assert.equal(noDb.payload.ok === false && noDb.payload.reason, 'db-unavailable');

  const cleared = await handleAndRespond<BlobKeyResultMessage>(registry[MessageType.ClearBlobKey], createClearBlobKeyMessage());
  assert.equal(cleared.payload.ok, true);

  const status = await handleAndRespond<BlobKeyStatusResultMessage>(registry[MessageType.BlobKeyStatus], createBlobKeyStatusMessage());
  assert.deepEqual(status.payload, { unlocked: false, keyReference: null, hasKey: false });

  const exportMissing = await handleAndRespond<ExportBlobKeyBackupResultMessage>(
    registry[MessageType.ExportBlobKeyBackup],
    createExportBlobKeyBackupMessage(password),
  );
  assert.equal(exportMissing.payload.ok === false && exportMissing.payload.reason, 'missing-key');
});

test('import refuses blank passwords and unreadable files, then restores the exported backup once', async () => {
  const blank = await handleAndRespond<ImportBlobKeyBackupResultMessage>(
    registry[MessageType.ImportBlobKeyBackup],
    createImportBlobKeyBackupMessage(backupFileContent, ' '),
  );
  assert.equal(blank.type, MessageType.ImportBlobKeyBackupResult);
  assert.equal(blank.payload.ok === false && blank.payload.reason, 'empty-password');

  const garbage = await handleAndRespond<ImportBlobKeyBackupResultMessage>(
    registry[MessageType.ImportBlobKeyBackup],
    createImportBlobKeyBackupMessage('not a backup file', password),
  );
  assert.equal(garbage.payload.ok === false && garbage.payload.reason, 'decryption-failed');

  const imported = await handleAndRespond<ImportBlobKeyBackupResultMessage>(
    registry[MessageType.ImportBlobKeyBackup],
    createImportBlobKeyBackupMessage(backupFileContent, password),
  );
  assert.equal(imported.payload.ok, true);
  assert.equal(imported.payload.keyReference, keyReference);
  assert.equal(imported.payload.ok && imported.payload.imported, true);

  const again = await handleAndRespond<ImportBlobKeyBackupResultMessage>(
    registry[MessageType.ImportBlobKeyBackup],
    createImportBlobKeyBackupMessage(backupFileContent, password),
  );
  assert.equal(again.payload.ok, true);
  assert.equal(again.payload.ok && again.payload.imported, false);
});

test('fallbacks return the documented degraded payloads', () => {
  const status = registry[MessageType.BlobKeyStatus].fallback(createBlobKeyStatusMessage()) as BlobKeyStatusResultMessage;
  assert.deepEqual(status.payload, { unlocked: false, keyReference: null, hasKey: false });

  const setup = registry[MessageType.SetupBlobKey].fallback(createSetupBlobKeyMessage(password)) as BlobKeyResultMessage;
  assert.deepEqual(setup.payload, { ok: false, reason: 'unknown', message: 'Blob key setup failed.' });

  const unlock = registry[MessageType.UnlockBlobKey].fallback(createUnlockBlobKeyMessage(password)) as BlobKeyResultMessage;
  assert.deepEqual(unlock.payload, { ok: false, reason: 'unknown', message: 'Blob key unlock failed.' });

  const clear = registry[MessageType.ClearBlobKey].fallback(createClearBlobKeyMessage()) as BlobKeyResultMessage;
  assert.deepEqual(clear.payload, { ok: false, reason: 'unknown', message: 'Blob key clear failed.' });

  const exported = registry[MessageType.ExportBlobKeyBackup].fallback(
    createExportBlobKeyBackupMessage(password),
  ) as ExportBlobKeyBackupResultMessage;
  assert.deepEqual(exported.payload, { ok: false, reason: 'unknown', message: 'Key backup export failed.' });

  const imported = registry[MessageType.ImportBlobKeyBackup].fallback(
    createImportBlobKeyBackupMessage(backupFileContent, password),
  ) as ImportBlobKeyBackupResultMessage;
  assert.deepEqual(imported.payload, { ok: false, reason: 'unknown', message: 'Key backup import failed.' });
});
