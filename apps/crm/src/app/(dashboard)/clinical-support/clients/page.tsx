import React from 'react';
import { prisma } from '@/lib/prisma';
import ClinicalSupportDashboard from '@/components/clinical-support/ClinicalSupportDashboard';
import {
  CLINICAL_SUPPORT_QUEUE_STATUSES,
} from '@/components/clinical-support/clinicalSupportWorkflow';
import { CLINICAL_ROLES, requireStaff } from '@/lib/auth-guard';
import { ShieldAlert } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function ClinicalSupportClientsPage() {
  const auth = await requireStaff(CLINICAL_ROLES);
  if (!auth.ok) {
    return (
      <div className="p-8">
        <div className="mx-auto max-w-2xl rounded-3xl border border-rose-500/20 bg-zinc-950/80 p-8 text-center shadow-2xl backdrop-blur-xl">
          <ShieldAlert className="mx-auto h-10 w-10 text-rose-400" />
          <h1 className="mt-4 font-heading text-2xl font-bold text-white">
            Clinical Support access required
          </h1>
          <p className="mt-2 text-sm text-zinc-400">{auth.error}</p>
        </div>
      </div>
    );
  }

  const clients = await prisma.client.findMany({
    where: {
      status: { in: [...CLINICAL_SUPPORT_QUEUE_STATUSES] },
      ...(auth.user.role === 'BCBA' ? { bcbaId: auth.user.id } : {}),
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      status: true,
      bcbaId: true,
      updatedAt: true,
      treatmentPlan: true,
      intakePacket: { select: { status: true } },
      bcba: { select: { firstName: true, lastName: true } },
    },
    orderBy: { updatedAt: 'asc' },
  });

  return (
    <div className="flex-1 overflow-y-auto p-6 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-cyan-500/20 bg-cyan-500/10 px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-cyan-300">
            Live operational queue
          </div>
          <h1 className="font-heading text-3xl font-bold tracking-tight text-white">
            Clinical Support Queue
          </h1>
          <p className="mt-1 text-sm text-zinc-400">
            Verify intake handoffs, schedule 97151 assessments in ET, assemble signed
            reports, and route treatment packets to Billing.
          </p>
        </div>

        <ClinicalSupportDashboard clients={clients} view="queue" />
      </div>
    </div>
  );
}
