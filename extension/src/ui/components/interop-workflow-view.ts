import type { InteropConflictAction, InteropOperation } from '../../core/interop/contract.js';
import type { InteropProviderId, InteropRuntimeAction, InteropRuntimeContext } from '../../core/interop/runtime-state.js';
import { dispatchInteropRuntime } from '../../content/interop-runtime-client.js';
import {
  INTEROP_REVIEW_LABELS,
  blockedInteropWorkflow,
  interopPhaseLabel,
  interopRecoveryLabel,
  type InteropEntryContext,
  type InteropVisibleWorkflow,
} from '../interop/visible-workflow.js';

export interface InteropWorkflowHandlers {
  readonly onClose: () => void;
  readonly onOperationChange?: (operation: InteropOperation) => void;
  readonly onProviderChange?: (provider: InteropProviderId) => void;
  readonly onConnect?: () => void;
  readonly onImportPairing?: (fileContent: string, password: string) => void;
  readonly onStart?: () => void;
  readonly onPause?: () => void;
  readonly onResume?: () => void;
  readonly onCancel?: () => void;
  readonly onReconnect?: () => void;
  readonly onDisconnect?: () => void;
  readonly onConflict?: (interopId: string, action: InteropConflictAction, applyToAll: boolean) => void;
}

const REVIEW_KEYS = ['eligible', 'duplicate', 'conflict', 'metadataOnly', 'unsupported', 'skipped'] as const;
const FOCUSABLE_CONTROL_SELECTOR = 'button:not(:disabled), input:not(:disabled), [tabindex]';

function button(label: string, onClick: (() => void) | undefined, disabled = false): HTMLButtonElement {
  const control = document.createElement('button');
  control.type = 'button';
  control.textContent = label;
  control.disabled = disabled || onClick === undefined;
  if (onClick) control.addEventListener('click', onClick);
  return control;
}

function lockedWorkflow(handlers: InteropWorkflowHandlers): HTMLElement {
  const locked = document.createElement('section');
  locked.className = 'image-trail-interop image-trail-interop--locked';
  locked.setAttribute('aria-label', 'Transfer and Sync locked');
  const title = document.createElement('h3');
  title.textContent = 'Transfer & Sync is locked';
  const copy = document.createElement('p');
  copy.textContent =
    'Unlock Image Trail to review protected records. No thumbnails, names, counts, or provider details are shown while locked.';
  locked.append(title, copy, button('Close', handlers.onClose));
  return locked;
}

function createSummary(state: InteropVisibleWorkflow, handlers: InteropWorkflowHandlers): readonly HTMLElement[] {
  const header = document.createElement('header');
  const title = document.createElement('h3');
  title.textContent = state.operation === 'move' ? 'Move to Overlook' : 'Sync with Overlook';
  const context = document.createElement('p');
  context.className = 'image-trail-interop__context';
  context.textContent = `${state.entry.replace('-', ' ')} · ${interopPhaseLabel(state.phase)}`;
  header.append(title, context);
  const operation = document.createElement('div');
  operation.className = 'image-trail-interop__segmented';
  operation.setAttribute('aria-label', 'Transfer operation');
  for (const value of ['move', 'sync'] as const) {
    const control = button(
      value === 'move' ? 'Move' : 'Sync',
      () => handlers.onOperationChange?.(value),
      handlers.onOperationChange === undefined,
    );
    control.setAttribute('aria-pressed', String(state.operation === value));
    operation.append(control);
  }
  const provider = document.createElement('div');
  provider.className = 'image-trail-interop__provider';
  const label = document.createElement('strong');
  label.textContent = state.provider.label;
  const status = document.createElement('span');
  status.textContent = `${state.provider.state.replace('-', ' ')} · pairing ${state.pairing}`;
  const detail = document.createElement('p');
  detail.textContent = state.provider.detail;
  provider.append(label, status, detail);
  return [header, operation, provider];
}

