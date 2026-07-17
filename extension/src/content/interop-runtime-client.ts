import { createInteropRuntimeMessage, isInteropRuntimeResultMessage } from '../background/interop-runtime-messages.js';
import type { InteropRuntimeAction, InteropRuntimeContext, InteropRuntimeResult } from '../core/interop/runtime-state.js';
import { sendRuntimeMessage } from './runtime-message.js';

export async function dispatchInteropRuntime(
  context: InteropRuntimeContext,
  action: InteropRuntimeAction,
): Promise<InteropRuntimeResult | null> {
  const response = await sendRuntimeMessage(createInteropRuntimeMessage(context, action));
  return isInteropRuntimeResultMessage(response) ? response.payload : null;
}
