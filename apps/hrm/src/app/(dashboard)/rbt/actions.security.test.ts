import { beforeEach, describe, expect, it, vi } from 'vitest';

const RBT_ID = '11111111-1111-4111-8111-111111111111';
const CLIENT_ID = '22222222-2222-4222-8222-222222222222';
const BCBA_ID = '33333333-3333-4333-8333-333333333333';

const mocks = vi.hoisted(() => ({
  resolveActingRbtContext: vi.fn(),
  revalidatePath: vi.fn(),
  prisma: {
    user: {
      findFirst: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('@/lib/resolveActingRbt', () => ({
  resolveActingRbtContext: mocks.resolveActingRbtContext,
}));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));

import * as rbtActions from './actions';

const { logSession } = rbtActions;

function legacyForm() {
  const form = new FormData();
  form.set('clientId', CLIENT_ID);
  form.set('rbtId', RBT_ID);
  form.set('bcbaId', BCBA_ID);
  return form;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolveActingRbtContext.mockResolvedValue({
    rbtUserId: RBT_ID,
    candidateId: null,
  });
  mocks.prisma.user.findFirst.mockResolvedValue({
    id: RBT_ID,
    role: 'RBT',
    isActive: true,
  });
});

describe('legacy logSession assignment writer', () => {
  it('rejects an unauthenticated caller before any write', async () => {
    mocks.resolveActingRbtContext.mockResolvedValue({
      rbtUserId: null,
      candidateId: null,
    });

    const result = await logSession({}, legacyForm());

    expect(result).toMatchObject({ error: expect.stringMatching(/sign in|authenticated/i) });
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('is server-disabled even when caller-supplied staff ids look valid', async () => {
    const result = await logSession({}, legacyForm());

    expect(result).toMatchObject({
      error: expect.stringMatching(/Session Studio|disabled/i),
    });
    expect(result).not.toMatchObject({ success: true });
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('legacy deficiency writer surface', () => {
  it('does not export a shortcut that can flip signatures or resolve deficiencies', () => {
    expect('fixDeficiency' in rbtActions).toBe(false);
  });
});
