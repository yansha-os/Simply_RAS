'use server';

import { createHash } from 'node:crypto';

import { Prisma } from '@prisma/client';
import type { Role } from '@repo/db';
import {
  evaluateAttestationState,
  extractSubmissionFingerprint,
  isSubmissionFingerprint,
  normalizePlutusReference,
  sanitizeStructuredContentForDeficiency,
} from '@repo/db/session-note-attestation';
import { evaluateActiveClientDemoHygiene } from '@repo/db/pilot-cohort-hygiene';
import { revalidatePath } from 'next/cache';

import { createNotification } from '@/app/actions/notifications';
import {
  evaluateAuthUnitHardStop,
  type AuthUnitHardStop,
} from '@/lib/billing/authUnits';
import {
  SESSION_NOTES_CONVERSION_ROLES,
  SESSION_NOTES_ROLES,
  requireClientAccess,
  requireStaff,
} from '@/lib/auth-guard';
import { prisma } from '@/lib/prisma';
import {
  assertNoteCredentialHardStop,
  collectNoteCredentialWarnings,
  getCredentialStatus,
  getStaffNpi,
} from '@/lib/staffCredentials.server';
import { evaluateCredentialHardStop } from '@/lib/staffCredentials';
import {
  buildPlutusExportCsv,
  buildPlutusExportRows,
} from '@/lib/billing/plutusExportPacket';
import { scrubNoteForConvert } from '@/lib/billing/noteClaimScrub';
import {
  hasBlockingScrubDefects,
  blockingScrubDefectLabels,
  type ClaimScrubResult,
} from '@/lib/claimScrubberEngine';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFICIENCY_ROLES = [
  'BILLING',
  'FINANCE',
  'SESSION_NOTES_COORDINATOR',
  'BCBA',
  'CLINICAL_DIRECTOR',
  'CEO',
  'OPS_DIRECTOR',
] satisfies Role[];
const AUTH_UNIT_OVERRIDE_ROLES = new Set<Role>(['BILLING', 'FINANCE', 'CEO']);
const SERIALIZABLE_OPTIONS = {
  isolationLevel: 'Serializable' as const,
  maxWait: 10_000,
  timeout: 20_000,
};

type ConvertOptions = {
  expectedNoteUpdatedAt: string;
  expectedSubmissionFingerprint: string;
  plutusClaimRef: string;
  overrideAuthUnits?: boolean;
  overrideReason?: string;
};

type ConversionFailure = {
  success: false;
  error: string;
  gateCode: string;
  conflict?: true;
  manualReviewRequired?: boolean;
  authUnitReview?: Record<string, unknown>;
  authUnitStop?: {
    remainingUnits: number;
    requestedUnits: number;
    cptCode: string;
    authNumber: string | null;
    canOverride: boolean;
  };
};

type ConversionSuccess = {
  success: true;
  alreadyConverted?: true;
  convertedAt?: string | null;
  plutusClaimRef?: string | null;
  credentialWarnings?: string[];
  authUnitOverridden?: true;
};

type FlagDeficiencyState = {
  success?: boolean;
  error?: string;
  code?: string;
  conflict?: true;
};

function failure(
  gateCode: string,
  error: string,
  extra: Omit<ConversionFailure, 'success' | 'error' | 'gateCode'> = {},
): ConversionFailure {
  return { success: false, gateCode, error, ...extra };
}

function parseExpectedRevision(value: unknown): Date | null {
  if (typeof value !== 'string' || value.trim().length === 0) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function isSerializationConflict(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2034'
  );
}

function convertedState(
  note:
    | {
        isConverted: boolean;
        convertedAt: Date | null;
        plutusClaimRef: string | null;
      }
    | null,
): ConversionSuccess | ConversionFailure | null {
  if (!note?.isConverted) return null;
  const normalized = normalizePlutusReference(note.plutusClaimRef);
  if (!note.convertedAt || !normalized) {
    return failure(
      'CONVERTED_STATE_MALFORMED',
      'This legacy converted note is missing its durable claim reference or conversion time.',
      { manualReviewRequired: true },
    );
  }
  return {
    success: true,
    alreadyConverted: true,
    convertedAt: note.convertedAt.toISOString(),
    plutusClaimRef: note.plutusClaimRef,
  };
}

function attestationDigest(note: {
  parentSigned: boolean;
  parentSignedAt: Date | null;
  parentSignerName: string | null;
  rbtSigned: boolean;
  rbtSignedAt: Date | null;
  rbtSignerName: string | null;
  bcbaSigned: boolean;
  bcbaSignedAt: Date | null;
  bcbaSignerName: string | null;
  structuredContent: unknown;
}): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        parentSigned: note.parentSigned,
        parentSignedAt: note.parentSignedAt?.toISOString() ?? null,
        parentSignerHash: note.parentSignerName
          ? createHash('sha256').update(note.parentSignerName).digest('hex')
          : null,
        rbtSigned: note.rbtSigned,
        rbtSignedAt: note.rbtSignedAt?.toISOString() ?? null,
        rbtSignerHash: note.rbtSignerName
          ? createHash('sha256').update(note.rbtSignerName).digest('hex')
          : null,
        bcbaSigned: note.bcbaSigned,
        bcbaSignedAt: note.bcbaSignedAt?.toISOString() ?? null,
        bcbaSignerHash: note.bcbaSignerName
          ? createHash('sha256').update(note.bcbaSignerName).digest('hex')
          : null,
        submissionFingerprint: extractSubmissionFingerprint(note.structuredContent),
      }),
    )
    .digest('hex');
}

