'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from 'react';
import { useRouter } from 'next/navigation';
import {
  Clock,
  MapPin,
  CheckCircle2,
  AlertTriangle,
  Play,
  ShieldCheck,
  PenTool,
  X,
  Flame,
  Plus,
  ChevronRight,
  Sparkles,
  FileText,
  Activity,
  ArrowLeft,
  ClipboardList,
  Timer,
  Hash,
  ListOrdered,
  Crosshair,
  ExternalLink,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  clockInHrmSession,
  clockOutHrmSession,
  getActingRbtForStudio,
  getSessionStudioTargets,
  submitHrmSessionEmrNote,
} from '@/app/actions/sessionEmrActions';
import {
  ABA_INTERVENTION_OPTIONS,
  DEFAULT_TA_STEPS,
  DEMO_BEHAVIOR_TARGETS,
  DEMO_TARGETS,
  billableUnitsFromSeconds,
  buildChecklistSnapshot,
  buildNoteNarrativeDraft,
  elapsedSecondsFromDurableAnchors,
  formatClockTime,
  goalsFromTrials,
  hasObjectiveDatum,
  isDemoStudioTargetId,
  isSessionStudioDevHelpersEnabled,
  narrativeQualityHint,
  summarizeModalities,
  taPercentIndependent,
  type DemoBehaviorTarget,
  type DemoTarget,
  type SessionPhase,
  type SessionStudioClient,
  type StudioAbc,
  type StudioDurationEpisode,
  type StudioFrequency,
  type StudioProbe,
  type StudioTaStep,
  type StudioTaskAnalysis,
  type StudioTrial,
} from '@/lib/sessionStudio';
import { evaluateClaimReady } from '@/lib/sessionStudioClaimReady';
import { SessionClaimReadyPanel } from '@/components/emr/SessionClaimReadyPanel';
import { upsertRbtPayHold, clearRbtPayHold } from '@/lib/rbtPayHolds';
import {
  clearSessionStudioAll,
  attemptDurableSessionClockIn,
  attemptDurableSessionClockOut,
  attemptSessionStudioSubmit,
  buildDocumentationSubmittedRecord,
  DOCUMENTATION_SUBMITTED_MESSAGE,
  loadSessionStudioDraft,
  markScheduleSessionDone,
  pushCompletedStudioSession,
  saveSessionStudioDraft,
  saveSessionStudioMeta,
} from '@/lib/sessionStudioDraft';

const DEV_STUDIO_HELPERS = isSessionStudioDevHelpersEnabled();
/** Prefer durable DB targets — never seed demo SkillTargets on mount. */
const INITIAL_TARGETS: DemoTarget[] = [];
const INITIAL_BEHAVIOR_TARGETS: DemoBehaviorTarget[] = [];
const OBSERVATION_MAPPING_NEEDED_MESSAGE =
  'Observation saved — BCBA mapping needed.';

type Props = {
  sessionId: string;
  client: SessionStudioClient;
};

const subscribeToHydration = () => () => undefined;
const getClientHydrationSnapshot = () => true;
const getServerHydrationSnapshot = () => false;

const PHASES: { id: SessionPhase; label: string; short: string }[] = [
  { id: 'CLOCK_IN', label: '1. Clock in', short: 'EVV' },
  { id: 'COLLECT', label: '2. Collect', short: 'Data' },
  { id: 'NOTE', label: '3. Note', short: 'Note' },
  { id: 'SIGN', label: '4. Sign', short: 'Sign' },
];

function formatSeconds(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function hasCoherentDurableCompletion(result: {
  startedAt?: string | null;
  endedAt?: string | null;
  durationSeconds?: number;
  billableUnits?: number;
}) {
  if (
    typeof result.startedAt !== 'string' ||
    typeof result.endedAt !== 'string' ||
    typeof result.durationSeconds !== 'number' ||
    typeof result.billableUnits !== 'number'
  ) {
    return false;
  }
  const durationSeconds = elapsedSecondsFromDurableAnchors({
    startedAt: result.startedAt,
    endedAt: result.endedAt,
  });
  return (
    durationSeconds > 0 &&
    durationSeconds === result.durationSeconds &&
    billableUnitsFromSeconds(durationSeconds) === result.billableUnits
  );
}

export function RbtSessionStudio(props: Props) {
  const hydrated = useSyncExternalStore(
    subscribeToHydration,
    getClientHydrationSnapshot,
    getServerHydrationSnapshot
  );

  if (!hydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center font-black text-slate-400 animate-pulse">
        Restoring session…
      </div>
    );
  }

  return <HydratedRbtSessionStudio key={props.sessionId} {...props} />;
}

