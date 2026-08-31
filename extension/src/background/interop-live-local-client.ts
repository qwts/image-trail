import type { InteropObjectStore } from '../core/interop/transport.js';
import { OverlookLiveLocalNativeClient, type LiveLocalNativeBootstrapResult } from './interop-live-local-native.js';
import { createLiveLocalOpen } from './interop-live-local-protocol.js';
import {
  LiveLocalOverlookSession,
  LiveLocalSessionError,
  defaultLiveLocalSocketFactory,
  type LiveLocalConnectInput,
  type LiveLocalWebSocketFactory,
} from './interop-live-local-session.js';

export interface LiveLocalNativeBootstrapClient {
  bootstrap(pairingId: string, operation: import('../core/interop/contract.js').InteropOperation): Promise<LiveLocalNativeBootstrapResult>;
}

export type LiveLocalUnavailableState = Exclude<LiveLocalNativeBootstrapResult['state'], 'running'>;

export type LiveLocalConnectResult =
  | { readonly state: 'connected'; readonly session: LiveLocalOverlookSession; readonly store: InteropObjectStore }
  | { readonly state: LiveLocalUnavailableState; readonly retryable: boolean };

function availabilityRetryable(state: LiveLocalUnavailableState): boolean {
  return state === 'not-running' || state === 'locked' || state === 'unavailable';
}

export class LiveLocalOverlookClient {
  constructor(
    private readonly native: LiveLocalNativeBootstrapClient = new OverlookLiveLocalNativeClient(),
    private readonly socketFactory: LiveLocalWebSocketFactory = defaultLiveLocalSocketFactory,
  ) {}

  async connect(input: LiveLocalConnectInput): Promise<LiveLocalConnectResult> {
    const bootstrap = await this.native.bootstrap(input.pairingId, input.operation);
    if (bootstrap.state !== 'running') {
      return { state: bootstrap.state, retryable: bootstrap.retryable ?? availabilityRetryable(bootstrap.state) };
    }
    if (input.review.operation !== input.operation) {
      throw new LiveLocalSessionError('Live local review does not match the requested operation.', 'protocol-error', 'corrupt', false);
    }
    const open = await createLiveLocalOpen(input.operationId, input.remoteSessionId, input.review);
    const session = await LiveLocalOverlookSession.connect(bootstrap.capability, open, input, this.socketFactory);
    return { state: 'connected', session, store: session.store };
  }
}
