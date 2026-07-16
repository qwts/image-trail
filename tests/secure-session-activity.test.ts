import assert from 'node:assert/strict';
import test from 'node:test';

import { SecureSessionActivityController } from '../extension/src/content/secure-session-activity.js';

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

test('throttles pointer and keyboard activity through the extension-owned channel', async () => {
  const target = new EventTarget();
  let now = 1_000;
  let sent = 0;
  const controller = new SecureSessionActivityController({
    now: () => now,
    sendActivity: async () => {
      sent += 1;
      return { unlocked: true };
    },
    onLocked: () => assert.fail('session should remain unlocked'),
  });
  controller.connect(target);

  target.dispatchEvent(new Event('pointermove'));
  target.dispatchEvent(new Event('pointerdown'));
  target.dispatchEvent(new Event('keydown'));
  await flush();
  assert.equal(sent, 1);

  now += 14_999;
  target.dispatchEvent(new Event('pointermove'));
  await flush();
  assert.equal(sent, 1);

  now += 1;
  target.dispatchEvent(new Event('keydown'));
  await flush();
  assert.equal(sent, 2);
});

test('refreshes locked UI status and disconnects all activity listeners', async () => {
  const target = new EventTarget();
  const lockedMessages: string[] = [];
  let sent = 0;
  const controller = new SecureSessionActivityController({
    sendActivity: async () => {
      sent += 1;
      return { unlocked: false, message: 'Unlock to continue.' };
    },
    onLocked: (message) => lockedMessages.push(message),
  });
  controller.connect(target);
  target.dispatchEvent(new Event('pointerdown'));
  await flush();
  assert.deepEqual(lockedMessages, ['Unlock to continue.']);

  controller.disconnect();
  target.dispatchEvent(new Event('keydown'));
  await flush();
  assert.equal(sent, 1);
});
