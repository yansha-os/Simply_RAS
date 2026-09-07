'use server';

import type { ClaimOutcome, Role } from '@repo/db';
import { revalidatePath } from 'next/cache';

import {
  evaluateAuthUnitHardStop,
  type AuthUnitHardStop,
} from '@/lib/billing/authUnits';
import { scrubNoteForConvert } from '@/lib/billing/noteClaimScrub';
import {
  countClaimStatuses,
  deriveClaimWorkflowStatus,
  type ClaimOutcomeValue,
  type ClaimWorkflowStatus,
} from '@/lib/clientClaimsEngine';
import {
  hasBlockingScrubDefects,
  type ClaimScrubResult,
} from '@/lib/claimScrubberEngine';
import {
  SESSION_NOTES_CONVERSION_ROLES,
  SESSION_NOTES_ROLES,
  requireClientAccess,
  requireStaff,
} from '@/lib/auth-guard';
import { evaluateCredentialHardStop } from '@/lib/staffCredentials';
import { getCredentialStatus } from '@/lib/staffCredentials.server';
import { extractSubmissionFingerprint } from '@repo/db/session-note-attestation';
import { prisma } from '@/lib/prisma';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const CLIENT_CLAIMS_NOTE_INCLUDE = {
  session: {
    include: {
      client: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          status: true,
          insurancePayer: true,
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
    select: { id: true },
  },
} as const;

export type ClientClaimRow = {
  id: string;
  sessionId: string;
  status: ClaimWorkflowStatus;
  claimOutcome: ClaimOutcomeValue | null;
  dateOfService: string;
  cptCode: string | null;
  billableUnits: number | null;
  rbtSigned: boolean;
  parentSigned: boolean;
  bcbaSigned: boolean;
  rbtName: string | null;
  bcbaName: string | null;
  plutusClaimRef: string | null;
  convertedAt: string | null;
  updatedAt: string;
  expectedNoteUpdatedAt: string;
  expectedSubmissionFingerprint: string | null;
  openDeficiencyCount: number;
  scrubWarnings: string[];
  authUnitStop: AuthUnitHardStop | null;
  convertBlockers: string[];
};

export type ClientClaimsListPayload = {
  rows: ClientClaimRow[];
  statusCounts: ReturnType<typeof countClaimStatuses>;
  canConvert: boolean;
};

function staffDisplayName(
  user: { firstName: string; lastName: string } | null | undefined,
): string | null {
  if (!user) return null;
  return [user.firstName, user.lastName].filter(Boolean).join(' ') || null;
}

function resolveDateOfService(session: {
  actualStart: Date | null;
  scheduledStart: Date;
}): string {
  const date = session.actualStart ?? session.scheduledStart;
  return date.toISOString();
}

/**
 * Per-client claims work surface — flat rows with PA-style workflow status.
 * Distinct from the global /portal-billing/claims triage kanban.
 */
export async function getClientClaimsList(
  clientId: string,
): Promise<
  | { success: true; data: ClientClaimsListPayload }
  | { success: false; error: string }
> {
  const access = await requireClientAccess(clientId);
  if (!access.ok) return { success: false, error: access.error };

  const roleGate = await requireStaff(SESSION_NOTES_ROLES);
  if (!roleGate.ok) return { success: false, error: roleGate.error };

  const canConvert = SESSION_NOTES_CONVERSION_ROLES.includes(
    roleGate.user.role as Role,
  );

  try {
    const notes = await prisma.sessionNote.findMany({
      where: {
        session: { clientId },
        rbtSigned: true,
      },
      include: CLIENT_CLAIMS_NOTE_INCLUDE,
      orderBy: { updatedAt: 'desc' },
      take: 200,
    });

    const readyNotes = notes.filter((n) => n.bcbaSigned && !n.isConverted);
    const authUnitByNoteId = new Map<string, AuthUnitHardStop>();
    const scrubByNoteId = new Map<string, ClaimScrubResult>();
    const blockersByNoteId = new Map<string, string[]>();

    if (readyNotes.length > 0) {
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

      for (const note of readyNotes) {
        const session = note.session;
        if (!session) continue;

        authUnitByNoteId.set(
          note.id,
          evaluateAuthUnitHardStop({
            clientId,
            targetSessionId: session.id,
            authorizations,
            paRequests,
            sessions: ledgerSessions,
          }),
        );

        const scrub = scrubNoteForConvert({
          id: note.id,
          billableUnits: note.billableUnits,
          rbtSigned: note.rbtSigned,
          bcbaSigned: note.bcbaSigned,
          parentSigned: note.parentSigned,
          isConverted: note.isConverted,
          deficiencies: note.deficiencies,
          session: {
            id: session.id,
            clientId: session.clientId,
            cptCode: session.cptCode,
            status: session.status,
            scheduledStart: session.scheduledStart,
            scheduledEnd: session.scheduledEnd,
            actualStart: session.actualStart,
            actualEnd: session.actualEnd,
            placeOfServiceCode: session.placeOfServiceCode,
            rbtId: session.rbtId,
            bcbaId: session.bcbaId,
            client: {
              firstName: session.client.firstName,
              lastName: session.client.lastName,
              primaryDiagnosisCode: session.client.primaryDiagnosisCode,
              insurancePayer: session.client.insurancePayer,
              authorizations: session.client.authorizations,
            },
          },
        });
        scrubByNoteId.set(note.id, scrub);

        const blockers: string[] = [];
        if (hasBlockingScrubDefects(scrub)) {
          blockers.push(
            ...scrub.defects
              .filter((d) => d.severity === 'BLOCKING')
              .map((d) => d.message),
          );
        }

        const [rbtStatus, bcbaStatus] = await Promise.all([
          session.rbtId ? getCredentialStatus(session.rbtId) : null,
          session.bcbaId ? getCredentialStatus(session.bcbaId) : null,
        ]);
        const credentialVerdict = evaluateCredentialHardStop({
          clientStatus: session.client.status,
          rbtStatus,
          bcbaStatus,
        });
        if (!credentialVerdict.ok) blockers.push(...credentialVerdict.blockers);
        if (blockers.length > 0) blockersByNoteId.set(note.id, blockers);
      }
    }

    const rows: ClientClaimRow[] = notes.map((note) => {
      const session = note.session!;
      const scrub = scrubByNoteId.get(note.id);
      const scrubWarnings =
        scrub?.defects
          .filter((d) => d.severity !== 'BLOCKING')
          .map((d) => d.message) ?? [];

      return {
        id: note.id,
        sessionId: session.id,
        status: deriveClaimWorkflowStatus({
          rbtSigned: note.rbtSigned,
          bcbaSigned: note.bcbaSigned,
          isConverted: note.isConverted,
          claimOutcome: note.claimOutcome as ClaimOutcomeValue | null,
        }),
        claimOutcome: (note.claimOutcome as ClaimOutcomeValue | null) ?? null,
        dateOfService: resolveDateOfService(session),
        cptCode: session.cptCode,
        billableUnits: note.billableUnits,
        rbtSigned: note.rbtSigned,
        parentSigned: note.parentSigned,
        bcbaSigned: note.bcbaSigned,
        rbtName: staffDisplayName(session.rbt),
        bcbaName: staffDisplayName(session.bcba),
        plutusClaimRef: note.plutusClaimRef,
        convertedAt: note.convertedAt?.toISOString() ?? null,
        updatedAt: note.updatedAt.toISOString(),
        expectedNoteUpdatedAt: note.updatedAt.toISOString(),
        expectedSubmissionFingerprint: extractSubmissionFingerprint(
          note.structuredContent,
        ),
        openDeficiencyCount: note.deficiencies.length,
        scrubWarnings,
        authUnitStop: authUnitByNoteId.get(note.id) ?? null,
        convertBlockers: blockersByNoteId.get(note.id) ?? [],
      };
    });

    rows.sort(
      (a, b) =>
        new Date(b.dateOfService).getTime() - new Date(a.dateOfService).getTime(),
    );

    return {
      success: true,
      data: {
        rows,
        statusCounts: countClaimStatuses(
          notes.map((n) => ({
            rbtSigned: n.rbtSigned,
            bcbaSigned: n.bcbaSigned,
            isConverted: n.isConverted,
            claimOutcome: n.claimOutcome as ClaimOutcomeValue | null,
          })),
        ),
        canConvert,
      },
    };
  } catch (error) {
    console.error(
      'Action failed [getClientClaimsList]:',
      error instanceof Error ? error.message : 'Unknown error',
    );
    return { success: false, error: 'Could not load claims for this client.' };
  }
}

export async function updateClaimOutcome(
  noteId: string,
  outcome: ClaimOutcome,
): Promise<{ success: true } | { success: false; error: string }> {
  const gate = await requireStaff(SESSION_NOTES_CONVERSION_ROLES);
  if (!gate.ok) return { success: false, error: gate.error };

  const allowed: ClaimOutcome[] = ['APPROVED', 'DENIED_CLERICAL', 'DENIED_CLINICAL'];
  if (!UUID_RE.test(noteId) || !allowed.includes(outcome)) {
    return { success: false, error: 'Invalid claim outcome.' };
  }

  try {
    const note = await prisma.sessionNote.findUnique({
      where: { id: noteId },
      include: {
        session: { select: { clientId: true } },
      },
    });
    if (!note) return { success: false, error: 'Session note not found.' };
    if (!note.isConverted) {
      return {
        success: false,
        error: 'Claim must be submitted (filed) before recording payer outcome.',
      };
    }

    const access = await requireClientAccess(note.session.clientId);
    if (!access.ok) return { success: false, error: access.error };

    const updated = await prisma.sessionNote.updateMany({
      where: {
        id: noteId,
        isConverted: true,
        claimOutcome: note.claimOutcome,
        updatedAt: note.updatedAt,
      },
      data: { claimOutcome: outcome },
    });
    if (updated.count !== 1) {
      return {
        success: false,
        error: 'The claim changed in another session. Refresh and try again.',
      };
    }

    revalidatePath(`/client/${note.session.clientId}`);
    revalidatePath('/portal-billing/claims');

    return { success: true };
  } catch (error) {
    console.error(
      'Action failed [updateClaimOutcome]:',
      error instanceof Error ? error.message : 'Unknown error',
    );
    return { success: false, error: 'Could not update claim outcome.' };
  }
}
