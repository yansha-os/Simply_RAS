'use client';

import React, { useState, useTransition } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  CircleSlash2,
  Clock,
  Database,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import OpsAuditReportCompiler from './OpsAuditReportCompiler';
import {
  getOpsDepartmentMetrics,
  type OpsDashboardData,
  type OpsDashboardResult,
} from '@/app/(dashboard)/ops/actions';
import { CLINIC_TIME_ZONE } from '@/lib/clinicTimezone';

const DAY_MS = 24 * 60 * 60 * 1000;
const CLINIC_DATE = new Intl.DateTimeFormat('en-US', {
  timeZone: CLINIC_TIME_ZONE,
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});
const CLINIC_DATE_TIME = new Intl.DateTimeFormat('en-US', {
  timeZone: CLINIC_TIME_ZONE,
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZoneName: 'short',
});

type DepartmentCardProps = {
  index: string;
  label: string;
  value: number;
  description: string;
  badge: string;
  evidenceLabel: string;
  evidenceValue: string;
  evidenceNote: string;
  href: string;
  linkLabel: string;
  accent: {
    text: string;
    border: string;
    badge: string;
    glow: string;
  };
};

function DepartmentCard({
  index,
  label,
  value,
  description,
  badge,
  evidenceLabel,
  evidenceValue,
  evidenceNote,
  href,
  linkLabel,
  accent,
}: DepartmentCardProps) {
  return (
    <Card
      className={`group relative overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/80 shadow-xl backdrop-blur-xl transition-all duration-300 hover:scale-[1.01] ${accent.border} ${accent.glow}`}
    >
      <CardContent className="space-y-4 p-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-xl border bg-white/[0.03] text-xs font-bold ${accent.text}`}
            >
              {index}
            </div>
            <span className={`font-mono text-xs font-bold uppercase tracking-wider ${accent.text}`}>
              {label}
            </span>
          </div>
          <span
            className={`rounded-full border px-2.5 py-1 font-mono text-[10px] font-bold ${accent.badge}`}
          >
            {badge}
          </span>
        </div>

        <div>
          <h3 className="font-mono text-3xl font-black tracking-tight text-white">{value}</h3>
          <p className="mt-1 text-xs text-zinc-400">{description}</p>
        </div>

        <div className="space-y-1.5 border-t border-white/5 pt-3">
          <div className="flex items-center justify-between gap-3 font-mono text-[11px]">
            <span className="text-zinc-500">{evidenceLabel}</span>
            <span className="font-bold text-zinc-200">{evidenceValue}</span>
          </div>
          <p className="text-[10px] leading-relaxed text-zinc-600">{evidenceNote}</p>
        </div>

        <Link
          href={href}
          className={`flex cursor-pointer items-center justify-between pt-1 text-xs font-bold transition-all group-hover:translate-x-1 hover:text-white ${accent.text}`}
        >
          <span>{linkLabel}</span>
          <ArrowRight className="h-4 w-4" />
        </Link>
      </CardContent>
    </Card>
  );
}

