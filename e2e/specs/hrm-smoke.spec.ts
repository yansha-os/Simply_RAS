import { test, expect } from '@playwright/test';
import { collectErrors } from '../fixtures';

// HRM (:3001) smoke.

test('/apply public application page renders', async ({ page }) => {
  const errors = collectErrors(page);

  await page.goto('/apply');

  // Structural: the public application page must expose at least one heading
  // and interactive application fields. (The wizard is state-driven and does
  // NOT wrap its inputs in a <form> element, so assert on controls by role.)
  await expect(page.getByRole('heading').first()).toBeVisible();
  await expect(page.getByRole('textbox').first()).toBeVisible();
  // exact match — a loose /next/i regex also catches the "Open Next.js Dev
  // Tools" button injected by the dev server.
  await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeVisible();

  expect(errors.pageErrors, 'uncaught exceptions on /apply').toEqual([]);
});

test('unauthenticated /rbt/schedule is gated (redirect) or renders in dev-tools mode', async ({
  page,
  request,
}) => {
  // Regression: the DevTools bypass must not stream a page-level redirect that
  // makes the Next.js Router retry with a different hook sequence.

  // Contract per apps/hrm/src/proxy.ts: /rbt/* is the APPLICANT portal.
  // Without a session it redirects to /apply (NOT /login). Exception: when the
  // dev server runs with NEXT_PUBLIC_ENABLE_DEV_TOOLS=true (the local dev
  // default), the middleware deliberately lets the request through, so a 200
  // is also a valid outcome — in that case just require a crash-free render.
  const res = await request.get('/rbt/schedule', { maxRedirects: 0 });

  if (res.status() >= 300 && res.status() < 400) {
    expect(res.headers()['location']).toMatch(/\/(apply|login)/);
    return;
  }

  expect(res.status(), 'non-redirect response must be a 200 (dev-tools bypass)').toBe(200);

  const errors = collectErrors(page);
  await page.goto('/rbt/schedule');
  await expect(page.getByRole('heading').first()).toBeVisible();
  expect(errors.pageErrors, 'uncaught exceptions on /rbt/schedule').toEqual([]);
});
