import { beforeEach, describe, expect, it, vi } from 'vitest';

const ACTOR_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_RBT_ID = '22222222-2222-4222-8222-222222222222';
const BCBA_ID = '33333333-3333-4333-8333-333333333333';
const CLIENT_ID = '44444444-4444-4444-8444-444444444444';
const SESSION_ID = '55555555-5555-4555-8555-555555555555';
const TARGET_ID = '66666666-6666-4666-8666-666666666666';
const NOTE_ID = '77777777-7777-4777-8777-777777777777';
const BEHAVIOR_TARGET_ID = '88888888-8888-4888-8888-888888888888';
const EVV_ID = '99999999-9999-4999-8999-999999999999';
const NOTE_UPDATED_AT = new Date('2026-08-12T15:01:00.000Z');

const mocks = vi.hoisted(() => {
  const tx = {
    session: {
      updateMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
    sessionNote: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
      upsert: vi.fn(),
    },
    sessionTrialData: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
    behaviorLog: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
    eVVLog: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    auditLogVault: {
      create: vi.fn(),
    },
  };

  return {
    resolveActingRbtContext: vi.fn(),
    resolveActingRbtUserId: vi.fn(),
    revalidatePath: vi.fn(),
    writeAuditLog: vi.fn(),
    createNotification: vi.fn(),
    tx,
    prisma: {
      user: {
        findFirst: vi.fn(),
      },
      session: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      sessionNote: {
        findUnique: vi.fn(),
      },
      client: {
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
      },
      skillTarget: {
        findMany: vi.fn(),
      },
      behaviorTarget: {
        findMany: vi.fn(),
        create: vi.fn(),
      },
      eVVLog: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
      },
      $transaction: vi.fn(),
    },
  };
});

vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('@/lib/resolveActingRbt', () => ({
  resolveActingRbtContext: mocks.resolveActingRbtContext,
  resolveActingRbtUserId: mocks.resolveActingRbtUserId,
}));
vi.mock('@/lib/devToolsGate', () => ({ isDevToolsEnabled: () => false }));
vi.mock('@/lib/auth', () => ({ getCurrentUser: vi.fn() }));
vi.mock('@/lib/auditLog', () => ({ writeAuditLog: mocks.writeAuditLog }));
vi.mock('@/app/actions/notifications', () => ({
  createNotification: mocks.createNotification,
}));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));

import * as sessionActions from './sessionEmrActions';
import type { SubmitHrmSessionNotePayload } from './sessionEmrActions';

const {
  clockInHrmSession,
  getSessionStudioTargets,
  submitHrmSessionEmrNote,
} = sessionActions;

type ClockOutAction = (input: {
  sessionId: string;
  closeReason?: 'INCOMPLETE' | 'CLAIM_READY';
  coordinates?: { latitude: number; longitude: number };
}) => Promise<{
  success: boolean;
  code?: string;
  error?: string;
  startedAt?: string;
  endedAt?: string;
  durationSeconds?: number;
  billableUnits?: number;
  locationVerified?: boolean;
  reconciled?: boolean;
  documentationStatus?: 'PENDING';
}>;

function clockOutAction(): ClockOutAction {
  const action = (
    sessionActions as typeof sessionActions & {
      clockOutHrmSession?: ClockOutAction;
    }
  ).clockOutHrmSession;
  expect(action).toBeTypeOf('function');
  return action!;
}

function openEvvLog(overrides: Record<string, unknown> = {}) {
  return {
    id: EVV_ID,
    sessionId: SESSION_ID,
    staffId: ACTOR_ID,
    clockInTimestamp: new Date('2026-08-12T14:00:00.000Z'),
    clockOutTimestamp: null,
    clockInLat: null,
    clockInLng: null,
    clockOutLat: null,
    clockOutLng: null,
    isLocationVerified: false,
    ...overrides,
  };
}

function closedEvvLog(overrides: Record<string, unknown> = {}) {
  return openEvvLog({
    clockOutTimestamp: new Date('2026-08-12T15:00:00.000Z'),
    ...overrides,
  });
}

function mockDurableCompletedClockOut() {
  const log = closedEvvLog();
  mocks.prisma.eVVLog.findMany.mockResolvedValue([log]);
  mocks.tx.eVVLog.findMany.mockResolvedValue([log]);
}

function assignedSession(overrides: Record<string, unknown> = {}) {
  return {
    id: SESSION_ID,
    clientId: CLIENT_ID,
    rbtId: ACTOR_ID,
    bcbaId: BCBA_ID,
    status: 'SCHEDULED',
    scheduledStart: new Date('2026-08-12T14:00:00.000Z'),
    scheduledEnd: new Date('2026-08-12T16:00:00.000Z'),
    actualStart: null,
    actualEnd: null,
    cptCode: '97153',
    location: '12 - Home',
    placeOfServiceCode: '12',
    note: null,
    client: {
      id: CLIENT_ID,
      firstName: 'Demo',
      lastName: 'Learner',
      rbtId: ACTOR_ID,
      bcbaId: BCBA_ID,
    },
    bcba: {
      id: BCBA_ID,
      role: 'BCBA',
      isActive: true,
    },
    ...overrides,
  };
}

