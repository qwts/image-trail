import { defineMessage, type MessageDef } from '../message-dispatch.js';
import * as requestSchemas from '../message-schemas.js';
import {
  MessageType,
  createDeleteGrabSourcePatternResultMessage,
  createDeleteUrlTemplateResultMessage,
  createListGrabSourcePatternsResultMessage,
  createListUrlTemplatesResultMessage,
  createSaveGrabSourcePatternResultMessage,
  createSaveUrlTemplateResultMessage,
  type DeleteGrabSourcePatternMessage,
  type DeleteGrabSourcePatternResultMessage,
  type DeleteUrlTemplateMessage,
  type DeleteUrlTemplateResultMessage,
  type ExtensionRequest,
  type ExtensionResponse,
  type ListGrabSourcePatternsMessage,
  type ListGrabSourcePatternsResultMessage,
  type ListUrlTemplatesMessage,
  type ListUrlTemplatesResultMessage,
  type SaveGrabSourcePatternMessage,
  type SaveGrabSourcePatternResultMessage,
  type SaveUrlTemplateMessage,
  type SaveUrlTemplateResultMessage,
} from '../messages.js';
import type { ServiceWorkerContext } from '../service-worker-context.js';
import { normalizeHostname } from './hostname.js';

type UrlTemplateRequestType =
  | typeof MessageType.ListUrlTemplates
  | typeof MessageType.SaveUrlTemplate
  | typeof MessageType.DeleteUrlTemplate
  | typeof MessageType.ListGrabSourcePatterns
  | typeof MessageType.SaveGrabSourcePattern
  | typeof MessageType.DeleteGrabSourcePattern;

export type UrlTemplateMessageHandlerDeps = Pick<ServiceWorkerContext, 'urlTemplateStore'>;

export function createUrlTemplateMessageRegistry({
  urlTemplateStore,
}: UrlTemplateMessageHandlerDeps): Record<UrlTemplateRequestType, MessageDef<ExtensionRequest, ExtensionResponse>> {
  async function handleListUrlTemplates(message: ListUrlTemplatesMessage): Promise<ListUrlTemplatesResultMessage['payload']> {
    const hostname = normalizeHostname(message.payload.hostname);
    if (!hostname) return { ok: true, templates: [] };
    return { ok: true, templates: await urlTemplateStore.load(hostname) };
  }

  async function handleSaveUrlTemplate(message: SaveUrlTemplateMessage): Promise<SaveUrlTemplateResultMessage['payload']> {
    const hostname = normalizeHostname(message.payload.template.hostname);
    if (!hostname) return { ok: false };
    await urlTemplateStore.save({ ...message.payload.template, hostname });
    return { ok: true };
  }

  async function handleDeleteUrlTemplate(message: DeleteUrlTemplateMessage): Promise<DeleteUrlTemplateResultMessage['payload']> {
    const hostname = normalizeHostname(message.payload.hostname);
    if (!hostname) return { ok: false };
    await urlTemplateStore.remove(hostname, message.payload.id);
    return { ok: true };
  }

  async function handleListGrabSourcePatterns(
    message: ListGrabSourcePatternsMessage,
  ): Promise<ListGrabSourcePatternsResultMessage['payload']> {
    const hostname = normalizeHostname(message.payload.hostname);
    if (!hostname) return { ok: true, patterns: [] };
    return { ok: true, patterns: await urlTemplateStore.loadGrabSourcePatterns(hostname) };
  }

  async function handleSaveGrabSourcePattern(
    message: SaveGrabSourcePatternMessage,
  ): Promise<SaveGrabSourcePatternResultMessage['payload']> {
    const hostname = normalizeHostname(message.payload.pattern.hostname);
    if (!hostname) return { ok: false };
    await urlTemplateStore.saveGrabSourcePattern({ ...message.payload.pattern, hostname });
    return { ok: true };
  }

  async function handleDeleteGrabSourcePattern(
    message: DeleteGrabSourcePatternMessage,
  ): Promise<DeleteGrabSourcePatternResultMessage['payload']> {
    const hostname = normalizeHostname(message.payload.hostname);
    if (!hostname) return { ok: false };
    await urlTemplateStore.removeGrabSourcePattern(hostname, message.payload.id);
    return { ok: true };
  }

  return {
    [MessageType.ListUrlTemplates]: defineMessage({
      requestSchema: requestSchemas.listUrlTemplatesRequestSchema,
      handle: (message: ListUrlTemplatesMessage) => handleListUrlTemplates(message),
      respond: (result) => createListUrlTemplatesResultMessage(result),
      fallback: () => createListUrlTemplatesResultMessage({ ok: false, message: 'URL templates could not be loaded.' }),
    }),
    [MessageType.SaveUrlTemplate]: defineMessage({
      requestSchema: requestSchemas.saveUrlTemplateRequestSchema,
      handle: (message: SaveUrlTemplateMessage) => handleSaveUrlTemplate(message),
      respond: (result) => createSaveUrlTemplateResultMessage(result),
      fallback: () => createSaveUrlTemplateResultMessage({ ok: false }),
    }),
    [MessageType.DeleteUrlTemplate]: defineMessage({
      requestSchema: requestSchemas.deleteUrlTemplateRequestSchema,
      handle: (message: DeleteUrlTemplateMessage) => handleDeleteUrlTemplate(message),
      respond: (result) => createDeleteUrlTemplateResultMessage(result),
      fallback: () => createDeleteUrlTemplateResultMessage({ ok: false }),
    }),
    [MessageType.ListGrabSourcePatterns]: defineMessage({
      requestSchema: requestSchemas.listGrabSourcePatternsRequestSchema,
      handle: (message: ListGrabSourcePatternsMessage) => handleListGrabSourcePatterns(message),
      respond: (result) => createListGrabSourcePatternsResultMessage(result),
      fallback: () => createListGrabSourcePatternsResultMessage({ ok: false, message: 'Grab source patterns could not be loaded.' }),
    }),
    [MessageType.SaveGrabSourcePattern]: defineMessage({
      requestSchema: requestSchemas.saveGrabSourcePatternRequestSchema,
      handle: (message: SaveGrabSourcePatternMessage) => handleSaveGrabSourcePattern(message),
      respond: (result) => createSaveGrabSourcePatternResultMessage(result),
      fallback: () => createSaveGrabSourcePatternResultMessage({ ok: false }),
    }),
    [MessageType.DeleteGrabSourcePattern]: defineMessage({
      requestSchema: requestSchemas.deleteGrabSourcePatternRequestSchema,
      handle: (message: DeleteGrabSourcePatternMessage) => handleDeleteGrabSourcePattern(message),
      respond: (result) => createDeleteGrabSourcePatternResultMessage(result),
      fallback: () => createDeleteGrabSourcePatternResultMessage({ ok: false }),
    }),
  };
}
