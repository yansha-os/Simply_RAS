'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  Calendar, 
  Clock, 
  MapPin, 
  User, 
  Video, 
  CheckCircle2, 
  AlertTriangle, 
  FileText, 
  Plus, 
  ChevronLeft, 
  ChevronRight,
  ShieldCheck,
  Send,
  X,
  Play,
  Pause,
  Sparkles,
  Check,
  Lock,
  ClipboardList
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { toast } from 'sonner';
import Link from 'next/link';
import { FixIncompleteSessionDrawer, IncompleteSessionItem } from './FixIncompleteSessionDrawer';

interface ScheduledSession {
  id: string;
  client: string;
  age: number;
  bcba: string;
  date: string;
  dayOfWeek: string;
  time: string;
  location: string;
  status: 'CONFIRMED' | 'UPCOMING' | 'COVERAGE_REQUESTED';
  draftNoteCreated: boolean;
}

interface ActiveSessionItem {
  id: string;
  client: string;
  age: number;
  bcba: string;
  location: string;
  elapsedSeconds: number;
  isClockRunning: boolean;
  loggedTrials: number;
  accuracyPercent: number;
  cptUnits: number;
}

interface RbtScheduleViewProps {
  mode?: 'SIMULATION' | 'LIVE';
  onStartEvvClick?: () => void;
}

