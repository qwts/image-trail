import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

interface Change {
  readonly status: string;
  readonly path: string;
  readonly baseText: string | null;
  readonly currentText: string | null;
}

interface FunctionSizeResult {
  readonly ok: boolean;
  readonly results: readonly { readonly status: string; readonly currentLines: number }[];
}

interface FunctionSizeModule {
  readonly UI_FUNCTION_MAX_LINES: number;
  collectFunctionSizes(sourceText: string, fileName?: string): readonly { readonly name: string; readonly lines: number }[];
  evaluateFunctionSizeChanges(changes: readonly Change[]): FunctionSizeResult;
}

const scriptPath = join(process.cwd(), 'scripts/check-function-size-ratchet.mjs');
const mod = (await import(pathToFileURL(scriptPath).href)) as FunctionSizeModule;
const { UI_FUNCTION_MAX_LINES } = mod;

function functionSource(name: string, bodyLines: number): string {
  const body = Array.from({ length: bodyLines }, (_, index) => `  const value${index} = ${index};`).join('\n');
  return `export function ${name}() {\n${body}\n}`;
}

test('collectFunctionSizes measures physical function spans and nested callbacks', () => {
  const source = `
export function outer() {
  [1].map((value) => {
    return value + 1;
  });
}
`;
  const metrics = mod.collectFunctionSizes(source, 'fixture.ts');

  assert.deepEqual(
    metrics.map(({ name, lines }) => ({ name, lines })),
    [
      { name: 'outer', lines: 5 },
      { name: '[1].map callback', lines: 3 },
    ],
  );
});

test('new UI functions over 99 lines fail the ratchet', () => {
  const result = mod.evaluateFunctionSizeChanges([
    {
      status: 'A',
      path: 'extension/src/ui/new-view.tsx',
      baseText: null,
      currentText: functionSource('Oversized', UI_FUNCTION_MAX_LINES),
    },
  ]);

  assert.equal(result.ok, false);
  assert.equal(result.results[0]?.status, 'new-oversized');
  assert.equal(result.results[0]?.currentLines, UI_FUNCTION_MAX_LINES + 2);
});

test('legacy oversized functions may shrink but may not grow', () => {
  const base = functionSource('legacy', 110);
  const reduced = mod.evaluateFunctionSizeChanges([
    {
      status: 'M',
      path: 'extension/src/ui/legacy.ts',
      baseText: base,
      currentText: functionSource('legacy', 105),
    },
  ]);
  const grown = mod.evaluateFunctionSizeChanges([
    {
      status: 'M',
      path: 'extension/src/ui/legacy.ts',
      baseText: base,
      currentText: functionSource('legacy', 111),
    },
  ]);

  assert.equal(reduced.ok, true);
  assert.equal(reduced.results[0]?.status, 'oversized-not-grown');
  assert.equal(grown.ok, false);
  assert.equal(grown.results[0]?.status, 'oversized-grew');
});

test('non-UI files are outside the renderer architecture ratchet', () => {
  const result = mod.evaluateFunctionSizeChanges([
    {
      status: 'A',
      path: 'scripts/example.mjs',
      baseText: null,
      currentText: functionSource('tooling', 120),
    },
  ]);

  assert.deepEqual(result, { ok: true, results: [] });
});
