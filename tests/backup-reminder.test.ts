import assert from 'node:assert/strict';
import test from 'node:test';

import {
  backupReminderStatus,
  isBackupReminderIntervalDays,
  nextBackupReminderAt,
  sanitizeBackupReminderTimestamp,
} from '../extension/src/core/backup-reminder.js';
import { DEFAULT_LOCAL_SETTINGS, migrateLocalSettings } from '../extension/src/data/local-settings.js';

const NOW = Date.parse('2026-08-07T12:00:00.000Z');

test('backup reminders are local, default-off settings with a guarded cadence', () => {
  assert.equal(DEFAULT_LOCAL_SETTINGS.backupReminderEnabled, false);
  assert.equal(DEFAULT_LOCAL_SETTINGS.backupReminderIntervalDays, 30);
  assert.equal(DEFAULT_LOCAL_SETTINGS.backupReminderNextAt, null);
  assert.equal(isBackupReminderIntervalDays(7), true);
  assert.equal(isBackupReminderIntervalDays(14), false);
});

test('backup reminder timing is deterministic and an enabled missing schedule is due', () => {
  assert.equal(nextBackupReminderAt(7, NOW), '2026-08-14T12:00:00.000Z');
  assert.deepEqual(backupReminderStatus({ enabled: false, intervalDays: 30, nextAt: null }, NOW), { due: false, nextAt: null });
  assert.deepEqual(backupReminderStatus({ enabled: true, intervalDays: 30, nextAt: null }, NOW), { due: true, nextAt: null });
  assert.deepEqual(backupReminderStatus({ enabled: true, intervalDays: 7, nextAt: '2026-08-08T12:00:00.000Z' }, NOW), {
    due: false,
    nextAt: '2026-08-08T12:00:00.000Z',
  });
  assert.equal(backupReminderStatus({ enabled: true, intervalDays: 7, nextAt: '2026-08-07T11:59:59.000Z' }, NOW).due, true);
});

test('local settings migration repairs invalid reminder values without enabling reminders', () => {
  const migrated = migrateLocalSettings({
    ...DEFAULT_LOCAL_SETTINGS,
    backupReminderEnabled: false,
    backupReminderIntervalDays: 14 as never,
    backupReminderNextAt: 'not-a-date',
  });
  assert.equal(migrated.backupReminderEnabled, false);
  assert.equal(migrated.backupReminderIntervalDays, 30);
  assert.equal(migrated.backupReminderNextAt, null);
  assert.equal(sanitizeBackupReminderTimestamp('2026-08-07T12:00:00.000Z'), '2026-08-07T12:00:00.000Z');
});
