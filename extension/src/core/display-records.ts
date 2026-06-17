export interface ImageDisplayRecord {
  readonly id: string;
  readonly url: string;
  readonly title?: string;
  readonly label?: string;
  readonly thumbnail?: string;
  readonly timestamp: string;
  readonly downloadedAt?: string;
  readonly capturedAt?: string;
  readonly source?: 'history' | 'bookmark' | 'favorites';
}

export function normalizeDisplayLabel(record: Pick<ImageDisplayRecord, 'url' | 'title' | 'label'>): string {
  if (record.label?.trim()) {
    return record.label.trim();
  }
  if (record.title?.trim()) {
    return record.title.trim();
  }

  try {
    const parsed = new URL(record.url);
    const filename = parsed.pathname.split('/').filter(Boolean).at(-1);
    return filename ? decodeURIComponent(filename) : parsed.hostname;
  } catch {
    return record.url;
  }
}

export function createDisplayRecord(
  input: Omit<ImageDisplayRecord, 'id' | 'label' | 'timestamp'> & Partial<Pick<ImageDisplayRecord, 'id' | 'label' | 'timestamp'>>,
): ImageDisplayRecord {
  const timestamp = input.timestamp ?? new Date().toISOString();
  const id = input.id ?? `${timestamp}:${input.url}`;
  const draft = { ...input, id, timestamp };
  return { ...draft, label: normalizeDisplayLabel(draft) };
}
