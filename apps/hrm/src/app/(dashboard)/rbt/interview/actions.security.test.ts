import { beforeEach, describe, expect, it, vi } from 'vitest';

const CANDIDATE_ID = '11111111-1111-4111-8111-111111111111';
const FINGERPRINT = '22222222-2222-4222-8222-222222222222';

const mocks = vi.hoisted(() => ({
  cookieGet: vi.fn((name: string) => {
    if (name === 'ras_device_session_token') return { value: CANDIDATE_ID };
    if (name === 'device_fingerprint') return { value: FINGERPRINT };
    return undefined;
  }),
  getCurrentUser: vi.fn(),
  prisma: {
    applicantDeviceSession: { findUnique: vi.fn() },
    atsCandidate: { findUnique: vi.fn(), findFirst: vi.fn() },
    user: { findMany: vi.fn() },
  },
}));

vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('@/lib/auth', () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock('@/lib/devToolsGate', () => ({ isDevToolsEnabled: () => false }));
vi.mock('@/lib/magicLinkExpiry', () => ({
  newMagicLinkExpiry: () => new Date('2026-09-12T12:00:00.000Z'),
}));
vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({ get: mocks.cookieGet })),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { getInterviewPortalSnapshot } from './actions';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.prisma.applicantDeviceSession.findUnique.mockResolvedValue({
    revokedAt: null,
    boundAt: new Date(),
    candidate: { stage: 'INTERVIEW', activationStatus: 'ACTIVE' },
  });
  mocks.prisma.atsCandidate.findUnique.mockResolvedValue({
    firstName: 'Applicant',
    stage: 'INTERVIEW',
    activationStatus: 'ACTIVE',
    dossier: {},
    onboardingPacket: {
      interviewBooked: true,
      interviewPassed: false,
    },
    interview: {
      id: '33333333-3333-4333-8333-333333333333',
      status: 'COMPLETED',
      recommendation: 'REJECT',
      interviewerUserId: '44444444-4444-4444-8444-444444444444',
      scheduledDate: '2026-09-08',
      scheduledTime: '09:00 AM ET',
      meetingLink: 'https://meet.jit.si/private-room',
      hrJoinedAt: new Date('2026-09-08T13:00:00.000Z'),
      completedAt: new Date('2026-09-08T14:00:00.000Z'),
      interviewer: { firstName: 'Internal', lastName: 'Reviewer' },
    },
  });
  mocks.prisma.user.findMany.mockResolvedValue([]);
  mocks.getCurrentUser.mockResolvedValue(null);
});

describe('applicant interview portal privacy', () => {
  it('does not expose the recruiter recommendation in the applicant snapshot', async () => {
    const result = await getInterviewPortalSnapshot();

    expect(result).toMatchObject({ success: true });
    expect(JSON.stringify(result)).not.toContain('recommendation');
    expect(JSON.stringify(result)).not.toContain('REJECT');
  });

  it('does not allow an inactive RBT auth fallback without a valid device session', async () => {
    mocks.cookieGet.mockReturnValue(undefined);
    mocks.getCurrentUser.mockResolvedValue({
      id: '55555555-5555-4555-8555-555555555555',
      role: 'RBT',
      isActive: false,
    });

    const result = await getInterviewPortalSnapshot();

    expect(result).toMatchObject({ success: false, reason: 'NO_SESSION' });
    expect(mocks.prisma.atsCandidate.findFirst).not.toHaveBeenCalled();
    expect(mocks.prisma.atsCandidate.findUnique).not.toHaveBeenCalled();
  });
});
