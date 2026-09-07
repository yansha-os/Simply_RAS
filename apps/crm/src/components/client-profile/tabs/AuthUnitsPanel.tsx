'use client';

import React, { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import {
  Activity,
  AlertTriangle,
  CalendarRange,
  CheckCircle2,
  FileCheck2,
  Gauge,
  Info,
  Loader2,
  PenLine,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { getClientAuthUnitBalances } from '@/app/actions/authUnitsActions';
import type { AuthUnitWindow, ClientAuthUnitBalances } from '@/lib/billing/authUnits';
import { CLINIC_TIME_ZONE } from '@/lib/clinicTimezone';

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  try {
    // Authorization dates are date-only values stored at UTC midnight. Keep
    // that calendar date intact; the server applies clinic-TZ day boundaries.
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    });
  } catch {
    return '—';
  }
}

function fmtUnits(value: number | null): string {
  return value == null ? '—' : value.toLocaleString('en-US');
}

function actionError(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function statusBadge(window: AuthUnitWindow) {
  if (window.windowActive) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-green-500/20 bg-green-500/10 px-2.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-green-400">
        <span className="dot-live" />
        Active
      </span>
    );
  }
  if (window.windowExpired || window.status === 'EXPIRED') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-amber-400">
        Expired
      </span>
    );
  }
  if (window.status === 'APPROVED') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-500/20 bg-cyan-500/10 px-2.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-cyan-400">
        Approved
      </span>
    );
  }
  if (window.status === 'DENIED' || String(window.status).startsWith('DENIED')) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500/20 bg-red-500/10 px-2.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-red-400">
        Denied
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
      {String(window.status).replace(/_/g, ' ')}
    </span>
  );
}

function remainingTone(authorized: number | null, remaining: number | null): string {
  if (authorized == null || remaining == null) return 'text-zinc-400';
  const pct = authorized === 0 ? 0 : remaining / authorized;
  if (pct <= 0.15) return 'text-red-400';
  if (pct <= 0.35) return 'text-amber-400';
  return 'text-emerald-400';
}

function fillPct(authorized: number | null, used: number | null): number {
  if (authorized == null || authorized <= 0 || used == null) return 0;
  return Math.min(100, Math.round((used / authorized) * 100));
}

