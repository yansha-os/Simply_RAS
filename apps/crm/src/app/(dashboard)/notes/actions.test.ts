import { beforeEach, describe, expect, it, vi } from 'vitest';

const NOTE_ID = '11111111-1111-4111-8111-111111111111';
const CLIENT_ID = '22222222-2222-4222-8222-222222222222';
const SESSION_ID = '33333333-3333-4333-8333-333333333333';
const RBT_ID = '44444444-4444-4444-8444-444444444444';
const ACTOR_ID = '55555555-5555-4555-8555-555555555555';
const OTHER_ID = '66666666-6666-4666-8666-666666666666';
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
    sessionNote: {
      updateMany: vi.fn(),
      findUnique: vi.fn(),
    },
    noteDeficiency: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    authorization: { findMany: vi.fn() },
    pARequest: { findMany: vi.fn() },
    session: { findMany: vi.fn() },
    auditLogVault: { create: vi.fn() },
  };
  return {
    tx,
    prisma: {
      sessionNote: { findUnique: vi.fn() },
      $transaction: vi.fn(),
    },
    requireStaff: vi.fn(),
    requireClientAccess: vi.fn(),
    collectNoteCredentialWarnings: vi.fn(),
    assertNoteCredentialHardStop: vi.fn(),
    getStaffNpi: vi.fn(),
    createNotification: vi.fn(),
    revalidatePath: vi.fn(),
  };
});

vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('@/lib/auth-guard', () => ({
  SESSION_NOTES_CONVERSION_ROLES: [
    'CEO',
    'CLINICAL_DIRECTOR',
    'OPS_DIRECTOR',
    'BILLING',
    'FINANCE',
    'SESSION_NOTES_COORDINATOR',
  ],
  requireStaff: mocks.requireStaff,
  requireClientAccess: mocks.requireClientAccess,
}));
vi.mock('@/lib/staffCredentials.server', () => ({
  collectNoteCredentialWarnings: mocks.collectNoteCredentialWarnings,
  assertNoteCredentialHardStop: mocks.assertNoteCredentialHardStop,
  getStaffNpi: mocks.getStaffNpi,
}));
vi.mock('@/lib/billing/noteClaimScrub', () => ({
  scrubNoteForConvert: vi.fn(() => ({
    sessionId: SESSION_ID,
    noteId: NOTE_ID,
    clientId: CLIENT_ID,
    clientName: 'Test Client',
    cptCode: '97153',
    dateOfService: '2026-08-12',
    billableUnits: 4,
    status: 'CLEAN',
    defects: [],
    plutusReady: true,
  })),
}));
vi.mock('@/app/actions/notifications', () => ({
  createNotification: mocks.createNotification,
}));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));

import { convertNoteToBillable, flagDeficiency } from './actions';

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
    bcbaSigned: true,
    bcbaSignedAt: SIGNED_AT,
    bcbaSignerName: 'BCBA Name',
    isConverted: false,
    convertedAt: null,
    plutusClaimRef: null,
    billableUnits: 4,
    checklistSnapshot: checklist(),
    structuredContent: {
      submissionFingerprint: FINGERPRINT,
      goalsAddressed: 'Goal identifiers',
      bcbaSignature: { signerName: 'BCBA Name', signedAt: SIGNED_AT.toISOString() },
      supervisingBcbaUserId: ACTOR_ID,
      supervisingBcbaName: 'BCBA Name',
    },
    deficiencies: [],
    session: {
      id: SESSION_ID,
      clientId: CLIENT_ID,
      rbtId: RBT_ID,
      bcbaId: ACTOR_ID,
      status: 'COMPLETED',
      cptCode: '97153',
      scheduledStart: new Date('2026-08-12T13:00:00.000Z'),
      scheduledEnd: new Date('2026-08-12T14:00:00.000Z'),
      actualStart: new Date('2026-08-12T13:00:00.000Z'),
      actualEnd: new Date('2026-08-12T14:00:00.000Z'),
      client: {
        status: 'STAFFING_PENDING',
        firstName: 'Test',
        lastName: 'Client',
        primaryDiagnosisCode: 'F84.0',
        insurancePayer: 'Medicaid',
        authorizations: [],
      },
    },
    ...overrides,
  };
}

