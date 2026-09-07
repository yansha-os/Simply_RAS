'use client';

import React, { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import {
  AlertTriangle,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  FileCheck2,
  Info,
  Loader2,
  RefreshCw,
  Send,
  ShieldAlert,
} from 'lucide-react';
import { getClientWeeklyBillableUnits } from '@/app/actions/weeklyUnitsActions';
import {
  shiftWeek,
  startOfWeekMonday,
  type WeeklyBillableDay,
  type WeeklyBillableSessionRow,
  type WeeklyBillableUnitsWeek,
} from '@/lib/billing/weeklyBillableUnits';
import { CLINIC_TIME_ZONE } from '@/lib/clinicTimezone';

function fmtTime(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  try {
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: CLINIC_TIME_ZONE,
    });
  } catch {
    return '—';
  }
}

function fmtDayHeader(day: WeeklyBillableDay): string {
  try {
    // dateIso is already the clinic calendar key. Format in UTC so a browser's
    // local timezone cannot shift the displayed day.
    const d = new Date(`${day.dateIso}T12:00:00Z`);
    if (Number.isNaN(d.getTime())) return day.dateIso;
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    });
  } catch {
    return day.dateIso;
  }
}

function actionError(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : 'Failed to load weekly billable units.';
}

function SessionCard({ row }: { row: WeeklyBillableSessionRow }) {
  const estimated = row.unitsSource === 'SESSION_DURATION_8_MIN';
  return (
    <div
      aria-label={`${row.cptCode}, ${row.units} ${estimated ? 'estimated ' : ''}units`}
      className="group rounded-xl border border-white/10 bg-zinc-950/70 p-2.5 transition-all duration-300 hover:border-brand-orange-500/40 hover:shadow-xl"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">CPT</p>
          <p className="font-mono text-sm font-semibold text-white">{row.cptCode}</p>
        </div>
        <div className="text-right">
          <p className="font-mono text-base font-bold text-brand-orange-300">
            {estimated ? '≈' : ''}
            {row.units}
          </p>
          <p className="text-[9px] uppercase tracking-wider text-zinc-600">
            {estimated ? 'estimated units' : 'units'}
          </p>
        </div>
      </div>

      <p className="mt-1.5 font-mono text-[10px] text-zinc-400">
        {fmtTime(row.actualStart ?? row.scheduledStart)} –{' '}
        {fmtTime(row.actualEnd ?? row.scheduledEnd)}
      </p>

      {row.rbtName && (
        <p className="mt-1 truncate text-[10px] text-zinc-500">RBT {row.rbtName}</p>
      )}

      <div className="mt-2 flex flex-wrap gap-1">
        <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/25 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-emerald-300">
          <span className="dot-live" />
          BCBA signed
        </span>
        {row.isConverted ? (
          <span className="inline-flex items-center gap-1 rounded-md border border-sky-500/25 bg-sky-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-sky-300">
            <Send className="h-2.5 w-2.5" />
            Converted
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/25 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-amber-300">
            Signed · not converted
          </span>
        )}
      </div>

      {row.isConverted && row.plutusClaimRef && (
        <p className="mt-1.5 truncate font-mono text-[9px] text-sky-400/80">
          Ref {row.plutusClaimRef}
        </p>
      )}

      {estimated && (
        <p className="mt-1 text-[9px] text-amber-500/80">
          Duration fallback · Medicaid 8-minute rule
        </p>
      )}
    </div>
  );
}

