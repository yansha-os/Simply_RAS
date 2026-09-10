import { beforeEach, describe, expect, it, vi } from 'vitest';

const CANDIDATE_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_CANDIDATE_ID = '22222222-2222-4222-8222-222222222222';
const INTERVIEWER_ID = '33333333-3333-4333-8333-333333333333';
const FINGERPRINT = '44444444-4444-4444-8444-444444444444';

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  requireRole: vi.fn(),
  requireStaff: vi.fn(),
  resolveFingerprintValidCandidate: vi.fn(),
  cookieGet: vi.fn(),
  revalidatePath: vi.fn(),
  prisma: {
    user: { findFirst: vi.fn(), findMany: vi.fn() },
    atsCandidate: { findUnique: vi.fn(), update: vi.fn() },
    atsInterview: { findUnique: vi.fn(), upsert: vi.fn(), updateMany: vi.fn() },
    notification: { create: vi.fn() },
  },
}));

vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('@/lib/auth', () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock('@/lib/auth-guard', () => ({
  requireRole: mocks.requireRole,
  requireStaff: mocks.requireStaff,
}));
vi.mock('@/lib/devToolsGate', () => ({ isDevToolsEnabled: () => false }));
vi.mock('@/lib/magicLinkExpiry', () => ({
  newMagicLinkExpiry: () => new Date('2026-10-01T00:00:00.000Z'),
}));
vi.mock('@/lib/candidateDeviceSession', () => ({
  CANDIDATE_SESSION_COOKIE: 'ras_device_session_token',
  DEVICE_FINGERPRINT_COOKIE: 'device_fingerprint',
  resolveFingerprintValidCandidate: mocks.resolveFingerprintValidCandidate,
}));
vi.mock('@/lib/atsStage', () => ({
  asRecord: (value: unknown) =>
    value && typeof value === 'object' && !Array.isArray(value) ? value : {},
  deriveAtsStage: () => 'INTERVIEW',
  readProgressFromPacket: () => ({}),
}));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({ get: mocks.cookieGet })),
}));

import {
  bookHrInterview,
  getAtsInterview,
  getHrMembers,
  releaseAtsInterviewClaim,
  saveInterviewScorecard,
  saveInterviewScriptProgress,
} from './hrInterviewActions';

function interviewRow() {
  return {
    id: '55555555-5555-4555-8555-555555555555',
    candidateId: CANDIDATE_ID,
    interviewerUserId: INTERVIEWER_ID,
    claimedByUserId: null,
    scheduledDate: '2026-09-12',
    scheduledTime: '10:00',
    scheduledAt: new Date('2026-09-05T12:00:00.000Z'),
    meetingCode: 'room',
    meetingLink: 'https://meet.jit.si/room',
    status: 'SCHEDULED',
    hrJoinedAt: null,
    scorecard: {},
    interviewerNotes: null,
    scriptProgress: {},
    recommendation: null,
    completedAt: null,
    interviewer: { firstName: 'Harper', lastName: 'Reed', role: 'HR_AGENT' },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUser.mockResolvedValue(null);
  mocks.resolveFingerprintValidCandidate.mockResolvedValue(null);
  mocks.requireStaff.mockResolvedValue({
    ok: true,
    user: { id: INTERVIEWER_ID, role: 'HEAD_HR', isActive: true },
  });
  mocks.cookieGet.mockImplementation((name: string) => {
    if (name === 'ras_device_session_token') return { value: CANDIDATE_ID };
    if (name === 'device_fingerprint') return { value: FINGERPRINT };
    return undefined;
  });
});

describe('HR interview claim release', () => {
  it('denies unauthorized releases before touching interview data', async () => {
    mocks.requireStaff.mockResolvedValue({
      ok: false,
      error: 'You are not authorized to perform this action.',
    });

    const result = await releaseAtsInterviewClaim(CANDIDATE_ID);

    expect(result).toEqual({
      success: false,
      error: 'You are not authorized to perform this action.',
    });
    expect(mocks.prisma.atsInterview.updateMany).not.toHaveBeenCalled();
  });

  it('conditionally releases only an unstarted active claim', async () => {
    mocks.prisma.atsInterview.updateMany.mockResolvedValue({ count: 1 });

    const result = await releaseAtsInterviewClaim(CANDIDATE_ID);

    expect(result).toEqual({ success: true });
    expect(mocks.prisma.atsInterview.updateMany).toHaveBeenCalledWith({
      where: {
        candidateId: CANDIDATE_ID,
        claimedByUserId: { not: null },
        hrJoinedAt: null,
        completedAt: null,
        status: { in: ['SCHEDULED', 'IN_PROGRESS'] },
      },
      data: { claimedByUserId: null, status: 'SCHEDULED' },
    });
  });

  it('reports a stale or already-started claim without claiming success', async () => {
    mocks.prisma.atsInterview.updateMany.mockResolvedValue({ count: 0 });

    const result = await releaseAtsInterviewClaim(CANDIDATE_ID);

    expect(result).toMatchObject({ success: false, error: expect.stringMatching(/already/i) });
  });
});