export default function AuthUnitsPanel({
  clientId,
  refreshKey = 0,
}: {
  clientId: string;
  refreshKey?: string | number;
}) {
  const [loaded, setLoaded] = useState<{
    clientId: string;
    refreshKey: string | number;
    data: ClientAuthUnitBalances;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const requestSequence = useRef(0);
  const data =
    loaded?.clientId === clientId && loaded.refreshKey === refreshKey
      ? loaded.data
      : null;

  const load = useCallback(() => {
    const requestId = ++requestSequence.current;
    startTransition(async () => {
      await Promise.resolve();
      try {
        const res = await getClientAuthUnitBalances(clientId);
        if (requestId !== requestSequence.current) return;
        if (res.success) {
          setError(null);
          setLoaded({ clientId, refreshKey, data: res.data });
        } else {
          setLoaded(null);
          setError(res.error);
        }
      } catch (cause) {
        if (requestId !== requestSequence.current) return;
        setLoaded(null);
        setError(actionError(cause, 'Failed to load authorization unit balances.'));
      }
    });
  }, [clientId, refreshKey]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/80 backdrop-blur-xl shadow-2xl">
      <div
        className="pointer-events-none absolute -right-20 -top-24 h-56 w-56 rounded-full opacity-40 blur-3xl"
        style={{
          background:
            'radial-gradient(circle, rgba(249,115,22,0.22) 0%, transparent 70%)',
        }}
      />
      <div
        className="pointer-events-none absolute -left-16 bottom-0 h-40 w-40 rounded-full opacity-30 blur-3xl"
        style={{
          background:
            'radial-gradient(circle, rgba(42,133,255,0.18) 0%, transparent 70%)',
        }}
      />

      <div className="relative flex flex-wrap items-start justify-between gap-4 border-b border-white/5 px-5 py-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-brand-orange-500/30 bg-brand-orange-500/10">
              <Gauge className="h-4 w-4 text-brand-orange-400" />
            </div>
            <div>
              <h3 className="font-heading text-lg font-semibold text-white tracking-tight">
                Authorization Units
              </h3>
              <p className="text-xs text-zinc-500 mt-0.5">
                Durable note units inside each authorization window
              </p>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={isPending}
          aria-label="Refresh authorization unit balances"
          className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-zinc-300 transition-all duration-300 hover:border-brand-orange-500/40 hover:bg-white/10 hover:text-white cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          Refresh
        </button>
      </div>

      <div className="relative space-y-4 p-5">
        <div className="flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-emerald-400">
            <PenLine className="h-3 w-3" />
            BCBA-signed counts
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-500/20 bg-cyan-500/10 px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-cyan-400">
            <FileCheck2 className="h-3 w-3" />
            Converted counts
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            Signed + converted counts once
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            Unsigned excluded
          </span>
        </div>

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
            className="flex items-center gap-2 py-10 justify-center text-zinc-500 text-sm"
          >
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading unit balances…
          </div>
        )}

        {data && data.windows.length === 0 && (
          <div className="rounded-xl border border-dashed border-white/10 bg-zinc-900/40 px-5 py-8 text-center">
            <ShieldCheck className="mx-auto mb-3 h-8 w-8 text-zinc-600" />
            <p className="font-heading text-sm font-semibold text-zinc-300">
              No authorization windows yet
            </p>
            <p className="mt-1 text-xs text-zinc-500 max-w-sm mx-auto">
              Approve an Assessment or Treatment PA below to populate authorized units.
            </p>
            <p className="mx-auto mt-3 inline-flex max-w-md items-start gap-1.5 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-left text-[11px] text-amber-200">
              <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Until a CPT/date window can be matched, the convert-time auth-unit stop cannot
              enforce a remaining balance and the notes queue reports “No matching auth
              window.”
            </p>
          </div>
        )}

        {data?.windows.map((window) => (
          <div
            key={`${window.source}-${window.id}`}
            className="group rounded-xl border border-white/10 bg-zinc-900/50 p-4 transition-all duration-300 hover:scale-[1.01] hover:border-brand-orange-500/40 hover:shadow-2xl"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-heading text-sm font-semibold text-white">
                  {window.type === 'ASSESSMENT'
                    ? 'Assessment PA'
                    : window.type === 'TREATMENT'
                      ? 'Treatment PA'
                      : window.type}
                </span>
                {statusBadge(window)}
                <span className="rounded-md border border-white/10 bg-black/30 px-2 py-0.5 font-mono text-[10px] text-zinc-500">
                  {window.source === 'AUTHORIZATION' ? 'Authorization' : 'PA tracker'}
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-zinc-500 font-mono">
                <CalendarRange className="h-3.5 w-3.5 text-zinc-600" />
                {fmtDate(window.startDate)} → {fmtDate(window.endDate)}
              </div>
            </div>
            <p className="-mt-2 mb-3 text-right font-mono text-[9px] uppercase tracking-wider text-zinc-600">
              Inclusive clinic dates · {CLINIC_TIME_ZONE}
            </p>

            {window.authNumber && (
              <p className="mb-3 font-mono text-[11px] text-brand-blue-400">
                Auth # {window.authNumber}
              </p>
            )}

            <div className="space-y-3">
              {window.lines.map((line) => {
                const pct = fillPct(line.unitsAuthorized, line.unitsUsed);
                const tone = remainingTone(line.unitsAuthorized, line.unitsRemaining);
                return (
                  <div
                    key={`${window.id}-${line.cptCode}`}
                    className="rounded-lg border border-white/5 bg-zinc-950/60 px-3 py-3"
                  >
                    <div className="flex flex-wrap items-end justify-between gap-3 mb-2">
                      <div>
                        <p className="font-mono text-xs text-zinc-500 uppercase tracking-widest">
                          CPT
                        </p>
                        <p className="font-mono text-base font-semibold text-white">
                          {line.cptCode}
                        </p>
                      </div>
                      <div className="grid grid-cols-3 gap-4 text-right">
                        <div>
                          <p className="text-[10px] uppercase tracking-widest text-zinc-500">
                            Authorized
                          </p>
                          <p className="font-mono text-sm text-zinc-200">
                            {fmtUnits(line.unitsAuthorized)}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase tracking-widest text-zinc-500">
                            Used
                          </p>
                          <p className="font-mono text-sm text-zinc-200">
                            {fmtUnits(line.unitsUsed)}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase tracking-widest text-zinc-500">
                            Remaining
                          </p>
                          <p className={`font-mono text-sm font-semibold ${tone}`}>
                            {fmtUnits(line.unitsRemaining)}
                          </p>
                        </div>
                      </div>
                    </div>

                    {line.unitsRemaining != null && line.unitsRemaining <= 0 && (
                      <div className="mt-2 flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs text-rose-300">
                        <AlertTriangle className="h-4 w-4 shrink-0" />
                        <span className="font-semibold">
                          Overbill Warning: {line.cptCode} unit budget depleted ({line.unitsRemaining} units remaining). Schedule modifications required.
                        </span>
                      </div>
                    )}
                    {line.unitsAuthorized != null && !line.manualReviewRequired && (
                      <div className="mt-2">
                        <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-brand-blue-500 to-brand-orange-500 transition-all duration-500"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono text-zinc-600">
                          <span className="inline-flex flex-wrap items-center gap-2">
                            <span className="inline-flex items-center gap-1 text-zinc-500">
                              <Activity className="h-3 w-3" />
                              {line.sessionCount} counting session
                              {line.sessionCount === 1 ? '' : 's'}
                            </span>
                            <span className="inline-flex items-center gap-1 text-emerald-500/80">
                              <CheckCircle2 className="h-3 w-3" />
                              {line.signedSessionCount} signed
                            </span>
                            <span className="inline-flex items-center gap-1 text-cyan-500/80">
                              <FileCheck2 className="h-3 w-3" />
                              {line.convertedSessionCount} converted
                            </span>
                          </span>
                          <span>{pct}% used</span>
                        </div>
                        {line.missingBillableUnitsCount > 0 && (
                          <p className="mt-1.5 text-[10px] text-amber-500/90">
                            {line.missingBillableUnitsCount} note
                            {line.missingBillableUnitsCount === 1 ? '' : 's'} missing
                            billableUnits (counted as 0).
                          </p>
                        )}
                      </div>
                    )}

                    {line.usageTrackingLater && (
                      <p
                        className={`mt-2 text-[11px] ${
                          line.manualReviewRequired ? 'text-amber-400/90' : 'text-zinc-500'
                        }`}
                      >
                        {line.manualReviewRequired
                          ? 'Manual review required: units are aggregate, unattributed, or incompatible with this authorization type. No session CPT is consumed automatically.'
                          : line.unitsUsed === 0
                            ? 'No counting notes in this window; the server ledger reports 0 used.'
                            : 'Utilization is unavailable until an approved unit amount and counting note can be matched.'}
                      </p>
                    )}

                    {window.windowActive &&
                      line.unitsAuthorized != null &&
                      line.unitsRemaining != null &&
                      line.unitsRemaining <= 0 && (
                        <div
                          role="status"
                          className="mt-3 flex items-start gap-2 rounded-lg border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-[11px] leading-relaxed text-rose-300"
                        >
                          <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          <span>
                            <strong>Convert-time hard stop:</strong> no units remain for this
                            active CPT/window. Any note requesting units is blocked unless an
                            authorized, audited leadership override is recorded.
                          </span>
                        </div>
                      )}

                    {window.windowActive &&
                      line.unitsRemaining != null &&
                      line.unitsRemaining > 0 &&
                      line.unitsRemaining <= 8 && (
                        <div
                          role="status"
                          className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-amber-200"
                        >
                          <Gauge className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          <span>
                            <strong>Low authorization:</strong> {line.unitsRemaining} unit
                            {line.unitsRemaining === 1 ? '' : 's'} remain. Conversion is blocked
                            when a note requests more than the server-computed balance.
                          </span>
                        </div>
                      )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {data && (
          <div className="flex gap-2 rounded-xl border border-white/5 bg-black/20 px-3 py-2.5 text-[11px] leading-relaxed text-zinc-500">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-600" />
            <div className="space-y-1">
              <p>{data.usageNote}</p>
              <p className="font-mono text-[10px] text-zinc-600">
                Method ·{' '}
                {data.usageMethod === 'NOTE_BILLABLE_UNITS'
                  ? 'durable note.billableUnits'
                  : 'authorization metadata only'}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
