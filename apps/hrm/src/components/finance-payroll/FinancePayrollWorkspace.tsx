'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  Copy,
  CreditCard,
  Database,
  Download,
  FileText,
  FlaskConical,
  RefreshCw,
  ShieldCheck,
  Users,
} from 'lucide-react';

import { buildFinancePayrollCsv } from './financePayrollCsv';
import type { FinancePayrollReport } from './financePayrollModel';

type Tone = 'orange' | 'emerald' | 'rose' | 'sky';

const toneClasses: Record<Tone, string> = {
  orange: 'border-orange-500/20 bg-orange-500/10 text-orange-300',
  emerald: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300',
  rose: 'border-rose-500/20 bg-rose-500/10 text-rose-300',
  sky: 'border-sky-500/20 bg-sky-500/10 text-sky-300',
};

function money(value: number): string {
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  });
}

function hours(units: number): string {
  return `${(units / 4).toLocaleString('en-US', {
    maximumFractionDigits: 2,
  })} hrs`;
}

function MetricCard({
  label,
  value,
  detail,
  tone,
  icon,
}: {
  label: string;
  value: string;
  detail: string;
  tone: Tone;
  icon: React.ReactNode;
}) {
  return (
    <article className="group relative overflow-hidden rounded-3xl border border-white/10 bg-zinc-950/80 p-5 shadow-2xl backdrop-blur-xl transition-all duration-300 hover:scale-[1.01] hover:border-orange-500/40 hover:shadow-orange-950/30">
      <div className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full bg-orange-500/10 blur-3xl transition-opacity group-hover:opacity-100" />
      <div className="relative flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500">
            {label}
          </p>
          <p className="mt-2 font-heading text-2xl font-black tracking-tight text-white sm:text-3xl">
            {value}
          </p>
        </div>
        <span
          className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border ${toneClasses[tone]}`}
        >
          {icon}
        </span>
      </div>
      <p className="relative mt-2 text-[11px] font-medium leading-relaxed text-zinc-500">
        {detail}
      </p>
    </article>
  );
}

export function FinancePayrollWorkspace({
  report,
  viewerName,
  viewerRole,
  showDevMockLink,
}: {
  report: FinancePayrollReport;
  viewerName: string;
  viewerRole: 'FINANCE' | 'CEO';
  showDevMockLink: boolean;
}) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>(
    'idle',
  );
  const csv = useMemo(() => buildFinancePayrollCsv(report), [report]);
  const preview = useMemo(
    () => csv.split('\r\n').slice(0, 5).join('\n'),
    [csv],
  );
  const totals = report.totals;
  const noteUnitShare =
    totals.totalUnits > 0
      ? Math.round((totals.noteUnits / totals.totalUnits) * 100)
      : 0;

  const copyCsv = async () => {
    try {
      await navigator.clipboard.writeText(csv);
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
    window.setTimeout(() => setCopyState('idle'), 1800);
  };

  const downloadCsv = () => {
    const blob = new Blob([`\uFEFF${csv}`], {
      type: 'text/csv;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `finance-payroll-estimate_${report.range.from}_${report.range.to}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="relative mx-auto max-w-7xl space-y-6 pb-12 text-white">
      <div className="pointer-events-none absolute -right-24 -top-28 h-[430px] w-[430px] rounded-full bg-orange-500/10 blur-3xl" />

      <header className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-zinc-950/85 p-6 shadow-2xl backdrop-blur-xl sm:p-8">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(249,115,22,0.18),_transparent_52%)]" />
        <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-orange-500/20 bg-orange-500/10 px-3 py-1 font-mono text-[10px] font-black uppercase tracking-wider text-orange-300">
                <span className="h-2 w-2 rounded-full bg-orange-400 shadow-[0_0_12px_rgba(251,146,60,0.9)]" />
                Live note ledger
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                {viewerRole} access
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-orange-500/25 bg-orange-500/10 text-orange-400 shadow-lg shadow-orange-950/30">
                <CreditCard className="h-6 w-6" />
              </span>
              <div>
                <h1 className="font-heading text-3xl font-black tracking-tight text-white sm:text-4xl">
                  Finance Payroll Workspace
                </h1>
                <p className="mt-1 text-xs font-medium text-zinc-400 sm:text-sm">
                  Company rollup from persisted session-note units and
                  documentation holds. Welcome, {viewerName}.
                </p>
              </div>
            </div>
          </div>

          <form
            action="/payroll"
            method="get"
            className="grid w-full gap-2 rounded-2xl border border-white/10 bg-black/25 p-3 sm:grid-cols-[1fr_1fr_auto] xl:max-w-xl"
          >
            <label className="space-y-1">
              <span className="font-mono text-[9px] font-black uppercase tracking-wider text-zinc-500">
                From
              </span>
              <input
                type="date"
                name="from"
                defaultValue={report.range.from}
                required
                className="h-10 w-full cursor-pointer rounded-xl border border-white/10 bg-zinc-900 px-3 text-xs font-bold text-white outline-none [color-scheme:dark] focus:border-orange-500/50"
              />
            </label>
            <label className="space-y-1">
              <span className="font-mono text-[9px] font-black uppercase tracking-wider text-zinc-500">
                Through
              </span>
              <input
                type="date"
                name="to"
                defaultValue={report.range.to}
                required
                className="h-10 w-full cursor-pointer rounded-xl border border-white/10 bg-zinc-900 px-3 text-xs font-bold text-white outline-none [color-scheme:dark] focus:border-orange-500/50"
              />
            </label>
            <button
              type="submit"
              className="mt-auto inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 text-xs font-black text-white shadow-lg shadow-orange-950/30 transition-all hover:bg-orange-600"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Load range
            </button>
            <p className="text-[9px] font-mono text-zinc-600 sm:col-span-3">
              Inclusive clinic dates · maximum 31 days · scheduled start date
            </p>
          </form>
        </div>
      </header>

      <section className="relative flex flex-col gap-3 overflow-hidden rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
          <div>
            <p className="text-xs font-black text-amber-100">
              Review estimate — not a payroll run
            </p>
            <p className="mt-0.5 max-w-4xl text-[11px] font-medium leading-relaxed text-amber-100/65">
              Values estimate gross wages from note units and signed LS-54 rates
              when available. This workspace does not calculate overtime,
              taxes, deductions, payment status, or submit anything to a
              payroll system.
            </p>
          </div>
        </div>
        {showDevMockLink && (
          <Link
            href="/payroll?view=mock"
            className="inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-amber-400/25 bg-black/20 px-3 py-2 text-[10px] font-black uppercase tracking-wide text-amber-200 transition-all hover:border-amber-300/50"
          >
            <FlaskConical className="h-3.5 w-3.5" />
            Dev mock
          </Link>
        )}
      </section>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Gross estimate"
          value={money(totals.grossEstimate)}
          detail={`${totals.totalUnits} total units · payable plus held`}
          tone="orange"
          icon={<FileText className="h-5 w-5" />}
        />
        <MetricCard
          label="Payable estimate"
          value={money(totals.payableEstimate)}
          detail={`${totals.payableSessionCount} eligible session(s) · not submitted`}
          tone="emerald"
          icon={<CheckCircle2 className="h-5 w-5" />}
        />
        <MetricCard
          label="Held estimate"
          value={money(totals.heldEstimate)}
          detail={`${totals.heldSessionCount} session(s) blocked by DB note flags`}
          tone="rose"
          icon={<Clock className="h-5 w-5" />}
        />
        <MetricCard
          label="Persisted note units"
          value={`${noteUnitShare}%`}
          detail={`${totals.noteUnits} note units · ${totals.estimatedUnits} duration-estimated`}
          tone="sky"
          icon={<Database className="h-5 w-5" />}
        />
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="overflow-hidden rounded-3xl border border-white/10 bg-zinc-950/80 shadow-2xl backdrop-blur-xl">
          <div className="flex flex-col gap-2 border-b border-white/10 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-orange-400" />
                <h2 className="font-heading text-base font-black text-white">
                  Technician rollup
                </h2>
              </div>
              <p className="mt-1 text-[10px] font-medium text-zinc-500">
                {report.range.from} through {report.range.to} ·{' '}
                {report.range.dayCount} clinic day(s)
              </p>
            </div>
            <span className="w-fit rounded-full border border-white/10 bg-white/5 px-2.5 py-1 font-mono text-[9px] font-black uppercase tracking-wide text-zinc-400">
              {totals.staffCount} RBT(s) · {totals.sessionCount} session(s)
            </span>
          </div>

          {report.staff.length === 0 ? (
            <div className="p-10 text-center">
              <Database className="mx-auto h-9 w-9 text-zinc-700" />
              <p className="mt-3 text-sm font-black text-white">
                No completed or in-progress RBT sessions
              </p>
              <p className="mx-auto mt-1 max-w-md text-xs font-medium text-zinc-500">
                No payroll estimate is shown for this range. Scheduled-only
                sessions are intentionally excluded.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[850px] text-left text-xs">
                <thead className="border-b border-white/10 bg-white/[0.03] font-mono text-[9px] font-black uppercase tracking-wider text-zinc-500">
                  <tr>
                    <th className="px-5 py-3">RBT / rate estimate</th>
                    <th className="px-4 py-3 text-center">Sessions</th>
                    <th className="px-4 py-3 text-center">Units</th>
                    <th className="px-4 py-3 text-right">Gross est.</th>
                    <th className="px-4 py-3 text-right">Payable est.</th>
                    <th className="px-5 py-3 text-right">Held est.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06]">
                  {report.staff.map((row) => (
                    <tr
                      key={row.rbtId}
                      className="transition-colors duration-200 hover:bg-orange-500/[0.04]"
                    >
                      <td className="px-5 py-4">
                        <p className="font-black text-white">{row.rbtName}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <span className="font-mono text-[10px] font-bold text-zinc-400">
                            {money(row.hourlyRate)}/hr
                          </span>
                          <span
                            className={`rounded-full border px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wide ${
                              row.rateSource === 'SIGNED_LS54'
                                ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
                                : 'border-amber-500/20 bg-amber-500/10 text-amber-300'
                            }`}
                          >
                            {row.rateSource === 'SIGNED_LS54'
                              ? 'Signed LS-54'
                              : 'Default estimate'}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <p className="font-mono font-black text-white">
                          {row.sessionCount}
                        </p>
                        <p className="mt-0.5 text-[9px] text-zinc-600">
                          {row.payableSessionCount} payable ·{' '}
                          {row.heldSessionCount} held
                        </p>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <p className="font-mono font-black text-white">
                          {row.totalUnits}
                        </p>
                        <p className="mt-0.5 text-[9px] text-zinc-600">
                          {row.noteUnits} note · {row.estimatedUnits} est.
                        </p>
                      </td>
                      <td className="px-4 py-4 text-right font-mono font-black text-zinc-200">
                        {money(row.grossEstimate)}
                      </td>
                      <td className="px-4 py-4 text-right">
                        <p className="font-mono font-black text-emerald-300">
                          {money(row.payableEstimate)}
                        </p>
                        <p className="mt-0.5 text-[9px] text-zinc-600">
                          {hours(row.payableUnits)}
                        </p>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <p
                          className={`font-mono font-black ${
                            row.heldEstimate > 0
                              ? 'text-rose-300'
                              : 'text-zinc-600'
                          }`}
                        >
                          {money(row.heldEstimate)}
                        </p>
                        <p className="mt-0.5 text-[9px] text-zinc-600">
                          {row.heldUnits} units
                        </p>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <aside className="overflow-hidden rounded-3xl border border-rose-500/15 bg-zinc-950/80 p-5 shadow-2xl backdrop-blur-xl">
          <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-rose-400" />
              <h2 className="font-heading text-sm font-black text-white">
                DB hold reasons
              </h2>
            </div>
            <span className="rounded-full border border-rose-500/20 bg-rose-500/10 px-2 py-0.5 font-mono text-[9px] font-black text-rose-300">
              {money(totals.heldEstimate)}
            </span>
          </div>

          {report.holds.length === 0 ? (
            <div className="py-8 text-center">
              <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-400" />
              <p className="mt-2 text-xs font-black text-white">
                No documentation holds
              </p>
              <p className="mt-1 text-[10px] text-zinc-500">
                Every included session meets the current payable gate.
              </p>
            </div>
          ) : (
            <div className="mt-3 space-y-2.5">
              {report.holds.map((hold) => (
                <div
                  key={hold.reason}
                  className="rounded-2xl border border-rose-500/15 bg-rose-500/[0.07] p-3 transition-all duration-300 hover:border-rose-500/35"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-[11px] font-black leading-snug text-zinc-200">
                      {hold.reason}
                    </p>
                    <span className="shrink-0 font-mono text-[10px] font-black text-rose-300">
                      {money(hold.amountEstimate)}
                    </span>
                  </div>
                  <p className="mt-1.5 font-mono text-[9px] text-zinc-600">
                    {hold.sessionCount} session(s) · {hold.units} units ·{' '}
                    {hours(hold.units)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </aside>
      </section>

      <section className="overflow-hidden rounded-3xl border border-sky-500/15 bg-zinc-950/80 shadow-2xl backdrop-blur-xl">
        <div className="flex flex-col gap-3 border-b border-white/10 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-sky-500/20 bg-sky-500/10 text-sky-300">
              <FileText className="h-5 w-5" />
            </span>
            <div>
              <h2 className="font-heading text-sm font-black text-white">
                CSV review preview
              </h2>
              <p className="mt-0.5 text-[10px] font-medium text-zinc-500">
                RBT-level estimate only; no client detail and no transmission
                to a payroll provider.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={copyCsv}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[10px] font-black text-zinc-200 transition-all hover:border-sky-500/40"
            >
              <Copy className="h-3.5 w-3.5" />
              {copyState === 'copied'
                ? 'Copied'
                : copyState === 'failed'
                  ? 'Copy failed'
                  : 'Copy CSV'}
            </button>
            <button
              type="button"
              onClick={downloadCsv}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-sky-500 px-3 py-2 text-[10px] font-black text-white shadow-lg shadow-sky-950/30 transition-all hover:bg-sky-600"
            >
              <Download className="h-3.5 w-3.5" />
              Download preview
            </button>
          </div>
        </div>
        <div className="overflow-x-auto bg-black/25 p-4">
          <pre className="min-w-max font-mono text-[9px] leading-relaxed text-zinc-500">
            {preview}
            {report.staff.length > 4 ? '\n…' : ''}
          </pre>
        </div>
      </section>

      <footer className="flex flex-col gap-2 px-1 text-[10px] font-medium text-zinc-600 sm:flex-row sm:items-center sm:justify-between">
        <span className="inline-flex items-center gap-1.5">
          <Calendar className="h-3.5 w-3.5" />
          Clinic timezone: {report.range.timeZone}
        </span>
        <span className="inline-flex items-center gap-1.5 font-mono">
          <Database className="h-3.5 w-3.5" />
          Generated {report.generatedAt.replace('T', ' ').replace('.000Z', ' UTC')}
        </span>
        {totals.defaultRateStaffCount > 0 && (
          <span className="inline-flex items-center gap-1.5 text-amber-500/80">
            <AlertTriangle className="h-3.5 w-3.5" />
            {totals.defaultRateStaffCount} RBT(s) use the $28/hr fallback
            estimate
          </span>
        )}
      </footer>
    </div>
  );
}
