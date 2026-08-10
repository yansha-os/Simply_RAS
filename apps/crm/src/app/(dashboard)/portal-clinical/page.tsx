import React from 'react';
import { prisma } from '@/lib/prisma';
import BcbaMetricsDashboard from '@/components/portal-clinical/BcbaMetricsDashboard';

export default async function ClinicalPortalPage() {
  const allClients = await prisma.client.findMany({
    include: {
      paRequests: true,
      messages: true,
      bcba: true,
    },
    orderBy: { updatedAt: 'desc' }
  });

  const bcbas = await prisma.user.findMany({
    where: { role: 'BCBA', isActive: true },
    select: { id: true, firstName: true, lastName: true, email: true }
  });

  return (
    <div className="p-8">
      <BcbaMetricsDashboard clients={allClients} bcbas={bcbas} />
    </div>
  );
}
