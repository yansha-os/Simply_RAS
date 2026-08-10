'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Target, ChevronRight, ChevronLeft, CheckCircle2, Sparkles, X, Lightbulb, Minimize2, Maximize2, Info, ArrowRight } from 'lucide-react';
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
    title: 'Active Live Sessions Hub',
    elementType: 'ACTIVE SESSIONS TAB',
    currentStepExplanation: 'You are currently viewing the Active Live Sessions tab. This tab displays real-time ticking EVV timers, live CPT 97153 units, and trial accuracy for therapy sessions currently in progress.',
    nextStepTitle: 'Step 2: Incomplete Notes & Claims Needed Tab',
    requiredActionText: 'Click the "Incomplete Notes / Claims Needed" Tab button above to explore unbilled session notes.',
    clinicalRationale: 'Rise & Shine ABA standard: RBTs can monitor active EVV clocks and jump right back into live data collection with 1 click.',
    targetElementId: 'tab-incomplete-sessions'
  },
  {
    stepNumber: 2,
    title: 'Incomplete Session Audits & 1-Click Fix',
    elementType: 'INCOMPLETE SESSIONS TAB',
    currentStepExplanation: 'You are now viewing the Incomplete Sessions tab. Session notes clocked out via EVV requiring missing caregiver signatures or SOAP summaries are flagged here with 1-click completion drawers.',
    nextStepTitle: 'Step 3: Upcoming Weekly Schedule Tab',
    requiredActionText: 'Click the "Upcoming Schedule" Tab button above to explore your session calendar.',
    clinicalRationale: 'Prevents incomplete documentation from stalling insurance claim submission and RBT payroll calculations.',
    targetElementId: 'tab-upcoming-schedule'
  },
  {
    stepNumber: 3,
    title: 'Upcoming Session Schedule Grid',
    elementType: 'UPCOMING SCHEDULE TAB',
    currentStepExplanation: 'You are now viewing the Upcoming Schedule tab. This matrix displays confirmed therapy sessions for the week, emergency call-out buttons, and EVV clock-in triggers.',
    nextStepTitle: 'Step 4: Completed & Rendered Claims Tab',
    requiredActionText: 'Click the "Completed & Rendered" Tab button above to inspect locked claims.',
    clinicalRationale: 'Gives RBTs full visibility into weekly assigned cases and 1-tap emergency sick day dispatching.',
    targetElementId: 'tab-completed-claims'
  },
  {
    stepNumber: 4,
    title: 'Completed & Rendered Claims Queue',
    elementType: 'COMPLETED CLAIMS TAB',
    currentStepExplanation: 'You are now viewing the Completed Claims tab. Sessions shown here are 100% audit-proof, dual-signed by parent and RBT, and locked for EDI 837P insurance claim payout.',
    nextStepTitle: 'Step 5: Return to Schedule to EVV Clock-In',
    requiredActionText: 'Click the "Upcoming Schedule" Tab button to locate today\'s session for clock-in.',
    clinicalRationale: 'Audit-proof claims guarantee zero payer denials and fast reimbursement for Rise & Shine ABA.',
    targetElementId: 'tab-upcoming-schedule'
  },
  {
    stepNumber: 5,
    title: 'Launch Today\'s Session EVV Clock-In',
    elementType: 'EVV CLOCK-IN BUTTON',
    currentStepExplanation: 'You are back on the Schedule tab. This green EVV Start Session button validates GPS location and opens the live EMR data collection engine.',
    nextStepTitle: 'Step 6: Ticking EVV Session Clock',
    requiredActionText: 'Click "▶️ EVV Start Session Data Collection"',
    clinicalRationale: '21st Century Cures Act requirement: EVV validates GPS location and exact session start timestamp.',
    targetElementId: 'btn-evv-start-session'
  },
  {
    stepNumber: 6,
    title: 'Active EVV Session Timer Badge',
    elementType: 'EVV CLOCK TIMER BADGE',
    currentStepExplanation: 'You are looking at the Active EVV Clock badge. It tracks ticking session duration and automatically calculates billable CPT 97153 units under 8-minute rounding rules.',
    nextStepTitle: 'Step 7: Procedure 1 - Discrete Trial Training (DTT)',
    requiredActionText: 'Click the ▶️ Start button on the active EVV clock badge at the top to start session timing.',
    clinicalRationale: 'EVV timers track exact billable minutes under CPT 97153 8-minute rounding rules.',
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
    title: 'Emergency Supervisory Signal & BIP Sheet',
    elementType: 'SUPERVISORY ALERT & PROTOCOL SHEET',
    currentStepExplanation: 'You are looking at the BCBA Emergency Signal button and BIP Protocol sheet trigger. This feature alerts your BCBA for live remote supervision during crisis situations.',
    nextStepTitle: 'Step 13: 1-Tap AI SOAP Note Assistant',
    requiredActionText: 'Click "🚨 Signal BCBA Supervisor" or "BIP Protocol Sheet"',
    clinicalRationale: 'Enables instant supervisory alerts during crisis events without leaving the data collection screen.',
    targetElementId: 'btn-signal-bcba'
  },
  {
    stepNumber: 13,
    title: '1-Tap AI SOAP Note Assistant',
    elementType: 'CLINICAL QUICK-CHIP ASSISTANT',
    currentStepExplanation: 'You are looking at the AI SOAP Note Assistant. Tapping clinical quick-chips automatically compiles audit-proof Subjective, Objective, Assessment, and Plan narratives.',
    nextStepTitle: 'Step 14: Caregiver E-Signature & Claim Submission',
    requiredActionText: 'Click "+ Alert & Happy" Clinical Quick-Chip',
    clinicalRationale: 'Quick-chips compile compliant clinical narratives in seconds while preserving accuracy.',
    targetElementId: 'chip-soap-subjective'
  },
  {
    stepNumber: 14,
    title: 'Caregiver E-Signature & Claim Payout',
    elementType: 'CAREGIVER SIGNATURE FIELD',
    currentStepExplanation: 'You are at the final Caregiver E-Signature input box and Submit trigger. Typing the parent name validates dual-signatures and locks the note for insurance reimbursement.',
    nextStepTitle: 'Tutorial Completed!',
    requiredActionText: 'Type "Elena Miller" in Parent Signature box & Click "Submit Audit-Proof Billing Claim"',
    clinicalRationale: 'Guarantees dual signatures and 5-point audit shield clearance for insurance claim payout.',
    targetElementId: 'input-parent-signature'
  }
];

