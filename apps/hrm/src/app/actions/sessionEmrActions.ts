'use server';

import { createHash } from 'node:crypto';
import type { Prisma } from '@repo/db';
import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { writeAuditLog } from '@/lib/auditLog';
import { isDevToolsEnabled } from '@/lib/devToolsGate';
import { resolveActingRbtContext } from '@/lib/resolveActingRbt';
import {
  buildChecklistSnapshot,
  buildClinicalNoteDocument,
  buildStructuredNoteContent,
  resolveAuthoritativeSessionInterval,
  resolveRbtStudioBillingFacts,
  type AuthoritativeSessionInterval,
  type BillingCheckItem,
  type ChecklistSnapshot,
  type RbtStudioBillingFacts,
  type RbtStudioBillingFactsResult,
  type StudioDurationEpisode,
  type StudioFrequency,
  type StudioProbe,
  type StudioTaskAnalysis,
} from '@/lib/sessionStudio';
import {
  assertClaimReadyForSubmit,
  claimReadyInputFromPayload,
} from '@/lib/sessionStudioClaimReady';
import {
  crmClinicalGoalsUrl,
  payloadsFromTreatmentPlan,
  treatmentPlanHasSyncableGoals,
} from '@/lib/syncSessionStudioTargets';

export interface SubmitHrmSessionNotePayload {
  rbtUserId?: string;
  clientId?: string;
  /** When set, completes an existing SCHEDULED Session instead of creating a new one */
  sessionId?: string;
  clientName: string;
  cptCode: string;
  locationCode: string;
  sessionSeconds: number;
  /**
   * Display-only hints from Studio. Persisted Session/EVV anchors are the only
   * duration and money authority.
   */
  billableUnits: number;
  startedAt?: string | null;
  endedAt?: string | null;
  supervisingBcba?: string;
  caregiverPresent?: 'YES' | 'NO' | '';
  caregiverName?: string;
  goalsAddressed?: string;
  objectiveData?: string;
  interventions?: string[];
  clientResponse?: string;
  barriersSafety?: string;
  caregiverParticipation?: string;
  planNext?: string;
  /** @deprecated prefer structured clinical fields above */
  subjectiveNote?: string;
  assessmentNote?: string;
  planNote?: string;
  trials: Array<{
    targetId?: string;
    targetGoal: string;
    response: 'CORRECT' | 'PROMPTED' | 'INCORRECT';
    promptLevel?: string;
    timestamp: string;
  }>;
  frequencies?: StudioFrequency[];
  durations?: StudioDurationEpisode[];
  taskAnalyses?: StudioTaskAnalysis[];
  probes?: StudioProbe[];
  /** @deprecated prefer taskAnalyses */
  taSteps?: Array<{
    instruction: string;
    status: 'INDEPENDENT' | 'PROMPTED';
  }>;
  abcEvents?: Array<{
    antecedent: string;
    behavior: string;
    consequence: string;
    durationSeconds?: number;
    intensity?: 'MILD' | 'MODERATE' | 'SEVERE';
    behaviorTargetId?: string | null;
    at?: string;
  }>;
  rbtSignature: string;
  parentSignature: string;
  /**
   * Schema-free optimistic concurrency token loaded with the Studio session.
   * Null/omitted means the client expects no persisted SessionNote yet.
   */
  expectedNoteUpdatedAt?: string | null;
  /** Optional pre-built checklist freeze from Studio; rebuilt server-side if omitted */
  checklistSnapshot?: ChecklistSnapshot;
  checklistItems?: Array<Pick<BillingCheckItem, 'key' | 'label' | 'standard' | 'ok'>>;
  clockOutCoordinates?: EvvCoordinates;
}

export type EvvCoordinates = {
  latitude: number;
  longitude: number;
};

function isUuid(id: string | undefined | null): boolean {
  if (!id) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

const SESSION_STALE_CONFLICT = 'SESSION_STALE_CONFLICT';
const SESSION_NOTE_REVISION_CONFLICT = 'SESSION_NOTE_REVISION_CONFLICT';
const EVV_CLOCK_IN_MISSING = 'EVV_CLOCK_IN_MISSING';
const EVV_CLOCK_OUT_CONFLICT = 'EVV_CLOCK_OUT_CONFLICT';
const EVV_TIME_CONFLICT = 'EVV_TIME_CONFLICT';
const CLAIM_READY_CONFLICT = 'CLAIM_READY_CONFLICT';

type SuccessfulInterval = Extract<AuthoritativeSessionInterval, { ok: true }>;
type ClaimReadyResult = ReturnType<typeof assertClaimReadyForSubmit>;

class ClaimReadySubmitError extends Error {
  readonly gate: Extract<ClaimReadyResult, { ok: false }>;

  constructor(gate: Extract<ClaimReadyResult, { ok: false }>) {
    super(CLAIM_READY_CONFLICT);
    this.gate = gate;
  }
}

function claimGateFailureResult(
  gate: Extract<ClaimReadyResult, { ok: false }>
) {
  return {
    success: false as const,
    code: CLAIM_READY_CONFLICT,
    conflict: true as const,
    recoverable: true as const,
    error: gate.error,
    missingKeys: gate.missingKeys,
    checklist: gate.evaluation.checklist,
  };
}

function billingFactsFailureResult(
  facts: Extract<RbtStudioBillingFactsResult, { ok: false }>
) {
  return {
    success: false as const,
    code: facts.code,
    conflict: true as const,
    recoverable: true as const,
    error: facts.error,
  };
}

function validCoordinates(input: EvvCoordinates | undefined): EvvCoordinates | null {
  if (
    !input ||
    !Number.isFinite(input.latitude) ||
    !Number.isFinite(input.longitude) ||
    input.latitude < -90 ||
    input.latitude > 90 ||
    input.longitude < -180 ||
    input.longitude > 180
  ) {
    return null;
  }
  return input;
}

function timeConflictResult(
  interval: Exclude<AuthoritativeSessionInterval, { ok: true }>
) {
  return {
    success: false as const,
    code: interval.code,
    conflict: true as const,
    recoverable: true as const,
    error: interval.error,
  };
}

function withoutVolatileAt(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutVolatileAt);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => key !== 'at')
      .map(([key, entry]) => [key, withoutVolatileAt(entry)])
  );
}

function submissionFingerprint(input: {
  data: SubmitHrmSessionNotePayload;
  sessionId: string;
  rbtId: string;
  bcbaId: string;
  interval: SuccessfulInterval;
  billingFacts: RbtStudioBillingFacts;
}): string {
  const normalized = withoutVolatileAt({
    schemaVersion: 1,
    sessionId: input.sessionId,
    rbtId: input.rbtId,
    bcbaId: input.bcbaId,
    actualStart: input.interval.startedAt,
    actualEnd: input.interval.endedAt,
    cptCode: input.billingFacts.cptCode,
    placeOfService: input.billingFacts.placeOfService,
    caregiverPresent: input.data.caregiverPresent,
    caregiverName: input.data.caregiverName,
    caregiverParticipation: input.data.caregiverParticipation,
    goalsAddressed: input.data.goalsAddressed,
    objectiveData: input.data.objectiveData,
    interventions: input.data.interventions,
    clientResponse: input.data.clientResponse || input.data.subjectiveNote,
    barriersSafety: input.data.barriersSafety,
    planNext: input.data.planNext || input.data.planNote,
    trials: input.data.trials,
    frequencies: input.data.frequencies,
    durations: input.data.durations,
    taskAnalyses: input.data.taskAnalyses,
    taSteps: input.data.taSteps,
    probes: input.data.probes,
    abcEvents: input.data.abcEvents,
    rbtSignature: input.data.rbtSignature.trim(),
    parentSignature: input.data.parentSignature.trim(),
  });
  return createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}

function storedSubmissionFingerprint(value: Prisma.JsonValue | null): string | null {
  if (!value || Array.isArray(value) || typeof value !== 'object') return null;
  const fingerprint = (value as Record<string, unknown>).submissionFingerprint;
  return typeof fingerprint === 'string' ? fingerprint : null;
}

function isPrismaUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  );
}

type SessionForAuthoritativeClose = {
  id: string;
  clientId: string;
  rbtId: string | null;
  bcbaId: string | null;
  status: string;
  actualStart: Date | null;
  actualEnd: Date | null;
  cptCode: string | null;
  location: string | null;
  placeOfServiceCode: string | null;
};

type DurableClockOutResolution =
  | {
      ok: true;
      interval: SuccessfulInterval;
      evvLogId: string;
      locationVerified: boolean;
    }
  | {
      ok: false;
      code:
        | Exclude<AuthoritativeSessionInterval, { ok: true }>['code']
        | 'EVV_CLOCK_OUT_REQUIRED'
        | 'EVV_CLOCK_OUT_CONFLICT'
        | 'EVV_TIME_CONFLICT';
      error: string;
    };