/**
 * Explicit manual claim filing. The exact reviewed revision/fingerprint,
 * durable attestation chain, auth resolver, state change, and critical audits
 * are all evaluated inside one serializable transition.
 */
export async function convertNoteToBillable(
  noteId: string,
  options: ConvertOptions,
): Promise<ConversionSuccess | ConversionFailure> {
  const actorGate = await requireStaff(SESSION_NOTES_CONVERSION_ROLES);
  if (!actorGate.ok) return failure('AUTHORIZATION_DENIED', actorGate.error);

  const claimRef = normalizePlutusReference(options?.plutusClaimRef);
  if (!claimRef) {
    return failure(
      'PLUTUS_REFERENCE_REQUIRED',
      'Enter a nonblank claim or batch reference (200 characters maximum).',
    );
  }
  const expectedUpdatedAt = parseExpectedRevision(options?.expectedNoteUpdatedAt);
  const expectedFingerprint = options?.expectedSubmissionFingerprint;
  if (
    !UUID_RE.test(noteId) ||
    !expectedUpdatedAt ||
    !isSubmissionFingerprint(expectedFingerprint)
  ) {
    return failure(
      'SESSION_NOTE_CONFLICT',
      'The reviewed SessionNote revision is missing or malformed. Reload before converting.',
      { conflict: true },
    );
  }

  try {
    const note = await prisma.sessionNote.findUnique({
      where: { id: noteId },
      include: {
        deficiencies: {
          where: { status: 'OPEN' },
          select: { id: true },
        },
        session: {
          select: {
            id: true,
            clientId: true,
            rbtId: true,
            bcbaId: true,
            status: true,
            cptCode: true,
            scheduledStart: true,
            scheduledEnd: true,
            actualStart: true,
            actualEnd: true,
            placeOfServiceCode: true,
            client: {
              select: {
                status: true,
                firstName: true,
                lastName: true,
                primaryDiagnosisCode: true,
                insurancePayer: true,
                authorizations: {
                  where: { status: 'APPROVED' },
                  include: { cptCodes: true },
                  orderBy: { updatedAt: 'desc' },
                  take: 3,
                },
              },
            },
          },
        },
      },
    });
    if (!note) return failure('SESSION_NOTE_NOT_FOUND', 'Session note not found.');

    const alreadyConverted = convertedState(note);
    if (alreadyConverted) return alreadyConverted;

    const fingerprint = extractSubmissionFingerprint(note.structuredContent);
    if (
      note.updatedAt.getTime() !== expectedUpdatedAt.getTime() ||
      fingerprint !== expectedFingerprint
    ) {
      return failure(
        'SESSION_NOTE_CONFLICT',
        'This note changed after it was reviewed. Reload before converting.',
        { conflict: true },
      );
    }

    const integrity = evaluateAttestationState(
      {
        sessionStatus: note.session.status,
        parentSigned: note.parentSigned,
        parentSignedAt: note.parentSignedAt,
        parentSignerName: note.parentSignerName,
        rbtSigned: note.rbtSigned,
        rbtSignedAt: note.rbtSignedAt,
        rbtSignerName: note.rbtSignerName,
        bcbaSigned: note.bcbaSigned,
        bcbaSignedAt: note.bcbaSignedAt,
        bcbaSignerName: note.bcbaSignerName,
        checklistSnapshot: note.checklistSnapshot,
        openDeficiencyCount: note.deficiencies.length,
        billableUnits: note.billableUnits,
        submissionFingerprint: fingerprint,
        isConverted: note.isConverted,
      },
      'DURABLE',
    );
    if (!integrity.ok) {
      return failure(integrity.code, integrity.reason, {
        manualReviewRequired: integrity.manualReviewRequired,
      });
    }

    const demoHygiene = evaluateActiveClientDemoHygiene(note.session.client.status, {
      structuredContent: note.structuredContent,
    });
    if (!demoHygiene.ok) {
      return failure('ACTIVE_DEMO_TARGETS', demoHygiene.reason, {
        manualReviewRequired: true,
      });
    }

    const access = await requireClientAccess(note.session.clientId);
    if (!access.ok) {
      return failure(
        'CLIENT_ACCESS_DENIED',
        'You no longer have access to this client.',
      );
    }

    const credentialGate = await assertNoteCredentialHardStop({
      clientStatus: note.session.client.status,
      bcbaUserId: note.session.bcbaId,
      rbtUserId: note.session.rbtId,
    });
    if (!credentialGate.ok) {
      return failure(credentialGate.code, credentialGate.error, {
        manualReviewRequired: true,
      });
    }

    const scrub = scrubNoteForConvert({
      id: note.id,
      billableUnits: note.billableUnits,
      rbtSigned: note.rbtSigned,
      bcbaSigned: note.bcbaSigned,
      parentSigned: note.parentSigned,
      isConverted: note.isConverted,
      deficiencies: note.deficiencies,
      session: {
        id: note.session.id,
        clientId: note.session.clientId,
        cptCode: note.session.cptCode,
        status: note.session.status,
        scheduledStart: note.session.scheduledStart,
        scheduledEnd: note.session.scheduledEnd,
        actualStart: note.session.actualStart,
        actualEnd: note.session.actualEnd,
        placeOfServiceCode: note.session.placeOfServiceCode,
        rbtId: note.session.rbtId,
        bcbaId: note.session.bcbaId,
        client: {
          firstName: note.session.client.firstName,
          lastName: note.session.client.lastName,
          primaryDiagnosisCode: note.session.client.primaryDiagnosisCode,
          insurancePayer: note.session.client.insurancePayer,
          authorizations: note.session.client.authorizations.map((auth) => ({
            authNumber: auth.authNumber,
            startDate: auth.startDate,
            endDate: auth.endDate,
            status: auth.status,
            unitsApproved: auth.unitsApproved,
            cptCodes: auth.cptCodes,
          })),
        },
      },
    });
    if (hasBlockingScrubDefects(scrub)) {
      return failure(
        'CLAIM_SCRUBBER_BLOCKED',
        `Claim scrubber blocked convert: ${blockingScrubDefectLabels(scrub).join(' · ')}`,
        { manualReviewRequired: true },
      );
    }

    type TransactionOutcome =
      | {
          kind: 'CONVERTED';
          convertedAt: Date;
          authUnitOverridden: boolean;
        }
      | {
          kind: 'ALREADY_CONVERTED';
          convertedAt: Date;
          plutusClaimRef: string;
        }
      | { kind: 'BLOCKED'; result: ConversionFailure }
      | { kind: 'CONFLICT' };

    const outcome = await prisma.$transaction(
      async (tx): Promise<TransactionOutcome> => {
        const actor = await tx.user.findFirst({
          where: {
            id: actorGate.user.id,
            role: { in: [...SESSION_NOTES_CONVERSION_ROLES] },
            isActive: true,
          },
          select: { id: true, role: true },
        });
        if (!actor) {
          return {
            kind: 'BLOCKED',
            result: failure(
              'ACTOR_NOT_ACTIVE',
              'Your active billing role could not be reverified.',
            ),
          };
        }

        const [authorizations, paRequests, sessions] = await Promise.all([
          tx.authorization.findMany({
            where: { clientId: note.session.clientId },
            include: { cptCodes: true },
          }),
          tx.pARequest.findMany({ where: { clientId: note.session.clientId } }),
          tx.session.findMany({
            where: { clientId: note.session.clientId },
            select: {
              id: true,
              status: true,
              cptCode: true,
              scheduledStart: true,
              scheduledEnd: true,
              actualStart: true,
              actualEnd: true,
              note: {
                select: {
                  parentSigned: true,
                  parentSignedAt: true,
                  parentSignerName: true,
                  rbtSigned: true,
                  rbtSignedAt: true,
                  rbtSignerName: true,
                  bcbaSigned: true,
                  bcbaSignedAt: true,
                  bcbaSignerName: true,
                  isConverted: true,
                  billableUnits: true,
                  checklistSnapshot: true,
                  structuredContent: true,
                  deficiencies: {
                    where: { status: 'OPEN' },
                    select: { id: true },
                  },
                },
              },
            },
          }),
        ]);
        const stop = evaluateAuthUnitHardStop({
          clientId: note.session.clientId,
          targetSessionId: note.session.id,
          authorizations,
          paRequests,
          sessions: sessions.map((session) => ({
            ...session,
            note: session.note
              ? {
                  billableUnits: session.note.billableUnits,
                  parentSigned: session.note.parentSigned,
                  parentSignedAt: session.note.parentSignedAt,
                  parentSignerName: session.note.parentSignerName,
                  rbtSigned: session.note.rbtSigned,
                  rbtSignedAt: session.note.rbtSignedAt,
                  rbtSignerName: session.note.rbtSignerName,
                  bcbaSigned: session.note.bcbaSigned,
                  bcbaSignedAt: session.note.bcbaSignedAt,
                  bcbaSignerName: session.note.bcbaSignerName,
                  isConverted: session.note.isConverted,
                  checklistSnapshot: session.note.checklistSnapshot,
                  openDeficiencyCount: session.note.deficiencies.length,
                  submissionFingerprint: extractSubmissionFingerprint(
                    session.note.structuredContent,
                  ),
                }
              : null,
          })),
        });

        if (!stop.enforced && stop.manualReviewRequired) {
          return {
            kind: 'BLOCKED',
            result: failure(
              'AUTH_UNITS_MANUAL_REVIEW',
              `Authorization-unit manual review required for CPT ${
                stop.cptCode || 'unattributed'
              }: ${stop.reason.replaceAll('_', ' ').toLowerCase()}.`,
              {
                manualReviewRequired: true,
                authUnitReview: {
                  reason: stop.reason,
                  requestedUnits: stop.requestedUnits,
                  cptCode: stop.cptCode,
                  candidate: stop.candidate,
                },
              },
            ),
          };
        }

        const canOverride = AUTH_UNIT_OVERRIDE_ROLES.has(actor.role);
        const overrideReason = options.overrideReason?.trim() || null;
        let override:
          | {
              stop: Extract<AuthUnitHardStop, { enforced: true }>;
              reason: string;
            }
          | null = null;
        if (stop.enforced && stop.exceeded) {
          const authUnitStop = {
            remainingUnits: stop.remainingBeforeNote,
            requestedUnits: stop.requestedUnits,
            cptCode: stop.cptCode,
            authNumber: stop.authNumber,
            canOverride,
          };
          if (!options.overrideAuthUnits || !canOverride) {
            return {
              kind: 'BLOCKED',
              result: failure(
                'AUTH_UNITS_EXCEEDED',
                `Auth-unit hard stop: ${stop.remainingBeforeNote} unit(s) remain for CPT ${stop.cptCode}, but this note requests ${stop.requestedUnits}.`,
                { authUnitStop },
              ),
            };
          }
          if (!overrideReason) {
            return {
              kind: 'BLOCKED',
              result: failure(
                'AUTH_UNITS_EXCEEDED',
                'An override reason is required.',
                { authUnitStop },
              ),
            };
          }
          override = { stop, reason: overrideReason };
        }

        const convertedAt = new Date();
        const converted = await tx.sessionNote.updateMany({
          where: {
            id: noteId,
            updatedAt: expectedUpdatedAt,
            parentSigned: true,
            parentSignedAt: { not: null },
            parentSignerName: { not: null },
            rbtSigned: true,
            rbtSignedAt: { not: null },
            rbtSignerName: { not: null },
            bcbaSigned: true,
            bcbaSignedAt: { not: null },
            bcbaSignerName: { not: null },
            isConverted: false,
            convertedAt: null,
            plutusClaimRef: null,
            billableUnits: { gt: 0 },
            checklistSnapshot: {
              equals: note.checklistSnapshot as Prisma.InputJsonValue,
            },
            structuredContent: {
              path: ['submissionFingerprint'],
              equals: expectedFingerprint,
            },
            deficiencies: { none: { status: 'OPEN' } },
            session: { is: { status: 'COMPLETED' } },
          },
          data: {
            isConverted: true,
            convertedAt,
            plutusClaimRef: claimRef,
          },
        });

        if (converted.count === 0) {
          const current = await tx.sessionNote.findUnique({
            where: { id: noteId },
            select: {
              isConverted: true,
              convertedAt: true,
              plutusClaimRef: true,
            },
          });
          const duplicate = convertedState(current);
          if (duplicate?.success && duplicate.alreadyConverted) {
            return {
              kind: 'ALREADY_CONVERTED',
              convertedAt: current!.convertedAt!,
              plutusClaimRef: current!.plutusClaimRef!,
            };
          }
          return { kind: 'CONFLICT' };
        }

        await tx.auditLogVault.create({
          data: {
            userId: actor.id,
            action: 'CONVERT',
            resourceType: 'SESSION_NOTE',
            resourceId: noteId,
            metadata: {
              event: 'PLUTUS_HANDOFF',
              sessionId: note.session.id,
              clientId: note.session.clientId,
              submissionFingerprint: expectedFingerprint,
              plutusClaimRef: claimRef,
              convertedAt: convertedAt.toISOString(),
              authUnitOverride: Boolean(override),
            },
          },
        });

        if (override) {
          await tx.auditLogVault.create({
            data: {
              userId: actor.id,
              action: 'OVERRIDE',
              resourceType: 'SESSION_NOTE',
              resourceId: noteId,
              metadata: {
                event: 'AUTH_UNIT_HARD_STOP_OVERRIDE',
                sessionId: note.session.id,
                clientId: note.session.clientId,
                submissionFingerprint: expectedFingerprint,
                authWindowId: override.stop.windowId,
                cptCode: override.stop.cptCode,
                remainingUnits: override.stop.remainingBeforeNote,
                requestedUnits: override.stop.requestedUnits,
                overrideReason: override.reason,
              },
            },
          });
        }

        return {
          kind: 'CONVERTED',
          convertedAt,
          authUnitOverridden: Boolean(override),
        };
      },
      SERIALIZABLE_OPTIONS,
    );

    if (outcome.kind === 'BLOCKED') return outcome.result;
    if (outcome.kind === 'CONFLICT') {
      return failure(
        'SESSION_NOTE_CONFLICT',
        'The note or a deficiency changed during conversion. Reload before retrying.',
        { conflict: true },
      );
    }
    if (outcome.kind === 'ALREADY_CONVERTED') {
      return {
        success: true,
        alreadyConverted: true,
        convertedAt: outcome.convertedAt.toISOString(),
        plutusClaimRef: outcome.plutusClaimRef,
      };
    }

    let credentialWarnings: string[] = credentialGate.warnings;
    try {
      const postCommit = await collectNoteCredentialWarnings({
        bcbaUserId: note.session.bcbaId,
        rbtUserId: note.session.rbtId,
        clientStatus: note.session.client.status,
      });
      credentialWarnings = [...new Set([...credentialWarnings, ...postCommit])];
    } catch {
      // Credential warnings are post-commit only.
    }

    try {
      if (note.session.rbtId) {
        await createNotification({
          userId: note.session.rbtId,
          title: 'Payroll may have updated',
          message: 'A session note claim was filed. Refresh payroll when convenient.',
          type: 'PAYROLL_REFRESH',
          linkUrl: '/rbt/payroll',
          dedupeHours: 24,
        });
      }
    } catch (error) {
      console.error(
        'Action post-commit notification failed [convertNoteToBillable]:',
        error instanceof Error ? error.message : 'Unknown error',
      );
    }

    revalidatePath('/notes');
    revalidatePath('/portal-billing/claims');
    revalidatePath('/', 'layout');
    revalidatePath(`/client/${note.session.clientId}`);
    return {
      success: true,
      ...(credentialWarnings.length > 0 ? { credentialWarnings } : {}),
      ...(outcome.authUnitOverridden ? { authUnitOverridden: true as const } : {}),
    };
  } catch (error) {
    if (isSerializationConflict(error)) {
      const current = await prisma.sessionNote.findUnique({
        where: { id: noteId },
        select: {
          isConverted: true,
          convertedAt: true,
          plutusClaimRef: true,
        },
      });
      const duplicate = convertedState(current);
      if (duplicate) return duplicate;
      return failure(
        'SESSION_NOTE_CONFLICT',
        'A concurrent note or deficiency change won the race. Reload before retrying.',
        { conflict: true },
      );
    }
    console.error(
      'Action failed [convertNoteToBillable]:',
      error instanceof Error ? error.message : 'Unknown error',
    );
    return failure(
      'CONVERSION_FAILED',
      'Conversion and its critical audit did not commit. The note remains unconverted.',
    );
  }
}

