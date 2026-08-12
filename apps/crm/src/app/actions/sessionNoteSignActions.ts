'use server';

import type { Prisma, Role } from '@repo/db';
import {
  evaluateAttestationState,
  extractSubmissionFingerprint,
  isSubmissionFingerprint,
} from '@repo/db/session-note-attestation';
import { revalidatePath } from 'next/cache';

import { notifyUsers } from '@/app/actions/notifications';
import { requireClientAccess, requireStaff } from '@/lib/auth-guard';
import { prisma } from '@/lib/prisma';
import { getCredentialStatus } from '@/lib/staffCredentials.server';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SIGN_ROLES = ['BCBA', 'CLINICAL_DIRECTOR', 'CEO'] satisfies Role[];
const NOTE_READY_NOTIFICATION_ROLES = ['BILLING', 'FINANCE', 'CEO'] satisfies Role[];
const SESSION_NOTE_CONFLICT = 'SESSION_NOTE_CONFLICT';
const ACTOR_NOT_ACTIVE = 'ACTOR_NOT_ACTIVE';

export type BcbaSignExpectation = {
  noteId: string;
  expectedNoteUpdatedAt: string;
  expectedSubmissionFingerprint: string;
};

function expectedRevision(value: string): Date | null {
  if (typeof value !== 'string' || value.trim().length === 0) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function structuredContentWithBcbaSign(
  structuredContent: unknown,
  sign: { signerUserId: string; signerName: string; signedAt: string },
): Record<string, unknown> | null {
  if (!structuredContent || typeof structuredContent !== 'object' || Array.isArray(structuredContent)) {
    return null;
  }
  return {
    ...(structuredContent as Record<string, unknown>),
    supervisingBcbaUserId: sign.signerUserId,
    supervisingBcbaName: sign.signerName,
    bcbaSignature: {
      signerUserId: sign.signerUserId,
      signerName: sign.signerName,
      signedAt: sign.signedAt,
    },
  };
}

function isSerializationConflict(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2034'
  );
}

function conflictResult(error = 'This note changed after it was reviewed. Reload before signing.') {
  return {
    success: false as const,
    code: 'SESSION_NOTE_CONFLICT' as const,
    conflict: true as const,
    error,
  };
}

/**
 * BCBA supervisory signature transition.
 *
 * The browser must submit the exact revision and canonical Studio fingerprint
 * it reviewed. The final conditional write repeats every durable prerequisite,
 * and the SIGN audit row commits in the same serializable transaction.
 */
