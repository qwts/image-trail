import type { InteropRuntime } from '../interop-runtime.js';
import { defineMessage, type MessageDef } from '../message-dispatch.js';
import * as requestSchemas from '../message-schemas.js';
import { createUnknownMessageResponse, MessageType, type ExtensionRequest, type ExtensionResponse } from '../messages.js';
import { createInteropRuntimeResultMessage, type InteropRuntimeMessage } from '../interop-runtime-messages.js';
import type { InteropRuntimeAction, InteropRuntimeResult } from '../../core/interop/runtime-state.js';

type Registry = Record<typeof MessageType.InteropRuntime, MessageDef<ExtensionRequest, ExtensionResponse>>;
const FEATURE_DISABLED_REASON = 'Transfer & Sync is not enabled in this build.';

export function createDisabledInteropRuntimeMessageRegistry(): Registry {
  return {
    [MessageType.InteropRuntime]: defineMessage({
      requestSchema: requestSchemas.interopRuntimeRequestSchema,
      handle: () => Promise.reject(new Error(FEATURE_DISABLED_REASON)),
      respond: () => createUnknownMessageResponse(FEATURE_DISABLED_REASON),
      fallback: () => createUnknownMessageResponse(FEATURE_DISABLED_REASON),
    }),
  };
}

export function createInteropRuntimeMessageRegistry(
  runtime: InteropRuntime,
  preflight: (action: InteropRuntimeAction) => Promise<void> = () => Promise.resolve(),
  openPairingImport: () => Promise<void> = () => Promise.reject(new Error('Pairing import page is unavailable.')),
): Registry {
  return {
    [MessageType.InteropRuntime]: defineMessage({
      requestSchema: requestSchemas.interopRuntimeRequestSchema,
      handle: async (message: InteropRuntimeMessage): Promise<InteropRuntimeResult> => {
        const { action, context } = message.payload;
        await preflight(action);
        if (action.name === 'open-pairing-import') {
          await openPairingImport();
          return runtime.dispatch(context, { name: 'status' });
        }
        return runtime.dispatch(context, action);
      },
      respond: (payload) => createInteropRuntimeResultMessage(payload),
      fallback: (message) => createInteropRuntimeResultMessage(runtime.fallback(message.payload.context)),
    }),
  };
}
