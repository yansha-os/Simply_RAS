import { beforeEach, describe, expect, it, vi } from 'vitest';

const SESSION_ID = '11111111-1111-4111-8111-111111111111';
const CLIENT_ID = '22222222-2222-4222-8222-222222222222';
const UPDATED_AT = new Date('2026-09-05T16:00:00.000Z');
const RBT_ID = '44444444-4444-4444-8444-444444444444';
const BCBA_ID = '55555555-5555-4555-8555-555555555555';

const mocks = vi.hoisted(() => {
  const tx = {
    client: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
    user: { findUnique: vi.fn() },
    session: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
    auditLogVault: { createMany: vi.fn() },
  };
  return {
    tx,
    requireClientAccess: vi.fn(),
    requireStaff: vi.fn(),
    revalidatePath: vi.fn(),
    notifyUsers: vi.fn(),
    prisma: {
      session: { findUnique: vi.fn() },
      $transaction: vi.fn(async (callback: (transaction: typeof tx) => unknown) => callback(tx)),
    },
  };
});

vi.mock('server-only', () => ({}));
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('@/lib/auth-guard', () => ({
  requireClientAccess: mocks.requireClientAccess,
  requireStaff: mocks.requireStaff,
}));
vi.mock('@/app/actions/notifications', () => ({ notifyUsers: mocks.notifyUsers }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));

import {
  confirmTherapySessionCompleted,
  scheduleFirstTherapySession,
} from './firstSessionActions';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireStaff.mockResolvedValue({
    ok: true,
    user: { id: '33333333-3333-4333-8333-333333333333', role: 'CEO', isActive: true },
  });
  mocks.requireClientAccess.mockResolvedValue({ ok: true });
  mocks.prisma.session.findUnique.mockResolvedValue({ clientId: CLIENT_ID });
  mocks.tx.session.updateMany.mockResolvedValue({ count: 1 });
});

function session(actualStart: Date | null, actualEnd: Date | null) {
  return {
    id: SESSION_ID,
    clientId: CLIENT_ID,
    status: 'IN_PROGRESS',
    cptCode: '97153',
    scheduledStart: new Date('2026-09-05T13:00:00.000Z'),
    scheduledEnd: new Date('2026-09-05T15:00:00.000Z'),
    actualStart,
    actualEnd,
    updatedAt: UPDATED_AT,
    client: { caseCoordinatorId: null },
  };
}

describe('first-session completion evidence', () => {
  it('rejects malformed scheduling identifiers before client or database access', async () => {
    const result = await scheduleFirstTherapySession({
      clientId: 'not-a-client-id',
      scheduledStart: '2026-09-05T09:00',
      scheduledEnd: '2026-09-05T10:00',
      cptCode: '97153',
      expectedClientStatus: 'STAFFING_PENDING',
      expectedRbtId: 'not-an-rbt-id',
      expectedBcbaId: 'not-a-bcba-id',
      expectedRbtApproved: true,
    });

    expect(result).toEqual({
      success: false,
      error: 'Valid first-session details are required.',
    });
    expect(mocks.requireClientAccess).not.toHaveBeenCalled();
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('blocks first-session scheduling when the assigned RBT lacks a current license', async () => {
    mocks.tx.client.findUnique.mockResolvedValue({
      id: CLIENT_ID,
      firstName: 'Test',
      lastName: 'Client',
      status: 'STAFFING_PENDING',
      rbtId: RBT_ID,
      bcbaId: BCBA_ID,
      rbtApproved: true,
      caseCoordinatorId: null,
    });
    mocks.tx.user.findUnique.mockImplementation(({ where }: { where: { id: string } }) =>
      Promise.resolve(where.id === RBT_ID
        ? {
            id: RBT_ID,
            role: 'RBT',
            isActive: true,
            firstName: 'RBT',
            lastName: 'User',
            credentials: [],
          }
        : {
            id: BCBA_ID,
            role: 'BCBA',
            isActive: true,
            firstName: 'BCBA',
            lastName: 'User',
            credentials: [{
              credentialType: 'BACB_LICENSE',
              isCredentialed: true,
              expirationDate: new Date('2099-01-01T00:00:00.000Z'),
            }],
          }),
    );

    const result = await scheduleFirstTherapySession({
      clientId: CLIENT_ID,
      scheduledStart: '2026-09-05T09:00',
      scheduledEnd: '2026-09-05T10:00',
      cptCode: '97153',
      expectedClientStatus: 'STAFFING_PENDING',
      expectedRbtId: RBT_ID,
      expectedBcbaId: BCBA_ID,
      expectedRbtApproved: true,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('RBT credential hard stop');
    expect(result.error).toContain('No BACB_LICENSE on file');
    expect(mocks.tx.session.create).not.toHaveBeenCalled();
  });

  it('does not substitute scheduled timestamps for missing actual service evidence', async () => {
    mocks.tx.session.findUnique.mockResolvedValue(session(null, null));

    const result = await confirmTherapySessionCompleted(SESSION_ID);

    expect(result).toEqual({
      success: false,
      error: 'Actual service start and end times must be recorded before completion.',
    });
    expect(mocks.tx.session.updateMany).not.toHaveBeenCalled();
  });

  it('completes using compare-and-set when actual timestamps are valid', async () => {
    const actualStart = new Date('2026-09-05T13:07:00.000Z');
    const actualEnd = new Date('2026-09-05T14:58:00.000Z');
    mocks.tx.session.findUnique.mockResolvedValue(session(actualStart, actualEnd));

    const result = await confirmTherapySessionCompleted(SESSION_ID);

    expect(mocks.tx.session.updateMany).toHaveBeenCalledWith({
      where: {
        id: SESSION_ID,
        clientId: CLIENT_ID,
        status: 'IN_PROGRESS',
        cptCode: '97153',
        actualStart,
        actualEnd,
        updatedAt: UPDATED_AT,
      },
      data: { status: 'COMPLETED' },
    });
    expect(result).toMatchObject({ success: true, alreadyCompleted: false });
  });
});
