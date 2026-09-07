import { beforeEach, describe, expect, it, vi } from 'vitest';

const CANDIDATE_ID = '11111111-1111-4111-8111-111111111111';
const DURABLE_TOKEN = 'existing-durable-magic-link-token';

const mocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  newMagicLinkExpiry: vi.fn(() => new Date('2026-08-19T12:00:00.000Z')),
  prisma: {
    atsCandidate: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('@/lib/magicLinkExpiry', () => ({
  newMagicLinkExpiry: mocks.newMagicLinkExpiry,
}));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock('next/headers', () => ({
  headers: vi.fn(async () => ({ get: vi.fn(() => '203.0.113.10') })),
}));
vi.mock('@/lib/publicApplicationRateLimit', () => ({
  checkAndRecordPublicApplicationAttempt: () => ({ allowed: true }),
}));

import {
  submitRbtApplication,
  type RbtApplicationInput,
} from './publicRbt';

function application(
  overrides: Partial<RbtApplicationInput> = {}
): RbtApplicationInput {
  return {
    firstName: 'New',
    lastName: 'Applicant',
    email: 'known@example.com',
    phoneNumber: '(555) 123-4567',
    addressLine1: '10 Main Street',
    city: 'Brooklyn',
    state: 'NY',
    zipCode: '11201',
    rbtStatus: 'Complete',
    preferredBoroughs: ['Brooklyn'],
    availabilityHours: ['Monday'],
    workAuth: 'Yes',
    isAdult: true,
    backgroundCheckConsent: true,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('submitRbtApplication existing-email integrity', () => {
  it.each(['HIRED', 'REJECTED'])(
    'returns no packet capability and does not mutate an existing %s candidate',
    async (stage) => {
      const existing = {
        id: CANDIDATE_ID,
        firstName: 'Existing',
        lastName: 'Candidate',
        email: 'known@example.com',
        phone: '(555) 999-9999',
        stage,
        activationStatus: stage === 'REJECTED' ? 'REJECTED' : 'ACTIVE',
        dossier: { immutable: 'existing dossier' },
        onboardingPacket: { magicLinkToken: DURABLE_TOKEN },
      };
      mocks.prisma.atsCandidate.findUnique.mockResolvedValue(existing);
      mocks.prisma.atsCandidate.update.mockResolvedValue(existing);

      const result = await submitRbtApplication(
        application({
          firstName: 'Attacker',
          lastName: 'Overwrite',
          phoneNumber: '(555) 000-0000',
          additionalNotes: 'replace the existing dossier',
        })
      );

      expect(result).toMatchObject({ success: true });
      expect(result).not.toHaveProperty('applicantId');
      expect(result).not.toHaveProperty('uploadToken');
      expect(JSON.stringify(result)).not.toContain(DURABLE_TOKEN);
      expect(mocks.prisma.atsCandidate.findUnique).toHaveBeenCalledWith({
        where: { email: 'known@example.com' },
        select: { id: true },
      });
      expect(mocks.prisma.atsCandidate.update).not.toHaveBeenCalled();
      expect(mocks.prisma.atsCandidate.create).not.toHaveBeenCalled();
      expect(mocks.revalidatePath).not.toHaveBeenCalled();
    }
  );

  it('preserves candidate creation and upload capability for a new email', async () => {
    mocks.prisma.atsCandidate.findUnique.mockResolvedValue(null);
    mocks.prisma.atsCandidate.create.mockResolvedValue({ id: CANDIDATE_ID });

    const result = await submitRbtApplication(
      application({ email: 'brand-new@example.com' })
    );

    expect(result).toMatchObject({
      success: true,
      applicantId: CANDIDATE_ID,
      message: 'Application submitted successfully!',
    });
    expect(result).toHaveProperty('uploadToken');
    expect(typeof result.uploadToken).toBe('string');
    expect(result.uploadToken).not.toHaveLength(0);
    expect(mocks.prisma.atsCandidate.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: 'brand-new@example.com',
          stage: 'APPLIED',
          onboardingPacket: {
            create: expect.objectContaining({
              magicLinkToken: result.uploadToken,
            }),
          },
        }),
      })
    );
    expect(mocks.prisma.atsCandidate.update).not.toHaveBeenCalled();
  });

  it('rejects oversized public fields before querying candidate data', async () => {
    const result = await submitRbtApplication(
      application({ additionalNotes: 'x'.repeat(4_001) })
    );

    expect(result).toMatchObject({ success: false });
    expect(mocks.prisma.atsCandidate.findUnique).not.toHaveBeenCalled();
    expect(mocks.prisma.atsCandidate.create).not.toHaveBeenCalled();
  });
});
