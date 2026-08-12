import { describe, expect, it } from 'vitest';

import {
  runTreatmentPlanSave,
  type TreatmentPlanAuditEvent,
  type TreatmentPlanClientSnapshot,
  type TreatmentPlanConditionalWrite,
  type TreatmentPlanSaveDependencies,
  type TreatmentPlanSessionUser,
} from './treatment-plan-save';

const CLIENT_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_CLIENT_ID = '22222222-2222-4222-8222-222222222222';
const BCBA_ID = '33333333-3333-4333-8333-333333333333';
const OTHER_BCBA_ID = '44444444-4444-4444-8444-444444444444';
const LEADER_ID = '55555555-5555-4555-8555-555555555555';
const CURRENT_VERSION = '2026-08-12T12:00:00.000Z';
const NEXT_VERSION = '2026-08-12T12:01:00.000Z';
const SIGNED_AT = '2026-08-12T12:00:30.000Z';

const assignedBcba: TreatmentPlanSessionUser = {
  id: BCBA_ID,
  firstName: 'Morgan',
  lastName: 'Lee',
  email: 'morgan@example.com',
  role: 'BCBA',
  isActive: true,
};

function clientSnapshot(
  overrides: Partial<TreatmentPlanClientSnapshot> = {},
): TreatmentPlanClientSnapshot {
  return {
    id: CLIENT_ID,
    status: 'ASSESSMENT_SCHEDULED',
    updatedAt: CURRENT_VERSION,
    treatmentPlan: {
      assessmentScheduledAt: '2026-08-15T13:00:00.000Z',
      priorClinicalFact: 'Keep this exact text.',
    },
    bcbaId: BCBA_ID,
    bcba: { ...assignedBcba },
    ...overrides,
  };
}

function createHarness(options?: {
  auth?:
    | { ok: true; user: TreatmentPlanSessionUser }
    | { ok: false; error: string };
  client?: TreatmentPlanClientSnapshot | null;
  writeVersion?: string | null;
}) {
  const writes: TreatmentPlanConditionalWrite[] = [];
  const audits: TreatmentPlanAuditEvent[] = [];
  let clientReads = 0;

  const dependencies: TreatmentPlanSaveDependencies = {
    authenticate: async () =>
      options?.auth ?? { ok: true, user: assignedBcba },
    loadClient: async () => {
      clientReads += 1;
      return options && 'client' in options
        ? (options.client ?? null)
        : clientSnapshot();
    },
    updateIfCurrent: async (write) => {
      writes.push(write);
      const version =
        options && 'writeVersion' in options
          ? options.writeVersion
          : NEXT_VERSION;
      return version ? { updatedAt: version } : null;
    },
    auditOverride: async (event) => {
      audits.push(event);
    },
    now: () => new Date(SIGNED_AT),
  };

  return {
    dependencies,
    writes,
    audits,
    get clientReads() {
      return clientReads;
    },
  };
}

function saveInput(overrides: Record<string, unknown> = {}) {
  return {
    clientId: CLIENT_ID,
    treatmentPlanData: {
      medicalNecessity: 'Clinician-authored rationale.',
    },
    isSubmit: true,
    expectedUpdatedAt: CURRENT_VERSION,
    ...overrides,
  };
}

describe('runTreatmentPlanSave authorization', () => {
  it('rejects an unauthenticated request before reading client data', async () => {
    const harness = createHarness({
      auth: { ok: false, error: 'Not authenticated. Please sign in.' },
    });

    const result = await runTreatmentPlanSave(saveInput(), harness.dependencies);

    expect(result).toEqual({
      success: false,
      code: 'UNAUTHENTICATED',
      error: 'Not authenticated. Please sign in.',
    });
    expect(harness.clientReads).toBe(0);
    expect(harness.writes).toEqual([]);
  });

  it('returns a distinct structured error for an authenticated role denial', async () => {
    const harness = createHarness({
      auth: {
        ok: false,
        error: 'You are not authorized to perform this action.',
      },
    });

    const result = await runTreatmentPlanSave(saveInput(), harness.dependencies);

    expect(result).toEqual({
      success: false,
      code: 'FORBIDDEN',
      error: 'You are not authorized to perform this action.',
    });
    expect(harness.clientReads).toBe(0);
  });

  it('rejects a BCBA who is not assigned to the target client', async () => {
    const harness = createHarness({
      client: clientSnapshot({
        bcbaId: OTHER_BCBA_ID,
        bcba: {
          id: OTHER_BCBA_ID,
          firstName: 'Other',
          lastName: 'Clinician',
          email: 'other@example.com',
          role: 'BCBA',
          isActive: true,
        },
      }),
    });

    const result = await runTreatmentPlanSave(saveInput(), harness.dependencies);

    expect(result).toMatchObject({
      success: false,
      code: 'NOT_ASSIGNED_ACTIVE_BCBA',
    });
    expect(harness.writes).toEqual([]);
  });

  it('rejects an assigned BCBA when the assignment is inactive', async () => {
    const harness = createHarness({
      client: clientSnapshot({
        bcba: { ...assignedBcba, isActive: false },
      }),
    });

    const result = await runTreatmentPlanSave(saveInput(), harness.dependencies);

    expect(result).toMatchObject({
      success: false,
      code: 'NOT_ASSIGNED_ACTIVE_BCBA',
    });
    expect(harness.writes).toEqual([]);
  });

  it('rejects a cross-client save even when the caller is assigned elsewhere', async () => {
    const harness = createHarness({
      client: clientSnapshot({
        id: OTHER_CLIENT_ID,
        bcbaId: OTHER_BCBA_ID,
        bcba: {
          id: OTHER_BCBA_ID,
          firstName: 'Other',
          lastName: 'Clinician',
          email: 'other@example.com',
          role: 'BCBA',
          isActive: true,
        },
      }),
    });

    const result = await runTreatmentPlanSave(
      saveInput({ clientId: OTHER_CLIENT_ID }),
      harness.dependencies,
    );

    expect(result).toMatchObject({
      success: false,
      code: 'NOT_ASSIGNED_ACTIVE_BCBA',
    });
    expect(harness.writes).toEqual([]);
  });

  it('rejects caller-supplied author and signer identity fields', async () => {
    const harness = createHarness();

    const result = await runTreatmentPlanSave(
      saveInput({
        treatmentPlanData: {
          medicalNecessity: 'Clinician-authored rationale.',
          authorId: OTHER_BCBA_ID,
          signature: 'Forged Signer',
        },
      }),
      harness.dependencies,
    );

    expect(result).toMatchObject({
      success: false,
      code: 'CALLER_IDENTITY_NOT_ALLOWED',
    });
    expect(harness.writes).toEqual([]);
  });
});

