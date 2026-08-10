import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { prisma } from '@/lib/prisma';
import CasePipelineClient from '@/components/case/CasePipelineClient';

export default async function CaseCoordinatorDashboard() {
  // Step 6: Clients with APPROVED Treatment Auth, but not yet ACTIVE
  const staffingQueue = await prisma.client.findMany({
    where: {
      status: 'STAFFING_PENDING',
      authorizations: {
        some: { type: 'TREATMENT', status: 'APPROVED' }
      }
    },
    include: {
      authorizations: true
    }
  });

  // Fetch users for dropdowns
  const rbts = await prisma.user.findMany({ where: { role: 'RBT' } });
  const bcbas = await prisma.user.findMany({ where: { role: 'BCBA' } });

  // Missing signatures for Step 8 (placeholder query)
  const missingSigs = await prisma.sessionNote.findMany({
    where: {
      OR: [
        { parentSigned: false },
        { bcbaSigned: false },
        { rbtSigned: false }
      ]
    },
    include: { session: { include: { client: true } } }
  });

  const pendingOnboards = await prisma.rbtOnboarding.findMany({
    where: {
      OR: [
        { bacbVerified: false },
        { backgroundCleared: false },
        { trainingsComplete: false },
        { artemisAccountSetup: false },
        { payrollComplete: false },
        { payerCredentialed: false }
      ]
    },
    include: {
      client: true,
      rbt: true
    }
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-heading font-bold">Case Coordination</h1>
        <p className="text-slate-500">Manage staffing, signatures, and case records.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Pending Staffing</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-teal-600">{staffingQueue.length}</div>
            <p className="text-xs text-slate-500 mt-1">Needs RBT/BCBA</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">RBTs Onboarding</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">{pendingOnboards.length}</div>
            <p className="text-xs text-slate-500 mt-1">Action required</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Missing Signatures</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-500">{missingSigs.length}</div>
            <p className="text-xs text-slate-500 mt-1">Sessions blocked</p>
          </CardContent>
        </Card>
      </div>

      <CasePipelineClient 
        staffingQueue={staffingQueue} 
        missingSigs={missingSigs} 
        pendingOnboards={pendingOnboards}
        rbts={rbts} 
        bcbas={bcbas} 
      />
    </div>
  );
}
