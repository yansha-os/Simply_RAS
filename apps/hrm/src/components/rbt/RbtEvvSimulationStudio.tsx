'use client';

import React, { useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock,
  FileText,
  Loader2,
  MapPin,
  Navigation,
  PenTool,
  Play,
  Plus,
  ShieldCheck,
  Sparkles,
  Target,
  User,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';

interface RbtEvvSimulationStudioProps {
  onComplete: () => Promise<void>;
  isSaving: boolean;
}

type SimStage =
  | '1_CLOCK_IN'
  | '2_DATA_COLLECTION'
  | '3_SESSION_NOTE'
  | '4_CLOCK_OUT'
  | '5_SUBMIT_REVIEW';

export function RbtEvvSimulationStudio({
  onComplete,
  isSaving,
}: RbtEvvSimulationStudioProps) {
  const [currentStage, setCurrentStage] = useState<SimStage>('1_CLOCK_IN');
  const [clockInDone, setClockInDone] = useState(false);
  const [clockInTime, setClockInTime] = useState<string | null>(null);
  const [, setGpsVerified] = useState(false);
  const [isVerifyingGps, setIsVerifyingGps] = useState(false);

  // Stage 2 Data Collection States
  const [dttTrials, setDttTrials] = useState<{ id: number; result: 'CORRECT' | 'PROMPTED' | 'INCORRECT' }[]>([
    { id: 1, result: 'CORRECT' },
    { id: 2, result: 'PROMPTED' },
  ]);
  const [frequencyCount, setFrequencyCount] = useState(2);
  const [taSteps, setTaSteps] = useState([
    { id: 1, label: '1. Turn on warm water faucet', done: true },
    { id: 2, label: '2. Wet both hands and pump 1 squirt of soap', done: true },
    { id: 3, label: '3. Rub palms, backs of hands, and fingers for 20s', done: false },
    { id: 4, label: '4. Rinse all soap bubbles under running water', done: false },
    { id: 5, label: '5. Dry hands completely with clean paper towel', done: false },
  ]);
  // Stage 3 Session Note States
  const [noteNarrative, setNoteNarrative] = useState(
    'Client engaged well throughout the 2-hour 1:1 direct ABA session. Client achieved 80% independent responding on Expressive Labeling targets. Low-intensity vocal non-compliance was observed during transition to tabletop task; differential reinforcement (DRA) and visual schedule prompt were successfully applied with zero physical aggression.'
  );
  const [clientMood, setClientMood] = useState<'Cooperative & Engaged' | 'Fatigued' | 'Heightened Non-Compliance'>('Cooperative & Engaged');
  const [caregiverPresent, setCaregiverPresent] = useState(true);

  // Stage 4 Clock-Out & Signatures States
  const [caregiverSigned, setCaregiverSigned] = useState(false);
  const [rbtSigned, setRbtSigned] = useState(false);

  const handleVerifyGpsAndClockIn = () => {
    setIsVerifyingGps(true);
    setTimeout(() => {
      setIsVerifyingGps(false);
      setGpsVerified(true);
      setClockInDone(true);
      const now = new Date();
      setClockInTime(
        now.toLocaleTimeString('en-US', {
          timeZone: 'America/New_York',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        })
      );
      toast.success('EVV GPS Verified! Clock-in timestamp recorded (America/New_York).');
    }, 900);
  };

  const handleAddDttTrial = (result: 'CORRECT' | 'PROMPTED' | 'INCORRECT') => {
    setDttTrials((prev) => [...prev, { id: prev.length + 1, result }]);
    toast.success(`DTT Trial logged: ${result === 'CORRECT' ? '+ Independent' : result === 'PROMPTED' ? 'P Prompted' : '- Incorrect'}`);
  };

  const handleToggleTa = (id: number) => {
    setTaSteps((prev) =>
      prev.map((step) => (step.id === id ? { ...step, done: !step.done } : step))
    );
  };

  const dttCorrectCount = dttTrials.filter((t) => t.result === 'CORRECT').length;
  const dttAccuracy = dttTrials.length > 0 ? Math.round((dttCorrectCount / dttTrials.length) * 100) : 0;
  const taCompletedCount = taSteps.filter((s) => s.done).length;

  const stageOrder: SimStage[] = [
    '1_CLOCK_IN',
    '2_DATA_COLLECTION',
    '3_SESSION_NOTE',
    '4_CLOCK_OUT',
    '5_SUBMIT_REVIEW',
  ];

  const currentStageIndex = stageOrder.indexOf(currentStage);

  return (
    <div className="space-y-6">
      {/* STEP PROGRESS BAR */}
      <nav
        aria-label="Simulation Workflow Steps"
        className="overflow-hidden rounded-3xl border border-[#E2D5B7] bg-[#FFFDF8] p-4 shadow-xl sm:p-6"
      >
        <div className="flex flex-col justify-between gap-4 border-b border-[#E2D5B7] pb-4 sm:flex-row sm:items-center">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-orange-100 text-[#F97316]">
                <Zap className="h-4 w-4" />
              </span>
              <h2 className="font-heading text-base font-black text-slate-900 sm:text-lg">
                Interactive EVV &amp; Session Note Simulator
              </h2>
            </div>
            <p className="mt-0.5 text-xs font-semibold text-slate-600">
              Follow the 5-step clinical workflow to practice real-world EVV clock-in, trial tracking, and note submission.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="rounded-full border border-orange-300 bg-orange-100 px-3 py-1 font-mono text-[10px] font-black uppercase text-[#C2410C]">
              Step {currentStageIndex + 1} of 5
            </span>
          </div>
        </div>

        {/* Stepper Dots */}
        <div className="mt-4 grid grid-cols-5 gap-2 text-center">
          {[
            { key: '1_CLOCK_IN', label: '1. EVV Clock-In', icon: MapPin },
            { key: '2_DATA_COLLECTION', label: '2. Data Entry', icon: Target },
            { key: '3_SESSION_NOTE', label: '3. Clinical Note', icon: FileText },
            { key: '4_CLOCK_OUT', label: '4. EVV Clock-Out', icon: PenTool },
            { key: '5_SUBMIT_REVIEW', label: '5. Submit to BCBA', icon: ShieldCheck },
          ].map((item, idx) => {
            const Icon = item.icon;
            const isCurrent = currentStage === item.key;
            const isDone = currentStageIndex > idx;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => {
                  if (idx <= currentStageIndex || clockInDone) {
                    setCurrentStage(item.key as SimStage);
                  }
                }}
                className={`flex flex-col items-center gap-1.5 rounded-2xl border p-2.5 transition-all ${
                  isCurrent
                    ? 'border-[#F97316] bg-orange-50 shadow-md ring-2 ring-orange-500/20'
                    : isDone
                      ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                      : 'border-[#E2D5B7] bg-[#F9F5EC]/50 text-slate-500 opacity-60'
                }`}
              >
                <div
                  className={`flex h-7 w-7 items-center justify-center rounded-xl ${
                    isCurrent
                      ? 'bg-orange-500 text-white'
                      : isDone
                        ? 'bg-emerald-500 text-white'
                        : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  {isDone ? <Check className="h-4 w-4" /> : <Icon className="h-3.5 w-3.5" />}
                </div>
                <span className="hidden font-heading text-[11px] font-black sm:inline">
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* STAGE 1: EVV CLOCK-IN */}
      {currentStage === '1_CLOCK_IN' && (
        <section className="space-y-6 rounded-3xl border border-[#E2D5B7] bg-[#FFFDF8] p-6 shadow-xl sm:p-8">
          <div className="flex items-start justify-between gap-4 border-b border-[#E2D5B7] pb-5">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-300 bg-sky-100 px-3 py-1 font-mono text-[10px] font-black uppercase text-sky-800">
                <Navigation className="h-3 w-3" />
                Step 1 · Electronic Visit Verification (EVV)
              </span>
              <h3 className="mt-2 font-heading text-xl font-black text-slate-900 sm:text-2xl">
                Arrive on Site &amp; Verify GPS Location
              </h3>
              <p className="mt-1 text-xs font-semibold text-slate-600">
                In New York Medicaid &amp; commercial ABA billing, EVV requires GPS geofence verification and exact Eastern Time recording when starting therapy.
              </p>
            </div>
          </div>

          {/* Client & Session Info Card */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-[#E2D5B7] bg-[#F9F5EC] p-4">
              <span className="flex items-center gap-1.5 font-mono text-[10px] font-black uppercase text-slate-500">
                <User className="h-3.5 w-3.5 text-[#F97316]" />
                Client
              </span>
              <p className="mt-1 font-heading text-base font-black text-slate-900">Leo Miller</p>
              <p className="text-[11px] font-semibold text-slate-600">Age 6 · ASD Level 2</p>
            </div>

            <div className="rounded-2xl border border-[#E2D5B7] bg-[#F9F5EC] p-4">
              <span className="flex items-center gap-1.5 font-mono text-[10px] font-black uppercase text-slate-500">
                <Clock className="h-3.5 w-3.5 text-[#F97316]" />
                Scheduled Appointment
              </span>
              <p className="mt-1 font-heading text-base font-black text-[#C2410C]">3:30 PM – 5:30 PM</p>
              <p className="text-[11px] font-semibold text-slate-600">2.0 hrs · 8 Units (97153)</p>
            </div>

            <div className="rounded-2xl border border-[#E2D5B7] bg-[#F9F5EC] p-4">
              <span className="flex items-center gap-1.5 font-mono text-[10px] font-black uppercase text-slate-500">
                <MapPin className="h-3.5 w-3.5 text-emerald-600" />
                Location
              </span>
              <p className="mt-1 font-heading text-base font-black text-slate-900">12 - Home</p>
              <p className="text-[11px] font-semibold text-slate-600">Brooklyn, NY · 11201</p>
            </div>

            <div className="rounded-2xl border border-[#E2D5B7] bg-[#F9F5EC] p-4">
              <span className="flex items-center gap-1.5 font-mono text-[10px] font-black uppercase text-slate-500">
                <ShieldCheck className="h-3.5 w-3.5 text-purple-600" />
                Supervisor
              </span>
              <p className="mt-1 font-heading text-base font-black text-slate-900">Dr. Sarah Jenkins</p>
              <p className="text-[11px] font-semibold text-slate-600">BCBA-D · Clinical Lead</p>
            </div>
          </div>

          {/* Interactive EVV Box */}
          <div className="rounded-3xl border-2 border-dashed border-[#DECFA9] bg-[#FDFBF7] p-6 text-center">
            {!clockInDone ? (
              <div className="mx-auto max-w-md space-y-4">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-orange-100 text-[#F97316] shadow-inner">
                  <MapPin className="h-8 w-8 animate-bounce" />
                </div>
                <div>
                  <h4 className="font-heading text-lg font-black text-slate-900">
                    Ready to Start Session at Leo Miller&apos;s Home
                  </h4>
                  <p className="mt-1 text-xs font-semibold text-slate-600">
                    Click the button below to simulate device GPS matching and start your Eastern Time EVV clock.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleVerifyGpsAndClockIn}
                  disabled={isVerifyingGps}
                  className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-2xl bg-orange-500 px-8 py-4 font-heading text-sm font-black text-white shadow-xl shadow-orange-950/20 transition-all hover:scale-[1.02] hover:bg-orange-400 disabled:opacity-60"
                >
                  {isVerifyingGps ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      Checking Geofence &amp; Satellite Coordinates…
                    </>
                  ) : (
                    <>
                      <Play className="h-5 w-5 fill-white" />
                      Verify GPS &amp; Clock In (EVV)
                    </>
                  )}
                </button>
              </div>
            ) : (
              <div className="mx-auto max-w-md space-y-4">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-emerald-100 text-emerald-700 shadow-md">
                  <CheckCircle2 className="h-8 w-8" />
                </div>
                <div>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-100 px-3 py-1 font-mono text-[10px] font-black uppercase text-emerald-800">
                    <span className="dot-live h-1.5 w-1.5 rounded-full bg-emerald-600" />
                    Live Session Active · Clocked In at {clockInTime || '3:30 PM'} ET
                  </span>
                  <h4 className="mt-2 font-heading text-xl font-black text-slate-900">
                    EVV Clock-In Verified &amp; Compliant
                  </h4>
                  <p className="mt-1 text-xs font-semibold text-slate-600">
                    Location confirmed within 0.02 miles of client residence. You may now begin clinical data collection.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setCurrentStage('2_DATA_COLLECTION')}
                  className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-8 py-4 font-heading text-sm font-black text-white shadow-xl transition-all hover:scale-[1.02] hover:bg-emerald-500"
                >
                  <span>Proceed to Step 2: Data Collection</span>
                  <ArrowRight className="h-5 w-5" />
                </button>
              </div>
            )}
          </div>
        </section>
      )}

      {/* STAGE 2: CLINICAL DATA COLLECTION */}
      {currentStage === '2_DATA_COLLECTION' && (
        <section className="space-y-6 rounded-3xl border border-[#E2D5B7] bg-[#FFFDF8] p-6 shadow-xl sm:p-8">
          <div className="flex flex-col justify-between gap-4 border-b border-[#E2D5B7] pb-5 sm:flex-row sm:items-center">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-orange-300 bg-orange-100 px-3 py-1 font-mono text-[10px] font-black uppercase text-[#C2410C]">
                <Target className="h-3 w-3" />
                Step 2 · Real-Time Clinical Data
              </span>
              <h3 className="mt-2 font-heading text-xl font-black text-slate-900 sm:text-2xl">
                Discrete Trial Training (DTT) &amp; Behavior Tracking
              </h3>
              <p className="mt-1 text-xs font-semibold text-slate-600">
                Log practice responses for Skill Acquisition, Maladaptive Behavior Frequency, and Task Analysis chaining.
              </p>
            </div>

            <div className="rounded-2xl border border-emerald-300 bg-emerald-50 px-4 py-2 text-right">
              <span className="font-mono text-[10px] font-bold uppercase text-emerald-800">DTT Score</span>
              <p className="font-heading text-lg font-black text-emerald-700">{dttAccuracy}% Accuracy ({dttCorrectCount}/{dttTrials.length})</p>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* DTT Practice Card */}
            <div className="space-y-4 rounded-3xl border border-[#E2D5B7] bg-[#F9F5EC] p-5">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-mono text-[10px] font-black uppercase text-[#C2410C]">Skill Acquisition</span>
                  <h4 className="font-heading text-sm font-black text-slate-900">
                    Target: Expressive Labeling (Everyday Objects)
                  </h4>
                  <p className="text-[11px] font-semibold text-slate-600">
                    SD: &quot;What is this?&quot; · Target: &quot;Cup&quot;, &quot;Spoon&quot;, &quot;Shoe&quot;
                  </p>
                </div>
              </div>

              {/* Trial History Chips */}
              <div className="flex flex-wrap gap-1.5">
                {dttTrials.map((trial, idx) => (
                  <span
                    key={trial.id}
                    className={`rounded-lg px-2.5 py-1 font-mono text-[10px] font-black uppercase shadow-xs ${
                      trial.result === 'CORRECT'
                        ? 'bg-emerald-500 text-white'
                        : trial.result === 'PROMPTED'
                          ? 'bg-amber-400 text-amber-950'
                          : 'bg-rose-500 text-white'
                    }`}
                  >
                    T{idx + 1}: {trial.result === 'CORRECT' ? '+ Ind' : trial.result === 'PROMPTED' ? 'P Prompt' : '- Inc'}
                  </span>
                ))}
              </div>

              {/* Interactive Log Buttons */}
              <div className="grid grid-cols-3 gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => handleAddDttTrial('CORRECT')}
                  className="flex cursor-pointer items-center justify-center gap-1.5 rounded-2xl bg-emerald-600 py-3 font-heading text-xs font-black text-white shadow-md transition-all hover:scale-[1.02] hover:bg-emerald-500"
                >
                  <Plus className="h-4 w-4" />
                  + Correct
                </button>
                <button
                  type="button"
                  onClick={() => handleAddDttTrial('PROMPTED')}
                  className="flex cursor-pointer items-center justify-center gap-1.5 rounded-2xl bg-amber-400 py-3 font-heading text-xs font-black text-amber-950 shadow-md transition-all hover:scale-[1.02] hover:bg-amber-300"
                >
                  <Plus className="h-4 w-4" />
                  P Prompted
                </button>
                <button
                  type="button"
                  onClick={() => handleAddDttTrial('INCORRECT')}
                  className="flex cursor-pointer items-center justify-center gap-1.5 rounded-2xl bg-rose-600 py-3 font-heading text-xs font-black text-white shadow-md transition-all hover:scale-[1.02] hover:bg-rose-500"
                >
                  <Plus className="h-4 w-4" />
                  - Incorrect
                </button>
              </div>
            </div>

            {/* Behavior & Frequency Tracker */}
            <div className="space-y-4 rounded-3xl border border-[#E2D5B7] bg-[#F9F5EC] p-5">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-mono text-[10px] font-black uppercase text-purple-700">Behavior Deceleration</span>
                  <h4 className="font-heading text-sm font-black text-slate-900">
                    Vocal Non-Compliance / Task Refusal
                  </h4>
                  <p className="text-[11px] font-semibold text-slate-600">
                    Definition: Screaming or saying &quot;no&quot; for &gt;10s when presented with a demand.
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between rounded-2xl border border-[#E2D5B7] bg-white p-4">
                <div>
                  <p className="font-mono text-[10px] font-black uppercase text-slate-500">Session Frequency Count</p>
                  <p className="font-heading text-2xl font-black text-[#C2410C]">{frequencyCount} Instances</p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (frequencyCount > 0) setFrequencyCount((c) => c - 1);
                    }}
                    className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl border border-[#E2D5B7] bg-[#F9F5EC] font-bold text-slate-700 hover:bg-white"
                  >
                    -
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFrequencyCount((c) => c + 1);
                      toast.success('Behavior instance logged (+1).');
                    }}
                    className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl bg-[#F97316] font-bold text-white shadow-md hover:bg-orange-400"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Task Analysis Checklist */}
              <div className="space-y-2 rounded-2xl border border-[#E2D5B7] bg-white p-3.5">
                <div className="flex items-center justify-between">
                  <p className="font-mono text-[10px] font-black uppercase text-slate-700">
                    Task Analysis: Hand Washing ({taCompletedCount}/5 Steps Mastered)
                  </p>
                </div>
                <div className="space-y-1.5">
                  {taSteps.map((step) => (
                    <button
                      key={step.id}
                      type="button"
                      onClick={() => handleToggleTa(step.id)}
                      className={`flex w-full cursor-pointer items-center justify-between rounded-xl border px-3 py-2 text-left text-xs font-semibold transition-all ${
                        step.done
                          ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
                          : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      <span>{step.label}</span>
                      {step.done ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      ) : (
                        <span className="font-mono text-[10px] text-slate-400">Independent?</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Navigation Buttons */}
          <div className="flex items-center justify-between border-t border-[#E2D5B7] pt-5">
            <button
              type="button"
              onClick={() => setCurrentStage('1_CLOCK_IN')}
              className="inline-flex cursor-pointer items-center gap-2 rounded-2xl border border-[#E2D5B7] bg-[#F9F5EC] px-5 py-3 text-xs font-bold text-slate-800 hover:bg-white"
            >
              <ArrowLeft className="h-4 w-4" />
              Back: EVV Clock-In
            </button>

            <button
              type="button"
              onClick={() => setCurrentStage('3_SESSION_NOTE')}
              className="inline-flex cursor-pointer items-center gap-2 rounded-2xl bg-orange-500 px-8 py-3.5 font-heading text-sm font-black text-white shadow-xl hover:bg-orange-400"
            >
              <span>Proceed to Step 3: Session Note</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </section>
      )}

      {/* STAGE 3: CLINICAL SESSION NOTE */}
      {currentStage === '3_SESSION_NOTE' && (
        <section className="space-y-6 rounded-3xl border border-[#E2D5B7] bg-[#FFFDF8] p-6 shadow-xl sm:p-8">
          <div className="flex items-start justify-between gap-4 border-b border-[#E2D5B7] pb-5">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-purple-300 bg-purple-100 px-3 py-1 font-mono text-[10px] font-black uppercase text-purple-800">
                <FileText className="h-3 w-3" />
                Step 3 · Clinical Narrative Documentation
              </span>
              <h3 className="mt-2 font-heading text-xl font-black text-slate-900 sm:text-2xl">
                RBT Session Note &amp; Objective Observations
              </h3>
              <p className="mt-1 text-xs font-semibold text-slate-600">
                Session notes must be objective, describe environmental antecedents, client response to interventions, and caregiver participation.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-black text-slate-800">Client Engagement &amp; Baseline</label>
                <select
                  value={clientMood}
                  onChange={(e) =>
                    setClientMood(
                      e.target.value as
                        | 'Cooperative & Engaged'
                        | 'Fatigued'
                        | 'Heightened Non-Compliance'
                    )
                  }
                  className="mt-1.5 w-full cursor-pointer rounded-2xl border border-[#DECFA9] bg-white px-4 py-3 text-xs font-bold text-slate-900 outline-none focus:border-orange-500"
                >
                  <option value="Cooperative & Engaged">Cooperative &amp; Highly Engaged (Positive baseline)</option>
                  <option value="Fatigued">Fatigued / Slower Latency Responses</option>
                  <option value="Heightened Non-Compliance">Heightened Non-Compliance / Frequent Transitions</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-black text-slate-800">Caregiver Present on Site?</label>
                <div className="mt-1.5 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setCaregiverPresent(true)}
                    className={`flex-1 cursor-pointer rounded-2xl border py-3 text-xs font-bold ${
                      caregiverPresent ? 'border-emerald-500 bg-emerald-50 text-emerald-900 font-black' : 'border-[#DECFA9] bg-white text-slate-600'
                    }`}
                  >
                    ✓ Yes (Elena Miller - Mother)
                  </button>
                  <button
                    type="button"
                    onClick={() => setCaregiverPresent(false)}
                    className={`flex-1 cursor-pointer rounded-2xl border py-3 text-xs font-bold ${
                      !caregiverPresent ? 'border-rose-500 bg-rose-50 text-rose-900 font-black' : 'border-[#DECFA9] bg-white text-slate-600'
                    }`}
                  >
                    No (Not Present)
                  </button>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-black text-slate-800">
                Clinical Narrative Note (CPT 97153 Requirement)
              </label>
              <textarea
                value={noteNarrative}
                onChange={(e) => setNoteNarrative(e.target.value)}
                rows={5}
                className="mt-1.5 w-full rounded-2xl border border-[#DECFA9] bg-white p-4 text-xs font-medium leading-relaxed text-slate-900 outline-none focus:border-orange-500"
                placeholder="Describe interventions used, client responses, progress on behavioral goals, and caregiver coaching..."
              />
            </div>
          </div>

          {/* Navigation Buttons */}
          <div className="flex items-center justify-between border-t border-[#E2D5B7] pt-5">
            <button
              type="button"
              onClick={() => setCurrentStage('2_DATA_COLLECTION')}
              className="inline-flex cursor-pointer items-center gap-2 rounded-2xl border border-[#E2D5B7] bg-[#F9F5EC] px-5 py-3 text-xs font-bold text-slate-800 hover:bg-white"
            >
              <ArrowLeft className="h-4 w-4" />
              Back: Data Entry
            </button>

            <button
              type="button"
              onClick={() => setCurrentStage('4_CLOCK_OUT')}
              className="inline-flex cursor-pointer items-center gap-2 rounded-2xl bg-orange-500 px-8 py-3.5 font-heading text-sm font-black text-white shadow-xl hover:bg-orange-400"
            >
              <span>Proceed to Step 4: EVV Clock-Out</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </section>
      )}

      {/* STAGE 4: EVV CLOCK-OUT & CAREGIVER SIGNATURE */}
      {currentStage === '4_CLOCK_OUT' && (
        <section className="space-y-6 rounded-3xl border border-[#E2D5B7] bg-[#FFFDF8] p-6 shadow-xl sm:p-8">
          <div className="flex items-start justify-between gap-4 border-b border-[#E2D5B7] pb-5">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-100 px-3 py-1 font-mono text-[10px] font-black uppercase text-emerald-800">
                <PenTool className="h-3 w-3" />
                Step 4 · EVV Clock-Out &amp; Dual Signatures
              </span>
              <h3 className="mt-2 font-heading text-xl font-black text-slate-900 sm:text-2xl">
                Complete Clock-Out &amp; Collect Caregiver Attestation
              </h3>
              <p className="mt-1 text-xs font-semibold text-slate-600">
                To prevent billing deficiencies and Medicaid audit flags, every session note requires caregiver digital verification and RBT attestation.
              </p>
            </div>
          </div>

          {/* Clock-Out Summary Bar */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-[#E2D5B7] bg-[#F9F5EC] p-4">
              <span className="font-mono text-[10px] font-black uppercase text-slate-500">Clock-In Timestamp</span>
              <p className="mt-1 font-heading text-lg font-black text-slate-900">{clockInTime || '3:30 PM'} ET</p>
              <p className="text-[10px] font-semibold text-emerald-700">✓ GPS Match Verified</p>
            </div>

            <div className="rounded-2xl border border-[#E2D5B7] bg-[#F9F5EC] p-4">
              <span className="font-mono text-[10px] font-black uppercase text-slate-500">Clock-Out Timestamp</span>
              <p className="mt-1 font-heading text-lg font-black text-[#C2410C]">5:30 PM ET</p>
              <p className="text-[10px] font-semibold text-slate-600">2.0 Hours (120 Mins)</p>
            </div>

            <div className="rounded-2xl border border-[#E2D5B7] bg-[#F9F5EC] p-4">
              <span className="font-mono text-[10px] font-black uppercase text-slate-500">Billable Units (8-Min Rule)</span>
              <p className="mt-1 font-heading text-lg font-black text-emerald-700">8.0 Units</p>
              <p className="text-[10px] font-semibold text-slate-600">CPT 97153 (Adaptive Behavior)</p>
            </div>
          </div>

          {/* Signatures Panel */}
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Caregiver Signature Card */}
            <div className="space-y-3 rounded-3xl border border-[#E2D5B7] bg-[#F9F5EC] p-5">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] font-black uppercase text-slate-700">
                  1. Caregiver Digital Verification
                </span>
                {caregiverSigned && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 font-mono text-[9px] font-black uppercase text-emerald-800">
                    <Check className="h-3 w-3" /> Signed
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-600">
                &quot;I attest that the RBT provided 2 hours of direct ABA services to Leo Miller today.&quot;
              </p>

              <div className="rounded-2xl border border-[#DECFA9] bg-white p-4 text-center">
                {caregiverSigned ? (
                  <div className="space-y-1">
                    <p className="font-serif text-xl italic font-bold text-slate-800">Elena Miller</p>
                    <p className="font-mono text-[10px] text-slate-500">
                      Signed digitally · {new Date().toLocaleDateString()}
                    </p>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setCaregiverSigned(true);
                      toast.success('Caregiver signature recorded.');
                    }}
                    className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-orange-500 px-5 py-2.5 font-heading text-xs font-black text-white shadow-md hover:bg-orange-400"
                  >
                    <PenTool className="h-3.5 w-3.5" />
                    Simulate Caregiver Signature
                  </button>
                )}
              </div>
            </div>

            {/* RBT Signature Card */}
            <div className="space-y-3 rounded-3xl border border-[#E2D5B7] bg-[#F9F5EC] p-5">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] font-black uppercase text-slate-700">
                  2. RBT Practitioner Attestation
                </span>
                {rbtSigned && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 font-mono text-[9px] font-black uppercase text-emerald-800">
                    <Check className="h-3 w-3" /> Attested
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-600">
                &quot;I certify that the clinical data, hours, and notes recorded represent true clinical services.&quot;
              </p>

              <div className="rounded-2xl border border-[#DECFA9] bg-white p-4 text-center">
                {rbtSigned ? (
                  <div className="space-y-1">
                    <p className="font-serif text-xl italic font-bold text-slate-800">Applicant / RBT on File</p>
                    <p className="font-mono text-[10px] text-slate-500">
                      Signed electronically · {new Date().toLocaleDateString()}
                    </p>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setRbtSigned(true);
                      toast.success('RBT attestation confirmed.');
                    }}
                    className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 font-heading text-xs font-black text-white shadow-md hover:bg-emerald-500"
                  >
                    <PenTool className="h-3.5 w-3.5" />
                    Sign RBT Attestation
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Navigation Buttons */}
          <div className="flex items-center justify-between border-t border-[#E2D5B7] pt-5">
            <button
              type="button"
              onClick={() => setCurrentStage('3_SESSION_NOTE')}
              className="inline-flex cursor-pointer items-center gap-2 rounded-2xl border border-[#E2D5B7] bg-[#F9F5EC] px-5 py-3 text-xs font-bold text-slate-800 hover:bg-white"
            >
              <ArrowLeft className="h-4 w-4" />
              Back: Clinical Note
            </button>

            <button
              type="button"
              onClick={() => {
                if (!caregiverSigned || !rbtSigned) {
                  setCaregiverSigned(true);
                  setRbtSigned(true);
                }
                setCurrentStage('5_SUBMIT_REVIEW');
              }}
              className="inline-flex cursor-pointer items-center gap-2 rounded-2xl bg-orange-500 px-8 py-3.5 font-heading text-sm font-black text-white shadow-xl hover:bg-orange-400"
            >
              <span>Proceed to Step 5: Final Review</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </section>
      )}

      {/* STAGE 5: REVIEW & FINAL SUBMISSION */}
      {currentStage === '5_SUBMIT_REVIEW' && (
        <section className="space-y-6 rounded-3xl border-2 border-emerald-400 bg-[#FFFDF8] p-6 shadow-2xl sm:p-9">
          <div className="flex items-start justify-between gap-4 border-b border-[#E2D5B7] pb-5">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-100 px-3 py-1 font-mono text-[10px] font-black uppercase text-emerald-800">
                <ShieldCheck className="h-3.5 w-3.5" />
                Step 5 · Final Submission to BCBA Supervisor
              </span>
              <h3 className="mt-2 font-heading text-2xl font-black text-slate-900">
                Ready to Submit Practice Session Note
              </h3>
              <p className="mt-1 text-xs font-semibold text-slate-600">
                Review the completed electronic session package below. Submitting will complete your <strong>Requirement 2 · Data Simulator</strong> onboarding check!
              </p>
            </div>
          </div>

          {/* Complete Session Note Package Card */}
          <div className="space-y-4 rounded-3xl border border-[#E2D5B7] bg-[#F9F5EC] p-6">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#DECFA9] pb-3">
              <div>
                <p className="font-heading text-sm font-black text-slate-900">
                  Client: Leo Miller · CPT 97153-HM (8.0 Units)
                </p>
                <p className="text-xs text-slate-600">
                  Location: 12 - Home · Supervisor: Dr. Sarah Jenkins, BCBA-D
                </p>
              </div>
              <span className="rounded-full bg-emerald-100 px-3 py-1 font-mono text-xs font-black text-emerald-800">
                EVV STATUS: FULLY COMPLIANT
              </span>
            </div>

            <div className="grid gap-3 text-xs sm:grid-cols-3">
              <div className="rounded-xl bg-white p-3">
                <span className="font-mono text-[10px] font-bold uppercase text-slate-500">EVV Timestamps</span>
                <p className="font-bold text-slate-900">3:30 PM – 5:30 PM (2.0 hrs)</p>
              </div>
              <div className="rounded-xl bg-white p-3">
                <span className="font-mono text-[10px] font-bold uppercase text-slate-500">DTT Trials &amp; Accuracy</span>
                <p className="font-bold text-slate-900">{dttTrials.length} Trials logged ({dttAccuracy}% Acc)</p>
              </div>
              <div className="rounded-xl bg-white p-3">
                <span className="font-mono text-[10px] font-bold uppercase text-slate-500">Signatures on File</span>
                <p className="font-bold text-emerald-700">✓ Caregiver &amp; ✓ RBT Signed</p>
              </div>
            </div>

            <div className="rounded-xl bg-white p-4">
              <span className="font-mono text-[10px] font-bold uppercase text-slate-500">Session Narrative</span>
              <p className="mt-1 text-xs font-medium leading-relaxed text-slate-800">{noteNarrative}</p>
            </div>
          </div>

          {/* Primary Submit Button */}
          <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              onClick={() => setCurrentStage('4_CLOCK_OUT')}
              className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-[#E2D5B7] bg-[#F9F5EC] px-6 py-4 text-xs font-bold text-slate-800 hover:bg-white"
            >
              <ArrowLeft className="h-4 w-4" />
              Back: Edit Signatures
            </button>

            <button
              type="button"
              onClick={onComplete}
              disabled={isSaving}
              className="inline-flex cursor-pointer items-center justify-center gap-3 rounded-2xl bg-gradient-to-r from-orange-500 to-amber-500 px-10 py-4 font-heading text-base font-black text-white shadow-2xl shadow-orange-950/30 transition-all duration-300 hover:scale-[1.02] hover:from-orange-400 hover:to-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Saving to Database…
                </>
              ) : (
                <>
                  <Sparkles className="h-5 w-5 fill-white" />
                  Submit Practice Session Note to BCBA (Complete Requirement)
                </>
              )}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
