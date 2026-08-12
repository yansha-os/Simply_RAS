'use server';

import { prisma } from '@repo/db';
import { LEADERSHIP_ROLES, requireStaff } from '@/lib/auth-guard';
import { writeAuditLog } from '@/lib/auditLog';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const QUEUE_PREVIEW_LIMIT = 10;

export type OpsDepartmentMetrics = {
  totalClients: number;
  activeClients: number;
  activeClientShare: number | null;
  intakeSubmittedPackets: number;
  intakeSubmittedOver48h: number;
  billingAwaitingVob: number;
  billingExpiringPas: number;
  paApprovalRate: number | null;
  paAdjudicatedCount: number;
  clinicalAwaitingReports: number;
  caseCoordStaffingPending: number;
  caseCoordOpenActionItems: number;
  agedUnconvertedNotes: number;
};

export type OpsAgedSessionNote = {
  id: string;
  createdAt: string;
  rbtSigned: boolean;
  parentSigned: boolean;
  bcbaSigned: boolean;
  session: {
    id: string;
    scheduledStart: string;
    client: {
      id: string;
      firstName: string;
      lastName: string;
    };
  };
};

export type OpsAtRiskAuthorization = {
  id: string;
  expirationDate: string;
  client: {
    id: string;
    firstName: string;
    lastName: string;
    insurancePayer: string | null;
  };
};

export type OpsDashboardData = {
  generatedAt: string;
  scope: {
    agedNoteCutoff: string;
    paRiskWindowEnd: string;
    queuePreviewLimit: number;
  };
  metrics: OpsDepartmentMetrics;
  monthlyNewClients: Array<{ label: string; value: number }>;
  agedSessionNotes: OpsAgedSessionNote[];
  atRiskAuthorizations: OpsAtRiskAuthorization[];
};

export type OpsDashboardResult =
  | { success: true; data: OpsDashboardData }
  | { success: false; error: string };

function percent(part: number, whole: number): number | null {
  if (whole === 0) return null;
  return Math.round((part / whole) * 1000) / 10;
}

function monthWindows(now: Date) {
  return Array.from({ length: 7 }, (_, index) => {
    const monthsAgo = 6 - index;
    const start = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsAgo, 1)
    );
    const end = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsAgo + 1, 1)
    );

    return {
      start,
      end,
      label: new Intl.DateTimeFormat('en-US', {
        month: 'short',
        timeZone: 'UTC',
      }).format(start),
    };
  });
}

