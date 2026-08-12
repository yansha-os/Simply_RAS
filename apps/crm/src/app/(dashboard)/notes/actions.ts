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
import { revalidatePath } from 'next/cache';

import { createNotification } from '@/app/actions/notifications';
import {
  evaluateAuthUnitHardStop,
  type AuthUnitHardStop,
} from '@/lib/billing/authUnits';
import {
  PLUTUS_TRACKER_ROLES,
  requireClientAccess,
  requireStaff,
} from '@/lib/auth-guard';
import { prisma } from '@/lib/prisma';
import { collectNoteCredentialWarnings } from '@/lib/staffCredentials.server';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFICIENCY_ROLES = [
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
      'This legacy converted note is missing its durable Plutus reference or conversion time.',
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
 * Explicit manual Plutus handoff. The exact reviewed revision/fingerprint,
 * durable attestation chain, auth resolver, state change, and critical audits
 * are all evaluated inside one serializable transition.
 */
export async function convertNoteToBillable(
  noteId: string,
  options: ConvertOptions,
): Promise<ConversionSuccess | ConversionFailure> {
  const actorGate = await requireStaff(PLUTUS_TRACKER_ROLES);
  if (!actorGate.ok) return failure('AUTHORIZATION_DENIED', actorGate.error);

  const claimRef = normalizePlutusReference(options?.plutusClaimRef);
  if (!claimRef) {
    return failure(
      'PLUTUS_REFERENCE_REQUIRED',
      'Enter a nonblank Plutus claim or batch reference (200 characters maximum).',
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

    const access = await requireClientAccess(note.session.clientId);
    if (!access.ok) {
      return failure(
        'CLIENT_ACCESS_DENIED',
        'You no longer have access to this client.',
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
            role: { in: [...PLUTUS_TRACKER_ROLES] },
            isActive: true,
          },
          select: { id: true, role: true },
        });
        if (!actor) {
          return {
            kind: 'BLOCKED',
            result: failure(
              'ACTOR_NOT_ACTIVE',
              'Your active Plutus-tracker role could not be reverified.',
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

    let credentialWarnings: string[] = [];
    try {
      credentialWarnings = await collectNoteCredentialWarnings({
        bcbaUserId: note.session.bcbaId,
        rbtUserId: note.session.rbtId,
      });
    } catch {
      // Credential checks are post-commit warnings.
    }

    try {
      if (note.session.rbtId) {
        await createNotification({
          userId: note.session.rbtId,
          title: 'Payroll may have updated',
          message: 'A session note was handed off to Plutus. Refresh payroll when convenient.',
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
        error: 'A converted Plutus handoff is locked. Use a separately audited reversal workflow.',
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
