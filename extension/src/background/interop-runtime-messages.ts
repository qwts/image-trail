import type { InteropRuntimeAction, InteropRuntimeContext, InteropRuntimeResult } from '../core/interop/runtime-state.js';
import { MESSAGE_PROTOCOL_VERSION, MessageType, hasVersionedObjectShape } from './message-protocol.js';

export interface InteropRuntimeMessage {
  readonly type: typeof MessageType.InteropRuntime;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: {
    readonly context: InteropRuntimeContext;
    readonly action: InteropRuntimeAction;
  };
}

export interface InteropRuntimeResultMessage {
  readonly type: typeof MessageType.InteropRuntimeResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: InteropRuntimeResult;
}

export function createInteropRuntimeMessage(context: InteropRuntimeContext, action: InteropRuntimeAction): InteropRuntimeMessage {
  return { type: MessageType.InteropRuntime, version: MESSAGE_PROTOCOL_VERSION, payload: { context, action } };
}

export function createInteropRuntimeResultMessage(payload: InteropRuntimeResult): InteropRuntimeResultMessage {
  return { type: MessageType.InteropRuntimeResult, version: MESSAGE_PROTOCOL_VERSION, payload };
}

export function isInteropRuntimeResultMessage(value: unknown): value is InteropRuntimeResultMessage {
  return hasVersionedObjectShape(value) && value.type === MessageType.InteropRuntimeResult;
}