function ledgerSession() {
  const source = note();
  return {
    id: SESSION_ID,
    status: 'COMPLETED',
    cptCode: '97153',
    scheduledStart: source.session.scheduledStart,
    scheduledEnd: source.session.scheduledEnd,
    actualStart: source.session.actualStart,
    actualEnd: source.session.actualEnd,
    note: {
      parentSigned: true,
      parentSignedAt: SIGNED_AT,
      parentSignerName: 'Caregiver Name',
      rbtSigned: true,
      rbtSignedAt: SIGNED_AT,
      rbtSignerName: 'RBT Name',
      bcbaSigned: true,
      bcbaSignedAt: SIGNED_AT,
      bcbaSignerName: 'BCBA Name',
      isConverted: false,
      billableUnits: 4,
      checklistSnapshot: checklist(),
      structuredContent: { submissionFingerprint: FINGERPRINT },
      deficiencies: [],
    },
  };
}

function convertOptions(overrides: Record<string, unknown> = {}) {
  return {
    expectedNoteUpdatedAt: UPDATED_AT,
    expectedSubmissionFingerprint: FINGERPRINT,
    plutusClaimRef: ' batch   42 ',
    ...overrides,
  };
}

function deficiencyForm(overrides: Record<string, string> = {}) {
  const form = new FormData();
  form.set('noteId', NOTE_ID);
  form.set('authorId', RBT_ID);
  form.set('description', 'Objective data section needs correction.');
  form.set('expectedNoteUpdatedAt', UPDATED_AT);
  form.set('expectedSubmissionFingerprint', FINGERPRINT);
  for (const [key, value] of Object.entries(overrides)) form.set(key, value);
  return form;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireStaff.mockResolvedValue({
    ok: true,
    user: {
      id: ACTOR_ID,
      role: 'SESSION_NOTES_COORDINATOR',
      isActive: true,
      firstName: 'Notes',
      lastName: 'Coordinator',
      email: 'snc@example.test',
    },
  });
  mocks.requireClientAccess.mockResolvedValue({
    ok: true,
    user: { id: ACTOR_ID, role: 'SESSION_NOTES_COORDINATOR', isActive: true },
  });
  mocks.prisma.sessionNote.findUnique.mockResolvedValue(note());
  mocks.tx.user.findFirst.mockResolvedValue({
    id: ACTOR_ID,
    role: 'SESSION_NOTES_COORDINATOR',
    isActive: true,
  });
  mocks.tx.authorization.findMany.mockResolvedValue([
    {
      id: 'auth-1',
      type: 'TREATMENT',
      status: 'APPROVED',
      authNumber: 'AUTH-1',
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      unitsApproved: null,
      cptCodes: [{ code: '97153', unitsApproved: 100 }],
    },
  ]);
  mocks.tx.pARequest.findMany.mockResolvedValue([]);
  mocks.tx.session.findMany.mockResolvedValue([ledgerSession()]);
  mocks.tx.sessionNote.updateMany.mockResolvedValue({ count: 1 });
  mocks.tx.sessionNote.findUnique.mockResolvedValue(null);
  mocks.tx.noteDeficiency.findFirst.mockResolvedValue(null);
  mocks.tx.noteDeficiency.create.mockResolvedValue({ id: 'deficiency-1' });
  mocks.tx.auditLogVault.create.mockResolvedValue({ id: 'audit-1' });
  mocks.prisma.$transaction.mockImplementation(
    async (callback: (tx: typeof mocks.tx) => unknown) => callback(mocks.tx),
  );
  mocks.collectNoteCredentialWarnings.mockResolvedValue([]);
  mocks.assertNoteCredentialHardStop.mockResolvedValue({ ok: true, warnings: [] });
});