function hasCoordinatePair(lat: number | null, lng: number | null): boolean {
  return (
    lat !== null &&
    lng !== null &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

async function readDurableCompletedClockOut(
  session: SessionForAuthoritativeClose,
  actingRbtId: string
): Promise<DurableClockOutResolution> {
  const interval = resolveAuthoritativeSessionInterval({
    actualStart: session.actualStart,
    actualEnd: session.actualEnd,
  });
  if (!interval.ok) return interval;

  const logs = await prisma.eVVLog.findMany({
    where: { sessionId: session.id },
    select: {
      id: true,
      staffId: true,
      clockInTimestamp: true,
      clockOutTimestamp: true,
      clockInLat: true,
      clockInLng: true,
      clockOutLat: true,
      clockOutLng: true,
      isLocationVerified: true,
    },
    orderBy: [{ clockInTimestamp: 'asc' }, { id: 'asc' }],
  });
  if (logs.some((log) => log.clockOutTimestamp === null)) {
    return {
      ok: false,
      code: 'EVV_CLOCK_OUT_CONFLICT',
      error:
        'The Session is completed but an EVV visit is still open. Keep the draft and contact Operations.',
    };
  }
  if (logs.length === 0) {
    return {
      ok: false,
      code: 'EVV_CLOCK_OUT_REQUIRED',
      error:
        'A durable EVV clock-out matching the Session interval is required before documentation submission.',
    };
  }
  if (logs.length > 1) {
    return {
      ok: false,
      code: 'EVV_CLOCK_OUT_CONFLICT',
      error:
        'Exactly one durable EVV clock-out is required for this Session. Keep the draft and contact Operations.',
    };
  }

  const matching = logs.filter(
    (log) =>
      log.staffId === actingRbtId &&
      log.clockInTimestamp.getTime() === new Date(interval.startedAt).getTime() &&
      log.clockOutTimestamp?.getTime() === new Date(interval.endedAt).getTime()
  );
  if (matching.length === 0) {
    return {
      ok: false,
      code: 'EVV_CLOCK_OUT_REQUIRED',
      error:
        'A durable EVV clock-out matching the Session interval is required before documentation submission.',
    };
  }
  if (matching.length !== 1) {
    return {
      ok: false,
      code: 'EVV_CLOCK_OUT_CONFLICT',
      error:
        'Multiple EVV clock-outs match this Session. Keep the draft and contact Operations before billing.',
    };
  }

  const log = matching[0];
  return {
    ok: true,
    interval,
    evvLogId: log.id,
    locationVerified:
      log.isLocationVerified &&
      hasCoordinatePair(log.clockInLat, log.clockInLng) &&
      hasCoordinatePair(log.clockOutLat, log.clockOutLng),
  };
}

async function closeSessionInsideTransaction(input: {
  tx: Prisma.TransactionClient;
  session: SessionForAuthoritativeClose;
  actingRbtId: string;
  coordinates?: EvvCoordinates;
  source: 'HRM_SESSION_STUDIO_CLOCK_OUT' | 'HRM_SESSION_STUDIO_SUBMIT';
  reason: string;
  correlationId: string;
}) {
  if (!input.session.actualStart) throw new Error('SESSION_TIME_MISSING');

  // Captured after the guarded transaction begins; browser end/duration values
  // never participate in the write or unit calculation.
  const endedAt = new Date();
  const interval = resolveAuthoritativeSessionInterval({
    actualStart: input.session.actualStart,
    actualEnd: endedAt,
    now: endedAt,
  });
  if (!interval.ok) throw new Error(interval.code);

  const sessionLogs = await input.tx.eVVLog.findMany({
    where: {
      sessionId: input.session.id,
    },
    select: {
      id: true,
      staffId: true,
      clockInTimestamp: true,
      clockOutTimestamp: true,
    },
    orderBy: [{ clockInTimestamp: 'asc' }, { id: 'asc' }],
  });
  if (sessionLogs.some((log) => log.clockOutTimestamp !== null)) {
    throw new Error(EVV_CLOCK_OUT_CONFLICT);
  }
  const openLogs = sessionLogs.filter((log) => log.clockOutTimestamp === null);
  const canonical = openLogs.find(
    (log) =>
      log.staffId === input.actingRbtId &&
      log.clockInTimestamp.getTime() === input.session.actualStart!.getTime()
  );
  if (!canonical) {
    throw new Error(openLogs.length === 0 ? EVV_CLOCK_IN_MISSING : EVV_TIME_CONFLICT);
  }
  const requireClinicalAssignment =
    input.source === 'HRM_SESSION_STUDIO_SUBMIT';

  const transitioned = await input.tx.session.updateMany({
    where: {
      id: input.session.id,
      clientId: input.session.clientId,
      rbtId: input.actingRbtId,
      bcbaId: input.session.bcbaId,
      status: 'IN_PROGRESS',
      actualStart: input.session.actualStart,
      actualEnd: null,
      cptCode: input.session.cptCode,
      location: input.session.location,
      placeOfServiceCode: input.session.placeOfServiceCode,
      rbt: {
        is: {
          id: input.actingRbtId,
          role: 'RBT',
          isActive: true,
        },
      },
      ...(requireClinicalAssignment && input.session.bcbaId
        ? {
            bcba: {
              is: {
                id: input.session.bcbaId,
                role: 'BCBA',
                isActive: true,
              },
            },
          }
        : {}),
      client: {
        is: {
          rbtId: input.actingRbtId,
          ...(requireClinicalAssignment
            ? { bcbaId: input.session.bcbaId }
            : {}),
        },
      },
    },
    data: {
      status: 'COMPLETED',
      actualEnd: endedAt,
    },
  });
  if (transitioned.count !== 1) throw new Error(SESSION_STALE_CONFLICT);

  const coordinates = validCoordinates(input.coordinates);
  const closed = await input.tx.eVVLog.updateMany({
    where: {
      id: canonical.id,
      sessionId: input.session.id,
      staffId: input.actingRbtId,
      clockOutTimestamp: null,
    },
    data: {
      clockOutTimestamp: endedAt,
      clockOutLat: coordinates?.latitude ?? null,
      clockOutLng: coordinates?.longitude ?? null,
      // Coordinates are capture evidence, not a reviewed verification result.
      isLocationVerified: false,
    },
  });
  if (closed.count !== 1) throw new Error(EVV_CLOCK_OUT_CONFLICT);

  await input.tx.eVVLog.deleteMany({
    where: {
      id: { not: canonical.id },
      sessionId: input.session.id,
      clockOutTimestamp: null,
    },
  });

  const sessionRow = await input.tx.session.findUnique({
    where: { id: input.session.id },
  });
  if (!sessionRow) throw new Error(SESSION_STALE_CONFLICT);

  await input.tx.auditLogVault.create({
    data: {
      userId: input.actingRbtId,
      action: 'EDIT',
      resourceType: 'SESSION',
      resourceId: input.session.id,
      metadata: {
        event: 'SESSION_STATUS_TRANSITION',
        source: input.source,
        reason: input.reason,
        correlationId: input.correlationId,
        previousStatus: 'IN_PROGRESS',
        nextStatus: 'COMPLETED',
        previousRbtId: input.actingRbtId,
        nextRbtId: input.actingRbtId,
        actualStart: interval.startedAt,
        actualEnd: interval.endedAt,
        durationSeconds: interval.durationSeconds,
        evvLogId: canonical.id,
        locationVerified: false,
      },
    },
  });

  return {
    session: sessionRow,
    interval,
    evvLogId: canonical.id,
    locationVerified: false,
  };
}

function clockConflictResult(error: Error) {
  const code = error.message;
  if (
    code === 'SESSION_TIME_MISSING' ||
    code === 'SESSION_TIME_INVALID' ||
    code === 'SESSION_TIME_REVERSED' ||
    code === 'SESSION_DURATION_IMPLAUSIBLE'
  ) {
    const interval = resolveAuthoritativeSessionInterval({
      actualStart: null,
      actualEnd: null,
    });
    return {
      success: false as const,
      code,
      conflict: true as const,
      recoverable: true as const,
      error:
        code === 'SESSION_TIME_MISSING'
          ? interval.ok
            ? 'The durable service interval is missing.'
            : interval.error
          : 'The durable Session/EVV interval is invalid. Keep the draft and contact Operations.',
    };
  }
  if (code === EVV_CLOCK_IN_MISSING) {
    return {
      success: false as const,
      code: 'EVV_CLOCK_IN_MISSING' as const,
      conflict: true as const,
      recoverable: true as const,
      error:
        'No durable open EVV visit matches this Session clock-in. Collection remains recoverable; contact Operations.',
    };
  }
  if (code === EVV_TIME_CONFLICT || code === EVV_CLOCK_OUT_CONFLICT) {
    return {
      success: false as const,
      code: code as 'EVV_TIME_CONFLICT' | 'EVV_CLOCK_OUT_CONFLICT',
      conflict: true as const,
      recoverable: true as const,
      error:
        'The EVV visit changed or does not match the Session interval. Keep the draft and reload before retrying.',
    };
  }
  return null;
}

async function reconcileDurableClockIn(sessionId: string, actingRbtId: string) {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      client: { select: { rbtId: true } },
    },
  });
  if (
    !session ||
    session.status !== 'IN_PROGRESS' ||
    !session.actualStart ||
    session.rbtId !== actingRbtId ||
    session.client.rbtId !== actingRbtId
  ) {
    return null;
  }

  const logs = await prisma.eVVLog.findMany({
    where: {
      sessionId,
    },
    select: {
      id: true,
      staffId: true,
      clockInTimestamp: true,
      clockOutTimestamp: true,
    },
    orderBy: [{ clockInTimestamp: 'asc' }, { id: 'asc' }],
  });
  const openLogs = logs.filter((log) => log.clockOutTimestamp === null);
  const matching = openLogs.filter(
    (log) =>
      log.staffId === actingRbtId &&
      log.clockInTimestamp.getTime() === session.actualStart!.getTime()
  );
  if (logs.length !== 1 || openLogs.length !== 1 || matching.length !== 1) {
    return null;
  }

  return {
    success: true as const,
    sessionId,
    status: 'IN_PROGRESS' as const,
    startedAt: session.actualStart.toISOString(),
    reconciled: true as const,
    locationVerified: false as const,
    error: undefined,
  };
}

async function resolveActiveActingRbt() {
  const acting = await resolveActingRbtContext();
  if (!acting.rbtUserId) {
    return {
      ok: false as const,
      error: 'No authenticated RBT identity. Sign in from the RBT portal.',
    };
  }

  const rbt = await prisma.user.findFirst({
    where: {
      id: acting.rbtUserId,
      role: 'RBT',
      isActive: true,
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      role: true,
      isActive: true,
    },
  });
  if (!rbt) {
    return {
      ok: false as const,
      error: 'Your active RBT staff account could not be verified.',
    };
  }

  return { ok: true as const, rbt };
}

