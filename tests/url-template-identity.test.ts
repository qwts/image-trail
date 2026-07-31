import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createUrlTemplateIdentityKey,
  deriveUrlTemplateIdentity,
  isUrlTemplateIdentityKey,
} from '../extension/src/core/url/template-identity.js';

test('URL-template identities are deterministic, keyed, and route-distinct', () => {
  const firstKey = '00'.repeat(32);
  const secondKey = '11'.repeat(32);
  const post = deriveUrlTemplateIdentity(firstKey, 's:text:post|/|s:field:int?src:text');

  assert.equal(post, deriveUrlTemplateIdentity(firstKey, 's:text:post|/|s:field:int?src:text'));
  assert.notEqual(post, deriveUrlTemplateIdentity(firstKey, 's:text:admin|/|s:field:int?src:text'));
  assert.notEqual(post, deriveUrlTemplateIdentity(secondKey, 's:text:post|/|s:field:int?src:text'));
  assert.match(post, /^[0-9a-f]{64}$/u);
});

test('URL-template identity keys contain 256 random bits in a validated encoding', () => {
  const key = createUrlTemplateIdentityKey();
  assert.equal(isUrlTemplateIdentityKey(key), true);
  assert.equal(isUrlTemplateIdentityKey('not-a-key'), false);
  assert.notEqual(key, createUrlTemplateIdentityKey());
});
