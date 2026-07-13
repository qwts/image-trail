import type { CloudBackupHistoryViewRecord } from '../components/cloud-backup-metadata.js';

export const VERIFIED_BACKUP_HISTORY = [
  {
    provider: 'pcloud',
    destination: '/Image Trail/backups',
    fileName: 'image-trail-pcloud-backup-2026-06-27T16-24-00Z.image-trail-encrypted.json',
    completedAt: '2026-06-27T16:24:08.000Z',
    size: '428 KB',
    sha256: 'b6d9a5b7e33e4c0d8fbd8f9fd2a31e4282d9a89db3df91d7b0f8d2a5b0ec8d67',
    verificationMethod: 'download-byte-match',
  },
  {
    provider: 'pcloud',
    destination: '/Image Trail/backups',
    fileName: 'image-trail-pcloud-backup-2026-06-26T15-10-00Z.image-trail-encrypted.json',
    completedAt: '2026-06-26T15:10:05.000Z',
    size: '392 KB',
    sha256: '4a1a2b3c4d5e6f708192a3b4c5d6e7f84a1a2b3c4d5e6f708192a3b4c5d6e7f8',
    verificationMethod: 'provider-checksum',
  },
] as const satisfies readonly CloudBackupHistoryViewRecord[];
