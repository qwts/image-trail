import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeTargetUrlForMessage } from '../extension/src/content/page-adapter.js';

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
