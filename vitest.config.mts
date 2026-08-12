import path from 'node:path';
import { defineConfig } from 'vitest/config';

const rootDir = import.meta.dirname;

/**
 * Unit tests for pure logic only (no DB, no React, no Next runtime).
 * Two projects so `@/` resolves to each app's own src/.
 */
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'crm',
          environment: 'node',
          include: ['apps/crm/src/**/*.test.ts'],
        },
        resolve: {
          alias: {
            '@': path.resolve(rootDir, 'apps/crm/src'),
          },
        },
      },
      {
        test: {
          name: 'hrm',
          environment: 'node',
          include: ['apps/hrm/src/**/*.test.ts'],
        },
        resolve: {
          alias: {
            '@': path.resolve(rootDir, 'apps/hrm/src'),
          },
        },
      },
    ],
  },
});
