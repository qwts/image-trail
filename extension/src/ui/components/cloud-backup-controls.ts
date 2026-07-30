import { addTrustedClickListener } from './trusted-events.js';

interface CloudBackupControlState {
  readonly connectionState: 'disconnected' | 'connected' | 'busy' | 'error';
  readonly pendingOperation?: 'connecting' | 'disconnecting' | 'backing-up' | 'restoring' | undefined;
}

export function createCloudBackupButton(label: string, state: CloudBackupControlState, onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = state.pendingOperation ? cloudPendingLabel(label, state.pendingOperation) : label;
  button.classList.toggle('is-waiting', state.connectionState === 'busy');
  button.disabled = state.connectionState === 'busy';
  addTrustedClickListener(button, onClick);
  return button;
}

export function cloudConnectionLabel(state: CloudBackupControlState): string {
  if (state.connectionState === 'busy' && state.pendingOperation === 'connecting') return 'Connecting';
  if (state.connectionState === 'busy' && state.pendingOperation === 'disconnecting') return 'Disconnecting';
  if (state.connectionState === 'busy' && state.pendingOperation === 'backing-up') return 'Backing up';
  if (state.connectionState === 'busy' && state.pendingOperation === 'restoring') return 'Checking restore';
  if (state.connectionState === 'connected') return 'Connected';
  if (state.connectionState === 'error') return 'Needs attention';
  return 'Not connected';
}

function cloudPendingLabel(label: string, operation: NonNullable<CloudBackupControlState['pendingOperation']>): string {
  if (operation === 'connecting' && label === 'Connect pCloud') return 'Connecting...';
  if (operation === 'disconnecting' && label === 'Disconnect') return 'Disconnecting...';
  if (operation === 'backing-up' && label === 'Back up now') return 'Backing up...';
  if (operation === 'restoring' && label === 'Choose restore file') return 'Checking restore...';
  return label;
}