export async function signSessionNotesAsBcba(expectations: BcbaSignExpectation[]) {
  const actorGate = await requireStaff(SIGN_ROLES);
  if (!actorGate.ok) {
    return { success: false as const, code: 'AUTHORIZATION_DENIED' as const, error: actorGate.error };
  }
  if (!UUID_RE.test(actorGate.user.id)) {
    return {
      success: false as const,
      code: 'PERSISTED_ACTOR_REQUIRED' as const,
      error: 'A persisted signed-in BCBA identity is required to e-sign session notes.',
    };
  }

  try {
    const unique = new Map<string, BcbaSignExpectation>();
    for (const expectation of expectations) {
      if (!expectation || !UUID_RE.test(expectation.noteId)) {
        return {
          success: false as const,
          code: 'INVALID_SIGN_REQUEST' as const,
          error: 'Every selected SessionNote id must be valid.',
        };
      }
      const revision = expectedRevision(expectation.expectedNoteUpdatedAt);
      if (!revision || !isSubmissionFingerprint(expectation.expectedSubmissionFingerprint)) {
        return conflictResult('The reviewed note revision is missing or malformed. Reload before signing.');
      }
      const prior = unique.get(expectation.noteId);
      if (
        prior &&
        (prior.expectedNoteUpdatedAt !== expectation.expectedNoteUpdatedAt ||
          prior.expectedSubmissionFingerprint !== expectation.expectedSubmissionFingerprint)
      ) {
        return conflictResult('Conflicting revisions were supplied for the same SessionNote.');
      }
      unique.set(expectation.noteId, expectation);
    }
    const requested = [...unique.values()];
    if (requested.length === 0) {
      return {
        success: false as const,
        code: 'INVALID_SIGN_REQUEST' as const,
        error: 'Select at least one session note.',
      };
    }

    const notes = await prisma.sessionNote.findMany({
      where: { id: { in: requested.map((item) => item.noteId) } },
      include: {
        deficiencies: {
          where: { status: 'OPEN' },
          select: { id: true },
        },
        session: {
          include: {
            client: { select: { id: true, bcbaId: true } },
            rbt: { select: { id: true } },
          },
        },
      },
    });
    if (notes.length !== requested.length) {
      return {
        success: false as const,
        code: 'SESSION_NOTE_NOT_FOUND' as const,
        error: 'One or more selected session notes no longer exist.',
      };
    }

    const notesById = new Map(notes.map((note) => [note.id, note]));
    for (const item of requested) {
      const note = notesById.get(item.noteId)!;
      const actualFingerprint = extractSubmissionFingerprint(note.structuredContent);
      const expected = expectedRevision(item.expectedNoteUpdatedAt)!;
      if (
        note.updatedAt.getTime() !== expected.getTime() ||
        actualFingerprint !== item.expectedSubmissionFingerprint
      ) {
        return conflictResult();
      }

      const policy = evaluateAttestationState(
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
          submissionFingerprint: actualFingerprint,
          isConverted: note.isConverted,
        },
        'BCBA_SIGN',
      );
      if (!policy.ok) {
        return {
          success: false as const,
          code: policy.code,
          manualReviewRequired: policy.manualReviewRequired,
          error: policy.reason,
        };
      }
    }

    const clientIds = [...new Set(notes.map((note) => note.session.clientId))];
    for (const clientId of clientIds) {
      const access = await requireClientAccess(clientId);
      if (!access.ok) {
        return {
          success: false as const,
          code: 'CLIENT_ACCESS_DENIED' as const,
          error: 'You are not currently authorized or assigned to one or more selected clients.',
        };
      }
    }

    const transactionResult = await prisma.$transaction(
      async (tx) => {
        const actor = await tx.user.findFirst({
          where: {
            id: actorGate.user.id,
            role: { in: SIGN_ROLES },
            isActive: true,
          },
          select: {
            id: true,
            role: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        });
        if (!actor) throw new Error(ACTOR_NOT_ACTIVE);

        const signerName =
          `${actor.firstName || ''} ${actor.lastName || ''}`.trim() || actor.email || 'BCBA';
        const signedAt = new Date();

        for (const item of requested) {
          const note = notesById.get(item.noteId)!;
          const structured = structuredContentWithBcbaSign(note.structuredContent, {
            signerUserId: actor.id,
            signerName,
            signedAt: signedAt.toISOString(),
          });
          if (!structured) throw new Error(SESSION_NOTE_CONFLICT);

          const assignmentPredicate =
            actor.role === 'BCBA'
              ? {
                  OR: [
                    { bcbaId: actor.id },
                    { client: { is: { bcbaId: actor.id } } },
                  ],
                }
              : {};

          const updated = await tx.sessionNote.updateMany({
            where: {
              id: item.noteId,
              updatedAt: expectedRevision(item.expectedNoteUpdatedAt)!,
              parentSigned: true,
              parentSignedAt: { not: null },
              parentSignerName: { not: null },
              rbtSigned: true,
              rbtSignedAt: { not: null },
              rbtSignerName: { not: null },
              bcbaSigned: false,
              bcbaSignedAt: null,
              bcbaSignerName: null,
              isConverted: false,
              billableUnits: { gt: 0 },
              checklistSnapshot: {
                equals: note.checklistSnapshot as Prisma.InputJsonValue,
              },
              structuredContent: {
                path: ['submissionFingerprint'],
                equals: item.expectedSubmissionFingerprint,
              },
              deficiencies: { none: { status: 'OPEN' } },
              session: {
                is: {
                  status: 'COMPLETED',
                  ...assignmentPredicate,
                },
              },
            },
            data: {
              bcbaSigned: true,
              bcbaSignedAt: signedAt,
              bcbaSignerName: signerName,
              structuredContent: structured as Prisma.InputJsonValue,
            },
          });
          if (updated.count !== 1) throw new Error(SESSION_NOTE_CONFLICT);

          await tx.auditLogVault.create({
            data: {
              userId: actor.id,
              action: 'SIGN',
              resourceType: 'SESSION_NOTE',
              resourceId: note.id,
              metadata: {
                event: 'BCBA_ESIGN',
                sessionId: note.sessionId,
                clientId: note.session.clientId,
                submissionFingerprint: item.expectedSubmissionFingerprint,
              },
            },
          });
        }

        return { actor, signerName, signedAt };
      },
      {
        isolationLevel: 'Serializable',
        maxWait: 10_000,
        timeout: 20_000,
      },
    );

    const credentialWarnings: string[] = [];
    try {
      const rbtIds = [
        ...new Set(
          notes
            .map((note) => note.session.rbt?.id)
            .filter((id): id is string => Boolean(id)),
        ),
      ];
      const checks = await Promise.all([
        getCredentialStatus(transactionResult.actor.id),
        ...rbtIds.map((id) => getCredentialStatus(id)),
      ]);
      for (const status of checks) {
        if (!status || status.overall === 'ACTIVE' || status.overall === 'NOT_TRACKED') continue;
        const who = status.displayName
          ? `${status.role === 'BCBA' ? 'Signing BCBA' : 'Session RBT'} ${status.displayName}`
          : status.role || 'Staff';
        credentialWarnings.push(
          `${who}: ${status.warnings.join(', ') || 'credential issue on file'}`,
        );
      }
    } catch {
      // Credential lookup is a soft post-commit warning.
    }

    try {
      const billers = await prisma.user.findMany({
        where: { role: { in: NOTE_READY_NOTIFICATION_ROLES }, isActive: true },
        select: { id: true },
        take: 20,
      });
      const clients = await prisma.client.findMany({
        where: { id: { in: clientIds } },
        select: { caseCoordinatorId: true },
      });
      const caseCoordinatorIds = clients
        .map((client) => client.caseCoordinatorId)
        .filter((id): id is string => Boolean(id));
      await notifyUsers({
        userIds: [...billers.map((biller) => biller.id), ...caseCoordinatorIds],
        title: 'Notes ready for Plutus tracker',
        message: `${notes.length} session note(s) BCBA-signed — eligible for manual claims handoff.`,
        type: 'NOTE_READY_FOR_PLUTUS',
        linkUrl: '/notes?queue=ready',
        dedupeHours: 4,
      });

      const rbtIds = [
        ...new Set(
          notes
            .map((note) => note.session.rbt?.id)
            .filter(
              (id): id is string =>
                Boolean(id) && id !== transactionResult.actor.id,
            ),
        ),
      ];
      await notifyUsers({
        userIds: rbtIds,
        title: 'Session note BCBA-signed',
        message: `${transactionResult.signerName} e-signed your session note(s) — payroll hold released. See your Pay tab.`,
        type: 'NOTE_BCBA_SIGNED',
        linkUrl: '/rbt/payroll',
        dedupeHours: 6,
      });
    } catch (error) {
      console.error(
        'Action post-commit notification failed [signSessionNotesAsBcba]:',
        error instanceof Error ? error.message : 'Unknown error',
      );
    }

    revalidatePath('/', 'layout');
    revalidatePath('/notes');
    revalidatePath('/portal-clinical/daily');
    revalidatePath('/portal-clinical/notes');
    revalidatePath('/portal-clinical');
    for (const clientId of clientIds) revalidatePath(`/client/${clientId}`);

    return {
      success: true as const,
      signedCount: notes.length,
      skippedCount: 0,
      skippedIds: [] as string[],
      clientIds,
      plutusReady: true as const,
      ...(credentialWarnings.length > 0 ? { credentialWarnings } : {}),
    };
  } catch (error) {
    if (error instanceof Error && error.message === ACTOR_NOT_ACTIVE) {
      return {
        success: false as const,
        code: 'ACTOR_NOT_ACTIVE' as const,
        error: 'Your active BCBA staff identity changed before signing. Sign in again.',
      };
    }
    if (
      (error instanceof Error && error.message === SESSION_NOTE_CONFLICT) ||
      isSerializationConflict(error)
    ) {
      return conflictResult();
    }
    console.error(
      'Action failed [signSessionNotesAsBcba]:',
      error instanceof Error ? error.message : 'Unknown error',
    );
    return {
      success: false as const,
      code: 'BCBA_SIGN_FAILED' as const,
      error: 'The signature and its critical audit did not commit. No note was signed.',
    };
  }
}

export async function signSingleSessionNoteAsBcba(expectation: BcbaSignExpectation) {
  return signSessionNotesAsBcba([expectation]);
}
