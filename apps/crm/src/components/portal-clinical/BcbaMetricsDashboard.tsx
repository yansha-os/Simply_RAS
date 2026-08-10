'use client';

import React from 'react';
import { Card } from '@/components/ui/Card';
import { 
  Stethoscope, 
  ShieldAlert, 
  ClipboardCheck, 
  FileText, 
  Users, 
  Activity, 
  CalendarCheck, 
  ArrowRight,
  UserCheck,
  CheckCircle2,
  Clock
} from 'lucide-react';
import Link from 'next/link';
import { assignBcba } from '@/app/(dashboard)/portal-clinical/actions';

interface BcbaMetricsDashboardProps {
  clients: any[];
  bcbas: any[];
  userRole?: string;
}

export default function BcbaMetricsDashboard({ clients, bcbas, userRole = 'CLINICAL_DIRECTOR' }: BcbaMetricsDashboardProps) {
  const [mounted, setMounted] = React.useState(false);
  const [isPending, startTransition] = React.useTransition();
  const [selectedBcba, setSelectedBcba] = React.useState<{ [key: string]: string }>({});

  React.useEffect(() => setMounted(true), []);

  const isDirector = userRole === 'CLINICAL_DIRECTOR' || userRole === 'CEO' || userRole === 'OPS_DIRECTOR';

  // Metrics Logic
  const p2pAlerts = clients.filter(c => c.paRequests?.some((pa: any) => pa.status === 'DENIED_CLINICAL' && !pa.p2pResolved));
  const assessmentPrep = clients.filter(c => ['PA_SUBMITTED', 'PA_APPROVED'].includes(c.status));
  const txPlansInProgress = clients.filter(c => ['ASSESSMENT_SCHEDULED', 'REPORT_ASSEMBLED'].includes(c.status));
  const activeCaseload = clients.filter(c => c.status === 'ACTIVE');

  const handleAssign = (clientId: string) => {
    const bcbaId = selectedBcba[clientId];
    if (!bcbaId) return;
    startTransition(async () => {
      await assignBcba(clientId, bcbaId);
    });
  };

  return (
    <div className="space-y-8 animate-fade-in-up">
      {/* Hero Master Banner */}
      <div className="relative overflow-hidden p-8 rounded-3xl bg-zinc-950/80 border border-white/10 shadow-2xl backdrop-blur-2xl group">
        <div className="absolute top-0 right-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-10 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 font-mono text-[11px] font-bold">
              <span className="dot-live"></span>
              <span>{isDirector ? 'CLINICAL DIRECTOR COMMAND CENTER' : 'BCBA CLINICAL WORKSTATION'}</span>
            </div>
            
            <h1 className="text-3xl lg:text-4xl font-extrabold text-white font-heading tracking-tight leading-tight">
              Clinical Operations <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-teal-300 to-brand-orange-300">&amp; Treatment Hub</span>
            </h1>
            
            <p className="text-sm text-zinc-400 max-w-2xl font-sans leading-relaxed">
              {isDirector 
                ? 'Oversee clinical throughput, delegate treatment plan generation, resolve P2P authorization appeals, and monitor BCBA caseload distribution.'
                : 'Manage your assigned clinical cases, complete 97151 assessments, draft treatment plans, and log session sign-offs.'}
            </p>
          </div>

            <Link
              href="/portal-clinical/bcbas"
              className="bg-gradient-to-r from-cyan-500 to-teal-600 hover:from-cyan-600 hover:to-teal-700 text-white font-bold text-xs px-5 h-11 rounded-2xl shadow-[0_0_20px_rgba(6,182,212,0.3)] transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              <FileText className="w-4 h-4" /> Go to Clinical Queue
            </Link>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 font-mono">
        <Card className="p-5 bg-zinc-950/80 border border-white/10 backdrop-blur-xl rounded-2xl shadow-xl space-y-2 hover:border-cyan-500/40 transition-all">
          <div className="flex justify-between items-center text-zinc-400 text-xs">
            <span>ACTIVE CASELOAD</span>
            <Users className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-2xl font-extrabold text-white">{activeCaseload.length}</div>
          <div className="text-[11px] text-zinc-500 font-sans">Active client plans under supervision</div>
        </Card>

        <Card className="p-5 bg-zinc-950/80 border border-white/10 backdrop-blur-xl rounded-2xl shadow-xl space-y-2 hover:border-rose-500/40 transition-all">
          <div className="flex justify-between items-center text-zinc-400 text-xs">
            <span>P2P ALERTS</span>
            <ShieldAlert className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-2xl font-extrabold text-rose-400">{p2pAlerts.length}</div>
          <div className="text-[11px] text-zinc-500 font-sans">Peer-to-peer reviews required</div>
        </Card>

        <Card className="p-5 bg-zinc-950/80 border border-white/10 backdrop-blur-xl rounded-2xl shadow-xl space-y-2 hover:border-amber-500/40 transition-all">
          <div className="flex justify-between items-center text-zinc-400 text-xs">
            <span>ASSESSMENT PREP</span>
            <ClipboardCheck className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-extrabold text-amber-400">{assessmentPrep.length}</div>
          <div className="text-[11px] text-zinc-500 font-sans">Evaluation &amp; Meet-and-Greets</div>
        </Card>

        <Card className="p-5 bg-zinc-950/80 border border-white/10 backdrop-blur-xl rounded-2xl shadow-xl space-y-2 hover:border-purple-500/40 transition-all">
          <div className="flex justify-between items-center text-zinc-400 text-xs">
            <span>TX PLANS IN PROGRESS</span>
            <FileText className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-2xl font-extrabold text-purple-400">{txPlansInProgress.length}</div>
          <div className="text-[11px] text-zinc-500 font-sans">Drafting &amp; Clinical Director Review</div>
        </Card>
      </div>

      {/* Main Split Layout: Delegation Queue & BCBA Load */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left 2 Cols: Clinical Director Delegation Queue */}
        <div className="lg:col-span-2 space-y-4">
          <Card className="p-6 bg-zinc-950/80 border border-white/10 backdrop-blur-xl rounded-3xl shadow-xl space-y-4">
            <div className="flex justify-between items-center border-b border-white/10 pb-4">
              <div>
                <h3 className="text-lg font-bold text-white font-heading flex items-center gap-2">
                  <UserCheck className="w-5 h-5 text-cyan-400" /> Treatment Plan Traffic Control
                </h3>
                <p className="text-xs text-zinc-400">Default routed to Clinical Director. Delegate to staff BCBAs as needed.</p>
              </div>
              <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                {txPlansInProgress.length} Pending Plans
              </span>
            </div>

            <div className="space-y-3">
              {txPlansInProgress.map(client => (
                <div key={client.id} className="p-4 bg-zinc-900/60 border border-white/5 hover:border-white/15 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-white text-sm">{client.firstName} {client.lastName}</h4>
                      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20 uppercase">
                        {client.status.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-400 font-sans">
                      Parent: {client.guardianName || 'N/A'} &bull; Assigned BCBA: {client.bcba ? `${client.bcba.firstName} ${client.bcba.lastName}` : <span className="text-amber-400 font-bold">Clinical Director (Default)</span>}
                    </p>
                  </div>

                  {isDirector && (
                    <div className="flex items-center gap-2 shrink-0">
                      <select
                        className="bg-zinc-950 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white outline-none cursor-pointer focus:border-cyan-500 font-sans"
                        value={selectedBcba[client.id] || client.bcbaId || ''}
                        onChange={e => setSelectedBcba({ ...selectedBcba, [client.id]: e.target.value })}
                      >
                        <option value="">Clinical Director (Self)</option>
                        {bcbas.map(b => (
                          <option key={b.id} value={b.id}>Delegate: {b.firstName} {b.lastName}</option>
                        ))}
                      </select>
                      
                      <button
                        onClick={() => handleAssign(client.id)}
                        disabled={isPending}
                        className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs px-3 h-8 rounded-xl transition-all cursor-pointer shadow-sm"
                      >
                        Assign
                      </button>

                      <Link href={`/client/${client.id}?mode=treatment_plan`}>
                        <button className="bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-xs px-3 h-8 rounded-xl transition-all cursor-pointer">
                          Open Plan
                        </button>
                      </Link>
                    </div>
                  )}
                </div>
              ))}

              {txPlansInProgress.length === 0 && (
                <div className="p-8 text-center text-xs text-zinc-500 border border-dashed border-white/10 rounded-2xl bg-zinc-950/40">
                  Zero active treatment plans in progress.
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* Right 1 Col: Staff BCBA Caseload Distribution */}
        <div className="space-y-4">
          <Card className="p-6 bg-zinc-950/80 border border-white/10 backdrop-blur-xl rounded-3xl shadow-xl space-y-4">
            <div className="flex justify-between items-center border-b border-white/10 pb-4">
              <h3 className="text-base font-bold text-white font-heading flex items-center gap-2">
                <Activity className="w-4 h-4 text-teal-400" /> BCBA Caseload Balance
              </h3>
              <span className="text-xs font-mono text-zinc-400">{bcbas.length} BCBAs</span>
            </div>

            <div className="space-y-3">
              {bcbas.map(bcba => {
                const assignedCount = clients.filter(c => c.bcbaId === bcba.id).length;
                return (
                  <div key={bcba.id} className="p-3.5 bg-zinc-900/40 border border-white/5 rounded-2xl flex justify-between items-center">
                    <div>
                      <h4 className="font-bold text-white text-xs">{bcba.firstName} {bcba.lastName}</h4>
                      <p className="text-[11px] text-zinc-400 font-sans">{bcba.email}</p>
                    </div>
                    <div className="text-right font-mono">
                      <span className="text-sm font-bold text-cyan-400">{assignedCount}</span>
                      <span className="text-[10px] text-zinc-500 block">cases</span>
                    </div>
                  </div>
                );
              })}

              {bcbas.length === 0 && (
                <div className="p-6 text-center text-xs text-zinc-500 border border-dashed border-white/10 rounded-2xl bg-zinc-950/40">
                  No active BCBAs registered in system.
                </div>
              )}
            </div>
          </Card>
        </div>

      </div>
    </div>
  );
}
