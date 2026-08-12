import { beforeEach, describe, expect, it, vi } from 'vitest';

const NOTE_ID = '11111111-1111-4111-8111-111111111111';
const CLIENT_ID = '22222222-2222-4222-8222-222222222222';
const SESSION_ID = '33333333-3333-4333-8333-333333333333';
const RBT_ID = '44444444-4444-4444-8444-444444444444';
const BCBA_ID = '55555555-5555-4555-8555-555555555555';
const UPDATED_AT = '2026-08-12T15:00:00.000Z';
const SIGNED_AT = new Date('2026-08-12T14:00:00.000Z');
const FINGERPRINT = 'a'.repeat(64);

const REQUIRED_KEYS = [
  'SESSION_TIME',
  'UNITS',
  'CPT_POS',
  'PERSONS_PRESENT',
  'GOALS_DATA',
  'INTERVENTIONS',
  'CLIENT_RESPONSE',
  'BARRIERS',
  'CAREGIVER_DEBRIEF',
  'PLAN_NEXT',
  'RBT_SIGN',
  'CAREGIVER_SIGN',
  'DURABLE_TARGETS',
];

const mocks = vi.hoisted(() => {
  const tx = {
    user: { findFirst: vi.fn() },
    sessionNote: { updateMany: vi.fn() },
    auditLogVault: { create: vi.fn() },
  };
  return {
    tx,
    prisma: {
      sessionNote: { findMany: vi.fn() },
      user: { findMany: vi.fn() },
      client: { findMany: vi.fn() },
      $transaction: vi.fn(),
    },
    requireStaff: vi.fn(),
    requireClientAccess: vi.fn(),
    notifyUsers: vi.fn(),
    getCredentialStatus: vi.fn(),
    revalidatePath: vi.fn(),
  };
});

vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('@/lib/auth-guard', () => ({
  requireStaff: mocks.requireStaff,
  requireClientAccess: mocks.requireClientAccess,
}));
vi.mock('@/app/actions/notifications', () => ({ notifyUsers: mocks.notifyUsers }));
vi.mock('@/lib/staffCredentials.server', () => ({
  getCredentialStatus: mocks.getCredentialStatus,
}));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));

import {
  signSessionNotesAsBcba,
  signSingleSessionNoteAsBcba,
} from './sessionNoteSignActions';

function checklist() {
  return {
    schemaVersion: 1,
    passed: true,
    checkedAt: SIGNED_AT.toISOString(),
    items: REQUIRED_KEYS.map((key) => ({
      key,
      label: key,
      standard: 'BOTH',
      ok: true,
    })),
  };
}

function note(overrides: Record<string, unknown> = {}) {
  return {
    id: NOTE_ID,
    sessionId: SESSION_ID,
    updatedAt: new Date(UPDATED_AT),
    parentSigned: true,
    parentSignedAt: SIGNED_AT,
    parentSignerName: 'Caregiver Name',
    rbtSigned: true,
    rbtSignedAt: SIGNED_AT,
    rbtSignerName: 'RBT Name',
    bcbaSigned: false,
    bcbaSignedAt: null,
    bcbaSignerName: null,
    isConverted: false,
    billableUnits: 4,
    checklistSnapshot: checklist(),
    structuredContent: {
      submissionFingerprint: FINGERPRINT,
      goalsAddressed: 'Goal identifiers',
    },
    deficiencies: [],
    session: {
      id: SESSION_ID,
      clientId: CLIENT_ID,
      bcbaId: BCBA_ID,
      status: 'COMPLETED',
      client: { id: CLIENT_ID, bcbaId: BCBA_ID },
      rbt: { id: RBT_ID },
    },
    ...overrides,
  };
}

function expectation(overrides: Record<string, unknown> = {}) {
  return {
    noteId: NOTE_ID,
    expectedNoteUpdatedAt: UPDATED_AT,
    expectedSubmissionFingerprint: FINGERPRINT,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireStaff.mockResolvedValue({
    ok: true,
    user: {
      id: BCBA_ID,
      role: 'BCBA',
      isActive: true,
      firstName: 'Bailey',
      lastName: 'Analyst',
      email: 'bcba@example.test',
    },
  });
  mocks.requireClientAccess.mockResolvedValue({
    ok: true,
    user: { id: BCBA_ID, role: 'BCBA', isActive: true },
  });
  mocks.prisma.sessionNote.findMany.mockResolvedValue([note()]);
  mocks.prisma.user.findMany.mockResolvedValue([]);
  mocks.prisma.client.findMany.mockResolvedValue([]);
  mocks.tx.user.findFirst.mockResolvedValue({
    id: BCBA_ID,
    role: 'BCBA',
    isActive: true,
    firstName: 'Bailey',
    lastName: 'Analyst',
    email: 'bcba@example.test',
  });
  mocks.tx.sessionNote.updateMany.mockResolvedValue({ count: 1 });
  mocks.tx.auditLogVault.create.mockResolvedValue({ id: 'audit-1' });
  mocks.prisma.$transaction.mockImplementation(
    async (callback: (tx: typeof mocks.tx) => unknown) => callback(mocks.tx),
  );
});

