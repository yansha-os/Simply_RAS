import path from 'node:path';
import { defineConfig } from 'vitest/config';

const rootDir = import.meta.dirname;

/**
 * Unit tests for pure logic only (no DB, no React, no Next runtime).
 * App projects keep `@/` scoped to their own source; the shared DB package has
 * a separate project for database-free cross-app policy tests.
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
      {
        test: {
          name: 'db-policy',
          environment: 'node',
          include: ['packages/db/src/**/*.test.ts'],
        },
      },
    ],
  },
});
