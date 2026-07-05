import js from '@eslint/js';
import tseslint from 'typescript-eslint';

const sourceFiles = ['extension/src/**/*.ts', 'tests/**/*.ts'];
const sourceAndScripts = [...sourceFiles, 'scripts/**/*.mjs', 'eslint.config.js'];

const noDocumentElementAppend = {
  selector:
    'CallExpression[callee.type="MemberExpression"][callee.property.name="append"][callee.object.type="MemberExpression"][callee.object.object.name="document"][callee.object.property.name="documentElement"]',
  message: 'Do not append directly to document.documentElement; append to a scoped extension container/root instead.',
};

// Queue order is queueUpdatedAt, never the encrypted envelope's updatedAt (AGENTS.md "Storage
// Rules"). Reading `.envelope.updatedAt` to preserve a timestamp on reseal is fine; sorting a
// queue by it is the footgun. Scope the ban to `.envelope.updatedAt` reached inside a `.sort(...)`
// callback so legitimate preserve/backfill reads stay clean.
const noEnvelopeUpdatedAtSort = {
  selector: 'CallExpression[callee.property.name="sort"] MemberExpression[property.name="updatedAt"][object.property.name="envelope"]',
  message: 'Queue order must use queueUpdatedAt, not envelope.updatedAt (AGENTS.md "Storage Rules").',
};

// Layer import boundaries. Each entry names a source layer and the layers it must not import,
// generated into the four `no-restricted-imports` blocks that previously lived here by hand. These
// are the specific restrictions enforced today, not a single linear order: `core` stays pure (no
// app-layer imports); `data` builds on core only; `background` must not reach the DOM layers
// (content/ui); `ui` routes through `content` controllers rather than importing `background`/`data`
// directly. `content` is intentionally unrestricted — it is the page bridge that mounts the panel
// (e.g. content-script imports ui/panel), so it has no entry. The two generated glob depths
// (`../x/*`, `../../x/*`) cover sibling and nested source files.
const layerImportBoundaries = [
  {
    layer: 'core',
    forbids: ['background', 'content', 'data', 'ui'],
    message: 'core/ must stay framework-independent and cannot import app layer modules.',
  },
  {
    layer: 'data',
    forbids: ['background', 'content', 'ui'],
    message: 'data/ may depend on core-level models, but not background/, content/, or ui/.',
  },
  {
    layer: 'background',
    forbids: ['content', 'ui'],
    message: 'background/ must not import DOM content or UI modules.',
  },
  {
    layer: 'ui',
    forbids: ['background', 'data'],
    message: 'ui/ should route through content/controllers instead of importing background/ or data/ directly.',
  },
];

const layerBoundaryConfigs = layerImportBoundaries.map(({ layer, forbids, message }) => ({
  files: [`extension/src/${layer}/**/*.ts`],
  rules: {
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: [...forbids.map((target) => `../${target}/*`), ...forbids.map((target) => `../../${target}/*`)],
            message,
          },
        ],
      },
    ],
  },
}));

export default tseslint.config(
  {
    ignores: ['dist/**', 'extension/dist/**', '.test-dist/**', 'coverage/**', 'storybook-static/**', 'node_modules/**', 'deprecated/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: sourceAndScripts,
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    rules: {
      'no-undef': 'off',
      // Size/complexity tripwires. The panel decomposition (#265) landed, so these guard against
      // regrowth; the remaining oversized modules (background/messages.ts, service-worker.ts, a few
      // ui/components views) keep these at `warn` until each is split. no-explicit-any and
      // consistent-type-imports are already clean, so they are hard errors.
      'max-lines': ['warn', { max: 800, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': ['warn', { max: 80, skipBlankLines: true, skipComments: true }],
      complexity: ['warn', 15],
      // Enforce `import type` for top-level type-only imports (the codebase already does), but keep
      // `disallowTypeAnnotations` off: the message-protocol files (messages.ts, service-worker.ts,
      // core/types.ts) deliberately reference payload types via inline `import('...').Type`
      // annotations to keep each type co-located with its message and avoid hoisting into two files
      // already over the size cap. Those annotations are type-only by construction and fully elided.
      '@typescript-eslint/consistent-type-imports': ['error', { disallowTypeAnnotations: false }],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          args: 'all',
          argsIgnorePattern: '^_',
          caughtErrors: 'all',
          caughtErrorsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      'no-restricted-syntax': ['error', noDocumentElementAppend, noEnvelopeUpdatedAtSort],
    },
  },
  ...layerBoundaryConfigs,
  {
    // #356 split protocol constants out of messages.ts and ratcheted the physical line ceiling from
    // the pre-split 2210-line baseline down to 1970. Count comments/blank lines for this file so the
    // lint guard matches the documented `wc -l` acceptance check.
    files: ['extension/src/background/messages.ts'],
    rules: {
      'max-lines': ['error', { max: 1970, skipBlankLines: false, skipComments: false }],
    },
  },
  {
    // Size tripwire for the panel orchestrator and its decomposed collaborators so they can never
    // regrow toward the 5k-line ImageTrailPanel god object they were extracted from (epics #265,
    // #290). #290 drove `panel.ts` under this rule's 800-line budget (which skips blank lines and
    // comments, so ~786 counted vs 837 physical), so the tripwire now covers it too. This escalates
    // the global `max-lines` warning above to an error for these already-split files.
    files: ['extension/src/ui/panel.ts', 'extension/src/ui/panel/**/*.ts'],
    rules: {
      'max-lines': ['error', { max: 800, skipBlankLines: true, skipComments: true }],
    },
  },
);
