'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CircleDashed,
  FileCheck2,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  UserCheck,
} from 'lucide-react';
import { getAtsCandidates } from '@/app/actions/atsActions';
import {
  activationStatusLabel,
  deriveAtsStage,
  type AtsCandidateData,
  type AtsStage,
} from '@/lib/atsStage';

type CandidateRow = AtsCandidateData & { updatedAt: string };
type RequirementKey =
  | 'reqTasks'
  | 'reqAvail'
  | 'reqSim'
  | 'reqInterview'
  | 'certUploaded';

const REQUIREMENTS: Array<{
  key: RequirementKey;
  label: string;
  detail: string;
}> = [
  {
    key: 'reqTasks',
    label: 'Onboarding pack',
    detail: 'Required forms and signatures',
  },
  {
    key: 'reqAvail',
    label: 'Availability',
    detail: 'Weekly schedule and travel preferences',
  },
  {
    key: 'reqSim',
    label: 'Data simulation',
    detail: 'Required ABA collection simulation',
  },
  {
    key: 'reqInterview',
    label: 'HR interview',
    detail: 'Interview completed and approved',
  },
  {
    key: 'certUploaded',
    label: '40-hour certificate',
    detail: 'BACB course certificate on file',
  },
];

const STAGE_META: Record<
  AtsStage,
  { label: string; description: string; className: string }
> = {
  APPLIED: {
    label: 'Applied',
    description: 'Waiting for HR review',
    className: 'border-blue-500/25 bg-blue-500/10 text-blue-300',
  },
  PHONE_SCREEN: {
    label: 'In progress',
    description: 'Completing onboarding requirements',
    className: 'border-amber-500/25 bg-amber-500/10 text-amber-300',
  },
  INTERVIEW: {
    label: 'Interview',
    description: 'Interview booked and awaiting evaluation',
    className: 'border-violet-500/25 bg-violet-500/10 text-violet-300',
  },
  OFFER: {
    label: 'Offer ready',
    description: 'All five ATS requirements are complete',
    className: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300',
  },
  HIRED: {
    label: 'Hired',
    description: 'RBT staff portal unlocked',
    className: 'border-green-500/30 bg-green-500/10 text-green-300',
  },
  HELP_DESK: {
    label: 'Help needed',
    description: 'An onboarding help ticket is open',
    className: 'border-rose-500/30 bg-rose-500/10 text-rose-300',
  },
  REJECTED: {
    label: 'Rejected',
    description: 'Candidate is no longer in the live funnel',
    className: 'border-zinc-500/30 bg-zinc-500/10 text-zinc-300',
  },
};

const ACTIVATION_TONE_CLASS = {
  pending: 'border-zinc-500/25 bg-zinc-500/10 text-zinc-300',
  invited: 'border-sky-500/25 bg-sky-500/10 text-sky-300',
  active: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300',
  rejected: 'border-rose-500/25 bg-rose-500/10 text-rose-300',
} as const;

function canonicalStage(candidate: CandidateRow): AtsStage {
  return deriveAtsStage({
    activationStatus: candidate.activationStatus,
    currentStage: candidate.stage,
    progress: {
      tasksDone: candidate.reqTasks === true,
      availabilityDone: candidate.reqAvail === true,
      simulationDone: candidate.reqSim === true,
      interviewBooked: candidate.interviewBooked === true,
      interviewPassed: candidate.reqInterview === true,
      certUploaded: candidate.certUploaded === true,
      backgroundCleared: candidate.backgroundCleared === true,
      helpDeskOpen: Boolean(candidate.helpTicketId),
    },
  });
}

function CandidateSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="animate-pulse rounded-2xl border border-white/10 bg-zinc-950/70 p-6"
    >
      <div className="flex justify-between gap-4">
        <div className="space-y-3">
          <div className="h-5 w-44 rounded bg-white/10" />
          <div className="h-3 w-56 rounded bg-white/5" />
        </div>
        <div className="h-7 w-24 rounded-full bg-white/10" />
      </div>
      <div className="mt-6 h-2 rounded-full bg-white/10" />
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {REQUIREMENTS.map((requirement) => (
          <div key={requirement.key} className="h-24 rounded-xl bg-white/5" />
        ))}
      </div>
    </div>
  );
}

