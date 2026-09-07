import { beforeEach, describe, expect, it, vi } from 'vitest';

const OTHER_RBT_ID = '22222222-2222-4222-8222-222222222222';

const mocks = vi.hoisted(() => ({
  requireStaff: vi.fn(),
  resolveActingRbtUserId: vi.fn(),
  prisma: {
    session: { findMany: vi.fn() },
  },
}));

vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('@/lib/auth-guard', () => ({ requireStaff: mocks.requireStaff }));
vi.mock('@/lib/resolveActingRbt', () => ({
  resolveActingRbtUserId: mocks.resolveActingRbtUserId,
}));

import {
  listRbtPayrollSessions,
  listRbtScheduledSessions,
} from './payrollActions';

type LegacyCallable = (spoofedRbtId?: string) => Promise<{
  success: boolean;
}>;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireStaff.mockResolvedValue({
    ok: true,
    user: { id: '11111111-1111-4111-8111-111111111111', role: 'RBT', isActive: true },
  });
  mocks.resolveActingRbtUserId.mockResolvedValue(null);
});

describe('RBT payroll and schedule identity scope', () => {
  it('ignores a legacy payroll RBT override and resolves only the active RBT', async () => {
    const result = await (listRbtPayrollSessions as LegacyCallable)(OTHER_RBT_ID);

    expect(result).toMatchObject({ success: false });
    expect(mocks.resolveActingRbtUserId).toHaveBeenCalledWith();
    expect(mocks.prisma.session.findMany).not.toHaveBeenCalled();
  });

  it('ignores a legacy schedule RBT override and resolves only the active RBT', async () => {
    const result = await (listRbtScheduledSessions as LegacyCallable)(OTHER_RBT_ID);

    expect(result).toMatchObject({ success: false });
    expect(mocks.resolveActingRbtUserId).toHaveBeenCalledWith();
    expect(mocks.prisma.session.findMany).not.toHaveBeenCalled();
  });

  it('rejects payroll access before identity resolution when staff auth fails', async () => {
    mocks.requireStaff.mockResolvedValue({ ok: false, error: 'Not authenticated.' });

    const result = await listRbtPayrollSessions();

    expect(result).toMatchObject({ success: false, error: 'Not authenticated.' });
    expect(mocks.resolveActingRbtUserId).not.toHaveBeenCalled();
  });
});