describe('HR interview scorecard persistence', () => {
  const validScorecard = Object.fromEntries(
    [
      'communication', 'adaptability', 'professionalism', 'empathy',
      'abaBasics', 'documentation', 'reliability', 'availabilityFit',
    ].map((key) => [key, { score: 4, comment: `${key} evidence` }])
  );

  it('denies unauthorized saves before validating or writing data', async () => {
    mocks.requireStaff.mockResolvedValue({ ok: false, error: 'Forbidden.' });

    const result = await saveInterviewScorecard(CANDIDATE_ID, validScorecard);

    expect(result).toEqual({ success: false, error: 'Forbidden.' });
    expect(mocks.prisma.atsInterview.upsert).not.toHaveBeenCalled();
  });

  it('rejects malformed categories and out-of-range ratings', async () => {
    const malformed = { ...validScorecard, communication: { score: 6, comment: 'No' } };

    const result = await saveInterviewScorecard(CANDIDATE_ID, malformed);

    expect(result).toEqual({ success: false, error: 'Scorecard data is invalid.' });
    expect(mocks.prisma.atsInterview.upsert).not.toHaveBeenCalled();
  });

  it('persists the exact validated scorecard contract', async () => {
    mocks.prisma.atsInterview.upsert.mockResolvedValue(interviewRow());

    const result = await saveInterviewScorecard(CANDIDATE_ID, validScorecard);

    expect(result.success).toBe(true);
    expect(mocks.prisma.atsInterview.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { candidateId: CANDIDATE_ID },
        update: { scorecard: validScorecard },
      })
    );
  });
});

describe('HR interview script progress persistence', () => {
  it('denies unauthorized saves before writing data', async () => {
    mocks.requireStaff.mockResolvedValue({ ok: false, error: 'Forbidden.' });

    const result = await saveInterviewScriptProgress(CANDIDATE_ID, [0]);

    expect(result).toEqual({ success: false, error: 'Forbidden.' });
    expect(mocks.prisma.atsInterview.upsert).not.toHaveBeenCalled();
  });

  it('rejects duplicate, out-of-range, fractional, nonnumeric, and oversized progress', async () => {
    const invalidProgress: unknown[] = [
      [0, 0],
      [-1],
      [11],
      [1.5],
      ['1'],
      Array.from({ length: 12 }, (_, index) => index),
    ];

    for (const progress of invalidProgress) {
      const result = await saveInterviewScriptProgress(CANDIDATE_ID, progress);

      expect(result).toEqual({ success: false, error: 'Interview script progress is invalid.' });
      expect(mocks.prisma.atsInterview.upsert).not.toHaveBeenCalled();
    }
  });

  it('sorts and persists a unique valid step set', async () => {
    mocks.prisma.atsInterview.upsert.mockResolvedValue(interviewRow());

    const result = await saveInterviewScriptProgress(CANDIDATE_ID, [10, 0, 4]);

    expect(result.success).toBe(true);
    expect(mocks.prisma.atsInterview.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: { scriptProgress: { completedSteps: [0, 4, 10] } },
      })
    );
  });
});