function DayColumn({ day }: { day: WeeklyBillableDay }) {
  const hasSessions = day.sessions.length > 0;
  return (
    <div
      className={`flex min-h-[140px] flex-col rounded-xl border bg-zinc-900/40 transition-all duration-300 ${
        hasSessions
          ? 'border-white/10 hover:border-brand-orange-500/30'
          : 'border-dashed border-white/5'
      }`}
    >
      <div className="border-b border-white/5 px-2.5 py-2">
        <p className="font-heading text-[11px] font-bold text-white">
          {day.dayLabel.slice(0, 3)}
        </p>
        <p className="font-mono text-[10px] text-zinc-500">{fmtDayHeader(day)}</p>
        {hasSessions && (
          <p className="mt-1 font-mono text-[10px] font-semibold text-brand-orange-300">
            {day.unitsTotal} u · {day.sessions.length} note
            {day.sessions.length === 1 ? '' : 's'}
          </p>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-2">
        {hasSessions ? (
          day.sessions.map((row) => <SessionCard key={row.sessionId} row={row} />)
        ) : (
          <div className="flex flex-1 items-center justify-center px-1 py-6">
            <p className="text-center text-[10px] leading-relaxed text-zinc-600">
              No durable notes
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Billing tab: weekly CPT / units from real Sessions with durable attestations.
 * Schedule paint editor for job listings lives in WeeklyScheduleUnitGrid.tsx.
 */
export default function WeeklyBillableUnitGrid({ clientId }: { clientId: string }) {
  const [weekStart, setWeekStart] = useState(() => startOfWeekMonday(new Date()));
  const [loadedData, setLoadedData] = useState<WeeklyBillableUnitsWeek | null>(null);
  const [loadError, setLoadError] = useState<{
    clientId: string;
    weekStartIso: string;
    message: string;
  } | null>(null);
  const [isPending, startTransition] = useTransition();
  const requestSequence = useRef(0);
  const requestedWeekStartIso = weekStart.toISOString();
  const data =
    loadedData?.clientId === clientId &&
    loadedData.weekStartIso === requestedWeekStartIso
      ? loadedData
      : null;
  const error =
    loadError?.clientId === clientId &&
    loadError.weekStartIso === requestedWeekStartIso
      ? loadError.message
      : null;

  const load = useCallback((start: Date) => {
    const requestId = ++requestSequence.current;
    const weekStartIso = start.toISOString();
    startTransition(async () => {
      await Promise.resolve();
      try {
        const res = await getClientWeeklyBillableUnits(clientId, weekStartIso);
        if (requestId !== requestSequence.current) return;
        if (res.success) {
          setLoadError(null);
          setLoadedData(res.data);
        } else {
          setLoadedData(null);
          setLoadError({ clientId, weekStartIso, message: res.error });
        }
      } catch (cause) {
        if (requestId !== requestSequence.current) return;
        setLoadedData(null);
        setLoadError({ clientId, weekStartIso, message: actionError(cause) });
      }
    });
  }, [clientId]);

  useEffect(() => {
    load(weekStart);
  }, [load, weekStart]);

  const goPrev = () => setWeekStart((w) => shiftWeek(w, -1));
  const goNext = () => setWeekStart((w) => shiftWeek(w, 1));
  const goThisWeek = () => setWeekStart(startOfWeekMonday(new Date()));

  const isCurrentWeek =
    startOfWeekMonday(new Date()).toISOString() === weekStart.toISOString();
  const estimatedSessionCount =
    data?.sessions.filter((row) => row.unitsSource === 'SESSION_DURATION_8_MIN').length ?? 0;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/80 shadow-2xl backdrop-blur-xl">
      <div
        className="pointer-events-none absolute -right-24 -top-20 h-56 w-56 rounded-full opacity-40 blur-3xl"
        style={{
          background:
            'radial-gradient(circle, rgba(249,115,22,0.2) 0%, transparent 70%)',
        }}
      />
      <div
        className="pointer-events-none absolute -left-16 bottom-0 h-40 w-40 rounded-full opacity-30 blur-3xl"
        style={{
          background:
            'radial-gradient(circle, rgba(56,189,248,0.16) 0%, transparent 70%)',
        }}
      />

      <div className="relative flex flex-wrap items-start justify-between gap-4 border-b border-white/5 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-brand-orange-500/30 bg-brand-orange-500/10">
            <CalendarDays className="h-4 w-4 text-brand-orange-400" />
          </div>
          <div>
            <h3 className="font-heading text-lg font-semibold tracking-tight text-white">
              Weekly billable units
            </h3>
            <p className="mt-0.5 text-xs text-zinc-500">
              Durable attestation only · grouped in {CLINIC_TIME_ZONE}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={goPrev}
            disabled={isPending}
            aria-label="Previous week"
            className="inline-flex cursor-pointer items-center justify-center rounded-lg border border-white/10 bg-white/5 p-1.5 text-zinc-300 transition hover:border-brand-orange-500/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="min-w-[9.5rem] text-center" aria-live="polite">
            <p className="font-mono text-xs font-semibold text-white">
              {data?.weekLabel ?? '…'}
            </p>
            {!isCurrentWeek && (
              <button
                type="button"
                onClick={goThisWeek}
                className="mt-0.5 cursor-pointer text-[10px] font-semibold text-brand-orange-300 underline-offset-2 hover:underline"
              >
                Jump to this week
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={goNext}
            disabled={isPending}
            aria-label="Next week"
            className="inline-flex cursor-pointer items-center justify-center rounded-lg border border-white/10 bg-white/5 p-1.5 text-zinc-300 transition hover:border-brand-orange-500/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => load(weekStart)}
            disabled={isPending}
            aria-label="Refresh this week’s signed-note units"
            className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-zinc-300 transition-all duration-300 hover:border-brand-orange-500/40 hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Refresh
          </button>
        </div>
      </div>

      <div className="relative space-y-4 p-5">
        {error && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {isPending && !data && (
          <div
            role="status"
            aria-live="polite"
            className="flex items-center justify-center gap-2 py-12 text-sm text-zinc-500"
          >
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading signed-note units…
          </div>
        )}

        {data && (
          <>
            <div className="flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/[0.07] px-3 py-2.5 text-[11px] leading-relaxed text-amber-100/80">
              <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
              <p>
                Durable note totals are not conversion clearance. The server separately matches
                each note&apos;s CPT and clinic service date to its authorization window, then
                hard-stops requests above the remaining balance.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <span className="rounded-md border border-brand-orange-500/25 bg-brand-orange-500/10 px-2.5 py-1 font-mono text-[10px] font-bold text-brand-orange-300">
                {data.totals.units} units · {data.totals.sessions} durable
              </span>
              {estimatedSessionCount > 0 && (
                <span className="rounded-md border border-amber-500/25 bg-amber-500/10 px-2.5 py-1 font-mono text-[10px] font-semibold text-amber-300">
                  {estimatedSessionCount} duration-estimated
                </span>
              )}
              {data.totals.converted > 0 && (
                <span className="rounded-md border border-sky-500/25 bg-sky-500/10 px-2.5 py-1 font-mono text-[10px] font-semibold text-sky-300">
                  {data.totals.converted} converted
                </span>
              )}
              {data.totals.awaitingConvert > 0 && (
                <span className="rounded-md border border-amber-500/25 bg-amber-500/10 px-2.5 py-1 font-mono text-[10px] font-semibold text-amber-300">
                  {data.totals.awaitingConvert} awaiting claim
                </span>
              )}
              {data.totals.integrityReviewCount > 0 && (
                <span className="rounded-md border border-rose-500/25 bg-rose-500/10 px-2.5 py-1 font-mono text-[10px] font-semibold text-rose-300">
                  {data.totals.integrityReviewCount} integrity review
                </span>
              )}
              {data.byCpt.map((cpt) => (
                <span
                  key={cpt.cptCode}
                  className="rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-1 font-mono text-[10px] text-zinc-300"
                >
                  {cpt.cptCode}: {cpt.units}u
                </span>
              ))}
            </div>

            {estimatedSessionCount > 0 && (
              <div
                role="status"
                className="flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/[0.07] px-3 py-2.5 text-[11px] leading-relaxed text-amber-100/80"
              >
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
                <p>
                  Duration-estimated rows are planning context only. Until the signed note has
                  durable <span className="font-mono">billableUnits</span>, the authorization
                  ledger counts that note as 0 used and flags it as missing units.
                </p>
              </div>
            )}

            {data.totals.sessions === 0 ? (
              <div className="rounded-xl border border-dashed border-white/10 bg-zinc-900/40 px-5 py-10 text-center">
                <FileCheck2 className="mx-auto mb-3 h-8 w-8 text-zinc-600" />
                <p className="font-heading text-sm font-semibold text-zinc-300">
                  No durably eligible notes this week
                </p>
                <p className="mx-auto mt-1 max-w-md text-xs text-zinc-500">
                  Units appear only after the completed Session and parent, RBT, BCBA,
                  checklist, deficiency, fingerprint, and durable-unit checks all pass. Use the
                  arrows to check other weeks, or convert eligible notes on{' '}
                  <span className="font-mono text-zinc-400">/portal-billing/claims</span>.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
                {data.days.map((day) => (
                  <DayColumn key={day.dateIso} day={day} />
                ))}
              </div>
            )}

            <div className="flex gap-2 rounded-xl border border-white/5 bg-black/20 px-3 py-2.5 text-[11px] leading-relaxed text-zinc-500">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-600" />
              <p>{data.usageNote}</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
