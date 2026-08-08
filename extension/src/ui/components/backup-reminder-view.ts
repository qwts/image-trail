import { backupReminderStatus, type BackupReminderSchedule } from '../../core/backup-reminder.js';

export function createBackupReminderView(schedule: BackupReminderSchedule | undefined, snooze: () => void): HTMLElement | null {
  if (!schedule || !backupReminderStatus(schedule).due) return null;
  const reminder = document.createElement('div');
  reminder.className = 'image-trail-panel__backup-reminder';
  reminder.setAttribute('role', 'status');
  const heading = document.createElement('strong');
  heading.textContent = 'Manual encrypted backup due';
  const description = document.createElement('p');
  description.className = 'image-trail-panel__meta';
  description.textContent =
    'Create an encrypted bookmark export and key backup, or choose pCloud Back up now. This reminder never connects or uploads automatically.';
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = `Remind me in ${schedule.intervalDays} days`;
  button.addEventListener('click', snooze);
  reminder.append(heading, description, button);
  return reminder;
}