function claimReadyPayload(
  overrides: Partial<SubmitHrmSessionNotePayload> = {}
): SubmitHrmSessionNotePayload {
  return {
    sessionId: SESSION_ID,
    rbtUserId: ACTOR_ID,
    clientId: CLIENT_ID,
    clientName: 'Demo Learner',
    cptCode: '97153',
    locationCode: '12 - Home',
    sessionSeconds: 60 * 60,
    billableUnits: 4,
    startedAt: '2026-08-12T14:00:00.000Z',
    endedAt: '2026-08-12T15:00:00.000Z',
    caregiverPresent: 'YES',
    caregiverName: 'Maria Lopez',
    caregiverParticipation:
      'Caregiver observed manding trials and practiced prompt fading during debrief.',
    goalsAddressed: 'Manding for preferred items',
    objectiveData: 'Manding was independently correct in eight of ten recorded trials.',
    interventions: ['DTT'],
    clientResponse:
      'Client responded to differential reinforcement with improved independent requesting across trials.',
    barriersSafety: 'None noted.',
    planNext: 'Continue manding targets and fade gestural prompts next session.',
    trials: [
      {
        targetId: TARGET_ID,
        targetGoal: 'Mands for preferred item',
        response: 'CORRECT',
        timestamp: '2026-08-12T14:05:00.000Z',
      },
    ],
    rbtSignature: 'Riley Tran, RBT',
    parentSignature: 'Maria Lopez',
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();

  mocks.resolveActingRbtContext.mockResolvedValue({
    rbtUserId: ACTOR_ID,
    candidateId: null,
  });
  mocks.resolveActingRbtUserId.mockResolvedValue(ACTOR_ID);
  mocks.prisma.user.findFirst.mockResolvedValue({
    id: ACTOR_ID,
    role: 'RBT',
    isActive: true,
    firstName: 'Riley',
    lastName: 'Tran',
  });

  const session = assignedSession();
  mocks.prisma.session.findUnique.mockResolvedValue(session);
  mocks.prisma.session.update.mockResolvedValue({
    ...session,
    status: 'IN_PROGRESS',
    actualStart: new Date('2026-08-12T14:00:00.000Z'),
  });
  mocks.prisma.client.findUnique.mockResolvedValue(session.client);
  mocks.prisma.client.findFirst.mockResolvedValue(null);
  mocks.prisma.sessionNote.findUnique.mockResolvedValue(null);
  mocks.prisma.skillTarget.findMany.mockResolvedValue([]);
  mocks.prisma.behaviorTarget.findMany.mockResolvedValue([]);
  mocks.prisma.eVVLog.findFirst.mockResolvedValue(null);
  mocks.prisma.eVVLog.findMany.mockResolvedValue([]);
  mocks.prisma.eVVLog.create.mockResolvedValue({ id: 'evv-id' });

  mocks.tx.session.updateMany.mockResolvedValue({ count: 1 });
  mocks.tx.session.findUnique.mockResolvedValue({
    ...session,
    status: 'IN_PROGRESS',
    actualStart: new Date('2026-08-12T14:00:00.000Z'),
  });
  mocks.tx.session.findFirst.mockResolvedValue({
    ...session,
    status: 'COMPLETED',
    actualStart: new Date('2026-08-12T14:00:00.000Z'),
    actualEnd: new Date('2026-08-12T15:00:00.000Z'),
  });
  mocks.tx.sessionNote.findUnique.mockResolvedValue(null);
  mocks.tx.sessionNote.updateMany.mockResolvedValue({ count: 1 });
  mocks.tx.sessionNote.create.mockResolvedValue({
    id: NOTE_ID,
    sessionId: SESSION_ID,
    isConverted: false,
    bcbaSigned: false,
  });
  mocks.tx.sessionNote.upsert.mockResolvedValue({
    id: NOTE_ID,
    sessionId: SESSION_ID,
    isConverted: false,
  });
  mocks.tx.sessionTrialData.deleteMany.mockResolvedValue({ count: 0 });
  mocks.tx.sessionTrialData.createMany.mockResolvedValue({ count: 0 });
  mocks.tx.behaviorLog.deleteMany.mockResolvedValue({ count: 0 });
  mocks.tx.behaviorLog.createMany.mockResolvedValue({ count: 0 });
  mocks.tx.eVVLog.findFirst.mockResolvedValue(null);
  mocks.tx.eVVLog.findMany.mockResolvedValue([openEvvLog()]);
  mocks.tx.eVVLog.create.mockResolvedValue({ id: 'evv-id' });
  mocks.tx.eVVLog.updateMany.mockResolvedValue({ count: 1 });
  mocks.tx.eVVLog.deleteMany.mockResolvedValue({ count: 0 });
  mocks.tx.auditLogVault.create.mockResolvedValue({ id: 'audit-id' });
  mocks.createNotification.mockResolvedValue({ success: true });
  mocks.prisma.$transaction.mockImplementation(
    async (callback: (tx: typeof mocks.tx) => Promise<unknown>) => callback(mocks.tx)
  );
});

