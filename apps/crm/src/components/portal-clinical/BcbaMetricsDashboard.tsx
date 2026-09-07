'use client';

import React from 'react';
import Link from 'next/link';
import {
  Stethoscope,
  ShieldAlert,
  ClipboardCheck,
  FileText,
  Users,
  Activity,
  ArrowRight,
  Clock,
  Send,
  PenTool,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import type { BcbaOpsMetrics } from '@/app/actions/bcbaMetricsActions';
import { SupervisionComplianceDashboard } from './SupervisionComplianceDashboard';

interface BcbaMetricsDashboardProps {
  metrics: BcbaOpsMetrics;
}

function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  accent,
  href,
}: {
  label: string;
  value: number;
  hint: string;
  icon: React.ElementType;
  accent: string;
  href: string;
}) {
  const zero = value === 0;
  return (
    <Link
      href={href}
      className={`group block p-5 bg-[#FFFDF8] dark:bg-zinc-950/80 border border-[#E2D5B7] dark:border-white/10 backdrop-blur-xl rounded-2xl shadow-md space-y-2 transition-all duration-300 hover:scale-[1.01] hover:shadow-xl cursor-pointer ${accent}`}
    >
      <div className="flex justify-between items-center text-slate-500 dark:text-zinc-400 text-[11px] font-mono tracking-wide">
        <span>{label}</span>
        <Icon className="w-4 h-4 opacity-80 group-hover:opacity-100" />
      </div>
      <div className="flex items-end justify-between gap-2">
        <div
          className={`text-3xl font-extrabold font-mono tabular-nums ${
            zero ? 'text-slate-400 dark:text-zinc-500' : 'text-slate-900 dark:text-white'
          }`}
        >
          {value}
        </div>
        <ArrowRight className="w-4 h-4 text-slate-400 dark:text-zinc-600 group-hover:text-brand-orange-500 dark:group-hover:text-brand-orange-400 transition-colors mb-1" />
      </div>
      <div className="text-[11px] text-slate-600 dark:text-zinc-500 font-sans leading-snug">{hint}</div>
      {zero && (
        <div className="text-[10px] font-mono text-slate-400 dark:text-zinc-600 pt-0.5">No items in queue</div>
      )}
    </Link>
  );
}

