import { beforeEach, describe, expect, it, vi } from 'vitest';

const CANDIDATE_ID = '11111111-1111-4111-8111-111111111111';
const APPLICANT_ID = '22222222-2222-4222-8222-222222222222';

const validAvailability = {
  availabilityGrid: {
    version: 1,
    timeZone: 'America/New_York',
    slotMinutes: 60,
    windows: [{ dayOfWeek: 1, startMinute: 9 * 60, endMinute: 12 * 60 }],
  },
  preferredBoroughs: ['Brooklyn'],
  transportation: 'PUBLIC_TRANSIT',
  maxTravelMiles: 15,
};

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  resolveActingRbtContext: vi.fn(),
  revalidatePath: vi.fn(),
  prisma: {
    atsCandidate: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('@/lib/auth', () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock('@/lib/auth-guard', () => ({
  HR_ROLES: ['HEAD_HR', 'HR', 'HR_AGENT'],
  requireRole: vi.fn(),
  requireStaff: vi.fn(),
}));
vi.mock('@/lib/resolveActingRbt', () => ({
  resolveActingRbtContext: mocks.resolveActingRbtContext,
}));
vi.mock('@/lib/devToolsGate', () => ({ isDevToolsEnabled: () => false }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));

import { updateCandidateProgress } from './atsActions';

function candidate(options?: {
  callerSuppliedReadiness?: boolean;
  durableCertificate?: boolean;
  signatureSteps?: number[];
  interview?: {
    status: string;
    recommendation: string | null;
    completedAt: Date | null;
  } | null;
}) {
  const callerSuppliedReadiness = options?.callerSuppliedReadiness ?? false;
  const durableCertificate = options?.durableCertificate ?? false;

  return {
    id: CANDIDATE_ID,
    firstName: 'Known',
    lastName: 'Applicant',
    email: 'known@example.com',
    phone: '(555) 123-4567',
    appliedRole: 'RBT',
    stage: 'PHONE_SCREEN',
    activationStatus: 'INVITATION_SENT',
    userId: null,
    createdAt: new Date('2026-08-01T12:00:00.000Z'),
    updatedAt: new Date('2026-08-02T12:00:00.000Z'),
    dossier: {
      progress: {
        tasksDone: callerSuppliedReadiness,
        availabilityDone: callerSuppliedReadiness,
        simulationDone: callerSuppliedReadiness,
        interviewBooked: callerSuppliedReadiness,
        interviewPassed: callerSuppliedReadiness,
        certUploaded: callerSuppliedReadiness,
        backgroundCleared: false,
        clearedForHire: callerSuppliedReadiness,
      },
    },
    onboardingPacket: {
      magicLinkToken: 'candidate-token',
      tasksDone: callerSuppliedReadiness,
      tasksCompletedSteps: callerSuppliedReadiness
        ? Array.from({ length: 27 }, (_, index) => index + 1)
        : [],
      availabilityDone: callerSuppliedReadiness,
      availabilityGrid: callerSuppliedReadiness
        ? validAvailability.availabilityGrid
        : [],
      preferredBoroughs: callerSuppliedReadiness ? ['Brooklyn'] : [],
      transportation: callerSuppliedReadiness ? 'PUBLIC_TRANSIT' : null,
      maxTravelMiles: 15,
      simulationDone: callerSuppliedReadiness,
      interviewBooked: callerSuppliedReadiness,
      interviewPassed: callerSuppliedReadiness,
      certUploaded: callerSuppliedReadiness,
      backgroundCleared: false,
      clearedForHire: callerSuppliedReadiness,
      formData: durableCertificate
        ? {
            fortyHourCoach: {
              step: 'UPLOADED',
              uploadedAt: '2026-08-02T13:00:00.000Z',
              certFileName: 'certificate.pdf',
              certStoragePath: `${CANDIDATE_ID}/40hr-cert-evidence.pdf`,
            },
          }
        : {},
    },
    signatureEvents: (options?.signatureSteps ?? []).map((stepNumber) => ({
      stepNumber,
      actionType: 'SIGNED',
    })),
    interview: options?.interview ?? null,
    helpTickets: [],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUser.mockResolvedValue({
    id: APPLICANT_ID,
    role: 'APPLICANT',
    isActive: true,
  });
  mocks.resolveActingRbtContext.mockResolvedValue({
    candidateId: CANDIDATE_ID,
    rbtUserId: null,
  });
  mocks.prisma.atsCandidate.findUnique.mockResolvedValue(candidate());
  mocks.prisma.atsCandidate.update.mockResolvedValue(candidate());
});

describe('updateCandidateProgress applicant progress integrity', () => {
  it.each([
    ['task completion', { tasksDone: true }],
    ['interview decision', { interviewPassed: true }],
    ['hire clearance', { clearedForHire: true }],
    ['certificate status', { certUploaded: true }],
    ['offer stage', { stage: 'OFFER' }],
    ['hire stage', { stage: 'HIRED' }],
    ['offer readiness', { offerReady: true }],
    ['hire status', { hired: true }],
  ])('rejects crafted applicant %s fields with a typed validation error', async (_label, patch) => {
    const result = await updateCandidateProgress(
      CANDIDATE_ID,
      patch as Parameters<typeof updateCandidateProgress>[1]
    );

    expect(result).toEqual({
      success: false,
      code: 'INVALID_PROGRESS_UPDATE',
      error: 'This progress update is not allowed.',
    });
    expect(mocks.prisma.atsCandidate.findUnique).not.toHaveBeenCalled();
    expect(mocks.prisma.atsCandidate.update).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it.each(['APPLICANT', 'RBT'])(
    'rejects a mixed allowed and forbidden payload for a %s caller without partial writes',
    async (role) => {
      mocks.getCurrentUser.mockResolvedValue({
        id: APPLICANT_ID,
        role,
        isActive: true,
      });

      const result = await updateCandidateProgress(CANDIDATE_ID, {
        ...validAvailability,
        interviewPassed: true,
      });

      expect(result).toMatchObject({
        success: false,
        code: 'INVALID_PROGRESS_UPDATE',
      });
      expect(mocks.prisma.atsCandidate.findUnique).not.toHaveBeenCalled();
      expect(mocks.prisma.atsCandidate.update).not.toHaveBeenCalled();
    }
  );

  it('accepts applicant-owned availability data and derives completion from the validated record', async () => {
    const result = await updateCandidateProgress(
      CANDIDATE_ID,
      validAvailability
    );

    expect(result).toMatchObject({
      success: true,
      progress: {
        availabilityDone: true,
        tasksDone: false,
        interviewPassed: false,
        certUploaded: false,
        clearedForHire: false,
      },
      stage: 'PHONE_SCREEN',
    });
    expect(mocks.prisma.atsCandidate.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          stage: 'PHONE_SCREEN',
          onboardingPacket: {
            upsert: expect.objectContaining({
              update: expect.objectContaining({
                ...validAvailability,
                availabilityDone: true,
              }),
            }),
          },
        }),
      })
    );
  });

  it('does not advance stage from legacy caller-supplied readiness booleans without evidence', async () => {
    mocks.prisma.atsCandidate.findUnique.mockResolvedValue(
      candidate({ callerSuppliedReadiness: true })
    );

    const result = await updateCandidateProgress(CANDIDATE_ID, {});

    expect(result).toMatchObject({
      success: true,
      progress: {
        tasksDone: false,
        simulationDone: false,
        interviewBooked: false,
        interviewPassed: false,
        certUploaded: false,
        clearedForHire: false,
      },
      stage: 'PHONE_SCREEN',
    });
    expect(mocks.prisma.atsCandidate.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ stage: 'PHONE_SCREEN' }),
      })
    );
  });

  it('recognizes certificate evidence from the durable upload record without accepting a flag', async () => {
    mocks.prisma.atsCandidate.findUnique.mockResolvedValue(
      candidate({ durableCertificate: true })
    );

    const result = await updateCandidateProgress(CANDIDATE_ID, {});

    expect(result).toMatchObject({
      success: true,
      progress: {
        certUploaded: true,
        clearedForHire: false,
      },
      stage: 'PHONE_SCREEN',
    });
  });

  it('rebuilds task and interview readiness from their durable evidence records', async () => {
    mocks.prisma.atsCandidate.findUnique.mockResolvedValue(
      candidate({
        durableCertificate: true,
        signatureSteps: Array.from({ length: 27 }, (_, index) => index + 1),
        interview: {
          status: 'COMPLETED',
          recommendation: 'ADVANCE',
          completedAt: new Date('2026-08-03T15:00:00.000Z'),
        },
      })
    );

    const result = await updateCandidateProgress(CANDIDATE_ID, {});

    expect(result).toMatchObject({
      success: true,
      progress: {
        tasksDone: true,
        interviewBooked: true,
        interviewPassed: true,
        certUploaded: true,
        simulationDone: false,
        clearedForHire: false,
      },
      stage: 'PHONE_SCREEN',
    });
    expect(mocks.prisma.atsCandidate.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          onboardingPacket: {
            upsert: expect.objectContaining({
              update: expect.objectContaining({
                tasksDone: true,
                tasksCompletedSteps: Array.from(
                  { length: 27 },
                  (_, index) => index + 1
                ),
                interviewPassed: true,
                simulationDone: false,
              }),
            }),
          },
        }),
      })
    );
  });

  it('preserves the narrow staff background-clearance decision path', async () => {
    mocks.getCurrentUser.mockResolvedValue({
      id: '33333333-3333-4333-8333-333333333333',
      role: 'HEAD_HR',
      isActive: true,
    });

    const result = await updateCandidateProgress(CANDIDATE_ID, {
      backgroundCleared: true,
    });

    expect(result).toMatchObject({
      success: true,
      progress: {
        backgroundCleared: true,
        clearedForHire: false,
      },
    });
    expect(mocks.resolveActingRbtContext).not.toHaveBeenCalled();
    expect(mocks.prisma.atsCandidate.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          onboardingPacket: {
            upsert: expect.objectContaining({
              update: expect.objectContaining({ backgroundCleared: true }),
            }),
          },
        }),
      })
    );
  });
});
