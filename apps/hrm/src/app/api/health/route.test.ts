import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  logError: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: { $queryRaw: mocks.queryRaw },
}));
vi.mock('@/lib/logger', () => ({
  logError: mocks.logError,
  errorMeta: (error: unknown) => ({ message: error instanceof Error ? error.message : String(error) }),
}));

import { GET } from './route';

const ORIGINAL_KEY = process.env.ONBOARDING_FIELD_ENCRYPTION_KEY;
const VALID_KEY = Buffer.alloc(32, 7).toString('base64');

beforeEach(() => {
  mocks.queryRaw.mockReset().mockResolvedValue([{ '?column?': 1 }]);
  mocks.logError.mockReset();
  process.env.ONBOARDING_FIELD_ENCRYPTION_KEY = VALID_KEY;
});

afterEach(() => {
  if (ORIGINAL_KEY === undefined) {
    delete process.env.ONBOARDING_FIELD_ENCRYPTION_KEY;
  } else {
    process.env.ONBOARDING_FIELD_ENCRYPTION_KEY = ORIGINAL_KEY;
  }
});

describe('HRM health route', () => {
  it('reports ready only when the database and encryption configuration are ready', async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: true, app: 'hrm', db: 'ok', encryption: 'ok' });
  });

  it('fails closed without exposing encryption configuration details', async () => {
    delete process.env.ONBOARDING_FIELD_ENCRYPTION_KEY;

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({ ok: false, app: 'hrm', db: 'ok', encryption: 'error' });
    expect(JSON.stringify(body)).not.toContain('ONBOARDING_FIELD_ENCRYPTION_KEY');
  });

  it('reports a database probe failure independently of encryption readiness', async () => {
    mocks.queryRaw.mockRejectedValueOnce(new Error('database unavailable'));

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({ ok: false, app: 'hrm', db: 'error', encryption: 'ok' });
    expect(mocks.logError).toHaveBeenCalledOnce();
  });
});
