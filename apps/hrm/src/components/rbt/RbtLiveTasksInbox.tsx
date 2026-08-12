'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  Briefcase,
  CheckCircle2,
  ClipboardList,
  CreditCard,
  FileWarning,
  FileText,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import { listMyCaseApplications } from '@/app/actions/caseOpeningActions';
import { listRbtPayrollSessions } from '@/app/actions/payrollActions';
import { loadAtsProgress } from '@/lib/syncAtsProgress';
import {
  buildJobAppTasks,
  buildOnboardingTasks,
  buildPayHoldTasks,
  filterTasks,
  sortTaskItems,
  type TaskFilter,
  type TaskItem,
  type TaskKind,
} from '@/components/rbt/RbtTasksModel';

function toneClasses(tone: TaskItem['tone']) {
  switch (tone) {
    case 'rose':
      return {
        badge: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
        icon: 'text-rose-400',
      };
    case 'sky':
      return {
        badge: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
        icon: 'text-sky-400',
      };
    case 'emerald':
      return {
        badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
        icon: 'text-emerald-400',
      };
    default:
      return {
        badge: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
        icon: 'text-[#F97316]',
      };
  }
}

function kindIcon(kind: TaskKind) {
  switch (kind) {
    case 'PAY_HOLD':
      return FileWarning;
    case 'JOB_APP':
      return Briefcase;
    default:
      return FileText;
  }
}

type SourceIssue = {
  source: 'Payroll' | 'Applications' | 'Onboarding' | 'Tasks';
  message: string;
};

