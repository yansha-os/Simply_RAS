import { beforeEach, describe, expect, it, vi } from 'vitest';

const CLIENT_ID = '11111111-1111-4111-8111-111111111111';

const mocks = vi.hoisted(() => ({
  requireStaff: vi.fn(),
  requireClientAccess: vi.fn(),
  revalidatePath: vi.fn(),
  prisma: {
    client: { findUnique: vi.fn(), updateMany: vi.fn() },
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

import { approveClinicalDocs } from './actions';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireStaff.mockResolvedValue({
    ok: true,
    user: { id: '22222222-2222-4222-8222-222222222222', role: 'BCBA', isActive: true },
  });
  mocks.requireClientAccess.mockResolvedValue({
    ok: false,
    error: 'You are not assigned to this client.',
  });
  mocks.prisma.client.findUnique.mockResolvedValue({
    id: CLIENT_ID,
    status: 'DOCS_APPROVED_INTAKE',
  });
  mocks.prisma.client.updateMany.mockResolvedValue({ count: 1 });
});

function approvalForm() {
  const form = new FormData();
  form.set('clientId', CLIENT_ID);
  return form;
}

describe('approveClinicalDocs authorization and concurrency', () => {
  it('denies an unassigned BCBA before reading client data', async () => {
    const result = await approveClinicalDocs(approvalForm());

    expect(result).toEqual({
      success: false,
      error: 'You are not assigned to this client.',
    });
    expect(mocks.prisma.client.findUnique).not.toHaveBeenCalled();
    expect(mocks.prisma.client.updateMany).not.toHaveBeenCalled();
  });

  it('uses the reviewed client status as a conditional transition', async () => {
    mocks.requireClientAccess.mockResolvedValue({
      ok: true,
      user: { id: '22222222-2222-4222-8222-222222222222', role: 'BCBA' },
    });
    mocks.prisma.client.updateMany.mockResolvedValue({ count: 0 });

    const result = await approveClinicalDocs(approvalForm());

    expect(result).toEqual({
      success: false,
      error: 'The client status changed in another session. Refresh and try again.',
    });
    expect(mocks.prisma.client.updateMany).toHaveBeenCalledWith({
      where: { id: CLIENT_ID, status: 'DOCS_APPROVED_INTAKE' },
      data: { status: 'CLINICAL_REVIEW_APPROVED' },
    });
  });
});
