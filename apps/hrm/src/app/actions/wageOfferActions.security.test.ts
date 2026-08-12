import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Ls54Payload } from '@/lib/onboardingDocuments';

const CANDIDATE_ID = '11111111-1111-4111-8111-111111111111';
const FINGERPRINT = '22222222-2222-4222-8222-222222222222';
const ACTOR_ID = '33333333-3333-4333-8333-333333333333';
const SIGNED_AT = new Date('2026-08-12T16:00:00.000Z');

const PAYLOAD: Ls54Payload = {
  employerName: 'Rise & Shine ABA LLC',
  dbaName: 'Rise & Shine ABA',
  fein: '00-0000000',
  physicalAddress: '424 Grandview Ave, Staten Island, NY 10303',
  mailingAddress: '424 Grandview Ave, Staten Island, NY 10303',
  phone: '(929) 460-9600',
  noticeGiven: 'AT_HIRING',
  rateOfPay: 25,
  overtimeRate: 37.5,
  regularPayday: 'Friday',
  payFrequency: 'BIWEEKLY',
  payFrequencyOther: '',
  allowancesNone: true,
  tipsPerHour: null,
  mealsPerMeal: null,
  lodging: '',
  otherAllowance: '',
  preparerName: 'Head HR',
  preparerTitle: 'Head of HR',
  employeeName: 'Ready Candidate',
};
const PAYLOAD_HASH = createHash('sha256')
  .update(JSON.stringify(PAYLOAD))
  .digest('hex');

const mocks = vi.hoisted(() => {
  const tx = {
    applicantDeviceSession: {
      findUnique: vi.fn(),
    },
    candidateOnboardingPacket: {
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      upsert: vi.fn(),
    },
    onboardingSignatureEvent: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    atsCandidate: {
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
    atsHelpTicket: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    atsHelpMessage: {
      create: vi.fn(),
    },
  };
  return {
    tx,
    prisma: {
      ...tx,
      $transaction: vi.fn(),
    },
    cookieGet: vi.fn((name: string) => {
      if (name === 'ras_device_session_token') {
        return { value: CANDIDATE_ID };
      }
      if (name === 'device_fingerprint') {
        return { value: FINGERPRINT };
      }
      return undefined;
    }),
    headerGet: vi.fn(() => null),
    requireRole: vi.fn(),
    revalidatePath: vi.fn(),
    hireCandidate: vi.fn(),
    promoteHiredSessionToRbt: vi.fn(),
  };
});

vi.mock('server-only', () => ({}));
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('@/lib/auth-guard', () => ({
  requireRole: mocks.requireRole,
}));
vi.mock('@/lib/applicantAccessPolicy', () => ({
  canUseApplicantDeviceSession: () => true,
}));
vi.mock('@/app/actions/atsActions', () => ({
  hireCandidate: mocks.hireCandidate,
}));
vi.mock('@/app/actions/applicantSessionActions', () => ({
  promoteHiredSessionToRbt: mocks.promoteHiredSessionToRbt,
}));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({ get: mocks.cookieGet })),
  headers: vi.fn(async () => ({ get: mocks.headerGet })),
}));

import {
  sendWageOffer,
  signWageOffer,
} from './wageOfferActions';

function deviceSession() {
  return {
    id: '44444444-4444-4444-8444-444444444444',
    candidateId: CANDIDATE_ID,
    deviceFingerprint: FINGERPRINT,
    magicLinkToken: 'current-link-token',
    revokedAt: null,
    candidate: {
      id: CANDIDATE_ID,
      stage: 'OFFER',
      activationStatus: 'ACTIVE',
    },
  };
}

function packet(status = 'SENT') {
  return {
    id: '55555555-5555-4555-8555-555555555555',
    candidateId: CANDIDATE_ID,
    ls54Status: status,
    ls54Version: 3,
    ls54Payload: PAYLOAD,
    ls54SentAt: new Date('2026-08-12T15:00:00.000Z'),
    ls54SignedAt: status === 'SIGNED' ? SIGNED_AT : null,
    ls54DeclinedAt: null,
    ls54PreparedAt: new Date('2026-08-12T14:00:00.000Z'),
    ls54PreparedByUserId: ACTOR_ID,
  };
}