export function RbtLiveTasksInbox() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [filter, setFilter] = useState<TaskFilter>('ALL');
  const [issues, setIssues] = useState<SourceIssue[]>([]);
  const [sourceHint, setSourceHint] = useState('Live · persisted sources');
  const [referenceNow, setReferenceNow] = useState(0);
  const refreshSequence = useRef(0);

  const refresh = useCallback(async (soft = false, notify = false) => {
    const requestId = ++refreshSequence.current;
    if (soft) setRefreshing(true);

    try {
      const [progress, payrollRes, appsRes] = await Promise.all([
        loadAtsProgress(soft),
        listRbtPayrollSessions(),
        listMyCaseApplications(),
      ]);
      if (requestId !== refreshSequence.current) return;

      const nextIssues: SourceIssue[] = [];
      if (!payrollRes.success) {
        nextIssues.push({
          source: 'Payroll',
          message: payrollRes.error || 'Session documentation could not be loaded.',
        });
      }
      if (!appsRes.success) {
        nextIssues.push({
          source: 'Applications',
          message: appsRes.error || 'Case applications could not be loaded.',
        });
      }
      if (!progress) {
        nextIssues.push({
          source: 'Onboarding',
          message: 'No persisted onboarding progress was resolved for this RBT.',
        });
      }

      const next = sortTaskItems([
        ...buildPayHoldTasks(payrollRes.success ? payrollRes.sessions : []),
        ...buildJobAppTasks(appsRes.success ? appsRes.applications : []),
        ...(progress ? buildOnboardingTasks(progress) : []),
      ]);

      const loadedSources: string[] = [];
      if (payrollRes.success) loadedSources.push('payroll');
      if (appsRes.success) loadedSources.push('applications');
      if (progress) loadedSources.push('onboarding');

      setTasks(next);
      setIssues(nextIssues);
      setReferenceNow(Date.now());
      setSourceHint(
        loadedSources.length > 0
          ? `Live · ${loadedSources.join(' · ')}`
          : 'Live · sources unavailable'
      );

      if (notify) {
        if (nextIssues.length > 0) {
          toast.warning('Tasks refreshed with one or more sources unavailable.');
        } else {
          toast.success('Tasks refreshed from persisted sources.');
        }
      }
    } catch {
      if (requestId !== refreshSequence.current) return;
      setTasks([]);
      setIssues([
        {
          source: 'Tasks',
          message: 'The task inbox could not be loaded. Try again.',
        },
      ]);
      setSourceHint('Live · refresh failed');
      if (notify) toast.error('Could not refresh tasks.');
    } finally {
      if (requestId === refreshSequence.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    const initialRefreshTimer = window.setTimeout(() => {
      void refresh(false);
    }, 0);
    const onHolds = () => void refresh(true);
    const onJobs = () => void refresh(true);
    const onProgress = () => void refresh(true);
    window.addEventListener('ras_rbt_pay_holds_changed', onHolds);
    window.addEventListener('ras_rbt_jobs_changed', onJobs);
    window.addEventListener('rbt_progress_synced', onProgress);
    window.addEventListener('rbt_tasks_changed', onProgress);
    return () => {
      window.clearTimeout(initialRefreshTimer);
      window.removeEventListener('ras_rbt_pay_holds_changed', onHolds);
      window.removeEventListener('ras_rbt_jobs_changed', onJobs);
      window.removeEventListener('rbt_progress_synced', onProgress);
      window.removeEventListener('rbt_tasks_changed', onProgress);
      refreshSequence.current += 1;
    };
  }, [refresh]);

  const counts = useMemo(() => {
    return {
      total: tasks.length,
      pay: tasks.filter((t) => t.kind === 'PAY_HOLD').length,
      jobs: tasks.filter((t) => t.kind === 'JOB_APP').length,
      onboarding: tasks.filter((t) => t.kind === 'ONBOARDING').length,
    };
  }, [tasks]);
  const visibleTasks = useMemo(() => filterTasks(tasks, filter), [filter, tasks]);
  const activeFilterLabel: Record<TaskFilter, string> = {
    ALL: 'open',
    PAY_HOLD: 'pay-hold',
    JOB_APP: 'application',
    ONBOARDING: 'onboarding',
  };

  if (loading) {
    return (
      <section
        className="relative mx-auto max-w-5xl space-y-5 py-8"
        role="status"
        aria-live="polite"
        aria-label="Loading RBT tasks"
      >
        <div className="pointer-events-none absolute right-0 top-0 h-72 w-72 rounded-full bg-[#F97316]/10 blur-3xl" />
        <div className="relative h-24 animate-pulse rounded-3xl border border-white/10 bg-zinc-950/80 backdrop-blur-xl" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[0, 1, 2, 3].map((item) => (
            <div
              key={item}
              className="h-24 animate-pulse rounded-2xl border border-white/10 bg-zinc-950/70 backdrop-blur-xl"
            />
          ))}
        </div>
        <div className="h-36 animate-pulse rounded-3xl border border-white/10 bg-zinc-950/70 backdrop-blur-xl" />
        <span className="sr-only">Loading live tasks…</span>
      </section>
    );
  }

  return (
    <div className="relative max-w-5xl mx-auto space-y-6 pb-12 animate-fade-in">
      <div className="pointer-events-none absolute -top-24 right-0 w-[420px] h-[420px] rounded-full bg-[#F97316]/10 blur-3xl" />

      <div className="relative flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-zinc-950/80 backdrop-blur-xl border border-white/10 flex items-center justify-center shadow-lg shadow-orange-500/10">
              <ClipboardList className="w-5 h-5 text-[#F97316]" aria-hidden="true" />
            </div>
            <h1 className="text-3xl font-black text-white font-heading tracking-tight">
              My Tasks
            </h1>
          </div>
          <p className="text-xs text-zinc-400 font-semibold mt-1 max-w-2xl">
            Your persisted onboarding, session-note, and case-application work. Documentation
            deadlines are shown in Eastern Time.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void refresh(true, true)}
            disabled={refreshing}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-white/10 bg-zinc-950/80 px-3 py-1.5 text-[10px] font-black uppercase tracking-wide text-zinc-200 backdrop-blur-xl transition-all duration-300 hover:border-[#F97316]/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F97316]/70 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            {refreshing ? 'Refreshing…' : 'Refresh tasks'}
          </button>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-wide ${
              issues.length > 0
                ? 'border-amber-500/20 bg-amber-500/10 text-amber-300'
                : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
            }`}
            role="status"
            aria-live="polite"
          >
            <span
              className={`h-2 w-2 rounded-full ${
                issues.length > 0 ? 'bg-amber-400' : 'dot-live bg-emerald-400'
              }`}
              aria-hidden="true"
            />
            {sourceHint}
          </span>
        </div>
      </div>

      <div
        className="grid grid-cols-2 gap-3 sm:grid-cols-4"
        role="group"
        aria-label="Filter RBT tasks"
      >
        {(
          [
            { filter: 'ALL', label: 'Open', value: counts.total, icon: Sparkles },
            {
              filter: 'PAY_HOLD',
              label: 'Pay holds',
              value: counts.pay,
              icon: CreditCard,
            },
            {
              filter: 'JOB_APP',
              label: 'Applications',
              value: counts.jobs,
              icon: Briefcase,
            },
            {
              filter: 'ONBOARDING',
              label: 'Onboarding',
              value: counts.onboarding,
              icon: FileText,
            },
          ] as const
        ).map((stat) => {
          const Icon = stat.icon;
          const active = filter === stat.filter;
          return (
            <button
              type="button"
              key={stat.label}
              onClick={() => setFilter(stat.filter)}
              aria-pressed={active}
              className={`cursor-pointer rounded-2xl border bg-zinc-950/80 p-4 text-left backdrop-blur-xl transition-all duration-300 hover:scale-[1.01] hover:border-[#F97316]/40 hover:shadow-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F97316]/70 ${
                active
                  ? 'border-[#F97316]/60 shadow-lg shadow-orange-500/10'
                  : 'border-white/10'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span
                  className={`text-[10px] font-mono font-bold uppercase tracking-wider ${
                    active ? 'text-[#F97316]' : 'text-zinc-500'
                  }`}
                >
                  {stat.label}
                </span>
                <Icon className="w-3.5 h-3.5 text-[#F97316]" aria-hidden="true" />
              </div>
              <p className="text-2xl font-black text-white font-heading">{stat.value}</p>
            </button>
          );
        })}
      </div>

      {issues.length > 0 ? (
        <div
          className="relative overflow-hidden rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 backdrop-blur-xl"
          role="alert"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <AlertTriangle
                className="mt-0.5 h-5 w-5 shrink-0 text-amber-300"
                aria-hidden="true"
              />
              <div>
                <p className="text-sm font-black text-amber-100">
                  {issues.length === 1
                    ? `${issues[0].source} source unavailable`
                    : 'Some task sources are unavailable'}
                </p>
                <ul className="mt-1 space-y-0.5 text-xs font-medium text-amber-100/70">
                  {issues.map((issue) => (
                    <li key={`${issue.source}-${issue.message}`}>
                      {issue.source}: {issue.message}
                    </li>
                  ))}
                </ul>
                <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-amber-300/80">
                  Loaded tasks remain visible; a clear inbox is not confirmed.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void refresh(true, true)}
              disabled={refreshing}
              className="inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-amber-400/20 bg-zinc-950/40 px-3.5 py-2 text-[11px] font-black text-amber-100 transition hover:border-amber-300/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/70 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              Retry sources
            </button>
          </div>
        </div>
      ) : null}

      <p className="sr-only" aria-live="polite">
        Showing {visibleTasks.length} of {tasks.length} tasks.
      </p>

      {tasks.length === 0 && issues.length === 0 ? (
        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-zinc-950/80 backdrop-blur-xl p-8 shadow-2xl">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_rgba(16,185,129,0.12),_transparent_55%)] pointer-events-none" />
          <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 flex items-center justify-center shrink-0">
                <CheckCircle2
                  className="w-5 h-5 text-emerald-400"
                  aria-hidden="true"
                />
              </div>
              <div>
                <h3 className="text-lg font-black text-white font-heading">You&apos;re clear</h3>
                <p className="text-xs text-zinc-400 font-medium mt-1 max-w-lg">
                  No open onboarding steps, pay holds, or active job applications. Schedule sessions
                  and apply to openings when you&apos;re ready — nothing is invented here when the
                  queues are empty.
                </p>
              </div>
            </div>
            <div className="relative flex flex-wrap gap-2">
              <Link
                href="/rbt/schedule"
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-[11px] font-black text-zinc-200 transition-all duration-300 hover:border-[#F97316]/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F97316]/70"
              >
                Schedule <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
              </Link>
              <Link
                href="/rbt/job-board"
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-[#F97316] px-4 py-2 text-[11px] font-black text-white transition-all duration-300 hover:bg-orange-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-300"
              >
                Job board <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
              </Link>
              <Link
                href="/rbt/payroll"
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-[11px] font-black text-zinc-200 transition-all duration-300 hover:border-[#F97316]/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F97316]/70"
              >
                Payroll
              </Link>
            </div>
          </div>
        </div>
      ) : tasks.length === 0 ? (
        <div className="relative overflow-hidden rounded-3xl border border-amber-500/20 bg-zinc-950/80 p-8 shadow-2xl backdrop-blur-xl">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_rgba(245,158,11,0.12),_transparent_55%)]" />
          <div className="relative flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-amber-500/20 bg-amber-500/10">
              <AlertTriangle className="h-5 w-5 text-amber-300" aria-hidden="true" />
            </div>
            <div>
              <h3 className="font-heading text-lg font-black text-white">
                Inbox status unavailable
              </h3>
              <p className="mt-1 max-w-lg text-xs font-medium text-zinc-400">
                No task source returned a complete result, so this inbox cannot confirm that
                you&apos;re clear. Retry before relying on an empty queue.
              </p>
            </div>
          </div>
        </div>
      ) : visibleTasks.length === 0 ? (
        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-zinc-950/80 p-8 shadow-2xl backdrop-blur-xl">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_rgba(249,115,22,0.1),_transparent_55%)]" />
          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/5">
                <FileText className="h-5 w-5 text-[#F97316]" aria-hidden="true" />
              </div>
              <div>
                <h3 className="font-heading text-lg font-black text-white">
                  No {activeFilterLabel[filter]} tasks
                </h3>
                <p className="mt-1 max-w-lg text-xs font-medium text-zinc-400">
                  Other task categories may still contain open work.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setFilter('ALL')}
              className="inline-flex cursor-pointer items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-[11px] font-black text-zinc-200 transition hover:border-[#F97316]/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F97316]/70"
            >
              Show all tasks
            </button>
          </div>
        </div>
      ) : (
        <ul className="space-y-3" aria-label={`${activeFilterLabel[filter]} RBT tasks`}>
          {visibleTasks.map((task) => {
            const Icon = kindIcon(task.kind);
            const tones = toneClasses(task.tone);
            const overdue = Boolean(
              task.dueAt && referenceNow > 0 && Date.parse(task.dueAt) < referenceNow
            );
            return (
              <li key={task.id}>
                <Link
                  href={task.href}
                  className="group flex cursor-pointer flex-col justify-between gap-3 rounded-3xl border border-white/10 bg-zinc-950/80 p-5 shadow-xl backdrop-blur-xl transition-all duration-300 hover:scale-[1.01] hover:border-[#F97316]/40 hover:shadow-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F97316]/70 sm:flex-row sm:items-center"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div
                      className={`w-10 h-10 rounded-2xl border border-white/10 bg-white/5 flex items-center justify-center shrink-0 ${tones.icon}`}
                    >
                      <Icon className="w-5 h-5" aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-wide ${tones.badge}`}
                        >
                          {task.kind === 'PAY_HOLD'
                            ? 'Pay hold'
                            : task.kind === 'JOB_APP'
                              ? 'Application'
                              : 'Onboarding'}
                        </span>
                        {task.meta ? (
                          task.dueAt ? (
                            <time
                              dateTime={task.dueAt}
                              className={`truncate font-mono text-[10px] ${
                                overdue ? 'font-black text-rose-300' : 'text-zinc-500'
                              }`}
                            >
                              {overdue
                                ? `Overdue · ${task.meta.replace(/^Due /, '')}`
                                : task.meta}
                            </time>
                          ) : (
                            <span className="truncate font-mono text-[10px] text-zinc-500">
                              {task.meta}
                            </span>
                          )
                        ) : null}
                      </div>
                      <h3 className="text-sm font-black text-white font-heading truncate">
                        {task.title}
                      </h3>
                      <p className="text-xs text-zinc-400 font-medium mt-0.5 leading-relaxed">
                        {task.detail}
                      </p>
                    </div>
                  </div>
                  <span className="shrink-0 inline-flex items-center gap-1.5 self-start sm:self-center rounded-xl border border-white/10 bg-white/5 group-hover:border-[#F97316]/50 group-hover:text-[#F97316] text-zinc-200 text-[11px] font-black px-3.5 py-2 transition-all">
                    {task.cta}
                    <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex flex-wrap gap-2 pt-1">
        {[
          { href: '/rbt/schedule', label: 'Schedule' },
          { href: '/rbt/payroll', label: 'Payroll' },
          { href: '/rbt/job-board', label: 'Job board' },
          { href: '/rbt/documents', label: 'Documents' },
        ].map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-white/10 bg-zinc-950/60 px-3 py-1.5 text-[10px] font-black uppercase tracking-wide text-zinc-400 backdrop-blur-xl transition-all duration-300 hover:border-[#F97316]/40 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F97316]/70"
          >
            {link.label}
            <ArrowRight className="w-3 h-3" aria-hidden="true" />
          </Link>
        ))}
      </div>
    </div>
  );
}
