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
  UserCheck,
  Clock,
  Send,
  LineChart,
  PenTool,
  ExternalLink,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { assignBcba } from '@/app/(dashboard)/portal-clinical/actions';
import type { BcbaOpsMetrics } from '@/app/actions/bcbaMetricsActions';

interface BcbaMetricsDashboardProps {
  metrics: BcbaOpsMetrics;
  bcbas: Array<{ id: string; firstName: string; lastName: string; email: string }>;
}

function chartProgressHref(clientId: string) {
  return `/client/${clientId}?mode=bcba&tab=chart_progress`;
}

function formatSessionWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
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
      className={`group block p-5 bg-zinc-950/80 border border-white/10 backdrop-blur-xl rounded-2xl shadow-xl space-y-2 transition-all duration-300 hover:scale-[1.01] hover:shadow-2xl cursor-pointer ${accent}`}
    >
      <div className="flex justify-between items-center text-zinc-400 text-[11px] font-mono tracking-wide">
        <span>{label}</span>
        <Icon className="w-4 h-4 opacity-80 group-hover:opacity-100" />
      </div>
      <div className="flex items-end justify-between gap-2">
        <div
          className={`text-3xl font-extrabold font-mono tabular-nums ${
            zero ? 'text-zinc-500' : 'text-white'
          }`}
        >
          {value}
        </div>
        <ArrowRight className="w-4 h-4 text-zinc-600 group-hover:text-brand-orange-400 transition-colors mb-1" />
      </div>
      <div className="text-[11px] text-zinc-500 font-sans leading-snug">{hint}</div>
      {zero && (
        <div className="text-[10px] font-mono text-zinc-600 pt-0.5">No items in queue</div>
      )}
    </Link>
  );
}

