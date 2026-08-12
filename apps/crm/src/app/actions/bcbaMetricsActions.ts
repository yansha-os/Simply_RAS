'use server';

import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';

const DIRECTOR_ROLES = new Set(['CLINICAL_DIRECTOR', 'CEO', 'OPS_DIRECTOR']);

export type BcbaOpsClientRow = {
  id: string;
  firstName: string;
  lastName: string;
  status: string;
  guardianName: string | null;
  bcbaId: string | null;
  bcba: { id: string; firstName: string; lastName: string } | null;
};

export type BcbaOpsUnsignedPreview = {
  noteId: string;
  sessionId: string;
  clientId: string;
  clientName: string;
  scheduledStart: string;
  cptCode: string | null;
  rbtName: string | null;
};

export type BcbaOpsLoadRow = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  activeCount: number;
  assignedCount: number;
};

export type BcbaOpsMetrics = {
  activeCaseload: number;
  unsignedNotes: number;
  sessionsAwaitingSign: number;
  readyForPlutus: number;
  p2pAlerts: number;
  assessmentPrep: number;
  txPlansInProgress: number;
  activeClients: BcbaOpsClientRow[];
  unsignedPreviews: BcbaOpsUnsignedPreview[];
  txPlanClients: BcbaOpsClientRow[];
  p2pClients: BcbaOpsClientRow[];
  bcbaLoads: BcbaOpsLoadRow[];
  viewerRole: string;
  scopedToBcbaId: string | null;
  isDirector: boolean;
};

const EMPTY_METRICS: BcbaOpsMetrics = {
  activeCaseload: 0,
  unsignedNotes: 0,
  sessionsAwaitingSign: 0,
  readyForPlutus: 0,
  p2pAlerts: 0,
  assessmentPrep: 0,
  txPlansInProgress: 0,
  activeClients: [],
  unsignedPreviews: [],
  txPlanClients: [],
  p2pClients: [],
  bcbaLoads: [],
  viewerRole: 'BCBA',
  scopedToBcbaId: null,
  isDirector: false,
};

/**
 * Clinical ops visibility metrics for /portal-clinical.
 * Counts come from live Client / SessionNote rows — never seeded samples.
 */
export async function getBcbaOpsMetrics(): Promise<
  { success: true; metrics: BcbaOpsMetrics } | { success: false; error: string; metrics: BcbaOpsMetrics }
> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: 'Authentication required.', metrics: EMPTY_METRICS };
    }

    const isDirector = DIRECTOR_ROLES.has(String(user.role));
    const isMockImpersonation = user.id === 'mock-user-id';
    const scopeToBcba = !isDirector && !isMockImpersonation;
    const bcbaId = scopeToBcba ? user.id : null;

    const clientWhere = bcbaId ? { bcbaId } : {};
    const noteSessionScope = bcbaId
      ? { OR: [{ bcbaId }, { client: { bcbaId } }] }
      : undefined;

    const unsignedWhere = {
      rbtSigned: true as const,
      bcbaSigned: false as const,
      ...(noteSessionScope ? { session: noteSessionScope } : {}),
    };
    const readyWhere = {
      bcbaSigned: true as const,
      isConverted: false as const,
      ...(noteSessionScope ? { session: noteSessionScope } : {}),
    };

    const [
      activeCaseload,
      activeClientsRaw,
      pipelineClients,
      unsignedNotesCount,
      unsignedNotes,
      readyForPlutus,
      bcbas,
      allAssignedForLoad,
      selfAssignedCount,
    ] = await Promise.all([
      prisma.client.count({ where: { status: 'ACTIVE', ...clientWhere } }),
      prisma.client.findMany({
        where: { status: 'ACTIVE', ...clientWhere },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          status: true,
          guardianName: true,
          bcbaId: true,
          bcba: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { updatedAt: 'desc' },
        take: 12,
      }),
      prisma.client.findMany({
        where: {
          ...clientWhere,
          OR: [
            { status: { in: ['PA_SUBMITTED', 'PA_APPROVED', 'ASSESSMENT_SCHEDULED', 'REPORT_ASSEMBLED'] } },
            {
              paRequests: {
                some: { status: 'DENIED_CLINICAL', p2pResolved: false },
              },
            },
          ],
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          status: true,
          guardianName: true,
          bcbaId: true,
          bcba: { select: { id: true, firstName: true, lastName: true } },
          paRequests: {
            where: { status: 'DENIED_CLINICAL', p2pResolved: false },
            select: { id: true },
          },
        },
        orderBy: { updatedAt: 'desc' },
        take: 80,
      }),
      prisma.sessionNote.count({ where: unsignedWhere }),
      prisma.sessionNote.findMany({
        where: unsignedWhere,
        select: {
          id: true,
          session: {
            select: {
              id: true,
              cptCode: true,
              scheduledStart: true,
              client: { select: { id: true, firstName: true, lastName: true } },
              rbt: { select: { firstName: true, lastName: true } },
            },
          },
        },
        orderBy: [{ rbtSignedAt: 'asc' }, { createdAt: 'asc' }],
        take: 8,
      }),
      prisma.sessionNote.count({ where: readyWhere }),
      prisma.user.findMany({
        where: { role: 'BCBA', isActive: true },
        select: { id: true, firstName: true, lastName: true, email: true },
        orderBy: { lastName: 'asc' },
      }),
      isDirector
        ? prisma.client.findMany({
            where: { bcbaId: { not: null } },
            select: { id: true, bcbaId: true, status: true },
          })
        : Promise.resolve([] as { id: string; bcbaId: string | null; status: string }[]),
      bcbaId ? prisma.client.count({ where: { bcbaId } }) : Promise.resolve(0),
    ]);

    const mapClient = (c: {
      id: string;
      firstName: string;
      lastName: string;
      status: string;
      guardianName: string | null;
      bcbaId: string | null;
      bcba: { id: string; firstName: string; lastName: string } | null;
    }): BcbaOpsClientRow => ({
      id: c.id,
      firstName: c.firstName,
      lastName: c.lastName,
      status: c.status,
      guardianName: c.guardianName,
      bcbaId: c.bcbaId,
      bcba: c.bcba,
    });

    const assessmentPrep = pipelineClients.filter((c) =>
      ['PA_SUBMITTED', 'PA_APPROVED'].includes(c.status)
    );
    const txPlanClients = pipelineClients.filter((c) =>
      ['ASSESSMENT_SCHEDULED', 'REPORT_ASSEMBLED'].includes(c.status)
    );
    const p2pClients = pipelineClients.filter((c) => (c.paRequests?.length ?? 0) > 0);

    const unsignedPreviews: BcbaOpsUnsignedPreview[] = unsignedNotes.map((n) => ({
      noteId: n.id,
      sessionId: n.session.id,
      clientId: n.session.client.id,
      clientName: `${n.session.client.firstName} ${n.session.client.lastName}`,
      scheduledStart: n.session.scheduledStart.toISOString(),
      cptCode: n.session.cptCode,
      rbtName: n.session.rbt
        ? `${n.session.rbt.firstName} ${n.session.rbt.lastName}`
        : null,
    }));

    let bcbaLoads: BcbaOpsLoadRow[] = bcbas.map((b) => {
      const assigned = allAssignedForLoad.filter((c) => c.bcbaId === b.id);
      return {
        id: b.id,
        firstName: b.firstName,
        lastName: b.lastName,
        email: b.email,
        assignedCount: assigned.length,
        activeCount: assigned.filter((c) => c.status === 'ACTIVE').length,
      };
    });

    if (!isDirector && bcbaId && !isMockImpersonation) {
      const self = bcbas.find((b) => b.id === bcbaId);
      bcbaLoads = self
        ? [
            {
              id: self.id,
              firstName: self.firstName,
              lastName: self.lastName,
              email: self.email,
              activeCount: activeCaseload,
              assignedCount: selfAssignedCount,
            },
          ]
        : [];
    }

    const metrics: BcbaOpsMetrics = {
      activeCaseload,
      unsignedNotes: unsignedNotesCount,
      sessionsAwaitingSign: unsignedNotesCount,
      readyForPlutus,
      p2pAlerts: p2pClients.length,
      assessmentPrep: assessmentPrep.length,
      txPlansInProgress: txPlanClients.length,
      activeClients: activeClientsRaw.map(mapClient),
      unsignedPreviews,
      txPlanClients: txPlanClients.map(mapClient),
      p2pClients: p2pClients.map(mapClient),
      bcbaLoads,
      viewerRole: String(user.role),
      scopedToBcbaId: bcbaId,
      isDirector,
    };

    return { success: true, metrics };
  } catch (error) {
    console.error(
      'Action failed [getBcbaOpsMetrics]:',
      error instanceof Error ? error.message : 'Unknown error'
    );
    return {
      success: false,
      error: 'Failed to load clinical ops metrics.',
      metrics: EMPTY_METRICS,
    };
  }
}
