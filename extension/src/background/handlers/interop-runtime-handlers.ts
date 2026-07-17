import { createChromeInteropRuntime } from '../interop-runtime-chrome.js';
import type { InteropRuntime } from '../interop-runtime.js';
import { defineMessage, type MessageDef } from '../message-dispatch.js';
import * as requestSchemas from '../message-schemas.js';
import { MessageType, type ExtensionRequest, type ExtensionResponse } from '../messages.js';
import { createInteropRuntimeResultMessage, type InteropRuntimeMessage } from '../interop-runtime-messages.js';
import type { InteropRuntimeAction, InteropRuntimeResult } from '../../core/interop/runtime-state.js';

type Registry = Record<typeof MessageType.InteropRuntime, MessageDef<ExtensionRequest, ExtensionResponse>>;

export function createInteropRuntimeMessageRegistry(
  runtime: InteropRuntime,
  preflight: (action: InteropRuntimeAction) => Promise<void> = () => Promise.resolve(),
): Registry {
  return {
    [MessageType.InteropRuntime]: defineMessage({
      requestSchema: requestSchemas.interopRuntimeRequestSchema,
      handle: (message: InteropRuntimeMessage): Promise<InteropRuntimeResult> =>
        preflight(message.payload.action).then(() => runtime.dispatch(message.payload.context, message.payload.action)),
      respond: (payload) => createInteropRuntimeResultMessage(payload),
      fallback: (message) => createInteropRuntimeResultMessage(runtime.fallback(message.payload.context)),
    }),
  };
}

export { createChromeInteropRuntime };
