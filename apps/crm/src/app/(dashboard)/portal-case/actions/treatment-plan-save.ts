export type TreatmentPlanSessionUser = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  isActive: boolean;
};

export type TreatmentPlanAssignedBcba = TreatmentPlanSessionUser;

export type TreatmentPlanClientSnapshot = {
  id: string;
  status: string;
  updatedAt: Date | string;
  treatmentPlan: unknown;
  bcbaId: string | null;
  bcba: TreatmentPlanAssignedBcba | null;
};

export type TreatmentPlanConditionalWrite = {
  clientId: string;
  expectedUpdatedAt: string;
  expectedClientStatus: string;
  expectedBcbaId: string | null;
  expectedTreatmentPlan: unknown;
  treatmentPlan: Record<string, unknown>;
  nextClientStatus?: 'ASSESSMENT_SCHEDULED';
};

export type TreatmentPlanAuditEvent = {
  actorUserId: string;
  clientId: string;
  assignedBcbaId: string | null;
  reason: string;
};

export type TreatmentPlanSaveDependencies = {
  authenticate: () => Promise<
    | { ok: true; user: TreatmentPlanSessionUser }
    | { ok: false; error: string }
  >;
  loadClient: (clientId: string) => Promise<TreatmentPlanClientSnapshot | null>;
  updateIfCurrent: (
    write: TreatmentPlanConditionalWrite,
  ) => Promise<{ updatedAt: Date | string } | null>;
  auditOverride: (event: TreatmentPlanAuditEvent) => Promise<void>;
  now: () => Date;
};

export type TreatmentPlanSaveInput = {
  clientId: string;
  treatmentPlanData: unknown;
  isSubmit: boolean;
  expectedUpdatedAt?: string;
  overrideReason?: string;
};

export type TreatmentPlanSaveResult =
  | {
      success: true;
      version: string;
      signer: { id: string; name: string; email: string };
      signed: boolean;
      overrideUsed: boolean;
    }
  | {
      success: false;
      code: string;
      error: string;
    };

const CLINICAL_DRAFT_ROLES = new Set([
  'CEO',
  'CLINICAL_DIRECTOR',
  'OPS_DIRECTOR',
  'BCBA',
  'CLINICAL_SUPPORT',
]);

const LEADERSHIP_FINAL_SIGN_ROLES = new Set(['CEO', 'CLINICAL_DIRECTOR']);

const SUBMIT_STATUSES = new Set([
  'PA_APPROVED',
  'ASSESSMENT_SCHEDULED',
  'REPORT_ASSEMBLED',
  'TX_PA_SUBMITTED',
  'TX_PA_APPROVED',
  'STAFFING_PENDING',
  'ACTIVE',
]);

const CALLER_MANAGED_FIELDS = new Set([
  'clientId',
  'authorId',
  'authorName',
  'authorEmail',
  'assessorId',
  'assessorName',
  'assessorEmail',
  'signature',
  'signerId',
  'signerName',
  'signerEmail',
  'bcbaSignerId',
  'bcbaSignerName',
  'bcbaSignerEmail',
  'signedById',
  'signedByName',
  'signedByEmail',
  'bcbaSubmittedAt',
  'signedAt',
  'signatureDate',
  'status',
  'parentSignature',
  'parentSignatureDate',
  'assessmentScheduledAt',
]);

const MAX_OVERRIDE_REASON_LENGTH = 1000;

function failure(code: string, error: string): TreatmentPlanSaveResult {
  return { success: false, code, error };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseTreatmentPlan(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') {
    try {
      return asRecord(JSON.parse(value)) ?? {};
    } catch {
      return {};
    }
  }
  const record = asRecord(value);
  return record ? { ...record } : {};
}

