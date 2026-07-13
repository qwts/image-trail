export interface CloudBackupHistoryViewRecord {
  readonly provider: 'pcloud';
  readonly destination: string;
  readonly fileName: string;
  readonly completedAt: string;
  readonly size: string;
  readonly sha256: string;
  readonly verificationMethod: 'download-byte-match' | 'provider-checksum';
}

export function createCloudBackupMetadata(rows: ReadonlyArray<readonly [string, string]>): HTMLElement {
  const list = document.createElement('dl');
  list.className = 'image-trail-panel__cloud-provider-metadata';
  for (const [label, value] of rows) {
    const term = document.createElement('dt');
    term.textContent = label;
    const detail = document.createElement('dd');
    detail.textContent = value;
    detail.title = value;
    list.append(term, detail);
  }
  return list;
}

export function createBackupHistory(history: readonly CloudBackupHistoryViewRecord[]): HTMLElement {
  const section = document.createElement('section');
  section.className = 'image-trail-panel__backup-history';

  const heading = document.createElement('h4');
  heading.textContent = `Backup history (${history.length})`;

  const list = document.createElement('ol');
  list.className = 'image-trail-panel__backup-history-list';
  for (const record of history) {
    const item = document.createElement('li');
    item.className = 'image-trail-panel__backup-history-item';

    const title = document.createElement('p');
    title.className = 'image-trail-panel__backup-history-title';
    const provider = document.createElement('strong');
    provider.textContent = 'pCloud';
    const completedAt = document.createElement('time');
    completedAt.dateTime = record.completedAt;
    completedAt.textContent = record.completedAt;
    title.append(provider, completedAt);

    item.append(
      title,
      createCloudBackupMetadata([
        ['Destination', record.destination],
        ['File', record.fileName],
        ['Size', record.size],
        ['Image Trail SHA-256', record.sha256],
        ['Verified by', backupVerificationLabel(record.verificationMethod)],
      ]),
    );
    list.append(item);
  }

  section.append(heading, list);
  return section;
}

function backupVerificationLabel(method: CloudBackupHistoryViewRecord['verificationMethod']): string {
  return method === 'download-byte-match' ? 'Downloaded bytes matched export' : 'pCloud SHA-1 matched export';
}
