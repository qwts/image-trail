import assert from 'node:assert/strict';
import test from 'node:test';

import type { PanelAction } from '../../extension/src/core/types.js';
import { createBackupReminderSettingsView } from '../../extension/src/ui/components/automation-settings-view.js';
import { createImportExportView, type ImportExportViewState } from '../../extension/src/ui/components/import-export-view.js';

function importExportState(overrides: Partial<ImportExportViewState> = {}): ImportExportViewState {
  return {
    busy: false,
    currentImageUrl: null,
    selectedHistoryCount: 0,
    selectedBookmarkCount: 0,
    selectedImageDownloadCount: 0,
    selectedEncryptedImageExportCount: 0,
    visibleImageSelectionCount: 0,
    imageDownloadAvailable: false,
    encryptedImageTransferAvailable: false,
    blobKeyUnlocked: false,
    ...overrides,
  };
}

test('backup reminder settings are off by default and dispatch only the local policy change', () => {
  const actions: PanelAction[] = [];
  const view = createBackupReminderSettingsView({ enabled: false, intervalDays: 30, nextAt: null }, (action) => actions.push(action));
  const enabled = view.querySelector<HTMLInputElement>('input[type="checkbox"]');
  const cadence = view.querySelector<HTMLSelectElement>('select');
  assert.ok(enabled);
  assert.ok(cadence);
  assert.equal(cadence.disabled, true);
  assert.match(view.textContent ?? '', /No alarm, notification, provider connection, or upload is scheduled/u);

  enabled.checked = true;
  enabled.dispatchEvent(new Event('change'));
  cadence.value = '7';
  cadence.dispatchEvent(new Event('change'));
  assert.deepEqual(actions, [
    { name: 'settings/update-backup-reminder', enabled: true, intervalDays: 30 },
    { name: 'settings/update-backup-reminder', enabled: true, intervalDays: 7 },
  ]);
});

test('a due reminder offers only manual backup guidance and a local snooze action', () => {
  const actions: PanelAction[] = [];
  const due = createImportExportView(
    importExportState({ backupReminder: { enabled: true, intervalDays: 30, nextAt: '2000-01-01T00:00:00.000Z' } }),
    (action) => actions.push(action as PanelAction),
  );
  assert.match(due.textContent ?? '', /Manual encrypted backup due/u);
  assert.match(due.textContent ?? '', /never connects or uploads automatically/u);
  const snooze = Array.from(due.querySelectorAll('button')).find((button) => button.textContent === 'Remind me in 30 days');
  assert.ok(snooze);
  snooze.click();
  assert.deepEqual(actions, [{ name: 'backup-reminder/snooze' }]);

  const scheduled = createImportExportView(
    importExportState({ backupReminder: { enabled: true, intervalDays: 30, nextAt: '2999-01-01T00:00:00.000Z' } }),
    () => undefined,
  );
  assert.doesNotMatch(scheduled.textContent ?? '', /Manual encrypted backup due/u);
});
