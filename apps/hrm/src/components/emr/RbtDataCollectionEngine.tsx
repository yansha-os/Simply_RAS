'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Clock,
  ShieldCheck,
  Activity,
  FileText,
  BookOpen,
  AlertTriangle,
  Flame,
  Timer as TimerIcon,
  ListOrdered,
  Layers,
  Grid
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { toast } from 'sonner';
import {
  getSimulationReadiness,
  type SimulationEvidence,
} from './rbtSimulationTraining';

export type PromptLevel = 'IND' | 'VERBAL' | 'GESTURAL' | 'MODEL' | 'PARTIAL_PHYSICAL' | 'FULL_PHYSICAL';

export interface TrialRecord {
  id: string;
  targetGoal: string;
  response: 'CORRECT' | 'PROMPTED' | 'INCORRECT';
  promptLevel?: PromptLevel;
  timestamp: string;
}

export interface TaskAnalysisStep {
  id: string;
  stepNumber: number;
  instruction: string;
  status: 'PENDING' | 'INDEPENDENT' | 'PROMPTED';
}

export interface AbcEvent {
  id: string;
  antecedent: string;
  behavior: string;
  consequence: string;
  durationSeconds: number;
  timestamp: string;
}

type ProcedureTab =
  | 'DTT'
  | 'TASK_ANALYSIS'
  | 'FREQUENCY_LATENCY'
  | 'INTERVAL'
  | 'ABC';

const PROCEDURE_TABS: ProcedureTab[] = [
  'DTT',
  'TASK_ANALYSIS',
  'FREQUENCY_LATENCY',
  'INTERVAL',
  'ABC',
];

interface RbtDataCollectionEngineProps {
  mode?: 'SIMULATION' | 'LIVE_SESSION';
  onSimulationComplete?: () => void | Promise<void>;
}

