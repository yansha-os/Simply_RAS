import { test, expect } from '@playwright/test';

// CRM (:3000) unauthenticated access control.
// /case is a staff-protected path (apps/crm/src/proxy.ts isProtectedPath).

test('unauthenticated /case redirects to /login', async ({ request }) => {
  const res = await request.get('/case', { maxRedirects: 0 });

  // Next middleware issues a 307 today; accept any redirect status so a
  // framework upgrade does not break the suite.
  expect(res.status(), 'expected a redirect status').toBeGreaterThanOrEqual(300);
  expect(res.status()).toBeLessThan(400);
  expect(res.headers()['location']).toContain('/login');
});

test('unauthenticated /case lands on the login page in a browser', async ({ page }) => {
  await page.goto('/case');
  await expect(page).toHaveURL(/\/login/);
});

test('login page renders email/password form controls', async ({ page }) => {
  await page.goto('/login');

  // Structural selectors: field names and control types, not copy.
  await expect(page.locator('input[name="email"]')).toBeVisible();
  await expect(page.locator('input[name="password"]')).toBeVisible();
  await expect(page.locator('form button[type="submit"]')).toBeVisible();
});
