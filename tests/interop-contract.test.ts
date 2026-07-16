import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

test('vendored interoperability artifacts match the pinned canonical Photos contract', () => {
  const output = execFileSync(process.execPath, ['scripts/check-interop-contract.mjs'], { encoding: 'utf8' });
  assert.equal(output, 'Verified 9 canonical interop files from c159af6cab7d20539d55143165f5d6bf69fc751e.\n');
});