/**
 * Open a correction deficiency and invalidate every live attestation projection.
 * The persisted Session.rbtId is the sole deficiency author; caller author ids
 * are rejected when forged. The RBT must resubmit corrected Studio content
 * against the new note.updatedAt before the note can re-enter review.
 */
export async function flagDeficiency(
  _previousState: FlagDeficiencyState,
  formData: FormData,
): Promise<FlagDeficiencyState> {
  const actorGate = await requireStaff(DEFICIENCY_ROLES);
  if (!actorGate.ok) {
    return { success: false, code: 'AUTHORIZATION_DENIED', error: actorGate.error };
  }
  if (!UUID_RE.test(actorGate.user.id)) {
    return {
      success: false,
      code: 'PERSISTED_ACTOR_REQUIRED',
      error: 'A persisted clinical reviewer identity is required.',
    };
  }

  try {
    const noteId = String(formData.get('noteId') || '');
    const description = String(formData.get('description') || '').trim();
    const suppliedAuthorId = String(formData.get('authorId') || '').trim();
    const expectedUpdatedAt = parseExpectedRevision(
      formData.get('expectedNoteUpdatedAt'),
    );
    const expectedFingerprint = String(
      formData.get('expectedSubmissionFingerprint') || '',
    );
    if (
      !UUID_RE.test(noteId) ||
      description.length < 3 ||
      description.length > 2_000 ||
      !expectedUpdatedAt ||
      !isSubmissionFingerprint(expectedFingerprint)
    ) {
      return {
        success: false,
        code: 'INVALID_DEFICIENCY_REQUEST',
        error: 'A valid description and current SessionNote revision are required.',
      };
    }

    const note = await prisma.sessionNote.findUnique({
      where: { id: noteId },
      include: {
        deficiencies: {
          where: { status: 'OPEN' },
          select: { id: true },
        },
        session: {
          select: {
            id: true,
            clientId: true,
            rbtId: true,
            bcbaId: true,
            status: true,
            client: { select: { bcbaId: true } },
          },
        },
      },
    });
    if (!note) {
      return { success: false, code: 'SESSION_NOTE_NOT_FOUND', error: 'Session note not found.' };
    }
    if (!note.session.rbtId) {
      return {
        success: false,
        code: 'SESSION_RBT_MISSING',
        error: 'The persisted Session has no RBT author. Manual review is required.',
      };
    }
    const authorId = note.session.rbtId;
    if (suppliedAuthorId && suppliedAuthorId !== authorId) {
      return {
        success: false,
        code: 'FORGED_AUTHOR',
        error: 'The caller-supplied deficiency author does not match Session.rbtId.',
      };
    }
    if (note.isConverted) {
      return {
        success: false,
        code: 'NOTE_ALREADY_CONVERTED',
        error: 'A converted claim is locked. Use a separately audited reversal workflow.',
      };
    }
    if (note.deficiencies.length > 0) {
      return {
        success: false,
        code: 'OPEN_DEFICIENCY_EXISTS',
        error: 'This note already has an open correction deficiency.',
      };
    }
    if (
      note.updatedAt.getTime() !== expectedUpdatedAt.getTime() ||
      extractSubmissionFingerprint(note.structuredContent) !== expectedFingerprint
    ) {
      return {
        success: false,
        code: 'SESSION_NOTE_CONFLICT',
        conflict: true,
        error: 'The note changed after review. Reload before opening a deficiency.',
      };
    }

    const access = await requireClientAccess(note.session.clientId);
    if (!access.ok) {
      return {
        success: false,
        code: 'CLIENT_ACCESS_DENIED',
        error: 'You are not currently assigned or authorized for this client.',
      };
    }

    const sanitized = sanitizeStructuredContentForDeficiency(
      note.structuredContent,
    );
    const priorDigest = attestationDigest(note);
    const assignmentPredicate =
      actorGate.user.role === 'BCBA'
        ? {
            OR: [
              { bcbaId: actorGate.user.id },
              { client: { is: { bcbaId: actorGate.user.id } } },
            ],
          }
        : {};

    const transactionResult = await prisma.$transaction(
      async (tx) => {
        const actor = await tx.user.findFirst({
          where: {
            id: actorGate.user.id,
            role: { in: DEFICIENCY_ROLES },
            isActive: true,
          },
          select: { id: true, role: true },
        });
        if (!actor) throw new Error('DEFICIENCY_ACTOR_NOT_ACTIVE');

        const existing = await tx.noteDeficiency.findFirst({
          where: { noteId, status: 'OPEN' },
          select: { id: true },
        });
        if (existing) throw new Error('OPEN_DEFICIENCY_EXISTS');

        const invalidated = await tx.sessionNote.updateMany({
          where: {
            id: noteId,
            updatedAt: expectedUpdatedAt,
            isConverted: false,
            structuredContent: {
              path: ['submissionFingerprint'],
              equals: expectedFingerprint,
            },
            deficiencies: { none: { status: 'OPEN' } },
            session: {
              is: {
                rbtId: authorId,
                ...assignmentPredicate,
              },
            },
          },
          data: {
            parentSigned: false,
            parentSignedAt: null,
            parentSignerName: null,
            rbtSigned: false,
            rbtSignedAt: null,
            rbtSignerName: null,
            bcbaSigned: false,
            bcbaSignedAt: null,
            bcbaSignerName: null,
            isConverted: false,
            convertedAt: null,
            plutusClaimRef: null,
            billableUnits: null,
            checklistSnapshot: Prisma.JsonNull,
            structuredContent: sanitized
              ? (sanitized as Prisma.InputJsonValue)
              : Prisma.JsonNull,
          },
        });
        if (invalidated.count !== 1) throw new Error('SESSION_NOTE_CONFLICT');

        const deficiency = await tx.noteDeficiency.create({
          data: {
            noteId,
            authorId,
            flaggedById: actor.id,
            description,
            status: 'OPEN',
          },
          select: { id: true },
        });

        await tx.auditLogVault.create({
          data: {
            userId: actor.id,
            action: 'EDIT',
            resourceType: 'SESSION_NOTE',
            resourceId: noteId,
            metadata: {
              event: 'SESSION_NOTE_ATTESTATIONS_INVALIDATED',
              sessionId: note.session.id,
              clientId: note.session.clientId,
              deficiencyId: deficiency.id,
              authorId,
              priorSubmissionFingerprint: expectedFingerprint,
              attestationDigest: priorDigest,
            },
          },
        });

        return { deficiencyId: deficiency.id };
      },
      SERIALIZABLE_OPTIONS,
    );

    try {
      await createNotification({
        userId: authorId,
        title: 'Session note correction required',
        message:
          'A clinical reviewer opened a correction deficiency. Reopen the assigned session in Session Studio, correct the content, and resubmit against the latest revision.',
        type: 'NOTE_DEFICIENCY',
        linkUrl: '/rbt/schedule',
        dedupeHours: 0,
      });
    } catch (error) {
      console.error(
        'Action post-commit notification failed [flagDeficiency]:',
        error instanceof Error ? error.message : 'Unknown error',
      );
    }

    revalidatePath('/notes');
    revalidatePath('/portal-billing/claims');
    revalidatePath('/portal-clinical/daily');
    revalidatePath(`/client/${note.session.clientId}`);
    return {
      success: true,
      code: 'DEFICIENCY_CREATED',
      // Keeping the id in action state lets a future correction-review surface
      // deep-link without echoing the PHI-bearing description.
      error: undefined,
      ...(transactionResult.deficiencyId ? {} : {}),
    };
  } catch (error) {
    if (
      (error instanceof Error &&
        (error.message === 'SESSION_NOTE_CONFLICT' ||
          error.message === 'OPEN_DEFICIENCY_EXISTS')) ||
      isSerializationConflict(error)
    ) {
      return {
        success: false,
        code:
          error instanceof Error && error.message === 'OPEN_DEFICIENCY_EXISTS'
            ? 'OPEN_DEFICIENCY_EXISTS'
            : 'SESSION_NOTE_CONFLICT',
        ...(error instanceof Error && error.message === 'OPEN_DEFICIENCY_EXISTS'
          ? {}
          : { conflict: true as const }),
        error:
          error instanceof Error && error.message === 'OPEN_DEFICIENCY_EXISTS'
            ? 'This note already has an open correction deficiency.'
            : 'A concurrent signature, correction, or conversion changed the note. Reload before retrying.',
      };
    }
    console.error(
      'Action failed [flagDeficiency]:',
      error instanceof Error ? error.message : 'Unknown error',
    );
    return {
      success: false,
      code: 'DEFICIENCY_FAILED',
      error:
        'The deficiency, attestation invalidation, and critical audit did not commit.',
    };
  }
}

