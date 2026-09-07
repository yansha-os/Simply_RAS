import { beforeEach, describe, expect, it, vi } from 'vitest';

const ACTOR_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ID = '22222222-2222-4222-8222-222222222222';
const CLIENT_ID = '33333333-3333-4333-8333-333333333333';
const ITEM_ID = '44444444-4444-4444-8444-444444444444';

const mocks = vi.hoisted(() => ({
  requireStaff: vi.fn(),
  requireClientAccess: vi.fn(),
  createNotification: vi.fn(),
  revalidatePath: vi.fn(),
  prisma: {
    actionItem: { findMany: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
    client: { findUnique: vi.fn() },
    user: { findFirst: vi.fn() },
  },
}));

vi.mock('@/lib/auth-guard', () => ({
  requireStaff: mocks.requireStaff,
  requireClientAccess: mocks.requireClientAccess,
  CASE_COORD_ROLES: ['CEO', 'CLINICAL_DIRECTOR', 'OPS_DIRECTOR', 'CASE_COORDINATOR', 'CLINICAL_SUPPORT'],
  LEADERSHIP_ROLES: ['CEO', 'CLINICAL_DIRECTOR', 'OPS_DIRECTOR'],
}));
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('./notifications', () => ({ createNotification: mocks.createNotification }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));

import { createActionItem, getActionItems, resolveActionItem } from './actionItems';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireStaff.mockResolvedValue({
    ok: true,
    user: { id: ACTOR_ID, role: 'CASE_COORDINATOR', isActive: true },
  });
  mocks.requireClientAccess.mockResolvedValue({ ok: true, user: { id: ACTOR_ID } });
  mocks.prisma.actionItem.findMany.mockResolvedValue([]);
  mocks.prisma.actionItem.updateMany.mockResolvedValue({ count: 1 });
  mocks.prisma.client.findUnique.mockResolvedValue({ caseCoordinatorId: ACTOR_ID });
  mocks.prisma.user.findFirst.mockResolvedValue({ id: ACTOR_ID });
  mocks.prisma.actionItem.create.mockResolvedValue({ id: ITEM_ID });
  mocks.createNotification.mockResolvedValue({ success: true });
});

describe('action item authorization', () => {
  it('ignores another coordinator id for non-leadership list access', async () => {
    await getActionItems(OTHER_ID);

    expect(mocks.prisma.actionItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { assigneeId: ACTOR_ID } })
    );
  });

  it('rejects a client assignment that disagrees with the authoritative care team', async () => {
    const result = await createActionItem({
      title: 'Follow up',
      clientId: CLIENT_ID,
      assigneeId: OTHER_ID,
    });

    expect(result).toMatchObject({ success: false });
    expect(mocks.prisma.actionItem.create).not.toHaveBeenCalled();
  });

  it('persists the authenticated creator and authoritative assignee', async () => {
    const result = await createActionItem({ title: '  Follow up  ', clientId: CLIENT_ID });

    expect(result).toMatchObject({ success: true });
    expect(mocks.prisma.actionItem.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        title: 'Follow up',
        clientId: CLIENT_ID,
        assigneeId: ACTOR_ID,
        creatorId: ACTOR_ID,
      }),
    });
  });

  it('resolves through an ownership-scoped conditional write', async () => {
    const result = await resolveActionItem(ITEM_ID);

    expect(result).toEqual({ success: true });
    expect(mocks.prisma.actionItem.updateMany).toHaveBeenCalledWith({
      where: { id: ITEM_ID, status: 'OPEN', assigneeId: ACTOR_ID },
      data: { status: 'RESOLVED' },
    });
  });
});
