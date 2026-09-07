'use client';

import React, { useTransition } from 'react';
import { Card } from '@/components/ui/Card';
import { FileText, ArrowRight, ClipboardCheck, Sparkles, ShieldAlert, Activity, UserPlus, UserCheck, Users, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { assignBcba } from '@/app/(dashboard)/portal-clinical/actions';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

type ClinicalDashboardClient = {
  id: string;
  firstName: string;
  lastName: string;
  guardianName: string | null;
  status: string;
  bcbaId: string | null;
  updatedAt: Date | string;
  paRequests: Array<{ status: string; p2pResolved: boolean }>;
  messages: Array<{ isFromClient: boolean; readAt: Date | string | null }>;
  rbt: { firstName: string; lastName: string } | null;
  caseCoordinator: { firstName: string; lastName: string } | null;
  authorizationExpiry: { daysRemaining: number; expiresOn: string } | null;
};

type BcbaOption = { id: string; firstName: string; lastName: string };

type QueueCardProps = {
  client: ClinicalDashboardClient;
  icon: LucideIcon;
  desc: string;
  mode?: string;
};

function QueueCard({ client, icon: Icon, desc, mode }: QueueCardProps) {
  const unreadCount = client.messages.filter((message) => message.isFromClient && !message.readAt).length;

  return (
    <Card className="bg-[#FFFDF8] dark:bg-zinc-950/80 backdrop-blur-xl border border-[#E2D5B7] dark:border-white/10 hover:border-cyan-500/50 transition-all duration-300 cursor-pointer group mb-3 shadow-md rounded-2xl overflow-hidden hover:scale-[1.01] hover:bg-white dark:hover:bg-zinc-900/60">
      <Link href={`/client/${client.id}${mode ? `?mode=${mode}` : ''}`} className="block p-4">
        <div className="flex justify-between items-start">
          <div className="space-y-1">
            <h4 className="font-bold text-slate-900 dark:text-white group-hover:text-cyan-600 dark:group-hover:text-cyan-400 transition-colors flex items-center gap-2 text-sm">
              {client.firstName} {client.lastName}
              {unreadCount > 0 && (
                <span className="bg-rose-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full text-center leading-none shadow-md animate-pulse">
                  {unreadCount} new
                </span>
              )}
            </h4>
            <p className="text-xs text-slate-600 dark:text-zinc-400 font-sans">{desc}</p>
          </div>
          <div className="w-8 h-8 rounded-xl bg-[#F9F5EC] dark:bg-zinc-900 border border-[#E2D5B7] dark:border-white/10 flex items-center justify-center text-slate-600 dark:text-zinc-400 group-hover:text-cyan-600 dark:group-hover:text-cyan-400 group-hover:border-cyan-500/30 transition-all shrink-0 ml-2 shadow-sm">
            <Icon className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between border-t border-[#E2D5B7]/60 dark:border-white/5 pt-3">
          <div className="text-[10px] text-slate-500 dark:text-zinc-500 font-mono uppercase font-bold tracking-wider">
            Updated {new Date(client.updatedAt).toLocaleDateString('en-US', { timeZone: 'UTC' })}
          </div>
          <ArrowRight className="w-4 h-4 text-slate-400 dark:text-zinc-500 group-hover:text-cyan-600 dark:group-hover:text-cyan-400 group-hover:translate-x-1 transition-all" />
        </div>
      </Link>
    </Card>
  );
}

export default function BcbaDashboard({ clients, bcbas }: { clients: ClinicalDashboardClient[]; bcbas?: BcbaOption[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // BCBA Queue Logic
  const needsBcbaQueue: ClinicalDashboardClient[] = [];
  const p2pQueue: ClinicalDashboardClient[] = [];
  const prepQueue: ClinicalDashboardClient[] = [];
  const txPlanQueue: ClinicalDashboardClient[] = [];
  for (const client of clients) {
    if (!client.bcbaId) needsBcbaQueue.push(client);
    else if (client.paRequests.some((pa) => pa.status === 'DENIED_CLINICAL' && !pa.p2pResolved)) p2pQueue.push(client);
    else if (client.status === 'PA_SUBMITTED' || client.status === 'PA_APPROVED') prepQueue.push(client);
    else if (client.status === 'ASSESSMENT_SCHEDULED') txPlanQueue.push(client);
  }

  const handleAssignBcba = (
    clientId: string,
    bcbaId: string,
    expectedBcbaId: string | null
  ) => {
    if (!bcbaId) return;
    startTransition(async () => {
      const res = await assignBcba({
        clientId,
        bcbaId,
        expectedBcbaId,
        reason: 'Clinical dashboard BCBA assignment',
      });
      if (res.success) {
        toast.success('BCBA successfully assigned to client!');
        router.refresh();
      } else {
        toast.error(res.error || 'Failed to assign BCBA');
      }
    });
  };

  const [viewMode, setViewMode] = React.useState<'queue' | 'caseload'>('queue');
  const [selectedBcbaId, setSelectedBcbaId] = React.useState<string>('');

  return (
    <div className="space-y-8 mt-6 pb-12 animate-fade-in-up">

      {/* Discoverability strip — clinical review + unsigned notes + goals */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Link
          href="/portal-clinical/review"
          className="flex-1 group relative overflow-hidden rounded-2xl border border-teal-500/30 dark:border-teal-500/20 bg-[#FFFDF8] dark:bg-teal-500/5 px-5 py-4 backdrop-blur-xl transition-all duration-300 hover:border-teal-500/50 hover:scale-[1.01] cursor-pointer shadow-sm"
        >
          <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-teal-500/10 blur-2xl" />
          <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-teal-600 dark:text-teal-400">Clinical triage</p>
          <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white font-heading">Clinical Review</p>
          <p className="mt-0.5 text-xs text-slate-600 dark:text-zinc-400">Packets, deficiencies, and co-sign work</p>
        </Link>
        <Link
          href="/portal-clinical/daily?tab=esign"
          className="flex-1 group relative overflow-hidden rounded-2xl border border-amber-500/30 dark:border-amber-500/20 bg-[#FFFDF8] dark:bg-amber-500/5 px-5 py-4 backdrop-blur-xl transition-all duration-300 hover:border-amber-500/50 hover:scale-[1.01] cursor-pointer shadow-sm"
        >
          <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-amber-500/10 blur-2xl" />
          <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">BCBA daily workflow</p>
          <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white font-heading">Daily Workstation</p>
          <p className="mt-0.5 text-xs text-slate-600 dark:text-zinc-400">E-sign, supervision evidence, and note deficiencies</p>
        </Link>
        <div className="flex-1 rounded-2xl border border-[#E2D5B7] dark:border-white/10 bg-[#FFFDF8] dark:bg-zinc-950/60 px-5 py-4 backdrop-blur-xl shadow-sm">
          <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-cyan-600 dark:text-cyan-400">Client profile</p>
          <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white font-heading">Clinical Goals · Session EMR</p>
          <p className="mt-0.5 text-xs text-slate-600 dark:text-zinc-400">Open a caseload client → tabs appear in the profile header</p>
        </div>
      </div>

      {/* Top Toggle & Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#FFFDF8] dark:bg-zinc-950/80 backdrop-blur-xl p-2 rounded-2xl border border-[#E2D5B7] dark:border-white/10 shadow-md">
        <div className="flex bg-[#F9F5EC] dark:bg-zinc-900 rounded-xl p-1 border border-[#E2D5B7] dark:border-transparent">
          <button
            onClick={() => setViewMode('queue')}
            className={`px-6 py-2 rounded-lg text-sm font-bold transition-all cursor-pointer ${viewMode === 'queue' ? 'bg-cyan-600 text-white shadow-md' : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white hover:bg-white dark:hover:bg-white/5'}`}
          >
            📊 Clinical Pipeline Queue
          </button>
          <button
            onClick={() => setViewMode('caseload')}
            className={`px-6 py-2 rounded-lg text-sm font-bold transition-all cursor-pointer ${viewMode === 'caseload' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white hover:bg-white dark:hover:bg-white/5'}`}
          >
            👥 My Active Caseload
          </button>
        </div>

        {viewMode === 'caseload' && (
          <div className="flex items-center gap-3 px-2">
            <span className="text-xs font-mono text-slate-600 dark:text-zinc-400 font-bold uppercase">Viewing Caseload For:</span>
            <select
              className="bg-white dark:bg-zinc-900 border border-[#E2D5B7] dark:border-white/10 rounded-xl px-4 py-2 text-sm text-slate-900 dark:text-white outline-none focus:border-emerald-500 cursor-pointer font-sans shadow-sm"
              value={selectedBcbaId}
              onChange={e => setSelectedBcbaId(e.target.value)}
            >
              <option value="">-- Select BCBA --</option>
              {bcbas?.map(b => (
                <option key={b.id} value={b.id}>
                  {b.firstName} {b.lastName}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {viewMode === 'queue' ? (
        /* 4 Clinical Queue Stage Columns */
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">

        {/* Column 1: P2P Action Required */}
        <div className="space-y-4">
          <div className="flex justify-between items-center px-1 border-b border-rose-500/20 pb-3">
            <h3 className="font-bold text-rose-600 dark:text-rose-400 text-sm flex items-center gap-2 font-heading">
              <ShieldAlert className="w-4 h-4 text-rose-500 dark:text-rose-400 animate-pulse" /> 1. P2P Action Required
            </h3>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
              {p2pQueue.length}
            </span>
          </div>

          <div>
            {p2pQueue.map(c => (
              <QueueCard
                key={c.id}
                client={c}
                icon={ShieldAlert}
                desc="Insurer requested BCBA Peer-to-Peer review conference call."
                mode="p2p"
              />
            ))}

            {p2pQueue.length === 0 && (
              <div className="p-8 text-center border border-dashed border-[#E2D5B7] dark:border-white/10 rounded-2xl bg-[#FFFDF8]/90 dark:bg-zinc-950/40 shadow-sm">
                <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-2xl border border-rose-500/20 bg-rose-500/10">
                  <ShieldAlert className="h-4 w-4 text-rose-500 dark:text-rose-400/70" />
                </div>
                <p className="text-xs font-semibold text-slate-700 dark:text-zinc-300">No P2P alerts</p>
                <p className="mt-1 text-[11px] text-slate-500 dark:text-zinc-500">
                  Denied clinical PAs needing peer-to-peer review land here.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Column 2: Assessment Prep */}
        <div className="space-y-4">
          <div className="flex justify-between items-center px-1 border-b border-amber-500/20 pb-3">
            <h3 className="font-bold text-amber-600 dark:text-amber-400 text-sm flex items-center gap-2 font-heading">
              <ClipboardCheck className="w-4 h-4 text-amber-500 dark:text-amber-400" /> 2. Assessment Prep Queue
            </h3>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
              {prepQueue.length}
            </span>
          </div>

          <div>
            {prepQueue.map(c => (
              <QueueCard
                key={c.id}
                client={c}
                icon={ClipboardCheck}
                desc="VOB verified. Prepare initial evaluation &amp; assessment date."
                mode="assessment_prep"
              />
            ))}

            {prepQueue.length === 0 && (
              <div className="p-8 text-center border border-dashed border-[#E2D5B7] dark:border-white/10 rounded-2xl bg-[#FFFDF8]/90 dark:bg-zinc-950/40 shadow-sm">
                <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-2xl border border-amber-500/20 bg-amber-500/10">
                  <ClipboardCheck className="h-4 w-4 text-amber-500 dark:text-amber-400/70" />
                </div>
                <p className="text-xs font-semibold text-slate-700 dark:text-zinc-300">No assessments to prep</p>
                <p className="mt-1 text-[11px] text-slate-500 dark:text-zinc-500">
                  Clients at PA submitted / approved appear here for evaluation prep.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Column 3: Treatment Plan Builder */}
        <div className="space-y-4">
          <div className="flex justify-between items-center px-1 border-b border-cyan-500/20 pb-3">
            <h3 className="font-bold text-cyan-600 dark:text-cyan-400 text-sm flex items-center gap-2 font-heading">
              <FileText className="w-4 h-4 text-cyan-500 dark:text-cyan-400" /> 3. Treatment Plan Builder
            </h3>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20">
              {txPlanQueue.length}
            </span>
          </div>

          <div>
            {txPlanQueue.map(c => (
              <QueueCard
                key={c.id}
                client={c}
                icon={FileText}
                desc="Assessment complete. Assemble treatment plan &amp; submit to Billing."
                mode="treatment_plan"
              />
            ))}

            {txPlanQueue.length === 0 && (
              <div className="p-8 text-center border border-dashed border-[#E2D5B7] dark:border-white/10 rounded-2xl bg-[#FFFDF8]/90 dark:bg-zinc-950/40 shadow-sm">
                <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-2xl border border-cyan-500/20 bg-cyan-500/10">
                  <FileText className="h-4 w-4 text-cyan-500 dark:text-cyan-400/70" />
                </div>
                <p className="text-xs font-semibold text-slate-700 dark:text-zinc-300">No plans in assembly</p>
                <p className="mt-1 text-[11px] text-slate-500 dark:text-zinc-500">
                  Clients with a scheduled assessment queue here for treatment plan build.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Column 4: Needs BCBA Assignment (Far Right) */}
        <div className="space-y-4">
          <div className="flex justify-between items-center px-1 border-b border-purple-500/20 pb-3">
            <h3 className="font-bold text-purple-600 dark:text-purple-400 text-sm flex items-center gap-2 font-heading">
              <UserPlus className="w-4 h-4 text-purple-500 dark:text-purple-400" /> 4. Needs BCBA Assignment
            </h3>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
              {needsBcbaQueue.length}
            </span>
          </div>

          <div className="space-y-3">
            {needsBcbaQueue.map(c => (
              <Card key={c.id} className="p-4 bg-[#FFFDF8] dark:bg-zinc-950/80 backdrop-blur-xl border border-[#E2D5B7] dark:border-white/10 hover:border-purple-500/50 transition-all shadow-md rounded-2xl space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-bold text-slate-900 dark:text-white text-sm">
                      <Link href={`/client/${c.id}?mode=bcba`} className="hover:text-purple-600 dark:hover:text-purple-400 transition-colors">
                        {c.firstName} {c.lastName}
                      </Link>
                    </h4>
                    <p className="text-xs text-slate-600 dark:text-zinc-400 font-sans mt-0.5">Status: Step 6 Staffing Pending</p>
                  </div>
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                    UNASSIGNED
                  </span>
                </div>

                <div className="space-y-2 pt-2 border-t border-[#E2D5B7]/60 dark:border-white/5">
                  <label className="block text-[10px] font-mono font-bold text-slate-600 dark:text-zinc-400 uppercase">
                    Assign BCBA Supervisor:
                  </label>
                  <select
                    className="w-full bg-[#F9F5EC] dark:bg-zinc-900 border border-[#E2D5B7] dark:border-white/10 rounded-xl p-2 text-xs text-slate-900 dark:text-white outline-none focus:border-purple-500 cursor-pointer font-sans"
                    value={c.bcbaId || ''}
                    onChange={e =>
                      handleAssignBcba(c.id, e.target.value, c.bcbaId ?? null)
                    }
                    disabled={isPending}
                  >
                    <option value="">-- Select BCBA --</option>
                    {bcbas?.map(b => (
                      <option key={b.id} value={b.id}>
                        {b.firstName} {b.lastName}
                      </option>
                    ))}
                  </select>
                </div>
              </Card>
            ))}

            {needsBcbaQueue.length === 0 && (
              <div className="p-8 text-center border border-dashed border-[#E2D5B7] dark:border-white/10 rounded-2xl bg-[#FFFDF8]/90 dark:bg-zinc-950/40 shadow-sm">
                <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-2xl border border-purple-500/20 bg-purple-500/10">
                  <UserPlus className="h-4 w-4 text-purple-500 dark:text-purple-400/70" />
                </div>
                <p className="text-xs font-semibold text-slate-700 dark:text-zinc-300">All clients have a BCBA</p>
                <p className="mt-1 text-[11px] text-slate-500 dark:text-zinc-500">
                  New intakes without a supervisor land here for assignment.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
      ) : (
        /* My Active Caseload View */
        <div className="animate-fade-in-up">
          {!selectedBcbaId ? (
            <div className="flex flex-col items-center justify-center p-20 border border-dashed border-[#E2D5B7] dark:border-white/10 rounded-3xl bg-[#FFFDF8]/90 dark:bg-zinc-950/40 mt-10 shadow-sm">
              <UserCheck className="w-12 h-12 text-slate-400 dark:text-zinc-600 mb-4" />
              <h3 className="text-xl font-bold text-slate-900 dark:text-white font-heading">Select a BCBA</h3>
              <p className="text-sm text-slate-500 dark:text-zinc-500 mt-2">Choose a BCBA from the dropdown above to view their active caseload.</p>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex justify-between items-end border-b border-[#E2D5B7] dark:border-white/10 pb-4">
                <div>
                  <h2 className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 font-heading flex items-center gap-2">
                    <Activity className="w-6 h-6" /> Active Caseload
                  </h2>
                  <p className="text-sm text-slate-600 dark:text-zinc-400 mt-1 font-sans">Managing clients currently receiving active ABA therapy.</p>
                </div>
                <div className="flex gap-3">
                  <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 px-4 py-2 rounded-xl flex items-center gap-3 shadow-sm">
                    <span className="text-xs font-bold uppercase tracking-wider opacity-80">Active:</span>
                    <span className="text-xl font-black">{clients.filter(c => c.bcbaId === selectedBcbaId && c.status === 'ACTIVE').length}</span>
                  </div>
                  <div className="bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 px-4 py-2 rounded-xl flex items-center gap-3 shadow-sm">
                    <span className="text-xs font-bold uppercase tracking-wider opacity-80">Not Started:</span>
                    <span className="text-xl font-black">{clients.filter(c => c.bcbaId === selectedBcbaId && c.status !== 'ACTIVE' && c.status !== 'DISCHARGED').length}</span>
                  </div>
                  <div className="bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 px-4 py-2 rounded-xl flex items-center gap-3 shadow-sm">
                    <span className="text-xs font-bold uppercase tracking-wider opacity-80">Inactive:</span>
                    <span className="text-xl font-black">{clients.filter(c => c.bcbaId === selectedBcbaId && c.status === 'DISCHARGED').length}</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {clients.filter(c => c.bcbaId === selectedBcbaId).map(client => {
                  const state = client.status === 'ACTIVE' ? 'ACTIVE' : client.status === 'DISCHARGED' ? 'INACTIVE' : 'NOT_STARTED';
                  const isAct = state === 'ACTIVE';
                  const isNot = state === 'NOT_STARTED';

                  const borderClass = isAct ? 'border-emerald-500/50 hover:border-emerald-400'
                                      : isNot ? 'border-amber-500/50 hover:border-amber-400'
                                      : 'border-rose-500/50 hover:border-rose-400';

                  const textClass = isAct ? 'text-slate-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400'
                                    : isNot ? 'text-slate-900 dark:text-white group-hover:text-amber-600 dark:group-hover:text-amber-400'
                                    : 'text-rose-900 dark:text-rose-100 group-hover:text-rose-600 dark:group-hover:text-rose-400';

                  const badgeBg = isAct ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                                  : isNot ? 'bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400'
                                  : 'bg-rose-500/10 border-rose-500/20 text-rose-600 dark:text-rose-400';

                  const dotClass = isAct ? 'bg-emerald-500'
                                   : isNot ? 'bg-amber-500'
                                   : 'bg-rose-500';

                  const displayState = isAct ? 'ACTIVE' : isNot ? 'NOT STARTED' : 'INACTIVE';
                  const authExpiry = client.authorizationExpiry as {
                    daysRemaining: number;
                    expiresOn: string;
                  } | null;
                  const authPanelClass = !authExpiry
                    ? 'bg-[#F9F5EC] dark:bg-zinc-900/60 border-[#E2D5B7] dark:border-white/10'
                    : authExpiry.daysRemaining <= 14
                      ? 'bg-rose-500/10 border-rose-500/20'
                      : authExpiry.daysRemaining <= 30
                        ? 'bg-amber-500/10 border-amber-500/20'
                        : 'bg-emerald-500/10 border-emerald-500/20';
                  const authTextClass = !authExpiry
                    ? 'text-slate-600 dark:text-zinc-400'
                    : authExpiry.daysRemaining <= 14
                      ? 'text-rose-600 dark:text-rose-400'
                      : authExpiry.daysRemaining <= 30
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-emerald-600 dark:text-emerald-400';

                  return (
                  <Card key={client.id} className={`bg-[#FFFDF8] dark:bg-zinc-950/80 backdrop-blur-xl border transition-all duration-300 cursor-pointer group shadow-md rounded-2xl overflow-hidden hover:scale-[1.02] flex flex-col h-full ${borderClass}`}>
                    <div className="p-5 flex-1 space-y-4">
                      {/* Header */}
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className={`font-bold text-lg transition-colors ${textClass}`}>
                            {client.firstName} {client.lastName}
                          </h4>
                          <p className="text-xs text-slate-600 dark:text-zinc-400 mt-1 font-sans">
                            Parent: {client.guardianName || 'N/A'}
                          </p>
                        </div>
                        <div className={`text-[10px] font-bold px-2 py-1 rounded shadow-sm flex items-center gap-1 uppercase tracking-wider border ${badgeBg}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${dotClass}`} />
                          {displayState}
                        </div>
                      </div>

                      {/* Staff Details */}
                      <div className="space-y-2 bg-[#F9F5EC] dark:bg-zinc-900/50 rounded-xl p-3 border border-[#E2D5B7]/60 dark:border-white/5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-500 dark:text-zinc-500 font-mono font-bold">RBT:</span>
                          <span className="text-slate-700 dark:text-zinc-300 font-sans">
                            {client.rbt ? `${client.rbt.firstName} ${client.rbt.lastName}` : <span className="text-amber-600 dark:text-yellow-500">Unassigned</span>}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-500 dark:text-zinc-500 font-mono font-bold">Coord:</span>
                          <span className="text-slate-700 dark:text-zinc-300 font-sans">
                            {client.caseCoordinator ? `${client.caseCoordinator.firstName} ${client.caseCoordinator.lastName}` : <span className="text-slate-400 dark:text-zinc-600">None</span>}
                          </span>
                        </div>
                      </div>

                      {/* Nearest active Authorization / PARequest window */}
                      <div className={`rounded-xl border p-3 ${authPanelClass}`}>
                        {authExpiry ? (
                          <>
                            <div className="flex items-center justify-between gap-3 text-xs">
                              <span className={`font-mono font-bold uppercase ${authTextClass}`}>
                                Auth expires in
                              </span>
                              <span className={`font-black ${authTextClass}`}>
                                {authExpiry.daysRemaining === 0
                                  ? 'Today'
                                  : `${authExpiry.daysRemaining} Day${authExpiry.daysRemaining === 1 ? '' : 's'}`}
                              </span>
                            </div>
                            <p className="mt-1.5 text-[10px] font-mono text-slate-500 dark:text-zinc-500">
                              Active through {authExpiry.expiresOn}
                            </p>
                          </>
                        ) : (
                          <>
                            <p className="text-xs font-mono font-bold uppercase text-slate-700 dark:text-zinc-300">
                              No active authorization
                            </p>
                            <p className="mt-1.5 text-[10px] text-slate-500 dark:text-zinc-500">
                              No approved, currently effective authorization window is on file.
                            </p>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="grid grid-cols-3 border-t border-[#E2D5B7]/60 dark:border-white/5 bg-[#F9F5EC]/60 dark:bg-zinc-900/30 divide-x divide-[#E2D5B7]/60 dark:divide-white/5">
                      <Link href={`/client/${client.id}?mode=bcba&tab=clinical_goals`} className="py-3 flex items-center justify-center gap-1.5 text-[11px] font-bold text-slate-600 dark:text-zinc-400 hover:text-cyan-600 dark:hover:text-cyan-300 hover:bg-cyan-500/10 transition-colors cursor-pointer">
                        <Sparkles className="w-3.5 h-3.5" /> Goals
                      </Link>
                      <Link href={`/client/${client.id}?mode=bcba&tab=clinical-documents`} className="py-3 flex items-center justify-center gap-1.5 text-[11px] font-bold text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white hover:bg-white dark:hover:bg-white/5 transition-colors cursor-pointer">
                        <FileText className="w-3.5 h-3.5" /> Tx Plan
                      </Link>
                      <Link href={`/client/${client.id}?mode=bcba&tab=session_emr`} className="py-3 flex items-center justify-center gap-1.5 text-[11px] font-bold text-slate-600 dark:text-zinc-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors cursor-pointer">
                        <ClipboardCheck className="w-3.5 h-3.5" /> EMR
                      </Link>
                    </div>
                  </Card>
                )})}

                {clients.filter(c => c.bcbaId === selectedBcbaId).length === 0 && (
                  <div className="col-span-full p-12 text-center border border-dashed border-[#E2D5B7] dark:border-white/10 rounded-2xl bg-[#FFFDF8]/90 dark:bg-zinc-950/40 shadow-sm">
                    <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-2xl border border-emerald-500/20 bg-emerald-500/10">
                      <Users className="h-5 w-5 text-emerald-500 dark:text-emerald-400/70" />
                    </div>
                    <p className="text-sm font-heading font-semibold text-slate-900 dark:text-white">Empty caseload</p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-zinc-500">
                      This BCBA has no clients assigned yet — assign one from the pipeline queue.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