describe('convertNoteToBillable', () => {
  it('denies billing read-only actors from conversion', async () => {
    mocks.requireStaff.mockResolvedValueOnce({
      ok: false,
      error: 'You are not authorized to perform this action.',
    });

    const result = await convertNoteToBillable(NOTE_ID, convertOptions());

    expect(result).toMatchObject({
      success: false,
      gateCode: 'AUTHORIZATION_DENIED',
    });
    expect(mocks.prisma.sessionNote.findUnique).not.toHaveBeenCalled();
  });

  it('requires a normalized nonblank Plutus reference', async () => {
    const result = await convertNoteToBillable(
      NOTE_ID,
      convertOptions({ plutusClaimRef: '   ' }),
    );

    expect(result).toMatchObject({
      success: false,
      gateCode: 'PLUTUS_REFERENCE_REQUIRED',
    });
    expect(mocks.prisma.sessionNote.findUnique).not.toHaveBeenCalled();
  });

  it('rejects parent-false and malformed legacy chains', async () => {
    mocks.prisma.sessionNote.findUnique.mockResolvedValueOnce(
      note({ parentSigned: false }),
    );
    expect(await convertNoteToBillable(NOTE_ID, convertOptions())).toMatchObject({
      success: false,
      gateCode: 'PARENT_ATTESTATION_MISSING',
    });

    mocks.prisma.sessionNote.findUnique.mockResolvedValueOnce(
      note({ checklistSnapshot: { passed: true } }),
    );
    expect(await convertNoteToBillable(NOTE_ID, convertOptions())).toMatchObject({
      success: false,
      gateCode: 'CHECKLIST_MALFORMED',
      manualReviewRequired: true,
    });
  });

  it.each([
    [
      'revision',
      convertOptions({ expectedNoteUpdatedAt: '2026-08-12T14:59:59.000Z' }),
    ],
    [
      'fingerprint',
      convertOptions({ expectedSubmissionFingerprint: 'b'.repeat(64) }),
    ],
  ])('rejects a stale expected %s', async (_label, options) => {
    const result = await convertNoteToBillable(NOTE_ID, options);
    expect(result).toMatchObject({
      success: false,
      gateCode: 'SESSION_NOTE_CONFLICT',
      conflict: true,
    });
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('atomically converts with normalized reference and critical audit', async () => {
    const result = await convertNoteToBillable(NOTE_ID, convertOptions());

    expect(result).toMatchObject({ success: true });
    expect(mocks.tx.sessionNote.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: NOTE_ID,
          updatedAt: new Date(UPDATED_AT),
          parentSigned: true,
          rbtSigned: true,
          bcbaSigned: true,
          isConverted: false,
          billableUnits: { gt: 0 },
        }),
        data: expect.objectContaining({
          isConverted: true,
          plutusClaimRef: 'batch 42',
          convertedAt: expect.any(Date),
        }),
      }),
    );
    expect(mocks.tx.auditLogVault.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: ACTOR_ID,
          action: 'CONVERT',
          resourceId: NOTE_ID,
        }),
      }),
    );
  });

  it('returns typed conflict on deficiency-vs-conversion CAS loss', async () => {
    mocks.tx.sessionNote.updateMany.mockResolvedValueOnce({ count: 0 });
    mocks.tx.sessionNote.findUnique.mockResolvedValueOnce({
      isConverted: false,
      convertedAt: null,
      plutusClaimRef: null,
    });

    const result = await convertNoteToBillable(NOTE_ID, convertOptions());

    expect(result).toMatchObject({
      success: false,
      gateCode: 'SESSION_NOTE_CONFLICT',
      conflict: true,
    });
    expect(mocks.tx.auditLogVault.create).not.toHaveBeenCalled();
  });

  it('classifies count-zero as duplicate only when reread is truly converted', async () => {
    const firstConvertedAt = new Date('2026-08-12T15:30:00.000Z');
    mocks.tx.sessionNote.updateMany.mockResolvedValueOnce({ count: 0 });
    mocks.tx.sessionNote.findUnique.mockResolvedValueOnce({
      isConverted: true,
      convertedAt: firstConvertedAt,
      plutusClaimRef: 'FIRST-REF',
    });

    const result = await convertNoteToBillable(
      NOTE_ID,
      convertOptions({ plutusClaimRef: 'SECOND-REF' }),
    );

    expect(result).toMatchObject({
      success: true,
      alreadyConverted: true,
      convertedAt: firstConvertedAt.toISOString(),
      plutusClaimRef: 'FIRST-REF',
    });
    expect(mocks.tx.auditLogVault.create).not.toHaveBeenCalled();
  });

  it('fails when the in-transaction conversion audit cannot commit', async () => {
    mocks.tx.auditLogVault.create.mockRejectedValueOnce(new Error('audit unavailable'));

    const result = await convertNoteToBillable(NOTE_ID, convertOptions());

    expect(result).toMatchObject({
      success: false,
      gateCode: 'CONVERSION_FAILED',
    });
  });

  it('fails the atomic conversion when its required override audit cannot commit', async () => {
    mocks.requireStaff.mockResolvedValueOnce({
      ok: true,
      user: {
        id: ACTOR_ID,
        role: 'CEO',
        isActive: true,
        firstName: 'Ops',
        lastName: 'Lead',
        email: 'ceo@example.test',
      },
    });
    mocks.tx.user.findFirst.mockResolvedValueOnce({
      id: ACTOR_ID,
      role: 'CEO',
      isActive: true,
    });
    mocks.tx.authorization.findMany.mockResolvedValueOnce([
      {
        id: 'auth-1',
        type: 'TREATMENT',
        status: 'APPROVED',
        authNumber: 'AUTH-1',
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        unitsApproved: null,
        cptCodes: [{ code: '97153', unitsApproved: 0 }],
      },
    ]);
    mocks.tx.auditLogVault.create
      .mockResolvedValueOnce({ id: 'conversion-audit' })
      .mockRejectedValueOnce(new Error('override audit unavailable'));

    const result = await convertNoteToBillable(
      NOTE_ID,
      convertOptions({
        overrideAuthUnits: true,
        overrideReason: 'Documented payer exception',
      }),
    );

    expect(result).toMatchObject({
      success: false,
      gateCode: 'CONVERSION_FAILED',
    });
    expect(mocks.tx.auditLogVault.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({ action: 'OVERRIDE' }),
      }),
    );
  });
});

