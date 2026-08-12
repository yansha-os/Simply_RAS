'use client';

import React, {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  Suspense,
} from 'react';
import { useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import { RbtScheduleView } from '@/components/rbt/RbtScheduleView';
import { RbtDataCollectionEngine } from '@/components/emr/RbtDataCollectionEngine';
import { ScribeGuideMeEngine } from '@/components/emr/ScribeGuideMeEngine';
import {
  completionScopeForPersistResult,
  type SimulationCompletionScope,
} from '@/components/emr/rbtSimulationTraining';
import { Button } from '@/components/ui/Button';
import { toast } from 'sonner';
import {
  ArrowRight,
  CheckCircle2,
  Database,
  Loader2,
  Monitor,
  RotateCcw,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';

const LOCAL_ATTEMPT_KEY = 'ras_rbt_simulation_local_attempt';
const subscribeToClient = () => () => {};

function SimulationContent() {
  const router = useRouter();
  const [activeView, setActiveView] = useState<'SCHEDULE_PRACTICE' | 'EMR_PRACTICE'>('SCHEDULE_PRACTICE');
  const [isGuideStarted, setIsGuideStarted] = useState(false);
  const [completionScope, setCompletionScope] = useState<SimulationCompletionScope | null>(null);
  const [showTutorialPromptModal, setShowTutorialPromptModal] = useState(false);
  const mounted = useSyncExternalStore(
    subscribeToClient,
    () => true,
    () => false
  );
  const [isHydrating, setIsHydrating] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [attemptKey, setAttemptKey] = useState(0);
  const tutorialStartRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let cancelled = false;

    const hydrateProgress = async () => {
      try {
        const { loadAtsProgress } = await import('@/lib/syncAtsProgress');
        const data = await loadAtsProgress();
        if (cancelled) return;

        if (data?.simulationDone) {
          setCompletionScope('PERSISTED');
          sessionStorage.removeItem(LOCAL_ATTEMPT_KEY);
        } else if (sessionStorage.getItem(LOCAL_ATTEMPT_KEY) === 'complete') {
          setCompletionScope('LOCAL_SESSION');
        } else {
          setShowTutorialPromptModal(true);
        }
      } catch {
        if (cancelled) return;
        if (sessionStorage.getItem(LOCAL_ATTEMPT_KEY) === 'complete') {
          setCompletionScope('LOCAL_SESSION');
        } else {
          setShowTutorialPromptModal(true);
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

  useEffect(() => {
    if (!showTutorialPromptModal) return;
    tutorialStartRef.current?.focus();

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowTutorialPromptModal(false);
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [showTutorialPromptModal]);

  const persistAttempt = async (): Promise<SimulationCompletionScope> => {
    // There is no durable assessment-attempt record yet, so practice cannot
    // satisfy the evidence-derived onboarding requirement.
    const scope = completionScopeForPersistResult(false);
    sessionStorage.setItem(LOCAL_ATTEMPT_KEY, 'complete');
    return scope;
  };

  const handleSimDone = async () => {
    if (isSaving) return;
    setIsSaving(true);
    const scope = await persistAttempt();
    setCompletionScope(scope);
    setIsGuideStarted(false);
    setIsSaving(false);

    if (scope === 'PERSISTED') {
      toast.success('Training walkthrough saved to your onboarding record.');
    } else {
      toast.info('Practice attempt saved only for this browser tab; onboarding was not updated.');
    }
  };

  const handleRetryPersist = async () => {
    if (isSaving) return;
    setIsSaving(true);
    const scope = await persistAttempt();
    setCompletionScope(scope);
    setIsSaving(false);
    if (scope === 'PERSISTED') {
      toast.success('Onboarding progress is now saved.');
    } else {
      toast.error('Still unable to bind this attempt to an onboarding record.');
    }
  };

  const resetPracticeWorkspace = () => {
    const hadPersistedCompletion = completionScope === 'PERSISTED';
    sessionStorage.removeItem(LOCAL_ATTEMPT_KEY);
    setCompletionScope(null);
    setActiveView('SCHEDULE_PRACTICE');
    setIsGuideStarted(false);
    setShowTutorialPromptModal(false);
    setAttemptKey((current) => current + 1);
    toast.info(
      hadPersistedCompletion
        ? 'Practice workspace reset. Your saved onboarding record was not changed.'
        : 'Practice workspace reset. Unsaved, tab-only progress was cleared.'
    );
  };

  const handleStartTutorial = () => {
    setShowTutorialPromptModal(false);
    setActiveView('SCHEDULE_PRACTICE');
    setIsGuideStarted(true);
    toast.info('Guided practice started. Highlighted actions use fictional training data.');
  };

  if (isHydrating) {
    return (
      <div
        className="mx-auto flex max-w-2xl items-center justify-center gap-3 rounded-3xl border border-white/10 bg-slate-950/95 px-8 py-16 text-slate-200 shadow-2xl"
        role="status"
        aria-live="polite"
      >
        <Loader2 className="h-5 w-5 animate-spin text-orange-400" aria-hidden="true" />
        <span className="text-sm font-black">Checking saved training progress…</span>
      </div>
    );
  }

  if (completionScope) {
    const isPersisted = completionScope === 'PERSISTED';
    return (
      <div className="relative mx-auto max-w-3xl overflow-hidden rounded-[2rem] border border-white/10 bg-slate-950/95 px-6 py-10 text-center text-white shadow-2xl sm:px-10">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(249,115,22,0.18),_transparent_48%)]" />
        <div className="relative space-y-7">
          <div className={`mx-auto flex h-20 w-20 items-center justify-center rounded-3xl border shadow-2xl ${
            isPersisted
              ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300'
              : 'border-amber-400/30 bg-amber-400/10 text-amber-300'
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
                ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300'
                : 'border-amber-400/30 bg-amber-400/10 text-amber-300'
            }`}>
              {isPersisted ? 'Onboarding progress saved' : 'Local browser-session attempt'}
            </span>
            <h1 className="font-heading text-3xl font-black tracking-tight text-white">
              {isPersisted
                ? 'Training walkthrough recorded'
                : 'Practice finished, but onboarding was not updated'}
            </h1>
            <p className="mx-auto max-w-xl text-sm font-semibold leading-relaxed text-slate-300">
              {isPersisted
                ? 'Your applicant record now shows this practice walkthrough as complete. This records participation only; it is not a clinical competency score or an accuracy certification.'
                : 'This result exists only in this browser tab because no applicant record could be bound. It does not satisfy onboarding until the attempt is saved to your applicant record.'}
            </p>
          </div>

          <div className="mx-auto grid max-w-xl gap-3 text-left sm:grid-cols-2">
            <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/5 p-4">
              <span className="flex items-center gap-2 font-mono text-[10px] font-black uppercase text-emerald-300">
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                Training boundary
              </span>
              <p className="mt-2 text-xs font-semibold leading-relaxed text-slate-300">
                No client chart, EVV record, session note, authorization balance, claim, or payroll row was created.
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <span className="font-mono text-[10px] font-black uppercase text-slate-300">
                Reset behavior
              </span>
              <p className="mt-2 text-xs font-semibold leading-relaxed text-slate-300">
                Starting another attempt clears practice inputs. A saved onboarding record remains unchanged.
              </p>
            </div>
          </div>

          {!isPersisted && (
            <div
              className="mx-auto max-w-xl rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 text-left"
              role="status"
            >
              <p className="text-xs font-bold text-amber-100">
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
                className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-6 py-3.5 text-xs font-black text-slate-950 shadow-xl transition-all hover:scale-[1.01] hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
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
              className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-5 py-3.5 text-xs font-bold text-slate-200 transition-all hover:border-orange-400/40 hover:bg-white/10"
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              Start another attempt
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative mx-auto max-w-5xl space-y-6 pb-12 text-slate-900">
      <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-slate-950/95 p-5 text-white shadow-2xl">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(249,115,22,0.2),_transparent_48%)]" />
        <div className="relative flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-orange-400/30 bg-orange-400/10 text-orange-300 shadow-lg">
              <Sparkles className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-orange-400/30 bg-orange-400/10 px-2.5 py-1 font-mono text-[10px] font-black uppercase tracking-wider text-orange-300">
                  Simulation · fictional records
                </span>
                <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-1 font-mono text-[10px] font-black uppercase tracking-wider text-emerald-300">
                  No clinical or billing writes
                </span>
              </div>
              <h1 className="font-heading text-xl font-black tracking-tight text-white">
                RBT Session Workflow Training Lab
              </h1>
              <p className="mt-1 max-w-2xl text-xs font-semibold leading-relaxed text-slate-300">
                Practice schedule navigation and five data-entry procedures with sample people and sample values. Only the onboarding completion flag is saved—and only after all training checks are met.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              onClick={handleStartTutorial}
              variant="outline"
              className="cursor-pointer rounded-2xl border border-orange-400/40 bg-orange-400/10 px-4 py-2.5 text-xs font-black text-orange-200 shadow-lg hover:bg-orange-400/20"
            >
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              Guided practice
            </Button>
            <button
              type="button"
              onClick={resetPracticeWorkspace}
              className="inline-flex cursor-pointer items-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-4 py-2.5 text-xs font-black text-slate-200 transition-all hover:border-orange-400/40 hover:bg-white/10"
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              Reset attempt
            </button>
            <span
              className={`rounded-full border px-3 py-1.5 font-mono text-[10px] font-black uppercase tracking-wide ${
                isGuideStarted
                  ? 'border-sky-400/30 bg-sky-400/10 text-sky-300'
                  : 'border-white/10 bg-white/5 text-slate-300'
              }`}
              role="status"
              aria-live="polite"
            >
              {isGuideStarted ? 'Guide active' : 'Practice mode'}
            </span>
          </div>
        </div>
      </section>

      {activeView === 'SCHEDULE_PRACTICE' ? (
        <RbtScheduleView
          key={`schedule-${attemptKey}`}
          mode="SIMULATION"
          onStartEvvClick={() => setActiveView('EMR_PRACTICE')}
        />
      ) : (
        <RbtDataCollectionEngine
          key={`collector-${attemptKey}`}
          mode="SIMULATION"
          onSimulationComplete={handleSimDone}
        />
      )}

      <ScribeGuideMeEngine
        key={`guide-${attemptKey}`}
        isActive={isGuideStarted}
        onClose={() => setIsGuideStarted(false)}
        onGuideComplete={() => {
          setIsGuideStarted(false);
          toast.info('Guide finished. Complete all training checks and submit the practice note to save progress.');
        }}
      />

      {mounted && showTutorialPromptModal && createPortal(
        <div className="fixed inset-0 z-[999999] flex items-center justify-center bg-black/85 p-4 backdrop-blur-md">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="simulation-welcome-title"
            aria-describedby="simulation-welcome-description"
            className="relative z-[1000000] w-full max-w-lg space-y-6 rounded-3xl border border-orange-400/40 bg-slate-950 p-8 text-center text-white shadow-[0_20px_80px_rgba(249,115,22,0.35)]"
          >
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl border border-orange-300/30 bg-orange-500 text-white shadow-xl">
              <Sparkles className="h-8 w-8 text-yellow-100" aria-hidden="true" />
            </div>

            <div className="space-y-2">
              <span className="inline-flex rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 font-mono text-[10px] font-black uppercase tracking-wider text-emerald-300">
                Training only · no live writes
              </span>
              <h2
                id="simulation-welcome-title"
                className="font-heading text-2xl font-black tracking-tight text-white"
              >
                Welcome to the RBT workflow training lab
              </h2>
              <p
                id="simulation-welcome-description"
                className="text-xs font-semibold leading-relaxed text-slate-300"
              >
                Every person, session, signature, unit count, and claim reference on this page is fictional. Practice actions never contact staff or write to clinical, billing, EVV, or payroll records.
              </p>
            </div>

            <div className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-left text-xs text-slate-300">
              <p className="flex items-center gap-1.5 font-bold text-orange-300">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" aria-hidden="true" />
                What this attempt asks you to practice
              </p>
              <ul className="space-y-1.5 text-[11px] font-medium text-slate-300">
                <li>• Navigate the fictional active, incomplete, schedule, and completed views.</li>
                <li>• Record one new DTT trial and one task-analysis response.</li>
                <li>• Use frequency/latency, interval, and ABC practice controls.</li>
                <li>• Type a practice acknowledgment and finish the training note.</li>
              </ul>
              <p className="border-t border-white/10 pt-3 text-[11px] font-bold text-slate-400">
                Successful save updates only the ATS onboarding completion flag. Without an applicant session, the result is labeled local to this browser tab.
              </p>
            </div>

            <div className="flex flex-col gap-3 pt-2 sm:flex-row">
              <button
                type="button"
                onClick={() => setShowTutorialPromptModal(false)}
                className="w-full cursor-pointer rounded-2xl border border-white/15 bg-white/5 px-4 py-3.5 text-xs font-bold text-slate-300 transition-all hover:border-white/30 hover:bg-white/10 hover:text-white sm:w-1/3"
              >
                Explore independently
              </button>
              <Button
                ref={tutorialStartRef}
                type="button"
                onClick={handleStartTutorial}
                className="w-full cursor-pointer rounded-2xl bg-orange-500 py-4 text-sm font-black text-white shadow-xl hover:bg-orange-400 sm:w-2/3"
              >
                <span>Begin guided practice</span>
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

export default function RbtSimulationPage() {
  return (
    <Suspense fallback={
      <div
        className="p-8 text-center font-black text-slate-500 animate-pulse"
        role="status"
        aria-live="polite"
      >
        Loading RBT training lab…
      </div>
    }>
      <SimulationContent />
    </Suspense>
  );
}
