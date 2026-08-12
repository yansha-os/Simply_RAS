import { test, expect } from '@playwright/test';
import { collectErrors } from '../fixtures';

// CRM (:3000) smoke: pages render without uncaught JS errors and dead
// magic-links degrade to a friendly screen instead of crashing.

test('login page loads without uncaught page errors', async ({ page }) => {
  const errors = collectErrors(page);

  await page.goto('/login');
  await expect(page.locator('form')).toBeVisible();

  expect(errors.pageErrors, 'uncaught exceptions on /login').toEqual([]);
  expect(errors.consoleErrors, 'console.error output on /login').toEqual([]);
});

test('invalid magic-link token shows a friendly screen, not a crash', async ({ page }) => {
  const errors = collectErrors(page);

  // "invalid-token" passes the middleware token-shape check, so it reaches the
  // page, which calls notFound() for unknown tokens. Expired-but-real tokens
  // render the "link no longer active" screen instead; both are acceptable
  // non-crash outcomes here. (The route streams via loading.tsx, so the HTTP
  // status can be 200 even for the 404 branch — assert on rendered content.)
  await page.goto('/magic-link/invalid-token');

  // Either screen renders a level-1 heading ("404" or "This Link Is No
  // Longer Active"); a server crash renders neither. NOTE: don't assert on
  // <nextjs-portal> absence — in dev mode it always exists (DevTools host).
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  expect(errors.pageErrors, 'uncaught exceptions on invalid magic-link').toEqual([]);
});
