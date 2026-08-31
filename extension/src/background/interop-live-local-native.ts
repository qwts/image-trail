import * as v from 'valibot';

import { InteropTransportError, assertBoundedControlFrame } from '../core/interop/transport.js';
import type { InteropOperation } from '../core/interop/contract.js';
import {
  LIVE_LOCAL_PROTOCOL_VERSION,
  createLiveLocalBootstrapRequest,
  liveLocalBootstrapResultSchema,
  liveLocalNativeResponseSchema,
  type LiveLocalBootstrapResult,
} from './interop-live-local-protocol.js';
import { OVERLOOK_ICLOUD_NATIVE_HOST, RELEASED_IMAGE_TRAIL_EXTENSION_ID, type NativeRuntime } from './interop-icloud-client.js';

type LiveLocalRunningBootstrapResult = Extract<LiveLocalBootstrapResult, { readonly state: 'running' }>;
type LiveLocalUnavailableBootstrapState = Exclude<LiveLocalBootstrapResult['state'], 'running'> | 'missing-host' | 'unsupported';

export type LiveLocalNativeBootstrapResult =
  | LiveLocalRunningBootstrapResult
  | {
      readonly schemaVersion: 1;
      readonly state: LiveLocalUnavailableBootstrapState;
      readonly retryable?: boolean;
    };

function nativeHostMissing(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /(?:specified\s+)?native(?:\s+messaging)?\s+host.*(?:missing|not\s+found)|native host missing/iu.test(message);
}

function corrupt(message: string): InteropTransportError {
  return new InteropTransportError(message, 'corrupt', false);
}

/** Strict schema-v2 client for Overlook's signed live-local bootstrap. Expected
 * availability states are data; malformed or authority-crossing responses are
 * failures. Capability authority is returned only to the background session
 * constructor and must never enter extension storage or content messaging. */
export class OverlookLiveLocalNativeClient {
  constructor(
    private readonly releasedExtensionId = RELEASED_IMAGE_TRAIL_EXTENSION_ID,
    private readonly runtime: NativeRuntime = chrome.runtime,
  ) {}

  async bootstrap(pairingId: string, operation: InteropOperation): Promise<LiveLocalNativeBootstrapResult> {
    if (this.runtime.id !== this.releasedExtensionId) return { schemaVersion: 1, state: 'unsupported' };
    const platform = await this.runtime.getPlatformInfo();
    if (platform.os !== 'mac' && platform.os !== 'win') return { schemaVersion: 1, state: 'unsupported' };
    const request = createLiveLocalBootstrapRequest(this.releasedExtensionId, pairingId, operation);
    const nativeRequest = { schemaVersion: 2 as const, operation: 'live-local-bootstrap' as const, request };
    assertBoundedControlFrame(nativeRequest);

    let value: unknown;
    try {
      value = await this.runtime.sendNativeMessage(OVERLOOK_ICLOUD_NATIVE_HOST, nativeRequest);
    } catch (error) {
      return { schemaVersion: 1, state: nativeHostMissing(error) ? 'missing-host' : 'unavailable' };
    }
    assertBoundedControlFrame(value);

    let response: v.InferOutput<typeof liveLocalNativeResponseSchema>;
    try {
      response = v.parse(liveLocalNativeResponseSchema, value);
    } catch {
      throw corrupt('Overlook live local native response is malformed.');
    }
    if (!response.ok) {
      if (response.code === 'corrupt') throw corrupt('Overlook live local bootstrap rejected a corrupt control frame.');
      return {
        schemaVersion: 1,
        state: response.code === 'unsupported' ? 'unsupported' : 'unavailable',
        retryable: response.retryable,
      };
    }

    let result: LiveLocalBootstrapResult;
    try {
      result = v.parse(liveLocalBootstrapResultSchema, response.result);
    } catch {
      throw corrupt('Overlook live local bootstrap result is malformed.');
    }
    if (result.state !== 'running') return result;
    const capability = result.capability;
    if (
      capability.extensionId !== request.extensionId ||
      capability.pairingId !== request.pairingId ||
      capability.operation !== request.operation ||
      capability.protocolVersion !== LIVE_LOCAL_PROTOCOL_VERSION
    ) {
      throw new InteropTransportError('Overlook live local capability crossed its requested authority.', 'unsupported', false);
    }
    return result;
  }
}
