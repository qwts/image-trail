import test from 'node:test';
import assert from 'node:assert/strict';
import { isEventFromImageTrailPanel, summarizeTargetUrlForMessage } from '../extension/src/content/page-adapter.js';

test('target auto-select messages do not expose data URLs', () => {
  const dataUrl = `data:image/png;base64,${'a'.repeat(20_000)}`;

  assert.equal(summarizeTargetUrlForMessage(dataUrl), 'data URL');
});

test('target auto-select messages constrain long URLs', () => {
  const url = `https://example.test/image.jpg?payload=${'a'.repeat(20_000)}`;
  const summary = summarizeTargetUrlForMessage(url);

  assert.ok(summary.length <= 180);
  assert.ok(summary.endsWith('…'));
  assert.ok(summary.startsWith('https://example.test/image.jpg?payload='));
});

test('grab panel guard detects shadow DOM events retargeted to the panel host', () => {
  const button = { tagName: 'BUTTON' };
  const host = { id: 'image-trail-panel-root', tagName: 'DIV' };

  assert.equal(
    isEventFromImageTrailPanel({
      target: host,
      composedPath: () => [button, host],
    } as unknown as Event),
    true,
  );
});

test('grab panel guard detects light DOM descendants and ignores page targets', () => {
  const panelChild = {
    closest: (selector: string) => (selector === '#image-trail-panel-root' ? { id: 'image-trail-panel-root' } : null),
  };
  const pageTarget = {
    closest: () => null,
  };

  assert.equal(isEventFromImageTrailPanel({ target: panelChild } as unknown as Event), true);
  assert.equal(isEventFromImageTrailPanel({ target: pageTarget } as unknown as Event), false);
});
