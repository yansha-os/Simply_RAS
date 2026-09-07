'use client';

import React, {
  useEffect,
  useState,
  Suspense,
} from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Database,
  Loader2,
  Monitor,
  RotateCcw,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { RbtEvvSimulationStudio } from '@/components/rbt/RbtEvvSimulationStudio';
import { OnboardingNextStepsPrompt } from '@/components/rbt/OnboardingNextStepsPrompt';
import {
  completionScopeForPersistResult,
  type SimulationCompletionScope,
} from '@/components/emr/rbtSimulationTraining';

const LOCAL_ATTEMPT_KEY = 'ras_rbt_simulation_local_attempt';

function SimulationContent() {
  const router = useRouter();
  const [completionScope, setCompletionScope] = useState<SimulationCompletionScope | null>(null);
  const [isHydrating, setIsHydrating] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [attemptKey, setAttemptKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const hydrateProgress = async () => {
      try {
        const { loadAtsProgress } = await import('@/lib/syncAtsProgress');
        const data = await loadAtsProgress(false);
        if (cancelled) return;

        if (data?.simulationDone) {
          setCompletionScope('PERSISTED');
          sessionStorage.removeItem(LOCAL_ATTEMPT_KEY);
        } else if (sessionStorage.getItem(LOCAL_ATTEMPT_KEY) === 'complete') {
          setCompletionScope('LOCAL_SESSION');
        }
      } catch {
        if (cancelled) return;
        if (sessionStorage.getItem(LOCAL_ATTEMPT_KEY) === 'complete') {
          setCompletionScope('LOCAL_SESSION');
        }
      } finally {
        if (!cancelled) setIsHydrating(false);
      }
    };

    void hydrateProgress();
    return () => {
      cancelled = true;
    };
  }, []);

  const persistAttempt = async (): Promise<SimulationCompletionScope> => {
    try {
      const { completeRbtSimulation } = await import('./actions');
      const res = await completeRbtSimulation();
      if (res.success) {
        sessionStorage.removeItem(LOCAL_ATTEMPT_KEY);
        const { invalidateApplicantCaches } = await import('@/lib/syncAtsProgress');
        invalidateApplicantCaches();
        window.dispatchEvent(new Event('rbt_sim_changed'));
        window.dispatchEvent(new Event('rbt_progress_synced'));
        window.dispatchEvent(new Event('rbt_clearance_changed'));
        return completionScopeForPersistResult(true);
      } else {
        console.warn('completeRbtSimulation responded with error:', res.error);
      }
    } catch (err) {
      console.warn('persistAttempt error:', err);
    }

    const scope = completionScopeForPersistResult(false);
    sessionStorage.setItem(LOCAL_ATTEMPT_KEY, 'complete');
    return scope;
  };

  const handleSimDone = async () => {
    if (isSaving) return;
    setIsSaving(true);
    const scope = await persistAttempt();
    setCompletionScope(scope);
    setIsSaving(false);

    if (scope === 'PERSISTED') {
      toast.success('Practice attempt recorded as fictional training only — not hire evidence.');
    } else {
      toast.info('Practice attempt saved for this browser tab; onboarding hire gates were not updated.');
    }
  };

  const handleRetryPersist = async () => {
    if (isSaving) return;
    setIsSaving(true);
    const scope = await persistAttempt();
    setCompletionScope(scope);
    setIsSaving(false);
    if (scope === 'PERSISTED') {
      toast.success('Fictional training attempt re-saved. This does not mark you hire-ready.');
    } else {
      toast.error('Still unable to bind this attempt to an onboarding record.');
    }
  };

  const resetPracticeWorkspace = () => {
    const hadPersistedCompletion = completionScope === 'PERSISTED';
    sessionStorage.removeItem(LOCAL_ATTEMPT_KEY);
    setCompletionScope(null);
    setAttemptKey((current) => current + 1);
    toast.info(
      hadPersistedCompletion
        ? 'Practice workspace reset. Your saved onboarding record was not changed.'
        : 'Practice workspace reset. Unsaved, tab-only progress was cleared.'
    );
  };

  if (isHydrating) {
    return (
      <div
        className="mx-auto flex max-w-2xl items-center justify-center gap-3 rounded-3xl border border-[#E2D5B7] bg-[#FFFDF8] px-8 py-16 text-slate-900 shadow-xl"
        role="status"
        aria-live="polite"
      >
        <Loader2 className="h-5 w-5 animate-spin text-[#F97316]" aria-hidden="true" />
        <span className="text-sm font-black text-slate-900">Checking saved training progress…</span>
      </div>
    );
  }

  if (completionScope) {
    const isPersisted = completionScope === 'PERSISTED';
    return (
      <main className="relative mx-auto max-w-5xl space-y-6 pb-12 text-slate-900">
        <div className="relative overflow-hidden rounded-[2rem] border border-[#E2D5B7] bg-[#FFFDF8] px-6 py-10 text-center text-slate-900 shadow-xl sm:px-10">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(249,115,22,0.08),_transparent_48%)]" />
          <div className="relative space-y-7">
            <div className={`mx-auto flex h-20 w-20 items-center justify-center rounded-3xl border shadow-md ${
              isPersisted
                ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                : 'border-amber-300 bg-amber-50 text-amber-700'
            }`}>
              {isPersisted ? (
                <Database className="h-9 w-9" aria-hidden="true" />
              ) : (
                <Monitor className="h-9 w-9" aria-hidden="true" />
              )}
            </div>

            <div className="space-y-2">
              <span className={`inline-flex rounded-full border px-3.5 py-1 font-mono text-[10px] font-black uppercase tracking-wider ${
                isPersisted
                  ? 'border-emerald-300 bg-emerald-100 text-emerald-800'
                  : 'border-amber-300 bg-amber-100 text-amber-900'
              }`}>
                {isPersisted ? 'Requirement 2 Complete · Onboarding Progress Saved' : 'Local browser-session attempt'}
              </span>
              <h1 className="font-heading text-3xl font-black tracking-tight text-slate-900">
                {isPersisted
                  ? 'Training Walkthrough Recorded'
                  : 'Practice finished, but onboarding was not updated'}
              </h1>
              <p className="mx-auto max-w-xl text-sm font-semibold leading-relaxed text-slate-600">
                {isPersisted
                  ? 'Your applicant record now shows this practice walkthrough as complete. You have successfully demonstrated understanding of EVV GPS clock-in, clinical data entry, and note submission.'
                  : 'This result exists only in this browser tab because no applicant record could be bound. It does not satisfy onboarding until the attempt is saved to your applicant record.'}
              </p>
            </div>

            <div className="mx-auto grid max-w-xl gap-3 text-left sm:grid-cols-2">
              <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-4">
                <span className="flex items-center gap-2 font-mono text-[10px] font-black uppercase text-emerald-800">
                  <ShieldCheck className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                  Training boundary
                </span>
                <p className="mt-2 text-xs font-semibold leading-relaxed text-emerald-900">
                  No client chart, EVV record, session note, authorization balance, claim, or payroll row was created.
                </p>
              </div>
              <div className="rounded-2xl border border-[#E2D5B7] bg-[#F9F5EC] p-4">
                <span className="font-mono text-[10px] font-black uppercase text-slate-700">
                  Reset behavior
                </span>
                <p className="mt-2 text-xs font-semibold leading-relaxed text-slate-600">
                  Starting another attempt clears practice inputs. Your saved onboarding record remains confirmed.
                </p>
              </div>
            </div>

            {!isPersisted && (
              <div
                className="mx-auto max-w-xl rounded-2xl border border-amber-300 bg-amber-50 p-4 text-left"
                role="status"
              >
                <p className="text-xs font-bold text-amber-900">
                  Sign in or restore your applicant device session, then retry saving this attempt.
                </p>
              </div>
            )}

            <div className="flex flex-col justify-center gap-3 pt-1 sm:flex-row">
              {!isPersisted && (
                <button
                  type="button"
                  onClick={handleRetryPersist}
                  disabled={isSaving}
                  className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-6 py-3.5 text-xs font-black text-white shadow-xl transition-all hover:scale-[1.01] hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSaving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                  Retry onboarding save
                </button>
              )}
              <button
                type="button"
                onClick={() => router.push('/rbt')}
                className="inline-flex cursor-pointer items-center justify-center rounded-2xl bg-orange-500 px-6 py-3.5 text-xs font-black text-white shadow-xl transition-all hover:scale-[1.01] hover:bg-orange-400"
              >
                Go to My Tasks
              </button>
              <button
                type="button"
                onClick={resetPracticeWorkspace}
                className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-[#E2D5B7] bg-[#F9F5EC] px-5 py-3.5 text-xs font-bold text-slate-800 transition-all hover:border-orange-400/40 hover:bg-white"
              >
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                Start another attempt
              </button>
            </div>
          </div>
        </div>

        {/* PROMPT TO COMPLETE OTHER REQUIREMENTS */}
        <OnboardingNextStepsPrompt currentTab="SIMULATION" />
      </main>
    );
  }

  return (
    <div className="relative mx-auto max-w-5xl space-y-6 pb-12 text-slate-900">
      <header className="relative overflow-hidden rounded-3xl border border-[#E2D5B7] bg-[#FFFDF8] p-5 text-slate-900 shadow-xl">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(249,115,22,0.08),_transparent_48%)]" />
        <div className="relative flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
          <div className="flex items-start gap-3.5">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-orange-400/30 bg-orange-400/10 text-[#C2410C] shadow-sm">
              <Sparkles className="h-6 w-6" aria-hidden="true" />
            </div>
            <div>
              <div className="mb-1.5 flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-orange-400/30 bg-orange-400/10 px-2.5 py-0.5 font-mono text-[10px] font-black uppercase tracking-wider text-[#C2410C]">
                  Requirement 2 · Training Lab
                </span>
                <span className="rounded-full border border-emerald-400/30 bg-emerald-100 px-2.5 py-0.5 font-mono text-[10px] font-black uppercase tracking-wider text-emerald-800">
                  Interactive EVV Simulation
                </span>
              </div>
              <h1 className="font-heading text-xl font-black tracking-tight text-slate-900 sm:text-2xl">
                RBT EVV &amp; Session Workflow Training Lab
              </h1>
              <p className="mt-1 max-w-2xl text-xs font-semibold leading-relaxed text-slate-600">
                Learn the 5 core steps of daily direct ABA therapy: EVV GPS Clock-In, Live Data Tracking, Note Narrative, Caregiver e-Signatures, and BCBA Note Submission.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={resetPracticeWorkspace}
              className="inline-flex cursor-pointer items-center gap-2 rounded-2xl border border-[#E2D5B7] bg-[#F9F5EC] px-4 py-2.5 text-xs font-black text-slate-800 transition-all hover:border-orange-400/40 hover:bg-white"
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              Reset attempt
            </button>
          </div>
        </div>
      </header>

      {/* INTERACTIVE 5-STEP EVV SIMULATOR */}
      <RbtEvvSimulationStudio
        key={`sim-studio-${attemptKey}`}
        onComplete={handleSimDone}
        isSaving={isSaving}
      />
    </div>
  );
}

export default function RbtSimulationPage() {
  return (
    <Suspense
      fallback={
        <div
          className="p-8 text-center font-black text-slate-500 animate-pulse"
          role="status"
          aria-live="polite"
        >
          Loading RBT training lab…
        </div>
      }
    >
      <SimulationContent />
    </Suspense>
  );
}