describe('runTreatmentPlanSave concurrency', () => {
  it('rejects a browser version older than the current client row', async () => {
    const harness = createHarness();

    const result = await runTreatmentPlanSave(
      saveInput({ expectedUpdatedAt: '2026-08-12T11:59:00.000Z' }),
      harness.dependencies,
    );

    expect(result).toMatchObject({
      success: false,
      code: 'STALE_VERSION',
    });
    expect(harness.writes).toEqual([]);
  });

  it('returns a stale-version error when the expected-current conditional write loses a race', async () => {
    const harness = createHarness({ writeVersion: null });

    const result = await runTreatmentPlanSave(saveInput(), harness.dependencies);

    expect(result).toMatchObject({
      success: false,
      code: 'STALE_VERSION',
    });
    expect(harness.writes).toHaveLength(1);
  });

  it('never overwrites an existing final signature', async () => {
    const harness = createHarness({
      client: clientSnapshot({
        treatmentPlan: {
          status: 'COMPLETED',
          signature: 'Morgan Lee',
          bcbaSubmittedAt: SIGNED_AT,
        },
      }),
    });

    const result = await runTreatmentPlanSave(
      saveInput({ isSubmit: false }),
      harness.dependencies,
    );

    expect(result).toMatchObject({
      success: false,
      code: 'FINAL_SIGNATURE_LOCKED',
    });
    expect(harness.writes).toEqual([]);
  });
});

