'use client';

import React, { useTransition } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { FileText, ArrowRight, ClipboardCheck, Sparkles, Layers, ShieldAlert, Zap, Stethoscope, Activity, UserPlus, UserCheck, Users } from 'lucide-react';
import Link from 'next/link';
import { assignBcba } from '@/app/(dashboard)/portal-clinical/actions';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

export default function BcbaDashboard({ clients, bcbas }: { clients: any[], bcbas?: any[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  
  // BCBA Queue Logic
  const needsBcbaQueue = clients.filter(c => !c.bcbaId);
  const p2pQueue = clients.filter(c => c.paRequests?.some((pa: any) => pa.status === 'DENIED_CLINICAL' && !pa.p2pResolved) && !needsBcbaQueue.includes(c));
  const prepQueue = clients.filter(c => ['PA_SUBMITTED', 'PA_APPROVED'].includes(c.status) && !p2pQueue.includes(c) && !needsBcbaQueue.includes(c));
  const txPlanQueue = clients.filter(c => c.status === 'ASSESSMENT_SCHEDULED' && !p2pQueue.includes(c) && !needsBcbaQueue.includes(c));

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

  const QueueCard = ({ client, title, icon: Icon, desc, mode }: { client: any, title: string, icon: any, desc: string, mode?: string }) => {
    const unreadCount = client.messages?.filter((m: any) => m.isFromClient && !m.readAt).length || 0;

    return (
      <Card className="bg-zinc-950/80 backdrop-blur-xl border border-white/10 hover:border-cyan-500/50 transition-all duration-300 cursor-pointer group mb-3 shadow-xl rounded-2xl overflow-hidden hover:scale-[1.01]">
        <Link href={`/client/${client.id}${mode ? `?mode=${mode}` : ''}`} className="block p-4">
          <div className="flex justify-between items-start">
            <div className="space-y-1">
              <h4 className="font-bold text-white group-hover:text-cyan-400 transition-colors flex items-center gap-2 text-sm">
                {client.firstName} {client.lastName}
                {unreadCount > 0 && (
                  <span className="bg-rose-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full text-center leading-none shadow-md animate-pulse">
                    {unreadCount} new
                  </span>
                )}
              </h4>
              <p className="text-xs text-zinc-400 font-sans">{desc}</p>
            </div>
            <div className="w-8 h-8 rounded-xl bg-zinc-900 border border-white/10 flex items-center justify-center text-zinc-400 group-hover:text-cyan-400 group-hover:border-cyan-500/30 transition-all shrink-0 ml-2 shadow-sm">
              <Icon className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-white/5 pt-3">
            <div className="text-[10px] text-zinc-500 font-mono uppercase font-bold tracking-wider">
              Updated {mounted ? new Date(client.updatedAt).toLocaleDateString() : ''}
            </div>
            <ArrowRight className="w-4 h-4 text-zinc-500 group-hover:text-cyan-400 group-hover:translate-x-1 transition-all" />
          </div>
        </Link>
      </Card>
    );
  };

  const [viewMode, setViewMode] = React.useState<'queue' | 'caseload'>('queue');
  const [selectedBcbaId, setSelectedBcbaId] = React.useState<string>('');

  return (
    <div className="space-y-8 mt-6 pb-12 animate-fade-in-up">

      {/* Discoverability strip — clinical review + unsigned notes + goals */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Link
          href="/portal-clinical/review"
          className="flex-1 group relative overflow-hidden rounded-2xl border border-teal-500/20 bg-teal-500/5 px-5 py-4 backdrop-blur-xl transition-all duration-300 hover:border-teal-500/40 hover:scale-[1.01] cursor-pointer"
        >
          <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-teal-500/10 blur-2xl" />
          <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-teal-400">Clinical triage</p>
          <p className="mt-1 text-sm font-semibold text-white font-heading">Clinical Review</p>
          <p className="mt-0.5 text-xs text-zinc-400">Packets, deficiencies, and co-sign work</p>
        </Link>
        <Link
          href="/portal-clinical/notes"
          className="flex-1 group relative overflow-hidden rounded-2xl border border-amber-500/20 bg-amber-500/5 px-5 py-4 backdrop-blur-xl transition-all duration-300 hover:border-amber-500/40 hover:scale-[1.01] cursor-pointer"
        >
          <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-amber-500/10 blur-2xl" />
          <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-amber-400">BCBA note queue</p>
          <p className="mt-1 text-sm font-semibold text-white font-heading">Unsigned Notes</p>
          <p className="mt-0.5 text-xs text-zinc-400">RBT-signed notes awaiting BCBA co-sign</p>
        </Link>
        <div className="flex-1 rounded-2xl border border-white/10 bg-zinc-950/60 px-5 py-4 backdrop-blur-xl">
          <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-cyan-400">Client profile</p>
          <p className="mt-1 text-sm font-semibold text-white font-heading">Clinical Goals · Session EMR</p>
          <p className="mt-0.5 text-xs text-zinc-400">Open a caseload client → tabs appear in the profile header</p>
        </div>
      </div>
      
      {/* Top Toggle & Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-zinc-950/80 backdrop-blur-xl p-2 rounded-2xl border border-white/10 shadow-lg">
        <div className="flex bg-zinc-900 rounded-xl p-1">
          <button
            onClick={() => setViewMode('queue')}
            className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${viewMode === 'queue' ? 'bg-cyan-600 text-white shadow-md' : 'text-zinc-400 hover:text-white hover:bg-white/5'}`}
          >
            📊 Clinical Pipeline Queue
          </button>
          <button
            onClick={() => setViewMode('caseload')}
            className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${viewMode === 'caseload' ? 'bg-emerald-600 text-white shadow-md' : 'text-zinc-400 hover:text-white hover:bg-white/5'}`}
          >
            👥 My Active Caseload
          </button>
        </div>

        {viewMode === 'caseload' && (
          <div className="flex items-center gap-3 px-2">
            <span className="text-xs font-mono text-zinc-400 font-bold uppercase">Viewing Caseload For:</span>
            <select
              className="bg-zinc-900 border border-white/10 rounded-xl px-4 py-2 text-sm text-white outline-none focus:border-emerald-500 cursor-pointer font-sans shadow-sm"
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
            <h3 className="font-bold text-rose-400 text-sm flex items-center gap-2 font-heading">
              <ShieldAlert className="w-4 h-4 text-rose-400 animate-pulse" /> 1. P2P Action Required
            </h3>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20">
              {p2pQueue.length}
            </span>
          </div>

          <div>
            {p2pQueue.map(c => (
              <QueueCard
                key={c.id}
                client={c}
                title="P2P Meeting Needed"
                icon={ShieldAlert}
                desc="Insurer requested BCBA Peer-to-Peer review conference call."
                mode="p2p"
              />
            ))}

            {p2pQueue.length === 0 && (
              <div className="p-8 text-center border border-dashed border-white/10 rounded-2xl bg-zinc-950/40">
                <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-2xl border border-rose-500/20 bg-rose-500/10">
                  <ShieldAlert className="h-4 w-4 text-rose-400/70" />
                </div>
                <p className="text-xs font-semibold text-zinc-300">No P2P alerts</p>
                <p className="mt-1 text-[11px] text-zinc-500">
                  Denied clinical PAs needing peer-to-peer review land here.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Column 2: Assessment Prep */}
        <div className="space-y-4">
          <div className="flex justify-between items-center px-1 border-b border-amber-500/20 pb-3">
            <h3 className="font-bold text-amber-400 text-sm flex items-center gap-2 font-heading">
              <ClipboardCheck className="w-4 h-4 text-amber-400" /> 2. Assessment Prep Queue
            </h3>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
              {prepQueue.length}
            </span>
          </div>

          <div>
            {prepQueue.map(c => (
              <QueueCard
                key={c.id}
                client={c}
                title="Prepare Assessment"
                icon={ClipboardCheck}
                desc="VOB verified. Prepare initial evaluation &amp; assessment date."
                mode="assessment_prep"
              />
            ))}

            {prepQueue.length === 0 && (
              <div className="p-8 text-center border border-dashed border-white/10 rounded-2xl bg-zinc-950/40">
                <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-2xl border border-amber-500/20 bg-amber-500/10">
                  <ClipboardCheck className="h-4 w-4 text-amber-400/70" />
                </div>
                <p className="text-xs font-semibold text-zinc-300">No assessments to prep</p>
                <p className="mt-1 text-[11px] text-zinc-500">
                  Clients at PA submitted / approved appear here for evaluation prep.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Column 3: Treatment Plan Builder */}
        <div className="space-y-4">
          <div className="flex justify-between items-center px-1 border-b border-cyan-500/20 pb-3">
            <h3 className="font-bold text-cyan-400 text-sm flex items-center gap-2 font-heading">
              <FileText className="w-4 h-4 text-cyan-400" /> 3. Treatment Plan Builder
            </h3>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              {txPlanQueue.length}
            </span>
          </div>

          <div>
            {txPlanQueue.map(c => (
              <QueueCard
                key={c.id}
                client={c}
                title="Build Treatment Plan PDF"
                icon={FileText}
                desc="Assessment complete. Assemble treatment plan &amp; submit to Billing."
                mode="treatment_plan"
              />
            ))}

            {txPlanQueue.length === 0 && (
              <div className="p-8 text-center border border-dashed border-white/10 rounded-2xl bg-zinc-950/40">
                <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-2xl border border-cyan-500/20 bg-cyan-500/10">
                  <FileText className="h-4 w-4 text-cyan-400/70" />
                </div>
                <p className="text-xs font-semibold text-zinc-300">No plans in assembly</p>
                <p className="mt-1 text-[11px] text-zinc-500">
                  Clients with a scheduled assessment queue here for treatment plan build.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Column 4: Needs BCBA Assignment (Far Right) */}
        <div className="space-y-4">
          <div className="flex justify-between items-center px-1 border-b border-purple-500/20 pb-3">
            <h3 className="font-bold text-purple-400 text-sm flex items-center gap-2 font-heading">
              <UserPlus className="w-4 h-4 text-purple-400" /> 4. Needs BCBA Assignment
            </h3>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-purple-500/10 text-purple-400 border border-purple-500/20">
              {needsBcbaQueue.length}
            </span>
          </div>

          <div className="space-y-3">
            {needsBcbaQueue.map(c => (
              <Card key={c.id} className="p-4 bg-zinc-950/80 backdrop-blur-xl border border-white/10 hover:border-purple-500/50 transition-all shadow-xl rounded-2xl space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-bold text-white text-sm">
                      <Link href={`/client/${c.id}?mode=bcba`} className="hover:text-purple-400 transition-colors">
                        {c.firstName} {c.lastName}
                      </Link>
                    </h4>
                    <p className="text-xs text-zinc-400 font-sans mt-0.5">Status: Step 6 Staffing Pending</p>
                  </div>
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">
                    UNASSIGNED
                  </span>
                </div>

                <div className="space-y-2 pt-2 border-t border-white/5">
                  <label className="block text-[10px] font-mono font-bold text-zinc-400 uppercase">
                    Assign BCBA Supervisor:
                  </label>
                  <select
                    className="w-full bg-zinc-900 border border-white/10 rounded-xl p-2 text-xs text-white outline-none focus:border-purple-500 cursor-pointer font-sans"
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
              <div className="p-8 text-center border border-dashed border-white/10 rounded-2xl bg-zinc-950/40">
                <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-2xl border border-purple-500/20 bg-purple-500/10">
                  <UserPlus className="h-4 w-4 text-purple-400/70" />
                </div>
                <p className="text-xs font-semibold text-zinc-300">All clients have a BCBA</p>
                <p className="mt-1 text-[11px] text-zinc-500">
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
            <div className="flex flex-col items-center justify-center p-20 border border-dashed border-white/10 rounded-3xl bg-zinc-950/40 mt-10">
              <UserCheck className="w-12 h-12 text-zinc-600 mb-4" />
              <h3 className="text-xl font-bold text-white font-heading">Select a BCBA</h3>
              <p className="text-sm text-zinc-500 mt-2">Choose a BCBA from the dropdown above to view their active caseload.</p>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex justify-between items-end border-b border-white/10 pb-4">
                <div>
                  <h2 className="text-2xl font-bold text-emerald-400 font-heading flex items-center gap-2">
                    <Activity className="w-6 h-6" /> Active Caseload
                  </h2>
                  <p className="text-sm text-zinc-400 mt-1 font-sans">Managing clients currently receiving active ABA therapy.</p>
                </div>
                <div className="flex gap-3">
                  <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-4 py-2 rounded-xl flex items-center gap-3 shadow-sm">
                    <span className="text-xs font-bold uppercase tracking-wider opacity-80">Active:</span>
                    <span className="text-xl font-black">{clients.filter(c => c.bcbaId === selectedBcbaId && c.status === 'ACTIVE').length}</span>
                  </div>
                  <div className="bg-amber-500/10 border border-amber-500/20 text-amber-400 px-4 py-2 rounded-xl flex items-center gap-3 shadow-sm">
                    <span className="text-xs font-bold uppercase tracking-wider opacity-80">Not Started:</span>
                    <span className="text-xl font-black">{clients.filter(c => c.bcbaId === selectedBcbaId && c.status !== 'ACTIVE' && c.status !== 'DISCHARGED').length}</span>
                  </div>
                  <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 px-4 py-2 rounded-xl flex items-center gap-3 shadow-sm">
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
                  
                  const textClass = isAct ? 'text-white group-hover:text-emerald-400' 
                                    : isNot ? 'text-white group-hover:text-amber-400' 
                                    : 'text-rose-100 group-hover:text-rose-400';

                  const badgeBg = isAct ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400' 
                                  : isNot ? 'bg-amber-500/20 border-amber-500/30 text-amber-400' 
                                  : 'bg-rose-500/20 border-rose-500/30 text-rose-400';
                                  
                  const dotClass = isAct ? 'bg-emerald-400 animate-pulse' 
                                   : isNot ? 'bg-amber-400' 
                                   : 'bg-rose-400';
                  
                  const displayState = isAct ? 'ACTIVE' : isNot ? 'NOT STARTED' : 'INACTIVE';
                  const authExpiry = client.authorizationExpiry as {
                    daysRemaining: number;
                    expiresOn: string;
                  } | null;
                  const authPanelClass = !authExpiry
                    ? 'bg-zinc-900/60 border-white/10'
                    : authExpiry.daysRemaining <= 14
                      ? 'bg-rose-500/10 border-rose-500/20'
                      : authExpiry.daysRemaining <= 30
                        ? 'bg-amber-500/10 border-amber-500/20'
                        : 'bg-emerald-500/10 border-emerald-500/20';
                  const authTextClass = !authExpiry
                    ? 'text-zinc-400'
                    : authExpiry.daysRemaining <= 14
                      ? 'text-rose-400'
                      : authExpiry.daysRemaining <= 30
                        ? 'text-amber-400'
                        : 'text-emerald-400';

                  return (
                  <Card key={client.id} className={`bg-zinc-950/80 backdrop-blur-xl border transition-all duration-300 cursor-pointer group shadow-xl rounded-2xl overflow-hidden hover:scale-[1.02] flex flex-col h-full ${borderClass}`}>
                    <div className="p-5 flex-1 space-y-4">
                      {/* Header */}
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className={`font-bold text-lg transition-colors ${textClass}`}>
                            {client.firstName} {client.lastName}
                          </h4>
                          <p className="text-xs text-zinc-400 mt-1 font-sans">
                            Parent: {client.guardianName || 'N/A'}
                          </p>
                        </div>
                        <div className={`text-[10px] font-bold px-2 py-1 rounded shadow-sm flex items-center gap-1 uppercase tracking-wider border ${badgeBg}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${dotClass}`} />
                          {displayState}
                        </div>
                      </div>

                      {/* Staff Details */}
                      <div className="space-y-2 bg-zinc-900/50 rounded-xl p-3 border border-white/5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-zinc-500 font-mono font-bold">RBT:</span>
                          <span className="text-zinc-300 font-sans">
                            {client.rbt ? `${client.rbt.firstName} ${client.rbt.lastName}` : <span className="text-yellow-500">Unassigned</span>}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-zinc-500 font-mono font-bold">Coord:</span>
                          <span className="text-zinc-300 font-sans">
                            {client.caseCoordinator ? `${client.caseCoordinator.firstName} ${client.caseCoordinator.lastName}` : <span className="text-zinc-600">None</span>}
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
                            <p className="mt-1.5 text-[10px] font-mono text-zinc-500">
                              Active through {authExpiry.expiresOn}
                            </p>
                          </>
                        ) : (
                          <>
                            <p className="text-xs font-mono font-bold uppercase text-zinc-300">
                              No active authorization
                            </p>
                            <p className="mt-1.5 text-[10px] text-zinc-500">
                              No approved, currently effective authorization window is on file.
                            </p>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="grid grid-cols-3 border-t border-white/5 bg-zinc-900/30 divide-x divide-white/5">
                      <Link href={`/client/${client.id}?mode=bcba&tab=clinical_goals`} className="py-3 flex items-center justify-center gap-1.5 text-[11px] font-bold text-zinc-400 hover:text-cyan-300 hover:bg-cyan-500/10 transition-colors cursor-pointer">
                        <Sparkles className="w-3.5 h-3.5" /> Goals
                      </Link>
                      <Link href={`/client/${client.id}?mode=bcba&tab=clinical-documents`} className="py-3 flex items-center justify-center gap-1.5 text-[11px] font-bold text-zinc-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer">
                        <FileText className="w-3.5 h-3.5" /> Tx Plan
                      </Link>
                      <Link href={`/client/${client.id}?mode=bcba&tab=session_emr`} className="py-3 flex items-center justify-center gap-1.5 text-[11px] font-bold text-zinc-400 hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors cursor-pointer">
                        <ClipboardCheck className="w-3.5 h-3.5" /> EMR
                      </Link>
                    </div>
                  </Card>
                )})}

                {clients.filter(c => c.bcbaId === selectedBcbaId).length === 0 && (
                  <div className="col-span-full p-12 text-center border border-dashed border-white/10 rounded-2xl bg-zinc-950/40">
                    <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-2xl border border-emerald-500/20 bg-emerald-500/10">
                      <Users className="h-5 w-5 text-emerald-400/70" />
                    </div>
                    <p className="text-sm font-heading font-semibold text-white">Empty caseload</p>
                    <p className="mt-1 text-xs text-zinc-500">
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
