import React from 'react';
import { prisma } from '@/lib/prisma';
import CaseCoordClientsView from '@/components/portal-case-coord/CaseCoordClientsView';
import { CASE_COORD_ROLES, requirePersistedStaff } from '@/lib/auth-guard';
import { notFound } from 'next/navigation';

type StatusFilter = 'ALL' | 'STAFFING_PENDING' | 'ACTIVE';

function parseStatusFilter(value: string | string[] | undefined): StatusFilter {
  if (value === undefined) return 'ALL';
  if (value === 'ALL' || value === 'STAFFING_PENDING' || value === 'ACTIVE') return value;
  notFound();
}

export default async function CaseCoordClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string | string[] }>;
}) {
  const access = await requirePersistedStaff(CASE_COORD_ROLES);
  if (!access.ok) notFound();

  const sp = await searchParams.catch(() => notFound());
  const initialStatus = parseStatusFilter(sp.status);

  const [allClients, coordinators] = await Promise.all([
    prisma.client.findMany({
      select: {
        id: true,
        firstName: true,
        lastName: true,
        guardianName: true,
        status: true,
        caseCoordinatorId: true,
        rbtId: true,
        rbtApproved: true,
        bcba: { select: { firstName: true, lastName: true } },
        rbt: { select: { firstName: true, lastName: true, email: true } },
      },
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.user.findMany({
      where: { role: 'CASE_COORDINATOR', isActive: true },
      select: { id: true, firstName: true, lastName: true },
    }),
  ]);

  return (
    <CaseCoordClientsView
      coordinators={coordinators}
      allClients={allClients}
      initialStatusFilter={initialStatus}
    />
  );
}
