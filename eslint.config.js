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

const layerBoundaryRules = {
  core: {
    files: ['extension/src/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '../background/*',
                '../content/*',
                '../data/*',
                '../ui/*',
                '../../background/*',
                '../../content/*',
                '../../data/*',
                '../../ui/*',
              ],
              message: 'core/ must stay framework-independent and cannot import app layer modules.',
            },
          ],
        },
      ],
    },
  },
  data: {
    files: ['extension/src/data/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['../background/*', '../content/*', '../ui/*', '../../background/*', '../../content/*', '../../ui/*'],
              message: 'data/ may depend on core-level models, but not background/, content/, or ui/.',
            },
          ],
        },
      ],
    },
  },
  background: {
    files: ['extension/src/background/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['../content/*', '../ui/*', '../../content/*', '../../ui/*'],
              message: 'background/ must not import DOM content or UI modules.',
            },
          ],
        },
      ],
    },
  },
  ui: {
    files: ['extension/src/ui/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['../background/*', '../data/*', '../../background/*', '../../data/*'],
              message: 'ui/ should route through content/controllers instead of importing background/ or data/ directly.',
            },
          ],
        },
      ],
    },
  },
};

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
  ...Object.values(layerBoundaryRules),
  {
    // Size tripwire for the panel orchestrator and its decomposed collaborators so they can never
    // regrow toward the 5k-line ImageTrailPanel god object they were extracted from (epics #265,
    // #290). #290 drove `panel.ts` itself under 800 lines, so the tripwire now covers it too.
    files: ['extension/src/ui/panel.ts', 'extension/src/ui/panel/**/*.ts'],
    rules: {
      'max-lines': ['error', { max: 800, skipBlankLines: true, skipComments: true }],
    },
  },
);
