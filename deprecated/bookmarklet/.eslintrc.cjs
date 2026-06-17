module.exports = {
  root: true,
  extends: ['airbnb-base'],
  ignorePatterns: ['dist/**', 'node_modules/**', '**/*.txt'],
  env: {
    browser: true,
    es2021: true,
    node: true
  },
  parserOptions: {
    ecmaVersion: 2021,
    sourceType: 'script'
  },
  rules: {
    'no-console': 'off',
    'import/extensions': ['error', 'ignorePackages', {
      js: 'never',
      mjs: 'never'
    }],
    // Bookmarklets often run in constrained environments and use direct loops.
    'no-plusplus': 'off',
    'no-continue': 'off',
    'prefer-destructuring': 'off'
  },
  overrides: [
    {
      files: ['image-url-token-editor.bookmarklet.src/**/*.js'],
      env: {
        browser: true,
        node: false
      },
      parserOptions: {
        ecmaVersion: 5,
        sourceType: 'script'
      },
      rules: {
        strict: ['error', 'function'],
        'no-redeclare': 'off',
        'no-unused-vars': 'off',
        'no-var': 'off',
        'prefer-const': 'off',
        'vars-on-top': 'off',
        'wrap-iife': 'off',
        'func-names': 'off',
        'prefer-arrow-callback': 'off',
        'prefer-template': 'off',
        'operator-linebreak': 'off',
        'no-restricted-globals': 'off',
        'no-shadow': 'off',
        'object-shorthand': 'off',
        'comma-dangle': 'off',
        'no-cond-assign': 'off',
        'no-param-reassign': 'off',
        'no-use-before-define': 'off',
        'semi-style': 'off',
        'no-extra-semi': 'off',
        'prefer-object-spread': 'off',
        semi: ['error', 'never'],
        'space-before-function-paren': ['error', {
          anonymous: 'always',
          named: 'always',
          asyncArrow: 'always'
        }],
        'max-len': ['error', {
          code: 120,
          ignoreUrls: true,
          ignoreStrings: true,
          ignoreTemplateLiterals: true,
          ignoreRegExpLiterals: true
        }]
      }
    },
    {
      files: ['scripts/**/*.mjs'],
      env: {
        browser: false,
        node: true
      },
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module'
      },
      rules: {
        'import/no-extraneous-dependencies': ['error', {
          devDependencies: true
        }]
      }
    }
  ]
}