async function loadAuthorizedRbtSession(
  sessionId: string,
  actingRbtId: string,
  operation: 'CLOCK_IN' | 'CLOCK_OUT' | 'READ_TARGETS' | 'SUBMIT'
) {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      client: true,
      bcba: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          role: true,
          isActive: true,
        },
      },
      // Session.note is one-to-one (SessionNote?) in prisma/schema.prisma.
      note: {
        select: {
          id: true,
          sessionId: true,
          rbtSigned: true,
          parentSigned: true,
          bcbaSigned: true,
          isConverted: true,
          structuredContent: true,
          billableUnits: true,
          rbtSignerName: true,
          parentSignerName: true,
          updatedAt: true,
          deficiencies: {
            where: { status: 'OPEN' },
            select: { id: true },
            take: 1,
          },
        },
      },
      // Session.evvLogs is one-to-many (EVVLog[]) in both Prisma schemas.
      evvLogs: {
        select: {
          id: true,
          staffId: true,
          clockInTimestamp: true,
          clockOutTimestamp: true,
          clockInLat: true,
          clockInLng: true,
          clockOutLat: true,
          clockOutLng: true,
          isLocationVerified: true,
        },
        orderBy: [{ clockInTimestamp: 'asc' }, { id: 'asc' }],
      },
    },
  });
  if (!session) {
    return {
      ok: false as const,
      error: 'The assigned scheduled session was not found.',
    };
  }
  if (!session.rbtId) {
    return {
      ok: false as const,
      error: 'This session has no assigned RBT. Ask Case Coordination to assign it before continuing.',
    };
  }
  if (session.rbtId !== actingRbtId) {
    return {
      ok: false as const,
      error: 'This session is assigned to a different RBT.',
    };
  }
  if (session.client.rbtId !== actingRbtId) {
    return {
      ok: false as const,
      error: 'You are not the currently assigned RBT for this client.',
    };
  }

  const billingFacts = resolveRbtStudioBillingFacts({
    persistedCptCode: session.cptCode,
    persistedPlaceOfServiceCode: session.placeOfServiceCode,
    persistedLocation: session.location,
  });
  if (!billingFacts.ok) {
    return {
      ok: false as const,
      code: billingFacts.code,
      error: billingFacts.error,
    };
  }

  if (operation === 'CLOCK_IN') {
    if (session.status !== 'SCHEDULED' && session.status !== 'IN_PROGRESS') {
      return {
        ok: false as const,
        error: `Cannot clock in a ${session.status} session.`,
      };
    }
    return { ok: true as const, session, billingFacts };
  }

  if (operation === 'CLOCK_OUT') {
    if (session.status !== 'IN_PROGRESS' && session.status !== 'COMPLETED') {
      return {
        ok: false as const,
        error: `Cannot clock out a ${session.status} session.`,
      };
    }
    return { ok: true as const, session, billingFacts };
  }

  if (operation === 'READ_TARGETS') {
    if (
      session.status !== 'SCHEDULED' &&
      session.status !== 'IN_PROGRESS' &&
      session.status !== 'COMPLETED'
    ) {
      return {
        ok: false as const,
        error: `Cannot load clinical targets for a ${session.status} session.`,
      };
    }
    return { ok: true as const, session, billingFacts };
  }

  if (session.status !== 'IN_PROGRESS' && session.status !== 'COMPLETED') {
    return {
      ok: false as const,
      error: 'Clock in to the assigned scheduled session before submitting its note.',
    };
  }
  if (!session.actualStart) {
    return {
      ok: false as const,
      error: 'The assigned session has no verified clock-in timestamp.',
    };
  }
  if (
    !session.bcbaId ||
    session.client.bcbaId !== session.bcbaId ||
    !session.bcba ||
    session.bcba.role !== 'BCBA' ||
    !session.bcba.isActive
  ) {
    return {
      ok: false as const,
      error: 'The session BCBA assignment is stale or inactive. Ask Clinical to reconcile it.',
    };
  }

  return { ok: true as const, session, billingFacts };
}

function scoreFromResponse(response: 'CORRECT' | 'PROMPTED' | 'INCORRECT'): string {
  if (response === 'CORRECT') return '+';
  if (response === 'PROMPTED') return 'P';
  return '-';
}

function scoreFromProbe(result: 'CORRECT' | 'INCORRECT' | 'NO_RESPONSE'): string {
  if (result === 'CORRECT') return '+';
  if (result === 'NO_RESPONSE') return 'NR';
  return '-';
}

type ExistingBehaviorTargetResolution =
  | {
      behaviorTargetId: string;
      mappingStatus: 'MAPPED_EXISTING_TARGET';
      mappingSource: 'EXPLICIT_TARGET_ID' | 'NORMALIZED_LABEL';
    }
  | {
      behaviorTargetId: null;
      mappingStatus: 'PROVISIONAL_BCBA_REVIEW';
      mappingSource: 'UNMATCHED_RBT_OBSERVATION';
    };

