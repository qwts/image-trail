import { imageResourceUrlsEqual } from '../../core/image/image-navigation.js';
import type { ParsedFieldStateRecord, ParsedFieldStateStore } from '../../core/types.js';

export function shouldRestoreParsedFieldState(
  record: ParsedFieldStateRecord,
  currentSelectedUrl: string | null,
  selectedHandleId: string | null,
  currentPageUrl?: string,
): boolean {
  if (currentPageUrl && record.pageUrl === currentPageUrl) return true;
  if (record.sourceUrl === currentSelectedUrl) return true;
  if (record.pageUrl === currentSelectedUrl && (!record.selectedHandleId || record.selectedHandleId === selectedHandleId)) return true;
  if (!record.selectedHandleId || record.selectedHandleId !== selectedHandleId) return false;
  return !!record.selectedUrl && record.selectedUrl === currentSelectedUrl;
}

export function nextParsedFieldStatePageKey(
  currentPageUrl: string,
  storedPageKey: string,
  extensionProjectedPageUrl: string | null,
): string {
  if (currentPageUrl === storedPageKey || currentPageUrl === extensionProjectedPageUrl) return storedPageKey;
  return currentPageUrl;
}

export interface ParsedFieldStateSyncDeps {
  store(): ParsedFieldStateStore | null;
  hostname(): string | null;
  currentPageHref(): string;
  currentSelectedUrl(): string | null;
  selectedHandleId(): string | null;
  syncTargetStateFromSnapshot(): void;
  createRecord(): ParsedFieldStateRecord | null;
  applyRestoredRecord(
    record: ParsedFieldStateRecord,
    ctx: { readonly sameSource: boolean; readonly projectSavedSource: boolean },
  ): Promise<void>;
}

export class ParsedFieldStateSync {
  private restoreInProgress = false;
  private updatedAtMs = 0;
  private saveQueue: Promise<void> = Promise.resolve();
  private transformQueue: Promise<void> = Promise.resolve();
  private pageKey: string;
  private extensionProjectedPageUrl: string | null = null;

  constructor(private readonly deps: ParsedFieldStateSyncDeps) {
    this.pageKey = deps.currentPageHref();
  }

  pageUrl(): string {
    this.refreshPageKey();
    return this.pageKey;
  }

  setExtensionProjectedPageUrl(url: string): void {
    this.extensionProjectedPageUrl = url;
  }

  nextUpdatedAt(): string {
    const now = Date.now();
    this.updatedAtMs = Math.max(now, this.updatedAtMs + 1);
    return new Date(this.updatedAtMs).toISOString();
  }

  async save(): Promise<void> {
    const store = this.deps.store();
    if (!store) return;
    const record = this.deps.createRecord();
    if (!record) return;
    this.saveQueue = this.saveQueue.then(() => store.save(record));
    await this.saveQueue;
  }

  async restore(options: { readonly projectSavedSource?: boolean } = {}): Promise<void> {
    if (this.restoreInProgress) return;
    const store = this.deps.store();
    if (!store) return;
    this.restoreInProgress = true;
    try {
      this.deps.syncTargetStateFromSnapshot();
      const hostname = this.deps.hostname();
      if (!hostname) return;
      const currentSelectedUrl = this.deps.currentSelectedUrl();
      const currentPageUrl = this.pageUrl();
      const exactRecord = await store.load(hostname, currentPageUrl);
      const sourceRecord = currentSelectedUrl ? await store.loadForSource(hostname, currentSelectedUrl) : null;
      const record = [exactRecord, sourceRecord].find(
        (candidate): candidate is ParsedFieldStateRecord =>
          !!candidate && shouldRestoreParsedFieldState(candidate, currentSelectedUrl, this.deps.selectedHandleId(), currentPageUrl),
      );
      if (!record) return;
      const sameSource = imageResourceUrlsEqual(record.sourceUrl, currentSelectedUrl, this.deps.currentPageHref());
      await this.deps.applyRestoredRecord(record, { sameSource, projectSavedSource: options.projectSavedSource ?? false });
    } finally {
      this.restoreInProgress = false;
    }
  }

  enqueueFieldInteraction(run: () => Promise<void>): void {
    this.transformQueue = this.transformQueue.then(run).catch((error: unknown) => {
      console.error('Image Trail field interaction failed.', error);
    });
  }

  private refreshPageKey(): void {
    const currentPageUrl = this.deps.currentPageHref();
    const nextPageKey = nextParsedFieldStatePageKey(currentPageUrl, this.pageKey, this.extensionProjectedPageUrl);
    if (nextPageKey === this.pageKey) return;
    this.pageKey = nextPageKey;
    this.extensionProjectedPageUrl = null;
  }
}