/**
 * Export converted notes as a stable Plutus handoff CSV (no EDI / no legacy EMR).
 */
export async function exportPlutusHandoffCsv(): Promise<
  | { success: true; csv: string; rowCount: number; filename: string }
  | { success: false; error: string }
> {
  const gate = await requireStaff(SESSION_NOTES_CONVERSION_ROLES);
  if (!gate.ok) return { success: false, error: gate.error };

  try {
    const converted = await prisma.sessionNote.findMany({
      where: { isConverted: true, plutusClaimRef: { not: null } },
      include: {
        session: {
          include: {
            client: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                memberId: true,
                medicaidId: true,
                insurancePayer: true,
                authorizations: {
                  where: { status: 'APPROVED' },
                  select: { authNumber: true },
                  orderBy: { updatedAt: 'desc' },
                  take: 1,
                },
              },
            },
          },
        },
      },
      orderBy: { convertedAt: 'desc' },
      take: 500,
    });

    const staffIds = [
      ...new Set(
        converted.flatMap((n) => [n.session.rbtId, n.session.bcbaId].filter(Boolean) as string[]),
      ),
    ];
    const npiByUser = new Map<string, string>();
    await Promise.all(
      staffIds.map(async (userId) => {
        npiByUser.set(userId, await getStaffNpi(userId));
      }),
    );

    const rows = buildPlutusExportRows(
      converted.map((note) => ({
        id: note.id,
        billableUnits: note.billableUnits,
        plutusClaimRef: note.plutusClaimRef,
        convertedAt: note.convertedAt,
        session: {
          cptCode: note.session.cptCode,
          scheduledStart: note.session.scheduledStart,
          actualStart: note.session.actualStart,
          rbtNpi: note.session.rbtId ? npiByUser.get(note.session.rbtId) : '',
          bcbaNpi: note.session.bcbaId ? npiByUser.get(note.session.bcbaId) : '',
          client: note.session.client,
        },
      })),
    );

    if (rows.length === 0) {
      return {
        success: false,
        error: 'No converted notes with claim refs and billable units to export.',
      };
    }

    const csv = buildPlutusExportCsv(rows);
    const stamp = new Date().toISOString().slice(0, 10);
    return {
      success: true,
      csv,
      rowCount: rows.length,
      filename: `plutus-handoff-${stamp}.csv`,
    };
  } catch (error) {
    console.error(
      'Action failed [exportPlutusHandoffCsv]:',
      error instanceof Error ? error.message : 'Unknown error',
    );
    return { success: false, error: 'Could not build claims export packet.' };
  }
}

