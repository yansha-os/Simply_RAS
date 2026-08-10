'use server';

import { prisma } from '@repo/db';

export async function getOpsDepartmentMetrics() {
  try {
    const [
      totalClients,
      intakePendingDocs,
      billingPendingVob,
      billingExpiringPas,
      clinicalPendingReports,
      caseCoordActionItems,
      agedSessions,
      activeClientsCount
    ] = await Promise.all([
      prisma.client.count(),
      prisma.intakePacket.count({ where: { status: 'SUBMITTED' } }),
      prisma.pARequest.count({ where: { vobCompleted: false } }),
      prisma.pARequest.count({
        where: {
          status: 'APPROVED',
          expirationDate: {
            lte: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000)
          }
        }
      }),
      prisma.client.count({ where: { status: 'ASSESSMENT_SCHEDULED' } }),
      prisma.actionItem.count({ where: { status: 'OPEN' } }),
      prisma.sessionNote.findMany({
        where: {
          isConverted: false,
          createdAt: {
            lte: new Date(Date.now() - 48 * 60 * 60 * 1000)
          }
        },
        include: {
          session: {
            include: {
              client: true
            }
          }
        },
        take: 10
      }),
      prisma.client.count({ where: { status: 'ACTIVE' } })
    ]);

    return {
      success: true,
      metrics: {
        totalClients,
        intakePendingDocs,
        billingPendingVob,
        billingExpiringPas,
        clinicalPendingReports,
        caseCoordActionItems,
        agedSessions,
        activeClientsCount
      }
    };
  } catch (error: any) {
    console.error('Error fetching Ops metrics:', error);
    return {
      success: false,
      error: error.message || 'Failed to fetch Ops department metrics'
    };
  }
}
