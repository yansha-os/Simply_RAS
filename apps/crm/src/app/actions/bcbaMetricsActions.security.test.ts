import { beforeEach, describe, expect, it, vi } from 'vitest';

const BCBA_ID = '11111111-1111-4111-8111-111111111111';
const SUPPORT_ID = '22222222-2222-4222-8222-222222222222';

const mocks = vi.hoisted(() => ({
  requirePersistedStaff: vi.fn(),
  prisma: {
    client: { count: vi.fn(), findMany: vi.fn() },
    sessionNote: { count: vi.fn(), findMany: vi.fn() },
    user: { findMany: vi.fn() },
  },
}));

vi.mock('@/lib/auth-guard', () => ({
  requirePersistedStaff: mocks.requirePersistedStaff,
  CLINICAL_ROLES: ['CEO', 'CLINICAL_DIRECTOR', 'OPS_DIRECTOR', 'BCBA', 'CLINICAL_SUPPORT'],
}));
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }));

import { getBcbaOpsMetrics } from './bcbaMetricsActions';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.prisma.client.count.mockResolvedValue(0);
  mocks.prisma.client.findMany.mockResolvedValue([]);
  mocks.prisma.sessionNote.count.mockResolvedValue(0);
  mocks.prisma.sessionNote.findMany.mockResolvedValue([]);
  mocks.prisma.user.findMany.mockResolvedValue([]);
});

describe('clinical metrics scope policy', () => {
  it('keeps a BCBA scoped to their own client and session relationships', async () => {
    mocks.requirePersistedStaff.mockResolvedValue({
      ok: true,
      user: { id: BCBA_ID, role: 'BCBA', isActive: true },
    });

    const result = await getBcbaOpsMetrics();

    expect(result).toMatchObject({
      success: true,
      metrics: { scopedToBcbaId: BCBA_ID, isDirector: false },
    });
    expect(mocks.prisma.client.count).toHaveBeenCalledWith({
      where: { status: 'ACTIVE', bcbaId: BCBA_ID },
    });
    expect(mocks.prisma.sessionNote.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        session: { OR: [{ bcbaId: BCBA_ID }, { client: { bcbaId: BCBA_ID } }] },
      }),
    });
  });

  it('gives Clinical Support the established agency-wide operations scope', async () => {
    mocks.requirePersistedStaff.mockResolvedValue({
      ok: true,
      user: { id: SUPPORT_ID, role: 'CLINICAL_SUPPORT', isActive: true },
    });

    const result = await getBcbaOpsMetrics();

    expect(result).toMatchObject({
      success: true,
      metrics: { scopedToBcbaId: null, isDirector: false },
    });
    expect(mocks.prisma.client.count).toHaveBeenCalledWith({
      where: { status: 'ACTIVE' },
    });
    expect(mocks.prisma.sessionNote.count).toHaveBeenCalledWith({
      where: { rbtSigned: true, bcbaSigned: false },
    });
    expect(mocks.prisma.client.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { bcbaId: { not: null } } })
    );
  });
});
