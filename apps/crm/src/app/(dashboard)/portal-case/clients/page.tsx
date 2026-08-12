import React from 'react';
import { prisma } from '@/lib/prisma';
import IntakeQueue from '@/components/portal-case/IntakeQueue';
import { INTAKE_ROLES, requirePersistedStaff } from '@/lib/auth-guard';
import { notFound } from 'next/navigation';

export default async function IntakeClientsPage() {
  const access = await requirePersistedStaff(INTAKE_ROLES);
  if (!access.ok) notFound();

  const clients = await prisma.client.findMany({
    select: {
      id: true,
      firstName: true,
      lastName: true,
      guardianName: true,
      status: true,
      caseCoordinatorId: true,
      updatedAt: true,
      messages: {
        where: { isFromClient: true, readAt: null },
        select: { isFromClient: true, readAt: true },
      },
    },
    orderBy: { updatedAt: 'desc' },
  });

  const coordinators = await prisma.user.findMany({
    where: { role: 'CASE_COORDINATOR', isActive: true },
    select: { id: true, firstName: true, lastName: true },
  });

  return (
    <div className="p-8">
      <IntakeQueue clients={clients} coordinators={coordinators} />
    </div>
  );
}
