'use client';

import React from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import {
  ArrowRight,
  CalendarClock,
  ClipboardCheck,
  FileCheck2,
  Send,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import {
  buildClinicalSupportQueues,
  type ClinicalSupportClient as ClinicalSupportClientSummary,
} from './clinicalSupportWorkflow';

type KpiCard = {
  label: string;
  detail: string;
  value: number;
  icon: LucideIcon;
  badge: string;
  styles: {
    label: string;
    badge: string;
    icon: string;
    hover: string;
  };
};

export default function ClinicalSupportDashboard({
  clients,
}: {
  clients: ClinicalSupportClientSummary[];
}) {
  const queues = buildClinicalSupportQueues(clients);
  const kpis: KpiCard[] = [
    {
      label: 'Docs to verify',
      detail: 'Intake-approved packets awaiting clinical review',
      value: queues.documentReview.length,
      icon: ClipboardCheck,
      badge: 'Clinical review',
      styles: {
        label: 'text-brand-orange-400',
        badge:
          'border-brand-orange-500/20 bg-brand-orange-500/10 text-brand-orange-400',
        icon:
          'border-brand-orange-500/20 bg-brand-orange-500/10 text-brand-orange-400',
        hover: 'hover:border-brand-orange-500/50',
      },
    },
    {
      label: 'Assessments to schedule',
      detail: 'Approved 97151 authorizations needing a real ET date',
      value: queues.assessmentScheduling.length,
      icon: CalendarClock,
      badge: 'PA approved',
      styles: {
        label: 'text-amber-400',
        badge: 'border-amber-500/20 bg-amber-500/10 text-amber-400',
        icon: 'border-amber-500/20 bg-amber-500/10 text-amber-400',
        hover: 'hover:border-amber-500/50',
      },
    },
    {
      label: 'Reports to assemble',
      detail: 'Scheduled assessments waiting on plan and signatures',
      value: queues.reportAssembly.length,
      icon: FileCheck2,
      badge: 'Report prep',
      styles: {
        label: 'text-cyan-400',
        badge: 'border-cyan-500/20 bg-cyan-500/10 text-cyan-400',
        icon: 'border-cyan-500/20 bg-cyan-500/10 text-cyan-400',
        hover: 'hover:border-cyan-500/50',
      },
    },
    {
      label: 'Ready for Billing',
      detail: 'Assembled packets awaiting Treatment PA submission',
      value: queues.billingHandoff.length,
      icon: Send,
      badge: 'Billing claims',
      styles: {
        label: 'text-emerald-400',
        badge: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400',
        icon: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400',
        hover: 'hover:border-emerald-500/50',
      },
    },
  ];

  return (
    <div className="mt-6 space-y-8 pb-12 animate-fade-in-up">
      <div className="group relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-r from-zinc-950 via-zinc-900 to-zinc-950 p-7 shadow-2xl backdrop-blur-2xl md:p-8">
          <div className="pointer-events-none absolute right-1/4 top-0 h-96 w-96 rounded-full bg-brand-orange-500/10 blur-3xl" />
          <div className="pointer-events-none absolute bottom-0 left-10 h-96 w-96 rounded-full bg-cyan-500/10 blur-3xl" />

          <div className="relative z-10 flex flex-col justify-between gap-6 lg:flex-row lg:items-center">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-brand-orange-500/20 bg-brand-orange-500/10 px-3 py-1 font-mono text-[11px] font-bold text-brand-orange-400">
                <span className="dot-live" />
                <span>CLINICAL SUPPORT · LIVE HANDOFFS</span>
              </div>

              <h1 className="font-heading text-3xl font-extrabold leading-tight tracking-tight text-white lg:text-4xl">
                Clinical Support{' '}
                <span className="bg-gradient-to-r from-brand-orange-400 via-amber-300 to-cyan-300 bg-clip-text text-transparent">
                  Workflow Command
                </span>
              </h1>

              <p className="max-w-2xl text-sm leading-relaxed text-zinc-400">
                Move each client through one durable handoff at a time: clinical
                verification, 97151 scheduling in ET, signed report assembly, then
                Billing&apos;s PA tracker and session claims pipeline.
              </p>
            </div>

            <Link
              href="/clinical-support/clients"
              className="flex h-11 flex-shrink-0 cursor-pointer items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand-orange-500 to-orange-600 px-5 text-xs font-bold text-white shadow-[0_0_20px_rgba(255,107,0,0.3)] transition-all hover:scale-105 hover:from-brand-orange-600 hover:to-orange-700"
            >
              <span>Open full queue</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
          {kpis.map((item) => {
            const Icon = item.icon;
            return (
              <Card
                key={item.label}
                className={`relative overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/80 shadow-xl backdrop-blur-xl transition-all duration-300 hover:scale-[1.02] ${item.styles.hover}`}
              >
                <CardContent className="space-y-4 p-6">
                  <div className="flex items-center justify-between gap-3">
                    <span
                      className={`font-mono text-[11px] font-bold uppercase tracking-wider ${item.styles.label}`}
                    >
                      {item.label}
                    </span>
                    <span
                      className={`rounded-full border px-2.5 py-1 font-mono text-[9px] font-bold uppercase tracking-wider ${item.styles.badge}`}
                    >
                      {item.badge}
                    </span>
                  </div>
                  <div className="flex items-end justify-between gap-4">
                    <div>
                      <h3 className="font-mono text-3xl font-black tracking-tight text-white">
                        {item.value}
                      </h3>
                      <p className="mt-1 text-xs leading-relaxed text-zinc-400">
                        {item.detail}
                      </p>
                    </div>
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${item.styles.icon}`}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

      {queues.total > 0 && (
        <div className="flex justify-center">
          <Link
            href="/clinical-support/clients"
            className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-zinc-950/70 px-4 py-2.5 text-xs font-bold text-zinc-300 transition-all duration-300 hover:border-brand-orange-500/40 hover:text-white"
          >
            Review every open handoff
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      )}
    </div>
  );
}