export function RbtDataCollectionEngine({ mode = 'LIVE_SESSION', onSimulationComplete }: RbtDataCollectionEngineProps) {
  // ⏱️ Real Ticking Session Timer State (EVV Clock) — SIMULATION only rendered for LIVE gate below
  const [sessionSeconds, setSessionSeconds] = useState(6320); // ~1h 45m initial
  const [isSessionTimerRunning, setIsSessionTimerRunning] = useState(true);
  const [locationCode, setLocationCode] = useState('12 - Home');
  const [cptCode] = useState('97153-HM - Adaptive Behavior Treatment (RBT Level)');
  
  // Active Data Procedure Tab
  const [activeProcedureTab, setActiveProcedureTab] = useState<ProcedureTab>('DTT');

  // ⏱️ ABC Behavior Incident Duration Timer State (Stopwatch)
  const [behaviorTimerSeconds, setBehaviorTimerSeconds] = useState(0);
  const [isBehaviorTimerRunning, setIsBehaviorTimerRunning] = useState(false);

  // ⏱️ Latency Timer State
  const [latencySeconds, setLatencySeconds] = useState(0);
  const [isLatencyTimerRunning, setIsLatencyTimerRunning] = useState(false);

  // ⏱️ Discontinuous Interval Timer State (PIR / WIR 10-sec Intervals)
  const [intervalMode, setIntervalMode] = useState<'PARTIAL_INTERVAL' | 'WHOLE_INTERVAL' | 'MOMENTARY_TIME_SAMPLING'>('PARTIAL_INTERVAL');
  const [intervalGrid, setIntervalGrid] = useState<Array<{ id: number; active: boolean }>>([
    { id: 1, active: true },
    { id: 2, active: true },
    { id: 3, active: false },
    { id: 4, active: true },
    { id: 5, active: false },
    { id: 6, active: true }
  ]);

  // ⏱️ DTT 3-Second Inter-Trial Interval (ITI) Countdown
  const [itiCountdown, setItiCountdown] = useState(0);

  // DTT Trial State
  const [selectedGoal, setSelectedGoal] = useState('Goal 1: Manding for Desired Items');
  const [trials, setTrials] = useState<TrialRecord[]>([
    { id: '1', targetGoal: 'Goal 1: Manding for Desired Items', response: 'CORRECT', promptLevel: 'IND', timestamp: '02:15 PM' },
    { id: '2', targetGoal: 'Goal 1: Manding for Desired Items', response: 'PROMPTED', promptLevel: 'VERBAL', timestamp: '02:18 PM' },
    { id: '3', targetGoal: 'Goal 1: Manding for Desired Items', response: 'CORRECT', promptLevel: 'IND', timestamp: '02:22 PM' },
    { id: '4', targetGoal: 'Goal 1: Manding for Desired Items', response: 'CORRECT', promptLevel: 'IND', timestamp: '02:25 PM' },
    { id: '5', targetGoal: 'Goal 1: Manding for Desired Items', response: 'PROMPTED', promptLevel: 'GESTURAL', timestamp: '02:28 PM' }
  ]);
  const [activePromptLevel, setActivePromptLevel] = useState<PromptLevel>('IND');

  // Task Analysis Step-Chaining State (Handwashing 7-Step Sequence)
  const [taSteps, setTaSteps] = useState<TaskAnalysisStep[]>([
    { id: 'ta-1', stepNumber: 1, instruction: 'Turn on water faucet', status: 'INDEPENDENT' },
    { id: 'ta-2', stepNumber: 2, instruction: 'Wet both hands thoroughly', status: 'INDEPENDENT' },
    { id: 'ta-3', stepNumber: 3, instruction: 'Apply 1 pump of liquid soap', status: 'INDEPENDENT' },
    { id: 'ta-4', stepNumber: 4, instruction: 'Rub hands together for 20 seconds', status: 'PROMPTED' },
    { id: 'ta-5', stepNumber: 5, instruction: 'Rinse soap completely under water', status: 'INDEPENDENT' },
    { id: 'ta-6', stepNumber: 6, instruction: 'Turn off water faucet', status: 'INDEPENDENT' },
    { id: 'ta-7', stepNumber: 7, instruction: 'Dry hands thoroughly with clean towel', status: 'INDEPENDENT' }
  ]);

  // Frequency & Rate Tally Counters
  const [mandCount, setMandCount] = useState(14);
  const [vocalInitCount, setVocalInitCount] = useState(8);

  // ABC Behavior State
  const [antecedent, setAntecedent] = useState('Demand Placed');
  const [behavior, setBehavior] = useState('Elopement / Running Away');
  const [consequence, setConsequence] = useState('Response Block & Redirection');
  const [abcEvents, setAbcEvents] = useState<AbcEvent[]>([]);

  // BIP Reference Drawer
  const [showBipDrawer, setShowBipDrawer] = useState(false);
  const bipDrawerRef = useRef<HTMLDivElement>(null);

  // SOAP Note AI Assistant Quick Chips State
  const [subjectiveNote, setSubjectiveNote] = useState('Client arrived alert and engaged. Caregiver reported good morning routine and adequate sleep.');
  const [assessmentNote, setAssessmentNote] = useState('Client demonstrated strong manding progress. Prompt fading from verbal to gestural was effective.');
  const [planNote, setPlanNote] = useState('Continue 3-second prompt delay for Goal 1. Introduce Goal 2 generalization in natural environment.');

  // Dual Signatures State
  const [rbtSignature, setRbtSignature] = useState('Sarah Jenkins, BT');
  const [parentSignature, setParentSignature] = useState('');
  const [isNoteSubmitted, setIsNoteSubmitted] = useState(false);
  const [practiceEvidence, setPracticeEvidence] = useState<Omit<SimulationEvidence, 'acknowledgment'>>({
    dtt: false,
    taskAnalysis: false,
    measurement: false,
    interval: false,
    abc: false,
  });

  const markPracticeEvidence = (
    key: keyof Omit<SimulationEvidence, 'acknowledgment'>
  ) => {
    setPracticeEvidence((current) =>
      current[key] ? current : { ...current, [key]: true }
    );
  };

  const handleProcedureTabKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    currentTab: ProcedureTab
  ) => {
    const currentIndex = PROCEDURE_TABS.indexOf(currentTab);
    let nextIndex: number | null = null;

    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % PROCEDURE_TABS.length;
    if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + PROCEDURE_TABS.length) % PROCEDURE_TABS.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = PROCEDURE_TABS.length - 1;
    if (nextIndex === null) return;

    event.preventDefault();
    const nextTab = PROCEDURE_TABS[nextIndex];
    setActiveProcedureTab(nextTab);
    document.getElementById(`simulation-procedure-tab-${nextTab}`)?.focus();
  };

  // Ticking Session Clock Effect
  useEffect(() => {
    if (!isSessionTimerRunning) return;
    const interval = window.setInterval(() => {
      setSessionSeconds(prev => prev + 1);
    }, 1000);
    return () => window.clearInterval(interval);
  }, [isSessionTimerRunning]);

  // Ticking Behavior Duration Stopwatch Effect
  useEffect(() => {
    if (!isBehaviorTimerRunning) return;
    const interval = window.setInterval(() => {
      setBehaviorTimerSeconds(prev => prev + 1);
    }, 1000);
    return () => window.clearInterval(interval);
  }, [isBehaviorTimerRunning]);

  // Ticking Latency Stopwatch Effect
  useEffect(() => {
    if (!isLatencyTimerRunning) return;
    const interval = window.setInterval(() => {
      setLatencySeconds(prev => prev + 1);
    }, 1000);
    return () => window.clearInterval(interval);
  }, [isLatencyTimerRunning]);

  // Inter-Trial Countdown Effect
  useEffect(() => {
    if (itiCountdown <= 0) return;
    const interval = window.setInterval(() => {
      setItiCountdown(prev => prev - 1);
    }, 1000);
    return () => window.clearInterval(interval);
  }, [itiCountdown]);

  useEffect(() => {
    if (!showBipDrawer) return;
    bipDrawerRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowBipDrawer(false);
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [showBipDrawer]);

  // Format Seconds to HH:MM:SS
  const formatSeconds = (sec: number) => {
    const hrs = Math.floor(sec / 3600);
    const mins = Math.floor((sec % 3600) / 60);
    const secs = sec % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Calculate billable 15-minute units (8-minute rounding rule)
  const sessionMinutes = Math.floor(sessionSeconds / 60);
  const calculate8MinUnits = (mins: number) => {
    if (mins < 8) return 0;
    if (mins >= 8 && mins <= 22) return 1;
    if (mins >= 23 && mins <= 37) return 2;
    if (mins >= 38 && mins <= 52) return 3;
    if (mins >= 53 && mins <= 67) return 4;
    if (mins >= 68 && mins <= 82) return 5;
    if (mins >= 83 && mins <= 97) return 6;
    if (mins >= 98 && mins <= 112) return 7;
    return Math.round(mins / 15);
  };
  const billableUnits = calculate8MinUnits(sessionMinutes);

  const handleLogTrial = (response: 'CORRECT' | 'PROMPTED' | 'INCORRECT') => {
    const newTrial: TrialRecord = {
      id: Date.now().toString(),
      targetGoal: selectedGoal,
      response,
      promptLevel: response === 'PROMPTED' ? activePromptLevel : response === 'CORRECT' ? 'IND' : undefined,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setTrials(prev => [...prev, newTrial]);
    markPracticeEvidence('dtt');
    setItiCountdown(3);
    toast.success(`Practice trial logged: ${response} ${response === 'PROMPTED' ? `(${activePromptLevel})` : ''}`);
  };

  const handleUpdateTaStep = (stepId: string, status: 'INDEPENDENT' | 'PROMPTED') => {
    setTaSteps(prev => prev.map(s => s.id === stepId ? { ...s, status } : s));
    markPracticeEvidence('taskAnalysis');
    toast.success(`Practice task-analysis step updated: ${status}`);
  };

  const handleToggleLatencyTimer = () => {
    if (!isLatencyTimerRunning) {
      setLatencySeconds(0);
      setIsLatencyTimerRunning(true);
      toast.info('⏱️ Latency Stopwatch started (Instruction given)!');
    } else {
      setIsLatencyTimerRunning(false);
      markPracticeEvidence('measurement');
      toast.success(`Practice latency recorded: ${latencySeconds}s to initiation.`);
    }
  };

  const handleToggleBehaviorTimer = () => {
    if (!isBehaviorTimerRunning) {
      setBehaviorTimerSeconds(0);
      setIsBehaviorTimerRunning(true);
      toast.info('⏱️ Behavior Duration Stopwatch started!');
    } else {
      setIsBehaviorTimerRunning(false);
      toast.success(`⏱️ Behavior Duration stopped at ${behaviorTimerSeconds} seconds!`);
    }
  };

  const handleLogAbcEvent = () => {
    const duration = behaviorTimerSeconds > 0 ? behaviorTimerSeconds : 45;
    const newAbc: AbcEvent = {
      id: Date.now().toString(),
      antecedent,
      behavior,
      consequence,
      durationSeconds: duration,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setAbcEvents(prev => [...prev, newAbc]);
    markPracticeEvidence('abc');
    setBehaviorTimerSeconds(0);
    setIsBehaviorTimerRunning(false);
    toast.success(`Practice ABC event logged: ${behavior} (${duration}s duration).`);
  };

  const handleFinishPracticeAttempt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode !== 'SIMULATION') {
      toast.error('No live session is bound to this training collector.');
      return;
    }

    if (!parentSignature.trim()) {
      toast.error('Type the fictional caregiver name to acknowledge this practice note.');
      return;
    }

    if (!simulationReadiness.ready) {
      toast.error(`Complete all practice checks first (${simulationReadiness.completed}/${simulationReadiness.total}).`);
      return;
    }

    setIsNoteSubmitted(true);
    toast.info('Practice note validated locally. No clinical note, EVV record, or claim was created.');
    try {
      await onSimulationComplete?.();
    } catch {
      setIsNoteSubmitted(false);
      toast.error('The practice attempt could not be recorded. No live records were changed.');
    }
  };

  // Descriptive practice metrics only — these are not competency or mastery scores.
  const totalGoalTrials = trials.filter(t => t.targetGoal === selectedGoal);
  const successfulGoalTrials = totalGoalTrials.filter(t => t.response === 'CORRECT' || t.response === 'PROMPTED').length;
  const responseRatePercent = totalGoalTrials.length > 0 ? Math.round((successfulGoalTrials / totalGoalTrials.length) * 100) : 0;
  const scoredTaSteps = taSteps.filter((step) => step.status !== 'PENDING');
  const independentTaSteps = scoredTaSteps.filter((step) => step.status === 'INDEPENDENT').length;
  const taIndependentPercent = scoredTaSteps.length > 0
    ? Math.round((independentTaSteps / scoredTaSteps.length) * 100)
    : 0;

  const simulationReadiness = getSimulationReadiness({
    ...practiceEvidence,
    acknowledgment: parentSignature.trim().length >= 2,
  });

  // LIVE: never show Leo Miller / fake EVV — Session Studio owns real sessions
  if (mode === 'LIVE_SESSION') {
    return (
      <div className="relative overflow-hidden rounded-3xl border-2 border-orange-200 bg-gradient-to-br from-white via-orange-50/70 to-amber-50/50 p-8 sm:p-12 text-center shadow-xl">
        <div className="pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full bg-[#F97316]/15 blur-3xl" />
        <div className="relative mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-orange-200 bg-white text-[#F97316] shadow-md">
          <ShieldCheck className="h-8 w-8" />
        </div>
        <h2 className="font-heading text-2xl font-black tracking-tight text-slate-900">
          No live session bound here
        </h2>
        <p className="mx-auto mt-3 max-w-lg text-xs font-semibold leading-relaxed text-slate-600">
          This legacy collector no longer invents a demo client for LIVE mode. Start EVV from{' '}
          <strong>My Schedule</strong> / Session Studio when Case Coord assigns a CRM session, or use the
          practice simulation for Leo Miller training data.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <a
            href="/rbt/schedule"
            className="inline-flex cursor-pointer items-center gap-2 rounded-2xl bg-[#F97316] px-5 py-3 text-xs font-black text-white shadow-lg transition-all hover:bg-orange-600"
          >
            Open My Schedule →
          </a>
          <a
            href="/rbt/simulation"
            className="inline-flex cursor-pointer items-center gap-2 rounded-2xl border-2 border-orange-200 bg-white px-5 py-3 text-xs font-black text-slate-800 shadow-sm transition-all hover:bg-orange-50"
          >
            Practice Simulation
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 text-slate-900 relative">
      <div
        className="relative overflow-hidden rounded-3xl border border-white/10 bg-slate-950 p-5 text-white shadow-2xl"
        role="note"
        aria-label="Simulation safety boundary"
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.16),_transparent_48%)]" />
        <div className="relative flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <span className="font-mono text-[10px] font-black uppercase tracking-[0.18em] text-emerald-300">
              Simulation sandbox
            </span>
            <h2 className="mt-1 font-heading text-lg font-black">
              Fictional training data only
            </h2>
            <p className="mt-1 max-w-2xl text-xs font-semibold leading-relaxed text-slate-300">
              Controls on this screen update only this in-memory practice attempt. They do not write a client chart, EVV visit, session note, authorization, billing claim, or payroll record.
            </p>
          </div>
          <span className="shrink-0 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1.5 font-mono text-[10px] font-black uppercase text-emerald-300">
            No live writes
          </span>
        </div>
      </div>

      <div className="bg-white border-2 border-orange-200 rounded-3xl p-6 shadow-xl space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-orange-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-orange-100 border border-orange-300 text-[#F97316] flex items-center justify-center font-bold shrink-0 shadow-md">
              <Clock className="w-7 h-7 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-black text-slate-900 font-heading">
                  Practice Session Data Collector
                </h2>
                <span className="bg-sky-100 text-sky-800 border border-sky-300 text-[10px] font-black px-2.5 py-0.5 rounded-full flex items-center gap-1">
                  SAMPLE EVV · NOT VERIFIED
                </span>
              </div>
              <p className="text-xs text-slate-600 font-semibold mt-0.5">
                Fictional learner: <strong>Leo Miller (sample ID #SIM-9042)</strong> · Fictional supervisor: <strong>Dr. Sarah Jenkins</strong>
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="bg-orange-50/90 border-2 border-[#F97316] p-2.5 rounded-2xl text-center shadow-md flex items-center gap-3">
              <Clock className="w-5 h-5 text-[#F97316] animate-pulse shrink-0" />
              <div>
                <span className="text-[9px] font-mono font-black text-[#F97316] uppercase block">Practice timer</span>
                <span className="text-sm font-mono font-black text-slate-900">{formatSeconds(sessionSeconds)}</span>
              </div>

              <div className="flex items-center gap-1.5 pl-2 border-l-2 border-orange-200">
                <button
                  type="button"
                  onClick={() => {
                    setIsSessionTimerRunning(true);
                    toast.info('Practice timer started. No EVV visit was opened.');
                  }}
                  aria-pressed={isSessionTimerRunning}
                  data-scribe-id="btn-evv-timer-start"
                  className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase transition-all cursor-pointer ${
                    isSessionTimerRunning ? 'bg-emerald-600 text-white shadow-sm' : 'bg-slate-200 text-slate-700 hover:bg-emerald-600 hover:text-white'
                  }`}
                >
                  ▶️ Start
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsSessionTimerRunning(false);
                    toast.info('Practice timer paused.');
                  }}
                  aria-pressed={!isSessionTimerRunning}
                  className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase transition-all cursor-pointer ${
                    !isSessionTimerRunning ? 'bg-rose-600 text-white shadow-sm' : 'bg-slate-200 text-slate-700 hover:bg-rose-600 hover:text-white'
                  }`}
                >
                  ⏹️ Stop
                </button>
              </div>
            </div>

            <div className="bg-[#F0F7FF] border-2 border-[#BFDBFE] px-4 py-2 rounded-2xl text-center">
              <span className="text-[10px] font-mono font-bold text-slate-500 uppercase block">Sample 97153-HM unit estimate</span>
              <span className="text-sm font-black text-[#F97316]">{billableUnits}.0 practice units ({sessionMinutes} mins)</span>
            </div>

            <button
              type="button"
              onClick={() => {
                toast.info('Supervisor signal practiced. No person was contacted.');
              }}
              data-scribe-id="btn-signal-bcba"
              className="bg-rose-50 hover:bg-rose-100 text-rose-800 border-2 border-rose-200 font-extrabold text-xs px-3.5 py-2.5 rounded-2xl flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
            >
              <AlertTriangle className="w-4 h-4 text-rose-600 animate-pulse" />
              <span>Practice supervisor signal</span>
            </button>

            <button
              type="button"
              onClick={() => setShowBipDrawer(true)}
              data-scribe-id="btn-open-bip"
              className="bg-amber-50 hover:bg-amber-100 text-amber-900 border-2 border-amber-300 font-black text-xs px-4 py-2.5 rounded-2xl flex items-center gap-1.5 transition-all cursor-pointer shadow-sm relative"
            >
              <BookOpen className="w-4 h-4 text-amber-600" />
              <span>BIP Protocol Sheet</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs font-semibold">
          <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 flex justify-between items-center">
            <span className="text-slate-500">Sample CPT code:</span>
            <strong className="text-slate-900">{cptCode}</strong>
          </div>

          <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 flex justify-between items-center">
            <label htmlFor="simulation-location-code" className="text-slate-500">Sample location:</label>
            <select
              id="simulation-location-code"
              value={locationCode}
              onChange={(e) => setLocationCode(e.target.value)}
              className="bg-transparent font-bold text-slate-900 outline-none cursor-pointer"
            >
              <option value="12 - Home">12 - Home</option>
              <option value="03 - School">03 - School</option>
              <option value="11 - Office / Clinic">11 - Office / Clinic</option>
            </select>
          </div>

          <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 flex justify-between items-center">
            <span className="text-slate-500">Authorization example:</span>
            <strong className="text-sky-700 font-black">Sample only · no balance checked</strong>
          </div>
        </div>
      </div>

      {/* 🌟 2. FULL 5-PROCEDURE ABA DATA COLLECTION SUITE */}
      <div className="bg-white border-2 border-orange-200 rounded-3xl p-6 shadow-xl space-y-6">
        <div
          className="flex flex-wrap border-b border-orange-100 pb-3 gap-2"
          role="tablist"
          aria-label="Practice data collection procedures"
        >
          <button
            id="simulation-procedure-tab-DTT"
            type="button"
            role="tab"
            aria-selected={activeProcedureTab === 'DTT'}
            aria-controls="simulation-procedure-panel-DTT"
            tabIndex={activeProcedureTab === 'DTT' ? 0 : -1}
            onClick={() => setActiveProcedureTab('DTT')}
            onKeyDown={(event) => handleProcedureTabKeyDown(event, 'DTT')}
            data-scribe-id="tab-proc-dtt"
            className={`px-4 py-2 rounded-2xl font-heading font-black text-xs transition-all cursor-pointer flex items-center gap-1.5 ${
              activeProcedureTab === 'DTT'
                ? 'bg-[#F97316] text-white shadow-md'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Activity className="w-4 h-4" />
            <span>1. DTT Skill Acquisition</span>
          </button>

          <button
            id="simulation-procedure-tab-TASK_ANALYSIS"
            type="button"
            role="tab"
            aria-selected={activeProcedureTab === 'TASK_ANALYSIS'}
            aria-controls="simulation-procedure-panel-TASK_ANALYSIS"
            tabIndex={activeProcedureTab === 'TASK_ANALYSIS' ? 0 : -1}
            onClick={() => setActiveProcedureTab('TASK_ANALYSIS')}
            onKeyDown={(event) => handleProcedureTabKeyDown(event, 'TASK_ANALYSIS')}
            data-scribe-id="tab-proc-ta"
            className={`px-4 py-2 rounded-2xl font-heading font-black text-xs transition-all cursor-pointer flex items-center gap-1.5 ${
              activeProcedureTab === 'TASK_ANALYSIS'
                ? 'bg-[#F97316] text-white shadow-md'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <ListOrdered className="w-4 h-4" />
            <span>2. Task Analysis (TA Chaining)</span>
          </button>

          <button
            id="simulation-procedure-tab-FREQUENCY_LATENCY"
            type="button"
            role="tab"
            aria-selected={activeProcedureTab === 'FREQUENCY_LATENCY'}
            aria-controls="simulation-procedure-panel-FREQUENCY_LATENCY"
            tabIndex={activeProcedureTab === 'FREQUENCY_LATENCY' ? 0 : -1}
            onClick={() => setActiveProcedureTab('FREQUENCY_LATENCY')}
            onKeyDown={(event) => handleProcedureTabKeyDown(event, 'FREQUENCY_LATENCY')}
            data-scribe-id="tab-proc-freq"
            className={`px-4 py-2 rounded-2xl font-heading font-black text-xs transition-all cursor-pointer flex items-center gap-1.5 ${
              activeProcedureTab === 'FREQUENCY_LATENCY'
                ? 'bg-[#F97316] text-white shadow-md'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>3. Frequency &amp; Latency Timers</span>
          </button>

          <button
            id="simulation-procedure-tab-INTERVAL"
            type="button"
            role="tab"
            aria-selected={activeProcedureTab === 'INTERVAL'}
            aria-controls="simulation-procedure-panel-INTERVAL"
            tabIndex={activeProcedureTab === 'INTERVAL' ? 0 : -1}
            onClick={() => setActiveProcedureTab('INTERVAL')}
            onKeyDown={(event) => handleProcedureTabKeyDown(event, 'INTERVAL')}
            data-scribe-id="tab-proc-interval"
            className={`px-4 py-2 rounded-2xl font-heading font-black text-xs transition-all cursor-pointer flex items-center gap-1.5 ${
              activeProcedureTab === 'INTERVAL'
                ? 'bg-[#F97316] text-white shadow-md'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Grid className="w-4 h-4" />
            <span>4. Discontinuous Interval Grid (PIR/WIR)</span>
          </button>

          <button
            id="simulation-procedure-tab-ABC"
            type="button"
            role="tab"
            aria-selected={activeProcedureTab === 'ABC'}
            aria-controls="simulation-procedure-panel-ABC"
            tabIndex={activeProcedureTab === 'ABC' ? 0 : -1}
            onClick={() => setActiveProcedureTab('ABC')}
            onKeyDown={(event) => handleProcedureTabKeyDown(event, 'ABC')}
            data-scribe-id="tab-proc-abc"
            className={`px-4 py-2 rounded-2xl font-heading font-black text-xs transition-all cursor-pointer flex items-center gap-1.5 ${
              activeProcedureTab === 'ABC'
                ? 'bg-[#F97316] text-[#F97316] text-white shadow-md'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Flame className="w-4 h-4" />
            <span>5. ABC Behavior Logger</span>
          </button>
        </div>

        {activeProcedureTab === 'DTT' && (
          <div
            id="simulation-procedure-panel-DTT"
            role="tabpanel"
            aria-labelledby="simulation-procedure-tab-DTT"
            className="grid grid-cols-1 lg:grid-cols-3 gap-6"
          >
            <div className="lg:col-span-2 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
                <div>
                  <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider block">Active Skill Target:</span>
                  <select
                    id="simulation-goal-select"
                    aria-label="Fictional practice skill target"
                    value={selectedGoal}
                    onChange={(e) => setSelectedGoal(e.target.value)}
                    data-scribe-id="dtt-goal-select"
                    className="text-base font-black text-slate-900 font-heading bg-transparent outline-none cursor-pointer"
                  >
                    <option value="Goal 1: Manding for Desired Items">Goal 1: Manding for Desired Items</option>
                    <option value="Goal 2: Receptive Identification of Body Parts">Goal 2: Receptive Identification of Body Parts</option>
                    <option value="Goal 3: Expressive Labeling of Actions">Goal 3: Expressive Labeling of Actions</option>
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  {itiCountdown > 0 && (
                    <div className="bg-amber-100 border border-amber-300 text-amber-900 px-3 py-1 rounded-2xl text-[10px] font-mono font-black flex items-center gap-1 animate-pulse">
                      <Clock className="w-3 h-3 text-amber-600" /> ITI Delay: {itiCountdown}s
                    </div>
                  )}

                  <div data-scribe-id="dtt-mastery-box" className="bg-emerald-50 border-2 border-emerald-200 px-3.5 py-1.5 rounded-2xl text-right shrink-0">
                    <span className="text-[10px] font-mono font-bold text-emerald-700 block">Practice response rate</span>
                    <span className="text-xs font-black text-emerald-800">{responseRatePercent}% ({successfulGoalTrials}/{totalGoalTrials.length} Trials)</span>
                  </div>
                </div>
              </div>

              {/* PROMPT LEVEL SELECTOR */}
              <div className="space-y-2">
                <label className="text-xs font-black text-slate-900 uppercase tracking-wide block">Select Prompt Level (When Prompted):</label>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs font-bold">
                  {(['VERBAL', 'GESTURAL', 'MODEL', 'PARTIAL_PHYSICAL', 'FULL_PHYSICAL'] as PromptLevel[]).map((level) => (
                    <button
                      key={level}
                      type="button"
                      onClick={() => setActivePromptLevel(level)}
                      aria-pressed={activePromptLevel === level}
                      data-scribe-id={level === 'VERBAL' ? 'prompt-level-verbal' : undefined}
                      className={`p-2.5 rounded-xl border-2 transition-all cursor-pointer text-[11px] ${
                        activePromptLevel === level
                          ? 'bg-amber-500 border-amber-600 text-white shadow-md'
                          : 'bg-slate-50 border-slate-200 text-slate-700 hover:border-amber-300'
                      }`}
                    >
                      {level.replace('_', ' ')}
                    </button>
                  ))}
                </div>
              </div>

              {/* TRIAL RECORD BUTTONS */}
              <div className="grid grid-cols-3 gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => handleLogTrial('CORRECT')}
                  data-scribe-id="btn-log-correct"
                  className="bg-emerald-500 hover:bg-emerald-600 text-white font-black text-xs py-4 rounded-2xl shadow-lg cursor-pointer transition-all"
                >
                  + Independent (+)
                </button>

                <button
                  type="button"
                  onClick={() => handleLogTrial('PROMPTED')}
                  data-scribe-id="btn-log-prompted"
                  className="bg-amber-500 hover:bg-amber-600 text-white font-black text-xs py-4 rounded-2xl shadow-lg cursor-pointer transition-all"
                >
                  + Prompted (+P: {activePromptLevel.replace('_', ' ')})
                </button>

                <button
                  type="button"
                  onClick={() => handleLogTrial('INCORRECT')}
                  className="bg-rose-500 hover:bg-rose-600 text-white font-black text-xs py-4 rounded-2xl shadow-lg cursor-pointer transition-all"
                >
                  - Incorrect (-)
                </button>
              </div>
            </div>

            {/* RECENT TRIAL LOG FEED */}
            <div className="bg-slate-50 border-2 border-slate-200 rounded-3xl p-5 space-y-3">
              <h3 className="text-xs font-black text-slate-900 font-heading border-b border-slate-200 pb-2 flex items-center justify-between">
                <span>Trial Log Feed</span>
                <span className="font-mono text-[#F97316]">{trials.length} Recorded</span>
              </h3>

              <div className="space-y-2 max-h-[220px] overflow-y-auto custom-scrollbar pr-1">
                {trials.slice().reverse().map((t) => (
                  <div key={t.id} className="p-2 rounded-xl border border-slate-200 bg-white flex items-center justify-between text-xs font-semibold">
                    <span className="text-slate-900 font-bold truncate max-w-[130px]">{t.targetGoal}</span>
                    <span className={`text-[9px] font-mono font-black px-2 py-0.5 rounded border ${
                      t.response === 'CORRECT'
                        ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                        : t.response === 'PROMPTED'
                        ? 'bg-amber-100 text-amber-900 border-amber-300'
                        : 'bg-rose-100 text-rose-800 border-rose-300'
                    }`}>
                      {t.response} {t.promptLevel ? `(${t.promptLevel})` : ''}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* PROCEDURE 2: TASK ANALYSIS STEP-CHAINING */}
        {activeProcedureTab === 'TASK_ANALYSIS' && (
          <div
            id="simulation-procedure-panel-TASK_ANALYSIS"
            role="tabpanel"
            aria-labelledby="simulation-procedure-tab-TASK_ANALYSIS"
            className="space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h4 className="text-sm font-black text-slate-900 font-heading">Handwashing 7-Step Task Analysis Chain</h4>
                <p className="text-xs text-slate-500 font-semibold">Score each step as Independent (+) or Prompted (+P) during the handwashing routine.</p>
              </div>
              <span className="bg-blue-100 text-blue-800 font-mono text-[10px] font-black px-2.5 py-0.5 rounded-full">
                PRACTICE INDEPENDENCE: {taIndependentPercent}%
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {taSteps.map((step) => (
                <div key={step.id} className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-between gap-3 text-xs">
                  <div className="space-y-0.5">
                    <span className="text-[10px] font-mono font-bold text-slate-400 block">Step {step.stepNumber}</span>
                    <strong className="text-slate-900">{step.instruction}</strong>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleUpdateTaStep(step.id, 'INDEPENDENT')}
                      className={`px-2.5 py-1 rounded-xl text-[10px] font-black transition-all cursor-pointer ${
                        step.status === 'INDEPENDENT'
                          ? 'bg-emerald-500 text-white shadow-sm'
                          : 'bg-slate-200 text-slate-700 hover:bg-emerald-100'
                      }`}
                    >
                      + IND
                    </button>
                    <button
                      type="button"
                      onClick={() => handleUpdateTaStep(step.id, 'PROMPTED')}
                      className={`px-2.5 py-1 rounded-xl text-[10px] font-black transition-all cursor-pointer ${
                        step.status === 'PROMPTED'
                          ? 'bg-amber-500 text-white shadow-sm'
                          : 'bg-slate-200 text-slate-700 hover:bg-amber-100'
                      }`}
                    >
                      +P PROMPT
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* PROCEDURE 3: FREQUENCY & LATENCY TIMERS */}
        {activeProcedureTab === 'FREQUENCY_LATENCY' && (
          <div
            id="simulation-procedure-panel-FREQUENCY_LATENCY"
            role="tabpanel"
            aria-labelledby="simulation-procedure-tab-FREQUENCY_LATENCY"
            className="grid grid-cols-1 sm:grid-cols-3 gap-4"
          >
            <div className="p-5 bg-slate-50 border-2 border-slate-200 rounded-3xl space-y-3 text-center">
              <span className="text-xs font-mono font-bold text-slate-500 uppercase block">Spontaneous Vocal Mands</span>
              <span className="text-4xl font-black font-mono text-[#F97316]">{mandCount}</span>
              <div className="flex justify-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setMandCount(prev => Math.max(0, prev - 1));
                    markPracticeEvidence('measurement');
                  }}
                  className="cursor-pointer px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 font-black rounded-xl text-xs"
                >
                  - 1
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMandCount(prev => prev + 1);
                    markPracticeEvidence('measurement');
                    toast.success('+1 practice spontaneous mand logged.');
                  }}
                  className="cursor-pointer px-6 py-2 bg-[#F97316] hover:bg-orange-600 text-white font-black rounded-xl text-xs shadow-md"
                >
                  + 1 Mand
                </button>
              </div>
            </div>

            <div className="p-5 bg-slate-50 border-2 border-slate-200 rounded-3xl space-y-3 text-center">
              <span className="text-xs font-mono font-bold text-slate-500 uppercase block">Peer Initiated Vocalizations</span>
              <span className="text-4xl font-black font-mono text-blue-600">{vocalInitCount}</span>
              <div className="flex justify-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setVocalInitCount(prev => Math.max(0, prev - 1));
                    markPracticeEvidence('measurement');
                  }}
                  className="cursor-pointer px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 font-black rounded-xl text-xs"
                >
                  - 1
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setVocalInitCount(prev => prev + 1);
                    markPracticeEvidence('measurement');
                    toast.success('+1 practice peer vocalization logged.');
                  }}
                  className="cursor-pointer px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-xl text-xs shadow-md"
                >
                  + 1 Vocalization
                </button>
              </div>
            </div>

            {/* LATENCY TIMING STOPWATCH */}
            <div className="p-5 bg-purple-50 border-2 border-purple-200 rounded-3xl space-y-3 text-center">
              <span className="text-xs font-mono font-bold text-purple-900 uppercase block">Latency Stopwatch (SD → Response)</span>
              <span className="text-4xl font-black font-mono text-purple-700">{latencySeconds}s</span>
              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleToggleLatencyTimer}
                  aria-pressed={isLatencyTimerRunning}
                  className={`w-full py-2.5 rounded-xl font-black text-xs transition-all cursor-pointer ${
                    isLatencyTimerRunning
                      ? 'bg-purple-700 text-white animate-pulse'
                      : 'bg-purple-600 text-white hover:bg-purple-700 shadow-md'
                  }`}
                >
                  {isLatencyTimerRunning ? '⏹️ Stop & Record Latency' : '⏱️ Give SD & Start Latency'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* PROCEDURE 4: DISCONTINUOUS INTERVAL RECORDING (PIR/WIR/MTS) */}
        {activeProcedureTab === 'INTERVAL' && (
          <div
            id="simulation-procedure-panel-INTERVAL"
            role="tabpanel"
            aria-labelledby="simulation-procedure-tab-INTERVAL"
            className="space-y-4"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h4 className="text-sm font-black text-slate-900 font-heading">Discontinuous Interval Recording Grid</h4>
                <p className="text-xs text-slate-500 font-semibold">Toggle interval boxes when target behavior occurs during interval window.</p>
              </div>

              <div className="flex items-center gap-2 font-xs font-bold">
                {(['PARTIAL_INTERVAL', 'WHOLE_INTERVAL', 'MOMENTARY_TIME_SAMPLING'] as const).map(mode => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setIntervalMode(mode)}
                    aria-pressed={intervalMode === mode}
                    className={`cursor-pointer px-3 py-1 rounded-xl text-[10px] font-mono font-black ${
                      intervalMode === mode ? 'bg-purple-600 text-white' : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {mode.replace(/_/g, ' ')}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
              {intervalGrid.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setIntervalGrid(prev => prev.map(x => x.id === item.id ? { ...x, active: !x.active } : x));
                    markPracticeEvidence('interval');
                    toast.info(`Practice interval #${item.id}: ${!item.active ? 'PRESENT (+)' : 'ABSENT (-)'}.`);
                  }}
                  aria-pressed={item.active}
                  className={`p-4 rounded-2xl border-2 text-center transition-all cursor-pointer ${
                    item.active
                      ? 'bg-purple-600 border-purple-700 text-white shadow-md'
                      : 'bg-slate-50 border-slate-200 text-slate-400 hover:border-purple-300'
                  }`}
                >
                  <span className="text-[10px] font-mono font-bold block opacity-80">Interval #{item.id}</span>
                  <span className="text-lg font-black font-mono">{item.active ? '✓ PRESENT' : '- ABSENT'}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* PROCEDURE 5: ABC MALADAPTIVE BEHAVIOR LOGGER */}
        {activeProcedureTab === 'ABC' && (
          <div
            id="simulation-procedure-panel-ABC"
            role="tabpanel"
            aria-labelledby="simulation-procedure-tab-ABC"
            className="space-y-4"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <h3 className="text-sm font-black text-slate-900 font-heading flex items-center gap-2">
                <Flame className="w-5 h-5 text-rose-500" /> ABC Incident Logger &amp; Incident Stopwatch
              </h3>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleToggleBehaviorTimer}
                  aria-pressed={isBehaviorTimerRunning}
                  className={`px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer ${
                    isBehaviorTimerRunning
                      ? 'bg-rose-600 text-white animate-pulse'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-300'
                  }`}
                >
                  <TimerIcon className="w-3.5 h-3.5" />
                  <span>{isBehaviorTimerRunning ? `Stopwatch: ${behaviorTimerSeconds}s (Stop)` : '⏱️ Start Behavior Timer'}</span>
                </button>
                <span className="text-xs font-mono font-bold text-slate-500">{abcEvents.length} Incidents Logged</span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <label htmlFor="simulation-abc-antecedent" className="text-xs font-bold text-slate-800 block">Antecedent (A)</label>
                <select
                  id="simulation-abc-antecedent"
                  value={antecedent}
                  onChange={(e) => setAntecedent(e.target.value)}
                  className="w-full bg-[#F0F7FF] border-2 border-[#BFDBFE] rounded-2xl p-3 text-xs text-slate-900 font-bold outline-none focus:border-[#F97316]"
                >
                  <option value="Demand Placed">Demand Placed</option>
                  <option value="SD Given">SD Given</option>
                  <option value="Denied Access to Item">Denied Access to Item</option>
                  <option value="Transition / Change in Activity">Transition / Change in Activity</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="simulation-abc-behavior" className="text-xs font-bold text-slate-800 block">Behavior (B)</label>
                <select
                  id="simulation-abc-behavior"
                  value={behavior}
                  onChange={(e) => setBehavior(e.target.value)}
                  className="w-full bg-[#F0F7FF] border-2 border-[#BFDBFE] rounded-2xl p-3 text-xs text-slate-900 font-bold outline-none focus:border-[#F97316]"
                >
                  <option value="Elopement / Running Away">Elopement / Running Away</option>
                  <option value="Physical Aggression (Hitting/Kicking)">Physical Aggression (Hitting/Kicking)</option>
                  <option value="Tantrum / Screaming">Tantrum / Screaming</option>
                  <option value="Property Destruction">Property Destruction</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="simulation-abc-consequence" className="text-xs font-bold text-slate-800 block">Consequence (C)</label>
                <select
                  id="simulation-abc-consequence"
                  value={consequence}
                  onChange={(e) => setConsequence(e.target.value)}
                  className="w-full bg-[#F0F7FF] border-2 border-[#BFDBFE] rounded-2xl p-3 text-xs text-slate-900 font-bold outline-none focus:border-[#F97316]"
                >
                  <option value="Response Block &amp; Redirection">Response Block &amp; Redirection</option>
                  <option value="Extinction Protocol">Extinction Protocol</option>
                  <option value="Brief 2-Min Break Given">Brief 2-Min Break Given</option>
                  <option value="FCT Replacement Prompt">FCT Replacement Prompt</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={handleLogAbcEvent}
                data-scribe-id="btn-log-abc"
                className="bg-rose-500 hover:bg-rose-600 text-white font-black text-xs px-6 py-3 rounded-2xl shadow-md cursor-pointer transition-all"
              >
                + Log ABC Behavior Incident {behaviorTimerSeconds > 0 ? `(${behaviorTimerSeconds}s)` : ''}
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="bg-white border-2 border-orange-200 rounded-3xl p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-orange-100 pb-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-emerald-600" />
            <h3 className="text-base font-black text-slate-900 font-heading">
              Training completion checklist
            </h3>
          </div>

          <span className={`text-xs font-mono font-black px-3.5 py-1 rounded-full border ${
            simulationReadiness.ready
              ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
              : 'bg-amber-100 text-amber-900 border-amber-300'
          }`}>
            {simulationReadiness.ready
              ? '6/6 PRACTICE CHECKS COMPLETE'
              : `${simulationReadiness.completed}/${simulationReadiness.total} PRACTICE CHECKS`}
          </span>
        </div>

        <p className="text-xs font-semibold leading-relaxed text-slate-600">
          Seeded examples do not count. Use each practice tool at least once, then type the fictional caregiver acknowledgment below.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs font-semibold">
          {[
            { label: '1. Log a new DTT trial', done: practiceEvidence.dtt },
            { label: '2. Score a task-analysis step', done: practiceEvidence.taskAnalysis },
            { label: '3. Use frequency or latency', done: practiceEvidence.measurement },
            { label: '4. Toggle an interval', done: practiceEvidence.interval },
            { label: '5. Log a practice ABC event', done: practiceEvidence.abc },
            { label: '6. Type practice acknowledgment', done: parentSignature.trim().length >= 2 },
          ].map((item) => (
            <div
              key={item.label}
              className={`rounded-2xl border p-3 ${
                item.done
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                  : 'border-slate-200 bg-slate-50 text-slate-600'
              }`}
            >
              <span className="block font-mono text-[10px] font-bold">
                {item.done ? '✓ COMPLETE' : '○ NOT YET'}
              </span>
              <strong>{item.label}</strong>
            </div>
          ))}
        </div>
      </div>

      <form onSubmit={handleFinishPracticeAttempt} className="bg-white border-2 border-orange-200 rounded-3xl p-6 sm:p-8 space-y-6 shadow-xl">
        <div className="flex items-center justify-between border-b border-orange-100 pb-4">
          <div>
            <h3 className="text-lg font-black text-slate-900 font-heading flex items-center gap-2">
              <FileText className="w-5 h-5 text-[#F97316]" /> Practice SOAP Note Builder
            </h3>
            <p className="text-xs text-slate-600 font-semibold mt-0.5">
              Edit the fictional narrative to practice the workflow. Nothing here becomes part of a client chart.
            </p>
          </div>

          <span className="bg-blue-100 text-blue-900 border border-blue-300 text-[10px] font-black px-3 py-1 rounded-full uppercase">
            Local draft · not a chart note
          </span>
        </div>

        {/* SOAP SECTIONS WITH QUICK CHIPS */}
        <div className="space-y-4">
          {/* SUBJECTIVE (S) */}
          <div className="space-y-2">
            <label htmlFor="simulation-subjective-note" className="text-xs font-bold text-slate-800 block">S (Subjective) Sample Narrative &amp; Quick-Chips</label>
            <div className="flex flex-wrap gap-1.5 text-[11px] font-semibold">
              <button
                type="button"
                onClick={() => setSubjectiveNote('Client arrived alert, happy, and engaged. Caregiver reported adequate sleep.')}
                data-scribe-id="chip-soap-subjective"
                className="px-2.5 py-1 rounded-xl bg-orange-50 border border-orange-200 text-[#F97316] hover:bg-orange-100 cursor-pointer"
              >
                + Alert &amp; Happy
              </button>
              <button
                type="button"
                onClick={() => setSubjectiveNote('Client arrived tired. Caregiver reported interrupted sleep and routine transition.')}
                className="px-2.5 py-1 rounded-xl bg-slate-100 border border-slate-200 text-slate-700 hover:bg-slate-200 cursor-pointer"
              >
                + Tired / Slow Transition
              </button>
            </div>
            <textarea
              id="simulation-subjective-note"
              value={subjectiveNote}
              onChange={(e) => setSubjectiveNote(e.target.value)}
              rows={2}
              className="w-full bg-[#F0F7FF] border-2 border-[#BFDBFE] rounded-2xl p-3 text-xs text-slate-900 font-bold outline-none focus:border-[#F97316]"
            />
          </div>

          {/* OBJECTIVE (O) AUTO-CALCULATED */}
          <div className="space-y-2">
            <p className="text-xs font-bold text-slate-800">O (Objective) Practice Summary</p>
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-slate-800 font-semibold space-y-1">
              <p>Practice log contains <strong>{trials.length} DTT trials</strong>; the selected target has a <strong>{responseRatePercent}% prompted-or-independent response rate</strong>.</p>
              <p>The sample handwashing chain is <strong>{taIndependentPercent}% independent</strong>. Practice counters show <strong>{mandCount} spontaneous mands</strong> and <strong>{abcEvents.length} ABC events</strong>.</p>
            </div>
          </div>

          {/* ASSESSMENT (A) */}
          <div className="space-y-2">
            <label htmlFor="simulation-assessment-note" className="text-xs font-bold text-slate-800 block">A (Assessment) Sample Interpretation</label>
            <div className="flex flex-wrap gap-1.5 text-[11px] font-semibold">
              <button
                type="button"
                onClick={() => setAssessmentNote('Client demonstrated strong manding progress. Prompt fading from verbal to gestural was effective.')}
                className="px-2.5 py-1 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 hover:bg-emerald-100 cursor-pointer"
              >
                + Strong Progress &amp; Fading
              </button>
              <button
                type="button"
                onClick={() => setAssessmentNote('Client required physical guidance for task chain steps due to fatigue.')}
                className="px-2.5 py-1 rounded-xl bg-slate-100 border border-slate-200 text-slate-700 hover:bg-slate-200 cursor-pointer"
              >
                + High Prompt Requirement
              </button>
            </div>
            <textarea
              id="simulation-assessment-note"
              value={assessmentNote}
              onChange={(e) => setAssessmentNote(e.target.value)}
              rows={2}
              className="w-full bg-[#F0F7FF] border-2 border-[#BFDBFE] rounded-2xl p-3 text-xs text-slate-900 font-bold outline-none focus:border-[#F97316]"
            />
          </div>

          {/* PLAN (P) */}
          <div className="space-y-2">
            <label htmlFor="simulation-plan-note" className="text-xs font-bold text-slate-800 block">P (Plan) Sample Next Step</label>
            <textarea
              id="simulation-plan-note"
              value={planNote}
              onChange={(e) => setPlanNote(e.target.value)}
              rows={2}
              className="w-full bg-[#F0F7FF] border-2 border-[#BFDBFE] rounded-2xl p-3 text-xs text-slate-900 font-bold outline-none focus:border-[#F97316]"
            />
          </div>
        </div>

        {/* DUAL E-SIGNATURES */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-2 border-t border-slate-100">
          <div className="space-y-2">
            <label htmlFor="simulation-rbt-name" className="text-xs font-bold text-slate-800 block">Fictional trainee name</label>
            <input
              id="simulation-rbt-name"
              type="text"
              value={rbtSignature}
              onChange={(e) => setRbtSignature(e.target.value)}
              className="w-full bg-[#F0F7FF] border-2 border-[#BFDBFE] rounded-2xl p-3 text-xs text-slate-900 font-bold outline-none focus:border-[#F97316]"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="simulation-caregiver-name" className="text-xs font-bold text-slate-800 block flex items-center justify-between">
              <span>Fictional caregiver acknowledgment *</span>
              <span className="text-[10px] text-orange-600 font-black font-mono">TRAINING INPUT ONLY</span>
            </label>
            <input
              id="simulation-caregiver-name"
              type="text"
              value={parentSignature}
              onChange={(e) => setParentSignature(e.target.value)}
              data-scribe-id="input-parent-signature"
              placeholder="Type the sample name Elena Miller…"
              className="w-full bg-[#F0F7FF] border-2 border-[#BFDBFE] rounded-2xl p-3 text-xs text-slate-900 font-bold outline-none focus:border-[#F97316]"
            />
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <Button
            type="submit"
            disabled={isNoteSubmitted || !simulationReadiness.ready}
            data-scribe-id="btn-finish-simulation"
            className="bg-[#F97316] hover:bg-orange-600 text-white font-black text-sm px-8 py-4 rounded-2xl shadow-xl transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 disabled:pointer-events-auto"
          >
            {isNoteSubmitted
              ? 'Saving training progress…'
              : simulationReadiness.ready
                ? 'Finish Practice Attempt (No Live Submission)'
                : `Complete Practice Checks (${simulationReadiness.completed}/${simulationReadiness.total})`}
          </Button>
        </div>
      </form>

      {/* SLIDE-OUT BIP PROTOCOL DRAWER */}
      {showBipDrawer && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex justify-end">
          <div
            ref={bipDrawerRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby="simulation-bip-title"
            className="bg-white max-w-md w-full h-full p-6 space-y-6 overflow-y-auto custom-scrollbar shadow-2xl animate-fade-in text-slate-900 outline-none"
          >
            <div className="flex items-center justify-between border-b border-orange-200 pb-4">
              <h3 id="simulation-bip-title" className="text-lg font-black text-slate-900 font-heading flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-amber-600" /> Fictional BIP Training Example
              </h3>
              <button
                type="button"
                onClick={() => setShowBipDrawer(false)}
                aria-label="Close fictional BIP example"
                className="text-slate-400 hover:text-slate-700 font-bold text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-xs font-semibold text-slate-800">
              <p className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sky-900">
                Simulation only. This sample is not a client plan and must never guide live care.
              </p>
              <div className="p-4 bg-orange-50 rounded-2xl border border-orange-200 space-y-1">
                <h4 className="font-black text-[#F97316]">Goal 1: Manding for Items</h4>
                <p>Provide 3-second delay after SD. If no response, prompt with Verbal model (&quot;I want toy&quot;). Fading rule: Fade to Gestural after 3 consecutive independent successes.</p>
              </div>

              <div className="p-4 bg-rose-50 rounded-2xl border border-rose-200 space-y-1">
                <h4 className="font-black text-rose-700">Elopement De-escalation Protocol</h4>
                <p>Antecedent strategy: Give 2-minute transition countdown warnings. Consequence: Block path calmly without eye contact, prompt FCT &quot;I need break&quot;.</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
