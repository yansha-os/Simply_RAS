'use server';

import { extractSubmissionFingerprint } from '@repo/db/session-note-attestation';

import { prisma } from '@/lib/prisma';
import type { Role } from '@repo/db';
import { writeAuditLogs } from '@/lib/auditLog';
import { summarizeSessionNoteForQueue, type NoteModalityCounts } from '@/lib/sessionNoteSummary';
import { requireStaff } from '@/lib/auth-guard';

export type BcbaUnsignedNoteItem = {
  id: string;
  clinicalContent: string | null;
  billableUnits: number | null;
  rbtSignedAt: string | null;
  rbtSignerName: string | null;
  checklistPassed: boolean | null;
  createdAt: string;
  updatedAt: string;
  submissionFingerprint: string | null;
  /** Rich preview from structuredContent (falls back to clinical prose) */
  summaryPreview: string;
  goalsAddressed: string | null;
  objectiveData: string | null;
  interventions: string[];
  modalitySummaryLine: string | null;
  modalityCounts: NoteModalityCounts | null;
  session: {
    id: string;
    cptCode: string | null;
    location: string | null;
    placeOfServiceCode: string | null;
    scheduledStart: string;
    scheduledEnd: string;
    client: {
      id: string;
      firstName: string;
      lastName: string;
      status: string;
      bcbaId: string | null;
    };
    rbt: {
      id: string;
      firstName: string;
      lastName: string;
    } | null;
    bcba: {
      id: string;
      firstName: string;
      lastName: string;
    } | null;
  };
};

const DIRECTOR_ROLES = new Set(['CLINICAL_DIRECTOR', 'CEO', 'OPS_DIRECTOR']);
const BCBA_QUEUE_ROLES = [
  'BCBA',
  'CLINICAL_DIRECTOR',
  'CEO',
  'OPS_DIRECTOR',
] satisfies Role[];

function checklistPassedFromSnapshot(snapshot: unknown): boolean | null {
  if (!snapshot || typeof snapshot !== 'object') return null;
  const passed = (snapshot as { passed?: unknown }).passed;
  return typeof passed === 'boolean' ? passed : null;
}

/**
 * List SessionNotes awaiting BCBA co-sign for the signed-in BCBA's caseload
 * (Client.bcbaId or Session.bcbaId). Directors see the full agency queue.
 * Does not mutate signature / isConverted fields.
 *
 * `options.recordView` (default true) writes AuditLogVault VIEW rows for the
 * sign-page load (gap 12). Badge/count polling must pass false to avoid spam.
 */
export async function listBcbaUnsignedNotes(options?: { recordView?: boolean }) {
  const actorGate = await requireStaff(BCBA_QUEUE_ROLES);
  if (!actorGate.ok) {
    return {
      success: false as const,
      error: actorGate.error,
      notes: [] as BcbaUnsignedNoteItem[],
      count: 0,
    };
  }
  const user = actorGate.user;

  try {
    const isDirector = DIRECTOR_ROLES.has(String(user.role));
    const scopeToBcba = !isDirector;

    const notes = await prisma.sessionNote.findMany({
      where: {
        rbtSigned: true,
        bcbaSigned: false,
        ...(scopeToBcba
          ? {
              session: {
                OR: [{ bcbaId: user.id }, { client: { bcbaId: user.id } }],
              },
            }
          : {}),
      },
      include: {
        session: {
          include: {
            client: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                status: true,
                bcbaId: true,
              },
            },
            rbt: { select: { id: true, firstName: true, lastName: true } },
            bcba: { select: { id: true, firstName: true, lastName: true } },
          },
        },
      },
      orderBy: [{ rbtSignedAt: 'asc' }, { createdAt: 'asc' }],
      take: 200,
    });

    const items: BcbaUnsignedNoteItem[] = notes.map((n) => {
      const summary = summarizeSessionNoteForQueue(n.structuredContent, n.clinicalContent);
      return {
        id: n.id,
        clinicalContent: n.clinicalContent,
        billableUnits: n.billableUnits,
        rbtSignedAt: n.rbtSignedAt?.toISOString() ?? null,
        rbtSignerName: n.rbtSignerName,
        checklistPassed: checklistPassedFromSnapshot(n.checklistSnapshot),
        createdAt: n.createdAt.toISOString(),
        updatedAt: n.updatedAt.toISOString(),
        submissionFingerprint: extractSubmissionFingerprint(n.structuredContent),
        summaryPreview: summary.preview,
        goalsAddressed: summary.goalsAddressed,
        objectiveData: summary.objectiveData,
        interventions: summary.interventions,
        modalitySummaryLine: summary.modalitySummaryLine,
        modalityCounts: summary.modalityCounts,
        session: {
          id: n.session.id,
          cptCode: n.session.cptCode,
          location: n.session.location,
          placeOfServiceCode: n.session.placeOfServiceCode,
          scheduledStart: n.session.scheduledStart.toISOString(),
          scheduledEnd: n.session.scheduledEnd.toISOString(),
          client: n.session.client,
          rbt: n.session.rbt,
          bcba: n.session.bcba,
        },
      };
    });

    // PHI access audit (gap 12): staff viewed these notes on the sign queue.
    if (options?.recordView !== false && items.length > 0) {
      await writeAuditLogs(
        items.map((n) => ({
          actorUserId: user.id,
          action: 'VIEW',
          entityType: 'SESSION_NOTE',
          entityId: n.id,
          meta: {
            event: 'BCBA_SIGN_QUEUE_VIEW',
            sessionId: n.session.id,
            clientId: n.session.client.id,
          },
        }))
      );
    }

    return {
      success: true as const,
      notes: items,
      count: items.length,
      scopedToBcbaId: scopeToBcba ? user.id : null,
      viewerRole: String(user.role),
    };
  } catch (error) {
    console.error(
      'Action failed [listBcbaUnsignedNotes]:',
      error instanceof Error ? error.message : 'Unknown error'
    );
    return {
      success: false as const,
      error: 'Failed to load unsigned notes queue.',
      notes: [] as BcbaUnsignedNoteItem[],
      count: 0,
    };
  }
}

export async function countBcbaUnsignedNotes() {
  try {
    // Count only — never writes VIEW audit rows (badge polling)
    const result = await listBcbaUnsignedNotes({ recordView: false });
    if (!result.success) {
      return { success: false as const, error: result.error, count: 0 };
    }
    return { success: true as const, count: result.count };
  } catch (error) {
    console.error(
      'Action failed [countBcbaUnsignedNotes]:',
      error instanceof Error ? error.message : 'Unknown error'
    );
    return { success: false as const, error: 'Failed to count unsigned notes.', count: 0 };
  }
}
