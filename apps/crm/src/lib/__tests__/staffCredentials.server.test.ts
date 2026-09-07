import { beforeEach, describe, expect, it, vi } from 'vitest';

const USER_ID = '11111111-1111-4111-8111-111111111111';

const mocks = vi.hoisted(() => ({
  prisma: {
    staffCredential: { findMany: vi.fn() },
  },
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }));

import { getStaffNpi } from '../staffCredentials.server';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('billing NPI selection', () => {
  it('skips expired and malformed NPI rows and returns current evidence', async () => {
    mocks.prisma.staffCredential.findMany.mockResolvedValue([
      {
        credentialType: 'NPI',
        credentialNumber: '1111111111',
        isCredentialed: true,
        expirationDate: new Date('2020-01-01T00:00:00.000Z'),
      },
      {
        credentialType: 'NPI',
        credentialNumber: 'not-an-npi',
        isCredentialed: true,
        expirationDate: null,
      },
      {
        credentialType: 'NPI',
        credentialNumber: '1234567890',
        isCredentialed: true,
        expirationDate: new Date('2099-01-01T00:00:00.000Z'),
      },
    ]);

    await expect(getStaffNpi(USER_ID)).resolves.toBe('1234567890');
  });

  it('returns no NPI when no current verified row exists', async () => {
    mocks.prisma.staffCredential.findMany.mockResolvedValue([{
      credentialType: 'NPI',
      credentialNumber: '1234567890',
      isCredentialed: false,
      expirationDate: null,
    }]);

    await expect(getStaffNpi(USER_ID)).resolves.toBe('');
  });
});
