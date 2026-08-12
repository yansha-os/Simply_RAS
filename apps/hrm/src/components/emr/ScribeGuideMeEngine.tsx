'use client';

import React, { useState, useEffect, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { Target, ChevronLeft, X, Lightbulb, Minimize2, Maximize2, Info, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';

export interface ScribeStep {
  stepNumber: number;
  title: string;
  elementType: string;
  currentStepExplanation: string;
  nextStepTitle: string;
  requiredActionText: string;
  clinicalRationale: string;
  targetElementId: string;
}

export interface ScribeGuideMeEngineProps {
  isActive: boolean;
  onClose: () => void;
  onGuideComplete: () => void;
  onStepChange?: (stepIndex: number) => void;
}

const SCRIBE_STREAMLINED_STEPS: ScribeStep[] = [
  {
    stepNumber: 1,
    title: 'Active Practice Session Hub',
    elementType: 'SIMULATION ACTIVE TAB',
    currentStepExplanation: 'You are viewing a fictional active-session card with a local practice timer, sample unit estimate, and sample trial summary.',
    nextStepTitle: 'Step 2: Incomplete Note Samples',
    requiredActionText: 'Choose the "Incomplete Note Samples" tab to inspect fictional missing-documentation examples.',
    clinicalRationale: 'This teaches where an RBT would review unfinished documentation without opening or changing a real session.',
    targetElementId: 'tab-incomplete-sessions'
  },
  {
    stepNumber: 2,
    title: 'Incomplete Note Practice Samples',
    elementType: 'SIMULATION INCOMPLETE TAB',
    currentStepExplanation: 'This tab contains fictional cards that demonstrate how missing acknowledgments or narratives might be surfaced.',
    nextStepTitle: 'Step 3: Sample Schedule Tab',
    requiredActionText: 'Choose the "Sample Schedule" tab to explore the fictional calendar.',
    clinicalRationale: 'The practice view helps RBTs recognize missing documentation while keeping live notes and payroll holds untouched.',
    targetElementId: 'tab-upcoming-schedule'
  },
  {
    stepNumber: 3,
    title: 'Fictional Schedule Grid',
    elementType: 'SIMULATION SCHEDULE TAB',
    currentStepExplanation: 'This matrix contains sample sessions, a local call-out form, and a practice-session launch button.',
    nextStepTitle: 'Step 4: Completed Samples Tab',
    requiredActionText: 'Choose the "Completed Samples" tab to inspect fictional completed-state cards.',
    clinicalRationale: 'This demonstrates schedule navigation without clocking in, changing assignments, or contacting dispatch.',
    targetElementId: 'tab-completed-claims'
  },
  {
    stepNumber: 4,
    title: 'Completed Workflow Samples',
    elementType: 'SIMULATION COMPLETED TAB',
    currentStepExplanation: 'These cards are visual examples only. They are not signed notes, verified claims, or proof of reimbursement.',
    nextStepTitle: 'Step 5: Return to the Sample Schedule',
    requiredActionText: 'Choose the "Sample Schedule" tab to locate a fictional practice session.',
    clinicalRationale: 'A completed-state example helps trainees understand the workflow without making payer or audit guarantees.',
    targetElementId: 'tab-upcoming-schedule'
  },
  {
    stepNumber: 5,
    title: 'Launch a Fictional Practice Session',
    elementType: 'SIMULATION START BUTTON',
    currentStepExplanation: 'This button opens the in-memory training collector. It does not validate GPS or create an EVV visit.',
    nextStepTitle: 'Step 6: Local Practice Timer',
    requiredActionText: 'Choose "Start Practice Session".',
    clinicalRationale: 'The interaction demonstrates the handoff from schedule to data collection while live EVV remains untouched.',
    targetElementId: 'btn-evv-start-session'
  },
  {
    stepNumber: 6,
    title: 'Local Practice Timer',
    elementType: 'SIMULATION TIMER',
    currentStepExplanation: 'The local timer demonstrates elapsed-time controls and shows a sample 97153 unit estimate. It is not an EVV clock or billable duration.',
    nextStepTitle: 'Step 7: Procedure 1 - Discrete Trial Training (DTT)',
    requiredActionText: 'Choose Start on the practice timer.',
    clinicalRationale: 'This illustrates timer handling and unit estimation without creating billable time.',
    targetElementId: 'btn-evv-timer-start'
  },
  {
    stepNumber: 7,
    title: 'Procedure 1: Discrete Trial Training (DTT)',
    elementType: 'DTT TRIAL ACQUISITION BUTTONS',
    currentStepExplanation: 'You are currently inside Procedure 1 (DTT). These trial logging buttons record Independent (+) and Prompted (+P) responses for skill acquisition goals.',
    nextStepTitle: 'Step 8: Procedure 2 - Task Analysis Step-Chaining',
    requiredActionText: 'Click "+ Independent (+)" or "+ Prompted (+P)" to log a trial response.',
    clinicalRationale: 'DTT tracks skill acquisition accuracy percentage and prompt fading progress over time.',
    targetElementId: 'btn-log-correct'
  },
  {
    stepNumber: 8,
    title: 'Procedure 2: Task Analysis Step-Chaining',
    elementType: 'TASK ANALYSIS PROCEDURE TAB',
    currentStepExplanation: 'This tab switches the data engine to Task Analysis (TA Chaining) for scoring multi-step routines like the Handwashing 7-step chain.',
    nextStepTitle: 'Step 9: Procedure 3 - Frequency & Latency Timers',
    requiredActionText: 'Click "2. Task Analysis (TA Chaining)" Tab',
    clinicalRationale: 'Task analysis breaks complex self-help routines into sequential chain steps for independence tracking.',
    targetElementId: 'tab-proc-ta'
  },
  {
    stepNumber: 9,
    title: 'Procedure 3: Frequency & Latency Timers',
    elementType: 'FREQUENCY & LATENCY PROCEDURE TAB',
    currentStepExplanation: 'This tab opens Frequency & Latency measurement tools to tally high-frequency mands or measure SD-to-response latency.',
    nextStepTitle: 'Step 10: Procedure 4 - Discontinuous Interval Grid',
    requiredActionText: 'Click "3. Frequency & Latency Timers" Tab',
    clinicalRationale: 'Frequency tracks rate of behavior occurrence; Latency measures prompt responsiveness.',
    targetElementId: 'tab-proc-freq'
  },
  {
    stepNumber: 10,
    title: 'Procedure 4: Discontinuous Interval Grid',
    elementType: 'INTERVAL SAMPLING PROCEDURE TAB',
    currentStepExplanation: 'This tab opens the Discontinuous Interval Grid for toggling Partial Interval (PIR), Whole Interval (WIR), or Momentary Time Sampling (MTS) boxes.',
    nextStepTitle: 'Step 11: Procedure 5 - ABC Behavior Incident Logger',
    requiredActionText: 'Click "4. Discontinuous Interval Grid" Tab',
    clinicalRationale: 'Interval sampling estimates behavior duration in busy classroom or home settings.',
    targetElementId: 'tab-proc-interval'
  },
  {
    stepNumber: 11,
    title: 'Procedure 5: ABC Behavior Incident Logger',
    elementType: 'ABC LOGGER PROCEDURE TAB',
    currentStepExplanation: 'This tab opens the ABC Behavior Incident Logger to record Antecedent, Behavior, Consequence, and run the maladaptive duration stopwatch.',
    nextStepTitle: 'Step 12: BCBA Emergency Supervisory Alert & BIP Sheet',
    requiredActionText: 'Click "5. ABC Behavior Logger" Tab',
    clinicalRationale: 'ABC data identifies environmental functions of behavior to evaluate BIP effectiveness.',
    targetElementId: 'tab-proc-abc'
  },
  {
    stepNumber: 12,
    title: 'Practice Supervisor Signal & Sample BIP',
    elementType: 'SIMULATION SUPPORT CONTROLS',
    currentStepExplanation: 'The signal button displays training feedback only; it does not contact a BCBA. The BIP drawer contains fictional reference content.',
    nextStepTitle: 'Step 13: Practice SOAP Note Builder',
    requiredActionText: 'Choose "Practice supervisor signal" or open the sample BIP sheet.',
    clinicalRationale: 'This teaches where support controls appear while making clear that emergencies still require the approved live escalation path.',
    targetElementId: 'btn-signal-bcba'
  },
  {
    stepNumber: 13,
    title: 'Practice SOAP Note Builder',
    elementType: 'SIMULATION NARRATIVE HELPER',
    currentStepExplanation: 'Quick chips replace the fictional draft text so you can practice editing SOAP sections. They do not generate a clinical note.',
    nextStepTitle: 'Step 14: Finish the Practice Attempt',
    requiredActionText: 'Choose "+ Alert & Happy" to replace the fictional subjective text.',
    clinicalRationale: 'Practice chips demonstrate efficient drafting, but the trainee remains responsible for accurate live documentation.',
    targetElementId: 'chip-soap-subjective'
  },
  {
    stepNumber: 14,
    title: 'Finish the Practice Attempt',
    elementType: 'SIMULATION FINISH BUTTON',
    currentStepExplanation: 'After all six practice checks are complete, the finish button records only training progress. It never signs a note or creates a claim.',
    nextStepTitle: 'Guide Walkthrough Finished',
    requiredActionText: 'Complete the remaining practice checks, type the fictional acknowledgment, then choose "Finish Practice Attempt".',
    clinicalRationale: 'Separating training progress from clinical and billing records prevents a simulated interaction from becoming source-of-truth data.',
    targetElementId: 'btn-finish-simulation'
  }
];

const subscribeToClient = () => () => {};

export function ScribeGuideMeEngine({
  isActive,
  onClose,
  onGuideComplete,
  onStepChange
}: ScribeGuideMeEngineProps) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const mounted = useSyncExternalStore(
    subscribeToClient,
    () => true,
    () => false
  );
  const [isMinimized, setIsMinimized] = useState(false);
  const closeGuide = React.useCallback(() => {
    setCurrentStepIndex(0);
    setIsMinimized(false);
    onClose();
  }, [onClose]);
  const completeGuide = React.useCallback(() => {
    setCurrentStepIndex(0);
    setIsMinimized(false);
    onGuideComplete();
  }, [onGuideComplete]);

  useEffect(() => {
    if (!isActive) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeGuide();
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [closeGuide, isActive]);

  const totalSteps = SCRIBE_STREAMLINED_STEPS.length;
  const currentStep = SCRIBE_STREAMLINED_STEPS[currentStepIndex];

  useEffect(() => {
    if (onStepChange) {
      onStepChange(currentStepIndex);
    }
  }, [currentStepIndex, onStepChange]);

  // Target element highlighter effect
  useEffect(() => {
    if (!isActive || !currentStep) return;

    const findAndHighlight = () => {
      const targetElement = document.querySelector(`[data-scribe-id="${currentStep.targetElementId}"]`);

      if (targetElement) {
        targetElement.classList.add(
          'ring-4', 
          'ring-[#F97316]', 
          'ring-offset-2', 
          'animate-pulse', 
          'shadow-[0_0_30px_#F97316]',
          'z-30',
          'relative'
        );
        targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    };

    findAndHighlight();
    const timer = setTimeout(findAndHighlight, 300);

    const handleElementClick = (e: Event) => {
      const clickedEl = e.target as HTMLElement;
      const closestTarget = clickedEl.closest(`[data-scribe-id="${currentStep.targetElementId}"]`);

      if (closestTarget) {
        toast.success(`Guide step ${currentStep.stepNumber} observed: ${currentStep.title}`);

        closestTarget.classList.remove(
          'ring-4', 
          'ring-[#F97316]', 
          'ring-offset-2', 
          'animate-pulse', 
          'shadow-[0_0_30px_#F97316]',
          'z-30',
          'relative'
        );

        if (currentStepIndex < totalSteps - 1) {
          setCurrentStepIndex(prev => prev + 1);
        } else {
          toast.info('Guide walkthrough finished. Training progress is saved only by the practice finish button.');
          completeGuide();
        }
      }
    };

    document.addEventListener('click', handleElementClick, true);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('click', handleElementClick, true);
      const targetElement = document.querySelector(`[data-scribe-id="${currentStep.targetElementId}"]`);
      if (targetElement) {
        targetElement.classList.remove(
          'ring-4', 
          'ring-[#F97316]', 
          'ring-offset-2', 
          'animate-pulse', 
          'shadow-[0_0_30px_#F97316]',
          'z-30',
          'relative'
        );
      }
    };
  }, [isActive, currentStepIndex, currentStep, totalSteps, completeGuide, onStepChange]);

  if (!isActive) return null;

  // MINIMIZED SLEEK FLOATING PILL
  if (isMinimized) {
    const minimizedPill = (
      <div className="fixed bottom-6 right-6 z-[9999999] animate-fade-in pointer-events-auto">
        <button
          type="button"
          onClick={() => setIsMinimized(false)}
          aria-label={`Expand simulation guide, step ${currentStep.stepNumber} of ${totalSteps}`}
          className="bg-white border-2 border-[#F97316] rounded-full px-4 py-2.5 shadow-2xl flex items-center gap-3 text-slate-900 font-extrabold text-xs hover:bg-orange-50 cursor-pointer transition-all"
        >
          <span className="w-6 h-6 rounded-full bg-[#F97316] text-white flex items-center justify-center font-black text-[10px] font-mono shadow-sm shrink-0">
            {currentStep.stepNumber}
          </span>
          <span className="max-w-[220px] truncate text-slate-900">Simulation guide ({currentStep.stepNumber}/{totalSteps}): {currentStep.title}</span>
          <Maximize2 className="w-4 h-4 text-[#F97316] shrink-0" />
        </button>
      </div>
    );
    return mounted ? createPortal(minimizedPill, document.body) : null;
  }

  const cardContent = (
    <div className="fixed bottom-6 right-6 max-w-md w-full z-[9999999] animate-fade-in pointer-events-auto">
      <div
        role="dialog"
        aria-modal="false"
        aria-labelledby="scribe-guide-title"
        className="bg-white border-4 border-[#F97316] rounded-3xl p-6 shadow-[0_20px_60px_rgba(249,115,22,0.35)] text-slate-900 space-y-4 relative opacity-100"
      >
        {/* Step Counter Header */}
        <div className="flex items-center justify-between border-b-2 border-orange-100 pb-3">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-full bg-[#F97316] text-white flex items-center justify-center font-black text-xs font-mono shadow-md shrink-0">
              {currentStep.stepNumber}
            </span>
            <div>
              <span className="text-[10px] font-mono font-black text-[#F97316] uppercase tracking-widest block">
                SIMULATION GUIDE · NO LIVE ACTIONS ({currentStep.stepNumber}/{totalSteps})
              </span>
              <h4 id="scribe-guide-title" className="text-sm font-black font-heading text-slate-900">{currentStep.title}</h4>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {/* MINIMIZE BUTTON */}
            <button
              type="button"
              onClick={() => setIsMinimized(true)}
              aria-label="Minimize simulation guide"
              title="Minimize simulation guide"
              className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 flex items-center justify-center cursor-pointer transition-all"
            >
              <Minimize2 className="w-3.5 h-3.5" />
            </button>

            {/* CLOSE BUTTON */}
            <button
              type="button"
              onClick={closeGuide}
              aria-label="Close simulation guide"
              title="Close simulation guide"
              className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 flex items-center justify-center cursor-pointer transition-all"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Progress Bar */}
        <div
          className="w-full bg-orange-100 h-2.5 rounded-full overflow-hidden border border-orange-200"
          role="progressbar"
          aria-label="Simulation guide progress"
          aria-valuemin={1}
          aria-valuemax={totalSteps}
          aria-valuenow={currentStep.stepNumber}
        >
          <div
            className="bg-[#F97316] h-full transition-all duration-500"
            style={{ width: `${(currentStep.stepNumber / totalSteps) * 100}%` }}
          />
        </div>

        {/* 🌟 1. CURRENT STEP EXPLANATION BOX (FEATURE & FUNCTION) */}
        <div className="p-4 bg-slate-50 border-2 border-slate-200 rounded-2xl space-y-1.5 shadow-sm">
          <span className="text-[10px] font-mono font-black text-slate-700 uppercase tracking-wider block flex items-center gap-1">
            <Info className="w-3.5 h-3.5 text-blue-600" /> CURRENT FEATURE ({currentStep.elementType}):
          </span>
          <p className="text-xs text-slate-800 font-extrabold leading-relaxed">
            {currentStep.currentStepExplanation}
          </p>
        </div>

        {/* 🌟 2. NEXT STEP & REQUIRED ACTION BOX */}
        <div className="p-4 bg-orange-50 border-2 border-[#F97316] rounded-2xl space-y-1.5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono font-black text-[#F97316] uppercase tracking-wider block flex items-center gap-1">
              <ArrowRight className="w-3.5 h-3.5 text-[#F97316]" /> NEXT: {currentStep.nextStepTitle}
            </span>
          </div>
          <p className="text-xs font-black text-slate-900 flex items-center gap-1.5">
            <Target className="w-4.5 h-4.5 text-[#F97316] animate-pulse shrink-0" />
            <span className="text-slate-900">{currentStep.requiredActionText}</span>
          </p>
        </div>

        <div className="p-3.5 bg-emerald-50 rounded-2xl border-2 border-emerald-200 text-[11px] text-emerald-950 font-extrabold space-y-1 shadow-sm">
          <span className="text-[10px] font-mono font-black text-emerald-800 uppercase block flex items-center gap-1">
            <Lightbulb className="w-3.5 h-3.5 text-amber-500" /> WHY THIS MATTERS
          </span>
          <p className="text-emerald-900">{currentStep.clinicalRationale}</p>
        </div>

        {/* Navigation Footer */}
        <div className="flex items-center justify-between pt-2 text-xs">
          <button
            type="button"
            disabled={currentStepIndex === 0}
            onClick={() => setCurrentStepIndex(prev => prev - 1)}
            className="text-slate-500 hover:text-slate-900 font-bold flex items-center gap-1 disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-4 h-4" /> Prev Step
          </button>

          <button
            type="button"
            onClick={() => {
              if (currentStepIndex < totalSteps - 1) {
                setCurrentStepIndex(prev => prev + 1);
              } else {
                completeGuide();
              }
            }}
            className="px-3.5 py-1.5 bg-orange-100 border-2 border-orange-300 text-[#F97316] font-black rounded-xl text-xs hover:bg-orange-200 cursor-pointer shadow-sm"
          >
            {currentStepIndex < totalSteps - 1 ? 'Preview next step →' : 'Finish guide only'}
          </button>
        </div>
      </div>
    </div>
  );

  return mounted ? createPortal(cardContent, document.body) : null;
}
