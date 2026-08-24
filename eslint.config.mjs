import { defineConfig, globalIgnores } from 'eslint/config';

import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import prettier from 'eslint-config-prettier/flat';

import tsParser from '@typescript-eslint/parser';
import perfectionist from 'eslint-plugin-perfectionist';

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  prettier,

  globalIgnores([
    '.next/**',
    'coverage/**',
    'dist/**',
    'drizzle/migrations/**',
    'node_modules/**',
    'playwright-report/**',
    'storybook-static/**',
    'test-results/**',
  ]),

  {
    plugins: {
      perfectionist,
    },
    rules: {
      'perfectionist/sort-objects': [
        'error',
        {
          order: 'asc',
          type: 'alphabetical',
        },
      ],
    },
  },

  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: './tsconfig.json',
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unnecessary-type-assertion': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      'no-console': 'error',
    },
  },

  {
    files: ['src/lib/logger.ts'],
    rules: {
      'no-console': 'off',
    },
  },

  {
    files: ['**/*.test.ts', '**/*.test.tsx'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'no-console': 'off',
    },
  },
]);
