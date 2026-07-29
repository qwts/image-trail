import assert from 'node:assert/strict';
import test from 'node:test';

import { createPreviewMediaSurface, mediaStatus } from '../../extension/src/preview/animated-preview.js';

const animated = {
  kind: 'gif',
  animated: true,
  frameCount: 3,
  loopCount: 0,
} as const;

test('reduced-motion animated preview starts on a poster and requires intentional Play/Stop actions', async () => {
  const surface = await createPreviewMediaSurface(
    document,
    { dataUrl: 'data:image/gif;base64,original', mediaInfo: animated },
    {
      reducedMotion: true,
      createPoster: async () => 'data:image/png;base64,poster',
    },
  );
  const image = surface.querySelector('img');
  const button = surface.querySelector('button');
  const status = surface.querySelector('[aria-live="polite"]');
  assert.ok(image);
  assert.ok(button);
  assert.equal(image.src, 'data:image/png;base64,poster');
  assert.equal(button.textContent, 'Play animation');
  assert.equal(button.getAttribute('aria-pressed'), 'false');
  assert.equal(status?.textContent, 'GIF animation, 3 frames, loops continuously; paused.');

  button.click();
  assert.equal(image.src, 'data:image/gif;base64,original');
  assert.equal(button.textContent, 'Stop animation');
  assert.equal(button.getAttribute('aria-pressed'), 'true');
  assert.equal(status?.textContent, 'GIF animation, 3 frames, loops continuously; playing.');

  button.click();
  assert.equal(image.src, 'data:image/png;base64,poster');
  assert.equal(button.textContent, 'Play animation');
  assert.equal(button.getAttribute('aria-pressed'), 'false');
});

test('poster failure remains non-autoplaying and normal-motion/static previews use the original directly', async () => {
  const failedPoster = await createPreviewMediaSurface(
    document,
    { dataUrl: 'data:image/gif;base64,original', mediaInfo: animated },
    { reducedMotion: true, createPoster: async () => null },
  );
  assert.equal(failedPoster.querySelector('img'), null);
  assert.match(failedPoster.textContent ?? '', /Animation paused/u);
  failedPoster.querySelector('button')?.click();
  assert.equal(failedPoster.querySelector('img')?.src, 'data:image/gif;base64,original');

  const normalMotion = await createPreviewMediaSurface(
    document,
    { dataUrl: 'data:image/gif;base64,original', mediaInfo: animated },
    { reducedMotion: false },
  );
  assert.equal(normalMotion.querySelector('img')?.src, 'data:image/gif;base64,original');
  assert.equal(normalMotion.querySelector('button'), null);

  const staticWebp = await createPreviewMediaSurface(
    document,
    {
      dataUrl: 'data:image/webp;base64,still',
      mediaInfo: { kind: 'webp', animated: false, frameCount: 1, loopCount: null },
    },
    { reducedMotion: true },
  );
  assert.equal(staticWebp.querySelector('img')?.src, 'data:image/webp;base64,still');
  assert.equal(staticWebp.querySelector('button'), null);
});

test('media status distinguishes finite and absent loop declarations', () => {
  assert.equal(
    mediaStatus({ kind: 'webp', animated: true, frameCount: 2, loopCount: 4 }, false),
    'WebP animation, 2 frames, loops 4 times; paused.',
  );
  assert.equal(
    mediaStatus({ kind: 'gif', animated: true, frameCount: 2, loopCount: null }, true),
    'GIF animation, 2 frames, has no declared loop; playing.',
  );
});
