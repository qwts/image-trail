import { defineMessage, type MessageDef } from '../message-dispatch.js';
import * as requestSchemas from '../message-schemas.js';
import {
  MessageType,
  createDeletePanelPositionResultMessage,
  createLoadPanelPositionResultMessage,
  createSavePanelPositionResultMessage,
  type DeletePanelPositionMessage,
  type DeletePanelPositionResultMessage,
  type ExtensionRequest,
  type ExtensionResponse,
  type LoadPanelPositionMessage,
  type LoadPanelPositionResultMessage,
  type SavePanelPositionMessage,
  type SavePanelPositionResultMessage,
} from '../messages.js';
import type { ServiceWorkerContext } from '../service-worker-context.js';
import { normalizeHostname } from './hostname.js';

type PanelPositionRequestType =
  typeof MessageType.LoadPanelPosition | typeof MessageType.SavePanelPosition | typeof MessageType.DeletePanelPosition;

export type PanelPositionMessageHandlerDeps = Pick<ServiceWorkerContext, 'panelPositionStore'>;

export function createPanelPositionMessageRegistry({
  panelPositionStore,
}: PanelPositionMessageHandlerDeps): Record<PanelPositionRequestType, MessageDef<ExtensionRequest, ExtensionResponse>> {
  async function handleLoadPanelPosition(message: LoadPanelPositionMessage): Promise<LoadPanelPositionResultMessage['payload']> {
    const hostname = normalizeHostname(message.payload.hostname);
    if (!hostname) return { ok: true, position: null };
    return { ok: true, position: await panelPositionStore.load(hostname) };
  }

  async function handleSavePanelPosition(message: SavePanelPositionMessage): Promise<SavePanelPositionResultMessage['payload']> {
    const hostname = normalizeHostname(message.payload.hostname);
    if (!hostname) return { ok: false };
    await panelPositionStore.save(hostname, message.payload.position);
    return { ok: true };
  }

  async function handleDeletePanelPosition(message: DeletePanelPositionMessage): Promise<DeletePanelPositionResultMessage['payload']> {
    const hostname = normalizeHostname(message.payload.hostname);
    if (!hostname) return { ok: false };
    await panelPositionStore.remove(hostname);
    return { ok: true };
  }

  return {
    [MessageType.LoadPanelPosition]: defineMessage({
      requestSchema: requestSchemas.loadPanelPositionRequestSchema,
      handle: (message: LoadPanelPositionMessage) => handleLoadPanelPosition(message),
      respond: (result) => createLoadPanelPositionResultMessage(result),
      fallback: () => createLoadPanelPositionResultMessage({ ok: false, message: 'Panel position could not be loaded.' }),
    }),
    [MessageType.SavePanelPosition]: defineMessage({
      requestSchema: requestSchemas.savePanelPositionRequestSchema,
      handle: (message: SavePanelPositionMessage) => handleSavePanelPosition(message),
      respond: (result) => createSavePanelPositionResultMessage(result),
      fallback: () => createSavePanelPositionResultMessage({ ok: false }),
    }),
    [MessageType.DeletePanelPosition]: defineMessage({
      requestSchema: requestSchemas.deletePanelPositionRequestSchema,
      handle: (message: DeletePanelPositionMessage) => handleDeletePanelPosition(message),
      respond: (result) => createDeletePanelPositionResultMessage(result),
      fallback: () => createDeletePanelPositionResultMessage({ ok: false }),
    }),
  };
}
