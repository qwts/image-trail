import type { PanelPosition, StoredWorkspaceLayout, WorkspaceLayoutScope } from '../core/workspace-layout.js';
import { MESSAGE_PROTOCOL_VERSION, MessageType, hasVersionedObjectShape } from './message-protocol.js';

/**
 * Per-site UI placement persistence messages, extracted from `messages.ts`: the panel-position
 * group (issue #20-era) and the detached-workspace-layout group (issue #398). `messages.ts`
 * re-exports everything here, so consumers keep importing from `background/messages.js`.
 */

export interface LoadPanelPositionMessage {
  readonly type: typeof MessageType.LoadPanelPosition;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly hostname: string };
}

export interface LoadPanelPositionResultMessage {
  readonly type: typeof MessageType.LoadPanelPositionResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly ok: true; readonly position: PanelPosition | null } | { readonly ok: false; readonly message: string };
}

export interface SavePanelPositionMessage {
  readonly type: typeof MessageType.SavePanelPosition;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: {
    readonly hostname: string;
    readonly position: PanelPosition;
  };
}

export interface SavePanelPositionResultMessage {
  readonly type: typeof MessageType.SavePanelPositionResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly ok: boolean };
}

export interface DeletePanelPositionMessage {
  readonly type: typeof MessageType.DeletePanelPosition;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly hostname: string };
}

export interface DeletePanelPositionResultMessage {
  readonly type: typeof MessageType.DeletePanelPositionResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly ok: boolean };
}

export interface LoadWorkspaceLayoutMessage {
  readonly type: typeof MessageType.LoadWorkspaceLayout;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: WorkspaceLayoutScope;
}

export interface LoadWorkspaceLayoutResultMessage {
  readonly type: typeof MessageType.LoadWorkspaceLayoutResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly ok: true; readonly layout: StoredWorkspaceLayout | null } | { readonly ok: false; readonly message: string };
}

export interface SaveWorkspaceLayoutMessage {
  readonly type: typeof MessageType.SaveWorkspaceLayout;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: {
    readonly hostname: string;
    readonly pageUrl: string;
    readonly layout: StoredWorkspaceLayout;
  };
}

export interface SaveWorkspaceLayoutResultMessage {
  readonly type: typeof MessageType.SaveWorkspaceLayoutResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly ok: boolean };
}

export interface DeleteWorkspaceLayoutMessage {
  readonly type: typeof MessageType.DeleteWorkspaceLayout;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: WorkspaceLayoutScope;
}

export interface DeleteWorkspaceLayoutResultMessage {
  readonly type: typeof MessageType.DeleteWorkspaceLayoutResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly ok: boolean };
}

export function createLoadPanelPositionMessage(hostname: string): LoadPanelPositionMessage {
  return { type: MessageType.LoadPanelPosition, version: MESSAGE_PROTOCOL_VERSION, payload: { hostname } };
}

export function createLoadPanelPositionResultMessage(payload: LoadPanelPositionResultMessage['payload']): LoadPanelPositionResultMessage {
  return { type: MessageType.LoadPanelPositionResult, version: MESSAGE_PROTOCOL_VERSION, payload };
}

export function createSavePanelPositionMessage(hostname: string, position: PanelPosition): SavePanelPositionMessage {
  return { type: MessageType.SavePanelPosition, version: MESSAGE_PROTOCOL_VERSION, payload: { hostname, position } };
}

export function createSavePanelPositionResultMessage(payload: SavePanelPositionResultMessage['payload']): SavePanelPositionResultMessage {
  return { type: MessageType.SavePanelPositionResult, version: MESSAGE_PROTOCOL_VERSION, payload };
}

export function createDeletePanelPositionMessage(hostname: string): DeletePanelPositionMessage {
  return { type: MessageType.DeletePanelPosition, version: MESSAGE_PROTOCOL_VERSION, payload: { hostname } };
}

export function createDeletePanelPositionResultMessage(
  payload: DeletePanelPositionResultMessage['payload'],
): DeletePanelPositionResultMessage {
  return { type: MessageType.DeletePanelPositionResult, version: MESSAGE_PROTOCOL_VERSION, payload };
}

export function createLoadWorkspaceLayoutMessage(scope: WorkspaceLayoutScope): LoadWorkspaceLayoutMessage {
  return { type: MessageType.LoadWorkspaceLayout, version: MESSAGE_PROTOCOL_VERSION, payload: scope };
}

export function createLoadWorkspaceLayoutResultMessage(
  payload: LoadWorkspaceLayoutResultMessage['payload'],
): LoadWorkspaceLayoutResultMessage {
  return { type: MessageType.LoadWorkspaceLayoutResult, version: MESSAGE_PROTOCOL_VERSION, payload };
}

export function createSaveWorkspaceLayoutMessage(scope: WorkspaceLayoutScope, layout: StoredWorkspaceLayout): SaveWorkspaceLayoutMessage {
  return { type: MessageType.SaveWorkspaceLayout, version: MESSAGE_PROTOCOL_VERSION, payload: { ...scope, layout } };
}

export function createSaveWorkspaceLayoutResultMessage(
  payload: SaveWorkspaceLayoutResultMessage['payload'],
): SaveWorkspaceLayoutResultMessage {
  return { type: MessageType.SaveWorkspaceLayoutResult, version: MESSAGE_PROTOCOL_VERSION, payload };
}

export function createDeleteWorkspaceLayoutMessage(scope: WorkspaceLayoutScope): DeleteWorkspaceLayoutMessage {
  return { type: MessageType.DeleteWorkspaceLayout, version: MESSAGE_PROTOCOL_VERSION, payload: scope };
}

export function createDeleteWorkspaceLayoutResultMessage(
  payload: DeleteWorkspaceLayoutResultMessage['payload'],
): DeleteWorkspaceLayoutResultMessage {
  return { type: MessageType.DeleteWorkspaceLayoutResult, version: MESSAGE_PROTOCOL_VERSION, payload };
}

export function isLoadPanelPositionResultMessage(value: unknown): value is LoadPanelPositionResultMessage {
  if (!hasVersionedObjectShape(value)) return false;
  return value.type === MessageType.LoadPanelPositionResult;
}

export function isSavePanelPositionResultMessage(value: unknown): value is SavePanelPositionResultMessage {
  if (!hasVersionedObjectShape(value)) return false;
  return value.type === MessageType.SavePanelPositionResult;
}

export function isDeletePanelPositionResultMessage(value: unknown): value is DeletePanelPositionResultMessage {
  if (!hasVersionedObjectShape(value)) return false;
  return value.type === MessageType.DeletePanelPositionResult;
}

export function isLoadWorkspaceLayoutResultMessage(value: unknown): value is LoadWorkspaceLayoutResultMessage {
  if (!hasVersionedObjectShape(value)) return false;
  return value.type === MessageType.LoadWorkspaceLayoutResult;
}

export function isSaveWorkspaceLayoutResultMessage(value: unknown): value is SaveWorkspaceLayoutResultMessage {
  if (!hasVersionedObjectShape(value)) return false;
  return value.type === MessageType.SaveWorkspaceLayoutResult;
}

export function isDeleteWorkspaceLayoutResultMessage(value: unknown): value is DeleteWorkspaceLayoutResultMessage {
  if (!hasVersionedObjectShape(value)) return false;
  return value.type === MessageType.DeleteWorkspaceLayoutResult;
}