describe('flagDeficiency', () => {
  beforeEach(() => {
    mocks.requireStaff.mockResolvedValue({
      ok: true,
      user: {
        id: ACTOR_ID,
        role: 'BCBA',
        isActive: true,
        firstName: 'Clinical',
        lastName: 'Reviewer',
      },
    });
    mocks.tx.user.findFirst.mockResolvedValue({
      id: ACTOR_ID,
      role: 'BCBA',
      isActive: true,
    });
  });

  it('rejects a forged caller author and derives author from Session.rbtId', async () => {
    const result = await flagDeficiency(
      {},
      deficiencyForm({ authorId: OTHER_ID }),
    );

    expect(result).toMatchObject({
      success: false,
      code: 'FORGED_AUTHOR',
    });
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it.each([
    ['revision', { expectedNoteUpdatedAt: '2026-08-12T14:59:59.000Z' }],
    ['fingerprint', { expectedSubmissionFingerprint: 'b'.repeat(64) }],
  ])('rejects a stale deficiency %s', async (_label, overrides) => {
    const result = await flagDeficiency({}, deficiencyForm(overrides));

    expect(result).toMatchObject({
      success: false,
      code: 'SESSION_NOTE_CONFLICT',
      conflict: true,
    });
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('atomically creates one open deficiency, invalidates every live projection, and audits hashes only', async () => {
    const result = await flagDeficiency({}, deficiencyForm());

    expect(result).toMatchObject({ success: true });
    expect(mocks.tx.sessionNote.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: NOTE_ID,
          updatedAt: new Date(UPDATED_AT),
          isConverted: false,
        }),
        data: expect.objectContaining({
          parentSigned: false,
          rbtSigned: false,
          bcbaSigned: false,
          parentSignedAt: null,
          rbtSignedAt: null,
          bcbaSignedAt: null,
          parentSignerName: null,
          rbtSignerName: null,
          bcbaSignerName: null,
          checklistSnapshot: expect.anything(),
          billableUnits: null,
        }),
      }),
    );
    expect(mocks.tx.noteDeficiency.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          noteId: NOTE_ID,
          authorId: RBT_ID,
          flaggedById: ACTOR_ID,
          status: 'OPEN',
        }),
      }),
    );
    const auditData = mocks.tx.auditLogVault.create.mock.calls[0][0].data;
    expect(auditData.metadata).toMatchObject({
      event: 'SESSION_NOTE_ATTESTATIONS_INVALIDATED',
      priorSubmissionFingerprint: FINGERPRINT,
      attestationDigest: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
    expect(JSON.stringify(auditData.metadata)).not.toContain('Caregiver Name');
    expect(JSON.stringify(auditData.metadata)).not.toContain(
      'Objective data section needs correction.',
    );
  });

  it('rejects deficiency-vs-conversion CAS loss without creating history', async () => {
    mocks.tx.sessionNote.updateMany.mockResolvedValueOnce({ count: 0 });

    const result = await flagDeficiency({}, deficiencyForm());

    expect(result).toMatchObject({
      success: false,
      code: 'SESSION_NOTE_CONFLICT',
      conflict: true,
    });
    expect(mocks.tx.noteDeficiency.create).not.toHaveBeenCalled();
    expect(mocks.tx.auditLogVault.create).not.toHaveBeenCalled();
  });

  it('fails the whole transition when the critical audit write fails', async () => {
    mocks.tx.auditLogVault.create.mockRejectedValueOnce(new Error('audit unavailable'));

    const result = await flagDeficiency({}, deficiencyForm());

    expect(result).toMatchObject({
      success: false,
      code: 'DEFICIENCY_FAILED',
    });
  });
});