describe('HR interview candidate scope', () => {
  it('does not expose the HR directory to raw applicant cookies', async () => {
    const result = await getHrMembers();

    expect(result).toMatchObject({ success: false, data: [] });
    expect(mocks.prisma.user.findMany).not.toHaveBeenCalled();
  });

  it('allows a fingerprint-valid applicant to load the interview directory', async () => {
    mocks.resolveFingerprintValidCandidate.mockResolvedValue({
      id: CANDIDATE_ID,
      userId: null,
      stage: 'INTERVIEW',
      activationStatus: 'ACTIVE',
    });
    mocks.prisma.user.findMany.mockResolvedValue([
      {
        id: INTERVIEWER_ID,
        firstName: 'Harper',
        lastName: 'Reed',
        role: 'HR_AGENT',
        email: 'harper@example.test',
      },
    ]);

    const result = await getHrMembers();

    expect(result).toMatchObject({
      success: true,
      data: [{ id: INTERVIEWER_ID, name: 'Harper Reed' }],
    });
  });

  it('rejects booking another candidate before reading or mutating ATS data', async () => {
    mocks.resolveFingerprintValidCandidate.mockResolvedValue({
      id: OTHER_CANDIDATE_ID,
      userId: null,
      stage: 'INTERVIEW',
      activationStatus: 'ACTIVE',
    });

    const result = await bookHrInterview({
      candidateId: CANDIDATE_ID,
      candidateName: 'Forged Applicant',
      hrInterviewerId: INTERVIEWER_ID,
      hrInterviewerName: 'Forged Interviewer',
      date: '2026-09-12',
      time: '10:00',
    });

    expect(result).toMatchObject({ success: false });
    expect(mocks.prisma.atsCandidate.findUnique).not.toHaveBeenCalled();
    expect(mocks.prisma.atsInterview.upsert).not.toHaveBeenCalled();
  });

  it('rejects reading another candidate interview', async () => {
    mocks.resolveFingerprintValidCandidate.mockResolvedValue({
      id: OTHER_CANDIDATE_ID,
      userId: null,
      stage: 'INTERVIEW',
      activationStatus: 'ACTIVE',
    });

    const result = await getAtsInterview(CANDIDATE_ID);

    expect(result).toMatchObject({ success: false });
    expect(mocks.prisma.atsInterview.findUnique).not.toHaveBeenCalled();
  });

  it('does not return internal HR interview notes to the applicant owner', async () => {
    mocks.resolveFingerprintValidCandidate.mockResolvedValue({
      id: CANDIDATE_ID,
      userId: null,
      stage: 'INTERVIEW',
      activationStatus: 'ACTIVE',
    });

    const result = await getAtsInterview(CANDIDATE_ID);

    expect(result).toMatchObject({ success: false });
    expect(mocks.prisma.atsInterview.findUnique).not.toHaveBeenCalled();
  });

  it('allows ATS staff to read the internal interview record', async () => {
    mocks.getCurrentUser.mockResolvedValue({
      id: '66666666-6666-4666-8666-666666666666',
      role: 'HEAD_HR',
      isActive: true,
    });
    mocks.prisma.atsInterview.findUnique.mockResolvedValue(interviewRow());

    const result = await getAtsInterview(CANDIDATE_ID);

    expect(result).toMatchObject({
      success: true,
      data: {
        candidateId: CANDIDATE_ID,
        interviewerNotes: null,
        recommendation: null,
      },
    });
  });

  it('allows the fingerprint-validated owner and derives the interviewer from the database', async () => {
    mocks.resolveFingerprintValidCandidate.mockResolvedValue({
      id: CANDIDATE_ID,
      userId: null,
      stage: 'INTERVIEW',
      activationStatus: 'ACTIVE',
    });
    mocks.prisma.atsCandidate.findUnique.mockResolvedValue({
      id: CANDIDATE_ID,
      firstName: 'Avery',
      lastName: 'Stone',
      stage: 'INTERVIEW',
      activationStatus: 'ACTIVE',
      dossier: {},
      onboardingPacket: null,
    });
    mocks.prisma.user.findFirst.mockResolvedValue({
      id: INTERVIEWER_ID,
      firstName: 'Harper',
      lastName: 'Reed',
    });
    mocks.prisma.atsInterview.upsert.mockResolvedValue(interviewRow());
    mocks.prisma.atsCandidate.update.mockResolvedValue({ id: CANDIDATE_ID });
    mocks.prisma.notification.create.mockResolvedValue({ id: 'notification-id' });

    const result = await bookHrInterview({
      candidateId: CANDIDATE_ID,
      candidateName: 'Browser Supplied Name',
      hrInterviewerId: INTERVIEWER_ID,
      hrInterviewerName: 'Browser Supplied Interviewer',
      date: '2026-09-12',
      time: '10:00',
    });

    expect(result).toMatchObject({
      success: true,
      message: 'Interview successfully booked with Harper Reed!',
    });
    expect(JSON.stringify(result)).not.toMatch(
      /scorecard|interviewerNotes|scriptProgress|recommendation/
    );
    expect(mocks.prisma.user.findFirst).toHaveBeenCalledWith({
      where: {
        id: INTERVIEWER_ID,
        role: { in: ['HR_AGENT', 'HEAD_HR'] },
        isActive: true,
      },
      select: { id: true, firstName: true, lastName: true },
    });
  });
});
