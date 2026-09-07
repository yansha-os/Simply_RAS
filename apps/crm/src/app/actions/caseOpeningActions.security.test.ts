import { beforeEach, describe, expect, it, vi } from 'vitest';

const COORDINATOR_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_COORDINATOR_ID = '22222222-2222-4222-8222-222222222222';
const OPENING_ID = '33333333-3333-4333-8333-333333333333';
const CLIENT_ID = '44444444-4444-4444-8444-444444444444';

const mocks = vi.hoisted(() => ({
  requireStaff: vi.fn(),
  requireClientAccess: vi.fn(),
  revalidatePath: vi.fn(),
  prisma: {
    caseOpening: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
    caseApplication: { findUnique: vi.fn() },
    client: { findUnique: vi.fn() },
    clientMessage: { create: vi.fn() },
    staffMessage: { findMany: vi.fn() },
  },
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('@/lib/auth-guard', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/auth-guard')>();
  return {
    ...original,
    requireStaff: mocks.requireStaff,
    requireClientAccess: mocks.requireClientAccess,
  };
});
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));

import {
  closeCaseOpening,
  getApplicationThread,
  sendParentCaseMessage,
} from './caseOpeningActions';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireStaff.mockResolvedValue({
    ok: true,
    user: {
      id: COORDINATOR_ID,
      role: 'CASE_COORDINATOR',
      isActive: true,
    },
  });
  mocks.requireClientAccess.mockResolvedValue({ ok: true });
  mocks.prisma.caseOpening.findUnique.mockResolvedValue({
    clientId: CLIENT_ID,
    status: 'OPEN',
    client: { caseCoordinatorId: OTHER_COORDINATOR_ID },
  });
  mocks.prisma.caseOpening.updateMany.mockResolvedValue({ count: 1 });
  mocks.prisma.client.findUnique.mockResolvedValue({
    caseCoordinatorId: OTHER_COORDINATOR_ID,
  });
  mocks.prisma.caseApplication.findUnique.mockResolvedValue({
    rbtUserId: '55555555-5555-4555-8555-555555555555',
    opening: {
      caseCode: 'CASE-101',
      clientId: CLIENT_ID,
      client: { caseCoordinatorId: OTHER_COORDINATOR_ID },
    },
  });
});

describe('case-opening communications ownership', () => {
  it('does not let a coordinator message another coordinator’s parent', async () => {
    const result = await sendParentCaseMessage(CLIENT_ID, 'Hello parent');

    expect(result).toEqual({
      success: false,
      error: 'You may only manage assignment workflows for your own client.',
    });
    expect(mocks.prisma.clientMessage.create).not.toHaveBeenCalled();
  });

  it('does not expose another coordinator’s application thread', async () => {
    const result = await getApplicationThread(OPENING_ID);

    expect(result).toEqual({
      success: false,
      error: 'You may only manage assignment workflows for your own client.',
      messages: [],
      parentMessages: [],
    });
    expect(mocks.prisma.staffMessage.findMany).not.toHaveBeenCalled();
  });
});

describe('closeCaseOpening ownership', () => {
  it('rejects a coordinator closing another coordinator’s opening', async () => {
    const result = await closeCaseOpening(OPENING_ID);

    expect(result).toEqual({
      success: false,
      error: 'You may only manage assignment workflows for your own client.',
    });
    expect(mocks.requireClientAccess).toHaveBeenCalledWith(CLIENT_ID);
    expect(mocks.prisma.caseOpening.updateMany).not.toHaveBeenCalled();
  });

  it('rejects malformed ids before querying opening data', async () => {
    const result = await closeCaseOpening('not-an-id');

    expect(result).toEqual({ success: false, error: 'Opening not found.' });
    expect(mocks.prisma.caseOpening.findUnique).not.toHaveBeenCalled();
  });

  it('closes only while the opening remains open and ownership remains unchanged', async () => {
    mocks.prisma.caseOpening.findUnique.mockResolvedValue({
      clientId: CLIENT_ID,
      status: 'OPEN',
      client: { caseCoordinatorId: COORDINATOR_ID },
    });

    const result = await closeCaseOpening(OPENING_ID);

    expect(result).toEqual({ success: true });
    expect(mocks.prisma.caseOpening.updateMany).toHaveBeenCalledWith({
      where: {
        id: OPENING_ID,
        clientId: CLIENT_ID,
        status: 'OPEN',
        client: { is: { caseCoordinatorId: COORDINATOR_ID } },
      },
      data: { status: 'CLOSED' },
    });
  });
});
