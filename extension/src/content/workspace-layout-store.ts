import {
  createDeleteWorkspaceLayoutMessage,
  createLoadWorkspaceLayoutMessage,
  createSaveWorkspaceLayoutMessage,
  isDeleteWorkspaceLayoutResultMessage,
  isLoadWorkspaceLayoutResultMessage,
  isSaveWorkspaceLayoutResultMessage,
} from '../background/messages.js';
import type { WorkspaceLayout, WorkspaceLayoutStore } from '../core/types.js';
import { sendRuntimeMessage } from './runtime-message.js';

export class ExtensionWorkspaceLayoutStore implements WorkspaceLayoutStore {
  async load(hostname: string): Promise<WorkspaceLayout | null> {
    const response = await sendRuntimeMessage(createLoadWorkspaceLayoutMessage(hostname));
    return isLoadWorkspaceLayoutResultMessage(response) && response.payload.ok ? response.payload.layout : null;
  }

  async save(hostname: string, layout: WorkspaceLayout): Promise<void> {
    const response = await sendRuntimeMessage(createSaveWorkspaceLayoutMessage(hostname, layout));
    if (response === null || isSaveWorkspaceLayoutResultMessage(response)) return;
    throw new Error('Invalid workspace layout save response from background.');
  }

  async remove(hostname: string): Promise<void> {
    const response = await sendRuntimeMessage(createDeleteWorkspaceLayoutMessage(hostname));
    if (response === null || isDeleteWorkspaceLayoutResultMessage(response)) return;
    throw new Error('Invalid workspace layout delete response from background.');
  }
}
