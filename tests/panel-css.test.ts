import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const PANEL_CSS = readFileSync(resolve(process.cwd(), 'extension/src/ui/styles/panel.css'), 'utf8');

function cssRule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`${escaped}\\s*\\{(?<body>[^}]*)\\}`, 'u').exec(PANEL_CSS);
  assert.ok(match?.groups?.['body'], `missing CSS rule for ${selector}`);
  return match.groups['body'];
}

test('Recents list uses stable 120px rows with a one-to-three-row viewport (#446)', () => {
  const body = cssRule('.image-trail-panel-root .image-trail-panel__history-section .image-trail-panel__record-list');

  assert.match(body, /grid-auto-rows:\s*minmax\(120px,\s*max-content\);/u);
  assert.match(body, /align-content:\s*start;/u);
  assert.match(
    body,
    /--image-trail-history-viewport-size:\s*calc\(var\(--image-trail-history-row-size\) \* 3 \+ var\(--image-trail-history-row-gap\) \* 2\);/u,
  );
  assert.match(body, /max-block-size:\s*var\(--image-trail-history-viewport-size\);/u);
  assert.match(body, /overflow-y:\s*auto;/u);
});

test('user-resized Recents changes the viewport, not the row height (#446)', () => {
  const body = cssRule('.image-trail-panel-root .image-trail-panel__history-section .image-trail-panel__record-list.is-user-resized');

  assert.match(body, /block-size:\s*max\(120px,\s*var\(--image-trail-history-size\)\);/u);
  assert.match(body, /max-block-size:\s*none;/u);
});

test('Recents sparse-row modes opt into full and half viewport rows (#452)', () => {
  const adaptive = cssRule(
    '.image-trail-panel-root .image-trail-panel__history-section .image-trail-panel__record-list.is-sparse-adaptive:not(.is-user-resized)',
  );
  const full = cssRule(
    '.image-trail-panel-root .image-trail-panel__history-section .image-trail-panel__record-list.is-sparse-full:not(.is-user-resized)',
  );
  const half = cssRule(
    '.image-trail-panel-root .image-trail-panel__history-section .image-trail-panel__record-list.is-sparse-half:not(.is-user-resized)',
  );

  assert.match(adaptive, /block-size:\s*var\(--image-trail-history-viewport-size\);/u);
  assert.match(adaptive, /grid-auto-rows:\s*minmax\(0,\s*1fr\);/u);
  assert.match(full, /block-size:\s*var\(--image-trail-history-viewport-size\);/u);
  assert.match(full, /grid-auto-rows:\s*minmax\(var\(--image-trail-history-viewport-size\),\s*max-content\);/u);
  assert.match(full, /align-content:\s*start;/u);
  assert.match(half, /grid-auto-rows:\s*minmax\(var\(--image-trail-history-half-row-size\),\s*max-content\);/u);
});

test('Recents non-compact sparse-row metadata anchors to the row top-left (#452)', () => {
  const body = cssRule('.image-trail-panel-root .image-trail-panel__record-list.has-top-left-metadata .image-trail-panel__history-label');

  assert.match(body, /grid-column:\s*1\s*\/\s*-1;/u);
  assert.match(body, /align-self:\s*start;/u);
  assert.match(body, /justify-self:\s*start;/u);
  assert.match(body, /padding:\s*4px\s+6px;/u);
  assert.doesNotMatch(body, /padding:[^;]*84px/u);
});

test('Adaptive two-row Recents keep the full-width thumbnail background effect (#478)', () => {
  const item = cssRule(
    '.image-trail-panel-root .image-trail-panel__record-list.is-sparse-adaptive.has-sparse-count-2 .image-trail-panel__history-item',
  );
  const thumbnail = cssRule(
    '.image-trail-panel-root .image-trail-panel__history-item > .image-trail-panel__record-thumbnail,\n.image-trail-panel-root .image-trail-panel__bookmark-item > .image-trail-panel__record-thumbnail',
  );

  assert.match(item, /--image-trail-history-thumbnail-inline-size:\s*100%;/u);
  assert.match(thumbnail, /inline-size:\s*var\(--image-trail-history-thumbnail-inline-size,\s*auto\);/u);
});
