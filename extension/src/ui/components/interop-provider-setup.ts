import type { InteropProviderId } from '../../core/interop/runtime-state.js';
import type { InteropVisibleWorkflow } from '../interop/visible-workflow.js';

interface ProviderSetupHandlers {
  readonly onProviderChange?: (provider: InteropProviderId) => void;
  readonly onConnect?: () => void;
  readonly onImportPairing?: () => void;
}

function setupButton(label: string, onClick: (() => void) | undefined, disabled = false): HTMLButtonElement {
  const control = document.createElement('button');
  control.type = 'button';
  control.textContent = label;
  control.disabled = disabled || onClick === undefined;
  if (onClick) control.addEventListener('click', onClick);
  return control;
}

function option(value: InteropProviderId, label: string, selected: boolean): HTMLOptionElement {
  const control = document.createElement('option');
  control.value = value;
  control.textContent = label;
  control.selected = selected;
  return control;
}

export function createInteropProviderSetup(state: InteropVisibleWorkflow, handlers: ProviderSetupHandlers): HTMLElement {
  const setup = document.createElement('fieldset');
  setup.className = 'image-trail-interop__setup';
  const legend = document.createElement('legend');
  legend.textContent = 'Transport and pairing';
  const provider = document.createElement('select');
  provider.setAttribute('aria-label', 'Transfer provider');
  const local = document.createElement('optgroup');
  local.label = 'Same computer';
  local.append(option('icloud-drive', 'Local — Overlook on this computer', state.provider.id === 'icloud-drive'));
  const cloud = document.createElement('optgroup');
  cloud.label = 'Cloud — cross-machine';
  cloud.append(
    option('pcloud', 'pCloud', state.provider.id === 'pcloud'),
    option('google-drive', 'Google Drive', state.provider.id === 'google-drive'),
  );
  provider.append(local, cloud);
  provider.disabled = handlers.onProviderChange === undefined || state.active;
  provider.addEventListener('change', () => handlers.onProviderChange?.(provider.value as InteropProviderId));

  const transportHelp = document.createElement('p');
  transportHelp.className = 'image-trail-interop__transport-help';
  transportHelp.textContent =
    'Local asks the signed Overlook host for a short-lived same-machine connection. Cloud is an explicit cross-machine route; Image Trail never falls back automatically.';
  const route = document.createElement('p');
  route.className = 'image-trail-interop__route-lock';
  route.hidden = !state.active;
  route.textContent = `This active ${state.operation} keeps ${state.provider.label} for its ${state.counts.total}-record reviewed scope. Cancel it before choosing another transport.`;

  const connectLabel = state.provider.id === 'icloud-drive' ? 'Check local connection' : 'Connect cloud provider';
  const connectDisabled = state.provider.state === 'connected' || (state.provider.state === 'unavailable' && !state.error?.retryable);
  const importHelp = document.createElement('p');
  importHelp.className = 'image-trail-interop__pairing-help';
  importHelp.textContent =
    'Presence is separate from authorization. Import pairing keys in an extension-owned page so the visited site cannot inspect the file or password.';
  setup.append(
    legend,
    provider,
    setupButton(connectLabel, handlers.onConnect, connectDisabled),
    transportHelp,
    route,
    importHelp,
    setupButton('Open secure pairing import', handlers.onImportPairing),
  );
  return setup;
}
