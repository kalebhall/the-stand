import eslint from '@eslint/js';
import globals from 'globals';

export default [
  {
    ignores: ['apps/**', 'packages/**', 'node_modules/**', '.next/**']
  },
  {
    files: ['scripts/**/*.{js,mjs}'],
    ...eslint.configs.recommended,
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.node
    },
    rules: {
      'no-console': 'off'
    }
  }
];
