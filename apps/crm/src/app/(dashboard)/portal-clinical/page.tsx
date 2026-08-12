import React from 'react';
import { prisma } from '@/lib/prisma';
import BcbaMetricsDashboard from '@/components/portal-clinical/BcbaMetricsDashboard';
import { getBcbaOpsMetrics } from '@/app/actions/bcbaMetricsActions';
import {
  CLINICAL_ROLES,
  LEADERSHIP_ROLES,
  requirePersistedStaff,
} from '@/lib/auth-guard';
import { notFound } from 'next/navigation';

export default async function ClinicalPortalPage() {
  const access = await requirePersistedStaff(CLINICAL_ROLES);
  if (!access.ok) notFound();

  const canManageAgency = LEADERSHIP_ROLES.some((role) => role === access.user.role);
  const [{ metrics }, bcbas] = await Promise.all([
    getBcbaOpsMetrics(),
    canManageAgency
      ? prisma.user.findMany({
          where: { role: 'BCBA', isActive: true },
          select: { id: true, firstName: true, lastName: true, email: true },
          orderBy: { lastName: 'asc' },
        })
      : Promise.resolve([]),
  ]);

  return (
    <div className="p-8">
      <BcbaMetricsDashboard metrics={metrics} bcbas={bcbas} />
    </div>
  );
}
