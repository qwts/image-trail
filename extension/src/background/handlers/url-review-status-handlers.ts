import type { UrlReviewStatusClearFilter } from '../../core/types.js';
import { defineMessage, type MessageDef } from '../message-dispatch.js';
import * as requestSchemas from '../message-schemas.js';
import {
  MessageType,
  createClearUrlReviewStatusResultMessage,
  createImportUrlReviewStatusResultMessage,
  createListUrlReviewStatusResultMessage,
  createSaveUrlReviewStatusResultMessage,
  type ClearUrlReviewStatusMessage,
  type ClearUrlReviewStatusResultMessage,
  type ExtensionRequest,
  type ExtensionResponse,
  type ImportUrlReviewStatusMessage,
  type ImportUrlReviewStatusResultMessage,
  type ListUrlReviewStatusMessage,
  type ListUrlReviewStatusResultMessage,
  type SaveUrlReviewStatusMessage,
  type SaveUrlReviewStatusResultMessage,
} from '../messages.js';
import type { ServiceWorkerContext } from '../service-worker-context.js';
import { normalizeHostname } from './hostname.js';

type UrlReviewStatusRequestType =
  | typeof MessageType.ListUrlReviewStatus
  | typeof MessageType.SaveUrlReviewStatus
  | typeof MessageType.ImportUrlReviewStatus
  | typeof MessageType.ClearUrlReviewStatus;

type UrlReviewStatusMessageHandlerDeps = Pick<ServiceWorkerContext, 'urlReviewStatusStore' | 'loadLocalSettings'>;

export function createUrlReviewStatusMessageRegistry({
  urlReviewStatusStore,
  loadLocalSettings,
}: UrlReviewStatusMessageHandlerDeps): Record<UrlReviewStatusRequestType, MessageDef<ExtensionRequest, ExtensionResponse>> {
  async function list(message: ListUrlReviewStatusMessage): Promise<ListUrlReviewStatusResultMessage['payload']> {
    if (message.payload.hostname === null) return { ok: true, records: await urlReviewStatusStore.listAll() };
    const hostname = normalizeHostname(message.payload.hostname);
    return { ok: true, records: hostname ? await urlReviewStatusStore.list(hostname) : [] };
  }

  async function save(message: SaveUrlReviewStatusMessage): Promise<SaveUrlReviewStatusResultMessage['payload']> {
    const hostname = normalizeHostname(message.payload.record.hostname);
    if (!hostname) return { ok: false };
    const settings = await loadLocalSettings();
    await urlReviewStatusStore.save({ ...message.payload.record, hostname }, { maxRecordsPerHost: settings.urlReviewStatusLimit });
    return { ok: true };
  }

  async function importMany(message: ImportUrlReviewStatusMessage): Promise<ImportUrlReviewStatusResultMessage['payload']> {
    const records = message.payload.records
      .map((record) => {
        const hostname = normalizeHostname(record.hostname);
        return hostname ? { ...record, hostname } : null;
      })
      .filter((record): record is NonNullable<typeof record> => record !== null);
    const settings = await loadLocalSettings();
    return {
      ok: true,
      importedCount: await urlReviewStatusStore.importMany(records, { maxRecordsPerHost: settings.urlReviewStatusLimit }),
    };
  }

  async function clear(message: ClearUrlReviewStatusMessage): Promise<ClearUrlReviewStatusResultMessage['payload']> {
    const filter = normalizeClearFilter(message.payload.filter);
    return filter
      ? { ok: true, deletedCount: await urlReviewStatusStore.clear(filter) }
      : { ok: false, message: 'URL review status clear scope is invalid.' };
  }

  return {
    [MessageType.ListUrlReviewStatus]: defineMessage({
      requestSchema: requestSchemas.listUrlReviewStatusRequestSchema,
      handle: list,
      respond: createListUrlReviewStatusResultMessage,
      fallback: () => createListUrlReviewStatusResultMessage({ ok: false, message: 'URL review status could not be loaded.' }),
    }),
    [MessageType.SaveUrlReviewStatus]: defineMessage({
      requestSchema: requestSchemas.saveUrlReviewStatusRequestSchema,
      handle: save,
      respond: createSaveUrlReviewStatusResultMessage,
      fallback: () => createSaveUrlReviewStatusResultMessage({ ok: false }),
    }),
    [MessageType.ImportUrlReviewStatus]: defineMessage({
      requestSchema: requestSchemas.importUrlReviewStatusRequestSchema,
      handle: importMany,
      respond: createImportUrlReviewStatusResultMessage,
      fallback: () => createImportUrlReviewStatusResultMessage({ ok: false, message: 'URL review status could not be imported.' }),
    }),
    [MessageType.ClearUrlReviewStatus]: defineMessage({
      requestSchema: requestSchemas.clearUrlReviewStatusRequestSchema,
      handle: clear,
      respond: createClearUrlReviewStatusResultMessage,
      fallback: () => createClearUrlReviewStatusResultMessage({ ok: false, message: 'URL review status could not be cleared.' }),
    }),
  };
}

function normalizeClearFilter(filter: UrlReviewStatusClearFilter): UrlReviewStatusClearFilter | null {
  if (filter.scope === 'all') return filter;
  const hostname = normalizeHostname(filter.hostname);
  if (!hostname) return null;
  if (filter.scope === 'hostname') return { scope: 'hostname', hostname };
  if (filter.scope === 'page') return typeof filter.pageUrl === 'string' ? { scope: 'page', hostname, pageUrl: filter.pageUrl } : null;
  return typeof filter.sourceUrl === 'string' ? { scope: 'source', hostname, sourceUrl: filter.sourceUrl } : null;
}