export default function BcbaMetricsDashboard({ metrics }: BcbaMetricsDashboardProps) {
  const isDirector = metrics.isDirector;

  return (
    <div className="space-y-8 animate-fade-in-up">
      {/* Hero */}
      <div className="relative overflow-hidden p-8 rounded-3xl bg-[#FFFDF8] dark:bg-zinc-950/80 border border-[#E2D5B7] dark:border-white/10 shadow-xl backdrop-blur-2xl">
        <div className="absolute top-0 right-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-10 w-96 h-96 bg-brand-orange-500/8 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-700 dark:text-cyan-400 font-mono text-[11px] font-bold">
              <span className="dot-live" />
              <span>
                {isDirector ? 'CLINICAL DIRECTOR COMMAND CENTER' : 'BCBA CLINICAL WORKSTATION'}
              </span>
            </div>

            <h1 className="text-3xl lg:text-4xl font-extrabold text-slate-900 dark:text-white font-heading tracking-tight leading-tight">
              Clinical Operations{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-600 via-teal-500 to-brand-orange-500 dark:from-cyan-400 dark:via-teal-300 dark:to-brand-orange-300">
                Visibility
              </span>
            </h1>

            <p className="text-sm text-slate-600 dark:text-zinc-400 max-w-2xl font-sans leading-relaxed">
              Live caseload, unsigned session notes, and claim-ready counts from the database
              {metrics.scopedToBcbaId ? ' (your caseload)' : ' (agency-wide)'}. Empty means zero
              matching rows — not sample data.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 shrink-0">
            <Link
              href="/portal-clinical/bcbas"
              className="bg-gradient-to-r from-cyan-500 to-teal-600 hover:from-cyan-600 hover:to-teal-700 text-white font-bold text-xs px-5 h-11 rounded-2xl shadow-[0_0_20px_rgba(6,182,212,0.3)] transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              <Users className="w-4 h-4" />
              View clinical queue
            </Link>
            <Link
              href="/portal-clinical/daily?tab=esign"
              className="bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white font-bold text-xs px-5 h-11 rounded-2xl shadow-[0_0_20px_rgba(245,158,11,0.25)] transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              <PenTool className="w-4 h-4" />
              Daily Workstation
              {metrics.unsignedNotes > 0 && (
                <span className="font-mono bg-black/25 px-2 py-0.5 rounded-lg">
                  {metrics.unsignedNotes}
                </span>
              )}
            </Link>
          </div>
        </div>
      </div>

      {/* KPI grid — all deep-linked */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard
          label="ACTIVE CASELOAD"
          value={metrics.activeCaseload}
          hint="Clients in ACTIVE status under supervision"
          icon={Users}
          accent="hover:border-cyan-500/40"
          href="/portal-clinical/bcbas"
        />
        <KpiCard
          label="UNSIGNED NOTES"
          value={metrics.unsignedNotes}
          hint="RBT signed · awaiting BCBA co-sign"
          icon={FileText}
          accent="hover:border-amber-500/40"
          href="/portal-clinical/daily?tab=esign"
        />
        <KpiCard
          label="SESSIONS AWAITING SIGN"
          value={metrics.sessionsAwaitingSign}
          hint="Same queue — open Daily Workstation e-sign hub"
          icon={Clock}
          accent="hover:border-orange-500/40"
          href="/portal-clinical/daily?tab=esign"
        />
        <KpiCard
          label="READY TO BILL"
          value={metrics.readyForPlutus}
          hint="BCBA signed · not yet marked converted"
          icon={Send}
          accent="hover:border-emerald-500/40"
          href="/portal-billing/claims?queue=ready"
        />
      </div>

      {/* Secondary pipeline KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard
          label="P2P ALERTS"
          value={metrics.p2pAlerts}
          hint="Denied clinical PA · peer-to-peer unresolved"
          icon={ShieldAlert}
          accent="hover:border-rose-500/40"
          href="/portal-clinical/bcbas"
        />
        <KpiCard
          label="ASSESSMENT PREP"
          value={metrics.assessmentPrep}
          hint="PA submitted / approved — evaluation stage"
          icon={ClipboardCheck}
          accent="hover:border-amber-500/40"
          href="/portal-clinical/bcbas"
        />
        <KpiCard
          label="TX PLANS IN PROGRESS"
          value={metrics.txPlansInProgress}
          hint="Assessment scheduled or report assembled"
          icon={Stethoscope}
          accent="hover:border-purple-500/40"
          href="/portal-clinical/bcbas"
        />
      </div>

      {/* Supervision utilization heuristic (97155 vs 97153 minutes) */}
      <SupervisionComplianceDashboard />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <Card className="p-6 bg-[#FFFDF8] dark:bg-zinc-950/80 border border-[#E2D5B7] dark:border-white/10 backdrop-blur-xl rounded-3xl shadow-xl space-y-4">
            <div className="flex justify-between items-center border-b border-[#E2D5B7] dark:border-white/10 pb-4">
              <h3 className="text-base font-bold text-slate-900 dark:text-white font-heading flex items-center gap-2">
                <Activity className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                BCBA caseload balance
              </h3>
              <span className="text-xs font-mono text-slate-500 dark:text-zinc-400">
                {metrics.bcbaLoads.length} listed
              </span>
            </div>

            <div className="space-y-3">
              {metrics.bcbaLoads.map((bcba) => (
                <div
                  key={bcba.id}
                  className="p-3.5 bg-[#F9F5EC] dark:bg-zinc-900/40 border border-[#E2D5B7] dark:border-white/5 rounded-2xl flex justify-between items-center shadow-sm"
                >
                  <div className="min-w-0">
                    <h4 className="font-bold text-slate-900 dark:text-white text-xs truncate">
                      {bcba.firstName} {bcba.lastName}
                    </h4>
                    <p className="text-[11px] text-slate-500 dark:text-zinc-400 font-sans truncate">{bcba.email}</p>
                  </div>
                  <div className="text-right font-mono shrink-0 pl-2">
                    <span className="text-sm font-bold text-cyan-600 dark:text-cyan-400">{bcba.activeCount}</span>
                    <span className="text-[10px] text-slate-500 dark:text-zinc-500 block">
                      active / {bcba.assignedCount} assigned
                    </span>
                  </div>
                </div>
              ))}

              {metrics.bcbaLoads.length === 0 && (
                <div className="p-6 text-center text-xs text-slate-500 dark:text-zinc-500 border border-dashed border-[#E2D5B7] dark:border-white/10 rounded-2xl bg-[#FFFDF8]/90 dark:bg-zinc-950/40 shadow-sm">
                  No active BCBAs registered in the system.
                </div>
              )}
            </div>
          </Card>
        </div>

        <Card className="p-5 bg-[#FFFDF8] dark:bg-zinc-950/80 border border-[#E2D5B7] dark:border-white/10 backdrop-blur-xl rounded-3xl shadow-xl space-y-3">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white font-heading">Work happens here</h3>
          <p className="text-xs text-slate-500 dark:text-zinc-500">
            This dashboard is statistics only. Assign BCBAs, review charts, and sign notes on the queue routes.
          </p>
          <div className="flex flex-col gap-2">
            <QuickLink href="/portal-clinical/bcbas" label="Clinical / BCBA queue" />
            <QuickLink href="/portal-clinical/daily" label="Daily workstation" />
            <QuickLink href="/portal-clinical/review" label="Clinical review" />
            <QuickLink href="/portal-billing/claims?queue=ready" label="Session Claims → Ready to Bill" />
          </div>
        </Card>
      </div>
    </div>
  );
}

function QuickLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-[#F9F5EC] dark:bg-zinc-900/50 border border-[#E2D5B7] dark:border-white/5 hover:border-brand-orange-500/40 text-xs text-slate-700 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-white transition-all duration-300 cursor-pointer group shadow-sm"
    >
      <span>{label}</span>
      <ArrowRight className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-600 group-hover:text-brand-orange-500 dark:group-hover:text-brand-orange-400" />
    </Link>
  );
}
