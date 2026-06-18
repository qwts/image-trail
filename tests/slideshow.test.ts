import test from 'node:test';
import assert from 'node:assert/strict';
import { Slideshow } from '../extension/src/core/automation/slideshow.js';

test('slideshow starts in idle phase', () => {
  const slideshow = new Slideshow(
    () => {},
    () => {},
  );
  assert.equal(slideshow.currentPhase, 'idle');
  assert.equal(slideshow.slidesShown, 0);
});

test('start transitions to running and resets count', () => {
  const phases: string[] = [];
  const slideshow = new Slideshow(
    () => {},
    (phase) => {
      phases.push(phase);
    },
  );
  slideshow.start();
  assert.equal(slideshow.currentPhase, 'running');
  assert.deepEqual(phases, ['running']);
  slideshow.destroy();
});

test('stop transitions to stopped', () => {
  const phases: string[] = [];
  const slideshow = new Slideshow(
    () => {},
    (phase) => {
      phases.push(phase);
    },
  );
  slideshow.start();
  slideshow.stop();
  assert.equal(slideshow.currentPhase, 'stopped');
  assert.deepEqual(phases, ['running', 'stopped']);
});

test('pause and resume cycle', () => {
  const phases: string[] = [];
  const slideshow = new Slideshow(
    () => {},
    (phase) => {
      phases.push(phase);
    },
  );
  slideshow.start();
  slideshow.pause();
  assert.equal(slideshow.currentPhase, 'paused');
  slideshow.resume();
  assert.equal(slideshow.currentPhase, 'running');
  slideshow.destroy();
  assert.deepEqual(phases, ['running', 'paused', 'running']);
});

test('pause from non-running is a no-op', () => {
  const slideshow = new Slideshow(
    () => {},
    () => {},
  );
  slideshow.pause();
  assert.equal(slideshow.currentPhase, 'idle');
});

test('resume from non-paused is a no-op', () => {
  const slideshow = new Slideshow(
    () => {},
    () => {},
  );
  slideshow.resume();
  assert.equal(slideshow.currentPhase, 'idle');
});

test('start while already running is a no-op', () => {
  const slideshow = new Slideshow(
    () => {},
    () => {},
  );
  slideshow.start();
  slideshow.start();
  assert.equal(slideshow.currentPhase, 'running');
  slideshow.destroy();
});

test('destroy resets to idle', () => {
  const slideshow = new Slideshow(
    () => {},
    () => {},
  );
  slideshow.start();
  slideshow.destroy();
  assert.equal(slideshow.currentPhase, 'idle');
  assert.equal(slideshow.slidesShown, 0);
});

test('step is called with configured direction after interval', async () => {
  const directions: number[] = [];
  const slideshow = new Slideshow(
    (dir) => {
      directions.push(dir);
    },
    () => {},
    { intervalMs: 50, direction: -1 },
  );
  slideshow.start();
  await new Promise((resolve) => setTimeout(resolve, 120));
  slideshow.stop();
  assert.ok(directions.length >= 1, `Expected at least 1 step, got ${directions.length}`);
  assert.equal(directions[0], -1);
});