describe('clockInHrmSession assignment security', () => {
  it('rejects an unauthenticated caller before any session read', async () => {
    mocks.resolveActingRbtContext.mockResolvedValue({
      rbtUserId: null,
      candidateId: null,
    });
    mocks.resolveActingRbtUserId.mockResolvedValue(null);

    const result = await clockInHrmSession({ sessionId: SESSION_ID });

    expect(result).toMatchObject({ success: false });
    expect(result.error).toMatch(/authenticated RBT/i);
    expect(mocks.prisma.session.findUnique).not.toHaveBeenCalled();
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a session assigned to another RBT without writing', async () => {
    mocks.prisma.session.findUnique.mockResolvedValue(
      assignedSession({ rbtId: OTHER_RBT_ID })
    );

    const result = await clockInHrmSession({ sessionId: SESSION_ID });

    expect(result).toMatchObject({ success: false });
    expect(result.error).toMatch(/different RBT/i);
    expect(mocks.prisma.session.update).not.toHaveBeenCalled();
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a session when the client is no longer assigned to the acting RBT', async () => {
    mocks.prisma.session.findUnique.mockResolvedValue(
      assignedSession({
        client: {
          id: CLIENT_ID,
          firstName: 'Demo',
          lastName: 'Learner',
          rbtId: OTHER_RBT_ID,
          bcbaId: BCBA_ID,
        },
      })
    );

    const result = await clockInHrmSession({ sessionId: SESSION_ID });

    expect(result).toMatchObject({ success: false });
    expect(result.error).toMatch(/assigned RBT.*client/i);
    expect(mocks.prisma.session.update).not.toHaveBeenCalled();
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a persisted 97155 session with a qualified-clinician workflow error', async () => {
    mocks.prisma.session.findUnique.mockResolvedValue(
      assignedSession({
        cptCode: '97155',
        location: '11 - Clinic',
        placeOfServiceCode: '11',
      })
    );

    const result = await clockInHrmSession({
      sessionId: SESSION_ID,
      cptCode: '97155',
      placeOfService: '11 - Clinic',
    });

    expect(result).toMatchObject({
      success: false,
      code: 'QUALIFIED_CLINICIAN_WORKFLOW_REQUIRED',
    });
    expect(result.error).toMatch(/qualified clinician|BCBA/i);
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a forged CPT that mismatches the persisted 97153 session', async () => {
    const result = await clockInHrmSession({
      sessionId: SESSION_ID,
      cptCode: '97155',
      placeOfService: '12 - Home',
    });

    expect(result).toMatchObject({
      success: false,
      code: 'SESSION_CPT_MISMATCH',
    });
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: 'missing durable CPT',
      overrides: { cptCode: null },
      code: 'SESSION_CPT_MISSING',
    },
    {
      name: 'unknown durable CPT',
      overrides: { cptCode: '99999' },
      code: 'SESSION_CPT_UNSUPPORTED',
    },
    {
      name: 'missing durable POS',
      overrides: { placeOfServiceCode: null },
      code: 'SESSION_POS_MISSING',
    },
    {
      name: 'unknown durable POS',
      overrides: {
        location: '88 - Unknown',
        placeOfServiceCode: '88',
      },
      code: 'SESSION_POS_UNSUPPORTED',
    },
  ])('fails closed before clock-in for $name', async ({ overrides, code }) => {
    mocks.prisma.session.findUnique.mockResolvedValue(assignedSession(overrides));

    const result = await clockInHrmSession({
      sessionId: SESSION_ID,
      cptCode: '97153',
      placeOfService: '12 - Home',
    });

    expect(result).toMatchObject({ success: false, code });
    expect(result.error).toMatch(/manual review|Operations|Clinical/i);
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('reconciles a concurrent clock-in winner to the same durable start', async () => {
    mocks.prisma.session.findUnique
      .mockResolvedValueOnce(assignedSession())
      .mockResolvedValueOnce(
        assignedSession({
          status: 'IN_PROGRESS',
          actualStart: new Date('2026-08-12T14:00:00.000Z'),
        })
      );
    mocks.prisma.eVVLog.findMany.mockResolvedValue([openEvvLog()]);
    mocks.tx.session.updateMany.mockResolvedValue({ count: 0 });

    const result = await clockInHrmSession({ sessionId: SESSION_ID });

    expect(result).toMatchObject({
      success: true,
      startedAt: '2026-08-12T14:00:00.000Z',
      reconciled: true,
    });
    expect(mocks.tx.auditLogVault.create).not.toHaveBeenCalled();
    expect(mocks.tx.eVVLog.create).not.toHaveBeenCalled();
  });

  it('conditionally clocks in the valid assigned session and audits atomically', async () => {
    const result = await clockInHrmSession({
      sessionId: SESSION_ID,
      placeOfService: '12 - Home',
      cptCode: '97153',
      startedAt: '2026-08-12T14:00:00.000Z',
    });

    expect(result).toMatchObject({
      success: true,
      sessionId: SESSION_ID,
      status: 'IN_PROGRESS',
      startedAt: '2026-08-12T14:00:00.000Z',
    });
    expect(mocks.tx.session.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: SESSION_ID,
          rbtId: ACTOR_ID,
          status: 'SCHEDULED',
        }),
      })
    );
    expect(mocks.tx.eVVLog.create).toHaveBeenCalledTimes(1);
    expect(mocks.tx.eVVLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          clockInLat: null,
          clockInLng: null,
          isLocationVerified: false,
        }),
      })
    );
    expect(mocks.tx.auditLogVault.create).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.session.update).not.toHaveBeenCalled();
    expect(mocks.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: BCBA_ID,
        type: 'SESSION_STARTED',
      })
    );
  });

  it('ignores a forged caller start and writes one server-captured timestamp', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-12T14:30:00.000Z'));
    mocks.tx.session.findUnique.mockResolvedValue(
      assignedSession({
        status: 'IN_PROGRESS',
        actualStart: new Date('2026-08-12T14:30:00.000Z'),
      })
    );

    try {
      const result = await clockInHrmSession({
        sessionId: SESSION_ID,
        startedAt: '1999-01-01T00:00:00.000Z',
        coordinates: { latitude: 25.7617, longitude: -80.1918 },
      });

      expect(result).toMatchObject({
        success: true,
        startedAt: '2026-08-12T14:30:00.000Z',
      });
      expect(mocks.tx.session.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            actualStart: new Date('2026-08-12T14:30:00.000Z'),
          }),
        })
      );
      expect(mocks.tx.eVVLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            clockInTimestamp: new Date('2026-08-12T14:30:00.000Z'),
            clockInLat: 25.7617,
            clockInLng: -80.1918,
            isLocationVerified: false,
          }),
        })
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not fail the committed clock-in when notification delivery throws', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.createNotification.mockRejectedValue(new Error('notification unavailable'));

    try {
      const result = await clockInHrmSession({ sessionId: SESSION_ID });

      expect(result).toMatchObject({
        success: true,
        sessionId: SESSION_ID,
        status: 'IN_PROGRESS',
      });
      expect(mocks.tx.session.updateMany).toHaveBeenCalledTimes(1);
      expect(mocks.tx.auditLogVault.create).toHaveBeenCalledTimes(1);
      expect(consoleError).toHaveBeenCalledWith(
        'clockInHrmSession notify failed:',
        'notification unavailable'
      );
    } finally {
      consoleError.mockRestore();
    }
  });
});

