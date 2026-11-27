import eslintComments from '@eslint-community/eslint-plugin-eslint-comments';
import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'public', 'test-results', 'playwright-report', 'tools'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.strictTypeChecked],
    languageOptions: {
      ecmaVersion: 2023,
      globals: globals.browser,
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    plugins: { 'react-hooks': reactHooks, '@eslint-community/eslint-comments': eslintComments },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@eslint-community/eslint-comments/require-description': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      // With noUncheckedIndexedAccess, `!` is how the code says an index is known to be in range.
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-confusing-void-expression': 'off',
      // Flags destructured props declared with method syntax, which React never calls with `this`.
      '@typescript-eslint/unbound-method': 'off',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      '@typescript-eslint/restrict-plus-operands': ['error', { allowNumberAndString: true }],
    },
  },
  {
    // Keeps functions from growing until no one can follow them. Tests' describe blocks are exempt.
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['**/*.test.{ts,tsx}'],
    rules: {
      'max-statements': ['error', 60],
      'max-lines-per-function': ['error', { max: 200, skipBlankLines: true, skipComments: true }],
      complexity: ['error', 30],
      'max-depth': ['error', 4],
    },
  },
);
