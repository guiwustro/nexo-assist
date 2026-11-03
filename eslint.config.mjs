import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const config = [
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['tests/**', 'e2e/**', 'evals/**'],
    rules: { 'react-hooks/rules-of-hooks': 'off' },
  },
  {
    ignores: ['.next/**', '.next-e2e/**', 'node_modules/**', 'db/migrations/**', 'playwright-report/**', 'test-results/**', 'next-env.d.ts'],
  },
];

export default config;