function toIso(value: Date | string | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function identityFor(user: TreatmentPlanSessionUser) {
  const name =
    [user.firstName, user.lastName]
      .map((part) => part.trim())
      .filter(Boolean)
      .join(' ') || user.email.trim();
  return {
    id: user.id,
    name,
    email: user.email.trim(),
  };
}

function assignedBcbaFor(client: TreatmentPlanClientSnapshot) {
  const bcba = client.bcba;
  if (
    !bcba ||
    !client.bcbaId ||
    bcba.id !== client.bcbaId ||
    bcba.role !== 'BCBA'
  ) {
    return null;
  }
  return bcba;
}

function isAssignedActiveBcba(
  actor: TreatmentPlanSessionUser,
  client: TreatmentPlanClientSnapshot,
): boolean {
  const assigned = assignedBcbaFor(client);
  return (
    actor.role === 'BCBA' &&
    actor.isActive &&
    Boolean(assigned?.isActive) &&
    assigned?.id === actor.id
  );
}

export async function runTreatmentPlanSave(
  input: TreatmentPlanSaveInput,
  dependencies: TreatmentPlanSaveDependencies,
): Promise<TreatmentPlanSaveResult> {
  // Authentication is intentionally the first dependency call. No client
  // existence, version, or assignment detail is exposed before this gate.
  const auth = await dependencies.authenticate();
  if (!auth.ok) {
    const code = /not authenticated|authentication required|sign in/i.test(auth.error)
      ? 'UNAUTHENTICATED'
      : 'FORBIDDEN';
    return failure(code, auth.error);
  }

  const actor = auth.user;
  if (!actor.isActive || !CLINICAL_DRAFT_ROLES.has(actor.role)) {
    return failure(
      'FORBIDDEN',
      'You are not authorized to save this treatment plan.',
    );
  }

  const treatmentPlanData = asRecord(input.treatmentPlanData);
  if (!input.clientId || !treatmentPlanData) {
    return failure(
      'INVALID_INPUT',
      'A valid client and treatment-plan draft are required.',
    );
  }

  const expectedUpdatedAt = toIso(input.expectedUpdatedAt);
  if (!expectedUpdatedAt) {
    return failure(
      'STALE_VERSION',
      'This treatment plan is missing its current version. Refresh the client and try again.',
    );
  }

  const client = await dependencies.loadClient(input.clientId);
  if (!client || client.id !== input.clientId) {
    return failure('CLIENT_NOT_FOUND', 'Client not found.');
  }

  const assignedActive = isAssignedActiveBcba(actor, client);
  if (actor.role === 'BCBA' && !assignedActive) {
    return failure(
      'NOT_ASSIGNED_ACTIVE_BCBA',
      'Only the client’s assigned active BCBA may save or sign this treatment plan.',
    );
  }

  let overrideReason: string | null = null;
  let overrideUsed = false;
  if (input.isSubmit) {
    if (assignedActive) {
      // The assigned active BCBA signs under the normal clinical path.
    } else if (LEADERSHIP_FINAL_SIGN_ROLES.has(actor.role)) {
      overrideReason =
        typeof input.overrideReason === 'string'
          ? input.overrideReason.trim()
          : '';
      if (!overrideReason) {
        return failure(
          'OVERRIDE_REASON_REQUIRED',
          'A leadership override reason is required to final-sign for the assigned BCBA.',
        );
      }
      if (overrideReason.length > MAX_OVERRIDE_REASON_LENGTH) {
        return failure(
          'OVERRIDE_REASON_INVALID',
          `Leadership override reasons must be ${MAX_OVERRIDE_REASON_LENGTH} characters or fewer.`,
        );
      }
      overrideUsed = true;
    } else {
      return failure(
        'FINAL_SIGN_FORBIDDEN',
        'Only the assigned active BCBA, Clinical Director, or CEO may final-sign this treatment plan.',
      );
    }
  }

  const currentVersion = toIso(client.updatedAt);
  if (!currentVersion || currentVersion !== expectedUpdatedAt) {
    return failure(
      'STALE_VERSION',
      'This treatment plan changed in another session. Refresh before saving so newer work is not overwritten.',
    );
  }

  const existing = parseTreatmentPlan(client.treatmentPlan);
  if (existing.status === 'COMPLETED' || existing.bcbaSubmittedAt) {
    return failure(
      'FINAL_SIGNATURE_LOCKED',
      'This treatment plan already has a final signature and cannot be overwritten. Refresh to view the signed plan.',
    );
  }

  if (input.isSubmit && !SUBMIT_STATUSES.has(client.status)) {
    return failure(
      'PIPELINE_GATE',
      'Treatment plans can be final-signed only after Assessment PA is approved.',
    );
  }

  const callerManagedField = Object.keys(treatmentPlanData).find((key) =>
    CALLER_MANAGED_FIELDS.has(key),
  );
  if (callerManagedField) {
    return failure(
      'CALLER_IDENTITY_NOT_ALLOWED',
      'Author, signer, signature, and workflow identity are verified from the current session and cannot be submitted by the browser.',
    );
  }

  const actorIdentity = identityFor(actor);
  const assignedBcba = assignedBcbaFor(client);
  const assignedIdentity = assignedBcba ? identityFor(assignedBcba) : null;
  const nextPlan: Record<string, unknown> = {
    ...existing,
    ...treatmentPlanData,
  };

  for (const field of CALLER_MANAGED_FIELDS) {
    // Assessment scheduling is server-owned by scheduleAssessment and must
    // survive plan edits. Every identity/signature field is rebuilt below.
    if (field !== 'assessmentScheduledAt') delete nextPlan[field];
  }

  nextPlan.authorId = actorIdentity.id;
  nextPlan.authorName = actorIdentity.name;
  nextPlan.authorEmail = actorIdentity.email;
  nextPlan.assessorId = assignedIdentity?.id ?? null;
  nextPlan.assessorName = assignedIdentity?.name ?? null;
  nextPlan.assessorEmail = assignedIdentity?.email ?? null;

  if (input.isSubmit) {
    const signedAt = dependencies.now().toISOString();
    nextPlan.status = 'COMPLETED';
    nextPlan.signature = actorIdentity.name;
    nextPlan.bcbaSignerId = actorIdentity.id;
    nextPlan.bcbaSignerName = actorIdentity.name;
    nextPlan.bcbaSignerEmail = actorIdentity.email;
    // This is the actual server-observed signing event time. No date is
    // inferred from assessment dates or caller content.
    nextPlan.bcbaSubmittedAt = signedAt;
  } else {
    nextPlan.status = 'DRAFT';
  }

  const shouldMarkScheduled =
    input.isSubmit &&
    client.status === 'PA_APPROVED' &&
    Boolean(existing.assessmentScheduledAt);

  const updated = await dependencies.updateIfCurrent({
    clientId: input.clientId,
    expectedUpdatedAt,
    expectedClientStatus: client.status,
    expectedBcbaId: client.bcbaId,
    expectedTreatmentPlan: client.treatmentPlan,
    treatmentPlan: nextPlan,
    nextClientStatus: shouldMarkScheduled
      ? 'ASSESSMENT_SCHEDULED'
      : undefined,
  });

  const updatedVersion = toIso(updated?.updatedAt);
  if (!updatedVersion) {
    return failure(
      'STALE_VERSION',
      'This treatment plan changed while it was being saved. Refresh before trying again.',
    );
  }

  if (overrideUsed && overrideReason) {
    await dependencies.auditOverride({
      actorUserId: actor.id,
      clientId: client.id,
      assignedBcbaId: client.bcbaId,
      reason: overrideReason,
    });
  }

  return {
    success: true,
    version: updatedVersion,
    signer: actorIdentity,
    signed: input.isSubmit,
    overrideUsed,
  };
}
