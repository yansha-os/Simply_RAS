'use client';

import React from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  FileCheck2,
  Send,
  Sparkles,
  UserRound,
} from 'lucide-react';
import Link from 'next/link';
import {
  clinicalSupportProfileHref,
  getReportReadiness,
  type ClinicalSupportClient as ClientSummary,
  type ClinicalSupportLane,
  type ClinicalSupportQueues,
} from './clinicalSupportWorkflow';

const ET_DATE_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

function updatedLabel(value: string | Date) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Updated recently';
  return ET_DATE_FORMATTER.format(date);
}

function clientName(client: ClientSummary) {
  return `${client.firstName} ${client.lastName}`.trim();
}

function QueueLane({
  title,
  eyebrow,
  subtitle,
  count,
  icon: Icon,
  accentClass,
  emptyTitle,
  emptyCopy,
  children,
}: {
  title: string;
  eyebrow: string;
  subtitle?: string;
  count: number;
  icon: React.ComponentType<{ className?: string }>;
  accentClass: string;
  emptyTitle: string;
  emptyCopy: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex min-h-[28rem] flex-col rounded-2xl border border-white/10 bg-zinc-950/60 p-4 shadow-xl backdrop-blur-xl">
      <div className="mb-4 flex shrink-0 items-start justify-between gap-3 border-b border-white/5 pb-3">
        <div className="min-w-0">
          <p
            className={`font-mono text-[10px] font-bold uppercase tracking-[0.16em] ${accentClass}`}
          >
            {eyebrow}
          </p>
          <h2 className="mt-1 flex items-center gap-2 font-heading text-sm font-bold leading-snug text-white">
            <Icon className="h-4 w-4 shrink-0" />
            <span>{title}</span>
          </h2>
          {subtitle && (
            <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-500">{subtitle}</p>
          )}
        </div>
        <span className="inline-flex min-w-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 px-2.5 py-1 font-mono text-xs font-black text-white">
          {count}
        </span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-0.5">
        {count > 0 ? (
          children
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-white/10 bg-zinc-950/40 px-4 py-8 text-center">
            <CheckCircle2 className="h-6 w-6 text-emerald-400/70" />
            <p className="mt-3 text-sm font-bold text-zinc-200">{emptyTitle}</p>
            <p className="mx-auto mt-1 max-w-[14rem] text-xs leading-relaxed text-zinc-500">
              {emptyCopy}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

function TriageCard({
  client,
  lane,
  badgeLabel,
  badgeClass,
  showBcba = false,
  hoverBorderClass = 'hover:border-brand-orange-500/40',
}: {
  client: ClientSummary;
  lane: ClinicalSupportLane;
  badgeLabel: string;
  badgeClass: string;
  showBcba?: boolean;
  hoverBorderClass?: string;
}) {
  const href = clinicalSupportProfileHref(client.id, lane);

  return (
    <Link href={href} className="group block cursor-pointer">
      <Card
        className={`overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/80 shadow-xl transition-all duration-300 hover:scale-[1.01] hover:shadow-2xl ${hoverBorderClass}`}
      >
        <CardContent className="space-y-3 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="truncate font-heading text-sm font-bold text-white transition-colors group-hover:text-brand-orange-300">
                {clientName(client)}
              </h3>
              <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                {updatedLabel(client.updatedAt)} ET
              </p>
            </div>
            <span
              className={`shrink-0 rounded-full border px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider ${badgeClass}`}
            >
              {badgeLabel}
            </span>
          </div>

          {showBcba && (
            <p className="flex items-center gap-1.5 truncate text-[11px] text-zinc-400">
              <UserRound className="h-3 w-3 shrink-0 text-zinc-500" />
              {client.bcba
                ? `BCBA ${client.bcba.firstName} ${client.bcba.lastName}`
                : 'BCBA unassigned'}
            </p>
          )}

          <div className="flex items-center justify-end gap-1 border-t border-white/5 pt-3 text-[11px] font-bold text-zinc-400 transition-colors group-hover:text-brand-orange-300">
            Review in profile
            <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function MoreInQueue({ total, shown }: { total: number; shown: number }) {
  if (total <= shown) return null;
  return (
    <Link
      href="/clinical-support/clients"
      className="inline-flex cursor-pointer items-center gap-1.5 px-1 text-[11px] font-bold text-zinc-500 transition-colors hover:text-brand-orange-300"
    >
      {total - shown} more in full queue
      <ArrowRight className="h-3 w-3" />
    </Link>
  );
}

export default function ClinicalSupportClient({
  queues,
  limitPerLane,
}: {
  queues: ClinicalSupportQueues;
  limitPerLane?: number;
}) {
  const visible = (clients: ClientSummary[]) =>
    typeof limitPerLane === 'number' ? clients.slice(0, limitPerLane) : clients;

  if (queues.total === 0) {
    return (
      <div className="relative overflow-hidden rounded-3xl border border-emerald-500/20 bg-zinc-950/80 px-6 py-12 text-center shadow-2xl backdrop-blur-xl">
        <div className="pointer-events-none absolute inset-x-1/4 top-0 h-32 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="relative">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-400">
            <Sparkles className="h-6 w-6" />
          </div>
          <h2 className="mt-4 font-heading text-xl font-bold text-white">
            Clinical support queue is clear
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-zinc-400">
            No clients are waiting on clinical verification, 97151 scheduling, report
            assembly, or the Treatment PA handoff to Billing.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex min-w-max gap-4 lg:grid lg:min-w-0 lg:grid-cols-4 lg:gap-4">
        <div className="w-[min(100vw-3rem,19rem)] shrink-0 lg:w-auto lg:min-w-0">
          <QueueLane
            title="Clinical document verification"
            eyebrow="Handoff 01"
            subtitle="Confirm medical necessity after Intake approves the packet."
            count={queues.documentReview.length}
            icon={ClipboardCheck}
            accentClass="text-brand-orange-400"
            emptyTitle="No packets need clinical verification"
            emptyCopy="New work appears here only after Intake approves the complete packet."
          >
            {visible(queues.documentReview).map((client) => {
              const packetApproved = client.intakePacket?.status === 'APPROVED';
              return (
                <TriageCard
                  key={client.id}
                  client={client}
                  lane="documentReview"
                  badgeLabel={packetApproved ? 'Intake approved' : 'Packet mismatch'}
                  badgeClass={
                    packetApproved
                      ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
                      : 'border-rose-500/20 bg-rose-500/10 text-rose-400'
                  }
                />
              );
            })}
            <MoreInQueue
              total={queues.documentReview.length}
              shown={visible(queues.documentReview).length}
            />
          </QueueLane>
        </div>

        <div className="w-[min(100vw-3rem,19rem)] shrink-0 lg:w-auto lg:min-w-0">
          <QueueLane
            title="97151 assessment scheduling"
            eyebrow="Handoff 02"
            subtitle="Schedule the authorized assessment in clinic ET."
            count={queues.assessmentScheduling.length}
            icon={CalendarClock}
            accentClass="text-amber-400"
            emptyTitle="No assessments need scheduling"
            emptyCopy="Assessment PA approvals appear here until a durable 97151 date is saved."
          >
            {visible(queues.assessmentScheduling).map((client) => (
              <TriageCard
                key={client.id}
                client={client}
                lane="assessmentScheduling"
                badgeLabel="97151 authorized"
                badgeClass="border-amber-500/20 bg-amber-500/10 text-amber-400"
                showBcba
                hoverBorderClass="hover:border-amber-500/40"
              />
            ))}
            <MoreInQueue
              total={queues.assessmentScheduling.length}
              shown={visible(queues.assessmentScheduling).length}
            />
          </QueueLane>
        </div>

        <div className="w-[min(100vw-3rem,19rem)] shrink-0 lg:w-auto lg:min-w-0">
          <QueueLane
            title="Signed report assembly"
            eyebrow="Handoff 03"
            subtitle="Assemble the signed treatment plan report for Billing."
            count={queues.reportAssembly.length}
            icon={FileCheck2}
            accentClass="text-cyan-400"
            emptyTitle="No reports need assembly"
            emptyCopy="Scheduled assessments appear here while the treatment plan and signatures are completed."
          >
            {visible(queues.reportAssembly).map((client) => {
              const readiness = getReportReadiness(client.treatmentPlan);
              return (
                <TriageCard
                  key={client.id}
                  client={client}
                  lane="reportAssembly"
                  badgeLabel={
                    readiness.ready ? 'Ready to assemble' : 'Awaiting prerequisites'
                  }
                  badgeClass={
                    readiness.ready
                      ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
                      : 'border-cyan-500/20 bg-cyan-500/10 text-cyan-400'
                  }
                  hoverBorderClass="hover:border-cyan-500/40"
                />
              );
            })}
            <MoreInQueue
              total={queues.reportAssembly.length}
              shown={visible(queues.reportAssembly).length}
            />
          </QueueLane>
        </div>

        <div className="w-[min(100vw-3rem,19rem)] shrink-0 lg:w-auto lg:min-w-0">
          <QueueLane
            title="Ready for billing"
            eyebrow="Handoff 04"
            subtitle="Route assembled reports to Billing for Treatment PA tracking."
            count={queues.billingHandoff.length}
            icon={Send}
            accentClass="text-emerald-400"
            emptyTitle="No packets await Billing handoff"
            emptyCopy="Assembled reports appear here until Treatment PA is marked submitted in RAS."
          >
            {visible(queues.billingHandoff).map((client) => (
              <TriageCard
                key={client.id}
                client={client}
                lane="billingHandoff"
                badgeLabel="Report assembled"
                badgeClass="border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                hoverBorderClass="hover:border-emerald-500/40"
              />
            ))}
            <MoreInQueue
              total={queues.billingHandoff.length}
              shown={visible(queues.billingHandoff).length}
            />
          </QueueLane>
        </div>
      </div>
    </div>
  );
}
