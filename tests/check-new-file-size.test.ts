import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

interface CheckNewFileSizeModule {
  countLines(text: string): number;
  evaluateNewFileSizes(input: { files: readonly string[]; readText: (file: string) => string; maxLines?: number }): {
    ok: boolean;
    failures: readonly { file: string; lines: number; maxLines: number }[];
  };
  isGuardedNewFile(file: string): boolean;
}

const mod = (await import(pathToFileURL(join(process.cwd(), 'scripts/check-new-file-size.mjs')).href)) as CheckNewFileSizeModule;

test('counts final-newline files without inventing an extra line', () => {
  assert.equal(mod.countLines(''), 0);
  assert.equal(mod.countLines('one\n'), 1);
  assert.equal(mod.countLines('one\ntwo'), 2);
});

test('guards new source test and script files only', () => {
  assert.equal(mod.isGuardedNewFile('extension/src/gallery/gallery-refresh.ts'), true);
  assert.equal(mod.isGuardedNewFile('tests/dom/gallery-refresh.test.ts'), true);
  assert.equal(mod.isGuardedNewFile('scripts/check-new-file-size.mjs'), true);
  assert.equal(mod.isGuardedNewFile('extension/dist/src/gallery/gallery.js'), false);
  assert.equal(mod.isGuardedNewFile('docs/acceptance-tests/gallery-albums.md'), false);
});

test('fails oversized added source files', () => {
  const result = mod.evaluateNewFileSizes({
    files: ['extension/src/gallery/small.ts', 'extension/src/gallery/huge.ts', 'README.md'],
    maxLines: 3,
    readText: (file) => (file.endsWith('huge.ts') ? '1\n2\n3\n4\n' : '1\n2\n'),
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.failures, [{ file: 'extension/src/gallery/huge.ts', lines: 4, maxLines: 3 }]);
});
