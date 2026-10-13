import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'game.js', 'data/**', 'icons/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['shared/**/*.js', 'online.js'],
    languageOptions: {
      sourceType: 'script',
      globals: {
        globalThis: 'readonly',
        module: 'readonly',
        window: 'readonly',
        document: 'readonly',
        location: 'readonly',
        WebSocket: 'readonly',
        localStorage: 'readonly',
        URLSearchParams: 'readonly',
        navigator: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        require: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    files: ['server/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
);
