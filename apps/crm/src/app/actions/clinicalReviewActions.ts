'use server';

import type { Role } from '@repo/db';
import { prisma } from '@/lib/prisma';
import {
  CLINICAL_ROLES,
  LEADERSHIP_ROLES,
  requirePersistedStaff,
} from '@/lib/auth-guard';

export type ClinicalReviewKind = 'PACKET_REVIEW' | 'UNSIGNED_NOTE' | 'DEFICIENCY';

export type ClinicalReviewQueueItem = {
  id: string;
  kind: ClinicalReviewKind;
  priority: number;
  clientId: string;
  clientFirstName: string;
  clientLastName: string;
  clientStatus: string;
  title: string;
  detail: string;
  updatedAt: string;
  href: string;
  secondaryHref?: string;
  secondaryLabel?: string;
  meta?: {
    packetId?: string;
    sessionId?: string;
    noteId?: string;
    deficiencyId?: string;
    diagnosticEvalUploaded?: boolean;
    physicianRxUploaded?: boolean;
    insuranceReady?: boolean;
    formsReady?: boolean;
  };
};

const EMPTY_COUNTS = { packet: 0, unsigned: 0, deficiency: 0, total: 0 };

/**
 * Leadership and Clinical Support operate the agency-wide triage queue.
 * BCBAs are the only CLINICAL_ROLES actors with client-assignment scope.
 */
const GLOBAL_CLINICAL_REVIEW_ROLES: readonly Role[] = [
  ...LEADERSHIP_ROLES,
  'CLINICAL_SUPPORT',
];

function chartOrEmrHref(clientId: string, status: string) {
  if (status === 'ACTIVE') {
    return `/client/${clientId}?mode=bcba&tab=chart_progress`;
  }
  return `/client/${clientId}?mode=bcba&tab=session_emr`;
}

/**
 * Unified clinical review triage: intake packet reviews, open note deficiencies,
 * and BCBA-unsigned (RBT-signed) session notes. Read-only aggregation — no mutations.
 */