function signInput(overrides?: {
  noticeVersion?: number;
  noticeContentSha256?: string;
}) {
  return {
    signerName: 'Ready Candidate',
    primaryLanguageEnglish: true,
    englishOnlyNoTemplate: false,
    noticeVersion: overrides?.noticeVersion ?? 3,
    noticeContentSha256:
      overrides?.noticeContentSha256 ?? PAYLOAD_HASH,
    consents: {
      read: true,
      agree: true,
      eSign: true,
      ackNotice: true,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireRole.mockResolvedValue({
    id: ACTOR_ID,
    role: 'HEAD_HR',
    firstName: 'Head',
    lastName: 'HR',
  });
  mocks.tx.applicantDeviceSession.findUnique.mockResolvedValue(
    deviceSession()
  );
  mocks.tx.candidateOnboardingPacket.findUnique.mockResolvedValue(packet());
  mocks.tx.candidateOnboardingPacket.update.mockResolvedValue(packet('SIGNED'));
  mocks.tx.candidateOnboardingPacket.updateMany.mockResolvedValue({ count: 1 });
  mocks.tx.candidateOnboardingPacket.upsert.mockResolvedValue(packet());
  mocks.tx.atsCandidate.findUnique.mockResolvedValue({
    id: CANDIDATE_ID,
    firstName: 'Ready',
    lastName: 'Candidate',
    stage: 'OFFER',
    activationStatus: 'ACTIVE',
    onboardingPacket: packet(),
  });
  mocks.tx.atsCandidate.update.mockResolvedValue({});
  mocks.tx.atsCandidate.updateMany.mockResolvedValue({ count: 1 });
  mocks.tx.onboardingSignatureEvent.create.mockResolvedValue({
    id: '66666666-6666-4666-8666-666666666666',
    auditHash: 'current-signature-audit',
  });
  mocks.tx.onboardingSignatureEvent.findFirst.mockResolvedValue(null);
  mocks.tx.onboardingSignatureEvent.findMany.mockResolvedValue([]);
  mocks.prisma.$transaction.mockImplementation(
    async (operation: (tx: typeof mocks.tx) => Promise<unknown>) =>
      operation(mocks.tx)
  );
  mocks.hireCandidate.mockResolvedValue({ success: true });
  mocks.promoteHiredSessionToRbt.mockResolvedValue({ success: true });
});

describe('wage notice signing boundary', () => {
  it('signs the exact current notice atomically and waits for explicit staff final hire', async () => {
    const result = await signWageOffer(signInput());

    expect(result).toEqual({
      success: true,
      data: {
        auditHash: 'current-signature-audit',
        hired: false,
        requiresStaffFinalHire: true,
        version: 3,
        noticeContentSha256: PAYLOAD_HASH,
      },
    });
    expect(mocks.prisma.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      { isolationLevel: 'Serializable' }
    );
    expect(
      mocks.tx.candidateOnboardingPacket.updateMany
    ).toHaveBeenCalledWith({
      where: {
        id: '55555555-5555-4555-8555-555555555555',
        ls54Status: { in: ['SENT', 'IN_DISCUSSION'] },
        ls54Version: 3,
        ls54SignedAt: null,
      },
      data: {
        ls54Status: 'SIGNED',
        ls54SignedAt: expect.any(Date),
        ls54DeclinedAt: null,
      },
    });
    expect(mocks.tx.onboardingSignatureEvent.create).toHaveBeenCalledTimes(1);
    expect(mocks.hireCandidate).not.toHaveBeenCalled();
    expect(mocks.promoteHiredSessionToRbt).not.toHaveBeenCalled();
  });

  it.each([
    ['stale version', signInput({ noticeVersion: 2 })],
    [
      'stale content hash',
      signInput({ noticeContentSha256: '0'.repeat(64) }),
    ],
  ])('rejects %s without changing packet or audit evidence', async (_label, input) => {
    const result = await signWageOffer(input);

    expect(result).toMatchObject({
      success: false,
      code: 'WAGE_NOTICE_STALE',
    });
    expect(
      mocks.tx.candidateOnboardingPacket.updateMany
    ).not.toHaveBeenCalled();
    expect(mocks.tx.onboardingSignatureEvent.create).not.toHaveBeenCalled();
    expect(mocks.hireCandidate).not.toHaveBeenCalled();
  });

  it('returns the original durable signature for an exact duplicate sign', async () => {
    mocks.tx.candidateOnboardingPacket.findUnique.mockResolvedValue(
      packet('SIGNED')
    );
    mocks.tx.onboardingSignatureEvent.findFirst.mockResolvedValue({
      auditHash: 'current-signature-audit',
      quizAnswers: {
        version: 3,
        noticeContentSha256: PAYLOAD_HASH,
      },
      deviceFingerprint: FINGERPRINT,
    });

    const result = await signWageOffer(signInput());

    expect(result).toEqual({
      success: true,
      data: {
        auditHash: 'current-signature-audit',
        hired: false,
        requiresStaffFinalHire: true,
        version: 3,
        noticeContentSha256: PAYLOAD_HASH,
      },
    });
    expect(
      mocks.tx.candidateOnboardingPacket.updateMany
    ).not.toHaveBeenCalled();
    expect(mocks.tx.onboardingSignatureEvent.create).not.toHaveBeenCalled();
  });
});

describe('wage notice resend versus signing', () => {
  it('rolls back a stale resend when signing wins the expected-current race', async () => {
    mocks.tx.candidateOnboardingPacket.updateMany.mockResolvedValue({
      count: 0,
    });

    const result = await sendWageOffer(CANDIDATE_ID, PAYLOAD);

    expect(result).toMatchObject({
      success: false,
      code: 'WAGE_NOTICE_STALE',
    });
    expect(mocks.tx.candidateOnboardingPacket.upsert).not.toHaveBeenCalled();
    expect(mocks.tx.atsCandidate.updateMany).not.toHaveBeenCalled();
    expect(mocks.tx.onboardingSignatureEvent.create).not.toHaveBeenCalled();
  });

  it('rolls back and reports stale when the candidate is hired during resend', async () => {
    mocks.tx.atsCandidate.findUnique.mockResolvedValue({
      id: CANDIDATE_ID,
      firstName: 'Ready',
      lastName: 'Candidate',
      stage: 'PHONE_SCREEN',
      activationStatus: 'ACTIVE',
      onboardingPacket: packet(),
    });
    mocks.tx.atsCandidate.updateMany.mockResolvedValue({ count: 0 });

    const result = await sendWageOffer(CANDIDATE_ID, PAYLOAD);

    expect(result).toMatchObject({
      success: false,
      code: 'WAGE_NOTICE_STALE',
    });
    expect(mocks.tx.onboardingSignatureEvent.create).not.toHaveBeenCalled();
  });
});