export async function getOpsDepartmentMetrics(): Promise<OpsDashboardResult> {
  const gate = await requireStaff(LEADERSHIP_ROLES);
  if (!gate.ok) return { success: false, error: gate.error };

  try {
    const now = new Date();
    const agedNoteCutoff = new Date(now.getTime() - 48 * HOUR_MS);
    const paRiskWindowEnd = new Date(now.getTime() + 45 * DAY_MS);
    const months = monthWindows(now);
    const agedNoteWhere = {
      isConverted: false,
      createdAt: { lte: agedNoteCutoff },
    } as const;
    const expiringPaWhere = {
      status: 'APPROVED' as const,
      expirationDate: {
        gte: now,
        lte: paRiskWindowEnd,
      },
    };

    const [
      totalClients,
      activeClients,
      intakeSubmittedPackets,
      intakeSubmittedOver48h,
      billingAwaitingVob,
      billingExpiringPas,
      clinicalAwaitingReports,
      caseCoordStaffingPending,
      caseCoordOpenActionItems,
      agedUnconvertedNotes,
      paApprovedCount,
      paAdjudicatedCount,
      agedSessionNotesRaw,
      atRiskAuthorizationsRaw,
      monthlyNewClientCounts,
    ] = await Promise.all([
      prisma.client.count(),
      prisma.client.count({ where: { status: 'ACTIVE' } }),
      prisma.intakePacket.count({ where: { status: 'SUBMITTED' } }),
      prisma.intakePacket.count({
        where: {
          status: 'SUBMITTED',
          updatedAt: { lte: agedNoteCutoff },
        },
      }),
      prisma.client.count({ where: { status: 'CLINICAL_REVIEW_APPROVED' } }),
      prisma.pARequest.count({ where: expiringPaWhere }),
      prisma.client.count({ where: { status: 'ASSESSMENT_SCHEDULED' } }),
      prisma.client.count({ where: { status: 'STAFFING_PENDING' } }),
      prisma.actionItem.count({
        where: {
          status: { in: ['OPEN', 'IN_PROGRESS'] },
          assignee: { role: 'CASE_COORDINATOR' },
        },
      }),
      prisma.sessionNote.count({ where: agedNoteWhere }),
      prisma.pARequest.count({ where: { status: 'APPROVED' } }),
      prisma.pARequest.count({
        where: {
          status: {
            in: ['APPROVED', 'DENIED_CLERICAL', 'DENIED_CLINICAL'],
          },
        },
      }),
      prisma.sessionNote.findMany({
        where: agedNoteWhere,
        select: {
          id: true,
          createdAt: true,
          rbtSigned: true,
          parentSigned: true,
          bcbaSigned: true,
          session: {
            select: {
              id: true,
              scheduledStart: true,
              client: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'asc' },
        take: QUEUE_PREVIEW_LIMIT,
      }),
      prisma.pARequest.findMany({
        where: expiringPaWhere,
        select: {
          id: true,
          expirationDate: true,
          client: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              insurancePayer: true,
            },
          },
        },
        orderBy: { expirationDate: 'asc' },
        take: QUEUE_PREVIEW_LIMIT,
      }),
      Promise.all(
        months.map(({ start, end }) =>
          prisma.client.count({
            where: { createdAt: { gte: start, lt: end } },
          })
        )
      ),
    ]);

    const agedSessionNotes: OpsAgedSessionNote[] = agedSessionNotesRaw.map(
      (note) => ({
        ...note,
        createdAt: note.createdAt.toISOString(),
        session: {
          ...note.session,
          scheduledStart: note.session.scheduledStart.toISOString(),
        },
      })
    );

    const atRiskAuthorizations: OpsAtRiskAuthorization[] =
      atRiskAuthorizationsRaw.flatMap((authorization) =>
        authorization.expirationDate
          ? [
              {
                ...authorization,
                expirationDate: authorization.expirationDate.toISOString(),
              },
            ]
          : []
      );

    return {
      success: true,
      data: {
        generatedAt: now.toISOString(),
        scope: {
          agedNoteCutoff: agedNoteCutoff.toISOString(),
          paRiskWindowEnd: paRiskWindowEnd.toISOString(),
          queuePreviewLimit: QUEUE_PREVIEW_LIMIT,
        },
        metrics: {
          totalClients,
          activeClients,
          activeClientShare: percent(activeClients, totalClients),
          intakeSubmittedPackets,
          intakeSubmittedOver48h,
          billingAwaitingVob,
          billingExpiringPas,
          paApprovalRate: percent(paApprovedCount, paAdjudicatedCount),
          paAdjudicatedCount,
          clinicalAwaitingReports,
          caseCoordStaffingPending,
          caseCoordOpenActionItems,
          agedUnconvertedNotes,
        },
        monthlyNewClients: months.map((month, index) => ({
          label: month.label,
          value: monthlyNewClientCounts[index] ?? 0,
        })),
        agedSessionNotes,
        atRiskAuthorizations,
      },
    };
  } catch (error) {
    console.error(
      'getOpsDepartmentMetrics failed:',
      error instanceof Error ? error.message : 'Unknown error'
    );
    return {
      success: false,
      error: 'Operations data is unavailable. Please try again.',
    };
  }
}

export async function logOpsAuditReportExport(input: {
  generatedAt: string;
}): Promise<{ success: boolean; error?: string }> {
  const gate = await requireStaff(LEADERSHIP_ROLES);
  if (!gate.ok) return { success: false, error: gate.error };

  try {
    const generatedAt = new Date(input.generatedAt);
    if (Number.isNaN(generatedAt.getTime())) {
      return { success: false, error: 'The report snapshot is invalid. Refresh and try again.' };
    }

    await writeAuditLog({
      actorUserId: gate.user.id,
      action: 'EXPORT',
      entityType: 'OPS_AUDIT_REPORT',
      entityId: generatedAt.toISOString(),
      meta: {
        event: 'OPS_AUDIT_REPORT_PRINT_EXPORT',
        report: 'operations-command-center',
        snapshotGeneratedAt: generatedAt.toISOString(),
      },
    });

    return { success: true };
  } catch (error) {
    console.error(
      'logOpsAuditReportExport failed:',
      error instanceof Error ? error.message : 'Unknown error'
    );
    return { success: false, error: 'Unable to prepare the report export. Please try again.' };
  }
}