function createProviderSetup(state: InteropVisibleWorkflow, handlers: InteropWorkflowHandlers): HTMLElement {
  const setup = document.createElement('fieldset');
  setup.className = 'image-trail-interop__setup';
  const legend = document.createElement('legend');
  legend.textContent = 'Provider and pairing';
  const provider = document.createElement('select');
  provider.setAttribute('aria-label', 'Transfer provider');
  for (const [value, label] of [
    ['pcloud', 'pCloud'],
    ['google-drive', 'Google Drive'],
    ['icloud-drive', 'iCloud Drive'],
  ] as const) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    option.selected = state.provider.id === value;
    provider.append(option);
  }
  provider.disabled = handlers.onProviderChange === undefined;
  provider.addEventListener('change', () => handlers.onProviderChange?.(provider.value as InteropProviderId));
  const connectLabel = state.provider.state === 'reconnect-required' ? 'Reconnect provider' : 'Connect provider';
  const connect = button(
    connectLabel,
    handlers.onConnect,
    state.provider.id === 'pcloud' || ['connected', 'unavailable'].includes(state.provider.state),
  );
  const file = document.createElement('input');
  file.type = 'file';
  file.accept = 'application/json,.json';
  file.setAttribute('aria-label', 'Overlook pairing key');
  const password = document.createElement('input');
  password.type = 'password';
  password.autocomplete = 'off';
  password.placeholder = 'Pairing key password';
  password.setAttribute('aria-label', 'Pairing key password');
  const importButton = button('Import pairing key', () => {
    const selected = file.files?.[0];
    if (!selected || password.value === '') return;
    void selected.text().then((fileContent) => handlers.onImportPairing?.(fileContent, password.value));
  });
  setup.append(legend, provider, connect, file, password, importButton);
  return setup;
}

function createReviewAndProgress(state: InteropVisibleWorkflow): readonly HTMLElement[] {
  const review = document.createElement('dl');
  review.className = 'image-trail-interop__review';
  for (const key of REVIEW_KEYS) {
    const term = document.createElement('dt');
    term.textContent = INTEROP_REVIEW_LABELS[key];
    const value = document.createElement('dd');
    value.textContent = String(state.counts[key]);
    review.append(term, value);
  }
  const progress = document.createElement('div');
  progress.className = 'image-trail-interop__progress';
  const label = document.createElement('div');
  label.textContent = `${state.processed} / ${state.counts.total} processed · ${state.counts.acknowledged} acknowledged · ${state.counts.finalized} finalized`;
  const meter = document.createElement('progress');
  meter.max = Math.max(1, state.counts.total);
  meter.value = Math.min(state.processed, state.counts.total);
  progress.append(label, meter);
  return [review, progress];
}

function createConflicts(state: InteropVisibleWorkflow, handlers: InteropWorkflowHandlers): HTMLElement {
  const conflicts = document.createElement('div');
  conflicts.className = 'image-trail-interop__conflicts';
  for (const conflict of state.conflicts) {
    const row = document.createElement('fieldset');
    const legend = document.createElement('legend');
    legend.textContent = `${conflict.label} · ${conflict.fields.join(', ')}`;
    const apply = document.createElement('input');
    apply.type = 'checkbox';
    apply.id = `interop-apply-${conflict.interopId}`;
    const applyLabel = document.createElement('label');
    applyLabel.htmlFor = apply.id;
    applyLabel.textContent = 'Apply to all conflicts';
    row.append(
      legend,
      button('Keep Image Trail', () => handlers.onConflict?.(conflict.interopId, 'keep-image-trail', apply.checked)),
      button('Keep Overlook', () => handlers.onConflict?.(conflict.interopId, 'keep-overlook', apply.checked)),
      button('Keep both', () => handlers.onConflict?.(conflict.interopId, 'keep-both', apply.checked)),
      apply,
      applyLabel,
    );
    conflicts.append(row);
  }
  return conflicts;
}

function createErrorAndControls(state: InteropVisibleWorkflow, handlers: InteropWorkflowHandlers): readonly HTMLElement[] {
  const error = document.createElement('div');
  error.className = 'image-trail-interop__error';
  if (state.error) {
    error.setAttribute('role', 'alert');
    error.textContent = `${state.error.code.replaceAll('-', ' ')} · ${state.error.message}`;
    const recoveryHandler = interopRecoveryLabel(state.error.code) === 'Resume' ? handlers.onResume : handlers.onReconnect;
    error.append(button(interopRecoveryLabel(state.error.code), recoveryHandler, !state.error.retryable));
  }
  const controls = document.createElement('footer');
  controls.append(
    button('Close', handlers.onClose),
    button('Disconnect', handlers.onDisconnect, state.provider.state !== 'connected'),
    button('Cancel', handlers.onCancel, !['transferring', 'paused', 'awaiting-acknowledgement'].includes(state.phase)),
    button('Pause', handlers.onPause, state.phase !== 'transferring'),
    button('Resume', handlers.onResume, state.phase !== 'paused'),
    button(
      state.operation === 'move' ? 'Start move' : 'Start sync',
      handlers.onStart,
      state.provider.state !== 'connected' || state.pairing !== 'paired' || !['queued', 'reviewing'].includes(state.phase),
    ),
  );
  return [error, controls];
}

