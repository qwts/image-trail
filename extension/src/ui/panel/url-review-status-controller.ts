import { reducePanelAction } from '../../core/actions.js';
import type { PanelState, UrlReviewStatus, UrlReviewStatusClearFilter, UrlReviewStatusStore } from '../../core/types.js';
import { hostnameFromLocation } from '../panel-position.js';
import { urlReviewStatusClearScopeLabel } from './record-export-helpers.js';

export interface UrlReviewStatusControllerDeps {
  getState(): PanelState;
  setState(state: PanelState): void;
  render(): void;
  urlReviewStatusStore(): UrlReviewStatusStore | null;
  // The per-host record cap; the current page key for `page`-scoped saves/clears.
  urlReviewStatusLimit(): number;
  fieldStatePageUrl(): string;
}

/**
 * URL review-status persistence, moved verbatim off `ImageTrailPanel`: it saves a per-host review
 * status for the attempted fields (`saveUrlReviewStatus`, injected into the projection and
 * parsed-field-navigation controllers) and clears stored statuses at a chosen scope
 * (`clearUrlReviewStatus`, driven from the settings action). Scope resolution
 * (`urlReviewStatusClearFilter`) keys `page`/`source` scopes off the current page URL and selection.
 */
export class UrlReviewStatusController {
  constructor(private readonly deps: UrlReviewStatusControllerDeps) {}

  async saveUrlReviewStatus(status: UrlReviewStatus, sourceUrl: string, fieldIds: readonly string[], reason?: string): Promise<void> {
    const store = this.deps.urlReviewStatusStore();
    if (!store || fieldIds.length === 0) return;
    const hostname = hostnameFromLocation();
    if (!hostname) return;
    await store.save(
      {
        schemaVersion: 1,
        hostname,
        pageUrl: this.deps.fieldStatePageUrl(),
        sourceUrl,
        status,
        fieldIds,
        activeFieldId: this.deps.getState().activeFieldId,
        reason,
        updatedAt: new Date().toISOString(),
      },
      { maxRecordsPerHost: this.deps.urlReviewStatusLimit() },
    );
  }

  async clearUrlReviewStatus(scope: 'hostname' | 'page' | 'source' | 'all'): Promise<void> {
    this.deps.setState(reducePanelAction(this.deps.getState(), { name: 'import-export/start' }));
    this.deps.render();
    const filter = this.urlReviewStatusClearFilter(scope);
    const store = this.deps.urlReviewStatusStore();
    const deletedCount = filter && store ? await store.clear(filter) : 0;
    this.deps.setState(
      reducePanelAction(this.deps.getState(), {
        name: 'import-export/complete',
        message: `Cleared ${deletedCount} URL review status record${deletedCount === 1 ? '' : 's'} for ${urlReviewStatusClearScopeLabel(scope)}.`,
      }),
    );
    this.deps.render();
  }

  private urlReviewStatusClearFilter(scope: 'hostname' | 'page' | 'source' | 'all'): UrlReviewStatusClearFilter | null {
    if (scope === 'all') return { scope: 'all' };
    const hostname = hostnameFromLocation();
    if (!hostname) return null;
    if (scope === 'hostname') return { scope: 'hostname', hostname };
    if (scope === 'page') return { scope: 'page', hostname, pageUrl: this.deps.fieldStatePageUrl() };
    const state = this.deps.getState();
    const sourceUrl = state.draftUrl ?? state.target.selectedUrl;
    return sourceUrl ? { scope: 'source', hostname, sourceUrl } : null;
  }
}
