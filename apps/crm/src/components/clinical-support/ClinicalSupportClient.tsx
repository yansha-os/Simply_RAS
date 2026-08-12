'use client';

import React, { useState, useTransition } from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import {
  assembleClinicalSupportReport,
  scheduleClinicalSupportAssessment,
  submitTreatmentPacket,
  verifyDocuments,
} from '@/app/(dashboard)/clinical-support/actions';
import {
  AlertCircle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  FileCheck2,
  FileText,
  Send,
  Sparkles,
  UserRoundCheck,
} from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  getReportReadiness,
  type ClinicalSupportClient as ClientSummary,
  type ClinicalSupportQueues,
} from './clinicalSupportWorkflow';

type ActionResult =
  | { success: boolean; error?: string }
  | { success?: boolean; error?: string }
  | undefined;

const ET_DATE_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

function updatedLabel(value: string | Date) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Updated recently';
  return `Updated ${ET_DATE_FORMATTER.format(date)} ET`;
}

function clientName(client: ClientSummary) {
  return `${client.firstName} ${client.lastName}`.trim();
}

function QueueLane({
  title,
  eyebrow,
  count,
  icon: Icon,
  accentClass,
  emptyTitle,
  emptyCopy,
  children,
}: {
  title: string;
  eyebrow: string;
  count: number;
  icon: React.ComponentType<{ className?: string }>;
  accentClass: string;
  emptyTitle: string;
  emptyCopy: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className={`font-mono text-[10px] font-bold uppercase tracking-[0.16em] ${accentClass}`}>
            {eyebrow}
          </p>
          <h2 className="mt-1 flex items-center gap-2 font-heading text-lg font-bold text-white">
            <Icon className="h-4 w-4" />
            {title}
          </h2>
        </div>
        <span className="inline-flex min-w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 px-2.5 py-1 font-mono text-xs font-black text-white">
          {count}
        </span>
      </div>

      <div className="grid gap-3">
        {count > 0 ? (
          children
        ) : (
          <div className="rounded-2xl border border-dashed border-white/10 bg-zinc-950/40 px-5 py-7 text-center">
            <CheckCircle2 className="mx-auto h-6 w-6 text-emerald-400/70" />
            <p className="mt-3 text-sm font-bold text-zinc-200">{emptyTitle}</p>
            <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-zinc-500">
              {emptyCopy}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

function MoreInQueue({
  total,
  shown,
}: {
  total: number;
  shown: number;
}) {
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
  const [isPending, startTransition] = useTransition();
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [scheduleInputs, setScheduleInputs] = useState<Record<string, string>>({});

  const visible = (clients: ClientSummary[]) =>
    typeof limitPerLane === 'number' ? clients.slice(0, limitPerLane) : clients;

  const runAction = (
    actionKey: string,
    successMessage: string,
    action: () => Promise<ActionResult>,
  ) => {
    setActiveAction(actionKey);
    setErrors((current) => ({ ...current, [actionKey]: '' }));
    startTransition(async () => {
      try {
        const result = await action();
        if (!result?.success) {
          const message = result?.error || 'The workflow action failed. Please try again.';
          setErrors((current) => ({ ...current, [actionKey]: message }));
          toast.error(message);
          return;
        }
        toast.success(successMessage);
      } catch {
        const message = 'The workflow action could not be completed. Please try again.';
        setErrors((current) => ({ ...current, [actionKey]: message }));
        toast.error(message);
      } finally {
        setActiveAction(null);
      }
    });
  };

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
    <div className="grid gap-8 xl:grid-cols-2">
      <QueueLane
        title="Clinical document verification"
        eyebrow="Handoff 01"
        count={queues.documentReview.length}
        icon={ClipboardCheck}
        accentClass="text-brand-orange-400"
        emptyTitle="No packets need clinical verification"
        emptyCopy="New work appears here only after Intake approves the complete packet."
      >
        {visible(queues.documentReview).map((client) => {
          const actionKey = `verify-${client.id}`;
          const packetApproved = client.intakePacket?.status === 'APPROVED';
          const working = isPending && activeAction === actionKey;
          return (
            <Card
              key={client.id}
              className="overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/80 shadow-xl transition-all duration-300 hover:scale-[1.01] hover:border-brand-orange-500/40 hover:shadow-2xl"
            >
              <CardContent className="space-y-4 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <Link
                      href={`/client/${client.id}?mode=clinical`}
                      className="cursor-pointer truncate font-heading text-base font-bold text-white transition-colors hover:text-brand-orange-300"
                    >
                      {clientName(client)}
                    </Link>
                    <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                      {updatedLabel(client.updatedAt)}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full border px-2.5 py-1 font-mono text-[9px] font-bold uppercase tracking-wider ${
                      packetApproved
                        ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
                        : 'border-rose-500/20 bg-rose-500/10 text-rose-400'
                    }`}
                  >
                    {packetApproved ? 'Intake approved' : 'Packet mismatch'}
                  </span>
                </div>

                <div className="rounded-xl border border-white/5 bg-zinc-900/60 p-3 text-xs leading-relaxed text-zinc-400">
                  Confirm medical necessity and the clinical document cross-check. This
                  advances only to <span className="font-mono text-zinc-200">CLINICAL_REVIEW_APPROVED</span>;
                  Billing still owns VOB and Assessment PA.
                </div>

                {!packetApproved && (
                  <p className="flex items-start gap-2 rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-xs text-rose-300">
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    Client status and intake packet disagree. Resolve the packet before
                    approving clinical review.
                  </p>
                )}
                {errors[actionKey] && (
                  <p className="flex items-start gap-2 rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-xs text-rose-300">
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {errors[actionKey]}
                  </p>
                )}

                <div className="flex flex-col gap-2 sm:flex-row">
                  <Link
                    href={`/client/${client.id}?mode=clinical`}
                    className="inline-flex h-9 flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 text-xs font-bold text-zinc-300 transition-all hover:border-brand-orange-500/30 hover:text-white"
                  >
                    <FileText className="h-3.5 w-3.5" />
                    Review client record
                  </Link>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() =>
                      runAction(
                        actionKey,
                        'Clinical review approved and handed to Billing for VOB.',
                        () => verifyDocuments(client.id),
                      )
                    }
                    disabled={!packetApproved || isPending}
                    isLoading={working}
                    className={`flex-1 bg-brand-orange-600 text-white hover:bg-brand-orange-500 ${
                      !packetApproved || isPending
                        ? 'cursor-not-allowed'
                        : 'cursor-pointer'
                    }`}
                  >
                    <UserRoundCheck className="mr-2 h-3.5 w-3.5" />
                    Approve clinical review
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
        <MoreInQueue
          total={queues.documentReview.length}
          shown={visible(queues.documentReview).length}
        />
      </QueueLane>

      <QueueLane
        title="97151 assessment scheduling"
        eyebrow="Handoff 02"
        count={queues.assessmentScheduling.length}
        icon={CalendarClock}
        accentClass="text-amber-400"
        emptyTitle="No assessments need scheduling"
        emptyCopy="Assessment PA approvals appear here until a durable 97151 date is saved."
      >
        {visible(queues.assessmentScheduling).map((client) => {
          const actionKey = `schedule-${client.id}`;
          const scheduledValue = scheduleInputs[client.id] || '';
          const working = isPending && activeAction === actionKey;
          return (
            <Card
              key={client.id}
              className="overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/80 shadow-xl transition-all duration-300 hover:scale-[1.01] hover:border-amber-500/40 hover:shadow-2xl"
            >
              <CardContent className="space-y-4 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <Link
                      href={`/client/${client.id}?mode=assessment_prep`}
                      className="cursor-pointer truncate font-heading text-base font-bold text-white transition-colors hover:text-amber-300"
                    >
                      {clientName(client)}
                    </Link>
                    <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                      {updatedLabel(client.updatedAt)}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 font-mono text-[9px] font-bold uppercase tracking-wider text-amber-400">
                    97151 authorized
                  </span>
                </div>

                <div className="rounded-xl border border-white/5 bg-zinc-900/60 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                    Assigned BCBA
                  </p>
                  <p className="mt-1 text-sm font-medium text-zinc-200">
                    {client.bcba
                      ? `${client.bcba.firstName} ${client.bcba.lastName}`
                      : 'Unassigned — Clinical Support owned'}
                  </p>
                </div>

                <label className="block space-y-2">
                  <span className="flex items-center justify-between gap-3 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                    Assessment date &amp; time
                    <span className="font-mono text-amber-400">America/New_York · ET</span>
                  </span>
                  <input
                    type="datetime-local"
                    value={scheduledValue}
                    onChange={(event) =>
                      setScheduleInputs((current) => ({
                        ...current,
                        [client.id]: event.target.value,
                      }))
                    }
                    disabled={isPending}
                    className={`w-full rounded-xl border border-white/10 bg-zinc-950 px-3 py-2.5 text-sm text-white outline-none [color-scheme:dark] transition-all focus:border-amber-500/60 ${
                      isPending ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
                    }`}
                  />
                </label>

                <p className="text-[11px] leading-relaxed text-zinc-500">
                  Saves a durable scheduled Session (CPT 97151) and advances the client
                  to <span className="font-mono text-zinc-300">ASSESSMENT_SCHEDULED</span>.
                </p>
                {errors[actionKey] && (
                  <p className="flex items-start gap-2 rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-xs text-rose-300">
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {errors[actionKey]}
                  </p>
                )}

                <Button
                  type="button"
                  size="sm"
                  onClick={() =>
                    runAction(
                      actionKey,
                      'Assessment scheduled in ET and handed to the BCBA.',
                      // Preserve the raw datetime-local string: the server owns ET conversion.
                      () =>
                        scheduleClinicalSupportAssessment(
                          client.id,
                          scheduledValue,
                          client.status,
                          client.bcbaId
                        ),
                    )
                  }
                  disabled={!scheduledValue || isPending}
                  isLoading={working}
                  className={`w-full bg-amber-600 text-white hover:bg-amber-500 ${
                    !scheduledValue || isPending
                      ? 'cursor-not-allowed'
                      : 'cursor-pointer'
                  }`}
                >
                  <CalendarClock className="mr-2 h-3.5 w-3.5" />
                  Confirm 97151 schedule
                </Button>
              </CardContent>
            </Card>
          );
        })}
        <MoreInQueue
          total={queues.assessmentScheduling.length}
          shown={visible(queues.assessmentScheduling).length}
        />
      </QueueLane>

      <QueueLane
        title="Signed report assembly"
        eyebrow="Handoff 03"
        count={queues.reportAssembly.length}
        icon={FileCheck2}
        accentClass="text-cyan-400"
        emptyTitle="No reports need assembly"
        emptyCopy="Scheduled assessments appear here while the treatment plan and signatures are completed."
      >
        {visible(queues.reportAssembly).map((client) => {
          const actionKey = `assemble-${client.id}`;
          const readiness = getReportReadiness(client.treatmentPlan);
          const working = isPending && activeAction === actionKey;
          return (
            <Card
              key={client.id}
              className="overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/80 shadow-xl transition-all duration-300 hover:scale-[1.01] hover:border-cyan-500/40 hover:shadow-2xl"
            >
              <CardContent className="space-y-4 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <Link
                      href={`/client/${client.id}?mode=treatment_plan`}
                      className="cursor-pointer truncate font-heading text-base font-bold text-white transition-colors hover:text-cyan-300"
                    >
                      {clientName(client)}
                    </Link>
                    <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                      {updatedLabel(client.updatedAt)}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full border px-2.5 py-1 font-mono text-[9px] font-bold uppercase tracking-wider ${
                      readiness.ready
                        ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
                        : 'border-cyan-500/20 bg-cyan-500/10 text-cyan-400'
                    }`}
                  >
                    {readiness.ready ? 'Ready to assemble' : 'Waiting on prerequisites'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div
                    className={`rounded-xl border p-3 ${
                      readiness.planComplete
                        ? 'border-emerald-500/20 bg-emerald-500/10'
                        : 'border-amber-500/20 bg-amber-500/10'
                    }`}
                  >
                    <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                      BCBA plan
                    </p>
                    <p
                      className={`mt-1 text-xs font-bold ${
                        readiness.planComplete ? 'text-emerald-400' : 'text-amber-400'
                      }`}
                    >
                      {readiness.planComplete ? 'Submitted' : 'Pending'}
                    </p>
                  </div>
                  <div
                    className={`rounded-xl border p-3 ${
                      readiness.parentSigned
                        ? 'border-emerald-500/20 bg-emerald-500/10'
                        : 'border-amber-500/20 bg-amber-500/10'
                    }`}
                  >
                    <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                      Parent signature
                    </p>
                    <p
                      className={`mt-1 text-xs font-bold ${
                        readiness.parentSigned ? 'text-emerald-400' : 'text-amber-400'
                      }`}
                    >
                      {readiness.parentSigned ? 'Signed' : 'Pending'}
                    </p>
                  </div>
                </div>

                {!readiness.ready && (
                  <p className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-300">
                    Waiting on {readiness.blockers.join(' and ')}. Report assembly cannot
                    advance the status until both are durable.
                  </p>
                )}
                {errors[actionKey] && (
                  <p className="flex items-start gap-2 rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-xs text-rose-300">
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {errors[actionKey]}
                  </p>
                )}

                <div className="flex flex-col gap-2 sm:flex-row">
                  <Link
                    href={`/client/${client.id}?mode=treatment_plan`}
                    className="inline-flex h-9 flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 text-xs font-bold text-zinc-300 transition-all hover:border-cyan-500/30 hover:text-white"
                  >
                    <FileText className="h-3.5 w-3.5" />
                    Open treatment plan
                  </Link>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() =>
                      runAction(
                        actionKey,
                        'Report assembled and handed to Billing.',
                        () => assembleClinicalSupportReport(client.id),
                      )
                    }
                    disabled={!readiness.ready || isPending}
                    isLoading={working}
                    className={`flex-1 bg-cyan-600 text-white hover:bg-cyan-500 ${
                      !readiness.ready || isPending
                        ? 'cursor-not-allowed'
                        : 'cursor-pointer'
                    }`}
                  >
                    <FileCheck2 className="mr-2 h-3.5 w-3.5" />
                    Assemble report
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
        <MoreInQueue
          total={queues.reportAssembly.length}
          shown={visible(queues.reportAssembly).length}
        />
      </QueueLane>

      <QueueLane
        title="Treatment PA billing handoff"
        eyebrow="Handoff 04"
        count={queues.billingHandoff.length}
        icon={Send}
        accentClass="text-emerald-400"
        emptyTitle="No packets await Billing handoff"
        emptyCopy="Assembled reports appear here until the manual Plutus tracker is marked submitted."
      >
        {visible(queues.billingHandoff).map((client) => {
          const actionKey = `submit-${client.id}`;
          const working = isPending && activeAction === actionKey;
          return (
            <Card
              key={client.id}
              className="overflow-hidden rounded-2xl border border-emerald-500/20 bg-zinc-950/80 shadow-xl transition-all duration-300 hover:scale-[1.01] hover:border-emerald-500/40 hover:shadow-2xl"
            >
              <CardContent className="space-y-4 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <Link
                      href={`/client/${client.id}?tab=billing`}
                      className="cursor-pointer truncate font-heading text-base font-bold text-white transition-colors hover:text-emerald-300"
                    >
                      {clientName(client)}
                    </Link>
                    <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                      {updatedLabel(client.updatedAt)}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 font-mono text-[9px] font-bold uppercase tracking-wider text-emerald-400">
                    Report assembled
                  </span>
                </div>

                <div className="rounded-xl border border-emerald-500/10 bg-emerald-500/5 p-3 text-xs leading-relaxed text-zinc-400">
                  Mark the Treatment PA tracker submitted. The PA row and client status
                  advance together to prevent a partial Billing handoff.
                </div>
                {errors[actionKey] && (
                  <p className="flex items-start gap-2 rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-xs text-rose-300">
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {errors[actionKey]}
                  </p>
                )}

                <Button
                  type="button"
                  size="sm"
                  onClick={() =>
                    runAction(
                      actionKey,
                      'Treatment PA marked submitted and routed to Billing.',
                      () => submitTreatmentPacket(client.id),
                    )
                  }
                  disabled={isPending}
                  isLoading={working}
                  className={`w-full bg-emerald-600 text-white hover:bg-emerald-500 ${
                    isPending ? 'cursor-not-allowed' : 'cursor-pointer'
                  }`}
                >
                  <Send className="mr-2 h-3.5 w-3.5" />
                  Confirm Plutus submission
                </Button>
              </CardContent>
            </Card>
          );
        })}
        <MoreInQueue
          total={queues.billingHandoff.length}
          shown={visible(queues.billingHandoff).length}
        />
      </QueueLane>
    </div>
  );
}
