'use client';

import { useMemo, useState, type ComponentType } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import type {
  RbtManagerDashboardResult,
  RbtManagerStaffRow,
} from '@/app/actions/atsActions';
import {
  AlertTriangle,
  ArrowUpRight,
  BadgeDollarSign,
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  ExternalLink,
  Inbox,
  RefreshCw,
  Search,
  ShieldCheck,
  UserCheck,
  Users,
} from 'lucide-react';

type AccountFilter = 'ALL' | RbtManagerStaffRow['accountStatus'];
type MetricTone = 'emerald' | 'blue' | 'violet' | 'orange';

const HOURS_FORMATTER = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});
const EMPTY_STAFF: RbtManagerStaffRow[] = [];

const METRIC_TONES: Record<
  MetricTone,
  { icon: string; label: string; border: string; glow: string }
> = {
  emerald: {
    icon: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400',
    label: 'text-emerald-400',
    border: 'hover:border-emerald-500/40',
    glow: 'bg-emerald-500/10',
  },
  blue: {
    icon: 'border-blue-500/20 bg-blue-500/10 text-blue-400',
    label: 'text-blue-400',
    border: 'hover:border-blue-500/40',
    glow: 'bg-blue-500/10',
  },
  violet: {
    icon: 'border-violet-500/20 bg-violet-500/10 text-violet-400',
    label: 'text-violet-400',
    border: 'hover:border-violet-500/40',
    glow: 'bg-violet-500/10',
  },
  orange: {
    icon: 'border-brand-orange-500/20 bg-brand-orange-500/10 text-brand-orange-400',
    label: 'text-brand-orange-400',
    border: 'hover:border-brand-orange-500/40',
    glow: 'bg-brand-orange-500/10',
  },
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ''}${parts[parts.length - 1][0] ?? ''}`.toUpperCase();
}

function MetricCard({
  label,
  value,
  detail,
  href,
  linkLabel,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string | number;
  detail: string;
  href: string;
  linkLabel: string;
  icon: ComponentType<{ className?: string }>;
  tone: MetricTone;
}) {
  const styles = METRIC_TONES[tone];
  return (
    <Link
      href={href}
      aria-label={`${label}: ${value}. ${linkLabel}`}
      className="group block cursor-pointer rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
    >
      <Card
        className={`relative h-full overflow-hidden border-white/10 bg-zinc-950/80 shadow-lg backdrop-blur-xl transition-all duration-300 group-hover:-translate-y-0.5 group-hover:shadow-2xl ${styles.border}`}
      >
        <div
          aria-hidden
          className={`pointer-events-none absolute -right-10 -top-12 h-28 w-28 rounded-full blur-3xl ${styles.glow}`}
        />
        <CardContent className="relative p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className={`text-[11px] font-black uppercase tracking-[0.16em] ${styles.label}`}>
                {label}
              </p>
              <p className="mt-2 font-heading text-3xl font-black tracking-tight text-white">{value}</p>
            </div>
            <span className={`rounded-xl border p-2.5 ${styles.icon}`}>
              <Icon className="h-5 w-5" />
            </span>
          </div>
          <p className="mt-2 min-h-8 text-[11px] leading-4 text-zinc-400">{detail}</p>
          <span className="mt-3 inline-flex items-center gap-1 text-[11px] font-bold text-zinc-300 transition-colors group-hover:text-white">
            {linkLabel}
            <ArrowUpRight className="h-3.5 w-3.5" />
          </span>
        </CardContent>
      </Card>
    </Link>
  );
}

function AccountBadge({ status }: { status: RbtManagerStaffRow['accountStatus'] }) {
  if (status === 'ACTIVE') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-black text-emerald-400">
        <span className="dot-live" aria-hidden />
        Active
      </span>
    );
  }
  if (status === 'DEVICE_SESSION_ONLY') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-500/20 bg-sky-500/10 px-2.5 py-1 text-[10px] font-black text-sky-300">
        <ShieldCheck className="h-3 w-3" aria-hidden />
        Device session only
      </span>
    );
  }
  if (status === 'PENDING_ACCOUNT') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-[10px] font-black text-amber-300">
        <AlertTriangle className="h-3 w-3" aria-hidden />
        Account pending
      </span>
    );
  }
  return (
    <span className="inline-flex rounded-full border border-zinc-500/20 bg-zinc-500/10 px-2.5 py-1 text-[10px] font-black text-zinc-400">
      Inactive
    </span>
  );
}

function ErrorState({ message }: { message: string }) {
  const router = useRouter();
  return (
    <div className="relative flex min-h-[58vh] items-center justify-center overflow-hidden rounded-3xl border border-rose-500/20 bg-zinc-950/85 p-6 text-center shadow-2xl backdrop-blur-xl">
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-rose-500/10 blur-3xl"
      />
      <div role="alert" className="relative max-w-lg">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-rose-500/20 bg-rose-500/10 text-rose-400">
          <AlertTriangle className="h-7 w-7" aria-hidden />
        </span>
        <h1 className="mt-5 font-heading text-2xl font-black text-white">
          RBT operations data is unavailable
        </h1>
        <p className="mt-2 text-sm leading-6 text-zinc-400">{message}</p>
        <button
          type="button"
          onClick={() => router.refresh()}
          className="mt-6 inline-flex cursor-pointer items-center gap-2 rounded-xl border border-brand-orange-500/30 bg-brand-orange-500/10 px-4 py-2.5 text-xs font-black text-brand-orange-300 transition-all duration-300 hover:scale-[1.02] hover:border-brand-orange-500/50 hover:bg-brand-orange-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange-400"
        >
          <RefreshCw className="h-4 w-4" aria-hidden />
          Retry dashboard
        </button>
      </div>
    </div>
  );
}

export default function RbtManagerView({ result }: { result: RbtManagerDashboardResult }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [accountFilter, setAccountFilter] = useState<AccountFilter>('ALL');

  const staff = result.success ? result.data.staff : EMPTY_STAFF;
  const filtered = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return staff.filter((row) => {
      const matchesStatus = accountFilter === 'ALL' || row.accountStatus === accountFilter;
      const matchesQuery =
        query.length === 0 ||
        `${row.name} ${row.email} ${row.phone}`.toLowerCase().includes(query);
      return matchesStatus && matchesQuery;
    });
  }, [accountFilter, searchQuery, staff]);

  if (!result.success) return <ErrorState message={result.error} />;

  const { data } = result;
  const inactiveAccounts = Math.max(
    0,
    data.summary.totalRbtAccounts - data.summary.activeRbtAccounts,
  );
  const hasCoverageNotice = data.limits.rosterLimited || data.limits.sessionsLimited;

  return (
    <div className="relative space-y-6 text-white">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 left-1/3 h-64 w-64 rounded-full bg-emerald-500/10 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute top-56 right-0 h-56 w-56 rounded-full bg-brand-orange-500/10 blur-3xl"
      />

      <header className="relative overflow-hidden rounded-3xl border border-white/10 bg-zinc-950/85 p-6 shadow-2xl backdrop-blur-xl sm:p-8">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(16,185,129,0.14),transparent_52%)]"
        />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-emerald-400">
              <span className="dot-live" aria-hidden />
              <UserCheck className="h-4 w-4" aria-hidden />
              Live operations snapshot
              <span className="text-zinc-600" aria-hidden>
                •
              </span>
              <span className="normal-case tracking-normal text-zinc-400">
                Updated {data.generatedAtLabel}
              </span>
            </div>
            <h1 className="font-heading text-3xl font-black tracking-tight text-white sm:text-4xl">
              RBT Staff Manager
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
              Account, assignment, session, payroll-readiness, and task signals from the shared
              Postgres record. Weekly boundaries and displayed dates use Eastern Time.
            </p>
          </div>

          <div className="flex flex-wrap gap-2" aria-label="Roster compliance summary">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 text-[10px] font-bold text-emerald-300">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
              {data.summary.bacbVerifiedCandidates} BACB verified
            </span>
            {data.summary.pendingAccountLinks > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1.5 text-[10px] font-bold text-amber-300">
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                {data.summary.pendingAccountLinks} account link
                {data.summary.pendingAccountLinks === 1 ? '' : 's'} pending
              </span>
            )}
          </div>
        </div>
      </header>

      {hasCoverageNotice && (
        <div
          role="status"
          className="flex items-start gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/[0.07] px-4 py-3 text-xs text-amber-100"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" aria-hidden />
          <p>
            This snapshot reached a safety limit
            {data.limits.rosterLimited ? ` (${data.limits.rosterLimit} roster rows)` : ''}
            {data.limits.rosterLimited && data.limits.sessionsLimited ? ' and' : ''}
            {data.limits.sessionsLimited
              ? ` (${data.limits.sessionLimit.toLocaleString()} weekly sessions)`
              : ''}
            . Refine the underlying reporting window before using totals for reconciliation.
          </p>
        </div>
      )}

      <section aria-labelledby="manager-metrics-title">
        <h2 id="manager-metrics-title" className="sr-only">
          RBT manager metrics
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Active internal RBT profiles"
            value={data.summary.activeRbtAccounts}
            detail={`${data.summary.totalRbtAccounts} internal profiles · ${inactiveAccounts} inactive · ${data.summary.pendingAccountLinks} hired without a linked profile · does not confirm Supabase Auth credentials`}
            href="#rbt-roster"
            linkLabel="Review roster"
            icon={Users}
            tone="emerald"
          />
          <MetricCard
            label="Service sessions"
            value={data.summary.sessionsThisWeek}
            detail={`${data.summary.completedSessions} completed · ${data.summary.inProgressSessions} in progress · ${data.weekLabel}`}
            href="/session-emr"
            linkLabel="Open session tools"
            icon={CalendarDays}
            tone="blue"
          />
          <MetricCard
            label="Payroll-ready hours"
            value={HOURS_FORMATTER.format(data.summary.payrollReadyHours)}
            detail={`${data.summary.payrollReadySessions} ready sessions · ${data.summary.payrollHeldSessions} documentation holds`}
            href="#rbt-roster"
            linkLabel="Review per-RBT payroll"
            icon={BadgeDollarSign}
            tone="violet"
          />
          <MetricCard
            label="Open RBT tasks"
            value={data.summary.openTasks}
            detail={`${data.summary.overdueTasks} overdue before today ET · assigned ActionItem records`}
            href="/clients"
            linkLabel="Open staffing workspace"
            icon={ClipboardList}
            tone="orange"
          />
        </div>
        {data.summary.estimatedUnitSessions > 0 && (
          <p className="mt-2 text-right font-mono text-[10px] text-zinc-500">
            {data.summary.estimatedUnitSessions} payroll session
            {data.summary.estimatedUnitSessions === 1 ? '' : 's'} use duration-based units because
            persisted note units are unavailable.
          </p>
        )}
      </section>

      <Card
        id="rbt-roster"
        className="scroll-mt-6 overflow-hidden border-white/10 bg-zinc-950/85 shadow-2xl backdrop-blur-xl"
      >
        <CardHeader className="border-b border-white/5 pb-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base text-white">
                <BriefcaseBusiness className="h-5 w-5 text-brand-orange-400" aria-hidden />
                RBT operations roster
              </CardTitle>
              <p id="roster-count" aria-live="polite" className="mt-1 text-xs text-zinc-500">
                Showing {filtered.length} of {staff.length} loaded staff records · {data.weekLabel}
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <div>
                <label htmlFor="rbt-manager-search" className="sr-only">
                  Search RBT roster by name, email, or phone
                </label>
                <div className="relative">
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500"
                    aria-hidden
                  />
                  <input
                    id="rbt-manager-search"
                    type="search"
                    placeholder="Search name, email, phone…"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    aria-describedby="roster-count"
                    className="h-10 w-full min-w-0 cursor-text rounded-xl border border-white/10 bg-zinc-900/80 py-2 pl-9 pr-3 text-xs text-white outline-none transition-colors placeholder:text-zinc-600 focus:border-brand-orange-500 focus:ring-2 focus:ring-brand-orange-500/20 sm:w-64"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="rbt-account-filter" className="sr-only">
                  Filter roster by account status
                </label>
                <select
                  id="rbt-account-filter"
                  value={accountFilter}
                  onChange={(event) => setAccountFilter(event.target.value as AccountFilter)}
                  className="h-10 w-full cursor-pointer rounded-xl border border-white/10 bg-zinc-900/80 px-3 text-xs font-bold text-zinc-200 outline-none transition-colors focus:border-brand-orange-500 focus:ring-2 focus:ring-brand-orange-500/20 sm:w-44"
                >
                  <option value="ALL">All account states</option>
                  <option value="ACTIVE">Active</option>
                  <option value="DEVICE_SESSION_ONLY">Device session only</option>
                  <option value="PENDING_ACCOUNT">Account pending</option>
                  <option value="INACTIVE">Inactive</option>
                </select>
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {staff.length === 0 ? (
            <div className="relative px-6 py-16 text-center">
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(249,115,22,0.07),transparent_58%)]"
              />
              <Inbox className="relative mx-auto h-10 w-10 text-zinc-600" aria-hidden />
              <h3 className="relative mt-3 font-heading text-lg font-bold text-white">
                No RBT staff records yet
              </h3>
              <p className="relative mx-auto mt-2 max-w-lg text-xs leading-5 text-zinc-500">
                RBT accounts and hired ATS candidates will appear here after the hire flow creates
                or links a staff account.
              </p>
              <Link
                href="/ats"
                className="relative mt-5 inline-flex cursor-pointer items-center gap-2 rounded-xl border border-brand-orange-500/30 bg-brand-orange-500/10 px-4 py-2.5 text-xs font-black text-brand-orange-300 transition-all duration-300 hover:scale-[1.02] hover:border-brand-orange-500/50 hover:bg-brand-orange-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange-400"
              >
                Open ATS pipeline
                <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              </Link>
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-6 py-14 text-center">
              <Search className="mx-auto h-9 w-9 text-zinc-600" aria-hidden />
              <h3 className="mt-3 font-heading text-base font-bold text-white">
                No roster records match
              </h3>
              <p className="mt-1 text-xs text-zinc-500">
                Change the search text or account-state filter.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setAccountFilter('ALL');
                }}
                className="mt-4 cursor-pointer rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-xs font-bold text-zinc-200 transition-colors hover:border-white/20 hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange-400"
              >
                Clear filters
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-[1180px] w-full text-left text-xs text-zinc-300">
                <caption className="sr-only">
                  RBT staff account, assignment, session, payroll, task, and ATS details for{' '}
                  {data.weekLabel}
                </caption>
                <thead className="border-b border-white/5 bg-zinc-900/80 text-[10px] font-black uppercase tracking-[0.12em] text-zinc-400">
                  <tr>
                    <th scope="col" className="px-4 py-3.5">
                      RBT
                    </th>
                    <th scope="col" className="px-4 py-3.5">
                      Account &amp; compliance
                    </th>
                    <th scope="col" className="px-4 py-3.5 text-center">
                      Caseload
                    </th>
                    <th scope="col" className="px-4 py-3.5">
                      ET-week sessions
                    </th>
                    <th scope="col" className="px-4 py-3.5">
                      Payroll
                    </th>
                    <th scope="col" className="px-4 py-3.5">
                      Tasks
                    </th>
                    <th scope="col" className="px-4 py-3.5">
                      Account since
                    </th>
                    <th scope="col" className="px-4 py-3.5 text-right">
                      Drill-down
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filtered.map((rbt) => (
                    <tr
                      key={rbt.id}
                      className="transition-colors duration-200 hover:bg-white/[0.035]"
                    >
                      <td className="px-4 py-4 align-top">
                        <div className="flex items-start gap-2.5">
                          <div
                            aria-hidden
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-brand-orange-500/20 bg-brand-orange-500/10 text-[11px] font-black text-brand-orange-300"
                          >
                            {initials(rbt.name)}
                          </div>
                          <div className="min-w-0">
                            <p className="font-bold text-white">{rbt.name}</p>
                            <a
                              href={`mailto:${rbt.email}`}
                              className="mt-0.5 block max-w-52 cursor-pointer truncate font-mono text-[10px] text-zinc-500 underline-offset-2 transition-colors hover:text-zinc-200 hover:underline"
                            >
                              {rbt.email}
                            </a>
                            {rbt.phone && (
                              <a
                                href={`tel:${rbt.phone.replace(/[^\d+]/g, '')}`}
                                className="mt-0.5 block cursor-pointer font-mono text-[10px] text-zinc-600 underline-offset-2 transition-colors hover:text-zinc-300 hover:underline"
                              >
                                {rbt.phone}
                              </a>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 align-top">
                        <AccountBadge status={rbt.accountStatus} />
                        <p className="mt-2 flex items-center gap-1.5 text-[10px]">
                          {rbt.bacbVerified ? (
                            <>
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" aria-hidden />
                              <span className="text-emerald-300">BACB verified</span>
                            </>
                          ) : rbt.bacbOnFile ? (
                            <>
                              <AlertTriangle className="h-3.5 w-3.5 text-amber-400" aria-hidden />
                              <span className="text-amber-300">BACB verification pending</span>
                            </>
                          ) : (
                            <span className="text-zinc-600">No ATS verification record</span>
                          )}
                        </p>
                      </td>
                      <td className="px-4 py-4 text-center align-top">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 font-mono text-[10px] font-bold ${
                            rbt.caseloadCount > 0
                              ? 'border-blue-500/20 bg-blue-500/10 text-blue-300'
                              : 'border-white/5 bg-white/[0.03] text-zinc-600'
                          }`}
                        >
                          <BriefcaseBusiness className="h-3 w-3" aria-hidden />
                          {rbt.caseloadCount}
                        </span>
                      </td>
                      <td className="px-4 py-4 align-top">
                        <p className="font-mono text-sm font-black text-white">
                          {rbt.sessionsThisWeek}
                        </p>
                        <p className="mt-1 text-[10px] text-zinc-500">
                          {rbt.completedSessions} complete
                          {rbt.inProgressSessions > 0
                            ? ` · ${rbt.inProgressSessions} in progress`
                            : ''}
                        </p>
                      </td>
                      <td className="px-4 py-4 align-top">
                        <p className="font-mono text-sm font-black text-violet-300">
                          {HOURS_FORMATTER.format(rbt.payrollReadyHours)}h ready
                        </p>
                        <p
                          className={`mt-1 text-[10px] ${
                            rbt.payrollHeldSessions > 0 ? 'text-amber-300' : 'text-zinc-500'
                          }`}
                        >
                          {rbt.payrollHeldSessions} documentation hold
                          {rbt.payrollHeldSessions === 1 ? '' : 's'}
                        </p>
                      </td>
                      <td className="px-4 py-4 align-top">
                        <p className="font-mono text-sm font-black text-white">{rbt.openTasks} open</p>
                        <p
                          className={`mt-1 text-[10px] ${
                            rbt.overdueTasks > 0 ? 'text-rose-300' : 'text-zinc-500'
                          }`}
                        >
                          {rbt.overdueTasks} overdue
                        </p>
                      </td>
                      <td className="px-4 py-4 align-top font-mono text-[11px] text-zinc-400">
                        {rbt.staffSinceLabel ?? 'Account not linked'}
                      </td>
                      <td className="px-4 py-4 text-right align-top">
                        <div className="flex flex-wrap justify-end gap-1.5">
                          {rbt.candidateId && (
                            <Link
                              href={`/ats/applicant/${rbt.candidateId}`}
                              className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-white/10 bg-zinc-900 px-2.5 py-1.5 text-[10px] font-bold text-zinc-200 transition-all duration-300 hover:border-brand-orange-500/40 hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange-400"
                            >
                              ATS dossier
                              <ExternalLink className="h-3 w-3" aria-hidden />
                            </Link>
                          )}
                          {rbt.userId && (
                            <Link
                              href="/session-emr"
                              aria-label={`Open session tools for ${rbt.name}`}
                              className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-blue-500/20 bg-blue-500/10 px-2.5 py-1.5 text-[10px] font-bold text-blue-300 transition-all duration-300 hover:border-blue-500/40 hover:bg-blue-500/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                            >
                              Sessions
                              <ArrowUpRight className="h-3 w-3" aria-hidden />
                            </Link>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
