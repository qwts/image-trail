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
  readonly onImportPairing?: () => void;
  readonly onStart?: () => void;
  readonly onPause?: () => void;
  readonly onResume?: () => void;
  readonly onCancel?: () => void;
  readonly onReconnect?: () => void;
  readonly onRetryCheck?: () => void;
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
  const connect = button(connectLabel, handlers.onConnect, ['connected', 'unavailable'].includes(state.provider.state));
  const importHelp = document.createElement('p');
  importHelp.className = 'image-trail-interop__pairing-help';
  importHelp.textContent = 'Import pairing keys in an extension-owned page so the visited site cannot inspect the file or password.';
  const importButton = button('Open secure pairing import', handlers.onImportPairing);
  setup.append(legend, provider, connect, importHelp, importButton);
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
    const recoveryLabel = interopRecoveryLabel(state.error.code);
    const recoveryHandler =
      recoveryLabel === 'Resume' ? handlers.onResume : recoveryLabel === 'Reconnect' ? handlers.onReconnect : handlers.onRetryCheck;
    error.append(button(recoveryLabel, recoveryHandler, !state.error.retryable));
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

type InteropWorkflowDispatch = (action: InteropRuntimeAction, renderResult?: boolean) => ReturnType<typeof dispatchInteropRuntime>;

function createProviderRecovery(
  scrim: HTMLElement,
  dispatch: InteropWorkflowDispatch,
  render: (state: InteropVisibleWorkflow) => void,
  selectedProvider: () => InteropProviderId,
  getLatestRequest: () => number,
) {
  let refreshPairingOnFocus = false;
  let actionPending = false;
  let replyLost = false;
  let focusObserved = false;
  let probeTimer: ReturnType<typeof setTimeout> | undefined;
  const probe = (attempt = 0): void => {
    if (!actionPending || !scrim.isConnected) return;
    const probeRequest = getLatestRequest() + 1;
    void dispatch({ name: 'status' }, false).then((result) => {
      if (!actionPending || !scrim.isConnected) return;
      if (probeRequest !== getLatestRequest()) return;
      const state = result?.snapshot.provider.state;
      const transient = result === null || state === 'connecting' || state === 'disconnected';
      if (transient) {
        if (attempt < 2) {
          probeTimer = setTimeout(() => probe(attempt + 1), 100);
          return;
        }
        return;
      }
      if (result) render(result.snapshot);
      actionPending = false;
      replyLost = false;
    });
  };
  const onFocus = (): void => {
    if (!scrim.isConnected) return;
    if (actionPending) {
      focusObserved = true;
      if (replyLost) probe();
      return;
    }
    if (!refreshPairingOnFocus) return;
    refreshPairingOnFocus = false;
    void dispatch({ name: 'status' });
  };
  const connect = (name: 'connect' | 'reconnect'): void => {
    if (actionPending) return;
    actionPending = true;
    replyLost = false;
    focusObserved = false;
    void dispatch({ name, provider: selectedProvider() }).then((result) => {
      if (result !== null) {
        actionPending = false;
        return;
      }
      replyLost = true;
      if (focusObserved) probe();
    });
  };
  window.addEventListener('focus', onFocus);
  return {
    connect,
    expectPairingReturn: () => {
      refreshPairingOnFocus = true;
    },
    dispose: () => {
      window.removeEventListener('focus', onFocus);
      if (probeTimer) clearTimeout(probeTimer);
    },
  };
}

export function openInteropWorkflow(entry: InteropEntryContext, recordIds: readonly string[], locked = false, anchor?: Element): void {
  let focused = document.activeElement;
  while (focused instanceof HTMLElement && focused.shadowRoot?.activeElement instanceof HTMLElement) {
    focused = focused.shadowRoot.activeElement;
  }
  const previousFocus = anchor instanceof HTMLElement ? anchor : focused instanceof HTMLElement ? focused : null;
  // Production panels keep their shadow root closed, so the activeElement walk stops at the
  // shadow host; only the opener control's own root node still reaches inside the panel.
  const anchorRoot = anchor?.getRootNode();
  const activeRoot = anchorRoot instanceof ShadowRoot ? anchorRoot : previousFocus?.getRootNode();
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
  scrim.className = 'image-trail-interop-scrim image-trail-panel-root';
  scrim.setAttribute('role', 'dialog');
  scrim.setAttribute('aria-modal', 'true');
  scrim.setAttribute('aria-label', 'Transfer and Sync');
  const context: InteropRuntimeContext = { entry, total: recordIds.length, recordIds, locked };
  let selectedProvider: InteropProviderId = 'pcloud';
  function render(state: InteropVisibleWorkflow): void {
    selectedProvider = state.provider.id;
    scrim.replaceChildren(createInteropWorkflowView(state, handlers));
  }
  let latestRequest = 0;
  const dispatch = async (action: InteropRuntimeAction, renderResult = true) => {
    const request = ++latestRequest;
    const result = await dispatchInteropRuntime(context, action);
    if (renderResult && result && request === latestRequest && scrim.isConnected) render(result.snapshot);
    return result;
  };
  const providerRecovery = createProviderRecovery(
    scrim,
    dispatch,
    render,
    () => selectedProvider,
    () => latestRequest,
  );
  const close = (): void => {
    providerRecovery.dispose();
    scrim.remove();
    for (const { root, inert, pointerEvents } of panelRoots) {
      root.inert = inert;
      root.style.pointerEvents = pointerEvents;
    }
    if (previousFocus?.isConnected) previousFocus.focus();
  };
  const handlers: InteropWorkflowHandlers = {
    onClose: close,
    onOperationChange: (operation) => void dispatch({ name: 'set-operation', operation }),
    onProviderChange: (provider) => {
      selectedProvider = provider;
      void dispatch({ name: 'select-provider', provider });
    },
    onConnect: () => providerRecovery.connect('connect'),
    onImportPairing: () => {
      providerRecovery.expectPairingReturn();
      void dispatch({ name: 'open-pairing-import' });
    },
    onStart: () => void dispatch({ name: 'start' }),
    onPause: () => void dispatch({ name: 'pause' }),
    onResume: () => void dispatch({ name: 'resume' }),
    onCancel: () => void dispatch({ name: 'cancel' }),
    onReconnect: () => providerRecovery.connect('reconnect'),
    onRetryCheck: () => void dispatch({ name: 'status' }),
    onDisconnect: () => void dispatch({ name: 'disconnect' }),
    onConflict: (interopId, action, applyToAll) => void dispatch({ name: 'resolve-conflict', interopId, action, applyToAll }),
  };
  render(blockedInteropWorkflow(entry, recordIds.length, locked));
  scrim.addEventListener('click', (event) => {
    if (event.target === scrim) close();
  });
  trapInteropFocus(scrim, close);
  modalParent.append(scrim);
  scrim.querySelector<HTMLElement>(FOCUSABLE_CONTROL_SELECTOR)?.focus();
  if (!locked) void dispatch({ name: 'status' });
}
