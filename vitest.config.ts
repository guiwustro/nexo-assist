import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

const alias = { '@': path.resolve(__dirname, '.') };

export default defineConfig({
  plugins: [react()],
  resolve: { alias },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          globals: true,
          include: ['tests/unit/**/*.test.ts', 'tests/unit/**/*.test.tsx'],
          environment: 'node',
          setupFiles: ['tests/setup-unit.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          globals: true,
          include: ['tests/integration/**/*.test.ts'],
          environment: 'node',
          pool: 'forks',
          fileParallelism: false,
          setupFiles: ['tests/setup-integration.ts'],
          testTimeout: 20000,
          hookTimeout: 30000,
        },
      },
    ],
  },
});