export function createInteropWorkflowView(state: InteropVisibleWorkflow, handlers: InteropWorkflowHandlers): HTMLElement {
  if (state.locked) return lockedWorkflow(handlers);
  const root = document.createElement('section');
  root.className = 'image-trail-interop';
  root.dataset['phase'] = state.phase;
  root.setAttribute('aria-live', 'polite');

  root.append(
    ...createSummary(state, handlers),
    createProviderSetup(state, handlers),
    ...createReviewAndProgress(state),
    createConflicts(state, handlers),
    ...createErrorAndControls(state, handlers),
  );
  return root;
}

function trapInteropFocus(scrim: HTMLElement, close: () => void): void {
  scrim.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') close();
    if (event.key !== 'Tab') return;
    const controls = Array.from(scrim.querySelectorAll<HTMLElement>(FOCUSABLE_CONTROL_SELECTOR));
    const first = controls[0];
    const last = controls.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && event.target === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && event.target === last) {
      event.preventDefault();
      first.focus();
    }
  });
}

export function openInteropWorkflow(entry: InteropEntryContext, total: number, locked = false): void {
  let focused = document.activeElement;
  while (focused instanceof HTMLElement && focused.shadowRoot?.activeElement instanceof HTMLElement) {
    focused = focused.shadowRoot.activeElement;
  }
  const previousFocus = focused instanceof HTMLElement ? focused : null;
  const activeRoot = previousFocus?.getRootNode();
  const modalParent = activeRoot instanceof ShadowRoot ? activeRoot : document.body;
  const panelRoots = Array.from(modalParent.querySelectorAll<HTMLElement>('.image-trail-panel-root')).map((root) => ({
    root,
    inert: root.inert,
    pointerEvents: root.style.pointerEvents,
  }));
  for (const { root } of panelRoots) {
    root.inert = true;
    root.style.pointerEvents = 'none';
  }
  const scrim = document.createElement('div');
  scrim.className = 'image-trail-interop-scrim';
  scrim.setAttribute('role', 'dialog');
  scrim.setAttribute('aria-modal', 'true');
  scrim.setAttribute('aria-label', 'Transfer and Sync');
  const close = (): void => {
    scrim.remove();
    for (const { root, inert, pointerEvents } of panelRoots) {
      root.inert = inert;
      root.style.pointerEvents = pointerEvents;
    }
    if (previousFocus?.isConnected) previousFocus.focus();
  };
  const context: InteropRuntimeContext = { entry, total, locked };
  let latestRequest = 0;
  const dispatch = async (action: InteropRuntimeAction): Promise<void> => {
    const request = ++latestRequest;
    const result = await dispatchInteropRuntime(context, action);
    if (result && request === latestRequest && scrim.isConnected) render(result.snapshot);
  };
  const handlers: InteropWorkflowHandlers = {
    onClose: close,
    onOperationChange: (operation) => void dispatch({ name: 'set-operation', operation }),
    onProviderChange: (provider) => void dispatch({ name: 'select-provider', provider }),
    onConnect: () => void dispatch({ name: 'connect' }),
    onImportPairing: (fileContent, password) => void dispatch({ name: 'import-pairing', fileContent, password }),
    onStart: () => void dispatch({ name: 'start' }),
    onPause: () => void dispatch({ name: 'pause' }),
    onResume: () => void dispatch({ name: 'resume' }),
    onCancel: () => void dispatch({ name: 'cancel' }),
    onReconnect: () => void dispatch({ name: 'reconnect' }),
    onDisconnect: () => void dispatch({ name: 'disconnect' }),
    onConflict: (interopId, action, applyToAll) => void dispatch({ name: 'resolve-conflict', interopId, action, applyToAll }),
  };
  const render = (state: InteropVisibleWorkflow): void => {
    scrim.replaceChildren(createInteropWorkflowView(state, handlers));
  };
  render(blockedInteropWorkflow(entry, total, locked));
  scrim.addEventListener('click', (event) => {
    if (event.target === scrim) close();
  });
  trapInteropFocus(scrim, close);
  modalParent.append(scrim);
  scrim.querySelector<HTMLElement>(FOCUSABLE_CONTROL_SELECTOR)?.focus();
  if (!locked) void dispatch({ name: 'status' });
}