function normalizeBehaviorLabel(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * In-memory resolver backed by one client-scoped prefetch. RBT observations
 * may link to an existing BehaviorTarget, but can never create clinical
 * reference data or fuzzy-match a similar label.
 */
async function makeExistingBehaviorTargetResolver(clientId: string) {
  const targets = await prisma.behaviorTarget.findMany({
    where: { clientId },
    select: { id: true, behaviorName: true },
  });
  const byId = new Map(targets.map((target) => [target.id, target]));
  const byName = new Map(
    targets.map((target) => [normalizeBehaviorLabel(target.behaviorName), target])
  );

  return function resolveTarget(opts: {
    behaviorTargetId?: string | null;
    behaviorName: string;
  }): ExistingBehaviorTargetResolution {
    const normalizedLabel = normalizeBehaviorLabel(opts.behaviorName);
    if (opts.behaviorTargetId) {
      const explicit = isUuid(opts.behaviorTargetId)
        ? byId.get(opts.behaviorTargetId)
        : undefined;
      if (
        explicit &&
        normalizeBehaviorLabel(explicit.behaviorName) === normalizedLabel
      ) {
        return {
          behaviorTargetId: explicit.id,
          mappingStatus: 'MAPPED_EXISTING_TARGET',
          mappingSource: 'EXPLICIT_TARGET_ID',
        };
      }
      return {
        behaviorTargetId: null,
        mappingStatus: 'PROVISIONAL_BCBA_REVIEW',
        mappingSource: 'UNMATCHED_RBT_OBSERVATION',
      };
    }

    const normalized = byName.get(normalizedLabel);
    if (normalized) {
      return {
        behaviorTargetId: normalized.id,
        mappingStatus: 'MAPPED_EXISTING_TARGET',
        mappingSource: 'NORMALIZED_LABEL',
      };
    }
    return {
      behaviorTargetId: null,
      mappingStatus: 'PROVISIONAL_BCBA_REVIEW',
      mappingSource: 'UNMATCHED_RBT_OBSERVATION',
    };
  };
}

type ResolvedAbcObservation = NonNullable<
  SubmitHrmSessionNotePayload['abcEvents']
>[number] & ExistingBehaviorTargetResolution;

type ObservationMappingSummary = {
  mappedObservationCount: number;
  unmappedObservationCount: number;
  observationMappingStatus:
    | 'NO_OBSERVATIONS'
    | 'ALL_MAPPED'
    | 'BCBA_MAPPING_NEEDED';
  observationMessage?: 'Observation saved — BCBA mapping needed.';
};

function observationMappingSummary(
  observations: Array<{
    behaviorTargetId?: string | null;
    mappingStatus?: string;
  }>
): ObservationMappingSummary {
  const mappedObservationCount = observations.filter(
    (observation) =>
      observation.mappingStatus === 'MAPPED_EXISTING_TARGET' ||
      (observation.mappingStatus === undefined &&
        typeof observation.behaviorTargetId === 'string')
  ).length;
  const unmappedObservationCount = observations.length - mappedObservationCount;
  if (observations.length === 0) {
    return {
      mappedObservationCount: 0,
      unmappedObservationCount: 0,
      observationMappingStatus: 'NO_OBSERVATIONS',
    };
  }
  if (unmappedObservationCount === 0) {
    return {
      mappedObservationCount,
      unmappedObservationCount: 0,
      observationMappingStatus: 'ALL_MAPPED',
    };
  }
  return {
    mappedObservationCount,
    unmappedObservationCount,
    observationMappingStatus: 'BCBA_MAPPING_NEEDED',
    observationMessage: 'Observation saved — BCBA mapping needed.',
  };
}

function storedObservationMappingSummary(
  value: Prisma.JsonValue | null
): ObservationMappingSummary {
  if (!value || Array.isArray(value) || typeof value !== 'object') {
    return observationMappingSummary([]);
  }
  const modalities = (value as Record<string, unknown>).modalities;
  if (!modalities || Array.isArray(modalities) || typeof modalities !== 'object') {
    return observationMappingSummary([]);
  }
  const abcEvents = (modalities as Record<string, unknown>).abcEvents;
  if (!Array.isArray(abcEvents)) return observationMappingSummary([]);
  return observationMappingSummary(
    abcEvents.filter(
      (
        observation
      ): observation is {
        behaviorTargetId?: string | null;
        mappingStatus?: string;
      } => Boolean(observation) && typeof observation === 'object'
    )
  );
}

/**
 * Gap 10 — Studio loads the acting RBT identity on mount and passes it back
 * explicitly on submit; the server re-verifies it against the device/auth session.
 */
export async function getActingRbtForStudio() {
  try {
    const resolved = await resolveActiveActingRbt();
    if (!resolved.ok) {
      return {
        success: false as const,
        rbtUserId: null,
        error: resolved.error,
      };
    }
    const { rbt } = resolved;
    return {
      success: true as const,
      rbtUserId: rbt.id,
      rbtName: `${rbt.firstName} ${rbt.lastName}`.trim(),
    };
  } catch (error) {
    console.error(
      'getActingRbtForStudio failed:',
      error instanceof Error ? error.message : 'Unknown'
    );
    return { success: false as const, rbtUserId: null, error: 'Failed to resolve RBT identity.' };
  }
}

type StudioTargetRow = { id: string; label: string; domain: string; measurementType?: string };
type StudioBehaviorRow = { id: string; label: string; measurementType: string };

const EMPTY_TARGETS = {
  targets: [] as StudioTargetRow[],
  behaviorTargets: [] as StudioBehaviorRow[],
};

/**
 * Load durable SkillTarget / BehaviorTarget for Collect.
 * When autoSync (default true): if client has treatmentPlan goals but zero SkillTargets,
 * idempotently create SkillTarget + BehaviorTarget rows (HRM mirror of CRM Clinical Goals sync).
 */
export async function getSessionStudioTargets(input: {
  sessionId: string;
  /** Display-only compatibility hints; never used to establish client scope. */
  clientName?: string;
  clientId?: string;
  /** Default true — sync TP → SkillTargets when Collect would otherwise be empty */
  autoSync?: boolean;
}) {
  try {
    const acting = await resolveActiveActingRbt();
    if (!acting.ok) {
      return {
        success: false as const,
        ...EMPTY_TARGETS,
        error: acting.error,
      };
    }
    if (!isUuid(input.sessionId)) {
      return {
        success: false as const,
        ...EMPTY_TARGETS,
        error: 'An assigned scheduled session is required to load clinical targets.',
      };
    }

    const access = await loadAuthorizedRbtSession(
      input.sessionId,
      acting.rbt.id,
      'READ_TARGETS'
    );
    if (!access.ok) {
      return {
        success: false as const,
        ...EMPTY_TARGETS,
        code: 'code' in access ? access.code : undefined,
        error: access.error,
      };
    }
    const autoSync = input.autoSync !== false;

    const client = await prisma.client.findUnique({
      where: { id: access.session.clientId },
      include: {
        skillTargets: {
          where: { targetStatus: { in: ['BASELINE', 'IN_PROGRESS'] } },
          orderBy: { createdAt: 'asc' },
          take: 40,
        },
        behaviorTargets: {
          orderBy: { createdAt: 'asc' },
          take: 40,
        },
      },
    });

    if (!client) {
      return {
        success: false as const,
        ...EMPTY_TARGETS,
        error: 'The assigned client was not found.',
      };
    }

    let skillTargets = client.skillTargets || [];
    let behaviorTargets = client.behaviorTargets || [];
    let autoSynced = false;
    let skillsCreated = 0;
    let behaviorsCreated = 0;
    const hasTpGoals = treatmentPlanHasSyncableGoals(client.treatmentPlan);

    // Nice-to-have: auto-sync when TP has goals but Collect has zero skill targets
    if (autoSync && skillTargets.length === 0 && hasTpGoals) {
      const payloads = payloadsFromTreatmentPlan(client.treatmentPlan);
      const existingSkills = await prisma.skillTarget.findMany({
        where: { clientId: client.id },
        select: { id: true, title: true },
      });
      const existingBehaviors = await prisma.behaviorTarget.findMany({
        where: { clientId: client.id },
        select: { id: true, behaviorName: true },
      });
      const skillByTitle = new Map(
        existingSkills.map((t) => [t.title.trim().toLowerCase(), t.id])
      );
      const behaviorByName = new Map(
        existingBehaviors.map((b) => [b.behaviorName.trim().toLowerCase(), b.id])
      );

      for (const payload of payloads.skills) {
        const key = payload.title.toLowerCase();
        if (skillByTitle.has(key)) continue;
        const created = await prisma.skillTarget.create({
          data: {
            id: crypto.randomUUID(),
            clientId: client.id,
            domain: payload.domain,
            title: payload.title,
            description: payload.description,
            measurementType: payload.measurementType,
            targetStatus: payload.targetStatus,
            masteryCriteria: payload.masteryCriteria,
            baselineData: payload.baselineData,
          },
        });
        skillByTitle.set(key, created.id);
        skillsCreated += 1;
      }

      for (const payload of payloads.behaviors) {
        const key = payload.behaviorName.toLowerCase();
        if (behaviorByName.has(key)) continue;
        const created = await prisma.behaviorTarget.create({
          data: {
            id: crypto.randomUUID(),
            clientId: client.id,
            behaviorName: payload.behaviorName,
            definition: payload.definition,
            measurementType: payload.measurementType,
          },
        });
        behaviorByName.set(key, created.id);
        behaviorsCreated += 1;
      }

      if (skillsCreated > 0 || behaviorsCreated > 0) {
        autoSynced = true;
        skillTargets = await prisma.skillTarget.findMany({
          where: {
            clientId: client.id,
            targetStatus: { in: ['BASELINE', 'IN_PROGRESS'] },
          },
          orderBy: { createdAt: 'asc' },
          take: 40,
        });
        behaviorTargets = await prisma.behaviorTarget.findMany({
          where: { clientId: client.id },
          orderBy: { createdAt: 'asc' },
          take: 40,
        });
      }
    }

    const evvLogs = access.session.evvLogs || [];
    const canonicalEvv = evvLogs.length === 1 ? evvLogs[0] : null;
    const evvClockedOut = Boolean(
      canonicalEvv &&
        access.session.actualStart &&
        access.session.actualEnd &&
        canonicalEvv.staffId === access.session.rbtId &&
        canonicalEvv.clockInTimestamp.getTime() ===
          access.session.actualStart.getTime() &&
        canonicalEvv.clockOutTimestamp?.getTime() ===
          access.session.actualEnd.getTime()
    );

    return {
      success: true as const,
      clientId: client.id,
      expectedNoteUpdatedAt: access.session.note?.updatedAt.toISOString() ?? null,
      sessionStatus: access.session.status,
      actualStart: access.session.actualStart?.toISOString() ?? null,
      actualEnd: access.session.actualEnd?.toISOString() ?? null,
      evvClockedOut,
      cptCode: access.billingFacts.cptCode,
      placeOfService: access.billingFacts.placeOfService.display,
      targets: skillTargets.map((t) => ({
        id: t.id,
        label: t.title,
        domain: t.domain,
        measurementType: t.measurementType,
      })),
      behaviorTargets: behaviorTargets.map((b) => ({
        id: b.id,
        label: b.behaviorName,
        measurementType: b.measurementType,
      })),
      hasTreatmentPlanGoals: hasTpGoals,
      autoSynced,
      skillsCreated,
      behaviorsCreated,
      crmGoalsUrl: crmClinicalGoalsUrl(client.id),
    };
  } catch (error: unknown) {
    console.error(
      'getSessionStudioTargets',
      error instanceof Error ? error.message : 'Unknown'
    );
    return {
      success: false as const,
      ...EMPTY_TARGETS,
      error: error instanceof Error ? error.message : 'Failed to load targets',
    };
  }
}

function buildAuthoritativeSubmissionArtifacts(input: {
  data: SubmitHrmSessionNotePayload;
  interval: SuccessfulInterval;
  billingFacts: RbtStudioBillingFacts;
  abcEvents: ResolvedAbcObservation[];
  signedAt: Date;
  sessionId: string;
  rbtId: string;
  bcbaId: string;
  clientDisplayName: string;
  supervisingBcbaName: string;
  taskAnalyses: StudioTaskAnalysis[];
}) {
  const frequencies = input.data.frequencies || [];
  const durations = input.data.durations || [];
  const probes = input.data.probes || [];
  const abcEvents = input.abcEvents;
  const claimGate = assertClaimReadyForSubmit(
    claimReadyInputFromPayload({
      // Persisted Session/EVV interval overrides every browser time hint.
      sessionSeconds: input.interval.durationSeconds,
      cptCode: input.billingFacts.cptCode,
      locationCode: input.billingFacts.placeOfService.display,
      caregiverPresent: input.data.caregiverPresent,
      caregiverName: input.data.caregiverName,
      caregiverParticipation: input.data.caregiverParticipation,
      goalsAddressed: input.data.goalsAddressed,
      objectiveData: input.data.objectiveData,
      interventions: input.data.interventions,
      clientResponse: input.data.clientResponse || input.data.subjectiveNote,
      barriersSafety: input.data.barriersSafety,
      planNext: input.data.planNext || input.data.planNote,
      rbtSignature: input.data.rbtSignature,
      parentSignature: input.data.parentSignature,
      trials: input.data.trials,
      frequencies,
      durations,
      taskAnalyses: input.taskAnalyses,
      probes,
      startedAt: input.interval.startedAt,
      endedAt: input.interval.endedAt,
    })
  );
  if (!claimGate.ok) {
    return { ok: false as const, claimGate };
  }

  const sessionMinutes = Math.floor(input.interval.durationSeconds / 60);
  const billableUnits = input.interval.billableUnits;
  const cptCode = input.billingFacts.cptCode;
  const goalsAddressed =
    input.data.goalsAddressed ||
    input.data.trials.map((trial) => trial.targetGoal).join('; ');
  const objectiveData =
    (input.data.objectiveData || '').trim() ||
    `Logged ${input.data.trials.length} trials. Session ${sessionMinutes} min · ${billableUnits} unit(s).`;
  const interventions = input.data.interventions || [];
  const clientResponse = (
    input.data.clientResponse ||
    input.data.subjectiveNote ||
    ''
  ).trim();
  const barriersSafety = (input.data.barriersSafety || '').trim() || 'None noted';
  const caregiverParticipation = (
    input.data.caregiverParticipation || ''
  ).trim();
  const planNext = (input.data.planNext || input.data.planNote || '').trim();
  const caregiverPresent = input.data.caregiverPresent || '';
  const hasStructured =
    Boolean(clientResponse) ||
    Boolean(objectiveData.trim()) ||
    interventions.length > 0;

  const clinicalContent = hasStructured
    ? buildClinicalNoteDocument({
        clientName: input.clientDisplayName,
        bcba: input.supervisingBcbaName,
        cptCode,
        placeOfService: input.billingFacts.placeOfService.display,
        startedAt: input.interval.startedAt,
        endedAt: input.interval.endedAt,
        sessionSeconds: input.interval.durationSeconds,
        billableUnits,
        caregiverPresent,
        caregiverName: input.data.caregiverName || '',
        goalsAddressed,
        objectiveData,
        interventions,
        clientResponse,
        barriersSafety,
        caregiverParticipation,
        planNext,
        abcCount: abcEvents.length,
        rbtSignature: input.data.rbtSignature,
        caregiverSignature: input.data.parentSignature,
      })
    : [
        input.data.subjectiveNote || '',
        `Logged ${input.data.trials.length} DTT trials. ${abcEvents.length} ABC incidents. ${sessionMinutes} min · ${billableUnits} unit(s).`,
        input.data.assessmentNote || '',
        input.data.planNote || '',
      ]
        .filter(Boolean)
        .join('\n\n');

  const structuredBase = buildStructuredNoteContent({
    cptCode,
    placeOfServiceRaw: input.billingFacts.placeOfService.display,
    startedAt: input.interval.startedAt,
    endedAt: input.interval.endedAt,
    sessionSeconds: input.interval.durationSeconds,
    billableUnits,
    renderingProviderUserId: input.rbtId,
    supervisingBcbaUserId: input.bcbaId,
    supervisingBcbaName: input.supervisingBcbaName,
    caregiverPresent,
    caregiverName: input.data.caregiverName,
    goalsAddressed,
    objectiveData,
    interventions,
    clientResponse,
    barriersSafety,
    caregiverParticipation,
    planNext,
    trials: input.data.trials.map((trial) => ({
      targetId: trial.targetId,
      targetLabel: trial.targetGoal,
      response: trial.response,
      promptLevel: trial.promptLevel,
      at: trial.timestamp,
    })),
    frequencies,
    durations,
    taskAnalyses: input.taskAnalyses,
    probes,
    abcEvents: abcEvents.map((event) => ({
      antecedent: event.antecedent,
      behavior: event.behavior,
      consequence: event.consequence,
      durationSeconds: event.durationSeconds ?? 0,
      intensity: event.intensity,
      at: event.at,
      behaviorTargetId: event.behaviorTargetId,
      mappingStatus: event.mappingStatus,
      mappingSource: event.mappingSource,
    })),
  });
  const fingerprint = submissionFingerprint({
    data: input.data,
    sessionId: input.sessionId,
    rbtId: input.rbtId,
    bcbaId: input.bcbaId,
    interval: input.interval,
    billingFacts: input.billingFacts,
  });
  const structuredContent = {
    ...structuredBase,
    submissionFingerprint: fingerprint,
  };
  // Rebuild server-side from the authoritative interval. A browser-provided
  // checklist snapshot is only a display hint and is never persisted as truth.
  const checklistSnapshot = buildChecklistSnapshot(
    claimGate.evaluation.checklist,
    input.interval.endedAt
  );
  const noteData = {
    clinicalContent,
    structuredContent,
    checklistSnapshot,
    billableUnits,
    parentSigned: true,
    rbtSigned: true,
    bcbaSigned: false,
    isConverted: false,
    rbtSignedAt: input.signedAt,
    parentSignedAt: input.signedAt,
    rbtSignerName: input.data.rbtSignature.trim(),
    parentSignerName: input.data.parentSignature.trim(),
    bcbaSignedAt: null as Date | null,
    bcbaSignerName: null as string | null,
  };

  return {
    ok: true as const,
    claimGate,
    interval: input.interval,
    structuredContent,
    checklistSnapshot,
    noteData,
  };
}

async function reconcileCommittedSubmission(
  data: SubmitHrmSessionNotePayload,
  actingRbtId: string,
  billingFacts: RbtStudioBillingFacts
) {
  if (!isUuid(data.sessionId)) return null;
  const session = await prisma.session.findUnique({
    where: { id: data.sessionId },
    include: {
      client: { select: { rbtId: true } },
      note: {
        select: {
          id: true,
          rbtSigned: true,
          bcbaSigned: true,
          isConverted: true,
          structuredContent: true,
          billableUnits: true,
        },
      },
    },
  });
  if (
    !session ||
    session.status !== 'COMPLETED' ||
    session.rbtId !== actingRbtId ||
    session.client.rbtId !== actingRbtId ||
    !session.bcbaId ||
    !session.note?.rbtSigned ||
    session.note.bcbaSigned ||
    session.note.isConverted
  ) {
    return null;
  }

  const durable = await readDurableCompletedClockOut(session, actingRbtId);
  if (!durable.ok) return null;
  const expected = submissionFingerprint({
    data,
    sessionId: session.id,
    rbtId: actingRbtId,
    bcbaId: session.bcbaId,
    interval: durable.interval,
    billingFacts,
  });
  if (storedSubmissionFingerprint(session.note.structuredContent) !== expected) {
    return null;
  }

  return {
    success: true as const,
    reconciled: true as const,
    sessionId: session.id,
    soapNoteId: session.note.id,
    startedAt: durable.interval.startedAt,
    endedAt: durable.interval.endedAt,
    durationSeconds: durable.interval.durationSeconds,
    billableUnits: durable.interval.billableUnits,
    locationVerified: durable.locationVerified,
    trialsPersisted: undefined,
    behaviorLogsPersisted: undefined,
    ...storedObservationMappingSummary(session.note.structuredContent),
    syncStatus: 'DOCUMENTATION_SUBMITTED_AWAITING_BCBA_REVIEW' as const,
    message: 'Documentation submitted — awaiting BCBA review.',
    error: undefined,
  };
}

export async function submitHrmSessionEmrNote(data: SubmitHrmSessionNotePayload) {
  let actingRbtIdForReconcile: string | null = null;
  let billingFactsForReconcile: RbtStudioBillingFacts | null = null;
  try {
    const acting = await resolveActiveActingRbt();
    if (!acting.ok) {
      return { success: false as const, error: acting.error };
    }
    const { rbt: rbtUser } = acting;
    actingRbtIdForReconcile = rbtUser.id;

    // Caller-supplied staff/client identifiers are hints only. The authenticated
    // actor and the persisted scheduled Session establish identity and scope.
    if (
      data.rbtUserId &&
      (!isUuid(data.rbtUserId) || data.rbtUserId !== rbtUser.id)
    ) {
      return {
        success: false as const,
        error: 'RBT identity mismatch — you can only submit notes for your own sessions.',
      };
    }
    if (!isUuid(data.sessionId)) {
      return {
        success: false as const,
        error: 'An assigned scheduled session is required for note submission.',
      };
    }

    const access = await loadAuthorizedRbtSession(data.sessionId!, rbtUser.id, 'SUBMIT');
    if (!access.ok) {
      return {
        success: false as const,
        code: 'code' in access ? access.code : undefined,
        error: access.error,
      };
    }
    const scheduledSession = access.session;
    const client = scheduledSession.client;
    const persistedNote = scheduledSession.note;
    const billingFacts = resolveRbtStudioBillingFacts({
      persistedCptCode: scheduledSession.cptCode,
      persistedPlaceOfServiceCode: scheduledSession.placeOfServiceCode,
      persistedLocation: scheduledSession.location,
      proposedCptCode: data.cptCode,
      proposedPlaceOfService: data.locationCode,
    });
    if (!billingFacts.ok) return billingFactsFailureResult(billingFacts);
    billingFactsForReconcile = billingFacts;

    // Fail closed before claim processing or any mutation. Ordinary Studio
    // submit can create the first note; a completed note may only be replaced
    // after the explicit deficiency workflow has stripped its signatures.
    if (persistedNote?.isConverted || persistedNote?.bcbaSigned) {
      return {
        success: false as const,
        code: 'SESSION_NOTE_LOCKED' as const,
        conflict: true as const,
        error: persistedNote.isConverted
          ? 'This session note has durable downstream conversion evidence. Studio cannot replace converted documentation.'
          : 'This session note is BCBA-signed. Studio cannot replace signed clinical content.',
      };
    }
    if (
      persistedNote &&
      (persistedNote.rbtSigned || persistedNote.deficiencies.length === 0)
    ) {
      if (persistedNote.rbtSigned) {
        const reconciled = await reconcileCommittedSubmission(
          data,
          rbtUser.id,
          billingFacts
        );
        if (reconciled) return reconciled;
      }
      return {
        success: false as const,
        code: 'SESSION_NOTE_CORRECTION_REQUIRED' as const,
        conflict: true as const,
        error:
          'This completed note cannot be resubmitted through ordinary Studio submit. A reviewer must open a deficiency before correction.',
      };
    }

    const expectedNoteUpdatedAt = data.expectedNoteUpdatedAt ?? null;
    const persistedNoteUpdatedAt = persistedNote?.updatedAt.toISOString() ?? null;
    if (expectedNoteUpdatedAt !== persistedNoteUpdatedAt) {
      return {
        success: false as const,
        code: 'SESSION_NOTE_CONFLICT' as const,
        conflict: true as const,
        error:
          'This session note changed after the Studio draft was loaded. Keep this draft open and reload the session state before retrying.',
      };
    }

    const clientDisplayName = `${client.firstName} ${client.lastName}`.trim();
    const supervisingBcbaName =
      `${scheduledSession.bcba!.firstName} ${scheduledSession.bcba!.lastName}`.trim();

    if (!data.rbtSignature || !data.parentSignature) {
      return { success: false as const, error: 'Missing mandatory e-signatures.' };
    }

    if (scheduledSession.status === 'COMPLETED') {
      const durable = await readDurableCompletedClockOut(
        scheduledSession,
        rbtUser.id
      );
      if (!durable.ok) {
        return {
          success: false as const,
          code: durable.code,
          conflict: true as const,
          recoverable: true as const,
          error: durable.error,
        };
      }
    }

    const eventFallbackTime = scheduledSession.actualStart!;

    const sessionId = scheduledSession.id;
    const sessionRbtId = scheduledSession.rbtId!;
    const sessionBcbaId = scheduledSession.bcbaId!;

    const legacyTa: StudioTaskAnalysis[] =
      !data.taskAnalyses?.length && data.taSteps?.length
        ? [
            {
              id: `ta-legacy-${sessionId}`,
              targetLabel: 'Task analysis',
              chainType: 'TOTAL_TASK',
              steps: data.taSteps.map((s, i) => ({
                order: i + 1,
                instruction: s.instruction,
                status: s.status,
              })),
              at: eventFallbackTime.toISOString(),
            },
          ]
        : [];

    const frequencies = data.frequencies || [];
    const durations = data.durations || [];
    const taskAnalyses = data.taskAnalyses?.length ? data.taskAnalyses : legacyTa;
    const probes = data.probes || [];
    const abcEvents = data.abcEvents || [];

    // --- Slice 2: SessionTrialData rows (DTT + probe) when SkillTarget UUID ---
    // Built before the transaction; only writes happen inside it.
    const realTrials = data.trials.filter((t) => isUuid(t.targetId));
    const realProbes = probes.filter((p) => isUuid(p.targetId));
    const skillIds = [
      ...realTrials.map((t) => t.targetId!),
      ...realProbes.map((p) => p.targetId!),
    ].filter(Boolean);

    let trialRowsToInsert: Array<{
      id: string;
      sessionId: string;
      targetId: string;
      score: string;
      promptLevel?: string;
      trialIndex: number;
      timestamp: Date;
    }> = [];
    if (skillIds.length > 0) {
      const existingTargets = await prisma.skillTarget.findMany({
        where: {
          id: { in: [...new Set(skillIds)] },
          clientId: client.id,
        },
        select: { id: true },
      });
      const allowed = new Set(existingTargets.map((t) => t.id));
      const trialIndexByTarget = new Map<string, number>();

      const trialRows = realTrials
        .filter((t) => t.targetId && allowed.has(t.targetId))
        .map((t) => {
          const idx = (trialIndexByTarget.get(t.targetId!) || 0) + 1;
          trialIndexByTarget.set(t.targetId!, idx);
          return {
            id: crypto.randomUUID(),
            sessionId,
            targetId: t.targetId!,
            score: scoreFromResponse(t.response),
            promptLevel:
              t.promptLevel ||
              (t.response === 'CORRECT'
                ? 'Independent'
                : t.response === 'PROMPTED'
                  ? 'Verbal'
                  : undefined),
            trialIndex: idx,
            timestamp: t.timestamp ? new Date(t.timestamp) : eventFallbackTime,
          };
        });

      const probeRows = realProbes
        .filter((p) => p.targetId && allowed.has(p.targetId))
        .map((p) => {
          const idx = (trialIndexByTarget.get(p.targetId!) || 0) + 1;
          trialIndexByTarget.set(p.targetId!, idx);
          return {
            id: crypto.randomUUID(),
            sessionId,
            targetId: p.targetId!,
            score: scoreFromProbe(p.result),
            promptLevel: p.promptLevel || 'Independent',
            trialIndex: idx,
            timestamp: p.at ? new Date(p.at) : eventFallbackTime,
          };
        });

      trialRowsToInsert = [...trialRows, ...probeRows];
    }

    // --- Slice 2: BehaviorLog rows for ABC + frequency/duration ---
    // Only existing client targets can receive normalized logs. Unmatched ABC
    // observations remain in structuredContent for later BCBA mapping.
    const resolveBehaviorTarget =
      await makeExistingBehaviorTargetResolver(client.id);
    const resolvedAbcEvents: ResolvedAbcObservation[] = abcEvents.map(
      (event) => ({
        ...event,
        ...resolveBehaviorTarget({
          behaviorTargetId: event.behaviorTargetId,
          behaviorName: event.behavior,
        }),
      })
    );
    const observationSummary = observationMappingSummary(resolvedAbcEvents);
    const behaviorLogRows: Array<{
      id: string;
      sessionId: string;
      behaviorId: string;
      frequencyCount: number;
      durationSeconds: number;
      intensity: string;
      abcNotes: string;
      timestamp: Date;
    }> = [];

    for (const e of resolvedAbcEvents) {
      if (!e.antecedent?.trim() || !e.behavior?.trim() || !e.consequence?.trim()) continue;
      if (!e.behaviorTargetId) continue;
      behaviorLogRows.push({
        id: crypto.randomUUID(),
        sessionId,
        behaviorId: e.behaviorTargetId,
        frequencyCount: 1,
        durationSeconds: e.durationSeconds ?? 0,
        intensity: e.intensity || 'MODERATE',
        abcNotes: `A: ${e.antecedent.trim()} | B: ${e.behavior.trim()} | C: ${e.consequence.trim()}`,
        timestamp: e.at ? new Date(e.at) : eventFallbackTime,
      });
    }

    for (const f of frequencies) {
      if (f.count <= 0) continue;
      // Durable BehaviorLog only when BehaviorTarget UUID is real (demo ids stay JSON-only)
      if (!isUuid(f.behaviorTargetId)) continue;
      const resolved = resolveBehaviorTarget({
        behaviorTargetId: f.behaviorTargetId,
        behaviorName: f.behaviorName,
      });
      if (!resolved.behaviorTargetId) continue;
      behaviorLogRows.push({
        id: crypto.randomUUID(),
        sessionId,
        behaviorId: resolved.behaviorTargetId,
        frequencyCount: f.count,
        durationSeconds: 0,
        intensity: 'MODERATE',
        abcNotes: `FREQUENCY count=${f.count}${
          f.observationMinutes ? ` over ${f.observationMinutes} min` : ''
        }`,
        timestamp: f.at ? new Date(f.at) : eventFallbackTime,
      });
    }

    for (const d of durations) {
      if (d.seconds <= 0) continue;
      if (!isUuid(d.behaviorTargetId)) continue;
      const resolved = resolveBehaviorTarget({
        behaviorTargetId: d.behaviorTargetId,
        behaviorName: d.behaviorName,
      });
      if (!resolved.behaviorTargetId) continue;
      behaviorLogRows.push({
        id: crypto.randomUUID(),
        sessionId,
        behaviorId: resolved.behaviorTargetId,
        frequencyCount: 1,
        durationSeconds: d.seconds,
        intensity: d.intensity || 'MODERATE',
        abcNotes: `DURATION episode ${d.seconds}s`,
        timestamp: d.at ? new Date(d.at) : eventFallbackTime,
      });
    }

    // Session/EVV close + note + data rows commit as one unit. Browser clocks
    // are not consulted anywhere inside this transaction.
    const correlationId = crypto.randomUUID();
    const { session, soapNote, artifacts, locationVerified } = await prisma.$transaction(
      async (tx) => {
        let sessionRow;
        let interval: SuccessfulInterval;
        let durableLocationVerified = false;

        if (scheduledSession.status === 'IN_PROGRESS') {
          const closed = await closeSessionInsideTransaction({
            tx,
            session: scheduledSession,
            actingRbtId: rbtUser.id,
            coordinates: data.clockOutCoordinates,
            source: 'HRM_SESSION_STUDIO_SUBMIT',
            reason: 'RBT documentation submit',
            correlationId,
          });
          sessionRow = closed.session;
          interval = closed.interval;
          durableLocationVerified = closed.locationVerified;
        } else {
          // Later documentation/correction uses the previously frozen service
          // interval and cannot extend actualEnd.
          sessionRow = await tx.session.findFirst({
            where: {
              id: sessionId,
              clientId: client.id,
              rbtId: sessionRbtId,
              bcbaId: sessionBcbaId,
              status: 'COMPLETED',
              actualStart: scheduledSession.actualStart,
              actualEnd: scheduledSession.actualEnd,
              cptCode: scheduledSession.cptCode,
              location: scheduledSession.location,
              placeOfServiceCode: scheduledSession.placeOfServiceCode,
              rbt: {
                is: {
                  id: rbtUser.id,
                  role: 'RBT',
                  isActive: true,
                },
              },
              bcba: {
                is: {
                  id: sessionBcbaId,
                  role: 'BCBA',
                  isActive: true,
                },
              },
              client: {
                is: {
                  rbtId: sessionRbtId,
                  bcbaId: sessionBcbaId,
                },
              },
            },
          });
          if (!sessionRow) throw new Error(SESSION_STALE_CONFLICT);

          const resolved = resolveAuthoritativeSessionInterval({
            actualStart: sessionRow.actualStart,
            actualEnd: sessionRow.actualEnd,
          });
          if (!resolved.ok) throw new Error(resolved.code);
          interval = resolved;

          const evvLogs = await tx.eVVLog.findMany({
            where: { sessionId },
            select: {
              id: true,
              staffId: true,
              clockInTimestamp: true,
              clockOutTimestamp: true,
              clockInLat: true,
              clockInLng: true,
              clockOutLat: true,
              clockOutLng: true,
              isLocationVerified: true,
            },
            orderBy: [{ clockInTimestamp: 'asc' }, { id: 'asc' }],
          });
          if (evvLogs.some((log) => log.clockOutTimestamp === null)) {
            throw new Error(EVV_CLOCK_OUT_CONFLICT);
          }
          if (evvLogs.length !== 1) {
            throw new Error(EVV_CLOCK_OUT_CONFLICT);
          }
          const matching = evvLogs.filter(
            (log) =>
              log.staffId === rbtUser.id &&
              log.clockInTimestamp.getTime() ===
                new Date(interval.startedAt).getTime() &&
              log.clockOutTimestamp?.getTime() ===
                new Date(interval.endedAt).getTime()
          );
          if (matching.length !== 1) {
            throw new Error(
              matching.length === 0 ? EVV_TIME_CONFLICT : EVV_CLOCK_OUT_CONFLICT
            );
          }
          durableLocationVerified =
            matching[0].isLocationVerified &&
            hasCoordinatePair(matching[0].clockInLat, matching[0].clockInLng) &&
            hasCoordinatePair(matching[0].clockOutLat, matching[0].clockOutLng);
        }

        const built = buildAuthoritativeSubmissionArtifacts({
          data,
          interval,
          billingFacts,
          abcEvents: resolvedAbcEvents,
          signedAt: new Date(),
          sessionId,
          rbtId: sessionRbtId,
          bcbaId: sessionBcbaId,
          clientDisplayName,
          supervisingBcbaName,
          taskAnalyses,
        });
        if (!built.ok) throw new ClaimReadySubmitError(built.claimGate);

        // PostgreSQL re-checks this conditional UPDATE after row-lock waits.
        // A lost correction CAS rolls back the service close and all data.
        const note = persistedNote
          ? await (async () => {
              const corrected = await tx.sessionNote.updateMany({
                where: {
                  id: persistedNote.id,
                  sessionId,
                  updatedAt: persistedNote.updatedAt,
                  rbtSigned: false,
                  parentSigned: false,
                  bcbaSigned: false,
                  isConverted: false,
                  deficiencies: {
                    some: { status: 'OPEN' },
                  },
                },
                data: built.noteData,
              });
              if (corrected.count !== 1) {
                throw new Error(SESSION_NOTE_REVISION_CONFLICT);
              }

              const updated = await tx.sessionNote.findUnique({
                where: { id: persistedNote.id },
              });
              if (!updated) {
                throw new Error(SESSION_NOTE_REVISION_CONFLICT);
              }
              return updated;
            })()
          : await (async () => {
              try {
                return await tx.sessionNote.create({
                  data: {
                    id: crypto.randomUUID(),
                    sessionId,
                    ...built.noteData,
                  },
                });
              } catch (error) {
                if (isPrismaUniqueConstraintError(error)) {
                  throw new Error(SESSION_NOTE_REVISION_CONFLICT);
                }
                throw error;
              }
            })();

        // Idempotent resubmit (audit H3): replace prior rows for this session
        await tx.sessionTrialData.deleteMany({ where: { sessionId } });
        if (trialRowsToInsert.length > 0) {
          await tx.sessionTrialData.createMany({ data: trialRowsToInsert });
        }
        await tx.behaviorLog.deleteMany({ where: { sessionId } });
        if (behaviorLogRows.length > 0) {
          await tx.behaviorLog.createMany({ data: behaviorLogRows });
        }

        return {
          session: sessionRow,
          soapNote: note,
          artifacts: built,
          locationVerified: durableLocationVerified,
        };
      },
      { maxWait: 10_000, timeout: 20_000 }
    );

    const trialsPersisted = trialRowsToInsert.length;
    const behaviorLogsPersisted = behaviorLogRows.length;

    // PHI audit (gap 12): RBT sign-on-submit — ids only, never blocks the write
    await writeAuditLog({
      actorUserId: rbtUser.id,
      action: 'SIGN',
      entityType: 'SESSION_NOTE',
      entityId: soapNote.id,
      meta: {
        event: 'RBT_SUBMIT_SIGN',
        sessionId: session.id,
        clientId: client.id,
        billableUnits: artifacts.interval.billableUnits,
        checklistPassed: artifacts.checklistSnapshot.passed,
      },
    });

    // NOTE_AWAITING_BCBA_SIGN → supervising BCBA (best-effort, deduped)
    try {
      const { createNotification } = await import('@/app/actions/notifications');
      const bcbaId = session.bcbaId || client.bcbaId;
      if (bcbaId) {
        await createNotification({
          userId: bcbaId,
          title: `Note awaiting BCBA sign · ${clientDisplayName}`,
          message: `${clientDisplayName}: RBT session note ready for supervisory e-sign.`,
          type: 'NOTE_AWAITING_BCBA_SIGN',
          linkUrl: '/portal-clinical/notes',
          dedupeHours: 6,
        });
      }
    } catch (notifyErr) {
      console.error(
        'submitHrmSessionEmrNote notify failed:',
        notifyErr instanceof Error ? notifyErr.message : 'Unknown'
      );
    }

    // HRM-local paths only. (/portal-hr, /portal-billing, /portal-clinical and
    // /notes are CRM routes — revalidating them from HRM is a cross-app no-op.)
    revalidatePath('/session-emr');
    revalidatePath('/rbt/schedule');
    revalidatePath('/rbt/payroll');

    return {
      success: true as const,
      sessionId: session.id,
      soapNoteId: soapNote.id,
      trialsPersisted,
      behaviorLogsPersisted,
      modalitiesEmbedded: {
        trialBlocks: artifacts.structuredContent.modalities.trials.length,
        frequency: artifacts.structuredContent.modalities.frequency.length,
        duration: artifacts.structuredContent.modalities.duration.length,
        taskAnalysis: artifacts.structuredContent.modalities.taskAnalysis.length,
        probes: artifacts.structuredContent.modalities.probes.length,
        abc: artifacts.structuredContent.modalities.abcEvents.length,
      },
      billableUnits: artifacts.interval.billableUnits,
      startedAt: artifacts.interval.startedAt,
      endedAt: artifacts.interval.endedAt,
      durationSeconds: artifacts.interval.durationSeconds,
      locationVerified,
      structuredSchemaVersion: artifacts.structuredContent.schemaVersion,
      ...observationSummary,
      syncStatus: 'DOCUMENTATION_SUBMITTED_AWAITING_BCBA_REVIEW',
      message: 'Documentation submitted — awaiting BCBA review.',
      error: undefined,
    };
  } catch (error: unknown) {
    if (error instanceof ClaimReadySubmitError) {
      return claimGateFailureResult(error.gate);
    }
    if (
      error instanceof Error &&
      actingRbtIdForReconcile &&
      billingFactsForReconcile &&
      [
        SESSION_NOTE_REVISION_CONFLICT,
        SESSION_STALE_CONFLICT,
        EVV_CLOCK_OUT_CONFLICT,
        EVV_TIME_CONFLICT,
      ].includes(error.message)
    ) {
      try {
        const reconciled = await reconcileCommittedSubmission(
          data,
          actingRbtIdForReconcile,
          billingFactsForReconcile
        );
        if (reconciled) return reconciled;
      } catch {
        // Fall through to the typed conflict response.
      }
    }
    if (error instanceof Error) {
      const clockConflict = clockConflictResult(error);
      if (clockConflict) return clockConflict;
    }
    if (error instanceof Error && error.message === SESSION_NOTE_REVISION_CONFLICT) {
      return {
        success: false as const,
        code: 'SESSION_NOTE_CONFLICT' as const,
        conflict: true as const,
        error:
          'This session note changed in another request. Your draft was not applied; reload the session state before retrying.',
      };
    }
    if (error instanceof Error && error.message === SESSION_STALE_CONFLICT) {
      return {
        success: false as const,
        code: 'SESSION_STALE_CONFLICT' as const,
        conflict: true as const,
        error:
          'This session assignment or status changed in another request. Reload the schedule before retrying.',
      };
    }
    console.error(
      'Error submitting HRM session EMR note:',
      error instanceof Error ? error.message : 'Unknown'
    );
    return {
      success: false as const,
      error: 'Failed to submit session note. Please try again.',
    };
  }
}

/**
 * Slice 4 — EVV clock-in: SCHEDULED → IN_PROGRESS + actualStart.
 * Production requires a persisted assigned UUID; local demo IDs are skipped
 * only behind the explicit DevTools fence.
 */
export async function clockInHrmSession(input: {
  sessionId: string;
  placeOfService?: string;
  cptCode?: string;
  /** Compatibility hint only; persisted actualStart is server-authored. */
  startedAt?: string;
  coordinates?: EvvCoordinates;
}) {
  try {
    const acting = await resolveActiveActingRbt();
    if (!acting.ok) {
      return { success: false as const, error: acting.error };
    }
    const actingRbtId = acting.rbt.id;

    if (!isUuid(input.sessionId)) {
      if (isDevToolsEnabled()) {
        return {
          success: true as const,
          skipped: true as const,
          reason: 'LOCAL_SESSION_ID',
          error: undefined,
        };
      }
      return {
        success: false as const,
        error: 'An assigned scheduled session is required for clock-in.',
      };
    }

    const access = await loadAuthorizedRbtSession(
      input.sessionId,
      actingRbtId,
      'CLOCK_IN'
    );
    if (!access.ok) {
      return {
        success: false as const,
        code: 'code' in access ? access.code : undefined,
        error: access.error,
      };
    }
    const existing = access.session;
    const billingFacts = resolveRbtStudioBillingFacts({
      persistedCptCode: existing.cptCode,
      persistedPlaceOfServiceCode: existing.placeOfServiceCode,
      persistedLocation: existing.location,
      proposedCptCode: input.cptCode,
      proposedPlaceOfService: input.placeOfService,
    });
    if (!billingFacts.ok) return billingFactsFailureResult(billingFacts);

    // Idempotent retry returns only a Session start backed by exactly one open
    // EVV row. The browser hint is never a fallback.
    if (existing.status === 'IN_PROGRESS') {
      if (!existing.actualStart) {
        return {
          success: false as const,
          code: 'CLOCK_IN_STATE_INVALID' as const,
          error:
            'This in-progress session has no persisted start time. Collection remains locked; contact Operations.',
        };
      }
      const reconciled = await reconcileDurableClockIn(existing.id, actingRbtId);
      if (reconciled) return reconciled;
      return {
        success: false as const,
        code: 'CLOCK_IN_STATE_INVALID' as const,
        conflict: true as const,
        error:
          'The persisted Session start does not match one durable open EVV visit. Collection remains locked; contact Operations.',
      };
    }

    const correlationId = crypto.randomUUID();
    const session = await prisma.$transaction(async (tx) => {
      // Capture once, inside the guarded transaction, for both Session + EVV.
      const start = new Date();
      const transitioned = await tx.session.updateMany({
        where: {
          id: existing.id,
          clientId: existing.clientId,
          rbtId: actingRbtId,
          status: 'SCHEDULED',
          cptCode: existing.cptCode,
          location: existing.location,
          placeOfServiceCode: existing.placeOfServiceCode,
          rbt: {
            is: {
              id: actingRbtId,
              role: 'RBT',
              isActive: true,
            },
          },
          client: {
            is: {
              rbtId: actingRbtId,
            },
          },
        },
        data: {
          status: 'IN_PROGRESS',
          actualStart: start,
          actualEnd: null,
        },
      });
      if (transitioned.count !== 1) {
        throw new Error(SESSION_STALE_CONFLICT);
      }

      const sessionRow = await tx.session.findUnique({ where: { id: existing.id } });
      if (!sessionRow || !sessionRow.actualStart) {
        throw new Error(SESSION_STALE_CONFLICT);
      }

      // A stale/orphan open row on a still-SCHEDULED Session is not time
      // authority. Normalize it away before creating the single durable visit.
      const existingEvvLogs = await tx.eVVLog.findMany({
        where: { sessionId: sessionRow.id },
        select: { clockOutTimestamp: true },
      });
      if (existingEvvLogs.some((log) => log.clockOutTimestamp !== null)) {
        throw new Error(EVV_TIME_CONFLICT);
      }
      const orphanOpenLogs = existingEvvLogs.filter(
        (log) => log.clockOutTimestamp === null
      );
      if (orphanOpenLogs.length > 0) {
        await tx.eVVLog.deleteMany({
          where: {
            sessionId: sessionRow.id,
            clockOutTimestamp: null,
          },
        });
      }
      const coordinates = validCoordinates(input.coordinates);
      await tx.eVVLog.create({
        data: {
          id: crypto.randomUUID(),
          sessionId: sessionRow.id,
          staffId: actingRbtId,
          clockInTimestamp: start,
          clockInLat: coordinates?.latitude ?? null,
          clockInLng: coordinates?.longitude ?? null,
          isLocationVerified: false,
        },
      });

      await tx.auditLogVault.create({
        data: {
          userId: actingRbtId,
          action: 'EDIT',
          resourceType: 'SESSION',
          resourceId: sessionRow.id,
          metadata: {
            event: 'SESSION_STATUS_TRANSITION',
            source: 'HRM_SESSION_STUDIO_CLOCK_IN',
            reason: 'RBT EVV clock-in',
            correlationId,
            previousStatus: 'SCHEDULED',
            nextStatus: 'IN_PROGRESS',
            previousRbtId: actingRbtId,
            nextRbtId: actingRbtId,
            actualStart: start.toISOString(),
            locationVerified: false,
          },
        },
      });

      return sessionRow;
    });

    // Status notification is post-commit and best-effort. The recipient comes
    // from the persisted client team, never from request input.
    const supervisingBcbaId = existing.client.bcbaId;
    if (supervisingBcbaId) {
      try {
        const { createNotification } = await import('@/app/actions/notifications');
        await createNotification({
          userId: supervisingBcbaId,
          title: `Session started · ${session.id.slice(0, 8)}`,
          message: 'An assigned RBT session is now in progress.',
          type: 'SESSION_STARTED',
          linkUrl: '/portal-clinical/notes',
          dedupeHours: 24,
        });
      } catch (notifyError) {
        console.error(
          'clockInHrmSession notify failed:',
          notifyError instanceof Error ? notifyError.message : 'Unknown'
        );
      }
    }

    revalidatePath('/rbt/schedule');
    revalidatePath(`/rbt/session/${session.id}`);

    return {
      success: true as const,
      sessionId: session.id,
      status: session.status,
      startedAt: session.actualStart!.toISOString(),
      locationVerified: false as const,
      cptCode: billingFacts.cptCode,
      placeOfService: billingFacts.placeOfService.display,
      error: undefined,
    };
  } catch (error) {
    if (error instanceof Error && error.message === SESSION_STALE_CONFLICT) {
      const acting = await resolveActiveActingRbt();
      if (acting.ok && isUuid(input.sessionId)) {
        const reconciled = await reconcileDurableClockIn(input.sessionId, acting.rbt.id);
        if (reconciled) return reconciled;
      }
      return {
        success: false as const,
        code: 'SESSION_STALE_CONFLICT' as const,
        conflict: true as const,
        error:
          'This session assignment or status changed in another request. Reload the schedule before retrying.',
      };
    }
    if (error instanceof Error) {
      const typed = clockConflictResult(error);
      if (typed) return typed;
    }
    console.error(
      'clockInHrmSession failed:',
      error instanceof Error ? error.message : 'Unknown'
    );
    return {
      success: false as const,
      error: 'Clock-in failed. Collection remains locked; retry from the Clock in screen.',
    };
  }
}

/**
 * Durable documentation-pending close. Session.actualEnd and the canonical
 * EVV clock-out commit together; no note/signature state is invented.
 */
export async function clockOutHrmSession(input: {
  sessionId: string;
  closeReason?: 'INCOMPLETE' | 'DOCUMENTATION_READY' | 'CLAIM_READY';
  coordinates?: EvvCoordinates;
}) {
  try {
    const acting = await resolveActiveActingRbt();
    if (!acting.ok) return { success: false as const, error: acting.error };
    const actingRbtId = acting.rbt.id;

    if (!isUuid(input.sessionId)) {
      return {
        success: false as const,
        code: 'SESSION_ID_REQUIRED' as const,
        error: 'An assigned scheduled session is required for durable clock-out.',
      };
    }

    const access = await loadAuthorizedRbtSession(
      input.sessionId,
      actingRbtId,
      'CLOCK_OUT'
    );
    if (!access.ok) {
      return {
        success: false as const,
        code: 'code' in access ? access.code : undefined,
        error: access.error,
      };
    }
    const existing = access.session;
    if (!existing.actualStart) {
      return timeConflictResult(
        resolveAuthoritativeSessionInterval({
          actualStart: null,
          actualEnd: existing.actualEnd,
        }) as Exclude<AuthoritativeSessionInterval, { ok: true }>
      );
    }

    if (existing.status === 'COMPLETED') {
      const durable = await readDurableCompletedClockOut(existing, actingRbtId);
      if (!durable.ok) {
        return {
          success: false as const,
          code: durable.code,
          conflict: true as const,
          recoverable: true as const,
          error: durable.error,
        };
      }
      return {
        success: true as const,
        sessionId: existing.id,
        status: 'COMPLETED' as const,
        startedAt: durable.interval.startedAt,
        endedAt: durable.interval.endedAt,
        durationSeconds: durable.interval.durationSeconds,
        billableUnits: durable.interval.billableUnits,
        evvLogId: durable.evvLogId,
        locationVerified: durable.locationVerified,
        cptCode: access.billingFacts.cptCode,
        placeOfService: access.billingFacts.placeOfService.display,
        reconciled: true as const,
      };
    }

    const closed = await prisma.$transaction(
      (tx) =>
        closeSessionInsideTransaction({
          tx,
          session: existing,
          actingRbtId,
          coordinates: input.coordinates,
          source: 'HRM_SESSION_STUDIO_CLOCK_OUT',
          reason:
            input.closeReason === 'DOCUMENTATION_READY' ||
            input.closeReason === 'CLAIM_READY'
              ? 'RBT durable service close'
              : 'RBT closed service with documentation pending',
          correlationId: crypto.randomUUID(),
        }),
      { maxWait: 10_000, timeout: 20_000 }
    );

    revalidatePath('/rbt/schedule');
    revalidatePath(`/rbt/session/${existing.id}`);
    revalidatePath('/rbt/payroll');

    return {
      success: true as const,
      sessionId: existing.id,
      status: 'COMPLETED' as const,
      startedAt: closed.interval.startedAt,
      endedAt: closed.interval.endedAt,
      durationSeconds: closed.interval.durationSeconds,
      billableUnits: closed.interval.billableUnits,
      evvLogId: closed.evvLogId,
      locationVerified: closed.locationVerified,
      cptCode: access.billingFacts.cptCode,
      placeOfService: access.billingFacts.placeOfService.display,
      documentationStatus: 'PENDING' as const,
    };
  } catch (error) {
    if (error instanceof Error) {
      if (
        [
          SESSION_STALE_CONFLICT,
          EVV_CLOCK_OUT_CONFLICT,
          EVV_TIME_CONFLICT,
        ].includes(error.message) &&
        isUuid(input.sessionId)
      ) {
        const acting = await resolveActiveActingRbt();
        if (acting.ok) {
          const session = await prisma.session.findUnique({
            where: { id: input.sessionId },
            include: { client: { select: { rbtId: true } } },
          });
          if (
            session?.status === 'COMPLETED' &&
            session.rbtId === acting.rbt.id &&
            session.client.rbtId === acting.rbt.id
          ) {
            const billingFacts = resolveRbtStudioBillingFacts({
              persistedCptCode: session.cptCode,
              persistedPlaceOfServiceCode: session.placeOfServiceCode,
              persistedLocation: session.location,
            });
            if (!billingFacts.ok) return billingFactsFailureResult(billingFacts);
            const durable = await readDurableCompletedClockOut(session, acting.rbt.id);
            if (durable.ok) {
              return {
                success: true as const,
                sessionId: session.id,
                status: 'COMPLETED' as const,
                startedAt: durable.interval.startedAt,
                endedAt: durable.interval.endedAt,
                durationSeconds: durable.interval.durationSeconds,
                billableUnits: durable.interval.billableUnits,
                evvLogId: durable.evvLogId,
                locationVerified: durable.locationVerified,
                cptCode: billingFacts.cptCode,
                placeOfService: billingFacts.placeOfService.display,
                reconciled: true as const,
              };
            }
          }
        }
      }

      const typed = clockConflictResult(error);
      if (typed) return typed;
    }

    console.error(
      'clockOutHrmSession failed:',
      error instanceof Error ? error.message : 'Unknown'
    );
    return {
      success: false as const,
      code: 'EVV_CLOCK_OUT_FAILED' as const,
      error:
        'Clock-out could not be confirmed. Service remains open; keep this draft and retry.',
    };
  }
}
