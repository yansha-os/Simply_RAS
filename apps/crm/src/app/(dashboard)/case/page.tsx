import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { prisma } from '@/lib/prisma';
import CasePipelineClient from '@/components/case/CasePipelineClient';
import { CLIENT_STATUS_PIPELINE, STATUS_GUIDANCE } from '@/lib/clientStatusGates';
import { CASE_COORD_ROLES, requireStaff } from '@/lib/auth-guard';
import { notFound } from 'next/navigation';

export default async function CaseCoordinatorDashboard() {
  const access = await requireStaff(CASE_COORD_ROLES);
  if (!access.ok) notFound();

  // Step 6: Clients with APPROVED Treatment Auth, but not yet ACTIVE.
  // Oldest updatedAt first so the most stalled cases surface at the top.
  const staffingQueue = await prisma.client.findMany({
    where: {
      status: 'STAFFING_PENDING',
      authorizations: {
        some: { type: 'TREATMENT', status: 'APPROVED' }
      }
    },
    include: {
      authorizations: true
    },
    orderBy: { updatedAt: 'asc' }
  });

  // Step 8: notes missing a signature this board can actually collect
  // (parent / BCBA — RBT signing happens in the RBT portal, not here).
  const missingSigs = await prisma.sessionNote.findMany({
    where: {
      OR: [
        { parentSigned: false },
        { bcbaSigned: false }
      ]
    },
    include: { session: { include: { client: true } } },
    orderBy: { session: { scheduledStart: 'asc' } }
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

  // Full-pipeline stage counts — every ClientStatus renders here, so no status
  // can sit invisible even though this board only actions STAFFING_PENDING.
  const statusGroups = await prisma.client.groupBy({
    by: ['status'],
    _count: { _all: true }
  });
  const countsByStatus = new Map(statusGroups.map((g) => [g.status as string, g._count._all]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-heading font-bold">Case Coordination</h1>
        <p className="text-slate-500">Manage staffing, signatures, and case records.</p>
      </div>

      {/* Pipeline overview — canonical spine from clientStatusGates */}
      <div className="rounded-xl border border-white/10 bg-zinc-950/80 backdrop-blur-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-heading font-semibold text-white">Pipeline Overview</h2>
          <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">All stages · live counts</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {CLIENT_STATUS_PIPELINE.map((status) => {
            const count = countsByStatus.get(status) ?? 0;
            const isActionable = status === 'STAFFING_PENDING';
            return (
              <div
                key={status}
                title={`${STATUS_GUIDANCE[status].title} — ${STATUS_GUIDANCE[status].nextAction}`}
                className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 transition-all duration-300 ${
                  isActionable
                    ? 'border-teal-500/40 bg-teal-500/10'
                    : count > 0
                      ? 'border-white/10 bg-white/5 hover:border-white/20'
                      : 'border-white/5 bg-transparent opacity-50'
                }`}
              >
                <span className={`text-[10px] font-mono uppercase tracking-wide ${isActionable ? 'text-teal-300' : 'text-zinc-400'}`}>
                  {STATUS_GUIDANCE[status].title}
                </span>
                <span className={`text-xs font-bold font-mono ${count > 0 ? 'text-white' : 'text-zinc-600'}`}>
                  {count}
                </span>
              </div>
            );
          })}
        </div>
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
      />
    </div>
  );
}
