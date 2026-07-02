import test from 'node:test';
import assert from 'node:assert/strict';
import * as v from 'valibot';
import { defineMessage, dispatchRequest } from '../extension/src/background/message-dispatch.js';
import {
  MESSAGE_PROTOCOL_VERSION,
  MessageType,
  createPingMessage,
  createStatusMessage,
  createTogglePanelMessage,
} from '../extension/src/background/messages.js';
import type { PingMessage, StatusMessage } from '../extension/src/background/messages.js';

const flushMicrotasks = () => new Promise((resolve) => setTimeout(resolve, 0));

function registryWith(handle: () => Promise<string>, options: { readonly fallbackThrows?: boolean } = {}) {
  return {
    [MessageType.Ping]: defineMessage<PingMessage, StatusMessage, string>({
      requestSchema: v.object({ sentAt: v.number() }),
      handle,
      respond: (result) => createStatusMessage(true, result),
      fallback: () => {
        if (options.fallbackThrows) throw new Error('fallback blew up');
        return createStatusMessage(false, 'fallback');
      },
    }),
  };
}

// A Ping request whose payload violates `requestSchema` (sentAt must be a number).
const malformedPing = { type: MessageType.Ping, version: MESSAGE_PROTOCOL_VERSION, payload: { sentAt: 'nope' } } as unknown as PingMessage;

test('dispatchRequest runs the handler, wraps the result with respond, and returns true', async () => {
  let sent: StatusMessage | undefined;
  const registry = registryWith(async () => 'handled');

  const kept = dispatchRequest(registry, createPingMessage(), (response) => {
    sent = response as StatusMessage;
  });

  assert.equal(kept, true); // keeps the sendResponse channel open, like the former `case … return true`
  await flushMicrotasks();
  assert.equal(sent?.type, MessageType.Status);
  assert.equal(sent?.payload.panelVisible, true);
  assert.equal(sent?.payload.status, 'handled');
});

test('dispatchRequest replies with the entry fallback when the handler rejects', async () => {
  let sent: StatusMessage | undefined;
  const registry = registryWith(async () => {
    throw new Error('handler blew up');
  });

  const kept = dispatchRequest(registry, createPingMessage(), (response) => {
    sent = response as StatusMessage;
  });

  assert.equal(kept, true);
  await flushMicrotasks();
  assert.equal(sent?.payload.panelVisible, false);
  assert.equal(sent?.payload.status, 'fallback');
});

test('dispatchRequest routes a synchronous handler throw to the fallback (no exception escapes)', async () => {
  let sent: StatusMessage | undefined;
  // A non-async handle that throws before returning its Promise must not escape the boundary.
  const registry = {
    [MessageType.Ping]: defineMessage<PingMessage, StatusMessage, string>({
      requestSchema: v.object({ sentAt: v.number() }),
      handle: (): Promise<string> => {
        throw new Error('synchronous handler blew up');
      },
      respond: (result) => createStatusMessage(true, result),
      fallback: () => createStatusMessage(false, 'fallback'),
    }),
  };

  let kept: boolean | undefined;
  assert.doesNotThrow(() => {
    kept = dispatchRequest(registry, createPingMessage(), (response) => {
      sent = response as StatusMessage;
    });
  });

  assert.equal(kept, true);
  await flushMicrotasks();
  assert.equal(sent?.payload.panelVisible, false);
  assert.equal(sent?.payload.status, 'fallback');
});

test('dispatchRequest rejects a malformed payload with the fallback and never calls the handler', async () => {
  let sent: StatusMessage | undefined;
  let handlerCalled = false;
  const registry = registryWith(async () => {
    handlerCalled = true;
    return 'handled';
  });

  const kept = dispatchRequest(registry, malformedPing, (response) => {
    sent = response as StatusMessage;
  });

  assert.equal(kept, true); // still keeps the channel open, exactly like a dispatched request
  await flushMicrotasks();
  assert.equal(handlerCalled, false);
  assert.equal(sent?.payload.panelVisible, false);
  assert.equal(sent?.payload.status, 'fallback');
});

test('dispatchRequest degrades to an Unknown response when the fallback itself throws', async () => {
  let sent: { type?: unknown; payload?: { reason?: unknown } } | undefined;
  const registry = registryWith(async () => 'handled', { fallbackThrows: true });

  const kept = dispatchRequest(registry, malformedPing, (response) => {
    sent = response as { type?: unknown; payload?: { reason?: unknown } };
  });

  assert.equal(kept, true);
  await flushMicrotasks();
  assert.equal(sent?.type, MessageType.Unknown);
  assert.equal(typeof sent?.payload?.reason, 'string');
});

test('dispatchRequest returns false and never responds for an unregistered request type', async () => {
  let responded = false;
  const registry = registryWith(async () => 'handled');

  // TogglePanel has no registry entry (handled by the content script), matching the former `default: return false`.
  const kept = dispatchRequest(registry, createTogglePanelMessage(), () => {
    responded = true;
  });

  assert.equal(kept, false);
  await flushMicrotasks();
  assert.equal(responded, false);
});
