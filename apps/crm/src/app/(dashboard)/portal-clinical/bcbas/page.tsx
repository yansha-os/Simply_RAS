import React from 'react';
import { prisma } from '@/lib/prisma';
import BcbaDashboard from '@/components/portal-clinical/BcbaDashboard';

export const dynamic = 'force-dynamic';

export default async function BcbaClientsPage() {
  // Fetch clients that are in the BCBA phases, staffing pending, or have a pending P2P alert
  const clients = await prisma.client.findMany({
    where: {
      OR: [
        { status: { in: ['STAFFING_PENDING', 'PA_SUBMITTED', 'PA_APPROVED', 'ASSESSMENT_SCHEDULED', 'REPORT_ASSEMBLED', 'TX_PA_SUBMITTED', 'TX_PA_APPROVED', 'ACTIVE'] } },
        { paRequests: { some: { status: 'DENIED_CLINICAL', p2pResolved: false } } }
      ]
    },
    include: {
      intakePacket: true,
      paRequests: true,
      messages: true,
      bcba: true,
      rbt: true,
      caseCoordinator: true,
    },
    orderBy: {
      updatedAt: 'asc'
    }
  });

  const allBcbas = await prisma.user.findMany({
    where: { role: 'BCBA', isActive: true },
    select: { id: true, firstName: true, lastName: true }
  });

  return (
    <div className="flex-1 p-8 overflow-y-auto">
      <div className="max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white font-heading tracking-wide">BCBA Portal &amp; Caseload</h1>
          <p className="text-zinc-400 mt-1 text-sm font-sans">Manage BCBA Assignments, Assessment Prep, Treatment Plans, and Peer-to-Peer alerts.</p>
        </div>
        
        <BcbaDashboard clients={clients} bcbas={allBcbas} />
      </div>
    </div>
  );
}
