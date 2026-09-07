'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowRight, BookOpen } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { DonutChartWidget } from '@/components/ui/AnalyticsCharts';
import type { BillingDashboardMetrics } from '@/lib/billingPaQueueMetrics';
import { summarizeDenialPlaybookHints } from '@/lib/denialAppealEngine';

export default function BillingDashboard({ metrics }: { metrics: BillingDashboardMetrics }) {
  const denialHints = summarizeDenialPlaybookHints(4);
  const openWork =
    metrics.pendingVob +
    metrics.assessmentInFlight +
    metrics.treatmentReady +
    metrics.treatmentInFlight;
  const roster = metrics.assessmentRoster + metrics.treatmentRoster;
  const clearPct = roster > 0 ? Math.round(((roster - openWork) / roster) * 100) : 100;

  return (
    <div className="space-y-8 mt-6 pb-12 animate-fade-in-up">
      <div className="relative overflow-hidden p-8 rounded-3xl bg-gradient-to-r from-zinc-950 via-zinc-900 to-zinc-950 border border-white/10 shadow-2xl backdrop-blur-2xl">
        <div className="absolute top-0 right-1/4 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-10 w-96 h-96 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-mono text-[11px] font-bold">
              <span className="dot-live" />
              <span>BILLING COMMAND CENTER • PA &amp; CLAIMS</span>
            </div>

            <h1 className="text-3xl lg:text-4xl font-extrabold text-white font-heading tracking-tight leading-tight">
              Billing Dashboard{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-teal-300 to-amber-300">
                &amp; Analytics
              </span>
            </h1>

            <p className="text-sm text-zinc-400 max-w-2xl font-sans leading-relaxed">
              Live VOB, Assessment PA, and Treatment PA volume. Open the queue, then the
              client profile, to record VOB and PA decisions — this page is statistics only.
            </p>
          </div>

          <div className="flex flex-col gap-4 flex-shrink-0">
            <div className="grid grid-cols-3 gap-2.5">
              {[
                { code: '97151', label: 'Assessment', tone: 'text-emerald-400' },
                { code: '97153', label: 'Direct RBT', tone: 'text-teal-400' },
                { code: '97155', label: 'Protocol mod · qualified clinician', tone: 'text-violet-400' },
              ].map((cpt) => (
                <div
                  key={cpt.code}
                  className="rounded-2xl border border-white/10 bg-zinc-900/90 p-3 text-center font-mono backdrop-blur-xl"
                >
                  <span className={`block text-[10px] font-bold ${cpt.tone}`}>CPT {cpt.code}</span>
                  <span className="mt-1 block text-xs font-bold text-zinc-300">{cpt.label}</span>
                </div>
              ))}
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <Link
                href="/portal-billing/clients"
                className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-bold text-xs px-5 h-11 rounded-xl shadow-[0_0_20px_rgba(16,185,129,0.3)] transition-all hover:scale-105 cursor-pointer flex items-center justify-center gap-2"
              >
                <span>View PA Queue</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                href="/portal-billing/claims"
                className="bg-gradient-to-r from-brand-orange-500 to-amber-600 hover:from-brand-orange-600 hover:to-amber-700 text-white font-bold text-xs px-5 h-11 rounded-xl shadow-[0_0_20px_rgba(255,107,0,0.25)] transition-all hover:scale-105 cursor-pointer flex items-center justify-center gap-2"
              >
                <span>Session Claims</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>
      </div>


      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
        <Card className="bg-zinc-950/80 backdrop-blur-xl border border-white/10 shadow-xl rounded-2xl">
          <CardContent className="p-6 space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-xs font-mono font-bold text-emerald-400 uppercase tracking-wider">
                PENDING VOB
              </span>
              <span className="px-2.5 py-1 rounded-full text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                ASSESS
              </span>
            </div>
            <div>
              <h3 className="text-3xl font-black text-white font-mono tracking-tight">
                {metrics.pendingVob}
              </h3>
              <p className="text-xs text-zinc-400 mt-1">Benefits / credentialing incomplete</p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-zinc-950/80 backdrop-blur-xl border border-white/10 shadow-xl rounded-2xl">
          <CardContent className="p-6 space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-xs font-mono font-bold text-teal-400 uppercase tracking-wider">
                ASSESSMENT IN FLIGHT
              </span>
              <span className="px-2.5 py-1 rounded-full text-[10px] font-mono font-bold bg-teal-500/10 text-teal-400 border border-teal-500/20">
                97151
              </span>
            </div>
            <div>
              <h3 className="text-3xl font-black text-white font-mono tracking-tight">
                {metrics.assessmentInFlight}
              </h3>
              <p className="text-xs text-zinc-400 mt-1">Submit, track, or denied Assessment PA</p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-zinc-950/80 backdrop-blur-xl border border-white/10 shadow-xl rounded-2xl">
          <CardContent className="p-6 space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-xs font-mono font-bold text-brand-orange-400 uppercase tracking-wider">
                TREATMENT PA
              </span>
              <span className="px-2.5 py-1 rounded-full text-[10px] font-mono font-bold bg-brand-orange-500/10 text-brand-orange-400 border border-brand-orange-500/20">
                TX
              </span>
            </div>
            <div>
              <h3 className="text-3xl font-black text-white font-mono tracking-tight">
                {metrics.treatmentReady + metrics.treatmentInFlight}
              </h3>
              <p className="text-xs text-zinc-400 mt-1">
                {metrics.treatmentReady} ready · {metrics.treatmentInFlight} tracking
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-zinc-950/80 backdrop-blur-xl border border-white/10 shadow-xl rounded-2xl">
          <CardContent className="p-6 space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-xs font-mono font-bold text-rose-400 uppercase tracking-wider">
                ATTENTION
              </span>
              <span className="px-2.5 py-1 rounded-full text-[10px] font-mono font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                DENIED
              </span>
            </div>
            <div>
              <h3 className="text-3xl font-black text-white font-mono tracking-tight">
                {metrics.deniedAttention}
              </h3>
              <p className="text-xs text-zinc-400 mt-1">
                Denials / unresolved P2P · {metrics.assessmentExpiring + metrics.treatmentExpiring}{' '}
                expiring &lt;45d
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <DonutChartWidget
          title="Roster not in open work"
          percentage={Math.min(100, Math.max(0, clearPct))}
          label="Clear of VOB / in-flight PA"
          color="#10B981"
        />
        <Card className="bg-zinc-950/80 backdrop-blur-xl border border-white/10 rounded-2xl">
          <CardContent className="p-5 space-y-2">
            <p className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-500">
              Roster size
            </p>
            <p className="text-sm text-zinc-300">
              <span className="font-mono text-white">{metrics.assessmentRoster}</span> assessment
              phase ·{' '}
              <span className="font-mono text-white">{metrics.treatmentRoster}</span> treatment
              phase
            </p>
            <p className="text-xs text-zinc-500">
              Work happens on Clients. Dashboard never records VOB or PA decisions.
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="relative overflow-hidden rounded-3xl border border-cyan-500/20 bg-zinc-950/80 backdrop-blur-xl p-6 shadow-xl">
        <div className="pointer-events-none absolute -right-16 top-0 h-40 w-40 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="relative flex items-start gap-3">
          <BookOpen className="h-5 w-5 text-cyan-400 shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <h2 className="font-heading text-lg font-bold text-white">Denial playbook hints</h2>
            <p className="text-xs text-zinc-500 mt-1">
              Read-only coaching from common CARC codes — use before filing claims. Not live 835
              remittance.
            </p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {denialHints.map((hint) => (
                <div
                  key={hint.code}
                  className="rounded-2xl border border-white/10 bg-zinc-900/50 p-4 transition-all duration-300 hover:border-cyan-500/30"
                >
                  <p className="text-xs font-mono font-bold text-cyan-400">{hint.code}</p>
                  <p className="text-sm font-heading font-semibold text-white mt-1">{hint.title}</p>
                  <p className="text-[11px] text-zinc-400 mt-2">{hint.recommendedAction}</p>
                </div>
              ))}
            </div>
            <Link
              href="/portal-billing/claims"
              className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-brand-orange-400 hover:text-brand-orange-300 cursor-pointer transition-colors"
            >
              Open session claims queue <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
