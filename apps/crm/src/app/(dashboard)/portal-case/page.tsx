import React from 'react';
import { prisma } from '@/lib/prisma';
import IntakeDashboard from '@/components/portal-case/IntakeDashboard';
import { INTAKE_ROLES, requirePersistedStaff } from '@/lib/auth-guard';
import { notFound } from 'next/navigation';

export default async function CasePortalPage() {
  const access = await requirePersistedStaff(INTAKE_ROLES);
  if (!access.ok) notFound();

  const clients = await prisma.client.findMany({
    select: { status: true },
    orderBy: { updatedAt: 'desc' },
  });

  return (
    <div className="p-8">
      <IntakeDashboard clients={clients} />
    </div>
  );
}