function HydratedRbtSessionStudio({ sessionId, client }: Props) {
  const router = useRouter();
  const [initialDraft] = useState(() => loadSessionStudioDraft(sessionId));
  const initialTaSteps = initialDraft?.taskAnalyses?.[0]?.steps;
  const [showResumeBanner, setShowResumeBanner] = useState(Boolean(initialDraft));
  const [dbClientId, setDbClientId] = useState<string | undefined>(client.id);
  // Gap 10 — explicit RBT identity, resolved server-side and echoed back on submit
  const [actingRbtId, setActingRbtId] = useState<string | null>(null);
  const [actingRbtLoaded, setActingRbtLoaded] = useState(false);
  const [expectedNoteUpdatedAt, setExpectedNoteUpdatedAt] = useState<string | null>(null);
  const [targets, setTargets] = useState<DemoTarget[]>(INITIAL_TARGETS);
  const [behaviorTargets, setBehaviorTargets] =
    useState<DemoBehaviorTarget[]>(INITIAL_BEHAVIOR_TARGETS);
  const [targetsLoading, setTargetsLoading] = useState(true);
  const [crmGoalsUrl, setCrmGoalsUrl] = useState<string | null>(null);
  const [hasTpGoals, setHasTpGoals] = useState(false);

  const [phase, setPhase] = useState<SessionPhase>(initialDraft?.phase ?? 'CLOCK_IN');
  // Draft time fields are recovery hints only. Durable Session/EVV anchors
  // loaded below are required before collection is unlocked.
  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(false);
  const [clockedIn, setClockedIn] = useState(false);
  const [clockedOut, setClockedOut] = useState(false);
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [endedAt, setEndedAt] = useState<string | null>(null);

  // Persisted Session facts are loaded server-side. Draft/client defaults are
  // deliberately not treated as CPT/POS authority.
  const [placeOfService, setPlaceOfService] = useState('');
  const [cptCode, setCptCode] = useState('');
  const [billingFactsReady, setBillingFactsReady] = useState(false);
  const [billingFactsError, setBillingFactsError] = useState<string | null>(null);
  const [caregiverPresent, setCaregiverPresent] = useState<'YES' | 'NO' | ''>(
    initialDraft?.caregiverPresent ?? ''
  );
  const [caregiverName, setCaregiverName] = useState(initialDraft?.caregiverName ?? '');

  const [activeTargetId, setActiveTargetId] = useState(
    initialDraft?.activeTargetId || INITIAL_TARGETS[0]?.id || ''
  );
  const [activeBehaviorTargetId, setActiveBehaviorTargetId] = useState(
    initialDraft?.activeBehaviorTargetId || INITIAL_BEHAVIOR_TARGETS[0]?.id || ''
  );
  const [trials, setTrials] = useState<StudioTrial[]>(initialDraft?.trials ?? []);
  const [abcEvents, setAbcEvents] = useState<StudioAbc[]>(initialDraft?.abcEvents ?? []);
  const [frequencies, setFrequencies] = useState<StudioFrequency[]>(
    initialDraft?.frequencies ?? []
  );
  const [durations, setDurations] = useState<StudioDurationEpisode[]>(
    initialDraft?.durations ?? []
  );
  const [taSteps, setTaSteps] = useState<StudioTaStep[]>(
    initialTaSteps?.length ? initialTaSteps : DEFAULT_TA_STEPS
  );
  const [probes, setProbes] = useState<StudioProbe[]>(initialDraft?.probes ?? []);
  const [abcDraft, setAbcDraft] = useState({
    antecedent: '',
    behavior: '',
    consequence: '',
    durationSeconds: '',
    intensity: 'MODERATE' as 'MILD' | 'MODERATE' | 'SEVERE',
  });
  const [durationDraftSeconds, setDurationDraftSeconds] = useState('30');
  const [durationIntensity, setDurationIntensity] = useState<'MILD' | 'MODERATE' | 'SEVERE'>(
    'MODERATE'
  );
  const [adhocBehaviorName, setAdhocBehaviorName] = useState('');
  const [collectTab, setCollectTab] = useState<
    'DTT' | 'FREQUENCY' | 'DURATION' | 'TA' | 'PROBE' | 'ABC'
  >('DTT');

  // ABA 97153 note fields (not generic SOAP)
  const [objectiveData, setObjectiveData] = useState(
    initialDraft?.objectiveData || initialDraft?.progressText || ''
  );
  const [goalsAddressed, setGoalsAddressed] = useState(
    initialDraft?.goalsAddressed || (initialDraft ? goalsFromTrials(initialDraft.trials) : '')
  );
  const [interventions, setInterventions] = useState<string[]>(
    initialDraft?.interventions?.length
      ? initialDraft.interventions
      : ['dtt', 'dr', 'prompt']
  );
  const [clientResponse, setClientResponse] = useState(
    initialDraft?.clientResponse || initialDraft?.subjective || initialDraft?.assessment || ''
  );
  const [barriersSafety, setBarriersSafety] = useState(
    initialDraft ? initialDraft.barriersSafety || 'None noted' : ''
  );
  const [caregiverParticipation, setCaregiverParticipation] = useState(
    initialDraft?.caregiverParticipation || ''
  );
  const [planNext, setPlanNext] = useState(
    initialDraft?.planNext || initialDraft?.plan || ''
  );
  const [rbtSignature, setRbtSignature] = useState(initialDraft?.rbtSignature ?? '');
  const [caregiverSignature, setCaregiverSignature] = useState(
    initialDraft?.caregiverSignature ?? ''
  );
  const [pending, startTransition] = useTransition();
  const [clockInPending, setClockInPending] = useState(false);
  const [clockOutPending, setClockOutPending] = useState(false);
  const saveTimer = useRef<number | null>(null);

  const draftSnapshot = useCallback(
    () => ({
      phase,
      seconds,
      running,
      clockedIn,
      clockedOut,
      placeOfService,
      cptCode,
      caregiverPresent,
      caregiverName,
      activeTargetId,
      activeBehaviorTargetId,
      trials,
      abcEvents,
      frequencies,
      durations,
      taskAnalyses: [
        {
          id: 'ta-current',
          targetLabel: 'Handwashing chain',
          chainType: 'TOTAL_TASK' as const,
          steps: taSteps,
          at: new Date().toISOString(),
        },
      ] satisfies StudioTaskAnalysis[],
      probes,
      startedAt,
      endedAt,
      objectiveData,
      goalsAddressed,
      interventions,
      clientResponse,
      barriersSafety,
      caregiverParticipation,
      planNext,
      rbtSignature,
      caregiverSignature,
    }),
    [
      abcEvents,
      activeBehaviorTargetId,
      activeTargetId,
      barriersSafety,
      caregiverName,
      caregiverParticipation,
      caregiverPresent,
      caregiverSignature,
      clockedIn,
      clockedOut,
      clientResponse,
      cptCode,
      durations,
      endedAt,
      frequencies,
      goalsAddressed,
      interventions,
      objectiveData,
      phase,
      placeOfService,
      planNext,
      probes,
      rbtSignature,
      running,
      seconds,
      startedAt,
      taSteps,
      trials,
    ]
  );

  useEffect(() => {
    saveSessionStudioMeta(sessionId, client);
  }, [sessionId, client]);

  useEffect(() => {
    let cancelled = false;
    void getActingRbtForStudio().then((res) => {
      if (cancelled) return;
      setActingRbtId(res.success ? res.rbtUserId : null);
      setActingRbtLoaded(true);
      if (!res.success) {
        toast.error(
          res.error || 'Could not resolve your RBT identity — documentation submit is blocked.'
        );
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void getSessionStudioTargets({
      sessionId,
      clientName: client.name,
      clientId: client.id,
      autoSync: true,
    }).then((res) => {
      if (cancelled) return;
      if (res.success) {
        setCptCode(res.cptCode);
        setPlaceOfService(res.placeOfService);
        setBillingFactsReady(true);
        setBillingFactsError(null);
        if ('clientId' in res && res.clientId) setDbClientId(res.clientId);
        if ('expectedNoteUpdatedAt' in res) {
          setExpectedNoteUpdatedAt(res.expectedNoteUpdatedAt ?? null);
        }
        const durableStart = res.actualStart;
        const durableEnd = res.actualEnd;
        if (
          res.sessionStatus === 'COMPLETED' &&
          durableStart &&
          durableEnd &&
          res.evvClockedOut
        ) {
          setStartedAt(durableStart);
          setEndedAt(durableEnd);
          setSeconds(
            elapsedSecondsFromDurableAnchors({
              startedAt: durableStart,
              endedAt: durableEnd,
            })
          );
          setClockedIn(true);
          setClockedOut(true);
          setRunning(false);
          setPhase((current) =>
            current === 'CLOCK_IN' || current === 'COLLECT' ? 'NOTE' : current
          );
        } else if (res.sessionStatus === 'IN_PROGRESS' && durableStart) {
          setStartedAt(durableStart);
          setEndedAt(null);
          setSeconds(elapsedSecondsFromDurableAnchors({ startedAt: durableStart }));
          setClockedIn(true);
          setClockedOut(false);
          setRunning(true);
          setPhase((current) => (current === 'CLOCK_IN' ? 'COLLECT' : current));
        } else {
          // Never unlock collection from sessionStorage alone. A completed
          // Session without matching EVV closure is surfaced as a recovery
          // conflict by the server on submit/clock-out.
          setStartedAt(durableStart);
          setEndedAt(durableEnd);
          setSeconds(
            elapsedSecondsFromDurableAnchors({
              startedAt: durableStart,
              endedAt: durableEnd,
            })
          );
          setClockedIn(false);
          setClockedOut(false);
          setRunning(false);
          if (res.sessionStatus === 'SCHEDULED') setPhase('CLOCK_IN');
          if (res.sessionStatus === 'COMPLETED') {
            toast.error(
              'This Session has no matching durable EVV clock-out. Keep the draft and contact Operations.'
            );
          }
        }
        if ('crmGoalsUrl' in res && res.crmGoalsUrl) setCrmGoalsUrl(res.crmGoalsUrl);
        if ('hasTreatmentPlanGoals' in res) setHasTpGoals(Boolean(res.hasTreatmentPlanGoals));

        if (res.targets.length > 0) {
          setTargets(res.targets);
          setActiveTargetId((prev) =>
            res.targets.some((t) => t.id === prev) ? prev : res.targets[0].id
          );
          if ('autoSynced' in res && res.autoSynced) {
            toast.success(
              `Synced ${(res as { skillsCreated?: number }).skillsCreated ?? 0} skill target(s) from treatment plan`
            );
          }
        } else {
          setTargets([]);
          setActiveTargetId('');
        }

        if (res.behaviorTargets?.length) {
          setBehaviorTargets(
            res.behaviorTargets.map((b) => ({
              id: b.id,
              label: b.label,
              measurementType: (b.measurementType === 'DURATION' ? 'DURATION' : 'FREQUENCY') as
                | 'FREQUENCY'
                | 'DURATION',
            }))
          );
          setActiveBehaviorTargetId((prev) =>
            res.behaviorTargets!.some((b) => b.id === prev)
              ? prev
              : res.behaviorTargets![0].id
          );
        } else {
          setBehaviorTargets([]);
          setActiveBehaviorTargetId('');
        }
      } else {
        setBillingFactsReady(false);
        setBillingFactsError(res.error);
        toast.error(res.error || 'The authorized Session facts could not be loaded.');
      }
      setTargetsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [sessionId, client.name, client.id]);

  const syncDisplayElapsed = useCallback(() => {
    setSeconds(
      elapsedSecondsFromDurableAnchors({
        startedAt,
        endedAt,
      })
    );
  }, [endedAt, startedAt]);

  useEffect(() => {
    if (!clockedIn || clockedOut || !startedAt) return;

    const id = window.setInterval(syncDisplayElapsed, 1000);
    const refreshFromAnchors = () => syncDisplayElapsed();
    document.addEventListener('visibilitychange', refreshFromAnchors);
    window.addEventListener('focus', refreshFromAnchors);
    window.addEventListener('pageshow', refreshFromAnchors);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', refreshFromAnchors);
      window.removeEventListener('focus', refreshFromAnchors);
      window.removeEventListener('pageshow', refreshFromAnchors);
    };
  }, [clockedIn, clockedOut, startedAt, syncDisplayElapsed]);

  useEffect(() => {
    if (clockedOut) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      saveSessionStudioDraft(sessionId, draftSnapshot());
    }, 400);
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, [clockedOut, draftSnapshot, sessionId]);

  useEffect(() => {
    const flush = () => {
      if (clockedOut) return;
      saveSessionStudioDraft(sessionId, { ...draftSnapshot(), running: false });
    };
    window.addEventListener('beforeunload', flush);
    return () => window.removeEventListener('beforeunload', flush);
  }, [clockedOut, draftSnapshot, sessionId]);

  const usingDemoTargets =
    targets.length > 0 && targets.every((t) => isDemoStudioTargetId(t.id));

  const claimEvalInput = {
    clockedIn,
    clockedOut,
    cptCode,
    placeOfService,
    caregiverPresent,
    caregiverName,
    caregiverParticipation,
    goalsAddressed,
    usesDemoTargetsOnly: usingDemoTargets,
    trials,
    frequencies,
    durations,
    taskAnalyses: [
      {
        id: 'ta-current',
        targetLabel: 'Handwashing chain',
        chainType: 'TOTAL_TASK' as const,
        steps: taSteps,
        at: new Date().toISOString(),
      },
    ],
    probes,
    objectiveData,
    interventions,
    clientResponse,
    barriersSafety,
    planNext,
    rbtSignature,
    caregiverSignature,
    sessionSeconds: seconds,
  };

  const claimEval = evaluateClaimReady(claimEvalInput);

  const checklist = claimEval.checklist;
  const readyCount = claimEval.readyCount;
  const claimReadySignEval = evaluateClaimReady({ ...claimEvalInput, clockedOut: true });
  const claimReadyPreview = claimReadySignEval.claimReady;

  const units = billableUnitsFromSeconds(seconds);
  const activeTarget = targets.find((t) => t.id === activeTargetId) || targets[0];

  const loadDemoTargets = () => {
    if (!DEV_STUDIO_HELPERS) return;
    setTargets(DEMO_TARGETS);
    setActiveTargetId(DEMO_TARGETS[0]?.id || '');
    setBehaviorTargets(DEMO_BEHAVIOR_TARGETS);
    setActiveBehaviorTargetId(DEMO_BEHAVIOR_TARGETS[0]?.id || '');
    toast.message(
      'Dev demo targets loaded — documentation submit is blocked until CRM SkillTargets are synced.'
    );
  };

  const clearDemoTargets = () => {
    setTargets([]);
    setActiveTargetId('');
    setBehaviorTargets([]);
    setActiveBehaviorTargetId('');
    toast.message('Demo targets cleared — reload CRM SkillTargets before submission.');
  };

  const reloadTargets = () => {
    setTargetsLoading(true);
    void getSessionStudioTargets({
      sessionId,
      clientName: client.name,
      clientId: dbClientId || client.id,
      autoSync: true,
    }).then((res) => {
      if (res.success) {
        setCptCode(res.cptCode);
        setPlaceOfService(res.placeOfService);
        setBillingFactsReady(true);
        setBillingFactsError(null);
        if ('clientId' in res && res.clientId) setDbClientId(res.clientId);
        if ('expectedNoteUpdatedAt' in res) {
          setExpectedNoteUpdatedAt(res.expectedNoteUpdatedAt ?? null);
        }
        if ('crmGoalsUrl' in res && res.crmGoalsUrl) setCrmGoalsUrl(res.crmGoalsUrl);
        if ('hasTreatmentPlanGoals' in res) setHasTpGoals(Boolean(res.hasTreatmentPlanGoals));
        setTargets(res.targets);
        setActiveTargetId(res.targets[0]?.id || '');
        if (res.behaviorTargets?.length) {
          setBehaviorTargets(
            res.behaviorTargets.map((b) => ({
              id: b.id,
              label: b.label,
              measurementType: (b.measurementType === 'DURATION' ? 'DURATION' : 'FREQUENCY') as
                | 'FREQUENCY'
                | 'DURATION',
            }))
          );
          setActiveBehaviorTargetId(res.behaviorTargets[0]?.id || '');
        } else {
          setBehaviorTargets([]);
          setActiveBehaviorTargetId('');
        }
        if (res.targets.length) toast.success(`${res.targets.length} SkillTarget(s) loaded`);
        else toast.message('Still no SkillTargets — sync from CRM Clinical Goals.');
      } else {
        setBillingFactsReady(false);
        setBillingFactsError(res.error);
        toast.error(res.error || 'The authorized Session facts could not be loaded.');
      }
      setTargetsLoading(false);
    });
  };

  const accuracy = useMemo(() => {
    if (!trials.length) return 0;
    const ok = trials.filter((t) => t.response === 'CORRECT').length;
    return Math.round((ok / trials.length) * 100);
  }, [trials]);

  const exitToSchedule = (clearDraft: boolean) => {
    if (clearDraft) clearSessionStudioAll(sessionId);
    else {
      saveSessionStudioDraft(sessionId, { ...draftSnapshot(), running: false });
      saveSessionStudioMeta(sessionId, client);
    }
    router.push('/rbt/schedule');
  };

  const startEvv = async () => {
    if (clockInPending) return;
    if (!billingFactsReady || !placeOfService || !cptCode) {
      toast.error(
        billingFactsError ||
          'The authorized Session CPT and place of service must load before clock-in.'
      );
      return;
    }
    if (!caregiverPresent) {
      toast.error('Set caregiver presence before clock-in.');
      return;
    }
    if (caregiverPresent === 'YES' && caregiverName.trim().length < 2) {
      toast.error('Enter caregiver name when present.');
      return;
    }
    const requestedStart = new Date().toISOString();
    setClockInPending(true);
    const outcome = await attemptDurableSessionClockIn({
      requestedStart,
      clockIn: () =>
        clockInHrmSession({
          sessionId,
          placeOfService,
          cptCode,
        }),
      commitDurableStart: (authoritativeStart) => {
        setStartedAt(authoritativeStart);
        setEndedAt(null);
        setSeconds(
          elapsedSecondsFromDurableAnchors({ startedAt: authoritativeStart })
        );
        setClockedIn(true);
        setClockedOut(false);
        setRunning(true);
        setPhase('COLLECT');
      },
    });
    setClockInPending(false);

    if (outcome.status === 'STARTED') {
      toast.success('EVV clock-in persisted — teach and tap trials.');
      return;
    }
    if (outcome.status === 'REJECTED') {
      toast.error(
        outcome.result.error || 'Clock-in was rejected. Collection remains locked; retry.'
      );
      return;
    }
    toast.error('Clock-in could not be confirmed. Collection remains locked; retry.');
  };

  const activeBehaviorTarget =
    behaviorTargets.find((b) => b.id === activeBehaviorTargetId) || behaviorTargets[0];
  const resolvedBehaviorLabel =
    activeBehaviorTarget?.label || adhocBehaviorName.trim() || '';
  const resolvedBehaviorId = activeBehaviorTarget?.id;

  const currentTaskAnalysis = (): StudioTaskAnalysis => ({
    id: 'ta-current',
    targetId: activeTarget?.id,
    targetLabel: 'Handwashing chain',
    chainType: 'TOTAL_TASK',
    steps: taSteps,
    at: new Date().toISOString(),
  });

  const syncGeneratedNarrative = (next: {
    trials?: StudioTrial[];
    frequencies?: StudioFrequency[];
    durations?: StudioDurationEpisode[];
    taSteps?: StudioTaStep[];
    probes?: StudioProbe[];
    abcEvents?: StudioAbc[];
  }) => {
    const nextTrials = next.trials ?? trials;
    const auto = summarizeModalities({
      trials: nextTrials,
      frequencies: next.frequencies ?? frequencies,
      durations: next.durations ?? durations,
      taskAnalyses: [
        {
          id: 'ta-current',
          targetLabel: 'Handwashing chain',
          chainType: 'TOTAL_TASK',
          steps: next.taSteps ?? taSteps,
          at: new Date().toISOString(),
        },
      ],
      probes: next.probes ?? probes,
      abcEvents: next.abcEvents ?? abcEvents,
    });
    if (auto) setObjectiveData(auto);
    if (nextTrials.length) setGoalsAddressed(goalsFromTrials(nextTrials));
  };

  const logTrial = (response: StudioTrial['response']) => {
    if (!clockedIn || clockedOut) return;
    if (!activeTarget) {
      toast.error('No SkillTargets on this client yet — BCBA must add treatment-plan targets.');
      return;
    }
    const nextTrials: StudioTrial[] = [
      ...trials,
      {
        id: `tr-${Date.now()}`,
        targetId: activeTarget.id,
        targetLabel: activeTarget.label,
        response,
        at: new Date().toISOString(),
      },
    ];
    setTrials(nextTrials);
    syncGeneratedNarrative({ trials: nextTrials });
  };

  const bumpFrequency = (delta: number) => {
    if (!clockedIn || clockedOut) return;
    if (!resolvedBehaviorLabel) {
      toast.error('Select a behavior target or type an ad-hoc behavior name.');
      return;
    }
    const observationMinutes = Math.max(1, Math.floor(seconds / 60));
    const key = resolvedBehaviorId || `adhoc:${resolvedBehaviorLabel}`;
    const existing = frequencies.find(
      (f) =>
        (resolvedBehaviorId && f.behaviorTargetId === resolvedBehaviorId) ||
        (!resolvedBehaviorId && f.behaviorName === resolvedBehaviorLabel)
    );
    let nextFrequencies: StudioFrequency[];
    if (existing) {
      nextFrequencies = frequencies.map((f) =>
        f.id === existing.id
          ? {
              ...f,
              count: Math.max(0, f.count + delta),
              observationMinutes,
              at: new Date().toISOString(),
            }
          : f
      );
    } else {
      if (delta <= 0) return;
      nextFrequencies = [
        ...frequencies,
        {
          id: `freq-${Date.now()}`,
          behaviorTargetId: resolvedBehaviorId || key,
          behaviorName: resolvedBehaviorLabel,
          count: delta,
          observationMinutes,
          at: new Date().toISOString(),
        },
      ];
    }
    setFrequencies(nextFrequencies);
    syncGeneratedNarrative({ frequencies: nextFrequencies });
  };

  const logDurationEpisode = () => {
    if (!clockedIn || clockedOut) return;
    if (!resolvedBehaviorLabel) {
      toast.error('Select a behavior target or type an ad-hoc behavior name.');
      return;
    }
    const secs = Math.max(1, parseInt(durationDraftSeconds, 10) || 0);
    const nextDurations: StudioDurationEpisode[] = [
      ...durations,
      {
        id: `dur-${Date.now()}`,
        behaviorTargetId: resolvedBehaviorId,
        behaviorName: resolvedBehaviorLabel,
        seconds: secs,
        intensity: durationIntensity,
        at: new Date().toISOString(),
      },
    ];
    setDurations(nextDurations);
    syncGeneratedNarrative({ durations: nextDurations });
    toast.success(`Duration episode logged (${secs}s · ${durationIntensity})`);
  };

  const setTaStepStatus = (order: number, status: StudioTaStep['status']) => {
    if (!clockedIn || clockedOut) return;
    const nextTaSteps = taSteps.map((s) => (s.order === order ? { ...s, status } : s));
    setTaSteps(nextTaSteps);
    syncGeneratedNarrative({ taSteps: nextTaSteps });
  };

  const logProbe = (result: StudioProbe['result']) => {
    if (!clockedIn || clockedOut) return;
    if (!activeTarget) {
      toast.error('Select a skill target for probe.');
      return;
    }
    const nextProbes: StudioProbe[] = [
      ...probes,
      {
        id: `probe-${Date.now()}`,
        targetId: activeTarget.id,
        targetLabel: activeTarget.label,
        result,
        promptLevel: 'Independent',
        notes: 'Cold probe',
        at: new Date().toISOString(),
      },
    ];
    setProbes(nextProbes);
    syncGeneratedNarrative({ probes: nextProbes });
    toast.success(`Probe logged: ${result}`);
  };

  const addAbc = () => {
    if (!clockedIn || clockedOut) return;
    const behaviorText =
      abcDraft.behavior.trim() || activeBehaviorTarget?.label || adhocBehaviorName.trim();
    if (!abcDraft.antecedent.trim() || !behaviorText || !abcDraft.consequence.trim()) {
      toast.error('Fill A, B, and C.');
      return;
    }
    const durationSeconds = Math.max(0, parseInt(abcDraft.durationSeconds, 10) || 0);
    const normalizedBehavior = behaviorText.trim().replace(/\s+/g, ' ').toLowerCase();
    const mapsExistingTarget =
      Boolean(activeBehaviorTarget) &&
      activeBehaviorTarget!.label.trim().replace(/\s+/g, ' ').toLowerCase() ===
        normalizedBehavior;
    const nextAbcEvents: StudioAbc[] = [
      ...abcEvents,
      {
        id: `abc-${Date.now()}`,
        antecedent: abcDraft.antecedent,
        behavior: behaviorText,
        consequence: abcDraft.consequence,
        durationSeconds,
        intensity: abcDraft.intensity,
        behaviorTargetId: mapsExistingTarget ? activeBehaviorTarget?.id : undefined,
        at: new Date().toISOString(),
      },
    ];
    setAbcEvents(nextAbcEvents);
    syncGeneratedNarrative({ abcEvents: nextAbcEvents });
    setAbcDraft({
      antecedent: '',
      behavior: '',
      consequence: '',
      durationSeconds: '',
      intensity: 'MODERATE',
    });
    toast.success(
      mapsExistingTarget
        ? 'ABC observation saved and linked to the existing target.'
        : OBSERVATION_MAPPING_NEEDED_MESSAGE
    );
    toast.success('ABC incident logged');
  };

  const removeAbc = (id: string) => {
    const nextAbcEvents = abcEvents.filter((e) => e.id !== id);
    setAbcEvents(nextAbcEvents);
    syncGeneratedNarrative({ abcEvents: nextAbcEvents });
  };

  const toggleIntervention = (id: string) => {
    setInterventions((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const goNote = () => {
    const ta = currentTaskAnalysis();
    if (
      !hasObjectiveDatum({
        trials,
        frequencies,
        durations,
        taskAnalyses: [ta],
        probes,
      })
    ) {
      toast.error(
        'Log at least one trial, frequency, duration, TA step, or probe before building the note.'
      );
      return;
    }
    const draft = buildNoteNarrativeDraft({
      bcbaName: client.bcba,
      caregiverPresent,
      caregiverName,
      trials,
      frequencies,
      durations,
      taskAnalyses: [ta],
      probes,
      abcEvents,
      accuracyPercent: accuracy,
    });
    if (!goalsAddressed) setGoalsAddressed(draft.goalsAddressed);
    if (!objectiveData) setObjectiveData(draft.objectiveData);
    if (!clientResponse) setClientResponse(draft.clientResponse);
    if (!barriersSafety) setBarriersSafety(draft.barriersSafety);
    if (!caregiverParticipation) setCaregiverParticipation(draft.caregiverParticipation);
    if (!planNext) setPlanNext(draft.planNext);
    if (usingDemoTargets) {
      toast.message('Demo targets active — submission blocked until CRM targets are loaded.');
    }
    setPhase('NOTE');
  };

  const finishSession = (forceIncomplete: boolean) => {
    if (pending || clockOutPending) return;
    // Documentation submit requires the resolved RBT identity up front.
    if (!forceIncomplete && actingRbtLoaded && !actingRbtId) {
      toast.error(
        'No RBT identity on this device — sign in from the RBT portal, or close Incomplete to hold payroll.'
      );
      return;
    }
    if (!forceIncomplete && !billingFactsReady) {
      toast.error(
        billingFactsError ||
          'The authorized Session CPT and place of service must load before submission.'
      );
      return;
    }

    const finalEval = evaluateClaimReady({
      ...claimEvalInput,
      clockedOut: true,
    });
    const finalChecklist = finalEval.checklist;
    const missing = finalEval.blocks;
    const isIncomplete = forceIncomplete || !finalEval.claimReady;
    const displayUnits = billableUnitsFromSeconds(seconds);
    const displayAtRisk =
      Math.round(displayUnits * (client.ratePerHour / 4) * 100) / 100;

    const persistRecoveryDraft = () => {
      if (saveTimer.current) {
        window.clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
      saveSessionStudioDraft(sessionId, {
        ...draftSnapshot(),
        phase: 'SIGN',
        running: false,
      });
      saveSessionStudioMeta(sessionId, client);
    };

    if (isIncomplete) {
      setClockOutPending(true);
      void (async () => {
        const outcome = await attemptDurableSessionClockOut({
          persistFinalDraft: persistRecoveryDraft,
          clockOut: () =>
            clockOutHrmSession({
              sessionId,
              closeReason: 'INCOMPLETE',
            }),
          commitDurableEnd: (result) => {
            setStartedAt(result.startedAt);
            setEndedAt(result.endedAt);
            setSeconds(result.durationSeconds);
            setClockedIn(true);
            setClockedOut(true);
            setRunning(false);
            setPhase('SIGN');
            saveSessionStudioDraft(sessionId, {
              ...draftSnapshot(),
              phase: 'SIGN',
              seconds: result.durationSeconds,
              running: false,
              clockedIn: true,
              clockedOut: true,
              startedAt: result.startedAt,
              endedAt: result.endedAt,
            });
          },
        });
        setClockOutPending(false);

        if (outcome.status === 'CLOCKED_OUT') {
          const durable = outcome.result;
          const durableAtRisk =
            Math.round(
              durable.billableUnits * (client.ratePerHour / 4) * 100
            ) / 100;
          upsertRbtPayHold({
            id: `hold-${sessionId}`,
            sessionId,
            clientName: client.name,
            severity: 'BLOCKING',
            title: missing[0]?.label || 'Documentation pending',
            detail: `Service and EVV were durably closed. Missing: ${missing.map((m) => m.label).join('; ') || 'documentation completion'}. Finance will hold units until fixed.`,
            amountHeld: Math.max(durableAtRisk, client.ratePerHour),
            sessionRef: `${client.name} · ${new Date(durable.endedAt).toLocaleDateString()} · ${formatSeconds(durable.durationSeconds)}`,
            missingKeys:
              missing.length > 0
                ? missing.map((m) => m.key)
                : ['DOCUMENTATION_PENDING'],
            createdAt: durable.endedAt,
          });
          saveSessionStudioMeta(sessionId, client);
          markScheduleSessionDone(sessionId);
          toast.message(
            'EVV clock-out persisted — documentation pending and pay held.'
          );
          router.push('/rbt/schedule?tab=INCOMPLETE');
          return;
        }

        const detail =
          outcome.status === 'REJECTED'
            ? outcome.result.error ||
              'Durable clock-out was rejected. Service remains open.'
            : 'Durable clock-out could not be confirmed. Service remains open.';
        toast.error(`${detail} Draft retained.`);
      })();
      return;
    }

    startTransition(() => {
      void (async () => {
        const outcome = await attemptSessionStudioSubmit({
          persistFinalDraft: persistRecoveryDraft,
          submit: () =>
            submitHrmSessionEmrNote({
              sessionId,
              rbtUserId: actingRbtId || undefined,
              clientId: dbClientId,
              clientName: client.name,
              cptCode,
              locationCode: placeOfService,
              sessionSeconds: seconds,
              billableUnits: displayUnits,
              startedAt,
              endedAt,
              supervisingBcba: client.bcba,
              caregiverPresent,
              caregiverName,
              goalsAddressed,
              objectiveData,
              interventions,
              clientResponse,
              barriersSafety,
              caregiverParticipation,
              planNext,
              trials: trials.map((t) => ({
                targetId: t.targetId,
                targetGoal: t.targetLabel,
                response: t.response,
                promptLevel: t.promptLevel,
                timestamp: t.at,
              })),
              frequencies,
              durations,
              taskAnalyses: [currentTaskAnalysis()],
              probes,
              abcEvents: abcEvents.map((e) => ({
                antecedent: e.antecedent,
                behavior: e.behavior,
                consequence: e.consequence,
                durationSeconds: e.durationSeconds ?? 0,
                intensity: e.intensity,
                behaviorTargetId: e.behaviorTargetId,
                at: e.at,
              })),
              rbtSignature,
              parentSignature: caregiverSignature,
              expectedNoteUpdatedAt,
              checklistSnapshot: buildChecklistSnapshot(
                finalChecklist,
                endedAt || new Date().toISOString()
              ),
            }),
          validateSuccess: hasCoherentDurableCompletion,
          commitSuccess: (res) => {
            const authoritativeStart = res.startedAt!;
            const authoritativeEnd = res.endedAt!;
            const authoritativeDuration = res.durationSeconds!;
            const authoritativeUnits = res.billableUnits!;
            setStartedAt(authoritativeStart);
            setEndedAt(authoritativeEnd);
            setSeconds(authoritativeDuration);
            setClockedIn(true);
            setClockedOut(true);
            setRunning(false);
            clearRbtPayHold(sessionId);
            clearSessionStudioAll(sessionId);
            markScheduleSessionDone(sessionId);
            pushCompletedStudioSession(
              buildDocumentationSubmittedRecord({
                id: res.sessionId || sessionId,
                client: client.name,
                date: new Date().toISOString().slice(0, 10),
                time: new Date().toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                }),
                units: authoritativeUnits,
              })
            );
            const trialBit = res.trialsPersisted
              ? ` · ${res.trialsPersisted} trials synced`
              : '';
            const abcBit = res.behaviorLogsPersisted
              ? ` · ${res.behaviorLogsPersisted} behavior logs`
              : '';
            const observationBit =
              res.unmappedObservationCount &&
              res.observationMappingStatus === 'BCBA_MAPPING_NEEDED'
                ? ` ${OBSERVATION_MAPPING_NEEDED_MESSAGE}`
                : '';
            toast.success(
              `${DOCUMENTATION_SUBMITTED_MESSAGE} ${authoritativeUnits} unit(s)${trialBit}${abcBit}${observationBit}`
            );
            router.push('/rbt/schedule?tab=COMPLETED');
          },
        });

        if (outcome.status === 'SUCCESS') return;

        const detail =
          outcome.status === 'REJECTED'
            ? outcome.result.error || 'Server rejected documentation submit.'
            : 'The submit request did not reach a confirmed server result.';
        toast.error(`${detail} Draft retained on the Sign screen.`);
        upsertRbtPayHold({
          id: `hold-${sessionId}`,
          sessionId,
          clientName: client.name,
          severity: 'BLOCKING',
          title: 'Submit blocked — draft retained',
          detail,
          amountHeld: displayAtRisk,
          sessionRef: `${client.name} · ${formatSeconds(seconds)}`,
          missingKeys: ['SUBMIT'],
          createdAt: new Date().toISOString(),
        });
      })();
    });
  };

  const curIdx = PHASES.findIndex((x) => x.id === phase);

  return (
    <div className="min-h-screen bg-[#F2ECE0] text-slate-900 flex flex-col">
      <header className="sticky top-0 z-40 border-b-2 border-orange-200 bg-[#FBF7F0]/98 backdrop-blur-xl shadow-md">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-3 pb-2 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex items-start gap-3">
            <button
              type="button"
              onClick={() => exitToSchedule(false)}
              className="mt-0.5 p-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 cursor-pointer shrink-0"
              title="Exit — draft saved"
            >
              <ArrowLeft className="w-5 h-5 text-slate-600" />
            </button>
            <div className="min-w-0">
              <p className="text-[10px] font-mono font-black uppercase tracking-wider text-[#F97316]">
                Session Studio · CPT {cptCode || 'loading'}
              </p>
              <h1 className="text-xl sm:text-2xl font-black font-heading text-slate-900 truncate">
                {client.name}
              </h1>
              <p className="text-[11px] text-slate-600 font-semibold flex flex-wrap gap-x-3 gap-y-1 mt-1">
                <span className="inline-flex items-center gap-1">
                  <MapPin className="w-3 h-3 text-purple-600 shrink-0" />
                  {placeOfService}
                </span>
                <span className="inline-flex items-center gap-1 min-w-0">
                  <ShieldCheck className="w-3 h-3 text-emerald-600 shrink-0" />
                  <span className="truncate">{client.bcba}</span>
                </span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div className="rounded-2xl border-2 border-[#F97316] bg-orange-50 px-3.5 py-2 text-right min-w-[7.5rem]">
              <p className="text-[9px] font-mono font-black text-[#F97316] uppercase flex items-center justify-end gap-1">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${running ? 'bg-rose-500 animate-pulse' : 'bg-slate-400'}`}
                />
                EVV
              </p>
              <p className="text-xl font-mono font-black text-slate-900 leading-none">
                {formatSeconds(seconds)}
              </p>
              <p className="text-[10px] font-bold text-slate-500 mt-0.5">
                {units}u est. · {accuracy}% ind · {trials.length} trials
              </p>
            </div>
            <button
              type="button"
              onClick={() => exitToSchedule(false)}
              className="p-3 rounded-2xl border border-slate-300 bg-white cursor-pointer hover:bg-rose-50 text-slate-600"
              title="Exit — draft saved"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="max-w-5xl mx-auto px-4 sm:px-6 pb-3 flex gap-2 overflow-x-auto">
          {PHASES.map((p, idx) => {
            const active = phase === p.id;
            const done = idx < curIdx;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  if (idx <= curIdx) setPhase(p.id);
                }}
                className={`shrink-0 rounded-full px-3.5 py-1.5 text-[11px] font-black border-2 transition-all cursor-pointer ${
                  active
                    ? 'bg-[#F97316] border-[#F97316] text-white shadow-md'
                    : done
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                      : 'bg-white border-slate-200 text-slate-400'
                }`}
              >
                {done ? '✓ ' : ''}
                <span className="sm:hidden">{p.short}</span>
                <span className="hidden sm:inline">{p.label}</span>
              </button>
            );
          })}
        </div>
      </header>

      <main className="flex-1 w-full">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 flex flex-col gap-6 pb-32">
          {showResumeBanner && (
            <div className="rounded-2xl border-2 border-sky-200 bg-sky-50 px-4 py-3.5 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs font-bold text-sky-900 leading-relaxed">
                Draft restored. Service time is recalculated from durable EVV
                anchors; this browser timer is display-only.
              </p>
              <button
                type="button"
                onClick={() => setShowResumeBanner(false)}
                className="text-[10px] font-black text-sky-700 underline cursor-pointer shrink-0"
              >
                Dismiss
              </button>
            </div>
          )}

          {phase !== 'CLOCK_IN' && (
            <SessionClaimReadyPanel
              readyCount={readyCount}
              totalCount={checklist.length}
              claimReady={claimReadyPreview}
              checklist={checklist}
              blocks={claimReadySignEval.blocks}
              warnings={claimReadySignEval.warnings}
              clockedIn={clockedIn}
              variant={phase === 'SIGN' ? 'sign' : 'chips'}
            />
          )}

          {phase === 'CLOCK_IN' && (
            <section className="rounded-3xl border-2 border-orange-200 bg-white p-6 sm:p-8 shadow-xl flex flex-col gap-6">
              <div className="pb-4 border-b border-orange-100">
                <h2 className="text-xl font-black font-heading flex items-center gap-2">
                  <Clock className="w-6 h-6 text-[#F97316] shrink-0" />
                  Clock in (session logistics)
                </h2>
                <p className="text-sm text-slate-600 font-medium mt-2 leading-relaxed">
                  Start/end times are server-authored. CPT and place of service come from the
                  authorized Session and cannot be changed in Studio.
                </p>
              </div>
              {billingFactsError && (
                <div className="rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-900">
                  {billingFactsError}
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div className="text-xs font-bold flex flex-col gap-2">
                  Authorized place of service
                  <div className="rounded-2xl border-2 border-slate-200 bg-slate-50 p-3.5 text-sm font-semibold text-slate-800">
                    {placeOfService || 'Loading authorized Session…'}
                  </div>
                </div>
                <div className="text-xs font-bold flex flex-col gap-2">
                  Authorized CPT / service type
                  <div className="rounded-2xl border-2 border-slate-200 bg-slate-50 p-3.5 text-sm font-semibold text-slate-800">
                    {cptCode || 'Loading authorized Session…'}
                  </div>
                </div>
                <label className="text-xs font-bold flex flex-col gap-2">
                  Caregiver present?
                  <select
                    value={caregiverPresent}
                    onChange={(e) => setCaregiverPresent(e.target.value as 'YES' | 'NO' | '')}
                    className="w-full rounded-2xl border-2 border-slate-200 bg-slate-50 p-3.5 text-sm font-semibold"
                  >
                    <option value="">Select…</option>
                    <option value="YES">Yes</option>
                    <option value="NO">No</option>
                  </select>
                </label>
                {caregiverPresent === 'YES' && (
                  <label className="text-xs font-bold flex flex-col gap-2">
                    Caregiver name
                    <input
                      value={caregiverName}
                      onChange={(e) => setCaregiverName(e.target.value)}
                      className="w-full rounded-2xl border-2 border-slate-200 bg-slate-50 p-3.5 text-sm font-semibold"
                      placeholder="Parent / guardian"
                    />
                  </label>
                )}
              </div>
            </section>
          )}

          {phase === 'COLLECT' && (
            <div className="flex flex-col gap-6">
              <section className="relative overflow-hidden rounded-3xl border border-orange-200/80 bg-white/90 backdrop-blur-xl p-5 sm:p-7 shadow-2xl flex flex-col gap-5">
                <div className="pointer-events-none absolute -left-16 top-0 h-40 w-40 rounded-full bg-orange-400/10 blur-3xl" />
                <div className="flex flex-wrap items-center gap-2 pb-3 border-b border-orange-100/80">
                  <Activity className="w-5 h-5 text-[#F97316] shrink-0" />
                  <h2 className="text-lg font-black font-heading">Collect · objective data</h2>
                  <span
                    className={`text-[10px] font-mono font-bold ml-auto px-2.5 py-0.5 rounded-full border ${
                      usingDemoTargets
                        ? 'bg-amber-500/10 text-amber-700 border-amber-500/25'
                        : targets.length
                          ? 'bg-emerald-500/10 text-emerald-700 border-emerald-500/25'
                          : 'bg-slate-100 text-slate-500 border-slate-200'
                    }`}
                  >
                    {targetsLoading
                      ? 'Loading…'
                      : usingDemoTargets
                        ? 'Demo · submission blocked'
                        : targets.length
                          ? `${targets.length} SkillTarget${targets.length === 1 ? '' : 's'}`
                          : 'No targets'}
                  </span>
                </div>

                {usingDemoTargets && (
                  <div className="rounded-2xl border border-amber-400/40 bg-amber-50/80 px-4 py-3 flex flex-wrap items-center gap-3 text-xs text-amber-950 font-medium">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
                    <span className="flex-1 min-w-[12rem]">
                      Dev demo targets are opt-in only (`NEXT_PUBLIC_ENABLE_DEV_TOOLS`). They cannot
                      submit documentation — sync CRM Clinical Goals, then clear demo / reload.
                    </span>
                    <button
                      type="button"
                      onClick={clearDemoTargets}
                      className="rounded-xl border border-amber-400 bg-white px-3 py-1.5 text-[11px] font-black cursor-pointer hover:bg-amber-100"
                    >
                      Clear demo
                    </button>
                    <button
                      type="button"
                      onClick={reloadTargets}
                      className="rounded-xl bg-amber-600 text-white px-3 py-1.5 text-[11px] font-black cursor-pointer hover:bg-amber-700"
                    >
                      Reload CRM
                    </button>
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      { id: 'DTT', label: 'DTT', icon: Activity },
                      { id: 'FREQUENCY', label: 'Freq', icon: Hash },
                      { id: 'DURATION', label: 'Duration', icon: Timer },
                      { id: 'TA', label: 'TA', icon: ListOrdered },
                      { id: 'PROBE', label: 'Probe', icon: Crosshair },
                      { id: 'ABC', label: 'ABC', icon: Flame },
                    ] as const
                  ).map((tab) => {
                    const Icon = tab.icon;
                    const on = collectTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setCollectTab(tab.id)}
                        className={`inline-flex items-center gap-1.5 rounded-xl border-2 px-3 py-2 text-[11px] font-black cursor-pointer transition-all ${
                          on
                            ? 'border-[#F97316] bg-orange-50 text-slate-900'
                            : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-orange-200'
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        {tab.label}
                      </button>
                    );
                  })}
                </div>

                {(collectTab === 'DTT' || collectTab === 'PROBE') && (
                  <div className="flex flex-col gap-2.5">
                    <p className="text-[10px] font-mono font-black uppercase tracking-wider text-slate-500">
                      Treatment-plan targets
                    </p>
                    {targetsLoading ? (
                      <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 backdrop-blur-sm px-4 py-6 text-center text-xs font-semibold text-slate-500 animate-pulse">
                        Loading SkillTargets…
                      </div>
                    ) : targets.length === 0 ? (
                      <div className="relative overflow-hidden rounded-2xl border border-amber-400/30 bg-gradient-to-br from-amber-50/90 via-white to-orange-50/60 backdrop-blur-xl px-4 py-5 shadow-lg">
                        <div className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-orange-400/15 blur-2xl" />
                        <p className="text-sm font-black font-heading text-slate-900 mb-1.5">
                          No SkillTargets yet
                        </p>
                        <p className="text-xs text-slate-600 font-medium leading-relaxed mb-4 max-w-lg">
                          {hasTpGoals
                            ? 'Treatment-plan goals exist but were not synced. Open CRM Clinical Goals and run “Sync targets to Session Studio”, then reload here.'
                            : 'Ask the BCBA to add treatment-plan goals in CRM Clinical Goals, then sync them to Session Studio before logging DTT / probe trials.'}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {crmGoalsUrl && (
                            <a
                              href={crmGoalsUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 rounded-xl bg-[#F97316] hover:bg-orange-600 text-white text-[11px] font-black px-3.5 py-2.5 cursor-pointer shadow-md transition-all hover:scale-[1.02]"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                              Open Clinical Goals
                            </a>
                          )}
                          <button
                            type="button"
                            onClick={reloadTargets}
                            className="inline-flex items-center gap-1.5 rounded-xl border-2 border-slate-200 bg-white hover:border-orange-300 text-slate-800 text-[11px] font-black px-3.5 py-2.5 cursor-pointer transition-all"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                            Reload targets
                          </button>
                          {DEV_STUDIO_HELPERS && (
                            <button
                              type="button"
                              onClick={loadDemoTargets}
                              className="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-amber-400/50 bg-amber-50/50 text-amber-800 text-[11px] font-bold px-3.5 py-2.5 cursor-pointer transition-all hover:border-amber-500"
                            >
                              Dev: demo targets
                            </button>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2.5">
                        {targets.map((t) => (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => setActiveTargetId(t.id)}
                            className={`rounded-2xl border-2 px-3.5 py-3 text-left text-xs font-bold max-w-sm cursor-pointer transition-all duration-300 hover:scale-[1.01] hover:shadow-lg ${
                              activeTargetId === t.id
                                ? 'border-[#F97316] bg-orange-50 text-slate-900 shadow-md'
                                : 'border-slate-200/80 bg-white/80 backdrop-blur-sm text-slate-600 hover:border-orange-200'
                            }`}
                          >
                            <span className="text-[9px] font-mono text-[#F97316] block mb-0.5">
                              {t.domain}
                            </span>
                            {t.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {(collectTab === 'FREQUENCY' || collectTab === 'DURATION' || collectTab === 'ABC') && (
                  <div className="flex flex-col gap-2.5">
                    <p className="text-[10px] font-mono font-black uppercase tracking-wider text-slate-500">
                      Behavior targets
                    </p>
                    {behaviorTargets.length === 0 ? (
                      <div className="rounded-2xl border border-rose-200/60 bg-rose-50/40 backdrop-blur-sm px-4 py-4 space-y-3">
                        <p className="text-xs text-slate-600 font-medium leading-relaxed">
                          No existing BehaviorTargets are available. Enter a provisional observation
                          label; the structured note preserves it for BCBA mapping without creating
                          or linking a treatment target.
                        </p>
                        <label className="text-[10px] font-mono font-black uppercase text-slate-500 flex flex-col gap-1.5">
                          Provisional observation label
                          <input
                            value={adhocBehaviorName}
                            onChange={(e) => setAdhocBehaviorName(e.target.value)}
                            placeholder="e.g. Elopement attempts"
                            className="rounded-xl border-2 border-slate-200 bg-white p-3 text-xs font-semibold text-slate-900 normal-case tracking-normal"
                          />
                        </label>
                        <div className="flex flex-wrap gap-2">
                          {crmGoalsUrl && (
                            <a
                              href={crmGoalsUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-[11px] font-black px-3 py-2 cursor-pointer transition-all"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                              Clinical Goals
                            </a>
                          )}
                          {DEV_STUDIO_HELPERS && (
                            <button
                              type="button"
                              onClick={loadDemoTargets}
                              className="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-rose-300 text-rose-800 text-[11px] font-bold px-3 py-2 cursor-pointer"
                            >
                              Dev: demo behaviors
                            </button>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2.5">
                        {behaviorTargets.map((b) => (
                          <button
                            key={b.id}
                            type="button"
                            onClick={() => setActiveBehaviorTargetId(b.id)}
                            className={`rounded-2xl border-2 px-3.5 py-3 text-left text-xs font-bold max-w-sm cursor-pointer transition-all duration-300 hover:scale-[1.01] hover:shadow-lg ${
                              activeBehaviorTargetId === b.id
                                ? 'border-rose-400 bg-rose-50 text-slate-900 shadow-md'
                                : 'border-slate-200/80 bg-white/80 backdrop-blur-sm text-slate-600 hover:border-rose-200'
                            }`}
                          >
                            <span className="text-[9px] font-mono text-rose-500 block mb-0.5">
                              {b.measurementType}
                            </span>
                            {b.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {collectTab === 'DTT' && (
                  <>
                    <div className="rounded-2xl bg-slate-50 border border-slate-200 px-4 py-3">
                      <p className="text-[10px] font-mono font-black uppercase tracking-wider text-slate-500 mb-1">
                        Active target
                      </p>
                      <p className="text-sm font-black text-slate-800 leading-snug">
                        {activeTarget?.label || '—'}
                      </p>
                    </div>
                    <div className="flex flex-col gap-3">
                      <p className="text-[10px] font-mono font-black uppercase tracking-wider text-slate-500">
                        Log trial response
                      </p>
                      <div className="grid grid-cols-3 gap-3 sm:gap-4">
                        <button
                          type="button"
                          onClick={() => logTrial('CORRECT')}
                          className="rounded-[1.75rem] bg-emerald-500 hover:bg-emerald-600 text-white font-black text-3xl sm:text-4xl py-10 sm:py-12 cursor-pointer shadow-xl active:scale-[0.97] transition-transform"
                        >
                          +
                          <span className="block text-[11px] sm:text-xs font-bold opacity-90 mt-2">
                            Independent
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => logTrial('PROMPTED')}
                          className="rounded-[1.75rem] bg-amber-400 hover:bg-amber-500 text-slate-900 font-black text-3xl sm:text-4xl py-10 sm:py-12 cursor-pointer shadow-xl active:scale-[0.97] transition-transform"
                        >
                          P
                          <span className="block text-[11px] sm:text-xs font-bold opacity-90 mt-2">
                            Prompted
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => logTrial('INCORRECT')}
                          className="rounded-[1.75rem] bg-rose-500 hover:bg-rose-600 text-white font-black text-3xl sm:text-4xl py-10 sm:py-12 cursor-pointer shadow-xl active:scale-[0.97] transition-transform"
                        >
                          −
                          <span className="block text-[11px] sm:text-xs font-bold opacity-90 mt-2">
                            Incorrect
                          </span>
                        </button>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
                      <p className="text-xs text-slate-500 font-medium">
                        {trials.length} trials · last:{' '}
                        <span className="font-black text-slate-800">
                          {trials.length ? trials[trials.length - 1].response : '—'}
                        </span>
                      </p>
                      {DEV_STUDIO_HELPERS && units < 1 && (
                        <button
                          type="button"
                          onClick={() => setSeconds((s) => s + 8 * 60)}
                          className="text-[10px] font-black text-[#F97316] underline cursor-pointer"
                        >
                          Dev: +8 min (1 unit)
                        </button>
                      )}
                    </div>
                  </>
                )}

                {collectTab === 'FREQUENCY' && (
                  <div className="flex flex-col gap-4">
                    <p className="text-xs text-slate-500 font-medium">
                      Tally problem / replacement behavior count for{' '}
                      <span className="font-black text-slate-800">
                        {resolvedBehaviorLabel || '—'}
                      </span>
                    </p>
                    <div className="flex items-center justify-center gap-4">
                      <button
                        type="button"
                        onClick={() => bumpFrequency(-1)}
                        className="rounded-2xl bg-slate-200 hover:bg-slate-300 text-slate-800 font-black text-xl px-6 py-4 cursor-pointer"
                      >
                        −1
                      </button>
                      <span className="text-5xl font-black font-mono text-[#F97316] min-w-[4rem] text-center">
                        {frequencies.find(
                          (f) =>
                            (resolvedBehaviorId && f.behaviorTargetId === resolvedBehaviorId) ||
                            (!resolvedBehaviorId && f.behaviorName === resolvedBehaviorLabel)
                        )?.count ?? 0}
                      </span>
                      <button
                        type="button"
                        onClick={() => bumpFrequency(1)}
                        className="rounded-2xl bg-[#F97316] hover:bg-orange-600 text-white font-black text-xl px-6 py-4 cursor-pointer"
                      >
                        +1
                      </button>
                    </div>
                  </div>
                )}

                {collectTab === 'DURATION' && (
                  <div className="flex flex-col gap-4">
                    <p className="text-xs text-slate-500 font-medium">
                      Log duration episode for{' '}
                      <span className="font-black text-slate-800">
                        {resolvedBehaviorLabel || '—'}
                      </span>
                    </p>
                    <div className="flex flex-wrap items-end gap-3">
                      <label className="text-[10px] font-mono font-black uppercase text-slate-500 flex flex-col gap-1.5">
                        Seconds
                        <input
                          value={durationDraftSeconds}
                          onChange={(e) => setDurationDraftSeconds(e.target.value)}
                          className="rounded-xl border-2 border-slate-200 bg-slate-50 p-3 text-sm font-semibold w-28"
                          inputMode="numeric"
                        />
                      </label>
                      <label className="text-[10px] font-mono font-black uppercase text-slate-500 flex flex-col gap-1.5">
                        Intensity
                        <select
                          value={durationIntensity}
                          onChange={(e) =>
                            setDurationIntensity(
                              e.target.value as 'MILD' | 'MODERATE' | 'SEVERE'
                            )
                          }
                          className="rounded-xl border-2 border-slate-200 bg-slate-50 p-3 text-sm font-semibold"
                        >
                          <option value="MILD">Mild</option>
                          <option value="MODERATE">Moderate</option>
                          <option value="SEVERE">Severe</option>
                        </select>
                      </label>
                      <button
                        type="button"
                        onClick={logDurationEpisode}
                        className="inline-flex items-center gap-1.5 rounded-xl border-2 border-orange-300 bg-orange-50 text-orange-900 text-[11px] font-black px-4 py-2.5 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Log episode ({durations.length})
                      </button>
                    </div>
                    {durations.length > 0 && (
                      <ul className="space-y-1.5">
                        {durations.slice(-5).map((d) => (
                          <li
                            key={d.id}
                            className="text-[11px] font-mono text-slate-600 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"
                          >
                            {d.behaviorName}: {d.seconds}s · {d.intensity || 'MODERATE'}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                {collectTab === 'TA' && (
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-bold text-slate-700">Handwashing chain (total task)</p>
                      <span className="text-[10px] font-mono font-black text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-0.5">
                        {taPercentIndependent(taSteps)}% independent
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {taSteps.map((step) => (
                        <div
                          key={step.order}
                          className="rounded-2xl border border-slate-200 bg-slate-50 p-3 flex items-center justify-between gap-2"
                        >
                          <div>
                            <span className="text-[9px] font-mono text-slate-400 block">
                              Step {step.order}
                            </span>
                            <strong className="text-xs text-slate-900">{step.instruction}</strong>
                          </div>
                          <div className="flex gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => setTaStepStatus(step.order, 'INDEPENDENT')}
                              className={`px-2 py-1 rounded-lg text-[10px] font-black cursor-pointer ${
                                step.status === 'INDEPENDENT'
                                  ? 'bg-emerald-500 text-white'
                                  : 'bg-slate-200 text-slate-700 hover:bg-emerald-100'
                              }`}
                            >
                              IND
                            </button>
                            <button
                              type="button"
                              onClick={() => setTaStepStatus(step.order, 'PROMPTED')}
                              className={`px-2 py-1 rounded-lg text-[10px] font-black cursor-pointer ${
                                step.status === 'PROMPTED'
                                  ? 'bg-amber-500 text-white'
                                  : 'bg-slate-200 text-slate-700 hover:bg-amber-100'
                              }`}
                            >
                              +P
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {collectTab === 'PROBE' && (
                  <div className="flex flex-col gap-4">
                    <p className="text-xs text-slate-500 font-medium">
                      Cold probe on{' '}
                      <span className="font-black text-slate-800">{activeTarget?.label || '—'}</span>
                    </p>
                    <div className="grid grid-cols-3 gap-3">
                      <button
                        type="button"
                        onClick={() => logProbe('CORRECT')}
                        className="rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-white font-black py-6 cursor-pointer"
                      >
                        Correct
                      </button>
                      <button
                        type="button"
                        onClick={() => logProbe('INCORRECT')}
                        className="rounded-2xl bg-rose-500 hover:bg-rose-600 text-white font-black py-6 cursor-pointer"
                      >
                        Incorrect
                      </button>
                      <button
                        type="button"
                        onClick={() => logProbe('NO_RESPONSE')}
                        className="rounded-2xl bg-slate-500 hover:bg-slate-600 text-white font-black py-6 cursor-pointer"
                      >
                        NR
                      </button>
                    </div>
                    <p className="text-xs text-slate-500 font-medium">{probes.length} probe(s) logged</p>
                  </div>
                )}

                {collectTab === 'ABC' && (
                  <div className="flex flex-col gap-4">
                    {activeBehaviorTarget && (
                      <button
                        type="button"
                        onClick={() =>
                          setAbcDraft((d) => ({
                            ...d,
                            behavior: d.behavior || activeBehaviorTarget.label,
                          }))
                        }
                        className="self-start text-[10px] font-black text-rose-700 underline cursor-pointer"
                      >
                        Prefill B from {activeBehaviorTarget.label}
                      </button>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {(['antecedent', 'behavior', 'consequence'] as const).map((k) => (
                        <label
                          key={k}
                          className="text-[10px] font-mono font-black uppercase text-slate-500 flex flex-col gap-1.5"
                        >
                          {k}
                          <input
                            value={abcDraft[k]}
                            onChange={(e) => setAbcDraft((d) => ({ ...d, [k]: e.target.value }))}
                            placeholder={
                              k === 'behavior' && activeBehaviorTarget
                                ? activeBehaviorTarget.label
                                : k[0].toUpperCase() + k.slice(1)
                            }
                            className="rounded-xl border-2 border-slate-200 bg-slate-50 p-3 text-xs font-semibold text-slate-900 normal-case tracking-normal"
                          />
                        </label>
                      ))}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <label className="text-[10px] font-mono font-black uppercase text-slate-500 flex flex-col gap-1.5">
                        Duration (sec)
                        <input
                          value={abcDraft.durationSeconds}
                          onChange={(e) =>
                            setAbcDraft((d) => ({ ...d, durationSeconds: e.target.value }))
                          }
                          className="rounded-xl border-2 border-slate-200 bg-slate-50 p-3 text-xs font-semibold"
                          inputMode="numeric"
                          placeholder="0"
                        />
                      </label>
                      <label className="text-[10px] font-mono font-black uppercase text-slate-500 flex flex-col gap-1.5">
                        Intensity
                        <select
                          value={abcDraft.intensity}
                          onChange={(e) =>
                            setAbcDraft((d) => ({
                              ...d,
                              intensity: e.target.value as 'MILD' | 'MODERATE' | 'SEVERE',
                            }))
                          }
                          className="rounded-xl border-2 border-slate-200 bg-slate-50 p-3 text-xs font-semibold"
                        >
                          <option value="MILD">Mild</option>
                          <option value="MODERATE">Moderate</option>
                          <option value="SEVERE">Severe</option>
                        </select>
                      </label>
                    </div>
                    <button
                      type="button"
                      onClick={addAbc}
                      className="self-start inline-flex items-center gap-1.5 rounded-xl border-2 border-rose-300 bg-rose-50 text-rose-800 text-[11px] font-black px-4 py-2.5 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Log ABC ({abcEvents.length})
                    </button>
                    {abcEvents.length > 0 && (
                      <ul className="space-y-2 max-h-48 overflow-y-auto">
                        {abcEvents.map((e) => (
                          <li
                            key={e.id}
                            className="rounded-2xl border border-rose-200/60 bg-white/80 px-3 py-2.5 flex gap-2 items-start"
                          >
                            <div className="flex-1 min-w-0 text-[11px] text-slate-700 leading-snug">
                              <span className="font-mono font-black text-rose-600 uppercase tracking-wider text-[9px]">
                                {e.intensity || 'MODERATE'}
                                {e.durationSeconds ? ` · ${e.durationSeconds}s` : ''}
                              </span>
                              <p className="mt-0.5">
                                <strong>A</strong> {e.antecedent} · <strong>B</strong> {e.behavior}{' '}
                                · <strong>C</strong> {e.consequence}
                              </p>
                              <p
                                className={`mt-1 font-bold ${
                                  e.behaviorTargetId
                                    ? 'text-emerald-700'
                                    : 'text-amber-700'
                                }`}
                              >
                                {e.behaviorTargetId
                                  ? 'Linked to an existing behavior target.'
                                  : OBSERVATION_MAPPING_NEEDED_MESSAGE}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => removeAbc(e.id)}
                              className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                              aria-label="Remove ABC"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </section>
            </div>
          )}

          {phase === 'NOTE' && (
            <section className="relative overflow-hidden rounded-3xl border border-orange-200/80 bg-white/90 backdrop-blur-xl p-6 sm:p-8 shadow-2xl flex flex-col gap-6">
              <div className="pointer-events-none absolute -right-12 -top-10 h-36 w-36 rounded-full bg-orange-400/10 blur-3xl" />
              <div className="pb-4 border-b border-orange-100/80 relative">
                <div className="flex flex-wrap items-center gap-2">
                  <FileText className="w-5 h-5 text-[#F97316] shrink-0" />
                  <h2 className="text-lg font-black font-heading">
                    {cptCode || 'Authorized'} session note
                  </h2>
                  <span className="text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 border border-emerald-500/20 ml-auto">
                    Auto-filled from Collect
                  </span>
                </div>
                <p className="text-xs text-slate-500 font-medium mt-2 leading-relaxed">
                  Structured for audit: logistics + goals/data + procedures + response + barriers + plan.
                  Raw tallies alone are not enough — narrative must connect to the treatment plan.
                </p>
              </div>

              {/* Logistics summary (read-only) */}
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <p className="text-[10px] font-mono font-black uppercase text-slate-400">Start → End</p>
                  <p className="font-bold text-slate-900 mt-0.5">
                    {formatClockTime(startedAt)} → {formatClockTime(endedAt) === '—' ? 'in progress' : formatClockTime(endedAt)}{' '}
                    · {Math.floor(seconds / 60)} min · {units} unit(s)
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-mono font-black uppercase text-slate-400">Service</p>
                  <p className="font-bold text-slate-900 mt-0.5">
                    {cptCode.split(' ')[0]} · {placeOfService}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-mono font-black uppercase text-slate-400">Rendering / BCBA</p>
                  <p className="font-bold text-slate-900 mt-0.5">RBT · {client.bcba}</p>
                </div>
                <div>
                  <p className="text-[10px] font-mono font-black uppercase text-slate-400">Caregiver present</p>
                  <p className="font-bold text-slate-900 mt-0.5">
                    {caregiverPresent === 'YES'
                      ? `Yes — ${caregiverName}`
                      : caregiverPresent === 'NO'
                        ? 'No'
                        : '—'}
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-5">
                <label className="flex flex-col gap-2 text-xs font-bold text-slate-700">
                  <span className="inline-flex items-center gap-1.5">
                    <ClipboardList className="w-3.5 h-3.5 text-[#F97316]" />
                    1. Treatment-plan goals / targets addressed
                  </span>
                  <textarea
                    value={goalsAddressed}
                    onChange={(e) => setGoalsAddressed(e.target.value)}
                    rows={2}
                    className="w-full rounded-2xl border-2 border-slate-200 bg-slate-50 p-4 text-sm font-medium leading-relaxed"
                  />
                </label>

                <label className="flex flex-col gap-2 text-xs font-bold text-slate-700">
                  <span>2. Objective data (measurable)</span>
                  <textarea
                    value={objectiveData}
                    onChange={(e) => setObjectiveData(e.target.value)}
                    rows={3}
                    className="w-full rounded-2xl border-2 border-slate-200 bg-slate-50 p-4 text-sm font-medium leading-relaxed font-mono"
                  />
                </label>

                <div className="flex flex-col gap-2.5">
                  <p className="text-xs font-bold text-slate-700">3. Procedures implemented by protocol</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {ABA_INTERVENTION_OPTIONS.map((opt) => {
                      const on = interventions.includes(opt.id);
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => toggleIntervention(opt.id)}
                          className={`text-left rounded-xl border-2 px-3 py-2.5 text-[11px] font-bold cursor-pointer transition-all ${
                            on
                              ? 'border-[#F97316] bg-orange-50 text-slate-900'
                              : 'border-slate-200 bg-white text-slate-600 hover:border-orange-200'
                          }`}
                        >
                          {on ? '✓ ' : '○ '}
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <label className="flex flex-col gap-2 text-xs font-bold text-slate-700">
                  <span>4. Client response to intervention</span>
                  <textarea
                    value={clientResponse}
                    onChange={(e) => setClientResponse(e.target.value)}
                    rows={4}
                    className="w-full rounded-2xl border-2 border-slate-200 bg-slate-50 p-4 text-sm font-medium leading-relaxed min-h-[7rem]"
                    placeholder="Describe measurable response — avoid vague phrases like “good session”."
                  />
                  {narrativeQualityHint('CLIENT_RESPONSE', clientResponse) && (
                    <span className="text-[10px] font-medium text-amber-700">
                      {narrativeQualityHint('CLIENT_RESPONSE', clientResponse)}
                    </span>
                  )}
                </label>

                <label className="flex flex-col gap-2 text-xs font-bold text-slate-700">
                  <span>5. Barriers / safety</span>
                  <textarea
                    value={barriersSafety}
                    onChange={(e) => setBarriersSafety(e.target.value)}
                    rows={2}
                    className="w-full rounded-2xl border-2 border-slate-200 bg-slate-50 p-4 text-sm font-medium leading-relaxed"
                    placeholder='Required — use “None noted” if none.'
                  />
                </label>

                <label className="flex flex-col gap-2 text-xs font-bold text-slate-700">
                  <span>
                    6. Caregiver participation / debrief
                    {caregiverPresent === 'YES' ? ' (required)' : ''}
                  </span>
                  <textarea
                    value={caregiverParticipation}
                    onChange={(e) => setCaregiverParticipation(e.target.value)}
                    rows={2}
                    className="w-full rounded-2xl border-2 border-slate-200 bg-slate-50 p-4 text-sm font-medium leading-relaxed"
                  />
                  {narrativeQualityHint(
                    'CAREGIVER_DEBRIEF',
                    caregiverParticipation,
                    caregiverPresent
                  ) && (
                    <span className="text-[10px] font-medium text-amber-700">
                      {narrativeQualityHint(
                        'CAREGIVER_DEBRIEF',
                        caregiverParticipation,
                        caregiverPresent
                      )}
                    </span>
                  )}
                </label>

                <label className="flex flex-col gap-2 text-xs font-bold text-slate-700">
                  <span>7. Plan for next session</span>
                  <textarea
                    value={planNext}
                    onChange={(e) => setPlanNext(e.target.value)}
                    rows={2}
                    className="w-full rounded-2xl border-2 border-slate-200 bg-slate-50 p-4 text-sm font-medium leading-relaxed"
                  />
                  {narrativeQualityHint('PLAN_NEXT', planNext) && (
                    <span className="text-[10px] font-medium text-amber-700">
                      {narrativeQualityHint('PLAN_NEXT', planNext)}
                    </span>
                  )}
                </label>
              </div>
            </section>
          )}

          {phase === 'SIGN' && (
            <section className="rounded-3xl border-2 border-orange-200 bg-white p-6 sm:p-8 shadow-xl flex flex-col gap-6">
              <div className="pb-4 border-b border-orange-100">
                <div className="flex items-center gap-2">
                  <PenTool className="w-5 h-5 text-[#F97316] shrink-0" />
                  <h2 className="text-lg font-black font-heading">Sign &amp; attest</h2>
                </div>
                <p className="text-xs text-slate-500 font-medium mt-2">
                  Rendering provider signature is always required. Caregiver signature is required by this
                  agency before documentation can be submitted.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <label className="text-xs font-bold flex flex-col gap-2">
                  RBT / rendering provider signature
                  <input
                    value={rbtSignature}
                    onChange={(e) => setRbtSignature(e.target.value)}
                    className="w-full rounded-2xl border-2 border-slate-200 bg-slate-50 p-3.5 text-sm font-semibold"
                    placeholder="David Miller, RBT"
                  />
                </label>
                <label className="text-xs font-bold flex flex-col gap-2">
                  Caregiver / guardian signature
                  <input
                    value={caregiverSignature}
                    onChange={(e) => setCaregiverSignature(e.target.value)}
                    className="w-full rounded-2xl border-2 border-slate-200 bg-slate-50 p-3.5 text-sm font-semibold"
                    placeholder="Parent / guardian name"
                  />
                </label>
              </div>

              {actingRbtLoaded && !actingRbtId && (
                <div className="rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3 flex items-start gap-2 text-xs text-rose-900 font-semibold">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-rose-500 mt-0.5" />
                  No RBT identity on this device — documentation submit is blocked. Sign in from the RBT
                  portal, then resume this draft. You can still close Incomplete (pay held).
                </div>
              )}

              <p className="text-[11px] text-slate-500 flex items-start gap-2 leading-relaxed pt-2 border-t border-slate-100">
                <Sparkles className="w-3.5 h-3.5 text-[#F97316] shrink-0 mt-0.5" />
                Submit stores the structured note and sends it to the BCBA review queue. Incomplete
                preserves the durable service close and your recovery draft.
              </p>
            </section>
          )}
        </div>
      </main>

      <footer className="sticky bottom-0 z-40 border-t-2 border-orange-200 bg-[#FBF7F0]/98 backdrop-blur-xl shadow-[0_-8px_24px_rgba(0,0,0,0.06)]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3.5 flex flex-col sm:flex-row gap-3">
          {phase === 'CLOCK_IN' && (
            <button
              type="button"
              onClick={startEvv}
              disabled={clockInPending || !billingFactsReady}
              className="w-full rounded-2xl bg-[#F97316] hover:bg-orange-600 disabled:opacity-60 disabled:cursor-not-allowed text-white font-black text-sm px-6 py-4 cursor-pointer shadow-lg flex items-center justify-center gap-2"
            >
              {clockInPending ? (
                <RefreshCw className="w-5 h-5 animate-spin" />
              ) : (
                <Play className="w-5 h-5" />
              )}
              {clockInPending ? 'Persisting clock-in…' : 'Start EVV & begin collecting'}
            </button>
          )}
          {phase === 'COLLECT' && (
            <button
              type="button"
              onClick={goNote}
              className="w-full rounded-2xl bg-[#F97316] hover:bg-orange-600 text-white font-black text-sm px-6 py-4 cursor-pointer shadow-lg flex items-center justify-center gap-2"
            >
              Build {cptCode || 'authorized'} session note
              <ChevronRight className="w-5 h-5" />
            </button>
          )}
          {phase === 'NOTE' && (
            <button
              type="button"
              onClick={() => setPhase('SIGN')}
              className="w-full rounded-2xl bg-[#F97316] hover:bg-orange-600 text-white font-black text-sm px-6 py-4 cursor-pointer flex items-center justify-center gap-2"
            >
              Continue to signatures
              <ChevronRight className="w-5 h-5" />
            </button>
          )}
          {phase === 'SIGN' && (
            <>
              <button
                type="button"
                disabled={
                  pending ||
                  clockOutPending ||
                  !billingFactsReady ||
                  !claimReadyPreview ||
                  (actingRbtLoaded && !actingRbtId)
                }
                onClick={() => finishSession(false)}
                className="flex-1 rounded-2xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black text-sm px-6 py-4 cursor-pointer flex items-center justify-center gap-2"
              >
                <CheckCircle2 className="w-5 h-5" />
                {pending ? 'Submitting…' : 'Submit documentation'}
              </button>
              <button
                type="button"
                disabled={pending || clockOutPending}
                onClick={() => finishSession(true)}
                className="flex-1 rounded-2xl border-2 border-amber-400 bg-amber-50 hover:bg-amber-100 disabled:opacity-50 disabled:cursor-not-allowed text-amber-950 font-black text-sm px-6 py-4 cursor-pointer flex items-center justify-center gap-2"
              >
                {clockOutPending ? (
                  <RefreshCw className="w-5 h-5 animate-spin" />
                ) : (
                  <AlertTriangle className="w-5 h-5" />
                )}
                {clockOutPending ? 'Persisting EVV clock-out…' : 'Close incomplete'}
              </button>
            </>
          )}
        </div>
      </footer>
    </div>
  );
}
