export const BACKUP_REMINDER_INTERVAL_OPTIONS = [7, 30, 90] as const;

export type BackupReminderIntervalDays = (typeof BACKUP_REMINDER_INTERVAL_OPTIONS)[number];

export interface BackupReminderSchedule {
  readonly enabled: boolean;
  readonly intervalDays: BackupReminderIntervalDays;
  readonly nextAt: string | null;
}

export interface BackupReminderPanelState {
  readonly backupReminderEnabled: boolean;
  readonly backupReminderIntervalDays: BackupReminderIntervalDays;
  readonly backupReminderNextAt: string | null;
}

export type BackupReminderPanelAction =
  | { readonly name: 'settings/update-backup-reminder'; readonly enabled: boolean; readonly intervalDays: BackupReminderIntervalDays }
  | { readonly name: 'backup-reminder/snooze' };

export interface BackupReminderStatus {
  readonly due: boolean;
  readonly nextAt: string | null;
}

export function isBackupReminderIntervalDays(value: unknown): value is BackupReminderIntervalDays {
  return BACKUP_REMINDER_INTERVAL_OPTIONS.some((candidate) => candidate === value);
}

export function sanitizeBackupReminderTimestamp(value: unknown): string | null {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null;
}

export function nextBackupReminderAt(intervalDays: BackupReminderIntervalDays, now = Date.now()): string {
  return new Date(now + intervalDays * 24 * 60 * 60 * 1_000).toISOString();
}

export function backupReminderStatus(schedule: BackupReminderSchedule, now = Date.now()): BackupReminderStatus {
  if (!schedule.enabled) return { due: false, nextAt: null };
  const nextAt = sanitizeBackupReminderTimestamp(schedule.nextAt);
  return { due: nextAt === null || Date.parse(nextAt) <= now, nextAt };
}
