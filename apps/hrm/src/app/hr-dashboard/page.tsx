import React from 'react';
import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { isDevToolsEnabled } from '@/lib/devToolsGate';
import HrAgentAnalyticsView from '@/components/hrm/HrAgentAnalyticsView';
import { Users, UserCheck, ArrowRight, BarChart3, FlaskConical } from 'lucide-react';

export const dynamic = 'force-dynamic';

/**
 * HrAgentAnalyticsView is a design prototype with fabricated KPIs and fake
 * interview rows. It is dev-gated so mock numbers are never presented as real
 * (readiness audit Blocker 3). Production shows real headcounts and routes
 * into the live ATS pipeline.
 */
export default async function HrDashboardPage() {
  if (isDevToolsEnabled()) {
    return <HrAgentAnalyticsView />;
  }

  const [candidateCount, activeRbtCount] = await Promise.all([
    prisma.atsCandidate.count(),
    prisma.user.count({ where: { role: 'RBT', isActive: true } }),
  ]);

  return (
    <div className="space-y-8 text-white pb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-zinc-950 p-6 sm:p-8 rounded-3xl border border-white/10 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-brand-orange-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10">
          <div className="flex items-center gap-2 text-brand-orange-400 font-mono text-xs font-bold uppercase tracking-wider mb-2">
            <BarChart3 className="w-4 h-4" /> HR Dashboard
          </div>
          <h1 className="text-3xl sm:text-4xl font-black text-white font-heading tracking-tight">
            HR Agent Operations
          </h1>
          <p className="text-xs sm:text-sm text-zinc-400 mt-1 max-w-2xl">
            Live recruiting happens in the ATS candidate pipeline. Aggregate recruitment
            analytics aren&apos;t wired to live data yet.
          </p>
        </div>
        <div className="relative z-10">
          <Link
            href="/ats"
            className="inline-flex items-center gap-2 bg-brand-orange-500 hover:bg-brand-orange-600 text-white font-black text-xs px-5 h-11 rounded-2xl shadow-lg transition-all cursor-pointer"
          >
            <Users className="w-4 h-4" /> Go to ATS Candidate Pipeline
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="p-6 bg-zinc-950/80 backdrop-blur-xl border border-white/10 rounded-2xl shadow-xl hover:border-brand-orange-500/40 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs text-brand-orange-400 font-extrabold uppercase tracking-wider">
              ATS Candidates
            </span>
            <Users className="w-5 h-5 text-brand-orange-400" />
          </div>
          <h3 className="text-3xl font-black text-white mt-2">{candidateCount}</h3>
          <p className="text-[11px] text-zinc-400 mt-1 font-medium">Total candidates in the pipeline</p>
        </div>

        <div className="p-6 bg-zinc-950/80 backdrop-blur-xl border border-white/10 rounded-2xl shadow-xl hover:border-brand-orange-500/40 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs text-emerald-400 font-extrabold uppercase tracking-wider">
              Active RBTs
            </span>
            <UserCheck className="w-5 h-5 text-emerald-400" />
          </div>
          <h3 className="text-3xl font-black text-white mt-2">{activeRbtCount}</h3>
          <p className="text-[11px] text-zinc-400 mt-1 font-medium">Hired and active technicians</p>
        </div>
      </div>

      <div className="flex items-center justify-center gap-2 text-[11px] font-mono text-zinc-500 pt-2">
        <FlaskConical className="w-3.5 h-3.5" />
        <span>The full analytics prototype is available in dev environments only.</span>
      </div>
    </div>
  );
}
