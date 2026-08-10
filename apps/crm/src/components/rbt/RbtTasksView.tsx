'use client';

import React, { useState, useRef } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { 
  ClipboardList, 
  Lock, 
  ChevronLeft, 
  ChevronRight, 
  CheckCircle2, 
  ShieldCheck, 
  FileText,
  Calendar,
  Clock,
  Award,
  Activity,
  Upload,
  Check,
  Play,
  Sparkles,
  UserCheck,
  Video
} from 'lucide-react';
import { toast } from 'sonner';

export default function RbtTasksView() {
  // 5 Parallel Requirements Completion State
  const [tasksDone, setTasksDone] = useState(false);
  const [interviewBooked, setInterviewBooked] = useState(false);
  const [availabilitySet, setAvailabilitySet] = useState(false);
  const [certUploaded, setCertUploaded] = useState(false);
  const [simulatorPassed, setSimulatorPassed] = useState(false);

  // Modals & Active Requirement Views
  const [activeModal, setActiveModal] = useState<'NONE' | 'INTERVIEW' | 'AVAILABILITY' | 'CERTIFICATE' | 'SIMULATOR'>('NONE');

  // Task Step State
  const [currentStep, setCurrentStep] = useState(1);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  
  // Document Consent State
  const [checkRead, setCheckRead] = useState(false);
  const [checkAgree, setCheckAgree] = useState(false);
  const [checkESign, setCheckESign] = useState(false);
  const [fullName, setFullName] = useState('');
  const [isSigned, setIsSigned] = useState(false);

  // HR Interview Modal State
  const [selectedHr, setSelectedHr] = useState('Eleanor Vance (Head of HR)');
  const [interviewDate, setInterviewDate] = useState('2026-08-10');
  const [interviewTime, setInterviewTime] = useState('10:00 AM');

  // Availability State
  const [selectedBoroughs, setSelectedBoroughs] = useState<string[]>(['Brooklyn', 'Queens']);
  const [weeklyHoursTarget, setWeeklyHoursTarget] = useState('25-30 hours/week');

  // 40-Hour Certificate File State
  const [certFileName, setCertFileName] = useState<string | null>(null);

  // ABA Trial Simulator State
  const [trialsCount, setTrialsCount] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [promptedCount, setPromptedCount] = useState(0);
  const [incorrectCount, setIncorrectCount] = useState(0);
  const [simCompleted, setSimCompleted] = useState(false);

  const documentRef = useRef<HTMLDivElement>(null);

  const handleScroll = () => {
    if (documentRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = documentRef.current;
      if (scrollTop + clientHeight >= scrollHeight - 30) {
        // Scrolled to end check
      }
    }
  };

  const handleSignDocument = (e: React.FormEvent) => {
    e.preventDefault();
    if (!checkRead || !checkAgree || !checkESign) {
      toast.error('Please accept all consent terms and agreements before signing.');
      return;
    }
    if (!fullName.trim()) {
      toast.error('Please type your full legal name to sign.');
      return;
    }

    setIsSigned(true);
    if (!completedSteps.includes(currentStep)) {
      const updated = [...completedSteps, currentStep];
      setCompletedSteps(updated);
      if (updated.length >= 1) setTasksDone(true);
    }
    toast.success('Document electronically signed & saved!');
  };

  const handleBookInterview = (e: React.FormEvent) => {
    e.preventDefault();
    setInterviewBooked(true);
    setActiveModal('NONE');
    toast.success(`HR Interview scheduled with ${selectedHr} on ${interviewDate} at ${interviewTime}!`);
  };

  const handleSaveAvailability = (e: React.FormEvent) => {
    e.preventDefault();
    setAvailabilitySet(true);
    setActiveModal('NONE');
    toast.success('Weekly availability & borough preferences saved!');
  };

  const handleCertUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setCertFileName(file.name);
      setCertUploaded(true);
      toast.success(`Uploaded ${file.name}! BACB 40-Hour Certificate saved.`);
    }
  };

  // Trial Simulator Controls
  const handleTrial = (type: 'CORRECT' | 'PROMPTED' | 'INCORRECT') => {
    if (trialsCount >= 10) return;
    const newCount = trialsCount + 1;
    setTrialsCount(newCount);
    if (type === 'CORRECT') setCorrectCount(correctCount + 1);
    if (type === 'PROMPTED') setPromptedCount(promptedCount + 1);
    if (type === 'INCORRECT') setIncorrectCount(incorrectCount + 1);

    if (newCount === 10) {
      setSimCompleted(true);
      setSimulatorPassed(true);
      toast.success('10/10 Trials Completed! Data Collection Simulation Passed.');
    }
  };

  const resetSimulator = () => {
    setTrialsCount(0);
    setCorrectCount(0);
    setPromptedCount(0);
    setIncorrectCount(0);
    setSimCompleted(false);
  };

  const isBtCleared = tasksDone && interviewBooked && availabilitySet && simulatorPassed;
  const isRbtCleared = isBtCleared && certUploaded;
  const coreCompletedCount = [tasksDone, interviewBooked, availabilitySet, simulatorPassed].filter(Boolean).length;

  React.useEffect(() => {
    const checkSimAndAvailStatus = () => {
      const simDone = localStorage.getItem('ras_rbt_sim_completed') === 'true' || localStorage.getItem('ras_rbt_simulation_completed') === 'true';
      const availDone = localStorage.getItem('ras_rbt_availability_set') === 'true';

      if (simDone) {
        setSimulatorPassed(true);
        setSimCompleted(true);
      }
      if (availDone) {
        setAvailabilitySet(true);
      }
    };

    checkSimAndAvailStatus();
    window.addEventListener('rbt_sim_changed', checkSimAndAvailStatus);
    window.addEventListener('simulationCompleted', checkSimAndAvailStatus);
    window.addEventListener('rbt_availability_changed', checkSimAndAvailStatus);
    return () => {
      window.removeEventListener('rbt_sim_changed', checkSimAndAvailStatus);
      window.removeEventListener('simulationCompleted', checkSimAndAvailStatus);
      window.removeEventListener('rbt_availability_changed', checkSimAndAvailStatus);
    };
  }, []);

  React.useEffect(() => {
    if (isBtCleared || isRbtCleared) {
      localStorage.setItem('ras_rbt_cleared', 'true');
      window.dispatchEvent(new Event('rbt_clearance_changed'));
    }
  }, [isBtCleared, isRbtCleared]);

  const totalSteps = 30;
  const tierAComplete = completedSteps.filter(s => s <= 25).length;
  const tierBComplete = completedSteps.filter(s => s > 25).length;
  const stepsList = Array.from({ length: totalSteps }, (_, i) => i + 1);

  const formattedDate = new Date().toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-12">
      {/* ONBOARDING & SERVICE CLEARANCE HUB BANNER - 100% OPAQUE PURE WHITE */}
      <div className="bg-white border-2 border-orange-200 rounded-3xl shadow-xl p-6 sm:p-8 space-y-6 text-slate-900">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-orange-100 pb-5">
          <div>
            <div className="flex items-center gap-2.5">
              <ShieldCheck className={`w-7 h-7 ${isRbtCleared ? 'text-emerald-600' : isBtCleared ? 'text-amber-500' : 'text-[#F97316]'}`} />
              <h1 className="text-2xl font-black text-slate-900 font-heading tracking-tight">
                RBT Service Clearance Onboarding Hub
              </h1>
            </div>
            <p className="text-xs text-slate-600 font-semibold mt-1">
              Complete the 4 Core Tasks below to start direct sessions as a <strong>Behavior Technician (BT)</strong>, and upload your 40-Hour Course to upgrade to <strong>RBT Tier Pay</strong>.
            </p>
          </div>

          <div className="flex flex-col items-end gap-2">
            <span className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-black uppercase tracking-wide border shadow-sm ${
              isRbtCleared
                ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                : isBtCleared
                ? 'bg-amber-100 text-amber-900 border-amber-300'
                : 'bg-orange-100 text-[#F97316] border-orange-300'
            }`}>
              <span className={`w-2.5 h-2.5 rounded-full ${isRbtCleared ? 'bg-emerald-500 animate-pulse' : isBtCleared ? 'bg-amber-500 animate-pulse' : 'bg-[#F97316]'}`} />
              {isRbtCleared 
                ? '✓ CLEARED AS REGISTERED BEHAVIOR TECHNICIAN (RBT)' 
                : isBtCleared 
                ? '✓ CLEARED AS BEHAVIOR TECHNICIAN (BT)' 
                : `${coreCompletedCount} OF 4 CORE TASKS DONE`}
            </span>

            <button
              type="button"
              onClick={() => {
                localStorage.removeItem('ras_rbt_cleared');
                localStorage.removeItem('ras_rbt_sim_completed');
                localStorage.removeItem('ras_rbt_simulation_completed');
                localStorage.removeItem('ras_rbt_availability_set');
                localStorage.removeItem('ras_rbt_tasks_done');
                localStorage.removeItem('ras_rbt_interview_done');
                window.dispatchEvent(new Event('rbt_clearance_changed'));
                window.dispatchEvent(new Event('rbt_sim_changed'));
                window.dispatchEvent(new Event('simulationCompleted'));
                window.dispatchEvent(new Event('rbt_availability_changed'));
                setTasksDone(false);
                setInterviewBooked(false);
                setAvailabilitySet(false);
                setSimulatorPassed(false);
                setCertUploaded(false);
                toast.info('🔄 Demo Onboarding Progress Reset! Schedule & Job Board Tabs Relocked.');
              }}
              className="text-[10px] font-bold text-slate-500 hover:text-slate-800 underline cursor-pointer"
            >
              🔄 Reset Demo Onboarding Progress
            </button>
          </div>
        </div>

        {/* 🌟 HIGHLY RECOMMENDED RBT TIER UPGRADE BANNER (WHEN BT CLEARED BUT NO 40-HR CERT YET) */}
        {isBtCleared && !certUploaded && (
          <div className="bg-gradient-to-r from-amber-50 to-orange-50 border-2 border-amber-300 p-4 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4 shadow-md">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 border border-amber-300 text-amber-700 flex items-center justify-center shrink-0">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-xs font-black text-slate-900 uppercase tracking-wide">
                  Highly Recommended: Upgrade to Official RBT Tier Pay
                </h4>
                <p className="text-xs text-slate-600 font-medium">
                  You are cleared to work as a <strong>Behavior Technician (BT)</strong>! Upload your free 40-Hour Course Certificate to unlock <strong>+$5/hr RBT Rate Upgrade</strong>.
                </p>
              </div>
            </div>

            <Link
              href="/rbt/documents"
              className="bg-[#F97316] hover:bg-orange-600 text-white font-extrabold text-xs px-4 py-2.5 rounded-xl shadow-md transition-all shrink-0 cursor-pointer"
            >
              Upload 40-Hr Cert →
            </Link>
          </div>
        )}

        {/* 5 PARALLEL REQUIREMENTS CARDS - CLICK TO NAVIGATE TO DEDICATED TAB */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
          {/* REQ 1: MY TASKS */}
          <div 
            onClick={() => window.scrollTo({ top: 450, behavior: 'smooth' })}
            className={`p-4 rounded-2xl border-2 flex flex-col justify-between gap-2.5 transition-all cursor-pointer shadow-sm ${
              tasksDone 
                ? 'bg-emerald-50/90 border-emerald-300 text-slate-900' 
                : 'bg-[#F0F7FF] border-[#BFDBFE] text-slate-900 hover:border-[#F97316]'
            }`}
          >
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono font-bold text-slate-600">REQ 1</span>
                {tasksDone ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <Clock className="w-4 h-4 text-[#F97316]" />}
              </div>
              <h4 className="font-extrabold text-xs text-slate-900">E-Signatures &amp; Tasks</h4>
              <p className="text-[10px] text-slate-600 font-medium">{completedSteps.length}/30 Forms Signed</p>
            </div>
            <span className={`text-[10px] font-black ${tasksDone ? 'text-emerald-700' : 'text-[#F97316]'}`}>
              {tasksDone ? '✓ Completed' : 'Sign Forms Below ↓'}
            </span>
          </div>

          {/* REQ 2: HR INTERVIEW */}
          <Link
            href="/rbt/interview"
            className={`p-4 rounded-2xl border-2 flex flex-col justify-between gap-2.5 transition-all cursor-pointer shadow-sm ${
              interviewBooked 
                ? 'bg-emerald-50/90 border-emerald-300 text-slate-900' 
                : 'bg-[#F0F7FF] border-[#BFDBFE] text-slate-900 hover:border-[#F97316]'
            }`}
          >
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono font-bold text-slate-600">REQ 2</span>
                {interviewBooked ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <Calendar className="w-4 h-4 text-[#F97316]" />}
              </div>
              <h4 className="font-extrabold text-xs text-slate-900">HR Interview</h4>
              <p className="text-[10px] text-slate-600 font-medium">{interviewBooked ? interviewDate : 'Book Slot'}</p>
            </div>
            <span className={`text-[10px] font-black ${interviewBooked ? 'text-emerald-700' : 'text-[#F97316]'}`}>
              {interviewBooked ? '✓ Scheduled' : 'Book Interview →'}
            </span>
          </Link>

          {/* REQ 3: AVAILABILITY */}
          <Link
            href="/rbt/availability"
            className={`p-4 rounded-2xl border-2 flex flex-col justify-between gap-2.5 transition-all cursor-pointer shadow-sm ${
              availabilitySet 
                ? 'bg-emerald-50/90 border-emerald-300 text-slate-900' 
                : 'bg-[#F0F7FF] border-[#BFDBFE] text-slate-900 hover:border-[#F97316]'
            }`}
          >
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono font-bold text-slate-600">REQ 3</span>
                {availabilitySet ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <Clock className="w-4 h-4 text-[#F97316]" />}
              </div>
              <h4 className="font-extrabold text-xs text-slate-900">Set Availability</h4>
              <p className="text-[10px] text-slate-600 font-medium">{selectedBoroughs.join(', ')}</p>
            </div>
            <span className={`text-[10px] font-black ${availabilitySet ? 'text-emerald-700' : 'text-[#F97316]'}`}>
              {availabilitySet ? '✓ Configured' : 'Configure →'}
            </span>
          </Link>

          {/* REQ 4: DATA SIMULATOR */}
          <Link
            href="/rbt/simulation?subtab=sim"
            className={`p-4 rounded-2xl border-2 flex flex-col justify-between gap-2.5 transition-all cursor-pointer shadow-sm ${
              simulatorPassed 
                ? 'bg-emerald-50/90 border-emerald-300 text-slate-900' 
                : 'bg-[#F0F7FF] border-[#BFDBFE] text-slate-900 hover:border-[#F97316]'
            }`}
          >
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono font-bold text-slate-600">REQ 4</span>
                {simulatorPassed ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <Activity className="w-4 h-4 text-[#F97316]" />}
              </div>
              <h4 className="font-extrabold text-xs text-slate-900">Data Simulator</h4>
              <p className="text-[10px] text-slate-600 font-medium">{simulatorPassed ? 'Passed 10/10' : 'Start Trial'}</p>
            </div>
            <span className={`text-[10px] font-black ${simulatorPassed ? 'text-emerald-700' : 'text-[#F97316]'}`}>
              {simulatorPassed ? '✓ Passed' : 'Launch Sim →'}
            </span>
          </Link>

          {/* REQ 5: 40-HR CERTIFICATE (SOFT LOCKED / OPTIONAL RBT UPGRADE) */}
          <Link
            href="/rbt/documents"
            className={`p-4 rounded-2xl border-2 flex flex-col justify-between gap-2.5 transition-all cursor-pointer shadow-sm ${
              certUploaded 
                ? 'bg-emerald-50/90 border-emerald-300 text-slate-900' 
                : 'bg-amber-50/90 border-amber-300 text-slate-900 hover:border-[#F97316]'
            }`}
          >
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono font-black text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded">RBT UPGRADE</span>
                {certUploaded ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <Award className="w-4 h-4 text-amber-600" />}
              </div>
              <h4 className="font-extrabold text-xs text-slate-900">40-Hr Course</h4>
              <p className="text-[10px] text-slate-600 font-medium">{certFileName ? 'Uploaded' : 'Optional RBT Upgrade'}</p>
            </div>
            <span className={`text-[10px] font-black ${certUploaded ? 'text-emerald-700' : 'text-amber-700'}`}>
              {certUploaded ? '✓ Verified (RBT Tier)' : 'Highly Rec. (+ $5/hr) →'}
            </span>
          </Link>
        </div>
      </div>

      {/* HR INTERVIEW BOOKING MODAL */}
      {activeModal === 'INTERVIEW' && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border-2 border-orange-200 rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl animate-fade-in text-slate-900">
            <div className="flex items-center justify-between border-b border-orange-100 pb-3">
              <h3 className="text-lg font-black text-slate-900 font-heading">Book HR Onboarding Interview</h3>
              <button onClick={() => setActiveModal('NONE')} className="text-slate-400 hover:text-slate-700 font-bold">✕</button>
            </div>

            <form onSubmit={handleBookInterview} className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-800 block mb-1">Select HR Specialist</label>
                <select
                  value={selectedHr}
                  onChange={(e) => setSelectedHr(e.target.value)}
                  className="w-full bg-blue-50/50 border border-blue-200 rounded-xl p-2.5 text-xs text-slate-900 font-bold"
                >
                  <option value="Eleanor Vance (Head of HR)">Eleanor Vance (Head of HR &amp; Dispatch)</option>
                  <option value="Samantha Reed (HR Recruiter)">Samantha Reed (ATS Recruiter)</option>
                  <option value="Marcus Vance (Onboarding Specialist)">Marcus Vance (Compliance Specialist)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-bold text-slate-800 block mb-1">Date</label>
                  <input
                    type="date"
                    value={interviewDate}
                    onChange={(e) => setInterviewDate(e.target.value)}
                    className="w-full bg-blue-50/50 border border-blue-200 rounded-xl p-2 text-xs text-slate-900 font-bold"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-800 block mb-1">Time Slot</label>
                  <select
                    value={interviewTime}
                    onChange={(e) => setInterviewTime(e.target.value)}
                    className="w-full bg-blue-50/50 border border-blue-200 rounded-xl p-2 text-xs text-slate-900 font-bold"
                  >
                    <option value="10:00 AM">10:00 AM EST</option>
                    <option value="01:30 PM">01:30 PM EST</option>
                    <option value="04:00 PM">04:00 PM EST</option>
                  </select>
                </div>
              </div>

              <Button type="submit" className="w-full bg-[#F97316] hover:bg-orange-600 text-white font-extrabold text-xs py-3 rounded-xl shadow-lg mt-2">
                Confirm &amp; Schedule HR Interview
              </Button>
            </form>
          </div>
        </div>
      )}

      {/* AVAILABILITY MODAL */}
      {activeModal === 'AVAILABILITY' && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border-2 border-orange-200 rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl animate-fade-in text-slate-900">
            <div className="flex items-center justify-between border-b border-orange-100 pb-3">
              <h3 className="text-lg font-black text-slate-900 font-heading">Set Weekly Availability &amp; Boroughs</h3>
              <button onClick={() => setActiveModal('NONE')} className="text-slate-400 hover:text-slate-700 font-bold">✕</button>
            </div>

            <form onSubmit={handleSaveAvailability} className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-800 block mb-1">Select NYC Boroughs</label>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {['Brooklyn', 'Queens', 'Manhattan', 'Bronx', 'Staten Island'].map((b) => (
                    <label key={b} className="flex items-center gap-2 bg-blue-50/50 p-2 rounded-xl border border-blue-200 font-semibold cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedBoroughs.includes(b)}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedBoroughs([...selectedBoroughs, b]);
                          else setSelectedBoroughs(selectedBoroughs.filter(x => x !== b));
                        }}
                        className="rounded text-[#F97316]"
                      />
                      <span>{b}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-800 block mb-1">Target Hours / Week</label>
                <select
                  value={weeklyHoursTarget}
                  onChange={(e) => setWeeklyHoursTarget(e.target.value)}
                  className="w-full bg-blue-50/50 border border-blue-200 rounded-xl p-2.5 text-xs text-slate-900 font-bold"
                >
                  <option value="15-20 hours/week">15-20 hours/week (Part-Time)</option>
                  <option value="25-30 hours/week">25-30 hours/week (Full-Time)</option>
                  <option value="35-40 hours/week">35-40 hours/week (Max Cases)</option>
                </select>
              </div>

              <Button type="submit" className="w-full bg-[#F97316] hover:bg-orange-600 text-white font-extrabold text-xs py-3 rounded-xl shadow-lg mt-2">
                Save Availability Preferences
              </Button>
            </form>
          </div>
        </div>
      )}

      {/* 40-HOUR CERTIFICATE MODAL */}
      {activeModal === 'CERTIFICATE' && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border-2 border-orange-200 rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl animate-fade-in text-slate-900">
            <div className="flex items-center justify-between border-b border-orange-100 pb-3">
              <h3 className="text-lg font-black text-slate-900 font-heading">Upload 40-Hour RBT Certificate</h3>
              <button onClick={() => setActiveModal('NONE')} className="text-slate-400 hover:text-slate-700 font-bold">✕</button>
            </div>

            <div className="space-y-3 text-center p-6 border-2 border-dashed border-orange-300 rounded-2xl bg-orange-50/50">
              <Award className="w-10 h-10 text-[#F97316] mx-auto" />
              <div>
                <h4 className="font-bold text-xs text-slate-900">Upload BACB Approved Training PDF</h4>
                <p className="text-[11px] text-slate-600 mt-1">Upload your 40-Hour Course Completion certificate for HR verification.</p>
              </div>
              <input
                type="file"
                accept=".pdf,.png,.jpg"
                onChange={handleCertUpload}
                className="hidden"
                id="cert-upload"
              />
              <label
                htmlFor="cert-upload"
                className="inline-block bg-[#F97316] hover:bg-orange-600 text-white font-extrabold text-xs px-5 py-2.5 rounded-xl cursor-pointer shadow-md transition-all"
              >
                Choose Certificate File
              </label>
              {certFileName && (
                <p className="text-xs text-emerald-700 font-bold mt-2">✓ Selected: {certFileName}</p>
              )}
            </div>

            <Button onClick={() => setActiveModal('NONE')} className="w-full bg-slate-900 text-white font-bold text-xs py-2.5 rounded-xl">
              Done
            </Button>
          </div>
        </div>
      )}

      {/* ABA TRIAL SIMULATOR MODAL */}
      {activeModal === 'SIMULATOR' && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border-2 border-orange-200 rounded-3xl p-6 max-w-lg w-full space-y-5 shadow-2xl animate-fade-in text-slate-900">
            <div className="flex items-center justify-between border-b border-orange-100 pb-3">
              <div className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-[#F97316]" />
                <h3 className="text-lg font-black text-slate-900 font-heading">ABA Data Collection Simulator</h3>
              </div>
              <button onClick={() => setActiveModal('NONE')} className="text-slate-400 hover:text-slate-700 font-bold">✕</button>
            </div>

            <div className="space-y-4">
              <div className="bg-blue-50/70 p-4 rounded-2xl border border-blue-200 space-y-2">
                <div className="flex justify-between items-center text-xs font-bold">
                  <span className="text-slate-900">Trial Progress: {trialsCount} / 10 Trials</span>
                  <span className="text-[#F97316]">Target: 10 Trials</span>
                </div>
                <div className="w-full h-3 bg-blue-100 rounded-full overflow-hidden flex">
                  <div className="bg-[#F97316] h-full transition-all duration-300" style={{ width: `${(trialsCount / 10) * 100}%` }} />
                </div>
              </div>

              <div className="p-4 bg-orange-50 rounded-2xl border border-orange-200 text-center space-y-2">
                <span className="text-[10px] font-mono font-bold text-[#F97316] uppercase tracking-wider block">Simulated SD (Instruction):</span>
                <p className="text-sm font-extrabold text-slate-900 font-heading">
                  "Touch the Blue Square"
                </p>
                <p className="text-xs text-slate-600">Record learner response prompt level below:</p>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <button
                  disabled={trialsCount >= 10}
                  onClick={() => handleTrial('CORRECT')}
                  className="bg-emerald-500 hover:bg-emerald-600 text-white font-extrabold text-xs py-3 rounded-xl shadow-md cursor-pointer disabled:opacity-50"
                >
                  + Correct (+)
                </button>

                <button
                  disabled={trialsCount >= 10}
                  onClick={() => handleTrial('PROMPTED')}
                  className="bg-amber-500 hover:bg-amber-600 text-white font-extrabold text-xs py-3 rounded-xl shadow-md cursor-pointer disabled:opacity-50"
                >
                  + Prompted (+P)
                </button>

                <button
                  disabled={trialsCount >= 10}
                  onClick={() => handleTrial('INCORRECT')}
                  className="bg-rose-500 hover:bg-rose-600 text-white font-extrabold text-xs py-3 rounded-xl shadow-md cursor-pointer disabled:opacity-50"
                >
                  - Incorrect (-)
                </button>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center text-xs font-bold pt-1">
                <div className="p-2 bg-emerald-50 text-emerald-800 rounded-xl border border-emerald-200">
                  {correctCount} Correct
                </div>
                <div className="p-2 bg-amber-50 text-amber-800 rounded-xl border border-amber-200">
                  {promptedCount} Prompted
                </div>
                <div className="p-2 bg-rose-50 text-rose-800 rounded-xl border border-rose-200">
                  {incorrectCount} Incorrect
                </div>
              </div>

              {simCompleted && (
                <div className="p-3 bg-emerald-100 border border-emerald-300 text-emerald-800 text-xs font-bold rounded-xl text-center">
                  ✓ Simulation Completed! Accuracy Score: {Math.round(((correctCount + promptedCount) / 10) * 100)}%
                </div>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-orange-100 pt-3">
              <Button type="button" variant="secondary" onClick={resetSimulator} className="text-xs bg-slate-100 text-slate-700">
                Reset Sim
              </Button>

              <Button onClick={() => setActiveModal('NONE')} className="bg-[#F97316] text-white font-bold text-xs px-6 py-2.5 rounded-xl">
                Close &amp; Save Result
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 30-STEP COMPLIANCE TASK WORKFLOW (100% OPAQUE PURE WHITE) */}
      <div className="space-y-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-orange-100 border border-orange-200 text-[#F97316] flex items-center justify-center shrink-0 shadow-md mt-1">
            <ClipboardList className="w-7 h-7" />
          </div>
          <div>
            <h2 className="text-3xl font-black text-slate-900 font-heading tracking-tight">My Tasks</h2>
            <p className="text-sm font-semibold text-slate-700 mt-0.5">
              {completedSteps.length} of {totalSteps} complete · Tier A: {tierAComplete}/25 · Tier B: {tierBComplete}/5
            </p>
          </div>
        </div>

        <div className="w-full h-px bg-slate-200 my-4" />

        {/* STEP NUMBER POINTERS (1 THROUGH 30) */}
        <div className="flex items-center gap-2 overflow-x-auto pb-3 custom-scrollbar">
          {stepsList.map((stepNum) => {
            const isCurrent = currentStep === stepNum;
            const isDone = completedSteps.includes(stepNum);
            const isUnlocked = stepNum === 1 || completedSteps.includes(stepNum - 1);

            return (
              <button
                key={stepNum}
                onClick={() => {
                  if (isUnlocked || isDone) setCurrentStep(stepNum);
                  else toast.error(`Please complete Step ${stepNum - 1} first.`);
                }}
                className={`min-w-[36px] h-9 rounded-full text-xs font-bold transition-all flex items-center justify-center cursor-pointer shrink-0 ${
                  isCurrent
                    ? 'bg-[#F97316] text-white shadow-lg shadow-orange-500/30 scale-105'
                    : isDone
                    ? 'bg-emerald-100 text-emerald-700 border border-emerald-300'
                    : 'bg-[#F0F7FF] text-slate-700 border border-[#BFDBFE] hover:border-[#F97316]'
                }`}
              >
                {!isUnlocked && !isDone && <Lock className="w-3 h-3 mr-0.5" />}
                {stepNum}
              </button>
            );
          })}
        </div>

        {/* STEP CARD CONTAINER - 100% OPAQUE PURE WHITE */}
        <div className="bg-white border-2 border-orange-200 rounded-3xl shadow-xl overflow-hidden p-6 sm:p-8 space-y-6 text-slate-900">
          <h3 className="text-2xl font-black text-slate-900 font-heading">
            Step {currentStep} of {totalSteps}: E-Signature Consent
          </h3>

          {/* DOCUMENT PREVIEWER */}
          <div
            ref={documentRef}
            onScroll={handleScroll}
            className="border-2 border-slate-200 rounded-2xl p-6 max-h-[380px] overflow-y-auto space-y-4 text-xs text-slate-700 leading-relaxed bg-[#FFFDF9] shadow-inner custom-scrollbar relative"
          >
            {/* DOCUMENT LOGO HEADER */}
            <div className="border-b border-orange-200 pb-4 text-center space-y-1">
              <div className="flex items-center justify-center gap-3">
                <img src="/logo.png" alt="Rise & Shine ABA Logo" className="w-12 h-12 object-contain" />
                <div className="text-left">
                  <h4 className="font-extrabold text-sm text-[#F97316] uppercase tracking-wide">RISE &amp; SHINE ABA LLC</h4>
                  <p className="text-[11px] italic text-slate-500 font-medium">Empowering children to reach their full potential</p>
                </div>
              </div>
            </div>

            <div className="text-center space-y-1 pt-2">
              <h4 className="text-sm font-extrabold text-slate-900 font-heading uppercase tracking-wide">
                ELECTRONIC SIGNATURE &amp; ELECTRONIC RECORDS CONSENT
              </h4>
              <p className="text-[11px] text-slate-500 italic font-medium">
                Compliant with the federal E-SIGN Act and NY Electronic Signatures and Records Act (ESRA) — v1.0 — Effective May 2026
              </p>
            </div>

            <div className="space-y-2 text-slate-700">
              <h5 className="font-bold text-slate-900 text-xs">1. Purpose</h5>
              <p>
                This Consent allows you to receive, review, sign, and store documents from Rise &amp; Shine ABA in electronic form rather than on paper. Federal law (the Electronic Signatures in Global and National Commerce Act, or "E-SIGN" Act, 15 U.S.C. §§ 7001 et seq.) and New York State law (the Electronic Signatures and Records Act, NY State Technology Law §§ 301-309, or "ESRA") give electronic signatures and electronic records the same legal validity as paper signatures and paper records — but only if the parties agree, and only if certain disclosures are provided. This document provides those disclosures and obtains your consent.
              </p>

              <h5 className="font-bold text-slate-900 text-xs mt-3">2. Documents Covered</h5>
              <p>
                By signing below, you consent to receive and sign electronically all onboarding forms, employment agreements, HIPAA privacy disclosures, background check authorizations, timesheets, and therapy session compliance logs administered by Rise &amp; Shine ABA LLC.
              </p>

              <h5 className="font-bold text-slate-900 text-xs mt-3">3. Hardware &amp; Software Requirements</h5>
              <p>
                To access and retain electronic records, you must have a web browser supporting SSL encryption and access to a printer or storage device to download and save copies of signed documents.
              </p>
            </div>
          </div>

          {/* CONSENT CHECKBOXES */}
          <form onSubmit={handleSignDocument} className="space-y-4 pt-2">
            <div className="space-y-3 bg-[#F0F7FF] p-4 rounded-2xl border border-[#BFDBFE] text-xs text-slate-800">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={checkRead}
                  onChange={(e) => setCheckRead(e.target.checked)}
                  className="mt-0.5 rounded border-slate-300 text-[#F97316] focus:ring-orange-500/20 cursor-pointer"
                />
                <span className="font-semibold text-slate-800">
                  I have read and reviewed the entire document{' '}
                  <span className="text-emerald-700 font-bold">(scrolled to end)</span>
                </span>
              </label>

              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={checkAgree}
                  onChange={(e) => setCheckAgree(e.target.checked)}
                  className="mt-0.5 rounded border-slate-300 text-[#F97316] focus:ring-orange-500/20 cursor-pointer"
                />
                <span className="font-semibold text-slate-800">I agree to the terms and conditions stated in this document</span>
              </label>

              <div className="p-3 bg-white rounded-xl border border-blue-200">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={checkESign}
                    onChange={(e) => setCheckESign(e.target.checked)}
                    className="mt-0.5 rounded border-slate-300 text-[#F97316] focus:ring-orange-500/20 cursor-pointer"
                  />
                  <span className="text-[11px] leading-relaxed text-slate-700 font-medium">
                    By typing my name below and clicking 'Sign Document', I am signing this document electronically. I agree that my electronic signature is the legal equivalent of my handwritten signature on this document. I have read and agree to the contents of this document.
                  </span>
                </label>
              </div>
            </div>

            {/* SIGNATURE INPUT */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-900 block">Type your full legal name to sign</label>
              <input
                type="text"
                placeholder="Full legal name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full bg-white border-2 border-slate-300 rounded-2xl p-3 text-lg font-serif italic text-slate-900 focus:border-[#F97316] focus:ring-2 focus:ring-orange-500/20 outline-none shadow-sm"
                required
              />
              <p className="text-[11px] text-slate-600 font-medium">
                Date: {formattedDate} <span className="text-slate-600">(Today in Eastern Time — read-only)</span>
              </p>
            </div>

            {/* SIGN DOCUMENT ACTION BUTTON */}
            <Button
              type="submit"
              className="w-full bg-[#F4A261] hover:bg-[#e7924e] text-white font-black text-sm py-3.5 rounded-2xl shadow-lg transition-all cursor-pointer border-none"
            >
              {isSigned ? '✓ Document Signed' : 'Sign document'}
            </Button>
          </form>
        </div>

        {/* BOTTOM FOOTER NAVIGATION BUTTONS */}
        <div className="flex items-center justify-between pt-2">
          <Button
            disabled={currentStep === 1}
            onClick={() => setCurrentStep(prev => Math.max(1, prev - 1))}
            className="bg-white hover:bg-slate-50 text-slate-600 border border-slate-300 font-bold text-xs px-5 py-2.5 rounded-xl cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
          >
            &lt; Previous
          </Button>

          <Button
            disabled={currentStep === totalSteps}
            onClick={() => {
              if (!completedSteps.includes(currentStep)) {
                toast.error('Please sign and complete the current document first.');
                return;
              }
              setCurrentStep(prev => Math.min(totalSteps, prev + 1));
            }}
            className="bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 font-bold text-xs px-5 py-2.5 rounded-xl cursor-pointer shadow-sm flex items-center gap-1"
          >
            <span>Next</span>
            <span>&gt;</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