describe('BCBA SessionNote signing action', () => {
  it('rejects parent-false notes before opening a transaction', async () => {
    mocks.prisma.sessionNote.findMany.mockResolvedValue([
      note({ parentSigned: false }),
    ]);

    const result = await signSingleSessionNoteAsBcba(expectation());

    expect(result).toMatchObject({
      success: false,
      code: 'PARENT_ATTESTATION_MISSING',
    });
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it.each([
    [
      'revision',
      expectation({ expectedNoteUpdatedAt: '2026-08-12T14:59:59.000Z' }),
    ],
    [
      'fingerprint',
      expectation({ expectedSubmissionFingerprint: 'b'.repeat(64) }),
    ],
  ])('rejects a stale expected %s', async (_label, input) => {
    const result = await signSingleSessionNoteAsBcba(input);

    expect(result).toMatchObject({
      success: false,
      code: 'SESSION_NOTE_CONFLICT',
      conflict: true,
    });
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects inactive and unassigned BCBA actors', async () => {
    mocks.requireStaff.mockResolvedValueOnce({
      ok: false,
      error: 'Not authenticated. Please sign in.',
    });
    expect(await signSingleSessionNoteAsBcba(expectation())).toMatchObject({
      success: false,
    });
    expect(mocks.prisma.sessionNote.findMany).not.toHaveBeenCalled();

    mocks.requireClientAccess.mockResolvedValueOnce({
      ok: false,
      error: 'You are not assigned to this client.',
    });
    expect(await signSingleSessionNoteAsBcba(expectation())).toMatchObject({
      success: false,
      code: 'CLIENT_ACCESS_DENIED',
    });
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects an actor deactivated between review and the transaction', async () => {
    mocks.tx.user.findFirst.mockResolvedValueOnce(null);

    const result = await signSingleSessionNoteAsBcba(expectation());

    expect(result).toMatchObject({
      success: false,
      code: 'ACTOR_NOT_ACTIVE',
    });
    expect(mocks.tx.sessionNote.updateMany).not.toHaveBeenCalled();
    expect(mocks.tx.auditLogVault.create).not.toHaveBeenCalled();
  });

  it('atomically CAS-signs and writes the critical audit from persisted identity', async () => {
    const result = await signSessionNotesAsBcba([expectation()]);

    expect(result).toMatchObject({ success: true, signedCount: 1 });
    expect(mocks.tx.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: BCBA_ID, isActive: true }),
      }),
    );
    expect(mocks.tx.sessionNote.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: NOTE_ID,
          updatedAt: new Date(UPDATED_AT),
          parentSigned: true,
          rbtSigned: true,
          bcbaSigned: false,
          isConverted: false,
        }),
        data: expect.objectContaining({
          bcbaSigned: true,
          bcbaSignerName: 'Bailey Analyst',
          bcbaSignedAt: expect.any(Date),
        }),
      }),
    );
    expect(mocks.tx.auditLogVault.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: BCBA_ID,
          action: 'SIGN',
          resourceId: NOTE_ID,
        }),
      }),
    );
  });

  it('rejects correction-vs-sign CAS loss without writing an audit', async () => {
    mocks.tx.sessionNote.updateMany.mockResolvedValueOnce({ count: 0 });

    const result = await signSingleSessionNoteAsBcba(expectation());

    expect(result).toMatchObject({
      success: false,
      code: 'SESSION_NOTE_CONFLICT',
      conflict: true,
    });
    expect(mocks.tx.auditLogVault.create).not.toHaveBeenCalled();
  });

  it('fails the action when the in-transaction critical audit write fails', async () => {
    mocks.tx.auditLogVault.create.mockRejectedValueOnce(new Error('audit unavailable'));

    const result = await signSingleSessionNoteAsBcba(expectation());

    expect(result).toMatchObject({
      success: false,
      code: 'BCBA_SIGN_FAILED',
    });
  });
});
