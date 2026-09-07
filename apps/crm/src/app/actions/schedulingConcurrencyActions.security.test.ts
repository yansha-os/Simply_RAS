import { beforeEach, describe, expect, it, vi } from 'vitest';

const CLIENT_ID = '11111111-1111-4111-8111-111111111111';
const EXISTING_ID = '22222222-2222-4222-8222-222222222222';

const mocks = vi.hoisted(() => ({
  requireClientAccess: vi.fn(),
  requireStaff: vi.fn(),
  prisma: { session: { findMany: vi.fn() } },
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('@/lib/auth-guard', () => ({
  requireClientAccess: mocks.requireClientAccess,
  requireStaff: mocks.requireStaff,
}));

import { checkSessionSchedulingPreflight } from './schedulingConcurrencyActions';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireStaff.mockResolvedValue({ ok: true });
  mocks.requireClientAccess.mockResolvedValue({ ok: true });
});

const proposed = {
  id: EXISTING_ID,
  clientId: CLIENT_ID,
  cptCode: '97153',
  start: '2026-09-07T13:00:00.000Z',
  end: '2026-09-07T14:00:00.000Z',
};

describe('scheduling preflight security and data integrity', () => {
  it('checks client access before reading scheduling data', async () => {
    mocks.requireClientAccess.mockResolvedValue({ ok: false, error: 'Forbidden' });

    const result = await checkSessionSchedulingPreflight({ proposed });

    expect(result).toEqual({ success: false, error: 'Forbidden' });
    expect(mocks.prisma.session.findMany).not.toHaveBeenCalled();
  });

  it('does not let a caller-supplied ID suppress a real overlap', async () => {
    mocks.prisma.session.findMany.mockResolvedValue([{
      id: EXISTING_ID,
      clientId: CLIENT_ID,
      cptCode: '97153',
      scheduledStart: new Date(proposed.start),
      scheduledEnd: new Date(proposed.end),
      rbtId: null,
      bcbaId: null,
      location: null,
    }]);

    const result = await checkSessionSchedulingPreflight({ proposed });

    expect(result).toMatchObject({
      success: true,
      concurrency: {
        allowed: false,
        classification: 'INVALID_DUPLICATE_CLIENT_BILLING',
        conflictingSessionId: EXISTING_ID,
      },
    });
    expect(result).not.toHaveProperty('headroom');
    expect(result.headroomUnavailableReason).toContain('total approved units');
  });
});
