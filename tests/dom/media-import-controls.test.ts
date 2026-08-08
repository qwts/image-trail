import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { ImportedImageFile } from '../../extension/src/core/types.js';
import { createDirectMediaUrlControl, readMediaFiles } from '../../extension/src/ui/components/media-import-controls.js';

test('direct media URL control validates the scheme and derives a decoded filename', () => {
  const imports: ImportedImageFile[] = [];
  const control = createDirectMediaUrlControl(false, (file) => imports.push(file));
  document.body.replaceChildren(control.field, control.button);
  const input = control.field.querySelector('input');
  assert.ok(input);
  assert.equal(input.getAttribute('aria-labelledby'), 'image-trail-direct-media-url-label');
  assert.equal(input.getAttribute('aria-describedby'), 'image-trail-direct-media-url-description');

  input.value = 'file:///tmp/camera.ts';
  control.button.click();
  assert.deepEqual(imports, []);
  assert.match(input.validationMessage, /http\(s\)/u);

  input.value = 'https://media.example/archive/camera%2001.m2ts?download=1';
  control.button.click();
  assert.deepEqual(imports, [
    {
      name: 'camera 01.m2ts',
      dataUrl: 'https://media.example/archive/camera%2001.m2ts?download=1',
    },
  ]);
});

test('direct media URL control disables both input and action while locked', () => {
  const control = createDirectMediaUrlControl(true, () => assert.fail('locked control dispatched'));
  const input = control.field.querySelector('input');
  assert.ok(input);
  assert.equal(input.disabled, true);
  assert.equal(control.button.disabled, true);
});

test('local media reader accepts images and supported media extensions, normalizes MIME, and ignores unrelated files', async () => {
  const input = document.createElement('input');
  input.type = 'file';
  Object.defineProperty(input, 'files', {
    configurable: true,
    value: [
      new File(['image-bytes'], 'photo.png', { type: 'image/png' }),
      new File(['transport-bytes'], 'camera.mts', { type: 'application/octet-stream' }),
      new File(['video-bytes'], 'clip.MOV', { type: 'application/octet-stream' }),
      new File(['audio-bytes'], 'sound.mp2', { type: 'application/octet-stream' }),
      new File(['notes'], 'notes.txt', { type: 'text/plain' }),
    ],
  });
  const files = await new Promise<readonly ImportedImageFile[]>((resolve) => readMediaFiles(input, resolve));
  assert.equal(files.length, 4);
  assert.equal(files[0]?.name, 'photo.png');
  assert.match(files[0]?.dataUrl ?? '', /^data:image\/png;base64,/u);
  assert.equal(files[1]?.name, 'camera.mts');
  assert.match(files[1]?.dataUrl ?? '', /^data:video\/mp2t;base64,/u);
  assert.equal(files[2]?.name, 'clip.MOV');
  assert.match(files[2]?.dataUrl ?? '', /^data:video\/quicktime;base64,/u);
  assert.equal(files[3]?.name, 'sound.mp2');
  assert.match(files[3]?.dataUrl ?? '', /^data:audio\/mpeg;base64,/u);
});

test('local media reader preserves selection order when reads complete out of order', async () => {
  const originalFileReader = globalThis.FileReader;
  class OutOfOrderFileReader {
    result: string | ArrayBuffer | null = null;
    onload: FileReader['onload'] = null;
    onerror: FileReader['onerror'] = null;

    readAsDataURL(file: File): void {
      const delay = file.name === 'first.png' ? 10 : 0;
      setTimeout(() => {
        this.result = `data:${file.type};base64,dGVzdA==`;
        this.onload?.call(this as unknown as FileReader, new ProgressEvent('load') as ProgressEvent<FileReader>);
      }, delay);
    }
  }
  Object.defineProperty(globalThis, 'FileReader', { configurable: true, value: OutOfOrderFileReader });
  try {
    const input = document.createElement('input');
    input.type = 'file';
    Object.defineProperty(input, 'files', {
      configurable: true,
      value: [new File(['first'], 'first.png', { type: 'image/png' }), new File(['second'], 'second.png', { type: 'image/png' })],
    });
    const files = await new Promise<readonly ImportedImageFile[]>((resolve) => readMediaFiles(input, resolve));
    assert.deepEqual(
      files.map((file) => file.name),
      ['first.png', 'second.png'],
    );
  } finally {
    Object.defineProperty(globalThis, 'FileReader', { configurable: true, value: originalFileReader });
  }
});
