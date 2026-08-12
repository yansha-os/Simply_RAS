import { test, expect } from '@playwright/test';

// HRM (:3001) unauthenticated access control.
// /hr-dashboard is a staff-protected path (apps/hrm/src/proxy.ts
// isStaffProtectedPath) and redirects to /login when there is no session.
// NOTE: /rbt/* is the APPLICANT portal — it redirects to /apply, not /login,
// and is covered in hrm-smoke.spec.ts.

test('unauthenticated /hr-dashboard redirects to /login', async ({ request }) => {
  const res = await request.get('/hr-dashboard', { maxRedirects: 0 });

  expect(res.status(), 'expected a redirect status').toBeGreaterThanOrEqual(300);
  expect(res.status()).toBeLessThan(400);
  expect(res.headers()['location']).toContain('/login');
});

test('unauthenticated /hr-dashboard lands on the login page in a browser', async ({ page }) => {
  await page.goto('/hr-dashboard');
  await expect(page).toHaveURL(/\/login/);
});

test('login page renders email/password form controls', async ({ page }) => {
  await page.goto('/login');

  await expect(page.locator('input[name="email"]')).toBeVisible();
  await expect(page.locator('input[name="password"]')).toBeVisible();
  await expect(page.locator('form button[type="submit"]')).toBeVisible();
});
