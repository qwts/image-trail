import assert from 'node:assert/strict';
import test from 'node:test';

import {
  SITE_CAPTURE_RULE_LIMIT,
  normalizeSiteCaptureHostname,
  sanitizeSiteCaptureRules,
  siteCaptureBehaviorForHostname,
  updateSiteCaptureRule,
} from '../extension/src/core/site-capture-rules.js';
import { DEFAULT_LOCAL_SETTINGS, migrateLocalSettings } from '../extension/src/data/local-settings.js';

test('site capture rules default to conservative metadata-only pins', () => {
  assert.deepEqual(DEFAULT_LOCAL_SETTINGS.siteCaptureRules, {});
  assert.equal(siteCaptureBehaviorForHostname({}, 'images.example.test'), 'pin-only');
  assert.deepEqual(migrateLocalSettings({}).siteCaptureRules, {});
});

test('site capture rules match only normalized exact hostnames', () => {
  const rules = updateSiteCaptureRule({}, ' IMAGES.Example.Test. ', 'capture-original');
  assert.deepEqual(rules, { 'images.example.test': 'capture-original' });
  assert.equal(siteCaptureBehaviorForHostname(rules, 'images.example.test'), 'capture-original');
  assert.equal(siteCaptureBehaviorForHostname(rules, 'cdn.images.example.test'), 'pin-only');
  assert.equal(siteCaptureBehaviorForHostname(rules, 'example.test'), 'pin-only');
});

test('site capture hostname normalization rejects paths, ports, wildcards, and malformed labels', () => {
  for (const value of [
    '*.example.test',
    'example.test/path',
    'example.test:443',
    'user@example.test',
    '-bad.test',
    'bad-.test',
    'bad..test',
  ]) {
    assert.equal(normalizeSiteCaptureHostname(value), null, value);
  }
  assert.equal(normalizeSiteCaptureHostname('127.0.0.1'), '127.0.0.1');
  assert.equal(normalizeSiteCaptureHostname('localhost'), 'localhost');
});

test('site capture rule migration drops invalid entries and preserves valid reversible choices', () => {
  const legacy = {
    ...DEFAULT_LOCAL_SETTINGS,
    siteCaptureRules: {
      'images.example.test': 'capture-original',
      '*.example.test': 'capture-original',
      'bad.example.test': 'capture-everything',
    },
  } as unknown as Parameters<typeof migrateLocalSettings>[0];
  const migrated = migrateLocalSettings(legacy);
  assert.deepEqual(migrated.siteCaptureRules, { 'images.example.test': 'capture-original' });
  assert.deepEqual(updateSiteCaptureRule(migrated.siteCaptureRules, 'images.example.test', null), {});
  assert.deepEqual(sanitizeSiteCaptureRules(null), {});
});

test('site capture rules stay bounded while allowing an existing rule to change', () => {
  let rules = {};
  for (let index = 0; index < SITE_CAPTURE_RULE_LIMIT; index += 1) {
    rules = updateSiteCaptureRule(rules, `site-${index}.example.test`, 'pin-only');
  }
  assert.equal(Object.keys(rules).length, SITE_CAPTURE_RULE_LIMIT);
  assert.deepEqual(updateSiteCaptureRule(rules, 'overflow.example.test', 'capture-original'), rules);
  const changed = updateSiteCaptureRule(rules, 'site-0.example.test', 'capture-original');
  assert.equal(changed['site-0.example.test'], 'capture-original');
});
