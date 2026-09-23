import importPlugin from 'eslint-plugin-import';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['.next/**', 'next-env.d.ts']
  },
  ...tseslint.configs.recommended,
  {
    files: ['src/platform/**/*.{ts,tsx}'],
    plugins: {
      import: importPlugin
    },
    settings: {
      'import/resolver': {
        typescript: true
      }
    },
    rules: {
      'import/no-restricted-paths': ['error', {
        basePath: new URL('.', import.meta.url).pathname,
        zones: [
          ...[
            'meetings',
            'callings',
            'announcements',
            'notifications',
            'document-designer',
            'imports',
            'reports',
            'leadership',
            'church-actions'
          ].map((directory) => ({
            target: './src/platform',
            from: `./src/${directory}`,
            message: `Platform code must not import optional module code from src/${directory}.`
          }))
        ]
      }]
    }
  },
  {
    files: ['src/conducting/**/*.{ts,tsx}'],
    plugins: {
      import: importPlugin
    },
    settings: {
      'import/resolver': {
        typescript: true
      }
    },
    rules: {
      'import/no-restricted-paths': ['error', {
        basePath: new URL('.', import.meta.url).pathname,
        zones: [
          ...[
            'document-designer',
            'callings',
            'announcements',
            'notifications',
            'imports',
            'reports',
            'leadership',
            'church-actions'
          ].map((directory) => ({
            target: './src/conducting',
            from: `./src/${directory}`,
            message: `Conducting Core must not import optional module code from src/${directory}.`
          }))
        ]
      }]
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