export async function listClinicalReviewQueue() {
  const access = await requirePersistedStaff(CLINICAL_ROLES);
  if (!access.ok) {
    return {
      success: false as const,
      accessDenied: true as const,
      error: 'Not found.',
      items: [] as ClinicalReviewQueueItem[],
      counts: EMPTY_COUNTS,
    };
  }

  const viewerRole = access.user.role as Role;
  const scopedToBcbaId = viewerRole === 'BCBA' ? access.user.id : null;
  const hasGlobalScope = GLOBAL_CLINICAL_REVIEW_ROLES.includes(viewerRole);

  // Fail closed if a future clinical role is added without an explicit scope policy.
  if (!scopedToBcbaId && !hasGlobalScope) {
    return {
      success: false as const,
      accessDenied: true as const,
      error: 'Not found.',
      items: [] as ClinicalReviewQueueItem[],
      counts: EMPTY_COUNTS,
    };
  }

  try {
    const [packetClients, openDeficiencies, unsignedNotes] = await Promise.all([
      prisma.client.findMany({
        where: {
          status: 'DOCS_APPROVED_INTAKE',
          ...(scopedToBcbaId ? { bcbaId: scopedToBcbaId } : {}),
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          status: true,
          intakePacket: {
            select: {
              id: true,
              intakeFormComplete: true,
              consentFormComplete: true,
              insuranceCardFrontUploaded: true,
              insuranceCardBackUploaded: true,
              diagnosticEvalUploaded: true,
              physicianRxUploaded: true,
              updatedAt: true,
            },
          },
        },
        orderBy: { updatedAt: 'asc' },
        take: 100,
      }),
      prisma.noteDeficiency.findMany({
        where: {
          status: 'OPEN',
          ...(scopedToBcbaId
            ? {
                note: {
                  session: {
                    client: { bcbaId: scopedToBcbaId },
                  },
                }
              }
            : {}),
        },
        select: {
          id: true,
          description: true,
          createdAt: true,
          note: {
            select: {
              id: true,
              session: {
                select: {
                  id: true,
                  client: {
                    select: {
                      id: true,
                      firstName: true,
                      lastName: true,
                      status: true,
                    },
                  },
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'asc' },
        take: 100,
      }),
      prisma.sessionNote.findMany({
        where: {
          rbtSigned: true,
          bcbaSigned: false,
          ...(scopedToBcbaId
            ? {
                session: {
                  client: { bcbaId: scopedToBcbaId },
                },
              }
            : {}),
        },
        select: {
          id: true,
          rbtSignedAt: true,
          createdAt: true,
          billableUnits: true,
          session: {
            select: {
              id: true,
              cptCode: true,
              scheduledStart: true,
              client: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  status: true,
                },
              },
            },
          },
        },
        orderBy: [{ rbtSignedAt: 'asc' }, { createdAt: 'asc' }],
        take: 100,
      }),
    ]);

    const items: ClinicalReviewQueueItem[] = [];

    for (const client of packetClients) {
      const packet = client.intakePacket;
      if (!packet) continue;
      const insuranceReady =
        packet.insuranceCardFrontUploaded && packet.insuranceCardBackUploaded;
      const formsReady = packet.intakeFormComplete && packet.consentFormComplete;
      items.push({
        id: `packet:${client.id}`,
        kind: 'PACKET_REVIEW',
        priority: 1,
        clientId: client.id,
        clientFirstName: client.firstName,
        clientLastName: client.lastName,
        clientStatus: client.status,
        title: 'Intake packet — clinical review',
        detail: 'Diagnostic eval / Rx and clinical docs need clinical sign-off before PA.',
        updatedAt: packet.updatedAt.toISOString(),
        href: `/client/${client.id}?mode=clinical`,
        secondaryHref: `/client/${client.id}?mode=clinical`,
        secondaryLabel: 'Open clinical review',
        meta: {
          packetId: packet.id,
          diagnosticEvalUploaded: packet.diagnosticEvalUploaded,
          physicianRxUploaded: packet.physicianRxUploaded,
          insuranceReady,
          formsReady,
        },
      });
    }

    for (const def of openDeficiencies) {
      const client = def.note.session.client;
      items.push({
        id: `def:${def.id}`,
        kind: 'DEFICIENCY',
        priority: 2,
        clientId: client.id,
        clientFirstName: client.firstName,
        clientLastName: client.lastName,
        clientStatus: client.status,
        title: 'Open chart deficiency',
        detail: def.description.slice(0, 180) || 'Flagged note deficiency awaiting resolution.',
        updatedAt: def.createdAt.toISOString(),
        href: chartOrEmrHref(client.id, client.status),
        secondaryHref: `/client/${client.id}?mode=bcba&tab=session_emr`,
        secondaryLabel: 'Session EMR',
        meta: {
          deficiencyId: def.id,
          noteId: def.note.id,
          sessionId: def.note.session.id,
        },
      });
    }

    for (const note of unsignedNotes) {
      const client = note.session.client;
      const when = note.session.scheduledStart
        ? new Date(note.session.scheduledStart).toLocaleDateString()
        : '—';
      const cpt = note.session.cptCode ? `CPT ${note.session.cptCode}` : 'Session note';
      items.push({
        id: `unsigned:${note.id}`,
        kind: 'UNSIGNED_NOTE',
        priority: 3,
        clientId: client.id,
        clientFirstName: client.firstName,
        clientLastName: client.lastName,
        clientStatus: client.status,
        title: 'BCBA co-sign required',
        detail: `${cpt} · ${when}${note.billableUnits != null ? ` · ${note.billableUnits} units` : ''}`,
        updatedAt: (note.rbtSignedAt ?? note.createdAt).toISOString(),
        href: chartOrEmrHref(client.id, client.status),
        secondaryHref: '/portal-clinical/daily?tab=esign',
        secondaryLabel: 'Unsigned notes queue',
        meta: {
          noteId: note.id,
          sessionId: note.session.id,
        },
      });
    }

    items.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
    });

    const counts = {
      packet: items.filter((i) => i.kind === 'PACKET_REVIEW').length,
      unsigned: items.filter((i) => i.kind === 'UNSIGNED_NOTE').length,
      deficiency: items.filter((i) => i.kind === 'DEFICIENCY').length,
      total: items.length,
    };

    return {
      success: true as const,
      items,
      counts,
      scopedToBcbaId,
      viewerRole,
    };
  } catch (error) {
    console.error(
      'Action failed [listClinicalReviewQueue]:',
      error instanceof Error ? error.message : 'Unknown error'
    );
    return {
      success: false as const,
      accessDenied: false as const,
      error: 'Unable to load clinical review queue.',
      items: [] as ClinicalReviewQueueItem[],
      counts: EMPTY_COUNTS,
    };
  }
}