export default function BcbaMetricsDashboard({ metrics, bcbas }: BcbaMetricsDashboardProps) {
  const [isPending, startTransition] = React.useTransition();
  const [selectedBcba, setSelectedBcba] = React.useState<Record<string, string>>({});
  const [assignMsg, setAssignMsg] = React.useState<{
    tone: 'success' | 'error';
    text: string;
  } | null>(null);

  const isDirector = metrics.isDirector;

  const handleAssign = (clientId: string, expectedBcbaId: string | null) => {
    const bcbaId = selectedBcba[clientId];
    if (!bcbaId) return;
    setAssignMsg(null);
    startTransition(async () => {
      const result = await assignBcba({
        clientId,
        bcbaId,
        expectedBcbaId,
        reason: 'BCBA metrics dashboard assignment',
      });
      if (!result?.success) {
        setAssignMsg({ tone: 'error', text: result?.error || 'Assign failed.' });
        return;
      }
      setAssignMsg({ tone: 'success', text: 'BCBA assigned.' });
    });
  };

  return (
    <div className="space-y-8 animate-fade-in-up">
      {/* Hero */}
      <div className="relative overflow-hidden p-8 rounded-3xl bg-zinc-950/80 border border-white/10 shadow-2xl backdrop-blur-2xl">
        <div className="absolute top-0 right-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-10 w-96 h-96 bg-brand-orange-500/8 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 font-mono text-[11px] font-bold">
              <span className="dot-live" />
              <span>
                {isDirector ? 'CLINICAL DIRECTOR COMMAND CENTER' : 'BCBA CLINICAL WORKSTATION'}
              </span>
            </div>

            <h1 className="text-3xl lg:text-4xl font-extrabold text-white font-heading tracking-tight leading-tight">
              Clinical Operations{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-teal-300 to-brand-orange-300">
                Visibility
              </span>
            </h1>

            <p className="text-sm text-zinc-400 max-w-2xl font-sans leading-relaxed">
              Live caseload, unsigned session notes, and claim-ready counts from the database
              {metrics.scopedToBcbaId ? ' (your caseload)' : ' (agency-wide)'}. Empty means zero
              matching rows — not sample data.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 shrink-0">
            <Link
              href="/portal-clinical/notes"
              className="bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white font-bold text-xs px-5 h-11 rounded-2xl shadow-[0_0_20px_rgba(245,158,11,0.25)] transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              <PenTool className="w-4 h-4" />
              Unsigned Notes
              {metrics.unsignedNotes > 0 && (
                <span className="font-mono bg-black/25 px-2 py-0.5 rounded-lg">
                  {metrics.unsignedNotes}
                </span>
              )}
            </Link>
            <Link
              href="/notes?queue=ready"
              className="bg-gradient-to-r from-cyan-500 to-teal-600 hover:from-cyan-600 hover:to-teal-700 text-white font-bold text-xs px-5 h-11 rounded-2xl shadow-[0_0_20px_rgba(6,182,212,0.3)] transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              <Send className="w-4 h-4" />
              Ready for Plutus
              {metrics.readyForPlutus > 0 && (
                <span className="font-mono bg-black/25 px-2 py-0.5 rounded-lg">
                  {metrics.readyForPlutus}
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
          href="#active-caseload"
        />
        <KpiCard
          label="UNSIGNED NOTES"
          value={metrics.unsignedNotes}
          hint="RBT signed · awaiting BCBA co-sign"
          icon={FileText}
          accent="hover:border-amber-500/40"
          href="/portal-clinical/notes"
        />
        <KpiCard
          label="SESSIONS AWAITING SIGN"
          value={metrics.sessionsAwaitingSign}
          hint="Same queue — open unsigned notes workstation"
          icon={Clock}
          accent="hover:border-orange-500/40"
          href="/portal-clinical/notes"
        />
        <KpiCard
          label="READY FOR PLUTUS"
          value={metrics.readyForPlutus}
          hint="BCBA signed · not yet marked converted"
          icon={Send}
          accent="hover:border-emerald-500/40"
          href="/notes?queue=ready"
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
          href="#tx-plans"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Unsigned notes preview */}
        <div className="lg:col-span-2 space-y-4">
          <Card className="p-6 bg-zinc-950/80 border border-white/10 backdrop-blur-xl rounded-3xl shadow-xl space-y-4">
            <div className="flex justify-between items-center border-b border-white/10 pb-4 gap-3">
              <div>
                <h3 className="text-lg font-bold text-white font-heading flex items-center gap-2">
                  <PenTool className="w-5 h-5 text-amber-400" />
                  Sessions awaiting BCBA sign
                </h3>
                <p className="text-xs text-zinc-400 mt-1">
                  Deep-link to Chart Progress per client, or open the full unsigned queue.
                </p>
              </div>
              <Link
                href="/portal-clinical/notes"
                className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-mono font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:border-amber-500/50 transition-all cursor-pointer"
              >
                Open queue <ExternalLink className="w-3 h-3" />
              </Link>
            </div>

            <div className="space-y-2.5">
              {metrics.unsignedPreviews.map((row) => (
                <div
                  key={row.noteId}
                  className="p-4 bg-zinc-900/60 border border-white/5 hover:border-amber-500/30 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all duration-300"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-bold text-white text-sm">{row.clientName}</h4>
                      {row.cptCode && (
                        <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                          {row.cptCode}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-zinc-400 font-mono">
                      {formatSessionWhen(row.scheduledStart)}
                      {row.rbtName ? ` · RBT ${row.rbtName}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Link
                      href={chartProgressHref(row.clientId)}
                      className="inline-flex items-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-xs px-3 h-8 rounded-xl transition-all cursor-pointer"
                    >
                      <LineChart className="w-3.5 h-3.5 text-cyan-400" />
                      Chart Progress
                    </Link>
                    <Link
                      href="/portal-clinical/notes"
                      className="inline-flex items-center gap-1.5 bg-amber-600/90 hover:bg-amber-500 text-white font-bold text-xs px-3 h-8 rounded-xl transition-all cursor-pointer"
                    >
                      Sign queue
                    </Link>
                  </div>
                </div>
              ))}

              {metrics.unsignedPreviews.length === 0 && (
                <div className="p-8 text-center border border-dashed border-white/10 rounded-2xl bg-zinc-950/40 space-y-2">
                  <CheckEmptyIcon />
                  <p className="text-sm text-zinc-300 font-heading font-semibold">
                    No sessions awaiting BCBA sign
                  </p>
                  <p className="text-xs text-zinc-500 max-w-sm mx-auto">
                    When an RBT signs a note, it appears here and in{' '}
                    <Link
                      href="/portal-clinical/notes"
                      className="text-cyan-400 hover:underline cursor-pointer"
                    >
                      /portal-clinical/notes
                    </Link>
                    .
                  </p>
                </div>
              )}
            </div>
          </Card>

          {/* Treatment plan traffic */}
          <Card
            id="tx-plans"
            className="p-6 bg-zinc-950/80 border border-white/10 backdrop-blur-xl rounded-3xl shadow-xl space-y-4 scroll-mt-6"
          >
            <div className="flex justify-between items-center border-b border-white/10 pb-4">
              <div>
                <h3 className="text-lg font-bold text-white font-heading flex items-center gap-2">
                  <UserCheck className="w-5 h-5 text-cyan-400" />
                  Treatment plan traffic
                </h3>
                <p className="text-xs text-zinc-400">
                  Assessment scheduled / report assembled — delegate BCBA as needed.
                </p>
              </div>
              <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                {metrics.txPlansInProgress} pending
              </span>
            </div>

            {assignMsg && (
              <p
                className={`text-xs font-mono rounded-xl px-3 py-2 border ${
                  assignMsg.tone === 'error'
                    ? 'text-rose-300 border-rose-500/25 bg-rose-500/10'
                    : 'text-emerald-300 border-emerald-500/25 bg-emerald-500/10'
                }`}
              >
                {assignMsg.text}
              </p>
            )}

            <div className="space-y-3">
              {metrics.txPlanClients.map((client) => (
                <div
                  key={client.id}
                  className="p-4 bg-zinc-900/60 border border-white/5 hover:border-white/15 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-bold text-white text-sm">
                        {client.firstName} {client.lastName}
                      </h4>
                      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20 uppercase">
                        {client.status.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-400 font-sans">
                      Parent: {client.guardianName || 'N/A'} · Assigned BCBA:{' '}
                      {client.bcba ? (
                        `${client.bcba.firstName} ${client.bcba.lastName}`
                      ) : (
                        <span className="text-amber-400 font-bold">Unassigned</span>
                      )}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 flex-wrap">
                    {isDirector && (
                      <>
                        <select
                          className="bg-zinc-950 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white outline-none cursor-pointer focus:border-cyan-500 font-sans"
                          value={selectedBcba[client.id] || client.bcbaId || ''}
                          onChange={(e) =>
                            setSelectedBcba({ ...selectedBcba, [client.id]: e.target.value })
                          }
                        >
                          <option value="">Select BCBA…</option>
                          {bcbas.map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.firstName} {b.lastName}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => handleAssign(client.id, client.bcbaId)}
                          disabled={isPending || !selectedBcba[client.id]}
                          className="bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs px-3 h-8 rounded-xl transition-all cursor-pointer shadow-sm"
                        >
                          Assign
                        </button>
                      </>
                    )}
                    <Link
                      href={chartProgressHref(client.id)}
                      className="inline-flex items-center bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-xs px-3 h-8 rounded-xl transition-all cursor-pointer"
                    >
                      Chart Progress
                    </Link>
                    <Link
                      href={`/client/${client.id}?mode=treatment_plan`}
                      className="inline-flex items-center bg-purple-600/80 hover:bg-purple-500 text-white font-bold text-xs px-3 h-8 rounded-xl transition-all cursor-pointer"
                    >
                      Open plan
                    </Link>
                  </div>
                </div>
              ))}

              {metrics.txPlanClients.length === 0 && (
                <div className="p-8 text-center text-xs text-zinc-500 border border-dashed border-white/10 rounded-2xl bg-zinc-950/40">
                  Zero treatment plans in assessment / report stages.
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* Right column */}
        <div className="space-y-4">
          <Card
            id="active-caseload"
            className="p-6 bg-zinc-950/80 border border-white/10 backdrop-blur-xl rounded-3xl shadow-xl space-y-4 scroll-mt-6"
          >
            <div className="flex justify-between items-center border-b border-white/10 pb-4">
              <h3 className="text-base font-bold text-white font-heading flex items-center gap-2">
                <Users className="w-4 h-4 text-cyan-400" />
                Active caseload
              </h3>
              <span className="text-xs font-mono text-zinc-400">
                {metrics.activeCaseload} ACTIVE
              </span>
            </div>

            <div className="space-y-2.5">
              {metrics.activeClients.map((c) => (
                <Link
                  key={c.id}
                  href={chartProgressHref(c.id)}
                  className="block p-3.5 bg-zinc-900/40 border border-white/5 hover:border-cyan-500/40 rounded-2xl transition-all duration-300 hover:scale-[1.01] cursor-pointer group"
                >
                  <div className="flex justify-between items-center gap-2">
                    <div className="min-w-0">
                      <h4 className="font-bold text-white text-xs truncate">
                        {c.firstName} {c.lastName}
                      </h4>
                      <p className="text-[11px] text-zinc-500 font-sans truncate">
                        {c.guardianName || 'No guardian on file'}
                      </p>
                    </div>
                    <span className="inline-flex items-center gap-1 text-[10px] font-mono text-cyan-400 opacity-70 group-hover:opacity-100">
                      Chart <ArrowRight className="w-3 h-3" />
                    </span>
                  </div>
                </Link>
              ))}

              {metrics.activeClients.length === 0 && (
                <div className="p-6 text-center text-xs text-zinc-500 border border-dashed border-white/10 rounded-2xl bg-zinc-950/40">
                  No ACTIVE clients in scope. Caseload stays empty until first-session activation.
                </div>
              )}

              {metrics.activeCaseload > metrics.activeClients.length && (
                <p className="text-[10px] font-mono text-zinc-600 text-center pt-1">
                  Showing {metrics.activeClients.length} of {metrics.activeCaseload}
                </p>
              )}
            </div>
          </Card>

          <Card className="p-6 bg-zinc-950/80 border border-white/10 backdrop-blur-xl rounded-3xl shadow-xl space-y-4">
            <div className="flex justify-between items-center border-b border-white/10 pb-4">
              <h3 className="text-base font-bold text-white font-heading flex items-center gap-2">
                <Activity className="w-4 h-4 text-teal-400" />
                BCBA caseload balance
              </h3>
              <span className="text-xs font-mono text-zinc-400">
                {metrics.bcbaLoads.length} listed
              </span>
            </div>

            <div className="space-y-3">
              {metrics.bcbaLoads.map((bcba) => (
                <div
                  key={bcba.id}
                  className="p-3.5 bg-zinc-900/40 border border-white/5 rounded-2xl flex justify-between items-center"
                >
                  <div className="min-w-0">
                    <h4 className="font-bold text-white text-xs truncate">
                      {bcba.firstName} {bcba.lastName}
                    </h4>
                    <p className="text-[11px] text-zinc-400 font-sans truncate">{bcba.email}</p>
                  </div>
                  <div className="text-right font-mono shrink-0 pl-2">
                    <span className="text-sm font-bold text-cyan-400">{bcba.activeCount}</span>
                    <span className="text-[10px] text-zinc-500 block">
                      active / {bcba.assignedCount} assigned
                    </span>
                  </div>
                </div>
              ))}

              {metrics.bcbaLoads.length === 0 && (
                <div className="p-6 text-center text-xs text-zinc-500 border border-dashed border-white/10 rounded-2xl bg-zinc-950/40">
                  No active BCBAs registered in the system.
                </div>
              )}
            </div>
          </Card>

          <Card className="p-5 bg-zinc-950/80 border border-white/10 backdrop-blur-xl rounded-3xl shadow-xl space-y-3">
            <h3 className="text-sm font-bold text-white font-heading">Quick links</h3>
            <div className="flex flex-col gap-2">
              <QuickLink href="/portal-clinical/notes" label="Unsigned notes queue" />
              <QuickLink href="/notes?queue=ready" label="Notes → Ready for Plutus" />
              <QuickLink href="/portal-clinical/bcbas" label="Clinical BCBA queue" />
              <QuickLink href="/portal-clinical/daily" label="Daily workstation" />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function QuickLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-zinc-900/50 border border-white/5 hover:border-brand-orange-500/40 text-xs text-zinc-300 hover:text-white transition-all duration-300 cursor-pointer group"
    >
      <span>{label}</span>
      <ArrowRight className="w-3.5 h-3.5 text-zinc-600 group-hover:text-brand-orange-400" />
    </Link>
  );
}

function CheckEmptyIcon() {
  return (
    <div className="mx-auto w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
      <Activity className="w-5 h-5 text-emerald-400/80" />
    </div>
  );
}
