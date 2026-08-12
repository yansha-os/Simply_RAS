'use client';

import React, { useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import {
  CreditCard,
  DollarSign,
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileWarning,
  Send,
  ShieldCheck,
  Ban,
  ArrowRight,
  Briefcase,
  MessageSquare,
  Sparkles,
  RefreshCw,
  BadgeCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import { createHelpTicket } from '@/app/actions/helpDeskActions';
import { ensureActiveApplicantId, getActiveApplicantName } from '@/lib/syncAtsProgress';
import {
  listRbtPayrollSessions,
  type PayableSessionRow,
} from '@/app/actions/payrollActions';

type PayBlocker = {
  id: string;
  severity: 'BLOCKING' | 'WARNING';
  title: string;
  detail: string;
  amountHeld: number;
  sessionRef: string;
  fixHref: string;
  fixLabel: string;
  units: number;
  unitsSource: PayableSessionRow['unitsSource'];
  flags?: { rbtSigned: boolean; bcbaSigned: boolean; isConverted: boolean; hasNote: boolean };
};

type FinanceTicketLocal = {
  id: string;
  subject: string;
  message: string;
  createdAt: string;
  status: 'DRAFT' | 'OPEN' | 'CLAIMED';
};

const LOCAL_FINANCE_TICKETS_KEY = 'ras_rbt_finance_tickets';
const PAYROLL_WINDOW_DAYS = 90;
const PAYROLL_WINDOW_MS = PAYROLL_WINDOW_DAYS * 24 * 60 * 60 * 1000;
const CLINIC_TIME_ZONE = 'America/New_York';

const etDateTimeFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: CLINIC_TIME_ZONE,
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

function safeNonNegative(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

function safeWholeUnits(value: unknown): number {
  return Math.floor(safeNonNegative(value));
}

function money(value: unknown): string {
  return safeNonNegative(value).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  });
}

function formatEtDateTime(value: string | number | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime())
    ? `${etDateTimeFormatter.format(date)} ET`
    : 'Time unavailable';
}

function payrollWindowLabel(loadedAt: string | null): string {
  if (!loadedAt) return 'No successful DB snapshot';
  const endMs = Date.parse(loadedAt);
  if (!Number.isFinite(endMs)) return 'Snapshot time unavailable';
  return `${formatEtDateTime(endMs - PAYROLL_WINDOW_MS)} – ${formatEtDateTime(endMs)}`;
}

function isPayrollEligible(row: PayableSessionRow): boolean {
  return Boolean(row.payable && row.noteId && (row.bcbaSigned || row.isConverted));
}

function dbHoldToBlocker(row: PayableSessionRow): PayBlocker {
  const flagsEligible = Boolean(row.noteId && (row.bcbaSigned || row.isConverted));
  const eligibilityMismatch = row.payable && !flagsEligible;
  const reason = eligibilityMismatch
    ? 'Eligibility flags need Finance review'
    : row.holdReason || 'Pay held pending documentation';
  let detail = `${row.clientName} · CPT ${row.cptCode}.`;
  if (eligibilityMismatch) {
    detail +=
      ' The server marked this row payable, but the required note plus BCBA-signed/converted flags were not present. It remains held in this view.';
  } else if (!row.noteId) {
    detail += ' No SessionNote on file — complete Session Studio to unlock payroll review.';
  } else if (!row.rbtSigned) {
    detail += ' RBT signature missing on the note.';
  } else if (!row.bcbaSigned && !row.isConverted) {
    detail += ' Note is RBT-signed; waiting on BCBA e-sign (Bridge G).';
  } else {
    detail += ' The DB hold is still active; Finance should review the documentation flags.';
  }

  return {
    id: `db-hold-${row.sessionId}`,
    severity: 'BLOCKING',
    title: reason,
    detail,
    amountHeld: safeNonNegative(row.estimatedPay),
    sessionRef: `${formatEtDateTime(row.scheduledStart)} · ${row.location || 'Session'}`,
    fixHref: !row.noteId || !row.rbtSigned ? `/rbt/session/${row.sessionId}` : '/rbt/schedule',
    fixLabel: !row.noteId ? 'Complete session' : !row.rbtSigned ? 'Finish & sign note' : 'Open schedule',
    units: safeWholeUnits(row.estimatedUnits),
    unitsSource: row.unitsSource,
    flags: {
      rbtSigned: row.rbtSigned,
      bcbaSigned: row.bcbaSigned,
      isConverted: row.isConverted,
      hasNote: Boolean(row.noteId),
    },
  };
}

