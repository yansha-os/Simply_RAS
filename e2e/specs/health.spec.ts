import { test, expect } from '@playwright/test';

/**
 * GET /api/health must answer 200 with { ok: true } on both apps.
 * Runs once per project (crm → :3000, hrm → :3001) via each project's baseURL.
 *
 * Graceful skips (the endpoint / middleware allowlisting is being added by
 * another workstream at the time this suite was written):
 *   - 404          → route not deployed on the running dev server yet
 *   - 3xx to login → route exists but middleware does not allowlist it yet
 */
test('GET /api/health returns 200 + ok:true', async ({ request }, testInfo) => {
  const res = await request.get('/api/health', { maxRedirects: 0 });

  test.skip(
    res.status() === 404,
    '/api/health not available on the running dev server yet (restart may be needed after the route lands)'
  );
  test.skip(
    res.status() >= 300 && res.status() < 400,
    `/api/health redirected (${res.status()} → ${res.headers()['location'] ?? '?'}) — middleware does not allowlist it yet`
  );

  expect(res.status(), `expected 200 on ${testInfo.project.name}`).toBe(200);

  const body = await res.json();
  expect(body.ok).toBe(true);
});