describe('runTreatmentPlanSave successful writes', () => {
  it('signs as the valid assigned active BCBA using only session identity', async () => {
    const harness = createHarness();

    const result = await runTreatmentPlanSave(saveInput(), harness.dependencies);

    expect(result).toEqual({
      success: true,
      version: NEXT_VERSION,
      signer: {
        id: BCBA_ID,
        name: 'Morgan Lee',
        email: 'morgan@example.com',
      },
      signed: true,
      overrideUsed: false,
    });
    expect(harness.writes).toHaveLength(1);
    expect(harness.writes[0]).toMatchObject({
      clientId: CLIENT_ID,
      expectedUpdatedAt: CURRENT_VERSION,
      expectedClientStatus: 'ASSESSMENT_SCHEDULED',
      expectedBcbaId: BCBA_ID,
      expectedTreatmentPlan: {
        assessmentScheduledAt: '2026-08-15T13:00:00.000Z',
        priorClinicalFact: 'Keep this exact text.',
      },
      nextClientStatus: undefined,
      treatmentPlan: {
        assessmentScheduledAt: '2026-08-15T13:00:00.000Z',
        priorClinicalFact: 'Keep this exact text.',
        medicalNecessity: 'Clinician-authored rationale.',
        authorId: BCBA_ID,
        authorName: 'Morgan Lee',
        authorEmail: 'morgan@example.com',
        assessorId: BCBA_ID,
        assessorName: 'Morgan Lee',
        assessorEmail: 'morgan@example.com',
        status: 'COMPLETED',
        signature: 'Morgan Lee',
        bcbaSignerId: BCBA_ID,
        bcbaSignerName: 'Morgan Lee',
        bcbaSignerEmail: 'morgan@example.com',
        bcbaSubmittedAt: SIGNED_AT,
      },
    });
    expect(harness.writes[0].treatmentPlan).not.toHaveProperty('signatureDate');
    expect(harness.writes[0].treatmentPlan).not.toHaveProperty('clinicalInterpretation');
    expect(harness.audits).toEqual([]);
  });

  it('allows existing clinical-role draft policy while attributing the save to the session user', async () => {
    const clinicalSupport: TreatmentPlanSessionUser = {
      id: LEADER_ID,
      firstName: 'Casey',
      lastName: 'Support',
      email: 'casey@example.com',
      role: 'CLINICAL_SUPPORT',
      isActive: true,
    };
    const harness = createHarness({
      auth: { ok: true, user: clinicalSupport },
    });

    const result = await runTreatmentPlanSave(
      saveInput({ isSubmit: false }),
      harness.dependencies,
    );

    expect(result).toMatchObject({
      success: true,
      signer: {
        id: LEADER_ID,
        name: 'Casey Support',
      },
      signed: false,
      overrideUsed: false,
    });
    expect(harness.writes[0].treatmentPlan).toMatchObject({
      authorId: LEADER_ID,
      authorName: 'Casey Support',
      assessorId: BCBA_ID,
      assessorName: 'Morgan Lee',
      status: 'DRAFT',
    });
    expect(harness.writes[0].treatmentPlan).not.toHaveProperty('signature');
  });

  it('replaces legacy identity metadata instead of carrying it into a new draft', async () => {
    const harness = createHarness({
      client: clientSnapshot({
        treatmentPlan: {
          medicalNecessity: 'Existing clinical content.',
          signerName: 'Untrusted Legacy Signer',
          signedByEmail: 'untrusted@example.com',
          authorId: OTHER_BCBA_ID,
        },
      }),
    });

    const result = await runTreatmentPlanSave(
      saveInput({ isSubmit: false }),
      harness.dependencies,
    );

    expect(result.success).toBe(true);
    expect(harness.writes[0].treatmentPlan).toMatchObject({
      medicalNecessity: 'Clinician-authored rationale.',
      authorId: BCBA_ID,
      authorName: 'Morgan Lee',
    });
    expect(harness.writes[0].treatmentPlan).not.toHaveProperty('signerName');
    expect(harness.writes[0].treatmentPlan).not.toHaveProperty('signedByEmail');
  });

  it('requires and audits a Clinical Director final-sign override', async () => {
    const director: TreatmentPlanSessionUser = {
      id: LEADER_ID,
      firstName: 'Avery',
      lastName: 'Director',
      email: 'avery@example.com',
      role: 'CLINICAL_DIRECTOR',
      isActive: true,
    };
    const harness = createHarness({
      auth: { ok: true, user: director },
    });

    const result = await runTreatmentPlanSave(
      saveInput({ overrideReason: 'Assigned clinician is on approved leave.' }),
      harness.dependencies,
    );

    expect(result).toMatchObject({
      success: true,
      signer: {
        id: LEADER_ID,
        name: 'Avery Director',
        email: 'avery@example.com',
      },
      signed: true,
      overrideUsed: true,
    });
    expect(harness.writes[0].treatmentPlan).toMatchObject({
      authorId: LEADER_ID,
      signature: 'Avery Director',
      bcbaSignerId: LEADER_ID,
      assessorId: BCBA_ID,
      assessorName: 'Morgan Lee',
    });
    expect(harness.audits).toEqual([
      {
        actorUserId: LEADER_ID,
        clientId: CLIENT_ID,
        assignedBcbaId: BCBA_ID,
        reason: 'Assigned clinician is on approved leave.',
      },
    ]);
  });

  it('rejects a leadership final signature without an override reason', async () => {
    const leader: TreatmentPlanSessionUser = {
      id: LEADER_ID,
      firstName: 'Alex',
      lastName: 'Executive',
      email: 'alex@example.com',
      role: 'CEO',
      isActive: true,
    };
    const harness = createHarness({
      auth: { ok: true, user: leader },
    });

    const result = await runTreatmentPlanSave(
      saveInput({ overrideReason: '   ' }),
      harness.dependencies,
    );

    expect(result).toMatchObject({
      success: false,
      code: 'OVERRIDE_REASON_REQUIRED',
    });
    expect(harness.writes).toEqual([]);
    expect(harness.audits).toEqual([]);
  });

  it('does not treat an Ops Director as a final-sign override role', async () => {
    const opsDirector: TreatmentPlanSessionUser = {
      id: LEADER_ID,
      firstName: 'Oakley',
      lastName: 'Ops',
      email: 'oakley@example.com',
      role: 'OPS_DIRECTOR',
      isActive: true,
    };
    const harness = createHarness({
      auth: { ok: true, user: opsDirector },
    });

    const result = await runTreatmentPlanSave(
      saveInput({ overrideReason: 'Operational coverage.' }),
      harness.dependencies,
    );

    expect(result).toMatchObject({
      success: false,
      code: 'FINAL_SIGN_FORBIDDEN',
    });
    expect(harness.writes).toEqual([]);
    expect(harness.audits).toEqual([]);
  });
});