describe('clockOutHrmSession authoritative close', () => {
  it('atomically freezes service time, closes one EVV row, and leaves location unverified', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-12T15:00:00.000Z'));
    const inProgress = assignedSession({
      status: 'IN_PROGRESS',
      actualStart: new Date('2026-08-12T14:00:00.000Z'),
    });
    mocks.prisma.session.findUnique.mockResolvedValue(inProgress);
    mocks.tx.session.findUnique.mockResolvedValue({
      ...inProgress,
      status: 'COMPLETED',
      actualEnd: new Date('2026-08-12T15:00:00.000Z'),
    });

    try {
      const result = await clockOutAction()({
        sessionId: SESSION_ID,
        closeReason: 'INCOMPLETE',
        coordinates: { latitude: 25.7617, longitude: -80.1918 },
      });

      expect(result).toMatchObject({
        success: true,
        startedAt: '2026-08-12T14:00:00.000Z',
        endedAt: '2026-08-12T15:00:00.000Z',
        durationSeconds: 3_600,
        billableUnits: 4,
        locationVerified: false,
      });
      expect(mocks.tx.session.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: SESSION_ID,
            status: 'IN_PROGRESS',
            actualEnd: null,
          }),
          data: expect.objectContaining({
            status: 'COMPLETED',
            actualEnd: new Date('2026-08-12T15:00:00.000Z'),
          }),
        })
      );
      expect(mocks.tx.eVVLog.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: EVV_ID,
            clockOutTimestamp: null,
          }),
          data: expect.objectContaining({
            clockOutTimestamp: new Date('2026-08-12T15:00:00.000Z'),
            clockOutLat: 25.7617,
            clockOutLng: -80.1918,
            isLocationVerified: false,
          }),
        })
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('returns the same completed clock-out on a repeated request', async () => {
    mocks.prisma.session.findUnique.mockResolvedValue(
      assignedSession({
        status: 'COMPLETED',
        actualStart: new Date('2026-08-12T14:00:00.000Z'),
        actualEnd: new Date('2026-08-12T15:00:00.000Z'),
      })
    );
    mocks.prisma.eVVLog.findMany.mockResolvedValue([closedEvvLog()]);

    const result = await clockOutAction()({ sessionId: SESSION_ID });

    expect(result).toMatchObject({
      success: true,
      startedAt: '2026-08-12T14:00:00.000Z',
      endedAt: '2026-08-12T15:00:00.000Z',
      durationSeconds: 3_600,
      billableUnits: 4,
      reconciled: true,
    });
    expect(mocks.tx.eVVLog.updateMany).not.toHaveBeenCalled();
  });

  it('rejects a completed session with more than one EVV clock-out', async () => {
    mocks.prisma.session.findUnique.mockResolvedValue(
      assignedSession({
        status: 'COMPLETED',
        actualStart: new Date('2026-08-12T14:00:00.000Z'),
        actualEnd: new Date('2026-08-12T15:00:00.000Z'),
      })
    );
    mocks.prisma.eVVLog.findMany.mockResolvedValue([
      closedEvvLog(),
      closedEvvLog({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }),
    ]);

    const result = await clockOutAction()({ sessionId: SESSION_ID });

    expect(result).toMatchObject({
      success: false,
      code: 'EVV_CLOCK_OUT_CONFLICT',
      conflict: true,
    });
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('reconciles the winner when a concurrent clock-out CAS loses', async () => {
    const inProgress = assignedSession({
      status: 'IN_PROGRESS',
      actualStart: new Date('2026-08-12T14:00:00.000Z'),
    });
    mocks.prisma.session.findUnique
      .mockResolvedValueOnce(inProgress)
      .mockResolvedValueOnce({
        ...inProgress,
        status: 'COMPLETED',
        actualEnd: new Date('2026-08-12T15:00:00.000Z'),
      });
    mocks.prisma.eVVLog.findMany.mockResolvedValue([closedEvvLog()]);
    mocks.tx.session.updateMany.mockResolvedValue({ count: 0 });

    const result = await clockOutAction()({ sessionId: SESSION_ID });

    expect(result).toMatchObject({
      success: true,
      endedAt: '2026-08-12T15:00:00.000Z',
      reconciled: true,
    });
    expect(mocks.tx.eVVLog.updateMany).not.toHaveBeenCalled();
  });

  it('removes duplicate open EVV rows while preserving one canonical clock-out', async () => {
    const duplicateId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    mocks.prisma.session.findUnique.mockResolvedValue(
      assignedSession({
        status: 'IN_PROGRESS',
        actualStart: new Date('2026-08-12T14:00:00.000Z'),
      })
    );
    mocks.tx.eVVLog.findMany.mockResolvedValue([
      openEvvLog(),
      openEvvLog({
        id: duplicateId,
        clockInTimestamp: new Date('2026-08-12T14:00:01.000Z'),
      }),
    ]);

    const result = await clockOutAction()({ sessionId: SESSION_ID });

    expect(result).toMatchObject({ success: true });
    expect(mocks.tx.eVVLog.updateMany).toHaveBeenCalledTimes(1);
    expect(mocks.tx.eVVLog.deleteMany).toHaveBeenCalledWith({
      where: {
        id: { not: EVV_ID },
        sessionId: SESSION_ID,
        clockOutTimestamp: null,
      },
    });
  });

  it('returns a typed recovery response when the authoritative start is missing', async () => {
    mocks.prisma.session.findUnique.mockResolvedValue(
      assignedSession({
        status: 'IN_PROGRESS',
        actualStart: null,
      })
    );

    const result = await clockOutAction()({ sessionId: SESSION_ID });

    expect(result).toMatchObject({
      success: false,
      code: 'SESSION_TIME_MISSING',
    });
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('submitHrmSessionEmrNote assignment security', () => {
  it('rejects an absent scheduled session without resolving a caller-selected client', async () => {
    mocks.prisma.session.findUnique.mockResolvedValue(null);

    const result = await submitHrmSessionEmrNote(claimReadyPayload());

    expect(result).toMatchObject({ success: false });
    expect(result.error).toMatch(/scheduled session.*not found/i);
    expect(mocks.prisma.client.findFirst).not.toHaveBeenCalled();
    expect(mocks.prisma.client.create).not.toHaveBeenCalled();
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a null session assignment instead of claiming it during submit', async () => {
    mocks.prisma.session.findUnique.mockResolvedValue(
      assignedSession({ rbtId: null, status: 'IN_PROGRESS' })
    );

    const result = await submitHrmSessionEmrNote(claimReadyPayload());

    expect(result).toMatchObject({ success: false });
    expect(result.error).toMatch(/not assigned|assigned RBT/i);
    expect(mocks.prisma.sessionNote.findUnique).not.toHaveBeenCalled();
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a forged submit CPT before closing EVV or writing note data', async () => {
    mocks.prisma.session.findUnique.mockResolvedValue(
      assignedSession({
        status: 'IN_PROGRESS',
        actualStart: new Date('2026-08-12T14:00:00.000Z'),
      })
    );

    const result = await submitHrmSessionEmrNote(
      claimReadyPayload({ cptCode: '97155' })
    );

    expect(result).toMatchObject({
      success: false,
      code: 'SESSION_CPT_MISMATCH',
    });
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
    expect(mocks.tx.eVVLog.updateMany).not.toHaveBeenCalled();
    expect(mocks.tx.sessionNote.create).not.toHaveBeenCalled();
  });

  it('rejects a submit POS mismatch instead of replacing durable billing facts', async () => {
    mocks.prisma.session.findUnique.mockResolvedValue(
      assignedSession({
        status: 'IN_PROGRESS',
        actualStart: new Date('2026-08-12T14:00:00.000Z'),
      })
    );

    const result = await submitHrmSessionEmrNote(
      claimReadyPayload({ locationCode: '03 - School' })
    );

    expect(result).toMatchObject({
      success: false,
      code: 'SESSION_POS_MISMATCH',
    });
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('denies stale resubmit when the BCBA signature wins first without mutating', async () => {
    mocks.prisma.session.findUnique.mockResolvedValue(
      assignedSession({
        status: 'COMPLETED',
        actualStart: new Date('2026-08-12T14:00:00.000Z'),
        actualEnd: new Date('2026-08-12T15:00:00.000Z'),
        note: {
          id: NOTE_ID,
          sessionId: SESSION_ID,
          rbtSigned: true,
          bcbaSigned: true,
          isConverted: false,
          updatedAt: NOTE_UPDATED_AT,
          deficiencies: [],
        },
      })
    );
    mocks.prisma.sessionNote.findUnique.mockResolvedValue({
      isConverted: false,
      bcbaSigned: true,
    });

    const result = await submitHrmSessionEmrNote(
      claimReadyPayload({ expectedNoteUpdatedAt: NOTE_UPDATED_AT.toISOString() })
    );

    expect(result).toMatchObject({
      success: false,
      code: 'SESSION_NOTE_LOCKED',
    });
    expect(result.error).toMatch(/BCBA-signed|signed/i);
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
    expect(mocks.tx.sessionNote.updateMany).not.toHaveBeenCalled();
    expect(mocks.tx.sessionTrialData.deleteMany).not.toHaveBeenCalled();
  });

  it('loses the correction CAS when note state changes after stale preflight', async () => {
    mockDurableCompletedClockOut();
    const correctionNote = {
      id: NOTE_ID,
      sessionId: SESSION_ID,
      rbtSigned: false,
      bcbaSigned: false,
      isConverted: false,
      updatedAt: NOTE_UPDATED_AT,
      deficiencies: [{ id: '88888888-8888-4888-8888-888888888888' }],
    };
    mocks.prisma.session.findUnique.mockResolvedValue(
      assignedSession({
        status: 'COMPLETED',
        actualStart: new Date('2026-08-12T14:00:00.000Z'),
        actualEnd: new Date('2026-08-12T15:00:00.000Z'),
        note: correctionNote,
      })
    );
    mocks.prisma.sessionNote.findUnique.mockResolvedValue({ isConverted: false });
    mocks.tx.sessionNote.updateMany.mockResolvedValue({ count: 0 });

    const result = await submitHrmSessionEmrNote(
      claimReadyPayload({ expectedNoteUpdatedAt: NOTE_UPDATED_AT.toISOString() })
    );

    expect(result).toMatchObject({
      success: false,
      code: 'SESSION_NOTE_CONFLICT',
    });
    expect(mocks.tx.sessionNote.updateMany).toHaveBeenCalledTimes(1);
    expect(mocks.tx.session.updateMany).not.toHaveBeenCalled();
    expect(mocks.tx.sessionTrialData.deleteMany).not.toHaveBeenCalled();
    expect(mocks.tx.behaviorLog.deleteMany).not.toHaveBeenCalled();
  });

  it('denies a converted note with a typed lock before the transaction', async () => {
    mocks.prisma.session.findUnique.mockResolvedValue(
      assignedSession({
        status: 'COMPLETED',
        actualStart: new Date('2026-08-12T14:00:00.000Z'),
        actualEnd: new Date('2026-08-12T15:00:00.000Z'),
        note: {
          id: NOTE_ID,
          sessionId: SESSION_ID,
          rbtSigned: true,
          bcbaSigned: true,
          isConverted: true,
          updatedAt: NOTE_UPDATED_AT,
          deficiencies: [],
        },
      })
    );
    mocks.prisma.sessionNote.findUnique.mockResolvedValue({ isConverted: true });

    const result = await submitHrmSessionEmrNote(
      claimReadyPayload({ expectedNoteUpdatedAt: NOTE_UPDATED_AT.toISOString() })
    );

    expect(result).toMatchObject({
      success: false,
      code: 'SESSION_NOTE_LOCKED',
    });
    expect(result.error).toMatch(/converted/i);
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('denies stale resubmit while awaiting BCBA, leaving the later sign path untouched', async () => {
    mocks.prisma.session.findUnique.mockResolvedValue(
      assignedSession({
        status: 'COMPLETED',
        actualStart: new Date('2026-08-12T14:00:00.000Z'),
        actualEnd: new Date('2026-08-12T15:00:00.000Z'),
        note: {
          id: NOTE_ID,
          sessionId: SESSION_ID,
          rbtSigned: true,
          bcbaSigned: false,
          isConverted: false,
          updatedAt: NOTE_UPDATED_AT,
          deficiencies: [],
        },
      })
    );
    mocks.prisma.sessionNote.findUnique.mockResolvedValue({ isConverted: false });

    const result = await submitHrmSessionEmrNote(
      claimReadyPayload({ expectedNoteUpdatedAt: NOTE_UPDATED_AT.toISOString() })
    );

    expect(result).toMatchObject({
      success: false,
      code: 'SESSION_NOTE_CORRECTION_REQUIRED',
    });
    expect(result.error).toMatch(/deficiency|correction/i);
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('allows one concurrent first submit for a completed session and conflicts the other', async () => {
    mockDurableCompletedClockOut();
    mocks.prisma.session.findUnique.mockResolvedValue(
      assignedSession({
        status: 'COMPLETED',
        actualStart: new Date('2026-08-12T14:00:00.000Z'),
        actualEnd: new Date('2026-08-12T15:00:00.000Z'),
        note: null,
      })
    );
    let created = false;
    mocks.tx.sessionNote.create.mockImplementation(async () => {
      if (created) {
        throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
      }
      created = true;
      return {
        id: NOTE_ID,
        sessionId: SESSION_ID,
        isConverted: false,
        bcbaSigned: false,
      };
    });

    const results = await Promise.all([
      submitHrmSessionEmrNote(claimReadyPayload({ expectedNoteUpdatedAt: null })),
      submitHrmSessionEmrNote(claimReadyPayload({ expectedNoteUpdatedAt: null })),
    ]);

    expect(results.filter((result) => result.success)).toHaveLength(1);
    expect(results.filter((result) => !result.success)).toEqual([
      expect.objectContaining({
        success: false,
        code: 'SESSION_NOTE_CONFLICT',
      }),
    ]);
  });

  it('allows an expected-revision correction only while an explicit deficiency is open', async () => {
    mockDurableCompletedClockOut();
    mocks.prisma.session.findUnique.mockResolvedValue(
      assignedSession({
        status: 'COMPLETED',
        actualStart: new Date('2026-08-12T14:00:00.000Z'),
        actualEnd: new Date('2026-08-12T15:00:00.000Z'),
        note: {
          id: NOTE_ID,
          sessionId: SESSION_ID,
          rbtSigned: false,
          bcbaSigned: false,
          isConverted: false,
          updatedAt: NOTE_UPDATED_AT,
          deficiencies: [{ id: '88888888-8888-4888-8888-888888888888' }],
        },
      })
    );
    mocks.tx.sessionNote.findUnique.mockResolvedValue({
      id: NOTE_ID,
      sessionId: SESSION_ID,
      isConverted: false,
      bcbaSigned: false,
    });

    const result = await submitHrmSessionEmrNote(
      claimReadyPayload({ expectedNoteUpdatedAt: NOTE_UPDATED_AT.toISOString() })
    );

    expect(result).toMatchObject({
      success: true,
      sessionId: SESSION_ID,
    });
    expect(mocks.tx.sessionNote.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: NOTE_ID,
          updatedAt: NOTE_UPDATED_AT,
          rbtSigned: false,
          bcbaSigned: false,
          isConverted: false,
        }),
      })
    );
    expect(mocks.tx.sessionNote.create).not.toHaveBeenCalled();
  });

  it('completes a valid assigned session without rewriting clinician identity', async () => {
    const inProgress = assignedSession({
      status: 'IN_PROGRESS',
      actualStart: new Date('2026-08-12T14:00:00.000Z'),
    });
    const completed = {
      ...inProgress,
      status: 'COMPLETED',
      actualEnd: new Date('2026-08-12T15:00:00.000Z'),
    };
    mocks.prisma.session.findUnique.mockResolvedValue(inProgress);
    mocks.tx.session.findUnique.mockResolvedValue(completed);

    const result = await submitHrmSessionEmrNote(claimReadyPayload());

    expect(result).toMatchObject({
      success: true,
      sessionId: SESSION_ID,
      syncStatus: 'DOCUMENTATION_SUBMITTED_AWAITING_BCBA_REVIEW',
      message: 'Documentation submitted — awaiting BCBA review.',
    });
    expect(JSON.stringify(result)).not.toMatch(/CLM-|CLAIM_SUBMITTED/i);
    expect(mocks.tx.session.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: SESSION_ID,
          clientId: CLIENT_ID,
          rbtId: ACTOR_ID,
          bcbaId: BCBA_ID,
          status: 'IN_PROGRESS',
        }),
        data: expect.not.objectContaining({
          rbtId: expect.anything(),
          bcbaId: expect.anything(),
        }),
      })
    );
    expect(mocks.tx.sessionNote.create).toHaveBeenCalledTimes(1);
    expect(mocks.tx.sessionNote.upsert).not.toHaveBeenCalled();
    expect(mocks.tx.auditLogVault.create).toHaveBeenCalledTimes(1);
    expect(mocks.writeAuditLog).toHaveBeenCalledTimes(1);
    expect(mocks.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: BCBA_ID })
    );
  });

  it('links an ABC observation only to an existing normalized client target', async () => {
    const inProgress = assignedSession({
      status: 'IN_PROGRESS',
      actualStart: new Date('2026-08-12T14:00:00.000Z'),
    });
    mocks.prisma.session.findUnique.mockResolvedValue(inProgress);
    mocks.tx.session.findUnique.mockResolvedValue({
      ...inProgress,
      status: 'COMPLETED',
      actualEnd: new Date('2026-08-12T15:00:00.000Z'),
    });
    mocks.prisma.behaviorTarget.findMany.mockResolvedValue([
      {
        id: BEHAVIOR_TARGET_ID,
        behaviorName: 'Elopement attempts',
      },
    ]);

    const result = await submitHrmSessionEmrNote(
      claimReadyPayload({
        abcEvents: [
          {
            antecedent: 'A transition demand was presented.',
            behavior: '  ELOPEMENT   ATTEMPTS ',
            consequence: 'RBT blocked and redirected to the visual schedule.',
            durationSeconds: 12,
            intensity: 'MODERATE',
            behaviorTargetId: null,
            at: '2026-08-12T14:20:00.000Z',
          },
        ],
      })
    );

    expect(result).toMatchObject({
      success: true,
      behaviorLogsPersisted: 1,
      mappedObservationCount: 1,
      unmappedObservationCount: 0,
      observationMappingStatus: 'ALL_MAPPED',
    });
    expect(mocks.prisma.behaviorTarget.create).not.toHaveBeenCalled();
    expect(mocks.tx.behaviorLog.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          behaviorId: BEHAVIOR_TARGET_ID,
          abcNotes: expect.stringContaining('ELOPEMENT   ATTEMPTS'),
        }),
      ],
    });
    expect(mocks.tx.sessionNote.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          structuredContent: expect.objectContaining({
            modalities: expect.objectContaining({
              abcEvents: [
                expect.objectContaining({
                  behavior: '  ELOPEMENT   ATTEMPTS ',
                  behaviorTargetId: BEHAVIOR_TARGET_ID,
                  mappingStatus: 'MAPPED_EXISTING_TARGET',
                  mappingSource: 'NORMALIZED_LABEL',
                }),
              ],
            }),
          }),
        }),
      })
    );
  });

  it('retains two similar unmatched ABC observations without creating targets or logs', async () => {
    const inProgress = assignedSession({
      status: 'IN_PROGRESS',
      actualStart: new Date('2026-08-12T14:00:00.000Z'),
    });
    mocks.prisma.session.findUnique.mockResolvedValue(inProgress);
    mocks.tx.session.findUnique.mockResolvedValue({
      ...inProgress,
      status: 'COMPLETED',
      actualEnd: new Date('2026-08-12T15:00:00.000Z'),
    });
    mocks.prisma.behaviorTarget.findMany.mockResolvedValue([]);

    const observations = [
      {
        antecedent: 'Work materials were placed on the table.',
        behavior: 'Elopement',
        consequence: 'RBT redirected back to the work area.',
        durationSeconds: 8,
        intensity: 'MILD' as const,
        behaviorTargetId: null,
        at: '2026-08-12T14:20:00.000Z',
      },
      {
        antecedent: 'A second transition was announced.',
        behavior: 'Elopement attempt',
        consequence: 'RBT used the visual schedule and reinforced return.',
        durationSeconds: 5,
        intensity: 'MILD' as const,
        behaviorTargetId: null,
        at: '2026-08-12T14:40:00.000Z',
      },
    ];

    const result = await submitHrmSessionEmrNote(
      claimReadyPayload({ abcEvents: observations })
    );

    expect(result).toMatchObject({
      success: true,
      behaviorLogsPersisted: 0,
      mappedObservationCount: 0,
      unmappedObservationCount: 2,
      observationMappingStatus: 'BCBA_MAPPING_NEEDED',
      observationMessage: 'Observation saved — BCBA mapping needed.',
    });
    expect(mocks.prisma.behaviorTarget.create).not.toHaveBeenCalled();
    expect(mocks.tx.behaviorLog.createMany).not.toHaveBeenCalled();
    expect(mocks.tx.sessionNote.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          structuredContent: expect.objectContaining({
            modalities: expect.objectContaining({
              abcEvents: [
                expect.objectContaining({
                  antecedent: observations[0].antecedent,
                  behavior: observations[0].behavior,
                  consequence: observations[0].consequence,
                  behaviorTargetId: null,
                  mappingStatus: 'PROVISIONAL_BCBA_REVIEW',
                  mappingSource: 'UNMATCHED_RBT_OBSERVATION',
                }),
                expect.objectContaining({
                  antecedent: observations[1].antecedent,
                  behavior: observations[1].behavior,
                  consequence: observations[1].consequence,
                  behaviorTargetId: null,
                  mappingStatus: 'PROVISIONAL_BCBA_REVIEW',
                  mappingSource: 'UNMATCHED_RBT_OBSERVATION',
                }),
              ],
            }),
          }),
        }),
      })
    );
  });

  it('ignores forged browser start, end, duration, and units for a later submit', async () => {
    mocks.prisma.session.findUnique.mockResolvedValue(
      assignedSession({
        status: 'COMPLETED',
        actualStart: new Date('2026-08-12T14:00:00.000Z'),
        actualEnd: new Date('2026-08-12T15:00:00.000Z'),
        note: null,
      })
    );
    mocks.tx.eVVLog.findMany.mockResolvedValue([closedEvvLog()]);
    mocks.prisma.eVVLog.findMany.mockResolvedValue([closedEvvLog()]);

    const result = await submitHrmSessionEmrNote(
      claimReadyPayload({
        startedAt: '1999-01-01T00:00:00.000Z',
        endedAt: '2036-01-01T00:00:00.000Z',
        sessionSeconds: 8 * 60 * 60,
        billableUnits: 99,
      })
    );

    expect(result).toMatchObject({
      success: true,
      startedAt: '2026-08-12T14:00:00.000Z',
      endedAt: '2026-08-12T15:00:00.000Z',
      durationSeconds: 3_600,
      billableUnits: 4,
    });
    expect(mocks.tx.sessionNote.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          billableUnits: 4,
          structuredContent: expect.objectContaining({
            actualStart: '2026-08-12T14:00:00.000Z',
            actualEnd: '2026-08-12T15:00:00.000Z',
            durationMinutes: 60,
            billableUnits: 4,
          }),
        }),
      })
    );
  });

  it('keeps the incomplete-close end frozen during a later documentation submit', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-12T15:00:00.000Z'));
    const inProgress = assignedSession({
      status: 'IN_PROGRESS',
      actualStart: new Date('2026-08-12T14:00:00.000Z'),
    });
    const completed = {
      ...inProgress,
      status: 'COMPLETED',
      actualEnd: new Date('2026-08-12T15:00:00.000Z'),
      note: null,
    };
    mocks.prisma.session.findUnique
      .mockResolvedValueOnce(inProgress)
      .mockResolvedValueOnce(completed);
    mocks.tx.session.findUnique.mockResolvedValue(completed);
    mocks.tx.eVVLog.findMany
      .mockResolvedValueOnce([openEvvLog()])
      .mockResolvedValueOnce([closedEvvLog()]);
    mocks.prisma.eVVLog.findMany.mockResolvedValue([closedEvvLog()]);

    try {
      const close = await clockOutAction()({
        sessionId: SESSION_ID,
        closeReason: 'INCOMPLETE',
      });
      expect(close).toMatchObject({
        success: true,
        endedAt: '2026-08-12T15:00:00.000Z',
        documentationStatus: 'PENDING',
      });

      vi.setSystemTime(new Date('2026-08-12T17:00:00.000Z'));
      const submit = await submitHrmSessionEmrNote(
        claimReadyPayload({
          endedAt: '2026-08-12T17:00:00.000Z',
          sessionSeconds: 10_800,
          billableUnits: 12,
        })
      );

      expect(submit).toMatchObject({
        success: true,
        startedAt: '2026-08-12T14:00:00.000Z',
        endedAt: '2026-08-12T15:00:00.000Z',
        durationSeconds: 3_600,
        billableUnits: 4,
      });
      expect(mocks.tx.session.updateMany).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('closes EVV and submits note/data in the same transaction on first completion', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-12T15:00:00.000Z'));
    const inProgress = assignedSession({
      status: 'IN_PROGRESS',
      actualStart: new Date('2026-08-12T14:00:00.000Z'),
    });
    mocks.prisma.session.findUnique.mockResolvedValue(inProgress);
    mocks.tx.session.findUnique.mockResolvedValue({
      ...inProgress,
      status: 'COMPLETED',
      actualEnd: new Date('2026-08-12T15:00:00.000Z'),
    });

    try {
      const result = await submitHrmSessionEmrNote(
        claimReadyPayload({
          sessionSeconds: 1,
          billableUnits: 0,
          endedAt: '2036-01-01T00:00:00.000Z',
        })
      );

      expect(result).toMatchObject({
        success: true,
        durationSeconds: 3_600,
        billableUnits: 4,
      });
      expect(mocks.tx.sessionNote.create).toHaveBeenCalledTimes(1);
      expect(mocks.tx.eVVLog.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: EVV_ID,
            clockOutTimestamp: null,
          }),
          data: expect.objectContaining({
            clockOutTimestamp: new Date('2026-08-12T15:00:00.000Z'),
          }),
        })
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects a completed session with a missing authoritative end despite caller time', async () => {
    mocks.prisma.session.findUnique.mockResolvedValue(
      assignedSession({
        status: 'COMPLETED',
        actualStart: new Date('2026-08-12T14:00:00.000Z'),
        actualEnd: null,
        note: null,
      })
    );

    const result = await submitHrmSessionEmrNote(
      claimReadyPayload({
        endedAt: '2026-08-12T15:00:00.000Z',
        sessionSeconds: 3_600,
      })
    );

    expect(result).toMatchObject({
      success: false,
      code: 'SESSION_TIME_MISSING',
      conflict: true,
    });
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('reconciles an identical retry after the committed response is lost', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-12T15:00:00.000Z'));
    const inProgress = assignedSession({
      status: 'IN_PROGRESS',
      actualStart: new Date('2026-08-12T14:00:00.000Z'),
    });
    const completed = {
      ...inProgress,
      status: 'COMPLETED',
      actualEnd: new Date('2026-08-12T15:00:00.000Z'),
    };
    mocks.prisma.session.findUnique.mockResolvedValue(inProgress);
    mocks.tx.session.findUnique.mockResolvedValue(completed);

    let persistedNote: Record<string, unknown> | null = null;
    mocks.tx.sessionNote.create.mockImplementation(async ({ data }) => {
      persistedNote = {
        ...data,
        id: NOTE_ID,
        sessionId: SESSION_ID,
        updatedAt: NOTE_UPDATED_AT,
        deficiencies: [],
      };
      return persistedNote;
    });

    try {
      const payload = claimReadyPayload({
        endedAt: '2036-01-01T00:00:00.000Z',
        sessionSeconds: 1,
        billableUnits: 0,
      });
      const committed = await submitHrmSessionEmrNote(payload);
      expect(committed).toMatchObject({ success: true });
      expect(persistedNote).not.toBeNull();

      mocks.prisma.session.findUnique.mockResolvedValue({
        ...completed,
        note: persistedNote,
      });
      mocks.prisma.eVVLog.findMany.mockResolvedValue([closedEvvLog()]);
      mocks.prisma.$transaction.mockClear();

      const retry = await submitHrmSessionEmrNote(payload);

      expect(retry).toMatchObject({
        success: true,
        reconciled: true,
        sessionId: SESSION_ID,
        soapNoteId: NOTE_ID,
        endedAt: '2026-08-12T15:00:00.000Z',
        durationSeconds: 3_600,
        billableUnits: 4,
      });
      expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('getSessionStudioTargets assignment security', () => {
  it('derives the target client from the assigned session, not caller input', async () => {
    const callerSelectedClientId = '88888888-8888-4888-8888-888888888888';
    mocks.prisma.client.findFirst.mockResolvedValue({
      id: callerSelectedClientId,
      firstName: 'Caller',
      lastName: 'Selected',
      treatmentPlan: {},
      skillTargets: [],
      behaviorTargets: [],
    });
    mocks.prisma.client.findUnique.mockResolvedValue({
      ...assignedSession().client,
      treatmentPlan: {},
      skillTargets: [],
      behaviorTargets: [],
    });
    const input = {
      sessionId: SESSION_ID,
      clientId: callerSelectedClientId,
      clientName: 'Caller Selected',
      autoSync: false,
    };

    const result = await getSessionStudioTargets(input);

    expect(result).toMatchObject({
      success: true,
      clientId: CLIENT_ID,
    });
    expect(mocks.prisma.client.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: CLIENT_ID },
      })
    );
    expect(mocks.prisma.client.findFirst).not.toHaveBeenCalled();
  });
});