const CLIENT_PIPELINE_NOTE_INCLUDE = {
  session: {
    include: {
      client: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          status: true,
          insurancePayer: true,
          memberId: true,
          medicaidId: true,
          primaryDiagnosisCode: true,
          authorizations: {
            where: { status: 'APPROVED' as const },
            select: {
              authNumber: true,
              type: true,
              status: true,
              startDate: true,
              endDate: true,
              unitsApproved: true,
              cptCodes: { select: { code: true, unitsApproved: true } },
            },
            orderBy: { updatedAt: 'desc' as const },
            take: 3,
          },
        },
      },
      rbt: { select: { id: true, firstName: true, lastName: true } },
      bcba: { select: { id: true, firstName: true, lastName: true } },
    },
  },
  deficiencies: {
    where: { status: 'OPEN' as const },
  },
} as const;

export type ClientSessionNotesPipelinePayload = {
  awaitingBcba: Awaited<
    ReturnType<typeof prisma.sessionNote.findMany<{ include: typeof CLIENT_PIPELINE_NOTE_INCLUDE }>>
  >;
  readyForPlutus: ClientSessionNotesPipelinePayload['awaitingBcba'];
  converted: ClientSessionNotesPipelinePayload['awaitingBcba'];
  queueCounts: { awaiting: number; ready: number; converted: number };
  authUnitStatusByNoteId: Record<string, AuthUnitHardStop>;
  scrubStatusByNoteId: Record<string, ClaimScrubResult>;
  convertBlockersByNoteId: Record<string, string[]>;
  canConvert: boolean;
};