export function ScribeGuideMeEngine({
  isActive,
  onClose,
  onGuideComplete,
  onStepChange
}: ScribeGuideMeEngineProps) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

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
        toast.success(`✓ Step ${currentStep.stepNumber} Complete! ${currentStep.title}`);

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
          toast.success('🎉 Scribe Interactive Guide Complete! You mastered Rise & Shine ABA Session management!');
          onGuideComplete();
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
  }, [isActive, currentStepIndex, currentStep, totalSteps, onGuideComplete, onStepChange]);

  if (!isActive) return null;

  // MINIMIZED SLEEK FLOATING PILL
  if (isMinimized) {
    const minimizedPill = (
      <div className="fixed bottom-6 right-6 z-[9999999] animate-fade-in pointer-events-auto select-none">
        <button
          onClick={() => setIsMinimized(false)}
          className="bg-white border-2 border-[#F97316] rounded-full px-4 py-2.5 shadow-2xl flex items-center gap-3 text-slate-900 font-extrabold text-xs hover:bg-orange-50 cursor-pointer transition-all"
        >
          <span className="w-6 h-6 rounded-full bg-[#F97316] text-white flex items-center justify-center font-black text-[10px] font-mono shadow-sm shrink-0">
            {currentStep.stepNumber}
          </span>
          <span className="max-w-[220px] truncate text-slate-900">🎓 Scribe ({currentStep.stepNumber}/{totalSteps}): {currentStep.title}</span>
          <Maximize2 className="w-4 h-4 text-[#F97316] shrink-0" />
        </button>
      </div>
    );
    return mounted ? createPortal(minimizedPill, document.body) : null;
  }

  const cardContent = (
    <div className="fixed bottom-6 right-6 max-w-md w-full z-[9999999] animate-fade-in pointer-events-auto select-none">
      {/* 🌟 100% ULTRA-PREMIUM LIGHT MODE CONTAINER */}
      <div className="bg-white border-4 border-[#F97316] rounded-3xl p-6 shadow-[0_20px_60px_rgba(249,115,22,0.35)] text-slate-900 space-y-4 relative opacity-100">
        {/* Step Counter Header */}
        <div className="flex items-center justify-between border-b-2 border-orange-100 pb-3">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-full bg-[#F97316] text-white flex items-center justify-center font-black text-xs font-mono shadow-md shrink-0">
              {currentStep.stepNumber}
            </span>
            <div>
              <span className="text-[10px] font-mono font-black text-[#F97316] uppercase tracking-widest block">
                SCRIBE TUTORIAL ({currentStep.stepNumber}/{totalSteps})
              </span>
              <h4 className="text-sm font-black font-heading text-slate-900">{currentStep.title}</h4>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {/* MINIMIZE BUTTON */}
            <button
              onClick={() => setIsMinimized(true)}
              title="Minimize Scribe Tutorial"
              className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 flex items-center justify-center cursor-pointer transition-all"
            >
              <Minimize2 className="w-3.5 h-3.5" />
            </button>

            {/* CLOSE BUTTON */}
            <button
              onClick={onClose}
              title="Close Scribe Tutorial"
              className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 flex items-center justify-center cursor-pointer transition-all"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="w-full bg-orange-100 h-2.5 rounded-full overflow-hidden border border-orange-200">
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

        {/* 🌟 3. CLINICAL RATIONALE BOX */}
        <div className="p-3.5 bg-emerald-50 rounded-2xl border-2 border-emerald-200 text-[11px] text-emerald-950 font-extrabold space-y-1 shadow-sm">
          <span className="text-[10px] font-mono font-black text-emerald-800 uppercase block flex items-center gap-1">
            <Lightbulb className="w-3.5 h-3.5 text-amber-500" /> CLINICAL RATIONALE
          </span>
          <p className="text-emerald-900">{currentStep.clinicalRationale}</p>
        </div>

        {/* Navigation Footer */}
        <div className="flex items-center justify-between pt-2 text-xs">
          <button
            disabled={currentStepIndex === 0}
            onClick={() => setCurrentStepIndex(prev => prev - 1)}
            className="text-slate-500 hover:text-slate-900 font-bold flex items-center gap-1 disabled:opacity-30 cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" /> Prev Step
          </button>

          <button
            onClick={() => {
              if (currentStepIndex < totalSteps - 1) {
                setCurrentStepIndex(prev => prev + 1);
              } else {
                onGuideComplete();
              }
            }}
            className="px-3.5 py-1.5 bg-orange-100 border-2 border-orange-300 text-[#F97316] font-black rounded-xl text-xs hover:bg-orange-200 cursor-pointer shadow-sm"
          >
            Next Step →
          </button>

          <button
            onClick={() => {
              if (currentStepIndex < totalSteps - 1) {
                setCurrentStepIndex(prev => prev + 1);
              } else {
                onGuideComplete();
              }
            }}
            className="text-[#F97316] hover:text-orange-600 font-black flex items-center gap-1 cursor-pointer"
          >
            Skip Step <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return mounted ? createPortal(cardContent, document.body) : null;
}