export default function RbtOnboardingChecklist() {
  const [candidates, setCandidates] = useState<CandidateRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshCandidates = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await getAtsCandidates();
      if (!result.success) {
        setCandidates([]);
        setError(result.error || 'The onboarding queue could not be loaded.');
        return;
      }

      setCandidates(
        result.data
          .filter((candidate) => candidate.roleApplied === 'RBT')
          .sort(
            (left, right) =>
              new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
          )
      );
    } catch (loadError) {
      setCandidates([]);
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'The onboarding queue could not be loaded.'
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const initialLoadTimer = window.setTimeout(() => {
      void refreshCandidates();
    }, 0);
    const handleProgressSync = () => void refreshCandidates();
    window.addEventListener('rbt_progress_synced', handleProgressSync);
    return () => {
      window.clearTimeout(initialLoadTimer);
      window.removeEventListener('rbt_progress_synced', handleProgressSync);
    };
  }, [refreshCandidates]);

  const queueStats = useMemo(() => {
    return candidates.reduce(
      (stats, candidate) => {
        const stage = canonicalStage(candidate);
        if (stage !== 'HIRED' && stage !== 'REJECTED') stats.active += 1;
        if (stage === 'OFFER') stats.ready += 1;
        if (stage === 'HIRED') stats.hired += 1;
        return stats;
      },
      { active: 0, ready: 0, hired: 0 }
    );
  }, [candidates]);

  return (
    <main className="relative min-h-full overflow-hidden bg-zinc-950 px-4 py-6 text-white sm:px-6 lg:px-8">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-[radial-gradient(circle_at_top_left,rgba(249,115,22,0.16),transparent_42%),radial-gradient(circle_at_top_right,rgba(59,130,246,0.12),transparent_38%)]"
        aria-hidden="true"
      />

      <div className="relative mx-auto max-w-7xl space-y-6">
        <header className="overflow-hidden rounded-3xl border border-white/10 bg-zinc-950/75 p-6 shadow-2xl shadow-black/20 backdrop-blur-xl sm:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-brand-orange-500/25 bg-brand-orange-500/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-brand-orange-300">
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                Live ATS readiness
              </div>
              <h1 className="font-heading text-3xl font-black tracking-tight text-white sm:text-4xl">
                RBT onboarding command center
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">
                Monitor the five canonical ATS requirements. Completing them advances a candidate
                to Offer; only a recorded Hire unlocks the RBT staff portal.
              </p>
            </div>

            <button
              type="button"
              onClick={() => void refreshCandidates()}
              disabled={isLoading}
              className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-xs font-bold text-zinc-200 transition-all duration-300 hover:border-brand-orange-500/40 hover:bg-brand-orange-500/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange-400 disabled:pointer-events-auto disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw
                className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              Refresh queue
            </button>
          </div>

          <dl className="mt-7 grid gap-3 sm:grid-cols-3">
            {[
              { label: 'Active onboarding', value: queueStats.active, tone: 'text-sky-300' },
              { label: 'Offer ready', value: queueStats.ready, tone: 'text-emerald-300' },
              { label: 'Hired / unlocked', value: queueStats.hired, tone: 'text-green-300' },
            ].map((stat) => (
              <div
                key={stat.label}
                className="rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-3"
              >
                <dt className="text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500">
                  {stat.label}
                </dt>
                <dd className={`mt-1 font-mono text-2xl font-black ${stat.tone}`}>
                  {isLoading ? '—' : stat.value}
                </dd>
              </div>
            ))}
          </dl>
        </header>

        {error && (
          <section
            role="alert"
            aria-live="assertive"
            className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-5 shadow-lg shadow-rose-950/20"
          >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <AlertTriangle
                  className="mt-0.5 h-5 w-5 shrink-0 text-rose-300"
                  aria-hidden="true"
                />
                <div>
                  <h2 className="font-heading text-sm font-black text-rose-100">
                    Onboarding requirements are unavailable
                  </h2>
                  <p className="mt-1 text-xs leading-5 text-rose-200/80">{error}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => void refreshCandidates()}
                disabled={isLoading}
                className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-2 text-xs font-bold text-rose-100 transition-colors hover:bg-rose-400/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300 disabled:pointer-events-auto disabled:cursor-not-allowed disabled:opacity-50"
              >
                Try again
              </button>
            </div>
          </section>
        )}

        <section aria-labelledby="candidate-queue-heading" aria-busy={isLoading}>
          <div className="sr-only" id="candidate-queue-heading">
            RBT onboarding candidate queue
          </div>

          {isLoading ? (
            <div className="space-y-4" role="status" aria-label="Loading onboarding candidates">
              <CandidateSkeleton />
              <CandidateSkeleton />
              <span className="sr-only">Loading onboarding candidates…</span>
            </div>
          ) : !error && candidates.length === 0 ? (
            <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-zinc-950/80 p-10 text-center shadow-2xl backdrop-blur-xl">
              <div
                className="pointer-events-none absolute left-1/2 top-0 h-40 w-72 -translate-x-1/2 rounded-full bg-brand-orange-500/10 blur-3xl"
                aria-hidden="true"
              />
              <div className="relative mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-zinc-900 text-brand-orange-300">
                <ShieldCheck className="h-7 w-7" aria-hidden="true" />
              </div>
              <h2 className="relative mt-4 font-heading text-xl font-black text-white">
                No RBT candidates in the queue
              </h2>
              <p className="relative mx-auto mt-2 max-w-md text-sm leading-6 text-zinc-400">
                This workbench shows persisted ATS applicants only. Sample candidates are never
                injected into live onboarding.
              </p>
              <Link
                href="/ats"
                className="relative mt-6 inline-flex cursor-pointer items-center gap-2 rounded-xl border border-brand-orange-500/30 bg-brand-orange-500/10 px-4 py-2.5 text-xs font-black text-brand-orange-200 transition-all duration-300 hover:border-brand-orange-500/50 hover:bg-brand-orange-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange-400"
              >
                Open ATS pipeline
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {candidates.map((candidate) => {
                const stage = canonicalStage(candidate);
                const stageMeta = STAGE_META[stage];
                const activation = activationStatusLabel(candidate.activationStatus);
                const completedCount = REQUIREMENTS.filter(
                  (requirement) => candidate[requirement.key] === true
                ).length;
                const progressPercent = (completedCount / REQUIREMENTS.length) * 100;

                return (
                  <article
                    key={candidate.id}
                    className="group relative overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/80 p-5 shadow-xl shadow-black/10 backdrop-blur-xl transition-all duration-300 hover:scale-[1.005] hover:border-brand-orange-500/35 hover:shadow-2xl hover:shadow-brand-orange-950/10 sm:p-6"
                  >
                    <div
                      className="pointer-events-none absolute -right-20 -top-20 h-44 w-44 rounded-full bg-brand-orange-500/[0.06] blur-3xl transition-opacity duration-300 group-hover:opacity-100"
                      aria-hidden="true"
                    />

                    <div className="relative flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="truncate font-heading text-xl font-black text-white">
                            {candidate.name}
                          </h2>
                          <span
                            className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${stageMeta.className}`}
                          >
                            {stageMeta.label}
                          </span>
                          <span
                            className={`rounded-full border px-2.5 py-1 text-[10px] font-bold ${ACTIVATION_TONE_CLASS[activation.tone]}`}
                          >
                            {activation.label}
                          </span>
                        </div>
                        <p className="mt-1 truncate text-xs text-zinc-400">{candidate.email}</p>
                        <p className="mt-3 text-xs font-semibold text-zinc-300">
                          {stageMeta.description}
                        </p>
                      </div>

                      <div className="w-full xl:max-w-xs">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-zinc-300">ATS requirement progress</span>
                          <span className="font-mono font-black text-brand-orange-300">
                            {completedCount}/{REQUIREMENTS.length}
                          </span>
                        </div>
                        <div
                          className="mt-2 h-2.5 overflow-hidden rounded-full border border-white/5 bg-zinc-900"
                          role="progressbar"
                          aria-label={`${candidate.name} onboarding requirement progress`}
                          aria-valuemin={0}
                          aria-valuemax={REQUIREMENTS.length}
                          aria-valuenow={completedCount}
                          aria-valuetext={`${completedCount} of ${REQUIREMENTS.length} requirements complete`}
                        >
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              completedCount === REQUIREMENTS.length
                                ? 'bg-gradient-to-r from-emerald-500 to-green-400'
                                : 'bg-gradient-to-r from-brand-orange-600 to-amber-400'
                            }`}
                            style={{ width: `${progressPercent}%` }}
                          />
                        </div>
                      </div>
                    </div>

                    <ul className="relative mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                      {REQUIREMENTS.map((requirement) => {
                        const isDone = candidate[requirement.key] === true;
                        return (
                          <li
                            key={requirement.key}
                            className={`rounded-xl border p-3.5 ${
                              isDone
                                ? 'border-emerald-500/20 bg-emerald-500/[0.07]'
                                : 'border-amber-500/20 bg-amber-500/[0.06]'
                            }`}
                          >
                            <div className="flex items-start gap-2.5">
                              {isDone ? (
                                <CheckCircle2
                                  className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400"
                                  aria-hidden="true"
                                />
                              ) : (
                                <CircleDashed
                                  className="mt-0.5 h-4 w-4 shrink-0 text-amber-400"
                                  aria-hidden="true"
                                />
                              )}
                              <div>
                                <p className="text-xs font-black text-zinc-100">
                                  {requirement.label}
                                </p>
                                <p className="mt-1 text-[10px] leading-4 text-zinc-500">
                                  {requirement.detail}
                                </p>
                                <span
                                  className={`mt-2 block text-[10px] font-black uppercase tracking-wider ${
                                    isDone ? 'text-emerald-400' : 'text-amber-300'
                                  }`}
                                >
                                  {isDone ? 'Complete' : 'Required'}
                                </span>
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ul>

                    <div className="relative mt-5 grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
                      <div className="space-y-2">
                        {stage === 'HIRED' ? (
                          <div className="flex items-start gap-2 rounded-xl border border-green-500/25 bg-green-500/10 px-3.5 py-3 text-xs text-green-200">
                            <UserCheck
                              className="mt-0.5 h-4 w-4 shrink-0 text-green-400"
                              aria-hidden="true"
                            />
                            <span>
                              Hire is recorded. Staff schedule, job board, communication, payroll,
                              and session tools are unlocked.
                            </span>
                          </div>
                        ) : completedCount === REQUIREMENTS.length ? (
                          <div className="flex items-start gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3.5 py-3 text-xs text-emerald-200">
                            <FileCheck2
                              className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400"
                              aria-hidden="true"
                            />
                            <span>
                              Requirements are complete. The RBT staff portal remains locked until
                              HR records the hire.
                            </span>
                          </div>
                        ) : (
                          <div className="flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/[0.07] px-3.5 py-3 text-xs text-amber-100/90">
                            <AlertTriangle
                              className="mt-0.5 h-4 w-4 shrink-0 text-amber-400"
                              aria-hidden="true"
                            />
                            <span>
                              {REQUIREMENTS.length - completedCount} required item
                              {REQUIREMENTS.length - completedCount === 1 ? '' : 's'} still
                              incomplete. Staff access is locked.
                            </span>
                          </div>
                        )}

                        <p className="pl-1 text-[10px] text-zinc-500">
                          Background review:{' '}
                          <span
                            className={
                              candidate.backgroundCleared
                                ? 'font-bold text-emerald-400'
                                : 'font-bold text-amber-300'
                            }
                          >
                            {candidate.backgroundCleared ? 'Cleared' : 'Pending'}
                          </span>
                          {candidate.helpTicketId ? ' · Open help ticket' : ''}
                        </p>
                      </div>

                      <Link
                        href={`/ats/applicant/${candidate.id}`}
                        className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-brand-orange-500/30 bg-brand-orange-500/10 px-4 py-2.5 text-xs font-black text-brand-orange-200 transition-all duration-300 hover:border-brand-orange-500/50 hover:bg-brand-orange-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange-400"
                        aria-label={`Open ATS record for ${candidate.name}`}
                      >
                        Open applicant record
                        <ArrowRight className="h-4 w-4" aria-hidden="true" />
                      </Link>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
