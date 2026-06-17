import js from '@eslint/js';
import tseslint from 'typescript-eslint';

const sourceFiles = ['extension/src/**/*.ts', 'tests/**/*.ts'];
const sourceAndScripts = [...sourceFiles, 'scripts/**/*.mjs', 'eslint.config.js'];

const noDocumentElementAppend = {
  selector:
    'CallExpression[callee.type="MemberExpression"][callee.property.name="append"][callee.object.type="MemberExpression"][callee.object.object.name="document"][callee.object.property.name="documentElement"]',
  message: 'Do not append directly to document.documentElement; append to a scoped extension container/root instead.',
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
    ignores: ['dist/**', 'extension/dist/**', '.test-dist/**', 'coverage/**', 'node_modules/**', 'deprecated/**'],
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
      'no-restricted-syntax': ['error', noDocumentElementAppend],
    },
  },
  ...Object.values(layerBoundaryRules),
);
