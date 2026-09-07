import { beforeEach, describe, expect, it, vi } from 'vitest';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const CREDENTIAL_ID = '22222222-2222-4222-8222-222222222222';

const mocks = vi.hoisted(() => ({
  requireStaff: vi.fn(),
  writeAuditLog: vi.fn(),
  revalidatePath: vi.fn(),
  prisma: {
    user: { findFirst: vi.fn() },
    staffCredential: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('@/lib/auth-guard', () => ({ requireStaff: mocks.requireStaff }));
vi.mock('@/lib/auditLog', () => ({ writeAuditLog: mocks.writeAuditLog }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));

import {
  createStaffCredential,
  deleteStaffCredential,
} from './staffCredentialActions';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireStaff.mockResolvedValue({
    ok: true,
    user: { id: USER_ID, role: 'HEAD_HR', isActive: true },
  });
});

describe('staff credential mutation integrity', () => {
  it('does not mark an NPI on file without a real credential number', async () => {
    const result = await createStaffCredential({
      userId: USER_ID,
      credentialType: 'NPI',
      credentialNumber: null,
      payerName: 'ALL_PAYERS',
      expirationDate: null,
    });

    expect(result).toEqual({ success: false, error: 'NPI requires a credential number.' });
    expect(mocks.prisma.staffCredential.create).not.toHaveBeenCalled();
  });

  it('normalizes and persists complete credential evidence', async () => {
    mocks.prisma.user.findFirst.mockResolvedValue({ id: USER_ID });
    mocks.prisma.staffCredential.create.mockResolvedValue({
      id: CREDENTIAL_ID,
      userId: USER_ID,
    });

    const result = await createStaffCredential({
      userId: USER_ID,
      credentialType: ' npi ',
      credentialNumber: '1234567890',
      payerName: ' Medicaid ',
      expirationDate: '2027-12-31',
    });

    expect(result).toEqual({ success: true });
    expect(mocks.prisma.staffCredential.create).toHaveBeenCalledWith({
      data: {
        userId: USER_ID,
        credentialType: 'NPI',
        credentialNumber: '1234567890',
        payerName: 'Medicaid',
        expirationDate: new Date('2027-12-31T00:00:00.000Z'),
        isCredentialed: true,
      },
      select: { id: true, userId: true },
    });
  });

  it('retains credential rows for audit history instead of deleting them', async () => {
    const result = await deleteStaffCredential(CREDENTIAL_ID);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Revoke');
    expect(mocks.prisma.staffCredential.delete).not.toHaveBeenCalled();
  });
});