function loadLocalTickets(): FinanceTicketLocal[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(LOCAL_FINANCE_TICKETS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveLocalTicket(ticket: FinanceTicketLocal) {
  const next = [ticket, ...loadLocalTickets()];
  localStorage.setItem(LOCAL_FINANCE_TICKETS_KEY, JSON.stringify(next.slice(0, 20)));
}

function FlagChip({
  ok,
  label,
}: {
  ok: boolean;
  label: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-wide ${
        ok
          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
          : 'bg-zinc-500/10 text-zinc-500 border-white/10'
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${ok ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
      {label}
    </span>
  );
}

function UnitsSourceBadge({ source }: { source: PayableSessionRow['unitsSource'] }) {
  const fromNote = source === 'NOTE';
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[8px] font-black uppercase tracking-wide ${
        fromNote
          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
          : 'bg-amber-500/10 text-amber-300 border-amber-500/25'
      }`}
      title={
        fromNote
          ? 'Units persisted on the SessionNote'
          : 'Fallback units estimated from the session duration'
      }
    >
      {fromNote ? 'NOTE · persisted' : 'ESTIMATE · duration fallback'}
    </span>
  );
}

export function RbtPayrollView({
  initialSessions = [],
  initialError = null,
  initialLoadedAt = null,
}: {
  initialSessions?: PayableSessionRow[];
  initialError?: string | null;
  initialLoadedAt?: string | null;
}) {
  const [sessions, setSessions] = useState<PayableSessionRow[]>(initialSessions);
  const [loadError, setLoadError] = useState<string | null>(initialError);
  const [loadedAt, setLoadedAt] = useState<string | null>(initialLoadedAt);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [blockerId, setBlockerId] = useState<string>('');
  const [localTickets, setLocalTickets] = useState<FinanceTicketLocal[]>([]);
  const [pending, startTransition] = useTransition();
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const loadTimer = window.setTimeout(() => {
      setLocalTickets(loadLocalTickets());
    }, 0);
    return () => window.clearTimeout(loadTimer);
  }, []);

  const softRefresh = () => {
    if (refreshing) return;
    setRefreshing(true);
    startTransition(() => {
      void (async () => {
        try {
          const res = await listRbtPayrollSessions();
          if (res.success) {
            setSessions(res.sessions);
            setLoadError(null);
            setLoadedAt(new Date().toISOString());
            toast.success('Payroll snapshot refreshed from the shared DB.');
          } else {
            const error = res.error || 'Could not refresh payroll.';
            setLoadError(error);
            toast.error(error);
          }
        } catch {
          const error = 'Could not refresh payroll. Your last successful snapshot is unchanged.';
          setLoadError(error);
          toast.error(error);
        } finally {
          setRefreshing(false);
        }
      })();
    });
  };

  const dbPayable = useMemo(() => sessions.filter(isPayrollEligible), [sessions]);
  const dbHeld = useMemo(() => sessions.filter((row) => !isPayrollEligible(row)), [sessions]);
  const zeroUnitEligible = useMemo(
    () => dbPayable.filter((row) => safeWholeUnits(row.estimatedUnits) === 0),
    [dbPayable]
  );

  const blockers = useMemo(() => dbHeld.map(dbHoldToBlocker), [dbHeld]);

  const pay = useMemo(() => {
    const eligibleUnits = dbPayable.reduce(
      (sum, row) => sum + safeWholeUnits(row.estimatedUnits),
      0
    );
    const estimatedEligibleValue = dbPayable.reduce(
      (sum, row) => sum + safeNonNegative(row.estimatedPay),
      0
    );
    const estimatedHeldValue = dbHeld.reduce(
      (sum, row) => sum + safeNonNegative(row.estimatedPay),
      0
    );
    return {
      eligibleUnits,
      billableHours: Math.round((eligibleUnits / 4) * 100) / 100,
      estimatedEligibleValue: Math.round(estimatedEligibleValue * 100) / 100,
      estimatedHeldValue: Math.round(estimatedHeldValue * 100) / 100,
      payableCount: dbPayable.length,
      positiveUnitPayableCount: dbPayable.length - zeroUnitEligible.length,
      heldCount: dbHeld.length,
      zeroUnitCount: zeroUnitEligible.length,
      noteSourcedCount: sessions.filter((row) => row.unitsSource === 'NOTE').length,
      estimateSourcedCount: sessions.filter((row) => row.unitsSource === 'ESTIMATE').length,
    };
  }, [dbHeld, dbPayable, sessions, zeroUnitEligible.length]);

  const windowLabel = useMemo(() => payrollWindowLabel(loadedAt), [loadedAt]);

  const openTicketForBlocker = (b: PayBlocker) => {
    setBlockerId(b.id);
    setSubject(`Pay hold: ${b.title}`);
    setMessage(
      `Hi Finance team,\n\nI need help clearing a payroll roadblock.\n\nIssue: ${b.title}\nSession: ${b.sessionRef}\nPortal units: ${b.units} (${b.unitsSource})\nEstimated portal value: ${money(b.amountHeld)}\n\nDetails: ${b.detail}\n\nThanks.`
    );
    document.getElementById('rbt-finance-ticket')?.scrollIntoView({ behavior: 'smooth' });
  };

  const submitFinanceTicket = () => {
    const sub = subject.trim();
    const body = message.trim();
    if (!sub || !body) {
      toast.error('Subject and message are required.');
      return;
    }

    startTransition(() => {
      void (async () => {
        const candidateId = await ensureActiveApplicantId();
        const name = getActiveApplicantName() || 'RBT Staff';

        if (candidateId && candidateId !== 'c1') {
          const res = await createHelpTicket({
            candidateId,
            category: 'PAYROLL_FINANCE',
            subject: sub,
            message: body,
            candidateName: name,
          });
          if (!res.success) {
            const local: FinanceTicketLocal = {
              id: `fin-${Date.now()}`,
              subject: sub,
              message: body,
              createdAt: new Date().toISOString(),
              status: 'DRAFT',
            };
            saveLocalTicket(local);
            setLocalTickets(loadLocalTickets());
            toast.error('Ticket was not sent. A draft was saved only on this device.');
          } else {
            toast.success('Payroll ticket sent to the Finance team.');
          }
        } else {
          const local: FinanceTicketLocal = {
            id: `fin-${Date.now()}`,
            subject: sub,
            message: body,
            createdAt: new Date().toISOString(),
            status: 'DRAFT',
          };
          saveLocalTicket(local);
          setLocalTickets(loadLocalTickets());
          toast.warning('No linked applicant identity. Draft saved only on this device.');
        }

        setSubject('');
        setMessage('');
        setBlockerId('');
      })();
    });
  };

  const hasDbActivity = sessions.length > 0;
  const hasSuccessfulSnapshot = Boolean(
    loadedAt && Number.isFinite(Date.parse(loadedAt))
  );
  const dataUnavailable = Boolean(loadError && !hasSuccessfulSnapshot);

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-fade-in relative">
      <div className="pointer-events-none absolute -top-24 right-0 w-[420px] h-[420px] rounded-full bg-[#F97316]/10 blur-3xl" />

      <div className="relative flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-zinc-950/80 backdrop-blur-xl border border-white/10 flex items-center justify-center shadow-lg shadow-orange-500/10">
              <CreditCard className="w-5 h-5 text-[#F97316]" />
            </div>
            <h1 className="text-3xl font-black text-slate-900 font-heading tracking-tight">
              My Payroll &amp; Pay Holds
            </h1>
          </div>
          <p className="text-xs text-slate-600 font-semibold mt-1 max-w-2xl">
            Read-only payroll signals from the shared DB. Eligibility requires a SessionNote and
            either BCBA-signed or converted status; every hold shown here is DB-backed.
          </p>
          <p className="mt-2 inline-flex items-center gap-1.5 text-[10px] font-mono font-bold text-slate-500">
            <Clock className="h-3.5 w-3.5 text-[#F97316]" />
            Rolling {PAYROLL_WINDOW_DAYS}-day window · {windowLabel}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={softRefresh}
            disabled={refreshing || pending}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-zinc-950/80 backdrop-blur-xl text-zinc-200 hover:border-[#F97316]/50 text-[10px] font-black px-3 py-1.5 uppercase tracking-wide cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Refreshing…' : 'Refresh DB'}
          </button>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border text-[10px] font-black px-3 py-1.5 uppercase tracking-wide ${
              hasSuccessfulSnapshot
                ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
                : 'border-amber-500/25 bg-amber-500/10 text-amber-300'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                hasSuccessfulSnapshot ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
              }`}
            />
            Bridge G · {hasSuccessfulSnapshot ? 'DB snapshot' : 'Unavailable'}
          </span>
        </div>
      </div>

      {loadError && (
        <div
          role="alert"
          className={`relative overflow-hidden rounded-3xl border p-5 shadow-2xl backdrop-blur-xl ${
            hasSuccessfulSnapshot
              ? 'border-amber-500/25 bg-zinc-950/90'
              : 'border-rose-500/30 bg-zinc-950/95'
          }`}
        >
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_rgba(244,63,94,0.14),_transparent_55%)]" />
          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="rounded-2xl border border-rose-500/25 bg-rose-500/10 p-2.5">
                <AlertTriangle className="h-5 w-5 text-rose-400" />
              </div>
              <div>
                <h2 className="text-sm font-black font-heading text-white">
                  {hasSuccessfulSnapshot
                    ? 'Refresh failed — showing the last successful snapshot'
                    : 'Payroll data is unavailable'}
                </h2>
                <p className="mt-1 text-xs font-medium text-zinc-300">{loadError}</p>
                {hasSuccessfulSnapshot && (
                  <p className="mt-1 text-[10px] font-mono text-zinc-500">{windowLabel}</p>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={softRefresh}
              disabled={refreshing || pending}
              className="inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-[11px] font-black text-rose-300 transition-all hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              Retry DB load
            </button>
          </div>
        </div>
      )}

      {!dataUnavailable && !hasDbActivity && (
        <div className="relative rounded-3xl border border-white/10 bg-zinc-950/80 backdrop-blur-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xl overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_rgba(249,115,22,0.12),_transparent_55%)] pointer-events-none" />
          <div className="relative flex items-start gap-3">
            <Briefcase className="w-5 h-5 text-[#F97316] shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-black text-white">
                No payroll activity in this rolling window
              </h3>
              <p className="text-xs text-zinc-400 font-medium mt-0.5">
                The shared DB returned no scheduled, in-progress, or completed therapy sessions for
                this RBT during the last {PAYROLL_WINDOW_DAYS} days. No demo payroll rows are shown.
              </p>
              <p className="mt-1.5 text-[10px] font-mono text-zinc-600">{windowLabel}</p>
            </div>
          </div>
          <div className="relative flex flex-wrap gap-2">
            <button
              type="button"
              onClick={softRefresh}
              disabled={refreshing}
              className="shrink-0 rounded-xl border border-white/10 bg-white/5 hover:border-[#F97316]/40 text-zinc-200 text-[11px] font-black px-4 py-2 cursor-pointer disabled:cursor-not-allowed transition-all"
            >
              Refresh DB
            </button>
            <Link
              href="/rbt/schedule"
              className="shrink-0 rounded-xl bg-[#F97316] hover:bg-orange-600 text-white text-[11px] font-black px-4 py-2 cursor-pointer transition-all"
            >
              Open Schedule →
            </Link>
          </div>
        </div>
      )}

      {!dataUnavailable && hasDbActivity && (
        <>
          <div className="relative overflow-hidden rounded-3xl border border-sky-500/20 bg-zinc-950/85 p-4 shadow-xl backdrop-blur-xl">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(14,165,233,0.12),_transparent_55%)]" />
            <div className="relative flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-sky-400" />
              <div>
                <h2 className="text-xs font-black font-heading text-white">
                  Dollar values are estimates, not wage promises
                </h2>
                <p className="mt-1 text-[11px] font-medium leading-relaxed text-zinc-400">
                  The payroll bridge does not provide an employee-specific contracted rate,
                  deductions, pay date, or deposit status. Dollar values are illustrative only;
                  Finance and the issued paystub remain authoritative.
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              {
                label: 'Eligible units',
                value: String(pay.eligibleUnits),
                hint: `${pay.billableHours} therapy hrs · ${pay.payableCount} eligible`,
                tone: 'orange' as const,
              },
              {
                label: 'Estimated eligible value',
                value: money(pay.estimatedEligibleValue),
                hint: 'Illustrative only · rate not verified',
                tone: 'emerald' as const,
              },
              {
                label: 'Estimated held value',
                value: money(pay.estimatedHeldValue),
                hint: `${pay.heldCount} DB-backed hold(s)`,
                tone: 'rose' as const,
              },
              {
                label: 'Zero-unit eligible',
                value: String(pay.zeroUnitCount),
                hint: 'Visible for audit · produces $0 estimate',
                tone: 'sky' as const,
              },
            ].map((card) => (
              <div
                key={card.label}
                className="rounded-3xl border border-white/10 bg-zinc-950/80 backdrop-blur-xl p-4 shadow-xl transition-all duration-300 hover:scale-[1.01] hover:shadow-2xl hover:border-[#F97316]/40"
              >
                <p className="text-[10px] font-mono font-black uppercase tracking-wider text-zinc-500">
                  {card.label}
                </p>
                <p
                  className={`text-2xl font-black font-heading mt-1 ${
                    card.tone === 'rose'
                      ? 'text-rose-400'
                      : card.tone === 'emerald'
                        ? 'text-emerald-400'
                        : card.tone === 'sky'
                          ? 'text-sky-400'
                          : 'text-[#F97316]'
                  }`}
                >
                  {card.value}
                </p>
                <p className="text-[10px] text-zinc-500 font-medium mt-1">{card.hint}</p>
              </div>
            ))}
          </div>

          {/* Eligible sessions from DB */}
          <div className="rounded-3xl border border-emerald-500/20 bg-zinc-950/80 backdrop-blur-xl p-5 shadow-2xl space-y-3 relative overflow-hidden">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(16,185,129,0.12),_transparent_50%)] pointer-events-none" />
            <div className="relative flex flex-col gap-2 border-b border-white/10 pb-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                <h2 className="text-sm font-black font-heading text-white">
                  Eligible sessions (BCBA signed or converted)
                </h2>
              </div>
              <span className="w-fit text-[10px] font-mono font-black text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                {pay.positiveUnitPayableCount} with units · {pay.zeroUnitCount} zero-unit
              </span>
            </div>
            {dbPayable.length === 0 ? (
              <div className="relative rounded-2xl border border-dashed border-white/10 bg-white/[0.03] p-6 text-center">
                <BadgeCheck className="mx-auto h-8 w-8 text-zinc-600" />
                <p className="mt-2 text-sm font-black text-white">No eligible sessions yet</p>
                <p className="mt-1 text-xs font-medium text-zinc-500">
                  A row becomes eligible only when it has a note and is BCBA-signed or converted.
                </p>
              </div>
            ) : (
              <div className="relative space-y-2">
                {dbPayable.map((row) => {
                  const units = safeWholeUnits(row.estimatedUnits);
                  const zeroUnits = units === 0;
                  return (
                    <div
                      key={row.sessionId}
                      className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border px-4 py-3 transition-all duration-300 hover:scale-[1.01] ${
                        zeroUnits
                          ? 'border-amber-500/25 bg-amber-500/[0.06] hover:border-amber-500/40'
                          : 'border-emerald-500/20 bg-emerald-500/5 hover:border-emerald-500/40'
                      }`}
                    >
                      <div className="min-w-0 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-xs font-black text-white">{row.clientName}</p>
                          <span
                            className={`inline-flex items-center gap-1 rounded-full border text-[9px] font-black uppercase tracking-wide px-2 py-0.5 ${
                              zeroUnits
                                ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                                : 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300'
                            }`}
                          >
                            <BadgeCheck className="w-3 h-3" />
                            {zeroUnits ? 'Eligible · zero units' : 'Eligible'}
                          </span>
                          <span className="rounded-full border border-sky-500/20 bg-sky-500/10 text-sky-300 text-[9px] font-black uppercase px-2 py-0.5">
                            {row.bcbaSigned && row.isConverted
                              ? 'Signed + converted'
                              : row.isConverted
                                ? 'Converted path'
                                : 'BCBA-signed path'}
                          </span>
                        </div>
                        <p className="text-[10px] font-mono text-zinc-500">
                          {formatEtDateTime(row.scheduledStart)} · CPT {row.cptCode} ·{' '}
                          {row.location || 'Location unavailable'}
                        </p>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[10px] font-mono font-black text-zinc-300">
                            {units} {units === 1 ? 'unit' : 'units'}
                          </span>
                          <UnitsSourceBadge source={row.unitsSource} />
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          <FlagChip ok={row.rbtSigned} label="RBT signed" />
                          <FlagChip ok={row.bcbaSigned} label="BCBA signed" />
                          <FlagChip ok={row.isConverted} label="Converted" />
                        </div>
                      </div>
                      <div className="shrink-0 text-left sm:text-right">
                        <p
                          className={`text-sm font-black font-mono ${
                            zeroUnits ? 'text-amber-300' : 'text-emerald-400'
                          }`}
                        >
                          {zeroUnits ? '$0 estimate' : `Est. ${money(row.estimatedPay)}`}
                        </p>
                        <p className="mt-0.5 text-[9px] font-bold uppercase tracking-wide text-zinc-600">
                          Not a paystub
                        </p>
                      </div>
                    </div>
                  );
                })}
                {zeroUnitEligible.length > 0 && (
                  <div className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.06] px-4 py-3 text-[11px] font-medium leading-relaxed text-amber-200/80">
                    Zero-unit sessions stay visible because they meet signed/converted eligibility,
                    but they produce no estimated pay and are not classified as documentation holds.
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            <div className="lg:col-span-2 rounded-3xl border border-white/10 bg-zinc-950/80 backdrop-blur-xl p-5 shadow-2xl space-y-4 relative overflow-hidden">
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,_rgba(249,115,22,0.1),_transparent_55%)] pointer-events-none" />
              <div className="relative flex items-center gap-2 border-b border-white/10 pb-3">
                <DollarSign className="w-5 h-5 text-[#F97316]" />
                <h2 className="text-sm font-black font-heading text-white">
                  Rolling window audit
                </h2>
              </div>
              <dl className="relative space-y-2.5 text-xs">
                {[
                  ['DB lookback', `${PAYROLL_WINDOW_DAYS} rolling days`],
                  ['Eligible therapy time', `${pay.billableHours} hrs`],
                  ['NOTE-sourced sessions', String(pay.noteSourcedCount)],
                  ['ESTIMATE fallback sessions', String(pay.estimateSourcedCount)],
                  ['Loaded through', loadedAt ? formatEtDateTime(loadedAt) : 'Unavailable'],
                ].map(([key, value]) => (
                  <div
                    key={key}
                    className="flex items-center justify-between gap-3 rounded-xl bg-white/5 border border-white/10 px-3 py-2"
                  >
                    <dt className="font-bold text-zinc-400">{key}</dt>
                    <dd className="text-right font-mono font-black text-white">{value}</dd>
                  </div>
                ))}
              </dl>
              <p className="relative text-[10px] text-zinc-500 leading-relaxed flex items-start gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                NOTE means persisted SessionNote units. ESTIMATE is the duration fallback. Invalid
                numbers and negative values render as zero instead of contaminating totals.
              </p>
            </div>

            <div className="lg:col-span-3 rounded-3xl border border-white/10 bg-zinc-950/80 backdrop-blur-xl p-5 shadow-2xl space-y-4 relative overflow-hidden">
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(244,63,94,0.1),_transparent_50%)] pointer-events-none" />
              <div className="relative flex items-center justify-between border-b border-white/10 pb-3 gap-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-amber-400" />
                  <h2 className="text-sm font-black font-heading text-white">
                    DB-backed documentation holds
                  </h2>
                </div>
                <span className="text-[10px] font-mono font-black text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded-full">
                  Est. {money(pay.estimatedHeldValue)}
                </span>
              </div>

              {blockers.length === 0 ? (
                <div className="relative rounded-2xl border border-dashed border-emerald-500/30 bg-emerald-500/5 p-6 text-center space-y-2">
                  <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
                  <p className="text-sm font-black text-white">No DB-backed holds in this snapshot</p>
                  <p className="text-xs text-zinc-400 font-medium">
                    Every returned session currently meets the note plus signed/converted
                    eligibility rule.
                  </p>
                </div>
              ) : (
                <div className="relative space-y-3">
                  {blockers.map((blocker) => (
                    <div
                      key={blocker.id}
                      className={`rounded-2xl border p-4 space-y-2.5 transition-all duration-300 hover:scale-[1.01] ${
                        blocker.severity === 'BLOCKING'
                          ? 'border-rose-500/25 bg-rose-500/10'
                          : 'border-amber-500/25 bg-amber-500/10'
                      }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="flex items-start gap-2 min-w-0">
                          {blocker.severity === 'BLOCKING' ? (
                            <Ban className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                          ) : (
                            <FileWarning className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                          )}
                          <div>
                            <p className="text-xs font-black text-white">{blocker.title}</p>
                            <p className="text-[10px] font-mono text-zinc-500 mt-0.5">
                              {blocker.sessionRef}
                            </p>
                          </div>
                        </div>
                        <span className="text-[11px] font-mono font-black text-rose-300 bg-zinc-950/60 border border-rose-500/20 px-2 py-0.5 rounded-lg">
                          {blocker.amountHeld > 0
                            ? `Est. −${money(blocker.amountHeld)}`
                            : '$0 estimate'}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[10px] font-mono font-black text-zinc-300">
                          {blocker.units} {blocker.units === 1 ? 'unit' : 'units'}
                        </span>
                        <UnitsSourceBadge source={blocker.unitsSource} />
                      </div>
                      {blocker.flags && (
                        <div className="flex flex-wrap gap-1.5">
                          <FlagChip ok={blocker.flags.hasNote} label="Note" />
                          <FlagChip ok={blocker.flags.rbtSigned} label="RBT signed" />
                          <FlagChip ok={blocker.flags.bcbaSigned} label="BCBA signed" />
                          <FlagChip ok={blocker.flags.isConverted} label="Converted" />
                        </div>
                      )}
                      <p className="text-[11px] text-zinc-300 font-medium leading-relaxed">
                        {blocker.detail}
                      </p>
                      <div className="flex flex-wrap gap-2 pt-1">
                        <Link
                          href={blocker.fixHref}
                          className="inline-flex items-center gap-1 rounded-xl bg-white text-zinc-950 hover:bg-zinc-200 text-[10px] font-black px-3 py-1.5 cursor-pointer transition-all"
                        >
                          {blocker.fixLabel}
                          <ArrowRight className="w-3 h-3" />
                        </Link>
                        <button
                          type="button"
                          onClick={() => openTicketForBlocker(blocker)}
                          className="inline-flex items-center gap-1 rounded-xl border border-[#F97316]/40 bg-[#F97316]/10 text-[#F97316] hover:bg-[#F97316]/20 text-[10px] font-black px-3 py-1.5 cursor-pointer transition-all"
                        >
                          <MessageSquare className="w-3 h-3" />
                          Ask Finance about this
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      <div
        id="rbt-finance-ticket"
        className="rounded-3xl border border-white/10 bg-zinc-950/90 backdrop-blur-xl text-white p-5 sm:p-6 shadow-2xl space-y-4 relative overflow-hidden"
      >
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(249,115,22,0.18),_transparent_50%)] pointer-events-none" />
        <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-[#F97316]/20 border border-[#F97316]/40 flex items-center justify-center">
              <Send className="w-5 h-5 text-[#F97316]" />
            </div>
            <div>
              <h2 className="text-base font-black font-heading">Talk to the Finance team</h2>
              <p className="text-[11px] text-zinc-400 font-medium">
                Send a payroll ticket about a DB-backed hold or missing pay. If delivery fails, this
                screen labels the copy as a device-only draft.
              </p>
            </div>
          </div>
          {blockerId && (
            <span className="text-[10px] font-mono font-bold text-amber-300 bg-amber-500/10 border border-amber-500/30 px-2.5 py-1 rounded-full">
              Linked to roadblock
            </span>
          )}
        </div>

        <div className="relative grid grid-cols-1 gap-3">
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject (e.g. Pay hold on Aug 3 ET session)"
            className="w-full rounded-2xl bg-zinc-900/80 border border-white/10 px-4 py-2.5 text-xs text-white placeholder:text-zinc-500 outline-none focus:border-[#F97316]/50"
          />
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={5}
            placeholder="Explain what you need Finance to review…"
            className="w-full rounded-2xl bg-zinc-900/80 border border-white/10 px-4 py-2.5 text-xs text-white placeholder:text-zinc-500 outline-none focus:border-[#F97316]/50 resize-y"
          />
          <button
            type="button"
            disabled={pending}
            onClick={submitFinanceTicket}
            className="w-full sm:w-auto sm:self-end inline-flex items-center justify-center gap-2 rounded-2xl bg-[#F97316] hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-black px-5 py-3 cursor-pointer shadow-lg shadow-orange-500/20 transition-all"
          >
            <Sparkles className="w-4 h-4" />
            {pending ? 'Sending…' : 'Send ticket to Finance'}
          </button>
        </div>

        {localTickets.length > 0 && (
          <div className="relative pt-3 border-t border-white/10 space-y-2">
            <p className="text-[10px] font-mono font-black uppercase tracking-wider text-zinc-500">
              Device-only Finance drafts
            </p>
            <p className="text-[10px] font-medium text-amber-300/80">
              These copies are not visible to Finance. Re-submit through the form when connectivity
              and your applicant identity are available.
            </p>
            {localTickets.slice(0, 3).map((t) => (
              <div
                key={t.id}
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 flex items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <p className="text-xs font-bold truncate">{t.subject}</p>
                  <p className="text-[10px] text-zinc-500 font-mono">
                    {formatEtDateTime(t.createdAt)}
                  </p>
                </div>
                <span className="text-[9px] font-black uppercase tracking-wide text-amber-300 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full shrink-0 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  Device only
                </span>
              </div>
            ))}
            <Link
              href="/rbt/help-desk"
              className="text-[11px] font-bold text-[#F97316] hover:underline inline-flex items-center gap-1 cursor-pointer"
            >
              Also view Help Desk inbox
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
