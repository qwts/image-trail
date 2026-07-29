import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createCaptureImageMessage, createGrantPermissionAndCaptureMessage, MessageType } from '../extension/src/background/messages.js';

test('capture request builders omit absent optional context', () => {
  assert.deepEqual(createCaptureImageMessage('https://media.example/clip.ts', 'bookmark'), {
    type: MessageType.CaptureImage,
    version: 1,
    payload: {
      url: 'https://media.example/clip.ts',
      sourceType: 'bookmark',
    },
  });
  assert.deepEqual(createGrantPermissionAndCaptureMessage('https://media.example/clip.ts', 'bookmark'), {
    type: MessageType.GrantPermissionAndCapture,
    version: 1,
    payload: {
      url: 'https://media.example/clip.ts',
      sourceType: 'bookmark',
    },
  });
});

test('capture request builders preserve filename and record context', () => {
  const payload = {
    url: 'data:video/mp2t;base64,R0RBVEE=',
    sourceType: 'history' as const,
    sourceRecordId: 'record-42',
    fileName: 'camera.m2ts',
  };
  assert.deepEqual(createCaptureImageMessage(payload.url, payload.sourceType, payload.sourceRecordId, payload.fileName).payload, payload);
  assert.deepEqual(
    createGrantPermissionAndCaptureMessage(payload.url, payload.sourceType, payload.sourceRecordId, payload.fileName).payload,
    payload,
  );
});
