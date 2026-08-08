import type { ImportedEncryptedImageFile, ImportedImageFile } from '../../core/types.js';
import type { BackupReminderPanelAction } from '../../core/backup-reminder.js';

export type UrlReviewStatusClearScope = 'hostname' | 'page' | 'source' | 'all';

export type ImportExportAction =
  | Extract<BackupReminderPanelAction, { readonly name: 'backup-reminder/snooze' }>
  | { readonly name: 'selection/select-visible' }
  | { readonly name: 'export/history'; readonly password: string; readonly plaintext: boolean }
  | { readonly name: 'export/bookmarks'; readonly password: string; readonly plaintext: boolean }
  | { readonly name: 'export/url-review-status' }
  | { readonly name: 'clear/url-review-status'; readonly scope?: UrlReviewStatusClearScope }
  | { readonly name: 'export/image'; readonly saveAs?: boolean }
  | { readonly name: 'export/encrypted-image' }
  | { readonly name: 'import/history'; readonly fileContent: string; readonly password: string; readonly fileName?: string }
  | { readonly name: 'import/bookmarks'; readonly fileContent: string; readonly password: string; readonly fileName?: string }
  | { readonly name: 'import/url-review-status'; readonly fileContent: string; readonly fileName?: string }
  | { readonly name: 'import/image'; readonly files: readonly ImportedImageFile[] }
  | { readonly name: 'import/encrypted-image'; readonly files: readonly ImportedEncryptedImageFile[] }
  | { readonly name: 'import/confirm-restore-preview' }
  | { readonly name: 'import/cancel-restore-preview' };
