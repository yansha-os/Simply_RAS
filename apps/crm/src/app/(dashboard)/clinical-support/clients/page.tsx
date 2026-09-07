import React from 'react';
import { prisma } from '@/lib/prisma';
import ClinicalSupportClient from '@/components/clinical-support/ClinicalSupportClient';
import {
  buildClinicalSupportQueues,
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

  const queues = buildClinicalSupportQueues(clients);

  return (
    <div className="p-8">
      <div className="space-y-4 animate-fade-in-up">
        <div>
          <h2 className="font-heading text-2xl font-bold text-white">
            Clinical Support Queue
          </h2>
          <p className="mt-0.5 text-xs text-zinc-400">
            Triage lanes only — open each client profile to complete handoffs. Cards never
            mutate workflow state.
          </p>
        </div>

        <ClinicalSupportClient queues={queues} />
      </div>
    </div>
  );
}
