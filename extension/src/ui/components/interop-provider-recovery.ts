import type { InteropProviderId, InteropRuntimeAction } from '../../core/interop/runtime-state.js';
import type { dispatchInteropRuntime } from '../../content/interop-runtime-client.js';
import type { InteropVisibleWorkflow } from '../interop/visible-workflow.js';

type InteropWorkflowDispatch = (action: InteropRuntimeAction, renderResult?: boolean) => ReturnType<typeof dispatchInteropRuntime>;

interface ProviderRecoveryOptions {
  readonly scrim: HTMLElement;
  readonly dispatch: InteropWorkflowDispatch;
  readonly render: (state: InteropVisibleWorkflow) => void;
  readonly visibleState: () => InteropVisibleWorkflow;
  readonly selectedProvider: () => InteropProviderId;
  readonly latestRequest: () => number;
}

function renderConnecting(options: ProviderRecoveryOptions): void {
  const state = options.visibleState();
  options.render({
    ...state,
    provider: {
      ...state.provider,
      state: 'connecting',
      detail:
        options.selectedProvider() === 'icloud-drive'
          ? 'Checking Overlook on this computer…'
          : 'Connecting to the selected cloud provider…',
    },
    error: null,
  });
}

function renderReplyLost(options: ProviderRecoveryOptions): void {
  const state = options.visibleState();
  const message =
    options.selectedProvider() === 'icloud-drive'
      ? 'The local connection check was interrupted. Retry the check.'
      : 'The cloud connection check was interrupted. Retry the check.';
  options.render({
    ...state,
    provider: { ...state.provider, state: 'unavailable', detail: message },
    error: { code: 'provider-unavailable', message, retryable: true },
  });
}

export function createInteropProviderRecovery(options: ProviderRecoveryOptions) {
  let refreshPairingOnFocus = false;
  let actionPending = false;
  let replyLost = false;
  let focusObserved = false;
  let probeTimer: ReturnType<typeof setTimeout> | undefined;
  const probe = (attempt = 0): void => {
    if (!actionPending || !options.scrim.isConnected) return;
    const probeRequest = options.latestRequest() + 1;
    void options.dispatch({ name: 'status' }, false).then((result) => {
      if (!actionPending || !options.scrim.isConnected || probeRequest !== options.latestRequest()) return;
      const state = result?.snapshot.provider.state;
      if (result === null || state === 'connecting' || state === 'disconnected') {
        if (attempt < 2) {
          probeTimer = setTimeout(() => probe(attempt + 1), 100);
          return;
        }
        renderReplyLost(options);
      } else if (result) options.render(result.snapshot);
      actionPending = false;
      replyLost = false;
    });
  };
  const onFocus = (): void => {
    if (!options.scrim.isConnected) return;
    if (actionPending) {
      focusObserved = true;
      if (replyLost) probe();
      return;
    }
    if (!refreshPairingOnFocus) return;
    refreshPairingOnFocus = false;
    void options.dispatch({ name: 'status' });
  };
  const connect = (name: 'connect' | 'reconnect'): void => {
    if (actionPending) return;
    actionPending = true;
    replyLost = false;
    focusObserved = false;
    renderConnecting(options);
    void options.dispatch({ name, provider: options.selectedProvider() }).then((result) => {
      if (result !== null) {
        actionPending = false;
        return;
      }
      replyLost = true;
      if (options.selectedProvider() === 'icloud-drive' || focusObserved) probe();
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
