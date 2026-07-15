import {
  createDeleteWorkspaceLayoutMessage,
  createLoadWorkspaceLayoutMessage,
  createSaveWorkspaceLayoutMessage,
  isDeleteWorkspaceLayoutResultMessage,
  isLoadWorkspaceLayoutResultMessage,
  isSaveWorkspaceLayoutResultMessage,
} from '../background/messages.js';
import type { WorkspaceLayoutScope } from '../core/workspace-layout.js';
import type { StoredWorkspaceLayout, WorkspaceLayoutStore } from '../core/types.js';
import { sendRuntimeMessage } from './runtime-message.js';

export class ExtensionWorkspaceLayoutStore implements WorkspaceLayoutStore {
  async load(scope: WorkspaceLayoutScope): Promise<StoredWorkspaceLayout | null> {
    const response = await sendRuntimeMessage(createLoadWorkspaceLayoutMessage(scope));
    return isLoadWorkspaceLayoutResultMessage(response) && response.payload.ok ? response.payload.layout : null;
  }

  async save(scope: WorkspaceLayoutScope, layout: StoredWorkspaceLayout): Promise<void> {
    const response = await sendRuntimeMessage(createSaveWorkspaceLayoutMessage(scope, layout));
    if (response === null || isSaveWorkspaceLayoutResultMessage(response)) return;
    throw new Error('Invalid workspace layout save response from background.');
  }

  async remove(scope: WorkspaceLayoutScope): Promise<void> {
    const response = await sendRuntimeMessage(createDeleteWorkspaceLayoutMessage(scope));
    if (response === null || isDeleteWorkspaceLayoutResultMessage(response)) return;
    throw new Error('Invalid workspace layout delete response from background.');
  }
}
