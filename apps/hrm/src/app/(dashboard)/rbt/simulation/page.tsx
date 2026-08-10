'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import { RbtScheduleView } from '@/components/rbt/RbtScheduleView';
import { RbtDataCollectionEngine } from '@/components/emr/RbtDataCollectionEngine';
import { ScribeGuideMeEngine } from '@/components/emr/ScribeGuideMeEngine';
import { Button } from '@/components/ui/Button';
import { toast } from 'sonner';
import { Sparkles, CheckCircle2, ArrowRight, Play, Trophy, Calendar, BookOpen, Lock, Unlock } from 'lucide-react';

function SimulationContent() {
  const router = useRouter();
  const [activeView, setActiveView] = useState<'SCHEDULE_PRACTICE' | 'EMR_PRACTICE'>('SCHEDULE_PRACTICE');
  const [isGuideStarted, setIsGuideStarted] = useState(false);
  const [simCompleted, setSimCompleted] = useState(false);
  const [showTutorialPromptModal, setShowTutorialPromptModal] = useState(false);
  const [showCelebrationModal, setShowCelebrationModal] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const done = localStorage.getItem('ras_rbt_sim_completed') === 'true' || localStorage.getItem('ras_rbt_simulation_completed') === 'true';
    if (done) {
      setSimCompleted(true);
    } else {
      // Auto-trigger interactive tutorial prompt modal for new applicants
      setShowTutorialPromptModal(true);
    }
  }, []);

  const handleSimDone = () => {
    setSimCompleted(true);
    setIsGuideStarted(false);
    localStorage.setItem('ras_rbt_sim_completed', 'true');
    localStorage.setItem('ras_rbt_simulation_completed', 'true');

    const activeId = localStorage.getItem('ras_active_impersonated_applicant_id') || localStorage.getItem('ras_active_applicant_id');
    const activeEmail = localStorage.getItem('ras_active_impersonated_applicant_email');
    if (activeId) {
      localStorage.setItem(`ras_rbt_sim_completed_${activeId}`, 'true');
    }
    if (activeEmail) {
      localStorage.setItem(`ras_rbt_sim_completed_${activeEmail.toLowerCase().trim()}`, 'true');
    }

    window.dispatchEvent(new Event('rbt_sim_changed'));
    window.dispatchEvent(new Event('simulationCompleted'));
    window.dispatchEvent(new Event('storage'));
    setShowCelebrationModal(true);
  };

  const handleStartTutorial = () => {
    setShowTutorialPromptModal(false);
    setIsGuideStarted(true);
    toast.success('🚀 Interactive Practice Tutorial Started! Follow Scribe live visual guidance.');
  };

  if (simCompleted) {
    return (
      <div className="max-w-2xl mx-auto py-12 px-6 text-center select-none space-y-6 animate-fade-in">
        <div className="bg-white border-4 border-emerald-300 rounded-3xl p-8 sm:p-10 shadow-2xl space-y-6">
          <div className="w-20 h-20 rounded-3xl bg-emerald-100 border-2 border-emerald-300 text-emerald-700 flex items-center justify-center mx-auto shadow-md">
            <CheckCircle2 className="w-10 h-10 text-emerald-600" />
          </div>

          <div className="space-y-2">
            <span className="bg-emerald-100 text-emerald-800 border border-emerald-300 text-[10px] font-mono font-black px-3.5 py-1 rounded-full uppercase tracking-wider">
              ✓ REQUIREMENT COMPLETED
            </span>
            <h2 className="text-2xl font-black font-heading text-slate-900 tracking-tight">
              ABA Clinical Trial Simulator Passed (10/10 Accuracy)
            </h2>
            <p className="text-xs text-slate-600 font-semibold max-w-lg mx-auto leading-relaxed">
              Great job! You have successfully completed your mandatory ABA Data Collection Simulation. This requirement is complete. Please finish any remaining onboarding tasks on your <strong>My Tasks</strong> page.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row justify-center gap-3 pt-2">
            <button
              onClick={() => router.push('/rbt')}
              className="bg-[#F97316] hover:bg-orange-600 text-white font-black text-xs px-6 py-3.5 rounded-2xl shadow-xl cursor-pointer transition-all flex items-center justify-center gap-2"
            >
              <span>Go to My Tasks &amp; Complete Requirements →</span>
            </button>
            <button
              onClick={() => setSimCompleted(false)}
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs px-5 py-3.5 rounded-2xl cursor-pointer transition-all"
            >
              Re-Take Practice Simulation
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12 text-slate-900 select-none relative">
      {/* HEADER BAR WITH PROMPT BANNER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#F0F7FF] border-2 border-[#BFDBFE] p-5 rounded-3xl shadow-md">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-[#F97316] text-white flex items-center justify-center font-bold shadow-md">
            <Sparkles className="w-5 h-5 animate-spin" />
          </div>
          <div>
            <h2 className="text-base font-black text-slate-900 font-heading">
              Rise &amp; Shine ABA Data Simulation &amp; Session Management Hub
            </h2>
            <p className="text-[#F97316] font-bold text-xs mt-1">
              Interactive EMR &amp; Billing Practice Engine · Master Active EVV Clocks, Incomplete Audits, and 5 ABA Procedures
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button
            onClick={handleStartTutorial}
            variant="outline"
            className="bg-orange-50 hover:bg-orange-100 text-[#F97316] border-2 border-[#F97316] font-black text-xs px-4 py-2 rounded-2xl flex items-center gap-2 cursor-pointer shadow-md"
          >
            <Sparkles className="w-4 h-4 text-[#F97316] animate-pulse" />
            <span>Scribe Tutorial Engine</span>
          </Button>

          <span className="px-3.5 py-1.5 rounded-full text-xs font-black uppercase tracking-wide border shadow-sm bg-orange-100 text-[#F97316] border-orange-300">
            TUTORIAL IN PROGRESS
          </span>
        </div>
      </div>

      {/* PRIMARY VIEW: EXACT REPLICA OF THE SCHEDULE & SESSION HUB */}
      {activeView === 'SCHEDULE_PRACTICE' ? (
        <RbtScheduleView
          mode="SIMULATION"
          onStartEvvClick={() => setActiveView('EMR_PRACTICE')}
        />
      ) : (
        <RbtDataCollectionEngine
          mode="SIMULATION"
          onSimulationComplete={handleSimDone}
        />
      )}

      {/* 🚀 HANDS-ON SCRIBE GUIDE ME ENGINE */}
      <ScribeGuideMeEngine
        isActive={isGuideStarted}
        onClose={() => setIsGuideStarted(false)}
        onGuideComplete={handleSimDone}
      />

      {/* 🌟 CELEBRATION MODAL (ON TUTORIAL COMPLETION) */}
      {mounted && showCelebrationModal && createPortal(
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[9999999] flex items-center justify-center p-4">
          <div className="bg-white border-4 border-[#F97316] rounded-3xl max-w-lg w-full p-8 space-y-6 shadow-[0_20px_60px_rgba(249,115,22,0.4)] text-slate-900 animate-fade-in text-center relative z-[10000000]">
            <div className="w-20 h-20 rounded-3xl bg-gradient-to-tr from-amber-400 to-[#F97316] text-white flex items-center justify-center font-bold mx-auto shadow-2xl animate-bounce">
              <Trophy className="w-10 h-10 text-yellow-100" />
            </div>

            <div className="space-y-2">
              <span className="bg-emerald-100 text-emerald-800 border border-emerald-300 text-[10px] font-mono font-black px-3 py-1 rounded-full uppercase tracking-wider">
                ✓ ONBOARDING REQUIREMENT MET
              </span>
              <h3 className="text-2xl font-black font-heading text-slate-900 tracking-tight">
                🎉 Congratulations! You Completed the Simple Data Simulation!
              </h3>
              <p className="text-xs text-slate-600 font-semibold leading-relaxed">
                You have successfully completed one of your mandatory Rise &amp; Shine ABA onboarding requirements.
              </p>
            </div>

            {/* UNLOCKED SCHEDULE TAB BADGE */}
            <div className="p-4 bg-emerald-50 rounded-2xl border-2 border-emerald-200 text-xs text-left space-y-1 text-emerald-950 shadow-sm">
              <span className="font-mono font-black text-emerald-800 uppercase text-[10px] flex items-center gap-1">
                <Unlock className="w-4 h-4 text-emerald-600" /> MY SCHEDULE TAB UNLOCKED
              </span>
              <p className="font-extrabold text-slate-800">
                You now have full access to your official <strong>My Schedule &amp; Calendar</strong> tab in your navigation menu!
              </p>
            </div>

            {/* VIDEO RESOURCES REFRESHER BOX */}
            <div className="p-4 bg-orange-50 rounded-2xl border-2 border-orange-200 text-xs text-left space-y-1 text-slate-900 shadow-sm">
              <span className="font-mono font-black text-[#F97316] uppercase text-[10px] flex items-center gap-1">
                <BookOpen className="w-4 h-4 text-[#F97316]" /> NEED A REFRESHER LATER?
              </span>
              <p className="font-bold text-slate-700">
                If you ever need more information or video guides on how to complete session notes and data collection, check out the <strong>Resources tab</strong> anytime!
              </p>
            </div>

            <div className="pt-2 flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowCelebrationModal(false);
                  router.push('/rbt/resources');
                }}
                className="w-full sm:w-1/2 px-4 py-3.5 rounded-2xl border-2 border-orange-300 bg-orange-50 hover:bg-orange-100 text-[#F97316] font-black text-xs cursor-pointer flex items-center justify-center gap-1.5"
              >
                <BookOpen className="w-4 h-4" />
                <span>View Video Resources</span>
              </button>

              <Button
                type="button"
                onClick={() => {
                  setShowCelebrationModal(false);
                  router.push('/rbt/schedule');
                }}
                className="w-full sm:w-1/2 bg-[#F97316] hover:bg-orange-600 text-white font-black text-xs py-4 rounded-2xl shadow-xl flex items-center justify-center gap-2 cursor-pointer text-sm"
              >
                <Calendar className="w-4 h-4" />
                <span>Go to My Schedule →</span>
              </Button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* 🚀 FIRST-VISIT "BEGIN GUIDED TUTORIAL" MODAL PROMPT PORTAL TO BODY */}
      {mounted && showTutorialPromptModal && createPortal(
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[999999] flex items-center justify-center p-4">
          <div className="bg-slate-950 border-4 border-[#F97316] rounded-3xl max-w-lg w-full p-8 space-y-6 shadow-[0_10px_50px_rgba(249,115,22,0.6)] text-white animate-fade-in text-center relative z-[1000000]">
            <div className="w-16 h-16 rounded-3xl bg-[#F97316] text-white flex items-center justify-center font-bold mx-auto shadow-xl">
              <Sparkles className="w-8 h-8 text-yellow-200 animate-spin" />
            </div>

            <div className="space-y-2">
              <h3 className="text-2xl font-black font-heading text-white tracking-tight">
                Welcome to Rise &amp; Shine ABA Session &amp; Schedule Tutorial!
              </h3>
              <p className="text-xs text-slate-300 font-semibold leading-relaxed">
                Learn how to manage <strong>Active Live Sessions</strong>, resolve <strong>Incomplete Session Notes</strong> in 1 click, and perform live trial data collection.
              </p>
            </div>

            <div className="p-4 bg-slate-900 rounded-2xl border border-slate-800 text-xs text-left space-y-2 text-slate-300">
              <p className="font-bold text-orange-300 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" /> What you will master in this 2-minute tutorial:
              </p>
              <ul className="space-y-1 list-disc list-inside text-[11px] font-medium text-slate-300">
                <li>Resuming <strong>Active Live Sessions</strong> with real-time EVV ticking</li>
                <li>Resolving <strong>Incomplete Sessions</strong> via 1-click Fix Drawer</li>
                <li>Requesting emergency sick day call-outs to Marcus Vance</li>
                <li>Logging DTT trials, prompt levels, and rendering 837P EDI claims</li>
              </ul>
            </div>

            <div className="pt-2 flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={() => setShowTutorialPromptModal(false)}
                className="w-full sm:w-1/3 px-4 py-3.5 rounded-2xl border-2 border-slate-700 text-xs font-bold text-slate-400 hover:text-white cursor-pointer"
              >
                Explore Alone
              </button>
              <Button
                type="button"
                onClick={handleStartTutorial}
                className="w-full sm:w-2/3 bg-[#F97316] hover:bg-orange-600 text-white font-black text-xs py-4 rounded-2xl shadow-xl flex items-center justify-center gap-2 cursor-pointer text-sm"
              >
                <span>Begin Guided Tutorial</span>
                <ArrowRight className="w-4 h-4" />
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
      <div className="p-8 text-center font-black text-slate-500 animate-pulse">
        Loading Data Simulation &amp; Schedule Practice Hub...
      </div>
    }>
      <SimulationContent />
    </Suspense>
  );
}
