import * as v from 'valibot';
import { createUnknownMessageResponse, type ExtensionRequest, type ExtensionResponse } from './messages.js';

/**
 * A single dispatched-request definition: how to handle it, how to wrap the
 * handler result into a response envelope, and what to reply with when the
 * handler rejects or the payload fails validation. One `MessageDef` per request
 * the service worker dispatches replaces one `case` in the former ~475-line switch.
 *
 * Members are declared with METHOD syntax on purpose: method parameters are
 * checked bivariantly, so a narrowly-typed entry (e.g. `MessageDef<LoadBookmarksMessage, …>`)
 * stays assignable to the erased `MessageDef<ExtensionRequest, ExtensionResponse>`
 * used by the registry `satisfies` check and by {@link dispatchRequest}. Rewriting
 * these as arrow properties would make the parameters contravariant under
 * `strictFunctionTypes` and break both. Keep them as methods.
 *
 * `requestSchema` validates `message.payload` before {@link dispatchRequest} calls
 * `handle`. It is typed to the entry's own payload, so wiring the wrong schema to
 * an entry is a compile error; `GenericSchema` is covariant in its output, so a
 * narrow entry still assigns to the erased `AnyMessageDef` used by the registry.
 */
export interface MessageDef<Req extends ExtensionRequest, Res extends ExtensionResponse, Result = unknown> {
  handle(message: Req): Promise<Result>;
  respond(result: Result): Res;
  fallback(message: Req): Res;
  requestSchema: v.GenericSchema<unknown, Req['payload']>;
}

/** Identity helper that captures each entry's `Req`/`Res`/`Result` for precise inference. */
export function defineMessage<Req extends ExtensionRequest, Res extends ExtensionResponse, Result>(
  def: MessageDef<Req, Res, Result>,
): MessageDef<Req, Res, Result> {
  return def;
}

type AnyMessageDef = MessageDef<ExtensionRequest, ExtensionResponse, unknown>;

/** Replies with the entry's fallback, degrading to an Unknown response if the fallback itself throws. */
function respondWithFallback(entry: AnyMessageDef, message: ExtensionRequest, sendResponse: (response: ExtensionResponse) => void): void {
  try {
    sendResponse(entry.fallback(message));
  } catch (error) {
    console.warn(`Image Trail fallback for ${message.type} failed.`, error);
    sendResponse(createUnknownMessageResponse(`Request ${message.type} could not be processed.`));
  }
}

/**
 * Generic replacement for the old `switch (message.type)` dispatcher. Looks the
 * request up in the registry, validates `message.payload` against the entry's
 * `requestSchema`, runs its handler, and replies with the wrapped result — or the
 * entry's fallback if the payload is malformed or the handler rejects (no exception
 * escapes the boundary). Returns `true` for a dispatched request (keeping the
 * `sendResponse` channel open, exactly like every former `case … return true`) and
 * `false` for an unregistered type (Toggle/Ping and anything else), matching the
 * former `default: return false`.
 */
export function dispatchRequest(
  registry: Partial<Record<ExtensionRequest['type'], AnyMessageDef>>,
  message: ExtensionRequest,
  sendResponse: (response: ExtensionResponse) => void,
): boolean {
  const entry = registry[message.type];
  if (!entry) return false;
  if (!v.safeParse(entry.requestSchema, message.payload).success) {
    console.warn(`Image Trail rejected a malformed ${message.type} payload.`);
    respondWithFallback(entry, message, sendResponse);
    return true;
  }
  entry
    .handle(message)
    .then((result) => sendResponse(entry.respond(result)))
    .catch(() => respondWithFallback(entry, message, sendResponse));
  return true;
}
