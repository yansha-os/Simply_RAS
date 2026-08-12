import { defineConfig } from '@playwright/test';

/**
 * E2E smoke suite for the Simple RAS CRM monorepo.
 *
 * IMPORTANT: there is intentionally NO `webServer` block. The suite assumes
 * both dev servers are ALREADY RUNNING (see e2e/README.md):
 *   - CRM: http://localhost:3000  (npm run dev:crm)
 *   - HRM: http://localhost:3001  (npm run dev:hrm)
 *
 * Building the apps inside the test run would be slow and would fight with
 * whatever dev server the developer already has up.
 */

const CRM_URL = process.env.E2E_CRM_URL || 'http://localhost:3000';
const HRM_URL = process.env.E2E_HRM_URL || 'http://localhost:3001';

export default defineConfig({
  testDir: './specs',
  outputDir: './test-results',

  // Dev-mode Next.js compiles routes on demand; first hits can be slow.
  timeout: 120_000,
  expect: { timeout: 15_000 },

  fullyParallel: false,
  workers: 2,
  retries: 1,
  forbidOnly: !!process.env.CI,

  reporter: [
    ['list'],
    ['html', { outputFolder: './playwright-report', open: 'never' }],
  ],

  use: {
    trace: 'on-first-retry',
    actionTimeout: 20_000,
    navigationTimeout: 90_000,
  },

  projects: [
    {
      name: 'crm',
      testMatch: ['health.spec.ts', 'crm-*.spec.ts'],
      use: { baseURL: CRM_URL },
    },
    {
      name: 'hrm',
      testMatch: ['health.spec.ts', 'hrm-*.spec.ts'],
      use: { baseURL: HRM_URL },
    },
  ],
});
