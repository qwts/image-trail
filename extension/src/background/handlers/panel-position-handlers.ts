import { defineMessage, type MessageDef } from '../message-dispatch.js';
import * as requestSchemas from '../message-schemas.js';
import {
  MessageType,
  createDeletePanelPositionResultMessage,
  createDeleteWorkspaceLayoutResultMessage,
  createLoadPanelPositionResultMessage,
  createLoadWorkspaceLayoutResultMessage,
  createSavePanelPositionResultMessage,
  createSaveWorkspaceLayoutResultMessage,
  type DeletePanelPositionMessage,
  type DeletePanelPositionResultMessage,
  type DeleteWorkspaceLayoutMessage,
  type DeleteWorkspaceLayoutResultMessage,
  type ExtensionRequest,
  type ExtensionResponse,
  type LoadPanelPositionMessage,
  type LoadPanelPositionResultMessage,
  type LoadWorkspaceLayoutMessage,
  type LoadWorkspaceLayoutResultMessage,
  type SavePanelPositionMessage,
  type SavePanelPositionResultMessage,
  type SaveWorkspaceLayoutMessage,
  type SaveWorkspaceLayoutResultMessage,
} from '../messages.js';
import type { ServiceWorkerContext } from '../service-worker-context.js';
import { normalizeHostname } from './hostname.js';

type PanelPositionRequestType =
  | typeof MessageType.LoadPanelPosition
  | typeof MessageType.SavePanelPosition
  | typeof MessageType.DeletePanelPosition
  | typeof MessageType.LoadWorkspaceLayout
  | typeof MessageType.SaveWorkspaceLayout
  | typeof MessageType.DeleteWorkspaceLayout;

export type PanelPositionMessageHandlerDeps = Pick<ServiceWorkerContext, 'panelPositionStore' | 'workspaceLayoutStore'>;

/** Per-site UI placement persistence: the panel-position group and the detached-workspace-layout group (issue #398). */
export function createPanelPositionMessageRegistry({
  panelPositionStore,
  workspaceLayoutStore,
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

  async function handleLoadWorkspaceLayout(message: LoadWorkspaceLayoutMessage): Promise<LoadWorkspaceLayoutResultMessage['payload']> {
    const hostname = normalizeHostname(message.payload.hostname);
    if (!hostname) return { ok: true, layout: null };
    return { ok: true, layout: await workspaceLayoutStore.load({ hostname, pageUrl: message.payload.pageUrl }) };
  }

  async function handleSaveWorkspaceLayout(message: SaveWorkspaceLayoutMessage): Promise<SaveWorkspaceLayoutResultMessage['payload']> {
    const hostname = normalizeHostname(message.payload.hostname);
    if (!hostname) return { ok: false };
    await workspaceLayoutStore.save({ hostname, pageUrl: message.payload.pageUrl }, message.payload.layout);
    return { ok: true };
  }

  async function handleDeleteWorkspaceLayout(
    message: DeleteWorkspaceLayoutMessage,
  ): Promise<DeleteWorkspaceLayoutResultMessage['payload']> {
    const hostname = normalizeHostname(message.payload.hostname);
    if (!hostname) return { ok: false };
    await workspaceLayoutStore.remove({ hostname, pageUrl: message.payload.pageUrl });
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
    [MessageType.LoadWorkspaceLayout]: defineMessage({
      requestSchema: requestSchemas.loadWorkspaceLayoutRequestSchema,
      handle: (message: LoadWorkspaceLayoutMessage) => handleLoadWorkspaceLayout(message),
      respond: (result) => createLoadWorkspaceLayoutResultMessage(result),
      fallback: () => createLoadWorkspaceLayoutResultMessage({ ok: false, message: 'Workspace layout could not be loaded.' }),
    }),
    [MessageType.SaveWorkspaceLayout]: defineMessage({
      requestSchema: requestSchemas.saveWorkspaceLayoutRequestSchema,
      handle: (message: SaveWorkspaceLayoutMessage) => handleSaveWorkspaceLayout(message),
      respond: (result) => createSaveWorkspaceLayoutResultMessage(result),
      fallback: () => createSaveWorkspaceLayoutResultMessage({ ok: false }),
    }),
    [MessageType.DeleteWorkspaceLayout]: defineMessage({
      requestSchema: requestSchemas.deleteWorkspaceLayoutRequestSchema,
      handle: (message: DeleteWorkspaceLayoutMessage) => handleDeleteWorkspaceLayout(message),
      respond: (result) => createDeleteWorkspaceLayoutResultMessage(result),
      fallback: () => createDeleteWorkspaceLayoutResultMessage({ ok: false }),
    }),
  };
}