export function RbtScheduleView({ mode = 'LIVE', onStartEvvClick }: RbtScheduleViewProps) {
  const [activeTab, setActiveTab] = useState<'ACTIVE' | 'INCOMPLETE' | 'SCHEDULE' | 'COMPLETED'>('ACTIVE');
  const [viewMode, setViewMode] = useState<'CALENDAR' | 'TIMELINE'>('CALENDAR');
  const [showSickDayModal, setShowSickDayModal] = useState(false);
  const [selectedSessionForSick, setSelectedSessionForSick] = useState<ScheduledSession | null>(null);
  const [mounted, setMounted] = useState(false);

  // Incomplete Drawer State
  const [selectedIncompleteSession, setSelectedIncompleteSession] = useState<IncompleteSessionItem | null>(null);
  const [isIncompleteDrawerOpen, setIsIncompleteDrawerOpen] = useState(false);

  // Active Session Timer State
  const [activeSessionSeconds, setActiveSessionSeconds] = useState(6320); // ~1h 45m initial
  const [isActiveClockRunning, setIsActiveClockRunning] = useState(true);

  // Sick Day Form State
  const [sickReason, setSickReason] = useState('Sudden Illness / Sick Day');
  const [sickNote, setSickNote] = useState('');

  const [reqStatus, setReqStatus] = useState({
    tasksDone: false,
    interviewBooked: false,
    availabilitySet: false,
    simCompleted: false,
    isCleared: false
  });

  useEffect(() => {
    setMounted(true);
    const checkStatus = () => {
      const tasksDone = localStorage.getItem('ras_rbt_tasks_done') === 'true';
      const interviewBooked = localStorage.getItem('ras_rbt_interview_done') === 'true';
      const availabilitySet = localStorage.getItem('ras_rbt_availability_set') === 'true';
      const simCompleted = localStorage.getItem('ras_rbt_sim_completed') === 'true' || localStorage.getItem('ras_rbt_simulation_completed') === 'true';
      const isCleared = localStorage.getItem('ras_rbt_cleared') === 'true';

      setReqStatus({ tasksDone, interviewBooked, availabilitySet, simCompleted, isCleared });
    };

    checkStatus();
    window.addEventListener('rbt_sim_changed', checkStatus);
    window.addEventListener('simulationCompleted', checkStatus);
    window.addEventListener('rbt_clearance_changed', checkStatus);
    window.addEventListener('rbt_tasks_changed', checkStatus);
    window.addEventListener('rbt_availability_changed', checkStatus);
    return () => {
      window.removeEventListener('rbt_sim_changed', checkStatus);
      window.removeEventListener('simulationCompleted', checkStatus);
      window.removeEventListener('rbt_clearance_changed', checkStatus);
      window.removeEventListener('rbt_tasks_changed', checkStatus);
    };
  }, []);

  const formatSeconds = (sec: number) => {
    const hrs = Math.floor(sec / 3600);
    const mins = Math.floor((sec % 3600) / 60);
    const secs = sec % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const activeBillableUnits = Math.round(Math.floor(activeSessionSeconds / 60) / 15);
  const isScheduleUnlocked = reqStatus.isCleared || (reqStatus.tasksDone && reqStatus.interviewBooked && reqStatus.simCompleted);

  const [activeSession] = useState<ActiveSessionItem | null>(
    mode === 'SIMULATION'
      ? {
          id: 'act-1',
          client: 'Leo Miller',
          age: 6,
          bcba: 'Dr. Sarah Jenkins, BCBA',
          location: '12 - Home Session · Park Slope, Brooklyn',
          elapsedSeconds: activeSessionSeconds,
          isClockRunning: true,
          loggedTrials: 14,
          accuracyPercent: 85,
          cptUnits: activeBillableUnits
        }
      : null
  );

  const [incompleteSessions, setIncompleteSessions] = useState<IncompleteSessionItem[]>(
    mode === 'SIMULATION'
      ? [
          {
            id: 'inc-1',
            client: 'Maya Rodriguez',
            age: 4,
            bcba: 'Marcus Vance, BCBA',
            date: '2026-08-03',
            time: '03:30 PM - 05:30 PM',
            location: '03 - School Session · Astoria, Queens',
            cptCode: '97153 - Adaptive Behavior Treatment',
            missingReason: 'MISSING_PARENT_SIGNATURE',
            loggedTrialsCount: 18,
            rbtSignature: 'Sarah Jenkins, BT',
            parentSignature: '',
            soapSummary: 'Client engaged in DTT trials. Prompt fading applied successfully.'
          },
          {
            id: 'inc-2',
            client: 'Lucas Miller',
            age: 8,
            bcba: 'Dr. Sarah Jenkins, BCBA',
            date: '2026-08-02',
            time: '04:00 PM - 06:00 PM',
            location: '11 - Clinic Session · Upper West Side, NY',
            cptCode: '97153 - Adaptive Behavior Treatment',
            missingReason: 'MISSING_SOAP_NOTE',
            loggedTrialsCount: 12,
            rbtSignature: 'Sarah Jenkins, BT',
            parentSignature: 'Elena Miller',
            soapSummary: ''
          }
        ]
      : []
  );

  const [completedSessions, setCompletedSessions] = useState(
    mode === 'SIMULATION'
      ? [
          { id: 'cmp-1', client: 'Ethan Vance', date: '2026-08-01', time: '01:00 PM - 03:00 PM', units: 8, claimId: 'CLM-837P-9042', status: 'CLAIM_SUBMITTED' },
          { id: 'cmp-2', client: 'Leo Miller', date: '2026-07-31', time: '02:00 PM - 04:00 PM', units: 8, claimId: 'CLM-837P-8812', status: 'CLAIM_SUBMITTED' }
        ]
      : []
  );

  const [sessions, setSessions] = useState<ScheduledSession[]>(
    mode === 'SIMULATION'
      ? [
          { 
            id: 's1', 
            client: 'Leo Miller', 
            age: 6, 
            bcba: 'Dr. Sarah Jenkins, BCBA', 
            date: '2026-08-10', 
            dayOfWeek: 'Monday', 
            time: '02:00 PM - 04:00 PM', 
            location: '12 - Home Session · Park Slope, Brooklyn', 
            status: 'CONFIRMED',
            draftNoteCreated: true 
          },
          { 
            id: 's2', 
            client: 'Maya Rodriguez', 
            age: 4, 
            bcba: 'Marcus Vance, BCBA', 
            date: '2026-08-11', 
            dayOfWeek: 'Tuesday', 
            time: '03:30 PM - 05:30 PM', 
            location: '03 - School Session · Astoria, Queens', 
            status: 'UPCOMING',
            draftNoteCreated: true 
          },
          { 
            id: 's3', 
            client: 'Lucas Miller', 
            age: 8, 
            bcba: 'Dr. Sarah Jenkins, BCBA', 
            date: '2026-08-13', 
            dayOfWeek: 'Thursday', 
            time: '04:00 PM - 06:00 PM', 
            location: '11 - Clinic Session · Upper West Side, NY', 
            status: 'UPCOMING',
            draftNoteCreated: false 
          },
          { 
            id: 's4', 
            client: 'Ethan Vance', 
            age: 5, 
            bcba: 'Dr. Amanda Chen', 
            date: '2026-08-14', 
            dayOfWeek: 'Friday', 
            time: '01:00 PM - 03:00 PM', 
            location: '12 - Home Session · Riverdale, Bronx', 
            status: 'UPCOMING',
            draftNoteCreated: false 
          }
        ]
      : []
  );

  if (!mounted) {
    return (
      <div className="max-w-4xl mx-auto py-12 text-center select-none font-black text-slate-400 animate-pulse">
        Checking Onboarding Clearance Status...
      </div>
    );
  }

  if (mode === 'LIVE' && !isScheduleUnlocked) {
    return (
      <div className="max-w-4xl mx-auto py-12 px-6 text-center select-none space-y-6 animate-fade-in">
        <div className="bg-white border-4 border-orange-200 rounded-3xl p-8 sm:p-10 shadow-2xl space-y-6">
          <div className="w-20 h-20 rounded-3xl bg-amber-100 border-2 border-amber-300 text-amber-700 flex items-center justify-center mx-auto shadow-md">
            <Lock className="w-10 h-10 text-[#F97316]" />
          </div>

          <div className="space-y-2">
            <span className="bg-amber-100 text-amber-800 border border-amber-300 text-[10px] font-mono font-black px-3.5 py-1 rounded-full uppercase tracking-wider">
              🔒 ONBOARDING REQUIREMENTS PENDING
            </span>
            <h2 className="text-2xl font-black font-heading text-slate-900 tracking-tight">
              My Schedule &amp; Calendar Tab Locked
            </h2>
            <p className="text-xs text-slate-600 font-semibold max-w-lg mx-auto leading-relaxed">
              You must complete your required onboarding tasks (specifically the Scribe Data Simulation) on your <strong>My Tasks page</strong> before accessing your live schedule.
            </p>
          </div>

          {/* DYNAMIC REQUIREMENTS CHECKLIST */}
          <div className="p-5 bg-slate-50 border-2 border-slate-200 rounded-2xl text-left space-y-3 max-w-lg mx-auto">
            <h4 className="text-xs font-black text-slate-900 font-heading uppercase tracking-wider border-b border-slate-200 pb-2">
              📋 Your Onboarding Requirement Status:
            </h4>
            <div className="space-y-2 text-xs font-extrabold">
              <div className={`p-2.5 rounded-xl border flex items-center justify-between ${reqStatus.tasksDone ? 'bg-emerald-50 border-emerald-300 text-emerald-900' : 'bg-rose-50 border-rose-300 text-rose-900'}`}>
                <span className="flex items-center gap-2">
                  {reqStatus.tasksDone ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <Clock className="w-4 h-4 text-rose-500" />}
                  REQ 1: E-Signatures &amp; Forms
                </span>
                <span className="text-[10px] font-mono font-black">{reqStatus.tasksDone ? '✓ COMPLETED' : '❌ PENDING'}</span>
              </div>

              <div className={`p-2.5 rounded-xl border flex items-center justify-between ${reqStatus.interviewBooked ? 'bg-emerald-50 border-emerald-300 text-emerald-900' : 'bg-rose-50 border-rose-300 text-rose-900'}`}>
                <span className="flex items-center gap-2">
                  {reqStatus.interviewBooked ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <Clock className="w-4 h-4 text-rose-500" />}
                  REQ 2: HR Interview Slot
                </span>
                <span className="text-[10px] font-mono font-black">{reqStatus.interviewBooked ? '✓ SCHEDULED' : '❌ PENDING'}</span>
              </div>

              <div className={`p-2.5 rounded-xl border flex items-center justify-between ${reqStatus.availabilitySet ? 'bg-emerald-50 border-emerald-300 text-emerald-900' : 'bg-rose-50 border-rose-300 text-rose-900'}`}>
                <span className="flex items-center gap-2">
                  {reqStatus.availabilitySet ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <Clock className="w-4 h-4 text-rose-500" />}
                  REQ 3: Work Availability Grid
                </span>
                <span className="text-[10px] font-mono font-black">{reqStatus.availabilitySet ? '✓ CONFIGURATION DONE' : '❌ PENDING'}</span>
              </div>

              <div className={`p-2.5 rounded-xl border flex items-center justify-between ${reqStatus.simCompleted ? 'bg-emerald-50 border-emerald-300 text-emerald-900' : 'bg-rose-50 border-rose-300 text-rose-900'}`}>
                <span className="flex items-center gap-2">
                  {reqStatus.simCompleted ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <Clock className="w-4 h-4 text-rose-500" />}
                  REQ 4: Data Simulation Tutorial (Required for Schedule)
                </span>
                <span className="text-[10px] font-mono font-black">{reqStatus.simCompleted ? '✓ SIMULATION PASSED' : '❌ UNRESOLVED'}</span>
              </div>
            </div>
          </div>

          <div className="pt-2 flex flex-col sm:flex-row justify-center gap-3">
            {!reqStatus.simCompleted && (
              <Link
                href="/rbt/simulation"
                className="inline-flex items-center justify-center gap-2 bg-[#F97316] hover:bg-orange-600 text-white font-black text-xs px-6 py-4 rounded-2xl shadow-xl transition-all cursor-pointer"
              >
                <Sparkles className="w-4.5 h-4.5 text-yellow-200 animate-spin" />
                <span>Launch Scribe Data Simulation Now →</span>
              </Link>
            )}
            <Link
              href="/rbt"
              className="inline-flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white font-black text-xs px-6 py-4 rounded-2xl shadow-xl transition-all cursor-pointer"
            >
              <ClipboardList className="w-4.5 h-4.5" />
              <span>Go to My Tasks Checklist →</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const handleOpenSickModal = (session?: ScheduledSession) => {
    setSelectedSessionForSick(session || null);
    setShowSickDayModal(true);
  };

  const handleSubmitSickDayRequest = (e: React.FormEvent) => {
    e.preventDefault();

    if (selectedSessionForSick) {
      setSessions(prev => prev.map(s => s.id === selectedSessionForSick.id ? { ...s, status: 'COVERAGE_REQUESTED' } : s));
    }

    setShowSickDayModal(false);
    toast.success('Sick Day & Emergency Coverage Request sent to Case Coordinator (Marcus Vance) & HR Dispatch!');
  };

  const handleOpenFixDrawer = (session: IncompleteSessionItem) => {
    setSelectedIncompleteSession(session);
    setIsIncompleteDrawerOpen(true);
  };

  const handleFixComplete = (sessionId: string) => {
    setIncompleteSessions(prev => prev.filter(s => s.id !== sessionId));
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-12 text-slate-900 select-none">
      {/* Header Banner */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-orange-200 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <Calendar className="w-7 h-7 text-[#F97316]" />
            <h1 className="text-3xl font-black text-slate-900 font-heading tracking-tight">
              {mode === 'SIMULATION' ? 'Practice Therapy Session Schedule & Calendar' : 'My Therapy Session Schedule & Calendar'}
            </h1>
          </div>
          <p className="text-xs text-slate-600 font-semibold mt-1">
            {mode === 'SIMULATION'
              ? 'Practice managing active sessions, resolving incomplete notes, and viewing upcoming schedules.'
              : 'Manage live active sessions, resolve incomplete session notes, and dispatch emergency sick day call-outs.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* 🚨 REQUEST SICK DAY / CALL-OUT BUTTON */}
          <button
            onClick={() => handleOpenSickModal()}
            data-scribe-id="btn-request-sick-day"
            className="bg-rose-500 hover:bg-rose-600 text-white font-black text-xs px-4 py-2.5 rounded-2xl shadow-lg flex items-center gap-2 transition-all cursor-pointer"
          >
            <AlertTriangle className="w-4 h-4 text-yellow-200" />
            <span>Request Sick Day / Call-Out</span>
          </button>
        </div>
      </div>

      {/* 🌟 4-TAB FILTER STRIP (RISE & SHINE ABA STANDARD) */}
      <div className="flex flex-wrap border-b border-orange-200 gap-2">
        <button
          onClick={() => setActiveTab('ACTIVE')}
          data-scribe-id="tab-active-sessions"
          className={`px-4 py-3 font-heading font-black text-xs rounded-t-2xl transition-all cursor-pointer flex items-center gap-2 ${
            activeTab === 'ACTIVE'
              ? 'bg-white border-2 border-b-0 border-orange-200 text-[#F97316] shadow-sm'
              : 'bg-[#F0F7FF] text-slate-600 border border-blue-200 hover:text-slate-900'
          }`}
        >
          <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse" />
          <span>Active Live Sessions (1)</span>
        </button>

        <button
          onClick={() => setActiveTab('INCOMPLETE')}
          data-scribe-id="tab-incomplete-sessions"
          className={`px-4 py-3 font-heading font-black text-xs rounded-t-2xl transition-all cursor-pointer flex items-center gap-2 ${
            activeTab === 'INCOMPLETE'
              ? 'bg-white border-2 border-b-0 border-orange-200 text-[#F97316] shadow-sm'
              : 'bg-[#F0F7FF] text-slate-600 border border-blue-200 hover:text-slate-900'
          }`}
        >
          <AlertTriangle className="w-4 h-4 text-amber-500" />
          <span>Incomplete Notes / Claims Needed ({incompleteSessions.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('SCHEDULE')}
          data-scribe-id="tab-upcoming-schedule"
          className={`px-4 py-3 font-heading font-black text-xs rounded-t-2xl transition-all cursor-pointer flex items-center gap-2 ${
            activeTab === 'SCHEDULE'
              ? 'bg-white border-2 border-b-0 border-orange-200 text-[#F97316] shadow-sm'
              : 'bg-[#F0F7FF] text-slate-600 border border-blue-200 hover:text-slate-900'
          }`}
        >
          <Calendar className="w-4 h-4 text-[#F97316]" />
          <span>Upcoming Schedule ({sessions.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('COMPLETED')}
          data-scribe-id="tab-completed-claims"
          className={`px-4 py-3 font-heading font-black text-xs rounded-t-2xl transition-all cursor-pointer flex items-center gap-2 ${
            activeTab === 'COMPLETED'
              ? 'bg-white border-2 border-b-0 border-orange-200 text-[#F97316] shadow-sm'
              : 'bg-[#F0F7FF] text-slate-600 border border-blue-200 hover:text-slate-900'
          }`}
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span>Completed &amp; Rendered ({completedSessions.length})</span>
        </button>
      </div>

      {/* 🔴 TAB 1: ACTIVE LIVE SESSIONS VIEW */}
      {activeTab === 'ACTIVE' && (
        <div className="bg-white border-2 border-orange-200 rounded-3xl p-6 sm:p-8 space-y-6 shadow-xl">
          <div className="flex items-center justify-between border-b border-orange-100 pb-4">
            <div>
              <h3 className="text-lg font-black text-slate-900 font-heading flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-rose-500 animate-pulse" /> Active Session in Progress
              </h3>
              <p className="text-xs text-slate-600 font-semibold mt-0.5">
                Real-time ticking EVV timer and live trial data collector ticker.
              </p>
            </div>
            <span className="bg-rose-100 text-rose-800 border border-rose-300 text-[10px] font-black px-3 py-1 rounded-full uppercase">
              LIVE EVV CLOCK RUNNING
            </span>
          </div>

          {activeSession ? (
            <div className="p-6 bg-white border-2 border-orange-200 rounded-3xl shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <h4 className="text-xl font-black font-heading text-[#F97316]">{activeSession.client}</h4>
                  <span className="bg-orange-100 text-[#F97316] border border-orange-300 text-[10px] font-black font-mono px-2.5 py-0.5 rounded-full">
                    Age {activeSession.age}
                  </span>
                  <span className="bg-emerald-100 text-emerald-800 border border-emerald-300 text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> EVV VERIFIED
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-4 text-xs font-extrabold text-slate-700">
                  <span className="flex items-center gap-1.5"><MapPin className="w-4 h-4 text-purple-600" /> {activeSession.location}</span>
                  <span className="flex items-center gap-1.5"><User className="w-4 h-4 text-blue-600" /> {activeSession.bcba}</span>
                </div>

                <div className="flex flex-wrap items-center gap-3 text-xs pt-1">
                  <div className="bg-emerald-50 border-2 border-emerald-200 px-3.5 py-1.5 rounded-2xl font-mono text-emerald-900 font-black">
                    Logged: {activeSession.loggedTrials} DTT Trials ({activeSession.accuracyPercent}% Accuracy)
                  </div>
                  <div className="bg-orange-50 border-2 border-orange-200 px-3.5 py-1.5 rounded-2xl font-mono text-[#F97316] font-black">
                    Units: {activeBillableUnits}.0 CPT 97153 Units
                  </div>
                </div>
              </div>

              {/* LIVE CLOCK & RESUME ACTION */}
              <div className="flex flex-col items-end gap-3 border-t md:border-t-0 md:border-l border-orange-100 pt-4 md:pt-0 md:pl-6">
                <div className="bg-orange-50/90 border-2 border-[#F97316] px-4 py-2 rounded-2xl text-right shadow-md">
                  <span className="text-[9px] font-mono font-black text-[#F97316] uppercase tracking-widest block">Active Elapsed EVV Time</span>
                  <span className="text-xl font-mono font-black text-slate-900">{formatSeconds(activeSessionSeconds)}</span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsActiveClockRunning(!isActiveClockRunning)}
                    className="p-2.5 rounded-xl bg-slate-100 border border-slate-300 text-slate-700 hover:bg-slate-200 cursor-pointer transition-all"
                  >
                    {isActiveClockRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 text-emerald-600" />}
                  </button>

                  {onStartEvvClick ? (
                    <button
                      type="button"
                      onClick={onStartEvvClick}
                      data-scribe-id="btn-resume-live-session"
                      className="bg-[#F97316] hover:bg-orange-600 text-white font-black text-xs px-6 py-3 rounded-2xl shadow-xl flex items-center gap-2 transition-all cursor-pointer"
                    >
                      <span>▶️ Resume Session Data Collection</span>
                    </button>
                  ) : (
                    <Link
                      href="/rbt/simulation"
                      data-scribe-id="btn-resume-live-session"
                      className="bg-[#F97316] hover:bg-orange-600 text-white font-black text-xs px-6 py-3 rounded-2xl shadow-xl flex items-center gap-2 transition-all cursor-pointer"
                    >
                      <span>▶️ Resume Session Data Collection</span>
                    </Link>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="p-8 text-center bg-slate-50 border-2 border-dashed border-slate-200 rounded-3xl space-y-2">
              <div className="w-10 h-10 rounded-2xl bg-orange-100 text-[#F97316] flex items-center justify-center font-bold mx-auto">
                <Clock className="w-5 h-5 text-[#F97316]" />
              </div>
              <h4 className="text-sm font-black text-slate-900 font-heading">No Live Active Session Currently in Progress</h4>
              <p className="text-xs text-slate-500 font-medium max-w-sm mx-auto">
                Clock into an assigned shift on your <strong>Upcoming Schedule</strong> tab to launch live EVV tracking.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ⚠️ TAB 2: INCOMPLETE NOTES / CLAIMS NEEDED VIEW */}
      {activeTab === 'INCOMPLETE' && (
        <div className="bg-white border-2 border-orange-200 rounded-3xl p-6 sm:p-8 space-y-6 shadow-xl">
          <div className="flex items-center justify-between border-b border-orange-100 pb-4">
            <div>
              <h3 className="text-lg font-black text-slate-900 font-heading flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-500" /> Incomplete Sessions Needing Attention
              </h3>
              <p className="text-xs text-slate-600 font-semibold mt-0.5">
                Sessions clocked out via EVV requiring missing caregiver signature or SOAP narrative before insurance claim payout.
              </p>
            </div>
            <span className="bg-amber-100 text-amber-900 border border-amber-300 text-[10px] font-black px-3 py-1 rounded-full uppercase">
              ACTION REQUIRED ({incompleteSessions.length})
            </span>
          </div>

          <div className="space-y-4">
            {incompleteSessions.length === 0 ? (
              <div className="p-8 text-center bg-emerald-50 rounded-3xl border border-emerald-200 space-y-2">
                <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
                <h4 className="font-black text-slate-900 text-sm">All Sessions Are Complete &amp; Rendered!</h4>
                <p className="text-xs text-slate-600">Great job! All your session notes have parent signatures and complete SOAP narratives.</p>
              </div>
            ) : (
              incompleteSessions.map((session) => (
                <div
                  key={session.id}
                  className="bg-amber-50/60 border-2 border-amber-300 rounded-3xl p-6 shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <h4 className="text-lg font-black text-slate-900 font-heading">{session.client}</h4>
                      <span className="bg-amber-200 text-amber-900 border border-amber-300 text-[10px] font-mono font-black px-2.5 py-0.5 rounded-full">
                        ⚠️ {session.missingReason.replace(/_/g, ' ')}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-4 text-xs font-semibold text-slate-600">
                      <span className="flex items-center gap-1"><Calendar className="w-4 h-4 text-[#F97316]" /> {session.date}</span>
                      <span className="flex items-center gap-1"><Clock className="w-4 h-4 text-[#F97316]" /> {session.time}</span>
                      <span className="flex items-center gap-1"><MapPin className="w-4 h-4 text-purple-600" /> {session.location}</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleOpenFixDrawer(session)}
                    data-scribe-id="btn-fix-incomplete-session"
                    className="bg-[#F97316] hover:bg-orange-600 text-white font-black text-xs px-6 py-3.5 rounded-2xl shadow-lg cursor-pointer transition-all flex items-center justify-center gap-2"
                  >
                    <span>Fix &amp; Render Audit-Proof Claim →</span>
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* 📅 TAB 3: UPCOMING SCHEDULE VIEW */}
      {activeTab === 'SCHEDULE' && (
        <>
          {/* VIEW MODE TOGGLE STRIP */}
          <div className="flex justify-end">
            <div className="bg-[#F0F7FF] border-2 border-[#BFDBFE] p-1 rounded-2xl flex items-center gap-1">
              <button
                onClick={() => setViewMode('CALENDAR')}
                className={`px-3 py-1.5 rounded-xl font-extrabold text-xs transition-all cursor-pointer ${
                  viewMode === 'CALENDAR' ? 'bg-[#F97316] text-white shadow-sm' : 'text-slate-700 hover:text-slate-900'
                }`}
              >
                📅 Calendar Grid
              </button>
              <button
                onClick={() => setViewMode('TIMELINE')}
                className={`px-3 py-1.5 rounded-xl font-extrabold text-xs transition-all cursor-pointer ${
                  viewMode === 'TIMELINE' ? 'bg-[#F97316] text-white shadow-sm' : 'text-slate-700 hover:text-slate-900'
                }`}
              >
                📋 Timeline Feed
              </button>
            </div>
          </div>

          {viewMode === 'CALENDAR' ? (
            <div className="bg-white border-2 border-orange-200 rounded-3xl p-6 shadow-xl space-y-6">
              <div className="flex items-center justify-between border-b border-orange-100 pb-4">
                <div className="flex items-center gap-2">
                  <span className="text-base font-black text-slate-900 font-heading">August 2026 — Weekly Schedule</span>
                  <span className="bg-orange-100 text-[#F97316] border border-orange-300 text-[10px] font-black px-2.5 py-0.5 rounded-full">
                    {sessions.length} Upcoming Sessions
                  </span>
                </div>

                <div className="flex items-center gap-2 text-xs font-bold text-slate-600">
                  <button className="p-2 hover:bg-orange-50 rounded-xl cursor-pointer"><ChevronLeft className="w-4 h-4" /></button>
                  <span>Aug 10 – Aug 16</span>
                  <button className="p-2 hover:bg-orange-50 rounded-xl cursor-pointer"><ChevronRight className="w-4 h-4" /></button>
                </div>
              </div>

              {/* 7-DAY CALENDAR MATRIX */}
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                {['Monday (Aug 10)', 'Tuesday (Aug 11)', 'Wednesday (Aug 12)', 'Thursday (Aug 13)', 'Friday (Aug 14)'].map((dayStr, idx) => {
                  const dayName = dayStr.split(' ')[0];
                  const daySessions = sessions.filter(s => s.dayOfWeek === dayName);

                  return (
                    <div key={dayStr} className="bg-slate-50 border-2 border-slate-200 rounded-2xl p-3.5 space-y-3 min-h-[220px]">
                      <div className="border-b border-slate-200 pb-2 flex items-center justify-between">
                        <span className="text-xs font-black text-slate-900 font-heading">{dayStr}</span>
                        <span className="text-[10px] font-mono font-bold text-slate-400">{daySessions.length}</span>
                      </div>

                      {daySessions.length === 0 ? (
                        <div className="text-[11px] text-slate-400 font-semibold italic text-center pt-8">
                          No sessions scheduled
                        </div>
                      ) : (
                        daySessions.map((session) => (
                          <div
                            key={session.id}
                            className={`p-3 rounded-2xl border-2 space-y-2 transition-all shadow-sm ${
                              session.status === 'COVERAGE_REQUESTED'
                                ? 'bg-rose-50 border-rose-300'
                                : 'bg-white border-orange-200 hover:border-[#F97316]'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <strong className="text-xs font-extrabold text-slate-900">{session.client}</strong>
                              <span className={`text-[9px] font-mono font-black px-2 py-0.5 rounded border ${
                                session.status === 'COVERAGE_REQUESTED'
                                  ? 'bg-rose-100 text-rose-800 border-rose-300'
                                  : 'bg-emerald-100 text-emerald-800 border-emerald-300'
                              }`}>
                                {session.status === 'COVERAGE_REQUESTED' ? 'SICK CALL-OUT' : session.status}
                              </span>
                            </div>

                            <div className="text-[11px] text-slate-600 font-semibold space-y-0.5">
                              <p className="flex items-center gap-1"><Clock className="w-3 h-3 text-[#F97316]" /> {session.time}</p>
                              <p className="flex items-center gap-1 text-[10px] text-slate-500 truncate"><MapPin className="w-3 h-3 text-purple-600" /> {session.location}</p>
                            </div>

                            {/* CARD ACTIONS */}
                            <div className="flex flex-col gap-1.5 pt-1 border-t border-slate-100">
                              {onStartEvvClick ? (
                                <button
                                  type="button"
                                  onClick={onStartEvvClick}
                                  data-scribe-id="btn-evv-start-session"
                                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] py-1.5 rounded-xl text-center shadow-sm cursor-pointer"
                                >
                                  EVV Start Session →
                                </button>
                              ) : (
                                <Link
                                  href="/rbt/simulation"
                                  data-scribe-id="btn-evv-start-session"
                                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] py-1.5 rounded-xl text-center shadow-sm cursor-pointer"
                                >
                                  EVV Start Session →
                                </Link>
                              )}

                              {session.status !== 'COVERAGE_REQUESTED' && (
                                <button
                                  onClick={() => handleOpenSickModal(session)}
                                  className="text-[10px] font-bold text-rose-600 hover:underline text-left cursor-pointer"
                                >
                                  🚨 Request Sick Call-Out
                                </button>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {sessions.map((session) => (
                <div
                  key={session.id}
                  className={`bg-white border-2 rounded-3xl p-6 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all ${
                    session.status === 'COVERAGE_REQUESTED' ? 'border-rose-300 bg-rose-50/50' : 'border-orange-200 hover:border-[#F97316]'
                  }`}
                >
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <h3 className="text-lg font-black text-slate-900 font-heading">{session.client}</h3>
                      <span className="bg-orange-100 text-[#F97316] border border-orange-300 text-[10px] font-black px-2.5 py-0.5 rounded-full">
                        Age {session.age}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-4 text-xs font-semibold text-slate-600">
                      <span className="flex items-center gap-1.5 text-slate-900 font-bold"><Calendar className="w-4 h-4 text-[#F97316]" /> {session.dayOfWeek}, {session.date}</span>
                      <span className="flex items-center gap-1"><Clock className="w-4 h-4 text-[#F97316]" /> {session.time}</span>
                      <span className="flex items-center gap-1"><User className="w-4 h-4 text-blue-600" /> {session.bcba}</span>
                      <span className="flex items-center gap-1"><MapPin className="w-4 h-4 text-purple-600" /> {session.location}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {onStartEvvClick ? (
                      <button
                        type="button"
                        onClick={onStartEvvClick}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs px-5 py-3 rounded-2xl shadow-md cursor-pointer transition-all"
                      >
                        EVV Start Session
                      </button>
                    ) : (
                      <Link
                        href="/rbt/simulation"
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs px-5 py-3 rounded-2xl shadow-md cursor-pointer transition-all"
                      >
                        EVV Start Session
                      </Link>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ✅ TAB 4: COMPLETED & RENDERED CLAIMS VIEW */}
      {activeTab === 'COMPLETED' && (
        <div className="bg-white border-2 border-orange-200 rounded-3xl p-6 sm:p-8 space-y-6 shadow-xl">
          <div className="flex items-center justify-between border-b border-orange-100 pb-4">
            <div>
              <h3 className="text-lg font-black text-slate-900 font-heading flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" /> Completed &amp; Rendered Insurance Claims
              </h3>
              <p className="text-xs text-slate-600 font-semibold mt-0.5">
                Audit-proof SOAP notes signed by caregiver and formatted for EDI 837P insurance reimbursement.
              </p>
            </div>
            <span className="bg-emerald-100 text-emerald-800 border border-emerald-300 text-[10px] font-black px-3 py-1 rounded-full uppercase">
              {completedSessions.length} CLAIMS RENDERED
            </span>
          </div>

          <div className="space-y-3">
            {completedSessions.map((c) => (
              <div key={c.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex items-center justify-between text-xs font-semibold">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <strong className="text-slate-900 font-bold text-sm">{c.client}</strong>
                    <span className="bg-emerald-100 text-emerald-800 font-mono text-[10px] font-black px-2 py-0.5 rounded">✓ CLAIM READY</span>
                  </div>
                  <p className="text-slate-500">{c.date} ({c.time}) · {c.units}.0 Billable CPT 97153 Units</p>
                </div>

                <div className="text-right space-y-0.5">
                  <span className="text-[10px] font-mono text-slate-400 font-bold block">{c.claimId}</span>
                  <span className="text-emerald-700 font-black text-[11px]">✓ E-Signed &amp; BCBA Verified</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 🚨 SICK DAY / EMERGENCY TIME-OFF CALL-OUT MODAL */}
      {mounted && showSickDayModal && createPortal(
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[999999] flex items-center justify-center p-4">
          <div className="bg-white border-2 border-rose-300 rounded-3xl max-w-lg w-full p-6 sm:p-8 space-y-6 shadow-2xl animate-fade-in text-slate-900 relative z-[1000000]">
            <div className="flex items-center justify-between border-b border-rose-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-rose-100 border border-rose-300 text-rose-700 flex items-center justify-center font-bold">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900 font-heading">Request Sick Day / Call-Out</h3>
                  <span className="text-[11px] text-slate-500 font-semibold">Immediate Dispatch Alert to Case Coordinators &amp; HR</span>
                </div>
              </div>
              <button onClick={() => setShowSickDayModal(false)} className="text-slate-400 hover:text-slate-700 font-bold text-lg cursor-pointer">✕</button>
            </div>

            <form onSubmit={handleSubmitSickDayRequest} className="space-y-4">
              {selectedSessionForSick && (
                <div className="p-3.5 bg-rose-50 rounded-2xl border border-rose-200 text-xs text-rose-900 font-semibold space-y-1">
                  <strong>Affected Client Session:</strong>
                  <p>{selectedSessionForSick.client} · {selectedSessionForSick.dayOfWeek}, {selectedSessionForSick.date} ({selectedSessionForSick.time})</p>
                </div>
              )}

              <div>
                <label className="text-xs font-bold text-slate-800 block mb-1.5">Reason for Call-Out</label>
                <select
                  value={sickReason}
                  onChange={(e) => setSickReason(e.target.value)}
                  className="w-full bg-[#F0F7FF] border-2 border-[#BFDBFE] rounded-2xl p-3 text-xs text-slate-900 font-bold outline-none focus:border-rose-500"
                >
                  <option value="Sudden Illness / Sick Day">Sudden Illness / Sick Day</option>
                  <option value="Family Emergency">Family Emergency</option>
                  <option value="Vehicle / Transportation Breakdown">Vehicle / Transportation Breakdown</option>
                  <option value="Planned Paid Time Off (PTO)">Planned Paid Time Off (PTO)</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-800 block mb-1.5">Message for Case Coordinator (Marcus Vance)</label>
                <textarea
                  value={sickNote}
                  onChange={(e) => setSickNote(e.target.value)}
                  placeholder="Provide brief details for emergency RBT substitute matching..."
                  className="w-full bg-[#F0F7FF] border-2 border-[#BFDBFE] rounded-2xl p-3 text-xs text-slate-900 font-bold outline-none focus:border-rose-500 h-24"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowSickDayModal(false)}
                  className="px-5 py-3 rounded-2xl border-2 border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <Button
                  type="button"
                  onClick={handleSubmitSickDayRequest}
                  className="bg-rose-600 hover:bg-rose-700 text-white font-black text-xs px-6 py-3.5 rounded-2xl shadow-lg cursor-pointer"
                >
                  Submit Sick Day Call-Out &amp; Dispatch Alert
                </Button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* 🌟 1-CLICK FIX INCOMPLETE SESSION DRAWER */}
      <FixIncompleteSessionDrawer
        session={selectedIncompleteSession}
        isOpen={isIncompleteDrawerOpen}
        onClose={() => setIsIncompleteDrawerOpen(false)}
        onFixComplete={handleFixComplete}
      />
    </div>
  );
}
