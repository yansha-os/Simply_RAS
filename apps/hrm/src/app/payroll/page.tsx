import Link from 'next/link';
import type { Role } from '@repo/db';
import {
  AlertTriangle,
  ArrowLeft,
  Database,
  FlaskConical,
  LockKeyhole,
} from 'lucide-react';

import { getFinancePayrollRollup } from '@/app/actions/financePayrollActions';
import { FinancePayrollWorkspace } from '@/components/finance-payroll/FinancePayrollWorkspace';
import PayrollBenefitsView from '@/components/hrm/PayrollBenefitsView';
import { requireStaff } from '@/lib/auth-guard';
import { isDevToolsEnabled } from '@/lib/devToolsGate';

export const dynamic = 'force-dynamic';

const FINANCE_PAYROLL_PAGE_ROLES =
  ['FINANCE', 'CEO'] as const satisfies readonly Role[];

type PayrollPageProps = {
  searchParams: Promise<
    Record<string, string | string[] | undefined>
  >;
};

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function MessageCard({
  title,
  detail,
  kind,
}: {
  title: string;
  detail: string;
  kind: 'denied' | 'error';
}) {
  const denied = kind === 'denied';
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="relative w-full max-w-xl overflow-hidden rounded-3xl border border-white/10 bg-zinc-950/85 p-8 text-center shadow-2xl backdrop-blur-xl sm:p-10">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-orange-500/10 blur-3xl" />
        <div className="relative z-10 space-y-4">
          <div
            className={`mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border ${
              denied
                ? 'border-rose-500/20 bg-rose-500/10 text-rose-300'
                : 'border-amber-500/20 bg-amber-500/10 text-amber-300'
            }`}
          >
            {denied ? (
              <LockKeyhole className="h-7 w-7" />
            ) : (
              <AlertTriangle className="h-7 w-7" />
            )}
          </div>
          <h1 className="font-heading text-2xl font-black text-white">
            {title}
          </h1>
          <p className="text-sm font-medium leading-relaxed text-zinc-400">
            {detail}
          </p>
          <Link
            href={denied ? '/' : '/payroll'}
            className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl bg-orange-500 px-5 text-xs font-black text-white transition-all hover:bg-orange-600"
          >
            <ArrowLeft className="h-4 w-4" />
            {denied ? 'Return home' : 'Load default 14 days'}
          </Link>
        </div>
      </div>
    </div>
  );
}

export default async function StandalonePayrollPage({
  searchParams,
}: PayrollPageProps) {
  const gate = await requireStaff(FINANCE_PAYROLL_PAGE_ROLES);
  if (!gate.ok) {
    return (
      <MessageCard
        kind="denied"
        title="Finance workspace restricted"
        detail="This company-wide payroll estimate contains compensation data and is available only to active Finance and CEO accounts."
      />
    );
  }

  const params = await searchParams;
  const devToolsEnabled = isDevToolsEnabled();
  if (devToolsEnabled && firstParam(params.view) === 'mock') {
    return (
      <div className="space-y-4 pb-12">
        <div className="flex flex-col gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/10 p-4 text-amber-100 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2.5">
            <FlaskConical className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
            <div>
              <p className="text-xs font-black uppercase tracking-wide">
                Dev-only fabricated prototype
              </p>
              <p className="mt-0.5 text-[11px] font-medium text-amber-100/65">
                Every KPI below is mock data. It is never used by the live
                Finance rollup.
              </p>
            </div>
          </div>
          <Link
            href="/payroll"
            className="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-amber-400/30 bg-black/20 px-3 py-2 text-[10px] font-black uppercase tracking-wide transition-all hover:border-amber-300/60"
          >
            <Database className="h-3.5 w-3.5" />
            Return to live data
          </Link>
        </div>
        <PayrollBenefitsView />
      </div>
    );
  }

  const payroll = await getFinancePayrollRollup({
    from: firstParam(params.from),
    to: firstParam(params.to),
  });
  if (!payroll.success || !payroll.data) {
    return (
      <MessageCard
        kind="error"
        title="Payroll estimate unavailable"
        detail={payroll.error}
      />
    );
  }

  return (
    <FinancePayrollWorkspace
      report={payroll.data}
      viewerName={`${gate.user.firstName} ${gate.user.lastName}`.trim()}
      viewerRole={gate.user.role as 'FINANCE' | 'CEO'}
      showDevMockLink={devToolsEnabled}
    />
  );
}
