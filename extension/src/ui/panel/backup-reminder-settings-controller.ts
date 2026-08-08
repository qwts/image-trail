import { isBackupReminderIntervalDays, nextBackupReminderAt, type BackupReminderIntervalDays } from '../../core/backup-reminder.js';
import type { PanelState } from '../../core/types.js';
import type { PlaintextLocalSettings } from '../../content/panel-services.js';

interface BackupReminderSettingsDeps {
  getState(): PanelState;
  setState(state: PanelState): void;
  getLocalSettings(): PlaintextLocalSettings;
  saveLocalSettings(settings: PlaintextLocalSettings): void;
  render(): void;
}

export class BackupReminderSettingsController {
  constructor(private readonly deps: BackupReminderSettingsDeps) {}

  update(enabled: boolean, intervalDays: BackupReminderIntervalDays, now = Date.now()): void {
    if (!isBackupReminderIntervalDays(intervalDays)) return;
    this.persist(enabled, intervalDays, enabled ? nextBackupReminderAt(intervalDays, now) : null);
    this.deps.render();
  }

  snooze(now = Date.now()): void {
    const settings = this.deps.getLocalSettings();
    if (!settings.backupReminderEnabled) return;
    this.persist(true, settings.backupReminderIntervalDays, nextBackupReminderAt(settings.backupReminderIntervalDays, now));
    this.deps.render();
  }

  complete(now = Date.now()): void {
    const settings = this.deps.getLocalSettings();
    if (!settings.backupReminderEnabled) return;
    this.persist(true, settings.backupReminderIntervalDays, nextBackupReminderAt(settings.backupReminderIntervalDays, now));
  }

  private persist(enabled: boolean, intervalDays: BackupReminderIntervalDays, nextAt: string | null): void {
    this.deps.setState({
      ...this.deps.getState(),
      backupReminderEnabled: enabled,
      backupReminderIntervalDays: intervalDays,
      backupReminderNextAt: nextAt,
      lastUpdatedAt: Date.now(),
    });
    this.deps.saveLocalSettings({
      ...this.deps.getLocalSettings(),
      backupReminderEnabled: enabled,
      backupReminderIntervalDays: intervalDays,
      backupReminderNextAt: nextAt,
    });
  }
}

interface BackupReminderBindingTarget {
  saveLocalSettings(settings: PlaintextLocalSettings): void;
  updateBackupReminder(enabled: boolean, intervalDays: BackupReminderIntervalDays): void;
  snoozeBackupReminder(): void;
  recordManualBackupCompleted(): void;
}

export function createBackupReminderBindings(source: () => readonly [BackupReminderBindingTarget, PlaintextLocalSettings]) {
  return {
    getLocalSettings: () => source()[1],
    saveLocalSettings: (settings: PlaintextLocalSettings) => source()[0].saveLocalSettings(settings),
    updateBackupReminder: (enabled: boolean, intervalDays: BackupReminderIntervalDays) =>
      source()[0].updateBackupReminder(enabled, intervalDays),
    snoozeBackupReminder: () => source()[0].snoozeBackupReminder(),
    backupCompleted: () => source()[0].recordManualBackupCompleted(),
  };
}
