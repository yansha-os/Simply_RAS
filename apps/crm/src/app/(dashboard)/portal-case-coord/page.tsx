import React from 'react';
import { prisma } from '@/lib/prisma';
import CaseCoordDashboard from '@/components/portal-case-coord/CaseCoordDashboard';
import { CASE_COORD_ROLES, requirePersistedStaff } from '@/lib/auth-guard';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

const PENDING_APP_STATUSES = [
  'APPLIED',
  'MESSAGING',
  'MEET_SCHEDULED',
  'PARENT_PENDING',
] as const;

export default async function CaseCoordPortalPage() {
  const access = await requirePersistedStaff(CASE_COORD_ROLES);
  if (!access.ok) notFound();

  const [
    allClients,
    coordinators,
    openOpeningsCount,
    pendingAppsCount,
  ] = await Promise.all([
    prisma.client.findMany({
      select: {
        id: true,
        firstName: true,
        lastName: true,
        status: true,
        caseCoordinatorId: true,
        rbtId: true,
        rbtApproved: true,
      },
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.user.findMany({
      where: { role: 'CASE_COORDINATOR', isActive: true },
      select: { id: true, firstName: true, lastName: true },
    }),
    prisma.caseOpening.count({ where: { status: 'OPEN' } }),
    prisma.caseApplication.count({
      where: { status: { in: [...PENDING_APP_STATUSES] } },
    }),
  ]);

  const staffingPendingCount = allClients.filter((c) => c.status === 'STAFFING_PENDING').length;
  const activeCount = allClients.filter((c) => c.status === 'ACTIVE').length;
  const meetAndGreetsPending = allClients.filter((c) => c.rbtId && !c.rbtApproved).length;
  const dashboardClients = allClients.map((client) => ({ ...client, guardianName: null }));

  return (
    <CaseCoordDashboard
      coordinators={coordinators}
      allClients={dashboardClients}
      metrics={{
        staffingPending: staffingPendingCount,
        openOpenings: openOpeningsCount,
        pendingApps: pendingAppsCount,
        activeCases: activeCount,
        meetAndGreetsPending,
        totalCaseload: allClients.length,
      }}
    />
  );
}