/**
 * Client-scoped SessionNote pipeline for inline Plutus handoff in the client profile.
 */
export async function getClientSessionNotesPipeline(
  clientId: string,
): Promise<
  | { success: true; data: ClientSessionNotesPipelinePayload }
  | { success: false; error: string }
> {
  const access = await requireClientAccess(clientId);
  if (!access.ok) return { success: false, error: access.error };

  const roleGate = await requireStaff(SESSION_NOTES_ROLES);
  if (!roleGate.ok) return { success: false, error: roleGate.error };

  const canConvert = SESSION_NOTES_CONVERSION_ROLES.includes(
    roleGate.user.role as Role,
  );

  const clientScope = { session: { clientId } };

  try {
    const [
      awaitingBcba,
      readyForPlutus,
      converted,
      awaitingCount,
      readyCount,
      convertedCount,
    ] = await Promise.all([
      prisma.sessionNote.findMany({
        where: { ...clientScope, rbtSigned: true, bcbaSigned: false },
        include: CLIENT_PIPELINE_NOTE_INCLUDE,
        orderBy: { updatedAt: 'desc' },
        take: 100,
      }),
      prisma.sessionNote.findMany({
        where: { ...clientScope, bcbaSigned: true, isConverted: false },
        include: CLIENT_PIPELINE_NOTE_INCLUDE,
        orderBy: { updatedAt: 'desc' },
        take: 100,
      }),
      prisma.sessionNote.findMany({
        where: { ...clientScope, isConverted: true },
        include: CLIENT_PIPELINE_NOTE_INCLUDE,
        orderBy: { convertedAt: 'desc' },
        take: 100,
      }),
      prisma.sessionNote.count({
        where: { ...clientScope, rbtSigned: true, bcbaSigned: false },
      }),
      prisma.sessionNote.count({
        where: { ...clientScope, bcbaSigned: true, isConverted: false },
      }),
      prisma.sessionNote.count({
        where: { ...clientScope, isConverted: true },
      }),
    ]);

    const authUnitStatusByNoteId: Record<string, AuthUnitHardStop> = {};
    const scrubStatusByNoteId: Record<string, ClaimScrubResult> = {};
    const convertBlockersByNoteId: Record<string, string[]> = {};

    if (readyForPlutus.length > 0) {
      const [authorizations, paRequests, sessions] = await Promise.all([
        prisma.authorization.findMany({
          where: { clientId },
          include: { cptCodes: true },
        }),
        prisma.pARequest.findMany({ where: { clientId } }),
        prisma.session.findMany({
          where: { clientId },
          select: {
            id: true,
            status: true,
            cptCode: true,
            scheduledStart: true,
            scheduledEnd: true,
            actualStart: true,
            actualEnd: true,
            note: {
              select: {
                billableUnits: true,
                parentSigned: true,
                parentSignedAt: true,
                parentSignerName: true,
                rbtSigned: true,
                rbtSignedAt: true,
                rbtSignerName: true,
                bcbaSigned: true,
                bcbaSignedAt: true,
                bcbaSignerName: true,
                isConverted: true,
                checklistSnapshot: true,
                structuredContent: true,
                deficiencies: {
                  where: { status: 'OPEN' },
                  select: { id: true },
                },
              },
            },
          },
        }),
      ]);

      const ledgerSessions = sessions.map((session) => ({
        ...session,
        note: session.note
          ? {
              billableUnits: session.note.billableUnits,
              parentSigned: session.note.parentSigned,
              parentSignedAt: session.note.parentSignedAt,
              parentSignerName: session.note.parentSignerName,
              rbtSigned: session.note.rbtSigned,
              rbtSignedAt: session.note.rbtSignedAt,
              rbtSignerName: session.note.rbtSignerName,
              bcbaSigned: session.note.bcbaSigned,
              bcbaSignedAt: session.note.bcbaSignedAt,
              bcbaSignerName: session.note.bcbaSignerName,
              isConverted: session.note.isConverted,
              checklistSnapshot: session.note.checklistSnapshot,
              openDeficiencyCount: session.note.deficiencies.length,
              submissionFingerprint: extractSubmissionFingerprint(
                session.note.structuredContent,
              ),
            }
          : null,
      }));

      for (const note of readyForPlutus) {
        const sessionId = note.session?.id;
        if (!sessionId) continue;

        authUnitStatusByNoteId[note.id] = evaluateAuthUnitHardStop({
          clientId,
          targetSessionId: sessionId,
          authorizations,
          paRequests,
          sessions: ledgerSessions,
        });

        if (!note.session) continue;

        const scrub = scrubNoteForConvert({
          id: note.id,
          billableUnits: note.billableUnits,
          rbtSigned: note.rbtSigned,
          bcbaSigned: note.bcbaSigned,
          parentSigned: note.parentSigned,
          isConverted: note.isConverted,
          deficiencies: note.deficiencies,
          session: {
            id: note.session.id,
            clientId: note.session.clientId,
            cptCode: note.session.cptCode,
            status: note.session.status,
            scheduledStart: note.session.scheduledStart,
            scheduledEnd: note.session.scheduledEnd,
            actualStart: note.session.actualStart,
            actualEnd: note.session.actualEnd,
            placeOfServiceCode: note.session.placeOfServiceCode,
            rbtId: note.session.rbtId,
            bcbaId: note.session.bcbaId,
            client: {
              firstName: note.session.client.firstName,
              lastName: note.session.client.lastName,
              primaryDiagnosisCode: note.session.client.primaryDiagnosisCode,
              insurancePayer: note.session.client.insurancePayer,
              authorizations: note.session.client.authorizations,
            },
          },
        });
        scrubStatusByNoteId[note.id] = scrub;

        const blockers: string[] = [];
        if (hasBlockingScrubDefects(scrub)) {
          blockers.push(
            ...scrub.defects
              .filter((d) => d.severity === 'BLOCKING')
              .map((d) => d.message),
          );
        }

        const [rbtStatus, bcbaStatus] = await Promise.all([
          note.session.rbtId ? getCredentialStatus(note.session.rbtId) : null,
          note.session.bcbaId ? getCredentialStatus(note.session.bcbaId) : null,
        ]);
        const credentialVerdict = evaluateCredentialHardStop({
          clientStatus: note.session.client.status,
          rbtStatus,
          bcbaStatus,
        });
        if (!credentialVerdict.ok) blockers.push(...credentialVerdict.blockers);

        if (blockers.length > 0) convertBlockersByNoteId[note.id] = blockers;
      }
    }

    return {
      success: true,
      data: {
        awaitingBcba,
        readyForPlutus,
        converted,
        queueCounts: {
          awaiting: awaitingCount,
          ready: readyCount,
          converted: convertedCount,
        },
        authUnitStatusByNoteId,
        scrubStatusByNoteId,
        convertBlockersByNoteId,
        canConvert,
      },
    };
  } catch (error) {
    console.error(
      'Action failed [getClientSessionNotesPipeline]:',
      error instanceof Error ? error.message : 'Unknown error',
    );
    return {
      success: false,
      error: 'Could not load session notes pipeline for this client.',
    };
  }
}