function RateCard({
  title,
  value,
  detail,
  colorClass,
}: {
  title: string;
  value: number | null;
  detail: string;
  colorClass: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/80 p-5 shadow-xl backdrop-blur-xl">
      <div className="absolute -right-10 -top-10 h-28 w-28 rounded-full bg-white/[0.03] blur-2xl" />
      <p className="relative font-mono text-[10px] font-bold uppercase tracking-wider text-zinc-500">
        {title}
      </p>
      {value === null ? (
        <div className="relative mt-3">
          <p className="font-heading text-xl font-bold text-zinc-300">Unavailable</p>
          <p className="mt-1 text-xs leading-relaxed text-zinc-500">{detail}</p>
        </div>
      ) : (
        <div className="relative mt-3 flex items-end justify-between gap-3">
          <div>
            <p className={`font-mono text-3xl font-black ${colorClass}`}>{value}%</p>
            <p className="mt-1 text-xs leading-relaxed text-zinc-500">{detail}</p>
          </div>
          <div
            className={`h-12 w-12 rounded-full border border-white/10 bg-zinc-900 p-1.5 ${colorClass}`}
          >
            <div
              className="h-full w-full rounded-full border-4 border-current opacity-70"
              style={{ color: value === 0 ? '#71717a' : undefined }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function MonthlyClientChart({ data }: { data: OpsDashboardData['monthlyNewClients'] }) {
  const max = Math.max(...data.map((point) => point.value), 0);

  return (
    <div className="rounded-2xl border border-white/10 bg-zinc-950/80 p-5 shadow-xl backdrop-blur-xl lg:col-span-2">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-heading text-sm font-bold text-white">Monthly New Client Records</h2>
          <p className="mt-1 text-xs text-zinc-500">
            Client rows created in each UTC calendar month; this is not a conversion metric.
          </p>
        </div>
        <Database className="h-5 w-5 shrink-0 text-brand-orange-400" />
      </div>

      {max === 0 ? (
        <div className="mt-5 rounded-xl border border-dashed border-white/10 bg-zinc-950/60 px-5 py-10 text-center">
          <CircleSlash2 className="mx-auto h-7 w-7 text-zinc-600" />
          <p className="mt-2 text-sm font-semibold text-zinc-300">No client records in this window</p>
          <p className="mt-1 text-xs text-zinc-600">All seven monthly database counts returned zero.</p>
        </div>
      ) : (
        <div
          className="mt-6 grid h-48 grid-cols-7 items-end gap-2"
          role="img"
          aria-label={`Monthly new client counts: ${data
            .map((point) => `${point.label} ${point.value}`)
            .join(', ')}`}
        >
          {data.map((point) => {
            const height = point.value === 0 ? 2 : Math.max((point.value / max) * 100, 8);
            return (
              <div key={point.label} className="flex h-full min-w-0 flex-col justify-end gap-2">
                <span className="text-center font-mono text-[10px] font-bold text-zinc-300">
                  {point.value}
                </span>
                <div className="flex h-32 items-end overflow-hidden rounded-lg border border-white/5 bg-zinc-900/80 p-1">
                  <div
                    className="w-full rounded-md bg-gradient-to-t from-brand-orange-600 to-amber-300 shadow-[0_0_18px_rgba(255,107,0,0.2)] transition-all duration-500"
                    style={{ height: `${height}%` }}
                  />
                </div>
                <span className="truncate text-center font-mono text-[10px] text-zinc-500">
                  {point.label}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function OpsDashboardClient({
  initialResult,
}: {
  initialResult: OpsDashboardResult;
}) {
  const [data, setData] = useState<OpsDashboardData | null>(
    initialResult.success ? initialResult.data : null
  );
  const [error, setError] = useState<string | null>(
    initialResult.success ? null : initialResult.error
  );
  const [isRefreshing, startRefresh] = useTransition();

  const refresh = () => {
    startRefresh(async () => {
      try {
        const result = await getOpsDepartmentMetrics();
        if (result.success) {
          setData(result.data);
          setError(null);
          return;
        }
        setError(result.error);
      } catch {
        setError('Unable to refresh the operations snapshot. Please try again.');
      }
    });
  };

  if (!data) {
    return (
      <div className="relative mt-6 overflow-hidden rounded-3xl border border-rose-500/20 bg-zinc-950/90 p-10 shadow-2xl backdrop-blur-2xl">
        <div className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-rose-500/10 blur-3xl" />
        <div className="relative mx-auto max-w-xl text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-rose-500/20 bg-rose-500/10 text-rose-400 shadow-[0_0_24px_rgba(244,63,94,0.15)]">
            <AlertTriangle className="h-7 w-7" />
          </div>
          <h1 className="mt-5 font-heading text-2xl font-bold text-white">
            Operations snapshot unavailable
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-zinc-400">
            {error ?? 'The command center could not load its database snapshot.'}
          </p>
          <button
            type="button"
            onClick={refresh}
            disabled={isRefreshing}
            className="mt-6 inline-flex cursor-pointer items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-5 py-2.5 text-xs font-bold text-rose-300 transition-all hover:border-rose-400/50 hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            {isRefreshing ? 'Retrying…' : 'Retry database snapshot'}
          </button>
        </div>
      </div>
    );
  }

  const { metrics } = data;
  const snapshotTime = new Date(data.generatedAt).getTime();
  const snapshotLabel = CLINIC_DATE_TIME.format(new Date(data.generatedAt));
  const agedCutoffLabel = CLINIC_DATE_TIME.format(new Date(data.scope.agedNoteCutoff));
  const paWindowEndLabel = CLINIC_DATE.format(new Date(data.scope.paRiskWindowEnd));
  const allOperationalCountsZero =
    metrics.totalClients === 0 &&
    metrics.agedUnconvertedNotes === 0 &&
    metrics.caseCoordOpenActionItems === 0 &&
    metrics.paAdjudicatedCount === 0;

  return (
    <div className="mt-6 space-y-8 pb-12">
      <div className="group relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-r from-zinc-950 via-zinc-900 to-zinc-950 p-8 shadow-2xl backdrop-blur-2xl">
        <div className="pointer-events-none absolute right-1/4 top-0 h-96 w-96 rounded-full bg-brand-orange-500/10 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 left-10 h-96 w-96 rounded-full bg-purple-500/10 blur-3xl" />

        <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-brand-orange-500/20 bg-brand-orange-500/10 px-3 py-1 font-mono text-[11px] font-bold text-brand-orange-400">
              <Database className="h-3.5 w-3.5" />
              <span>OPERATIONS COMMAND CENTER • DATABASE SNAPSHOT</span>
            </div>

            <h1 className="font-heading text-3xl font-extrabold leading-tight tracking-tight text-white lg:text-4xl">
              Master Operations{' '}
              <span className="bg-gradient-to-r from-brand-orange-400 via-amber-300 to-teal-300 bg-clip-text text-transparent">
                &amp; Executive Supervision
              </span>
            </h1>

            <p className="max-w-2xl text-sm leading-relaxed text-zinc-400">
              Bounded queue previews and exact aggregate counts across Intake, Billing, Clinical,
              and Case Coordination. Snapshot generated {snapshotLabel}.
            </p>

            <button
              type="button"
              onClick={refresh}
              disabled={isRefreshing}
              className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-zinc-900/80 px-3.5 py-2 font-mono text-[11px] font-bold text-zinc-300 transition-all hover:border-brand-orange-500/30 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              {isRefreshing ? 'Refreshing snapshot…' : 'Refresh snapshot'}
            </button>
          </div>

          <div className="grid flex-shrink-0 grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-zinc-900/90 p-3.5 shadow-sm backdrop-blur-md">
              <span className="block font-mono text-[10px] font-bold uppercase text-zinc-400">
                TOTAL CLIENTS
              </span>
              <p className="mt-1 font-mono text-xl font-black text-white">{metrics.totalClients}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-zinc-900/90 p-3.5 shadow-sm backdrop-blur-md">
              <span className="block font-mono text-[10px] font-bold uppercase text-emerald-400">
                ACTIVE CASELOAD
              </span>
              <p className="mt-1 font-mono text-xl font-black text-emerald-400">
                {metrics.activeClients}
              </p>
            </div>
            <div className="col-span-2 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-3.5 shadow-sm backdrop-blur-md sm:col-span-1">
              <span className="block font-mono text-[10px] font-bold uppercase text-amber-400">
                SLA HEALTH
              </span>
              <p className="mt-1 font-mono text-sm font-black text-amber-300">NOT TRACKED</p>
              <p className="mt-0.5 text-[9px] text-zinc-500">No durable transition timestamps</p>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="flex flex-col gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-200 shadow-xl sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
            <div>
              <p className="font-semibold">Refresh failed — showing the prior snapshot</p>
              <p className="mt-0.5 text-xs text-amber-200/70">{error}</p>
            </div>
          </div>
          <span className="font-mono text-[10px] text-amber-300/70">{snapshotLabel}</span>
        </div>
      )}

      {allOperationalCountsZero && (
        <div className="relative overflow-hidden rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-5 shadow-xl">
          <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-cyan-500/10 blur-2xl" />
          <div className="relative flex items-start gap-3">
            <Database className="mt-0.5 h-5 w-5 shrink-0 text-cyan-400" />
            <div>
              <p className="font-heading text-sm font-bold text-white">Connected snapshot, zero records</p>
              <p className="mt-1 text-xs leading-relaxed text-zinc-500">
                The aggregate queries completed, but no client, adjudicated PA, aged-note, or
                coordinator action-item records were found. Zeros below are database results, not
                placeholders.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-4">
        <DepartmentCard
          index="01"
          label="Intake"
          value={metrics.intakeSubmittedPackets}
          description="Packets whose status is SUBMITTED"
          badge={`${metrics.intakeSubmittedOver48h} >48H`}
          evidenceLabel="Age signal"
          evidenceValue={`${metrics.intakeSubmittedOver48h} last updated >48h`}
          evidenceNote="Uses IntakePacket.updatedAt because a dedicated submitted-at timestamp is not stored."
          href="/portal-case"
          linkLabel="Open intake queue"
          accent={{
            text: 'text-brand-orange-400',
            border: 'hover:border-brand-orange-500/50',
            badge: 'bg-brand-orange-500/10 text-brand-orange-400 border-brand-orange-500/20',
            glow: 'hover:shadow-[0_0_30px_rgba(255,122,69,0.15)]',
          }}
        />
        <DepartmentCard
          index="02"
          label="Billing"
          value={metrics.billingAwaitingVob}
          description="Clients at CLINICAL_REVIEW_APPROVED awaiting VOB"
          badge={`${metrics.billingExpiringPas} PA RISK`}
          evidenceLabel="VOB turnaround SLA"
          evidenceValue="Not tracked"
          evidenceNote="The schema does not persist VOB start/completion timestamps."
          href="/portal-billing/clients"
          linkLabel="Open billing queue"
          accent={{
            text: 'text-emerald-400',
            border: 'hover:border-emerald-500/50',
            badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
            glow: 'hover:shadow-[0_0_30px_rgba(16,185,129,0.15)]',
          }}
        />
        <DepartmentCard
          index="03"
          label="Clinical"
          value={metrics.clinicalAwaitingReports}
          description="Clients currently at ASSESSMENT_SCHEDULED"
          badge={`${metrics.clinicalAwaitingReports} WAITING`}
          evidenceLabel="Report assembly SLA"
          evidenceValue="Not tracked"
          evidenceNote="Status transition timestamps needed for an elapsed-time SLA are not stored."
          href="/portal-clinical"
          linkLabel="Open clinical suite"
          accent={{
            text: 'text-cyan-400',
            border: 'hover:border-cyan-500/50',
            badge: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
            glow: 'hover:shadow-[0_0_30px_rgba(6,182,212,0.15)]',
          }}
        />
        <DepartmentCard
          index="04"
          label="Case Coord"
          value={metrics.caseCoordStaffingPending}
          description="Clients currently at STAFFING_PENDING"
          badge={`${metrics.caseCoordOpenActionItems} WORK ITEMS`}
          evidenceLabel="Coordinator work items"
          evidenceValue={`${metrics.caseCoordOpenActionItems} unresolved`}
          evidenceNote="Counts OPEN or IN_PROGRESS items assigned to CASE_COORDINATOR users."
          href="/portal-case-coord"
          linkLabel="Open case coordination"
          accent={{
            text: 'text-purple-400',
            border: 'hover:border-purple-500/50',
            badge: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
            glow: 'hover:shadow-[0_0_30px_rgba(168,85,247,0.15)]',
          }}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <MonthlyClientChart data={data.monthlyNewClients} />
        <div className="space-y-6">
          <RateCard
            title="Active Caseload Share"
            value={metrics.activeClientShare}
            detail={
              metrics.totalClients === 0
                ? 'No client records exist for a denominator.'
                : `${metrics.activeClients} ACTIVE of ${metrics.totalClients} total client records.`
            }
            colorClass="text-emerald-400"
          />
          <RateCard
            title="Recorded PA Approval Share"
            value={metrics.paApprovalRate}
            detail={
              metrics.paAdjudicatedCount === 0
                ? 'No approved or denied PA outcomes are recorded.'
                : `APPROVED divided by ${metrics.paAdjudicatedCount} adjudicated PA records; no time window applied.`
            }
            colorClass="text-brand-orange-400"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-rose-400" />
              <h2 className="font-heading text-base font-bold tracking-wide text-white">
                Aged Unconverted Session Notes
              </h2>
            </div>
            <span className="rounded-full border border-rose-500/20 bg-rose-500/10 px-2.5 py-1 font-mono text-[10px] font-bold text-rose-400">
              {data.agedSessionNotes.length < metrics.agedUnconvertedNotes
                ? `SHOWING ${data.agedSessionNotes.length} OF ${metrics.agedUnconvertedNotes}`
                : `${metrics.agedUnconvertedNotes} MATCHES`}
            </span>
          </div>

          <div className="space-y-3">
            {data.agedSessionNotes.map((note) => {
              const ageInDays = Math.floor(
                (snapshotTime - new Date(note.createdAt).getTime()) / DAY_MS
              );
              const missingSignatures = [
                !note.rbtSigned ? 'Missing RBT signature' : null,
                !note.parentSigned ? 'Missing parent signature' : null,
                !note.bcbaSigned ? 'Missing BCBA signature' : null,
              ].filter((item): item is string => Boolean(item));

              return (
                <div
                  key={note.id}
                  className="space-y-3 rounded-2xl border border-rose-500/20 bg-zinc-950/80 p-4 shadow-md backdrop-blur-xl transition-all duration-300 hover:border-rose-500/50 hover:shadow-2xl"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-rose-500/20 bg-rose-500/10 text-xs font-bold text-rose-400">
                        {note.session.client.firstName.charAt(0)}
                        {note.session.client.lastName.charAt(0)}
                      </div>
                      <div>
                        <Link
                          href={`/client/${note.session.client.id}`}
                          className="cursor-pointer text-sm font-semibold text-white transition-colors hover:text-rose-300"
                        >
                          {note.session.client.firstName} {note.session.client.lastName}
                        </Link>
                        <p className="font-mono text-xs text-zinc-400">
                          Session: {CLINIC_DATE.format(new Date(note.session.scheduledStart))}
                        </p>
                      </div>
                    </div>

                    <span className="flex items-center gap-1 rounded-full border border-rose-500/20 bg-rose-500/10 px-2.5 py-1 font-mono text-[10px] font-bold text-rose-400">
                      <Clock className="h-3 w-3" /> {ageInDays}d since note creation
                    </span>
                  </div>

                  <div className="space-y-1 rounded-xl border border-white/5 bg-zinc-900/90 p-3 text-xs text-zinc-300">
                    <p className="font-mono text-[11px] font-semibold uppercase tracking-wider text-white">
                      Current blockers
                    </p>
                    {missingSignatures.length > 0 ? (
                      missingSignatures.map((label) => (
                        <p key={label} className="text-rose-400">
                          • {label}
                        </p>
                      ))
                    ) : (
                      <p className="text-amber-300">• Fully signed; still awaiting conversion</p>
                    )}
                  </div>
                </div>
              );
            })}

            {data.agedSessionNotes.length === 0 && (
              <div className="rounded-2xl border border-dashed border-white/10 bg-zinc-950/50 p-10 text-center text-xs text-zinc-500">
                <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-emerald-400/50" />
                <p className="font-semibold text-white">No matching session notes</p>
                <p className="mt-1 leading-relaxed text-zinc-500">
                  Query returned zero notes with isConverted=false and createdAt on or before{' '}
                  {agedCutoffLabel}.
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-amber-400" />
              <h2 className="font-heading text-base font-bold tracking-wide text-white">
                Prior Authorization Expiration Risk
              </h2>
            </div>
            <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 font-mono text-[10px] font-bold text-amber-400">
              {data.atRiskAuthorizations.length < metrics.billingExpiringPas
                ? `SHOWING ${data.atRiskAuthorizations.length} OF ${metrics.billingExpiringPas}`
                : `${metrics.billingExpiringPas} MATCHES`}
            </span>
          </div>

          <div className="space-y-3">
            {data.atRiskAuthorizations.map((authorization) => {
              const daysRemaining = Math.max(
                0,
                Math.ceil(
                  (new Date(authorization.expirationDate).getTime() - snapshotTime) / DAY_MS
                )
              );

              return (
                <div
                  key={authorization.id}
                  className="space-y-2 rounded-2xl border border-amber-500/20 bg-zinc-950/80 p-4 shadow-md backdrop-blur-xl transition-all duration-300 hover:border-amber-500/50 hover:shadow-2xl"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-amber-500/20 bg-amber-500/10 text-xs font-bold text-amber-400">
                        {authorization.client.firstName.charAt(0)}
                        {authorization.client.lastName.charAt(0)}
                      </div>
                      <div>
                        <Link
                          href={`/client/${authorization.client.id}`}
                          className="cursor-pointer text-sm font-bold text-white transition-colors hover:text-amber-300"
                        >
                          {authorization.client.firstName} {authorization.client.lastName}
                        </Link>
                        <p className="font-mono text-xs text-zinc-400">
                          Payer: {authorization.client.insurancePayer ?? 'Not recorded'}
                        </p>
                      </div>
                    </div>

                    <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 font-mono text-[10px] font-bold text-amber-400">
                      {daysRemaining}d remaining
                    </span>
                  </div>
                  <p className="border-t border-white/5 pt-2 font-mono text-[11px] text-zinc-500">
                    Expires {CLINIC_DATE.format(new Date(authorization.expirationDate))}
                  </p>
                </div>
              );
            })}

            {data.atRiskAuthorizations.length === 0 && (
              <div className="rounded-2xl border border-dashed border-white/10 bg-zinc-950/50 p-10 text-center text-xs text-zinc-500">
                <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-emerald-400/50" />
                <p className="font-semibold text-white">No matching approved PAs</p>
                <p className="mt-1 leading-relaxed text-zinc-500">
                  Query returned zero APPROVED PA requests expiring from this snapshot through{' '}
                  {paWindowEndLabel}. Already-expired records are excluded.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-zinc-950/60 p-4 shadow-xl">
        <div className="flex items-start gap-3">
          <BarChart3 className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" />
          <p className="text-[11px] leading-relaxed text-zinc-500">
            Queue previews are capped at {data.scope.queuePreviewLimit} records and ordered
            oldest/soonest first. Aggregate badges use separate count queries, so a capped preview
            never understates the total.
          </p>
        </div>
      </div>

      <OpsAuditReportCompiler key={data.generatedAt} snapshot={data} />
    </div>
  );
}
