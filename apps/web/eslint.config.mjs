import importPlugin from 'eslint-plugin-import';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['.next/**', 'next-env.d.ts']
  },
  ...tseslint.configs.recommended,
  {
    plugins: {
      import: importPlugin
    },
    rules: {
      // Phase 0 scaffold. Add actual Core/Platform/Module zones in Phase 1.
      // The rule stays disabled because the plugin schema rejects an empty zones array.
      'import/no-restricted-paths': 'off'
    }
  },
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      'no-console': ['warn', { allow: ['debug', 'info', 'warn', 'error'] }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn'
    }
  }
);
