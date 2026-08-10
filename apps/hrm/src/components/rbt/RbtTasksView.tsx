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
  const [interviewBooked, setInterviewBooked] = useState(false); // Slot scheduled
  const [interviewPassed, setInterviewPassed] = useState(false); // HR evaluation submitted
  const [availabilitySet, setAvailabilitySet] = useState(false);
  const [certUploaded, setCertUploaded] = useState(false);
  const [simulatorPassed, setSimulatorPassed] = useState(false);

  // Modals & Active Requirement Views
  const [activeModal, setActiveModal] = useState<'NONE' | 'INTERVIEW' | 'AVAILABILITY' | 'CERTIFICATE' | 'SIMULATOR' | 'HELP_DESK'>('NONE');
  const [helpCategory, setHelpCategory] = useState('UPLOAD_CERTIFICATE');
  const [helpMessage, setHelpMessage] = useState('');

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

  // Reset checkboxes whenever currentStep changes so previous step state never leaks over
  React.useEffect(() => {
    setCheckRead(false);
    setCheckAgree(false);
    setCheckESign(false);
    setIsSigned(completedSteps.includes(currentStep));
  }, [currentStep, completedSteps]);

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
    let updated = completedSteps;
    if (!completedSteps.includes(currentStep)) {
      updated = [...completedSteps, currentStep];
      setCompletedSteps(updated);
      localStorage.setItem('ras_rbt_completed_steps', JSON.stringify(updated));
      const activeId = localStorage.getItem('ras_active_impersonated_applicant_id') || localStorage.getItem('ras_active_applicant_id');
      const activeEmail = localStorage.getItem('ras_active_impersonated_applicant_email');
      if (activeId) {
        localStorage.setItem(`ras_rbt_completed_steps_${activeId}`, JSON.stringify(updated));
      }
      if (activeEmail) {
        localStorage.setItem(`ras_rbt_completed_steps_${activeEmail.toLowerCase().trim()}`, JSON.stringify(updated));
      }
    }

    // REQUIREMENT 1 ONLY MARKS AS COMPLETE ONCE ALL 30 DOCUMENTS ARE SIGNED AND STEP 30 SUBMITTED
    if (updated.length >= 30 && currentStep === 30) {
      setTasksDone(true);
      localStorage.setItem('ras_rbt_tasks_done', 'true');
      const activeId = localStorage.getItem('ras_active_impersonated_applicant_id') || localStorage.getItem('ras_active_applicant_id');
      const activeEmail = localStorage.getItem('ras_active_impersonated_applicant_email');
      if (activeId) {
        localStorage.setItem(`ras_rbt_tasks_done_${activeId}`, 'true');
      }
      if (activeEmail) {
        localStorage.setItem(`ras_rbt_tasks_done_${activeEmail.toLowerCase().trim()}`, 'true');
      }
      window.dispatchEvent(new Event('rbt_tasks_changed'));
      window.dispatchEvent(new Event('storage'));
      toast.success('🎉 Congratulations! All 30 onboarding documents signed. Requirement 1 is 100% Complete!');
    } else {
      toast.success(`Step ${currentStep} of 30 signed & saved!`);
    }

    // Automatically advance to the next document if not on the last step
    if (currentStep < totalSteps) {
      setCurrentStep((prev) => prev + 1);
    }
  };

  const handleBookInterview = (e: React.FormEvent) => {
    e.preventDefault();
    setInterviewBooked(true);
    setActiveModal('NONE');

    let realCandidateId = localStorage.getItem('ras_active_impersonated_applicant_id') || localStorage.getItem('ras_active_applicant_id') || 'c1';
    let realCandidateEmail = localStorage.getItem('ras_active_impersonated_applicant_email') || 'jane.doe@gmail.com';
    let realCandidateName = localStorage.getItem('ras_active_impersonated_applicant_name') || 'Jane Doe';

    try {
      const storedApp = localStorage.getItem('ras_latest_submitted_app');
      if (storedApp) {
        const parsed = JSON.parse(storedApp);
        if (parsed.fullName) realCandidateName = parsed.fullName;
        else if (parsed.name) realCandidateName = parsed.name;
        if (parsed.email) realCandidateEmail = parsed.email;
        if (parsed.applicantId) realCandidateId = parsed.applicantId;
      }
    } catch (e) {}

    const roomName = `RiseAndShine_HR_Interview_${realCandidateId}`;
    const meetingLink = `https://meet.jit.si/${roomName}`;

    const payload = {
      candidateName: realCandidateName,
      candidateEmail: realCandidateEmail,
      candidateId: realCandidateId,
      hrInterviewer: selectedHr || 'Marcus Vance',
      date: interviewDate,
      time: interviewTime,
      meetingCode: roomName,
      meetingLink: meetingLink,
      status: 'SCHEDULED',
      bookedAt: new Date().toISOString(),
    };

    localStorage.setItem('ras_rbt_interview_done', 'true');
    localStorage.setItem('ras_rbt_interview_payload', JSON.stringify(payload));
    if (realCandidateId) {
      localStorage.setItem(`ras_rbt_interview_booked_${realCandidateId}`, 'true');
      localStorage.setItem(`ras_rbt_interview_done_${realCandidateId}`, 'true');
    }
    if (realCandidateEmail) {
      localStorage.setItem(`ras_rbt_interview_booked_${realCandidateEmail.toLowerCase().trim()}`, 'true');
      localStorage.setItem(`ras_rbt_interview_done_${realCandidateEmail.toLowerCase().trim()}`, 'true');
    }

    try {
      const customStages = JSON.parse(localStorage.getItem('ras_ats_custom_stages') || '{}');
      if (realCandidateId) {
        customStages[realCandidateId] = { stage: 'INTERVIEW', activationStatus: 'INVITATION_SENT' };
      }
      if (realCandidateEmail) {
        customStages[realCandidateEmail.toLowerCase().trim()] = { stage: 'INTERVIEW', activationStatus: 'INVITATION_SENT' };
      }
      localStorage.setItem('ras_ats_custom_stages', JSON.stringify(customStages));
    } catch (e) {}

    window.dispatchEvent(new Event('rbt_interview_changed'));
    window.dispatchEvent(new Event('storage'));

    toast.success(`HR Interview scheduled with ${selectedHr || 'Marcus Vance'} on ${interviewDate} at ${interviewTime}!`);
  };

  const handleSaveAvailability = (e: React.FormEvent) => {
    e.preventDefault();
    setAvailabilitySet(true);
    setActiveModal('NONE');
    localStorage.setItem('ras_rbt_availability_set', 'true');
    const activeId = localStorage.getItem('ras_active_impersonated_applicant_id') || localStorage.getItem('ras_active_applicant_id');
    const activeEmail = localStorage.getItem('ras_active_impersonated_applicant_email');
    if (activeId) {
      localStorage.setItem(`ras_rbt_availability_set_${activeId}`, 'true');
    }
    if (activeEmail) {
      localStorage.setItem(`ras_rbt_availability_set_${activeEmail.toLowerCase().trim()}`, 'true');
    }
    window.dispatchEvent(new Event('rbt_availability_changed'));
    window.dispatchEvent(new Event('storage'));
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

  const isBtCleared = tasksDone && interviewPassed && availabilitySet && simulatorPassed;
  const isRbtCleared = isBtCleared && certUploaded;
  const coreCompletedCount = [tasksDone, interviewPassed, availabilitySet, simulatorPassed].filter(Boolean).length;

  React.useEffect(() => {
    const checkAllRequirementStatuses = () => {
      const simDone = localStorage.getItem('ras_rbt_sim_completed') === 'true' || localStorage.getItem('ras_rbt_simulation_completed') === 'true';
      const availDone = localStorage.getItem('ras_rbt_availability_set') === 'true';
      const interviewDone = localStorage.getItem('ras_rbt_interview_done') === 'true' || !!localStorage.getItem('ras_rbt_interview_payload');
      const interviewPassedVal = localStorage.getItem('ras_rbt_interview_passed') === 'true';
      const certDone = localStorage.getItem('ras_rbt_cert_uploaded') === 'true' || localStorage.getItem('ras_rbt_cert_uploaded_c1') === 'true';
      const tasksDoneVal = localStorage.getItem('ras_rbt_tasks_done') === 'true';
      const storedStepsStr = localStorage.getItem('ras_rbt_completed_steps');

      if (storedStepsStr) {
        try {
          const parsed = JSON.parse(storedStepsStr);
          if (Array.isArray(parsed)) setCompletedSteps(parsed);
        } catch (e) {}
      } else {
        setCompletedSteps([]);
      }

      if (simDone) {
        setSimulatorPassed(true);
        setSimCompleted(true);
      }
      if (availDone) {
        setAvailabilitySet(true);
      }
      if (interviewDone) {
        setInterviewBooked(true);
      }
      if (interviewPassedVal) {
        setInterviewPassed(true);
      }
      if (certDone) {
        setCertUploaded(true);
      }
      setTasksDone(tasksDoneVal);
    };

    checkAllRequirementStatuses();
    window.addEventListener('storage', checkAllRequirementStatuses);
    window.addEventListener('rbt_sim_changed', checkAllRequirementStatuses);
    window.addEventListener('simulationCompleted', checkAllRequirementStatuses);
    window.addEventListener('rbt_availability_changed', checkAllRequirementStatuses);
    window.addEventListener('rbt_interview_changed', checkAllRequirementStatuses);
    window.addEventListener('rbt_tasks_changed', checkAllRequirementStatuses);
    return () => {
      window.removeEventListener('storage', checkAllRequirementStatuses);
      window.removeEventListener('rbt_sim_changed', checkAllRequirementStatuses);
      window.removeEventListener('simulationCompleted', checkAllRequirementStatuses);
      window.removeEventListener('rbt_availability_changed', checkAllRequirementStatuses);
      window.removeEventListener('rbt_interview_changed', checkAllRequirementStatuses);
      window.removeEventListener('rbt_tasks_changed', checkAllRequirementStatuses);
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

            <div className="flex items-center gap-3">
              <Link 
                href="/rbt/help-desk"
                className="bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 border border-rose-300 font-extrabold text-xs px-3.5 py-1.5 rounded-full flex items-center gap-1.5 cursor-pointer transition-all shadow-sm"
              >
                <span>💬 Need Help? Contact HR Recruiter</span>
              </Link>

              <button
                suppressHydrationWarning
                type="button"
                onClick={() => {
                  localStorage.removeItem('ras_rbt_cleared');
                  localStorage.removeItem('ras_rbt_sim_completed');
                  localStorage.removeItem('ras_rbt_simulation_completed');
                  localStorage.removeItem('ras_rbt_availability_set');
                  localStorage.removeItem('ras_rbt_tasks_done');
                  localStorage.removeItem('ras_rbt_completed_steps');
                  localStorage.removeItem('ras_rbt_interview_done');
                  localStorage.removeItem('ras_rbt_interview_passed');
                  localStorage.removeItem('ras_rbt_interview_payload');
                  localStorage.removeItem('ras_ats_custom_stages');
                  window.dispatchEvent(new Event('rbt_clearance_changed'));
                  window.dispatchEvent(new Event('rbt_sim_changed'));
                  window.dispatchEvent(new Event('simulationCompleted'));
                  window.dispatchEvent(new Event('rbt_availability_changed'));
                  window.dispatchEvent(new Event('rbt_interview_changed'));
                  window.dispatchEvent(new Event('rbt_tasks_changed'));
                  window.dispatchEvent(new Event('storage'));
                  setCompletedSteps([]);
                  setCurrentStep(1);
                  setTasksDone(false);
                  setInterviewBooked(false);
                  setAvailabilitySet(false);
                  setSimulatorPassed(false);
                  setCertUploaded(false);
                  toast.info('🔄 All Onboarding Progress Reset! You can test fresh from Step 1.');
                }}
                className="text-[10px] font-bold text-slate-500 hover:text-slate-800 underline cursor-pointer"
              >
                🔄 Reset Demo Progress
              </button>
            </div>
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
              interviewPassed
                ? 'bg-emerald-50/90 border-emerald-300 text-slate-900'
                : interviewBooked
                ? 'bg-blue-50/90 border-blue-300 text-slate-900 hover:border-[#F97316]'
                : 'bg-[#F0F7FF] border-[#BFDBFE] text-slate-900 hover:border-[#F97316]'
            }`}
          >
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono font-bold text-slate-600">REQ 2</span>
                {interviewPassed ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : interviewBooked ? <CheckCircle2 className="w-4 h-4 text-blue-500" /> : <Calendar className="w-4 h-4 text-[#F97316]" />}
              </div>
              <h4 className="font-extrabold text-xs text-slate-900">HR Interview</h4>
              <p className="text-[10px] text-slate-600 font-medium">
                {interviewPassed ? 'HR Evaluation Complete' : interviewBooked ? interviewDate : 'Book Slot'}
              </p>
            </div>
            <span className={`text-[10px] font-black ${
              interviewPassed ? 'text-emerald-700' : interviewBooked ? 'text-blue-600' : 'text-[#F97316]'
            }`}>
              {interviewPassed ? '✓ Approved by HR' : interviewBooked ? '🗓 Slot Booked — Awaiting HR Eval' : 'Book Interview →'}
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
                  <option value="Marcus Vance (HR Agent)">Marcus Vance (HR Agent &amp; ATS Recruiter)</option>
                  <option value="Alexis Miller (HR Agent)">Alexis Miller (Compliance Specialist)</option>
                  <option value="Jordan Hayes (HR Agent)">Jordan Hayes (Dispatch Coordinator)</option>
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
            Step {currentStep} of {totalSteps}: {
              currentStep === 1 ? 'E-Signature Consent' :
              currentStep === 2 ? 'Welcome Letter' :
              currentStep === 3 ? 'Employee Handbook' :
              currentStep === 4 ? 'HIPAA & Confidentiality' :
              currentStep === 5 ? 'Non-Disclosure Agreement (NDA)' :
              currentStep === 6 ? 'Mandated Reporter Acknowledgment' :
              currentStep === 7 ? 'Emergency & Incident Reporting Policy' :
              currentStep === 8 ? 'Session Note Policy' :
              currentStep === 9 ? 'Time Recording Policy' :
              currentStep === 10 ? 'Documentation & Time Acknowledgment' :
              currentStep === 11 ? 'Sexual Harassment Policy Acknowledgment' :
              currentStep === 12 ? 'OIG/SAM/OMIG Self-Attestation' :
              currentStep === 13 ? 'RBT Supervision Contract' :
              currentStep === 14 ? 'FCRA Disclosure' :
              currentStep === 15 ? 'CFPB Consumer Rights Summary' :
              currentStep === 16 ? 'NYS Disability Benefits Notice (DB-271S)' :
              currentStep === 17 ? 'Paid Family Leave Notice (PFL-271S)' :
              currentStep === 18 ? 'Paid Safe & Sick Leave Notice' :
              currentStep === 19 ? 'Breast Milk Expression Rights Notice (P705)' :
              currentStep === 20 ? 'Form W-4' :
              currentStep === 21 ? 'Form IT-2104 (NYS Tax Withholding)' :
              currentStep === 22 ? 'Direct Deposit Authorization' :
              currentStep === 23 ? 'NYS Wage Notice (LS-54)' :
              currentStep === 24 ? 'Background Check Authorization' :
              currentStep === 25 ? 'Upload Social Security Card' :
              currentStep === 26 ? 'Sexual Harassment Prevention Training + Quiz' :
              currentStep === 27 ? 'Mandated Reporter Training Certificate' :
              currentStep === 28 ? 'CPR/First Aid Certificate' :
              currentStep === 29 ? '40-Hour RBT Training Certificate' :
              'Artemis Training Booking & Completion'
            }
          </h3>

          {/* DOCUMENT PREVIEWER */}
          <div
            ref={documentRef}
            onScroll={handleScroll}
            className="border-2 border-slate-200 rounded-2xl p-6 max-h-[420px] overflow-y-auto space-y-4 text-xs text-slate-700 leading-relaxed bg-[#FFFDF9] shadow-inner custom-scrollbar relative"
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

            {/* DYNAMIC OFFICIAL CONTENT MATCHING USER'S EXACT 30-STEP ORDER */}
            {currentStep === 1 ? (
              /* STEP 1: FULL OFFICIAL E-SIGNATURE & ELECTRONIC RECORDS CONSENT (RiseShine_12_ESignatureConsent_v1) */
              <div className="space-y-4 text-slate-800 leading-relaxed text-xs">
                <div className="text-center border-b pb-3 border-slate-200 space-y-1">
                  <h4 className="text-sm font-black text-slate-900 uppercase font-heading tracking-wide">
                    ELECTRONIC SIGNATURE &amp; ELECTRONIC RECORDS CONSENT
                  </h4>
                  <p className="text-[11px] text-slate-500 font-mono italic">
                    Compliant with the federal E-SIGN Act and NY Electronic Signatures and Records Act (ESRA) — Document v1.0 — Effective May 2026
                  </p>
                </div>

                <div className="space-y-2">
                  <h5 className="font-bold text-slate-900 text-xs">1. Purpose</h5>
                  <p>
                    This Consent allows you to receive, review, sign, and store documents from Rise &amp; Shine ABA LLC in electronic form rather than on paper. Federal law (the Electronic Signatures in Global and National Commerce Act, or "E-SIGN" Act, 15 U.S.C. §§ 7001 et seq.) and New York State law (the Electronic Signatures and Records Act, NY State Technology Law §§ 301-309, or "ESRA") give electronic signatures and electronic records the same legal validity as paper signatures and paper records — but only if the parties agree, and only if certain disclosures are provided. This document provides those disclosures and obtains your consent.
                  </p>
                </div>

                <div className="space-y-2">
                  <h5 className="font-bold text-slate-900 text-xs">2. Documents Covered</h5>
                  <p>Your consent applies to electronic signature on, and electronic delivery of, all employment- and engagement-related documents from Rise &amp; Shine ABA, including but not limited to:</p>
                  <ul className="list-disc pl-5 space-y-1 text-[11px] text-slate-700">
                    <li>Offer letters and employment agreements</li>
                    <li>Onboarding pack documents (I-9, W-4, IT-2104, NY §195.1 Wage Notice, Direct Deposit Authorization, Background Check Authorization, Emergency Contact, and other onboarding forms)</li>
                    <li>The Employee Handbook and acknowledgment of receipt</li>
                    <li>HIPAA &amp; Confidentiality Agreement, Non-Disclosure Agreement, Emergency &amp; Incident Reporting Policy</li>
                    <li>Sexual Harassment Prevention Policy Acknowledgment, Documentation &amp; Time Recording Acknowledgment, OIG/SAM/OMIG Self-Attestation, RBT Supervision Contract, and similar compliance documents</li>
                    <li>Tax forms (annual W-2 and similar)</li>
                    <li>Pay stubs, timesheets, schedules, and other recurring records</li>
                    <li>Performance reviews, scorecards, corrective action notices</li>
                    <li>Notices required to be provided under federal, state, or local law (such as wage notices, sick-leave notices, sexual harassment policy notice, and benefit notices)</li>
                    <li>Any other employment- or engagement-related communication or document</li>
                  </ul>
                </div>

                <div className="space-y-2">
                  <h5 className="font-bold text-slate-900 text-xs">3. Your Rights</h5>
                  <div className="space-y-2 pl-2">
                    <p><strong>3.1 Right to Receive Paper Copies:</strong> You have the right to receive any document covered by this Consent in paper form instead of, or in addition to, electronic form. To request paper copies, contact HR at <a href="mailto:info@riseandshine.nyc" className="text-[#F97316] underline font-semibold">info@riseandshine.nyc</a> or (929) 460-9600. There is no fee for paper copies of documents you sign or are required to receive.</p>
                    <p><strong>3.2 Right to Withdraw Consent:</strong> You may withdraw this Consent at any time by submitting a written request to HR. Withdrawal becomes effective once processed (typically within five business days) and applies prospectively only — it does not invalidate any prior electronic signature or electronic delivery.</p>
                    <p><strong>3.3 Right to Update Contact Information:</strong> You are responsible for keeping your email address and other contact information up to date so that we can deliver electronic documents to you.</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <h5 className="font-bold text-slate-900 text-xs">4. System Requirements</h5>
                  <p>To receive, review, and sign documents electronically, you will need a device with internet access (computer, tablet, or smartphone), a current web browser (Chrome, Safari, Firefox, or Edge), an active email account, and software capable of opening PDF or Microsoft Word documents.</p>
                </div>

                <div className="space-y-2">
                  <h5 className="font-bold text-slate-900 text-xs">5. How Electronic Signatures Work at Rise &amp; Shine ABA</h5>
                  <p>When you e-sign a document, you will authenticate through the HR system, review the full document, apply your signature electronically by typing your full legal name, and receive a copy for your records. Your electronic signature is legally binding and has the same effect as your handwritten signature on a paper document.</p>
                </div>

                <div className="space-y-2">
                  <h5 className="font-bold text-slate-900 text-xs">6. Record Retention &amp; Security</h5>
                  <p>Signed documents are stored securely in the Rise &amp; Shine ABA HR system and are retained in accordance with applicable law and Company policy — generally for at least six (6) years after the end of employment or engagement. Each signature is associated with a secure audit trail including timestamp, IP address, and document version.</p>
                </div>

                <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-xl text-[11px] text-blue-900 font-medium">
                  ℹ️ <strong>Legal Notice:</strong> This Consent does not constitute a contract of employment and does not alter your at-will employment status.
                </div>
              </div>
            ) : currentStep === 2 ? (
              /* STEP 2: FULL OFFICIAL WELCOME LETTER (RiseShine_01_WelcomeLetter_v2) */
              <div className="space-y-4 text-slate-800 leading-relaxed text-xs">
                <div className="text-center border-b pb-3 border-slate-200 space-y-1">
                  <h4 className="text-sm font-black text-slate-900 uppercase font-heading tracking-wide">
                    WELCOME LETTER &amp; ONBOARDING INSTRUCTIONS
                  </h4>
                  <p className="text-[11px] text-slate-500 font-mono italic">Document v2.0 • Effective May 2026</p>
                </div>

                <div className="bg-orange-50/60 p-3 rounded-xl border border-orange-200 font-mono text-[11px] space-y-1">
                  <p><strong>Employee Name:</strong> {fullName || 'Azm Karim'}</p>
                  <p><strong>Position / Role:</strong> Registered Behavior Technician (RBT) / Behavior Technician (BT)</p>
                  <p><strong>Start Date:</strong> {formattedDate}</p>
                </div>

                <p><strong>Dear new team member,</strong></p>
                <p>
                  Welcome to Rise &amp; Shine ABA. We are thrilled you've chosen to join our team and to bring your skills to the children and families we serve. Whether you'll be working in homes, schools, telehealth, or community settings, your role is essential to our mission of helping children grow, learn, and shine.
                </p>

                <h5 className="font-bold text-slate-900 text-xs">1. Your Employment Classification</h5>
                <p>You are being hired as a <strong>W-2 employee</strong> of Rise &amp; Shine ABA LLC. This means:</p>
                <ul className="list-disc pl-5 space-y-1 text-[11px] text-slate-700">
                  <li>We withhold federal, state, and FICA taxes from each paycheck.</li>
                  <li>We provide workers' compensation, disability, and Paid Family Leave coverage as required by New York law.</li>
                  <li>You are eligible for paid sick leave under New York Labor Law.</li>
                  <li>You will receive a W-2 form annually for tax filing.</li>
                </ul>
                <p className="italic text-slate-600 text-[11px]">
                  All Rise &amp; Shine ABA direct-care staff (RBTs, BCBAs, Behavior Technicians) are classified as W-2 employees. This is not optional. It is required by IRS, NYSDOL, BACB, and our payer contracts.
                </p>

                <h5 className="font-bold text-slate-900 text-xs mt-3">2. Onboarding Timeline</h5>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] font-mono">
                  <div className="p-2.5 bg-blue-50 rounded-xl border border-blue-200">
                    <strong className="text-blue-900 block">Within 48h — Welcome Call</strong>
                    15-minute call with Case Coordinator to confirm start date &amp; walk through pack.
                  </div>
                  <div className="p-2.5 bg-orange-50 rounded-xl border border-orange-200">
                    <strong className="text-orange-900 block">Days 0-3 — Compliance Pack</strong>
                    Complete &amp; sign all 30 e-signature onboarding documents.
                  </div>
                  <div className="p-2.5 bg-purple-50 rounded-xl border border-purple-200">
                    <strong className="text-purple-900 block">Days 4-10 — Required Trainings</strong>
                    HIPAA, NY Mandated Reporter, Sexual Harassment, and Clinical modules.
                  </div>
                  <div className="p-2.5 bg-emerald-50 rounded-xl border border-emerald-200">
                    <strong className="text-emerald-900 block">Days 10-14 — Activation</strong>
                    Background check clearance, orientation, &amp; client matching.
                  </div>
                </div>

                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-900 text-[11px] font-semibold">
                  ⚠️ <strong>Hard Rule:</strong> You cannot begin client services until every item above is complete.
                </div>

                <h5 className="font-bold text-slate-900 text-xs mt-3">3. Critical Policy You'll See Throughout Onboarding</h5>
                <p>
                  <strong>Session note compliance is not optional at Rise &amp; Shine ABA.</strong> Every session note must be signed within 24 hours of the session ending. Sessions without signed notes within 24 hours are non-billable, which means they are unpaid.
                </p>

                <h5 className="font-bold text-slate-900 text-xs mt-3">4. Key Contacts</h5>
                <ul className="list-disc pl-5 space-y-1 text-[11px] text-slate-700 font-mono">
                  <li><strong>HR / Onboarding:</strong> info@riseandshine.nyc · (929) 460-9600</li>
                  <li><strong>Address:</strong> 424 Grandview Avenue, Staten Island, NY 10303</li>
                </ul>
              </div>
            ) : currentStep === 3 ? (
              /* STEP 3: FULL OFFICIAL EMPLOYEE HANDBOOK (RiseShine_02_EmployeeHandbook_v2) */
              <div className="space-y-4 text-slate-800 leading-relaxed text-xs">
                <div className="text-center border-b pb-3 border-slate-200 space-y-1">
                  <h4 className="text-sm font-black text-slate-900 uppercase font-heading tracking-wide">
                    EMPLOYEE HANDBOOK &amp; COMPANY POLICY MANUAL
                  </h4>
                  <p className="text-[11px] text-slate-500 font-mono italic">Document v2.0 • Effective May 2026 • For All Onsite &amp; Remote Staff</p>
                </div>

                <div className="space-y-2">
                  <h5 className="font-bold text-slate-900 text-xs">1. Welcome &amp; Core Mission</h5>
                  <p>Welcome to Rise &amp; Shine ABA. Our mission is to deliver high-quality, ethical, evidence-based Applied Behavior Analysis services that make a lasting difference in the lives of the children and families we serve. Values: Compassion, Integrity, Evidence, Family-Centered Care, and Continuous Improvement.</p>
                </div>

                <div className="space-y-2">
                  <h5 className="font-bold text-slate-900 text-xs">2. Employment Policies &amp; Classifications</h5>
                  <p><strong>At-Will Employment:</strong> Employment with Rise &amp; Shine ABA LLC is at-will. Either party may end employment at any time with or without cause or notice.</p>
                  <p><strong>W-2 Classification:</strong> All direct-care staff (RBTs, BCBAs, Behavior Technicians) are classified as W-2 employees as required by IRS common-law tests, NYSDOL, and BACB guidelines.</p>
                  <p><strong>Probationary Period:</strong> All new hires undergo a 90-day introductory period with 30, 60, and 90-day review check-ins.</p>
                </div>

                <div className="space-y-2">
                  <h5 className="font-bold text-slate-900 text-xs">3. Compensation, Benefits &amp; Time Off</h5>
                  <ul className="list-disc pl-5 space-y-1 text-[11px] text-slate-700">
                    <li><strong>Bi-weekly Pay:</strong> Paid bi-weekly via direct deposit.</li>
                    <li><strong>Overtime:</strong> Non-exempt staff receive 1.5x regular rate for hours worked over 40 in a workweek.</li>
                    <li><strong>NYS Paid Sick Leave:</strong> Accrue 1 hour per 30 hours worked (up to 40-56 hours per year).</li>
                    <li><strong>Expense &amp; Mileage:</strong> Inter-client travel reimbursed at current IRS mileage rate.</li>
                    <li><strong>Lactation Accommodation:</strong> Reasonable break time and private, sanitary space for nursing mothers per FLSA &amp; NY Labor Law.</li>
                  </ul>
                </div>

                <div className="space-y-2">
                  <h5 className="font-bold text-slate-900 text-xs">4. Code of Conduct &amp; Ethics</h5>
                  <p>All staff are bound by the BACB Ethics Code. Communication must be professional. Punctuality is strictly required. No unauthorized private client side-services or conflicts of interest.</p>
                </div>
              </div>
            ) : currentStep === 4 ? (
              /* STEP 4: FULL OFFICIAL HIPAA AGREEMENT (RiseShine_03_HIPAA_Confidentiality_v2) */
              <div className="space-y-4 text-slate-800 leading-relaxed text-xs">
                <div className="text-center border-b pb-3 border-slate-200 space-y-1">
                  <h4 className="text-sm font-black text-slate-900 uppercase font-heading tracking-wide">
                    HIPAA &amp; CONFIDENTIALITY AGREEMENT
                  </h4>
                  <p className="text-[11px] text-slate-500 font-mono italic">Document v2.0 • Effective May 2026 • Federal &amp; NY Privacy Standard</p>
                </div>

                <div className="space-y-2">
                  <h5 className="font-bold text-slate-900 text-xs">1. Protected Health Information (PHI) &amp; ePHI</h5>
                  <p>Covers all 18 HIPAA identifiers: Client names, addresses, phone, DOB, diagnosis (ASD), session data, progress notes, photos, videos, and insurance member IDs.</p>
                </div>

                <div className="space-y-2">
                  <h5 className="font-bold text-slate-900 text-xs">2. Strict Security Rules &amp; Social Media Ban</h5>
                  <ul className="list-disc pl-5 space-y-1 text-[11px] text-slate-700">
                    <li>Never discuss clients in public areas (coffee shops, elevators, transit).</li>
                    <li><strong>Zero Social Media Exemption:</strong> Never post client photos, videos, or stories on social media—even if "de-identified".</li>
                    <li>Access PHI only under the federal "Minimum Necessary Rule".</li>
                    <li>Telehealth must be conducted in a private, soundproof workspace with encrypted Wi-Fi.</li>
                  </ul>
                </div>

                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-900 text-[11px] font-semibold">
                  ⚠️ <strong>Federal Penalties:</strong> Violations carry federal civil fines ranging from $137 to $68,928 per violation (up to $2,067,813 annual cap), criminal prosecution up to $250,000 and 10 years imprisonment, and immediate termination.
                </div>
              </div>
            ) : currentStep === 5 ? (
              /* STEP 5: FULL OFFICIAL NDA (RiseShine_04_NDA_v2) */
              <div className="space-y-4 text-slate-800 leading-relaxed text-xs">
                <div className="text-center border-b pb-3 border-slate-200 space-y-1">
                  <h4 className="text-sm font-black text-slate-900 uppercase font-heading tracking-wide">
                    NON-DISCLOSURE AGREEMENT (NDA)
                  </h4>
                  <p className="text-[11px] text-slate-500 font-mono italic">Document v2.0 • Effective May 2026 • Proprietary Protection</p>
                </div>

                <div className="space-y-2">
                  <h5 className="font-bold text-slate-900 text-xs">1. Definition of Confidential Information</h5>
                  <p>Includes client lists, billing rates, operational manuals, clinical ABA data collection forms, software code, employee records, and business strategies.</p>
                </div>

                <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-blue-900 text-[11px]">
                  🛡️ <strong>Federal Whistleblower Immunity Notice (18 U.S.C. § 1833(b)):</strong> Under the Defend Trade Secrets Act of 2016, individuals cannot be held civilly or criminally liable for disclosing trade secrets in confidence to a government official or attorney solely to report suspected violations of law.
                </div>

                <div className="space-y-2">
                  <h5 className="font-bold text-slate-900 text-xs">2. Survival &amp; Governing Law</h5>
                  <p>Confidentiality survives indefinitely for PHI and trade secrets, and 3 years post-termination for business information. Governed by New York law.</p>
                </div>
              </div>
            ) : currentStep === 6 ? (
              /* STEP 6: FULL OFFICIAL MANDATED REPORTER ACKNOWLEDGMENT (Mandated Reporter Acknowledgment Form) */
              <div className="space-y-4 text-slate-800 leading-relaxed text-xs">
                <div className="text-center border-b pb-3 border-slate-200 space-y-1">
                  <h4 className="text-sm font-black text-slate-900 uppercase font-heading tracking-wide">
                    NYS MANDATED REPORTER ACKNOWLEDGMENT FORM
                  </h4>
                  <p className="text-[11px] text-slate-500 font-mono italic">New York State Social Services Law Requirement</p>
                </div>

                <div className="space-y-2">
                  <h5 className="font-bold text-slate-900 text-xs">1. Mandated Reporter Duty under NY Law</h5>
                  <p>Under NYS Social Services Law, RBTs, BCBAs, and direct-care personnel are designated Mandated Reporters legally required to report suspected child abuse, maltreatment, or neglect.</p>
                </div>

                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-[11px] space-y-1 font-mono">
                  <p>📞 <strong>NYS Statewide Central Register (SCR) Hotline:</strong> 1-800-635-1522</p>
                  <p>📄 <strong>Written Follow-Up Form:</strong> LDSS-2221A (within 48 hours of verbal report)</p>
                </div>

                <div className="space-y-2">
                  <h5 className="font-bold text-slate-900 text-xs">2. Legal Protections &amp; Failure to Report</h5>
                  <p>Mandated reporters acting in good faith have immunity from civil/criminal liability. Willful failure to report is a Class A misdemeanor under NY law.</p>
                </div>
              </div>
            ) : currentStep === 7 ? (
              /* STEP 7: FULL OFFICIAL EMERGENCY & INCIDENT REPORTING POLICY (RiseShine_05_IncidentReporting_v2) */
              <div className="space-y-4 text-slate-800 leading-relaxed text-xs">
                <div className="text-center border-b pb-3 border-slate-200 space-y-1">
                  <h4 className="text-sm font-black text-slate-900 uppercase font-heading tracking-wide">
                    EMERGENCY &amp; INCIDENT REPORTING POLICY &amp; FORM
                  </h4>
                  <p className="text-[11px] text-slate-500 font-mono italic">Document v2.0 • Effective May 2026 • Mandated Safety Protocols</p>
                </div>

                <div className="space-y-2">
                  <h5 className="font-bold text-slate-900 text-xs">1. What Must Be Reported Immediately</h5>
                  <ul className="list-disc pl-5 space-y-1 text-[11px] text-slate-700">
                    <li>Client injury or medical emergency (any injury, regardless of severity)</li>
                    <li>Staff injury or workplace accident</li>
                    <li>Suspected child abuse, neglect, or maltreatment (triggers Mandated Reporter reporting)</li>
                    <li>Behavioral incident requiring emergency intervention (elopement, aggression, severe self-injury)</li>
                    <li>Client elopement (client leaves safe supervised area)</li>
                    <li>Suspected HIPAA breach (loss/theft of device, unauthorized disclosure)</li>
                    <li>Property damage, safety hazards, motor vehicle accidents between sessions</li>
                  </ul>
                </div>

                <div className="space-y-2">
                  <h5 className="font-bold text-slate-900 text-xs">2. Reporting Procedure</h5>
                  <p><strong>Step 1: Immediate Response:</strong> Call 911 if urgent. Child abuse suspicion: Call NYS Central Register at 1-800-342-3720. Notify BCBA and Case Coordinator within 1 hour.</p>
                  <p><strong>Step 2: Written Incident Report:</strong> Complete and submit the formal Incident Report Form within 24 hours.</p>
                </div>

                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-[11px] font-mono space-y-1">
                  <p>📋 <strong>Incident Report Form Sections:</strong></p>
                  <p>• Section A: Reporter Info (Name, Title, Phone, Email)</p>
                  <p>• Section B: Incident Details (Date, Time, Address, Client DOB)</p>
                  <p>• Section C: Incident Classification &amp; Description</p>
                  <p>• Section D: Immediate Response &amp; Notifications Made (911, Parent, BCBA)</p>
                </div>
              </div>
            ) : currentStep === 8 ? (
              /* STEP 8: FULL OFFICIAL SESSION NOTE POLICY (RiseShine_06_SessionNotePolicy_v1) */
              <div className="space-y-4 text-slate-800 leading-relaxed text-xs">
                <div className="text-center border-b pb-3 border-slate-200 space-y-1">
                  <h4 className="text-sm font-black text-slate-900 uppercase font-heading tracking-wide">
                    SESSION NOTE &amp; DOCUMENTATION STANDARDS POLICY
                  </h4>
                  <p className="text-[11px] text-slate-500 font-mono italic">Document v1.0 • Effective May 2026 • Governed by NY Law</p>
                </div>

                <div className="space-y-2">
                  <h5 className="font-bold text-slate-900 text-xs">1. Required Elements of a Compliant Session Note</h5>
                  <ul className="list-disc pl-5 space-y-1 text-[11px] text-slate-700">
                    <li>Client Name and Client ID number in Artemis</li>
                    <li>Date of service and exact start/end times (to the minute — no rounding)</li>
                    <li>Service location (home, clinic, school, telehealth, community)</li>
                    <li>CPT code billed (97153 RBT direct, 97155 BCBA protocol modification, 97156 parent training)</li>
                    <li>Specific goals targeted, ABA interventions used, and quantitative trial data</li>
                    <li>RBT signature &amp; Parent/Guardian signature</li>
                  </ul>
                </div>

                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-900 text-[11px] font-semibold">
                  ⏰ <strong>The 24-Hour Rule:</strong> Every session note must be submitted and signed in Artemis within 24 hours of session end. Notes past 24 hours are non-billable and unpaid.
                </div>
              </div>
            ) : currentStep === 9 ? (
              /* STEP 9: FULL OFFICIAL TIME RECORDING POLICY (RiseShine_07_TimeRecordingPolicy_v1) */
              <div className="space-y-4 text-slate-800 leading-relaxed text-xs">
                <div className="text-center border-b pb-3 border-slate-200 space-y-1">
                  <h4 className="text-sm font-black text-slate-900 uppercase font-heading tracking-wide">
                    CLOCK IN / OUT &amp; TIME RECORDING POLICY
                  </h4>
                  <p className="text-[11px] text-slate-500 font-mono italic">Document v1.0 • Effective May 2026 • Timekeeping Standards</p>
                </div>

                <div className="space-y-2">
                  <h5 className="font-bold text-slate-900 text-xs">1. Timekeeping Rules &amp; Zero Tolerance</h5>
                  <ul className="list-disc pl-5 space-y-1 text-[11px] text-slate-700">
                    <li>Clock in only when physically present at the session location and ready to work.</li>
                    <li>Record exact times to the minute — no rounding (e.g. 2:07 PM to 3:52 PM).</li>
                    <li><strong>No Buddy Punching:</strong> Clocking in/out for another employee is timekeeping fraud resulting in immediate termination.</li>
                    <li>GPS geolocation in Artemis verifies session location compliance.</li>
                  </ul>
                </div>

                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-900 text-[11px] font-semibold">
                  ⚠️ <strong>Fraudulent Time Entry Penalties:</strong> Time falsification is reported to BACB, NYS Medicaid Fraud Control Unit, and commercial insurance payers, and carries civil &amp; criminal fraud prosecution.
                </div>
              </div>
            ) : currentStep === 10 ? (
              /* STEP 10: FULL OFFICIAL DOC & TIME ACKNOWLEDGMENT (RiseShine_08_DocAndTimeAcknowledgment_v1) */
              <div className="space-y-4 text-slate-800 leading-relaxed text-xs">
                <div className="text-center border-b pb-3 border-slate-200 space-y-1">
                  <h4 className="text-sm font-black text-slate-900 uppercase font-heading tracking-wide">
                    DOCUMENTATION &amp; TIME RECORDING ACKNOWLEDGMENT
                  </h4>
                  <p className="text-[11px] text-slate-500 font-mono italic">Document v1.0 • Re-Acknowledged Annually</p>
                </div>

                <p>I acknowledge receipt of the Session Note Policy and Clock In/Out Policy. I confirm:</p>
                <ol className="list-decimal pl-5 space-y-1 text-[11px] text-slate-700">
                  <li>Complete, accurate, timely session notes and time entries are conditions of continued employment.</li>
                  <li>Failure to comply may result in progressive discipline, client reassignment, or bonus forfeiture.</li>
                  <li>Time record falsification is fraud subject to immediate termination and BACB/NYS Medicaid Fraud reporting.</li>
                </ol>

                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-900 text-[11px] font-semibold">
                  💼 <strong>Wage Protection Guarantee:</strong> Rise &amp; Shine ABA will pay all wages owed for time actually worked under federal and NYS wage law regardless of documentation status.
                </div>
              </div>
            ) : currentStep === 11 ? (
              /* STEP 11: FULL OFFICIAL SEXUAL HARASSMENT ACKNOWLEDGMENT (RiseShine_09_SexualHarassmentAcknowledgment_v1) */
              <div className="space-y-4 text-slate-800 leading-relaxed text-xs">
                <div className="text-center border-b pb-3 border-slate-200 space-y-1">
                  <h4 className="text-sm font-black text-slate-900 uppercase font-heading tracking-wide">
                    SEXUAL HARASSMENT PREVENTION POLICY ACKNOWLEDGMENT
                  </h4>
                  <p className="text-[11px] text-slate-500 font-mono italic">Required by NYS Labor Law §201-g • Form v1.0</p>
                </div>

                <p>I confirm receipt of the Rise &amp; Shine ABA Sexual Harassment Prevention Policy and acknowledge that:</p>
                <ul className="list-disc pl-5 space-y-1 text-[11px] text-slate-700">
                  <li>Rise &amp; Shine ABA has a zero-tolerance policy for sexual harassment under federal, NYS, and NYC law.</li>
                  <li>Internal reporting channels: Supervisor, Case Coordinator, HR (info@riseandshine.nyc · (929) 460-9600).</li>
                  <li>External reporting rights: NYS Division of Human Rights (1-800-664-1220), US EEOC (1-800-669-4000), NYC Commission on Human Rights (311).</li>
                  <li>Interactive sexual harassment prevention training is required within 30 days of hire and annually.</li>
                </ul>
              </div>
            ) : currentStep === 12 ? (
              /* STEP 12: FULL OFFICIAL OIG/SAM/OMIG EXCLUSION ATTESTATION (RiseShine_10_OIG_SAM_OMIG_SelfAttestation_v1) */
              <div className="space-y-4 text-slate-800 leading-relaxed text-xs">
                <div className="text-center border-b pb-3 border-slate-200 space-y-1">
                  <h4 className="text-sm font-black text-slate-900 uppercase font-heading tracking-wide">
                    OIG / SAM / OMIG EXCLUSION SELF-ATTESTATION
                  </h4>
                  <p className="text-[11px] text-slate-500 font-mono italic">Document v1.0 • Federal &amp; NY Healthcare Eligibility Confirmation</p>
                </div>

                <p>I attest under penalty of perjury that I am not currently excluded, debarred, or sanctioned from federal healthcare programs (Medicare, Medicaid, TRICARE) and am not listed on:</p>
                <ul className="list-disc pl-5 space-y-1 text-[11px] text-slate-700">
                  <li><strong>OIG LEIE:</strong> HHS Office of Inspector General Exclusions (exclusions.oig.hhs.gov)</li>
                  <li><strong>SAM:</strong> System for Award Management federal database (sam.gov)</li>
                  <li><strong>NYS OMIG:</strong> NYS Office of Medicaid Inspector General Excluded Providers (omig.ny.gov)</li>
                </ul>
                <p className="text-[11px] font-semibold text-slate-700">Continuing Duty: Must notify HR in writing within 24 hours if any sanction or exclusion action arises.</p>
              </div>
            ) : currentStep === 13 ? (
              /* STEP 13: FULL OFFICIAL RBT SUPERVISION CONTRACT (RiseShine_11_RBT_SupervisionContract_v1) */
              <div className="space-y-4 text-slate-800 leading-relaxed text-xs">
                <div className="text-center border-b pb-3 border-slate-200 space-y-1">
                  <h4 className="text-sm font-black text-slate-900 uppercase font-heading tracking-wide">
                    BACB RBT SUPERVISION CONTRACT
                  </h4>
                  <p className="text-[11px] text-slate-500 font-mono italic">Required by BACB RBT Handbook • Document v1.0</p>
                </div>

                <div className="space-y-2">
                  <h5 className="font-bold text-slate-900 text-xs">1. BACB Supervision Minimums</h5>
                  <ul className="list-disc pl-5 space-y-1 text-[11px] text-slate-700">
                    <li>Supervision must equal at least <strong>5% of monthly direct service hours</strong>.</li>
                    <li>Must include at least one face-to-face real-time observation per supervisory period.</li>
                    <li>Up to 50% of supervision may be in small group format (max 10 RBTs).</li>
                    <li>Supervision logs must be co-signed in HRM within 7 days of contact.</li>
                  </ul>
                </div>

                <div className="space-y-2">
                  <h5 className="font-bold text-slate-900 text-xs">2. Scope of RBT Practice</h5>
                  <p>RBT practices only under the close supervision of a BCBA. RBT does NOT design treatment plans or FBAs. RBT may not deliver client services during any period without an active supervision contract.</p>
                </div>
              </div>
            ) : currentStep === 14 ? (
              /* STEP 14: FULL OFFICIAL FCRA DISCLOSURE (RiseShine_13_FCRA_Disclosure_v1) */
              <div className="space-y-4 text-slate-800 leading-relaxed text-xs">
                <div className="text-center border-b pb-3 border-slate-200 space-y-1">
                  <h4 className="text-sm font-black text-slate-900 uppercase font-heading tracking-wide">
                    DISCLOSURE REGARDING BACKGROUND INVESTIGATION
                  </h4>
                  <p className="text-[11px] text-slate-500 font-mono italic">Standalone Notice Required by FCRA (15 U.S.C. §§ 1681 et seq.) • Document v1.0</p>
                </div>

                <div className="space-y-2">
                  <h5 className="font-bold text-slate-900 text-xs">1. What the Report May Contain</h5>
                  <p>Rise &amp; Shine ABA LLC may obtain consumer reports or investigative consumer reports about you for employment purposes. Reports may contain:</p>
                  <ul className="list-disc pl-5 space-y-1 text-[11px] text-slate-700">
                    <li>Criminal history check (federal, state, and local court records)</li>
                    <li>Verification of prior employment, educational degrees, and professional certifications</li>
                    <li>Verification of BACB RBT/BCBA credentials and state professional licenses</li>
                    <li>Sex offender registry searches &amp; Child abuse registry checks</li>
                    <li>Healthcare exclusion &amp; sanction database checks (OIG LEIE, SAM.gov, NYS OMIG)</li>
                  </ul>
                </div>

                <div className="space-y-2">
                  <h5 className="font-bold text-slate-900 text-xs">2. Ongoing Reports &amp; Revocation</h5>
                  <p>If hired, the Company may obtain additional consumer reports throughout employment for ongoing evaluation. You may revoke ongoing authorization in writing at any time.</p>
                </div>
              </div>
            ) : currentStep === 15 ? (
              /* STEP 15: FULL OFFICIAL CFPB CONSUMER RIGHTS SUMMARY (201504_cfpb_summary_your-rights-under-fcra) */
              <div className="space-y-4 text-slate-800 leading-relaxed text-xs">
                <div className="text-center border-b pb-3 border-slate-200 space-y-1">
                  <h4 className="text-sm font-black text-slate-900 uppercase font-heading tracking-wide">
                    A SUMMARY OF YOUR RIGHTS UNDER THE FAIR CREDIT REPORTING ACT
                  </h4>
                  <p className="text-[11px] text-slate-500 font-mono italic">Consumer Financial Protection Bureau (CFPB) Official Notice</p>
                </div>

                <ul className="list-disc pl-5 space-y-1.5 text-[11px] text-slate-700">
                  <li><strong>Adverse Action Disclosure:</strong> You must be told if information in your credit or background report has been used against you.</li>
                  <li><strong>File Disclosure:</strong> You have the right to know what is in your file and obtain a free disclosure under specified conditions.</li>
                  <li><strong>Dispute Inaccurate Data:</strong> Consumer reporting agencies must investigate and correct inaccurate or unverifiable data (usually within 30 days).</li>
                  <li><strong>Outdated Data Prohibition:</strong> Negative information over 7 years old (bankruptcies 10 years) cannot be reported.</li>
                  <li><strong>Written Consent:</strong> Reports cannot be provided to employers without your explicit written consent.</li>
                </ul>
              </div>
            ) : currentStep === 16 ? (
              /* STEP 16: FULL OFFICIAL NYS DISABILITY BENEFITS NOTICE (db271s) */
              <div className="space-y-4 text-slate-800 leading-relaxed text-xs">
                <div className="text-center border-b pb-3 border-slate-200 space-y-1">
                  <h4 className="text-sm font-black text-slate-900 uppercase font-heading tracking-wide">
                    NYS DISABILITY BENEFITS STATEMENT OF RIGHTS (FORM DB-271S)
                  </h4>
                  <p className="text-[11px] text-slate-500 font-mono italic">NYS Workers' Compensation Board Official Disclosure</p>
                </div>

                <p>NYS Disability Benefits Law provides short-term cash benefits for off-the-job injuries or illnesses (including pregnancy-related disability):</p>
                <ul className="list-disc pl-5 space-y-1 text-[11px] text-slate-700">
                  <li><strong>Benefit Amount:</strong> 50% of your average weekly wage up to statutory state maximum.</li>
                  <li><strong>Duration:</strong> Payable for up to 26 weeks during a 52-week period after a 7-day waiting period.</li>
                  <li><strong>Filing Deadline:</strong> Claim Form DB-450 must be submitted to the insurance carrier within 30 days of disability onset.</li>
                </ul>
              </div>
            ) : currentStep === 17 ? (
              /* STEP 17: FULL OFFICIAL PAID FAMILY LEAVE NOTICE (PFL271S) */
              <div className="space-y-4 text-slate-800 leading-relaxed text-xs">
                <div className="text-center border-b pb-3 border-slate-200 space-y-1">
                  <h4 className="text-sm font-black text-slate-900 uppercase font-heading tracking-wide">
                    NYS PAID FAMILY LEAVE STATEMENT OF RIGHTS (FORM PFL-271S)
                  </h4>
                  <p className="text-[11px] text-slate-500 font-mono italic">NYS Workers' Compensation Board • Helpline: (844) 337-6303</p>
                </div>

                <p>NYS Paid Family Leave provides job-protected, paid time off for eligible employees to:</p>
                <ul className="list-disc pl-5 space-y-1 text-[11px] text-slate-700">
                  <li><strong>BOND</strong> with a newly born, adopted, or fostered child within 12 months of birth or placement.</li>
                  <li><strong>CARE</strong> for a family member with a serious health condition.</li>
                  <li><strong>ASSIST</strong> loved ones when a spouse, partner, child, or parent is deployed abroad on military service.</li>
                </ul>
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-900 text-[11px]">
                  🌿 <strong>Benefits:</strong> Up to 12 weeks of paid leave at 67% of your average weekly wage. Guarantees job protection and health insurance continuation.
                </div>
              </div>
            ) : currentStep === 18 ? (
              /* STEP 18: FULL OFFICIAL NYC PAID SAFE & SICK LEAVE NOTICE (PaidSafeSickLeave-MandatoryNotice-English) */
              <div className="space-y-4 text-slate-800 leading-relaxed text-xs">
                <div className="text-center border-b pb-3 border-slate-200 space-y-1">
                  <h4 className="text-sm font-black text-slate-900 uppercase font-heading tracking-wide">
                    NYC PAID SAFE AND SICK LEAVE MANDATORY NOTICE
                  </h4>
                  <p className="text-[11px] text-slate-500 font-mono italic">NYC Department of Consumer and Worker Protection (DCWP)</p>
                </div>

                <p>Under the NYC Earned Safe and Sick Time Act, employees accrue paid leave to care for themselves or family members:</p>
                <ul className="list-disc pl-5 space-y-1 text-[11px] text-slate-700">
                  <li><strong>Accrual:</strong> 1 hour of paid safe/sick leave for every 30 hours worked (up to 40 or 56 hours per year).</li>
                  <li><strong>Sick Leave Use:</strong> Physical/mental illness, injury, preventive medical diagnosis or treatment.</li>
                  <li><strong>Safe Leave Use:</strong> Seeking assistance or relocation due to domestic violence, stalking, or human trafficking.</li>
                </ul>
              </div>
            ) : currentStep === 19 ? (
              /* STEP 19: FULL OFFICIAL BREAST MILK EXPRESSION NOTICE (p705) */
              <div className="space-y-4 text-slate-800 leading-relaxed text-xs">
                <div className="text-center border-b pb-3 border-slate-200 space-y-1">
                  <h4 className="text-sm font-black text-slate-900 uppercase font-heading tracking-wide">
                    EMPLOYEE RIGHTS TO EXPRESS BREAST MILK IN WORKPLACE (P705)
                  </h4>
                  <p className="text-[11px] text-slate-500 font-mono italic">NYS Department of Labor Notice • Labor Law §206-c</p>
                </div>

                <p>Under NYS Labor Law §206-c, employers must provide reasonable break time and a private lactation room:</p>
                <ul className="list-disc pl-5 space-y-1 text-[11px] text-slate-700">
                  <li><strong>Break Time:</strong> At least 20 minutes of unpaid break time every 3 hours to express milk for up to 3 years post-childbirth.</li>
                  <li><strong>Lactation Space:</strong> Private, sanitary room (other than a restroom) close to work area equipped with table, chair, electric outlet, and sink access.</li>
                  <li><strong>Zero Discrimination:</strong> Prohibition against discrimination or retaliation for exercising lactation rights.</li>
                </ul>
              </div>
            ) : currentStep === 20 ? (
              /* STEP 20: FULL OFFICIAL FORM W-4 (2025 Form W-4) */
              <div className="space-y-4 text-slate-800 leading-relaxed text-xs">
                <div className="text-center border-b pb-3 border-slate-200 space-y-1">
                  <h4 className="text-sm font-black text-slate-900 uppercase font-heading tracking-wide">
                    IRS FORM W-4 EMPLOYEE WITHHOLDING CERTIFICATE (2025)
                  </h4>
                  <p className="text-[11px] text-slate-500 font-mono italic">Department of the Treasury • Internal Revenue Service</p>
                </div>

                <p>Federal withholding tax setup for W-2 employee payroll withholding:</p>
                <div className="space-y-2 font-mono text-[11px] bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <p>• Step 1: Personal Info &amp; Filing Status (Single / Married Filing Jointly / Head of Household)</p>
                  <p>• Step 2: Multiple Jobs or Spouse Works Adjustment</p>
                  <p>• Step 3: Claim Dependents ($2,000 for qualifying children under 17, $500 for other dependents)</p>
                  <p>• Step 4: Other Adjustments (Other non-job income, Deductions, Extra per-paycheck withholding)</p>
                  <p>• Step 5: Signature &amp; Date</p>
                </div>
              </div>
            ) : currentStep === 21 ? (
              /* STEP 21: FULL OFFICIAL FORM IT-2104 (it2104_fill_in) */
              <div className="space-y-4 text-slate-800 leading-relaxed text-xs">
                <div className="text-center border-b pb-3 border-slate-200 space-y-1">
                  <h4 className="text-sm font-black text-slate-900 uppercase font-heading tracking-wide">
                    NYS FORM IT-2104 EMPLOYEE WITHHOLDING ALLOWANCE CERTIFICATE
                  </h4>
                  <p className="text-[11px] text-slate-500 font-mono italic">New York State Department of Taxation and Finance</p>
                </div>

                <p>New York State, New York City, and Yonkers state income tax withholding allowance certificate:</p>
                <ul className="list-disc pl-5 space-y-1 text-[11px] text-slate-700">
                  <li><strong>Total NYS Allowances:</strong> Number of allowances claimed for NYS tax withholding.</li>
                  <li><strong>NYC Resident Status:</strong> Indicate whether you reside in NYC (Manhattan, Brooklyn, Queens, Bronx, Staten Island).</li>
                  <li><strong>Additional NYS Withholding:</strong> Optional extra dollar amount to withhold per paycheck.</li>
                </ul>
              </div>
            ) : currentStep === 22 ? (
              /* STEP 22: FULL OFFICIAL DIRECT DEPOSIT AUTHORIZATION (Direct Deposit Authorization Form) */
              <div className="space-y-4 text-slate-800 leading-relaxed text-xs">
                <div className="text-center border-b pb-3 border-slate-200 space-y-1">
                  <h4 className="text-sm font-black text-slate-900 uppercase font-heading tracking-wide">
                    DIRECT DEPOSIT AUTHORIZATION FORM
                  </h4>
                  <p className="text-[11px] text-slate-500 font-mono italic">Rise &amp; Shine ABA LLC Payroll ACH Banking Setup</p>
                </div>

                <p>Bi-weekly payroll direct deposit ACH setup:</p>
                <div className="space-y-2 font-mono text-[11px] bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <p>• Primary Account: Bank Name, 9-Digit Routing Number, Account Number, Checking vs Savings</p>
                  <p>• Split Deposit Option: Allocate percentage or fixed dollar amount to Secondary Account</p>
                  <p>• Verification: Attach voided check or official bank direct deposit letter</p>
                </div>
              </div>
            ) : currentStep === 23 ? (
              /* STEP 23: FULL OFFICIAL NYS WAGE NOTICE LS-54 (LS54) */
              <div className="space-y-4 text-slate-800 leading-relaxed text-xs">
                <div className="text-center border-b pb-3 border-slate-200 space-y-1">
                  <h4 className="text-sm font-black text-slate-900 uppercase font-heading tracking-wide">
                    NOTICE AND ACKNOWLEDGEMENT OF PAY RATE AND PAYDAY (LS 54)
                  </h4>
                  <p className="text-[11px] text-slate-500 font-mono italic">Under Section 195.1 of New York State Labor Law</p>
                </div>

                <div className="space-y-2">
                  <h5 className="font-bold text-slate-900 text-xs">Employer Information</h5>
                  <p><strong>Employer Name:</strong> Rise &amp; Shine ABA LLC · 424 Grandview Ave, Staten Island, NY 10303 · (929) 460-9600</p>
                </div>

                <div className="space-y-2">
                  <h5 className="font-bold text-slate-900 text-xs">Pay Rate &amp; Payday Details</h5>
                  <ul className="list-disc pl-5 space-y-1 text-[11px] text-slate-700 font-mono">
                    <li><strong>Regular Pay Rate:</strong> Billed at regular hourly rate per offer letter ($25.00 - $35.00/hr)</li>
                    <li><strong>Overtime Pay Rate:</strong> 1.5x regular rate for hours over 40 in a workweek</li>
                    <li><strong>Regular Payday:</strong> Bi-weekly on Fridays via direct deposit</li>
                  </ul>
                </div>
              </div>
            ) : currentStep === 24 ? (
              /* STEP 24: FULL OFFICIAL BACKGROUND CHECK AUTHORIZATION (BackgroundCheckLetter) */
              <div className="space-y-4 text-slate-800 leading-relaxed text-xs">
                <div className="text-center border-b pb-3 border-slate-200 space-y-1">
                  <h4 className="text-sm font-black text-slate-900 uppercase font-heading tracking-wide">
                    BACKGROUND CHECK AUTHORIZATION &amp; CONSENT FORM
                  </h4>
                  <p className="text-[11px] text-slate-500 font-mono italic">Rise &amp; Shine ABA LLC Background Screening Authorization</p>
                </div>

                <p>Authorization for background screening under NY Executive Law §296(16):</p>
                <ul className="list-disc pl-5 space-y-1 text-[11px] text-slate-700">
                  <li>Criminal history search (federal, NY State OCA, county court records)</li>
                  <li>National Sex Offender Registry &amp; Child abuse history check</li>
                  <li>Professional license verification (BACB, NYS Office of the Professions)</li>
                  <li>Healthcare debarment/exclusion screening (OIG LEIE, SAM.gov, NYS OMIG)</li>
                </ul>
              </div>
            ) : currentStep === 25 ? (
              /* STEP 25: UPLOAD SOCIAL SECURITY CARD */
              <div className="space-y-4 text-slate-800 leading-relaxed text-xs">
                <div className="text-center border-b pb-3 border-slate-200 space-y-1">
                  <h4 className="text-sm font-black text-slate-900 uppercase font-heading tracking-wide">
                    UPLOAD SOCIAL SECURITY CARD / ID VERIFICATION
                  </h4>
                  <p className="text-[11px] text-slate-500 font-mono italic">USCIS Form I-9 List C &amp; Payroll Requirement</p>
                </div>
                <p>Upload a clear PDF image of your signed Social Security Card or government-issued photo ID to complete USCIS Form I-9 employment eligibility verification.</p>
              </div>
            ) : currentStep === 26 ? (
              /* STEP 26: SEXUAL HARASSMENT PREVENTION TRAINING + QUIZ */
              <div className="space-y-4 text-slate-800 leading-relaxed text-xs">
                <div className="text-center border-b pb-3 border-slate-200 space-y-1">
                  <h4 className="text-sm font-black text-slate-900 uppercase font-heading tracking-wide">
                    SEXUAL HARASSMENT PREVENTION TRAINING &amp; QUIZ
                  </h4>
                  <p className="text-[11px] text-slate-500 font-mono italic">NYS Mandated Interactive Training Module (NYS Labor Law §201-g)</p>
                </div>
                <p>Complete the NYS interactive training module and pass the 5-question comprehension quiz with 100% score.</p>
              </div>
            ) : currentStep === 27 ? (
              /* STEP 27: MANDATED REPORTER TRAINING CERTIFICATE */
              <div className="space-y-4 text-slate-800 leading-relaxed text-xs">
                <div className="text-center border-b pb-3 border-slate-200 space-y-1">
                  <h4 className="text-sm font-black text-slate-900 uppercase font-heading tracking-wide">
                    UPLOAD MANDATED REPORTER TRAINING CERTIFICATE
                  </h4>
                  <p className="text-[11px] text-slate-500 font-mono italic">NYS OCFS Certificate Upload (www.nysmandatedreporter.org)</p>
                </div>
                <p>Upload your completion certificate from www.nysmandatedreporter.org (required within 10 days of hire date).</p>
              </div>
            ) : currentStep === 28 ? (
              /* STEP 28: CPR/FIRST AID CERTIFICATE */
              <div className="space-y-4 text-slate-800 leading-relaxed text-xs">
                <div className="text-center border-b pb-3 border-slate-200 space-y-1">
                  <h4 className="text-sm font-black text-slate-900 uppercase font-heading tracking-wide">
                    UPLOAD CPR / FIRST AID CERTIFICATE
                  </h4>
                  <p className="text-[11px] text-slate-500 font-mono italic">American Heart Association / Red Cross Certification</p>
                </div>
                <p>Upload your active CPR and Pediatric First Aid certification card.</p>
              </div>
            ) : currentStep === 29 ? (
              /* STEP 29: 40-HOUR RBT TRAINING CERTIFICATE */
              <div className="space-y-4 text-slate-800 leading-relaxed text-xs">
                <div className="text-center border-b pb-3 border-slate-200 space-y-1">
                  <h4 className="text-sm font-black text-slate-900 uppercase font-heading tracking-wide">
                    UPLOAD 40-HOUR RBT TRAINING CERTIFICATE
                  </h4>
                  <p className="text-[11px] text-slate-500 font-mono italic">BACB Approved 40-Hour Course Certificate</p>
                </div>
                <p>Upload your BACB-approved 40-Hour RBT course certificate to unlock official RBT Tier pay rate upgrade (+$5.00/hr).</p>
              </div>
            ) : (
              /* STEP 30: ARTEMIS TRAINING BOOKING & COMPLETION */
              <div className="space-y-4 text-slate-800 leading-relaxed text-xs">
                <div className="text-center border-b pb-3 border-slate-200 space-y-1">
                  <h4 className="text-sm font-black text-slate-900 uppercase font-heading tracking-wide">
                    ARTEMIS EHR TRAINING BOOKING &amp; COMPLETION
                  </h4>
                  <p className="text-[11px] text-slate-500 font-mono italic">30-Minute Live Systems Walkthrough Session</p>
                </div>
                <p className="font-semibold text-emerald-900 bg-emerald-50 p-3 rounded-xl border border-emerald-200">
                  🎉 Final Onboarding Step: Book your 30-minute live EHR Artemis session walkthrough with your Case Coordinator. Once completed, your candidate profile is 100% cleared for client matching!
                </p>
              </div>
            )}
          </div>

          {/* CONSENT CHECKBOXES WITH DOCUSIGN-STYLE YELLOW HIGHLIGHTS FOR REQUIRED FIELDS */}
          <form onSubmit={handleSignDocument} className="space-y-4 pt-2">
            <div className="space-y-3 bg-amber-50/90 p-4 rounded-2xl border-2 border-amber-300 text-xs text-slate-800 shadow-sm relative">
              <div className="flex items-center justify-between border-b border-amber-200/80 pb-2">
                <span className="text-[10px] font-black uppercase tracking-wider bg-amber-400 text-amber-950 px-2 py-0.5 rounded-md font-mono shadow-sm">
                  Required Action · 3 Mandatory Consents
                </span>
                <span className="text-[11px] font-bold text-amber-800">Must check all boxes to sign</span>
              </div>

              <label className={`flex items-start gap-2.5 cursor-pointer p-2.5 rounded-xl border transition-all ${checkRead ? 'bg-emerald-50/80 border-emerald-300 text-emerald-950' : 'bg-amber-100/70 border-amber-300 text-amber-950 hover:bg-amber-100'}`}>
                <input
                  type="checkbox"
                  checked={checkRead}
                  onChange={(e) => setCheckRead(e.target.checked)}
                  className="mt-0.5 rounded border-amber-400 text-[#F97316] focus:ring-amber-500/30 cursor-pointer w-4 h-4"
                />
                <span className="font-semibold">
                  I have read and reviewed the entire document{' '}
                  <span className="text-emerald-700 font-bold">(scrolled to end)</span>
                </span>
              </label>

              <label className={`flex items-start gap-2.5 cursor-pointer p-2.5 rounded-xl border transition-all ${checkAgree ? 'bg-emerald-50/80 border-emerald-300 text-emerald-950' : 'bg-amber-100/70 border-amber-300 text-amber-950 hover:bg-amber-100'}`}>
                <input
                  type="checkbox"
                  checked={checkAgree}
                  onChange={(e) => setCheckAgree(e.target.checked)}
                  className="mt-0.5 rounded border-amber-400 text-[#F97316] focus:ring-amber-500/30 cursor-pointer w-4 h-4"
                />
                <span className="font-semibold">I agree to the terms and conditions stated in this document</span>
              </label>

              <div className={`p-3 rounded-xl border transition-all ${checkESign ? 'bg-emerald-50/80 border-emerald-300 text-emerald-950' : 'bg-amber-100/70 border-amber-300 text-amber-950 hover:bg-amber-100'}`}>
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={checkESign}
                    onChange={(e) => setCheckESign(e.target.checked)}
                    className="mt-0.5 rounded border-amber-400 text-[#F97316] focus:ring-amber-500/30 cursor-pointer w-4 h-4"
                  />
                  <span className="text-[11px] leading-relaxed font-medium">
                    By typing my name below and clicking 'Sign &amp; Move to Next Document', I am signing this document electronically. I agree that my electronic signature is the legal equivalent of my handwritten signature on this document.
                  </span>
                </label>
              </div>
            </div>

            {/* INJECT GOOGLE FONTS FOR AUDIT LOG CURSIVE SIGNATURE */}
            <style dangerouslySetInnerHTML={{ __html: `
              @import url('https://fonts.googleapis.com/css2?family=Great+Vibes&family=Dancing+Script:wght@700&display=swap');
              .font-signature {
                font-family: 'Great Vibes', 'Dancing Script', cursive !important;
              }
            ` }} />

            {/* SIGNATURE INPUT WITH YELLOW HIGHLIGHT FOR REQUIRED FIELD */}
            <div className="space-y-2 p-3 bg-amber-50/70 rounded-2xl border-2 border-amber-300">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-900 block flex items-center gap-1.5">
                  Type your full legal name to sign
                </label>
                <span className="text-[10px] font-black uppercase tracking-wider bg-amber-400 text-amber-950 px-2 py-0.5 rounded-md font-mono shadow-sm">
                  Required Signature Field
                </span>
              </div>
              
              <input
                type="text"
                placeholder="Full legal name (e.g. Jane Doe)"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className={`w-full rounded-2xl p-3 text-base text-slate-900 font-medium transition-all outline-none shadow-sm ${
                  fullName.trim()
                    ? 'bg-white border-2 border-emerald-400 text-slate-900 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20'
                    : 'bg-amber-100/80 border-2 border-amber-400 text-amber-950 placeholder-amber-700/60 focus:border-amber-500 focus:ring-4 focus:ring-amber-300/40 font-normal'
                }`}
                required
              />

              <p className="text-[11px] text-slate-600 font-medium">
                Date: {formattedDate} <span className="text-slate-600">(Today in Eastern Time — read-only)</span>
              </p>
            </div>

            {/* AUDIT LOG SIGNATURE SEAL FOR SIGNED DOCUMENTS */}
            {isSigned && fullName.trim() && (
              <div className="p-5 bg-gradient-to-r from-slate-950 via-indigo-950 to-slate-950 rounded-2xl border-2 border-amber-400/80 shadow-2xl relative overflow-hidden text-white space-y-3 mt-4">
                {/* WATERMARK BACKGROUND BADGE */}
                <div className="absolute -right-4 -bottom-6 opacity-10 pointer-events-none select-none">
                  <ShieldCheck className="w-36 h-36 text-amber-300" />
                </div>

                <div className="flex items-center justify-between border-b border-amber-500/30 pb-2 relative z-10">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-amber-400/20 border border-amber-400/50 flex items-center justify-center text-amber-300 shadow-inner">
                      <ShieldCheck className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-[10px] font-black uppercase tracking-widest text-amber-300 font-mono block">
                        LEGAL E-SIGNATURE AUDIT SEAL
                      </span>
                      <span className="text-[9px] text-slate-400 font-mono">15 U.S.C. § 7001 · NY ESRA Compliant</span>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 text-[10px] font-bold font-mono">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      Verified Digital Certificate
                    </span>
                  </div>
                </div>

                {/* REAL FLOWING CURSIVE CALLIGRAPHY SIGNATURE DISPLAY */}
                <div className="py-2 px-1 relative z-10 space-y-1">
                  <div className="text-4xl sm:text-5xl font-signature tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-yellow-100 to-amber-300 drop-shadow-[0_2px_14px_rgba(245,158,11,0.7)] leading-none py-1">
                    {fullName}
                  </div>
                  {/* INK STROKE LINE */}
                  <div className="w-56 h-0.5 bg-gradient-to-r from-amber-400/80 via-yellow-200 to-transparent rounded-full shadow-sm" />
                </div>

                <div className="flex items-center justify-between pt-1 border-t border-amber-500/20 text-[10px] font-mono text-slate-400 relative z-10">
                  <div>
                    <span className="text-slate-500 block text-[9px]">SIGNATORY LEGAL NAME</span>
                    <span className="font-bold text-slate-200">{fullName}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-slate-500 block text-[9px]">TIMESTAMP &amp; AUDIT HASH</span>
                    <span className="font-bold text-amber-300/90">{formattedDate} EST · HASH-8F9A-2026</span>
                  </div>
                </div>
              </div>
            )}

            {/* SIGN DOCUMENT ACTION BUTTON */}
            <Button
              type="submit"
              className="w-full bg-[#F4A261] hover:bg-[#e7924e] text-white font-black text-sm py-3.5 rounded-2xl shadow-lg transition-all cursor-pointer border-none flex items-center justify-center gap-2"
            >
              {currentStep === totalSteps
                ? (isSigned ? '✓ Final Document Signed' : 'Sign & Finish Onboarding')
                : (isSigned ? '✓ Signed — Move to Next' : 'Sign & Move to Next Document')}
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

      {/* HELP DESK MODAL FOR APPLICANTS */}
      {activeModal === 'HELP_DESK' && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-white border-2 border-orange-200 rounded-3xl p-6 sm:p-8 max-w-md w-full space-y-5 shadow-2xl animate-fade-in relative text-slate-900">
            <div className="flex items-center justify-between border-b border-orange-100 pb-3">
              <div>
                <h3 className="text-base font-black text-slate-900 font-heading flex items-center gap-2">
                  💬 Contact HR Recruiter Help Desk
                </h3>
                <p className="text-xs text-slate-600 font-medium mt-0.5">Send an assistance alert to your assigned HR Specialist</p>
              </div>
              <button onClick={() => setActiveModal('NONE')} className="text-slate-400 hover:text-slate-700 cursor-pointer">
                ✕
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                try {
                  const customStages = JSON.parse(localStorage.getItem('ras_ats_custom_stages') || '{}');
                  const ticketPayload = {
                    stage: 'HELP_DESK',
                    activationStatus: 'INVITATION_SENT',
                    category: helpCategory,
                    message: helpMessage || 'Applicant requested assistance on onboarding portal.',
                    submittedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                  };
                  customStages['c1'] = ticketPayload;
                  customStages['cand-1'] = ticketPayload;
                  customStages['usr-applicant-1'] = ticketPayload;
                  localStorage.setItem('ras_ats_custom_stages', JSON.stringify(customStages));
                  localStorage.setItem('ras_latest_help_ticket', JSON.stringify(ticketPayload));
                  window.dispatchEvent(new Event('storage'));
                  setActiveModal('NONE');
                  toast.success('⚠️ Assistance alert sent! Your profile is now flagged in the HR Help Desk Alerts column.');
                } catch (err) {}
              }}
              className="space-y-4"
            >
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5 font-mono uppercase tracking-wider">Assistance Category:</label>
                <select
                  value={helpCategory}
                  onChange={(e) => setHelpCategory(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 font-medium focus:border-orange-500 focus:outline-none"
                >
                  <option value="UPLOAD_CERTIFICATE">Having trouble uploading 40-Hour RBT Certificate</option>
                  <option value="INTERVIEW_SCHEDULE">Need help scheduling 1-on-1 HR Interview time</option>
                  <option value="SIMULATION_QUIZ">Question about ABA Clinical Trial Simulator</option>
                  <option value="AVAILABILITY_GRID">Need assistance setting weekly borough availability</option>
                  <option value="GENERAL_QUESTION">General Onboarding / Compliance Question</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5 font-mono uppercase tracking-wider">Explain What You Need Help With:</label>
                <textarea
                  rows={4}
                  required
                  value={helpMessage}
                  onChange={(e) => setHelpMessage(e.target.value)}
                  placeholder="Type details about what you're stuck on so your HR Recruiter can assist you immediately..."
                  className="w-full bg-slate-50 border border-slate-300 rounded-2xl p-3 text-xs text-slate-900 placeholder-slate-400 font-medium focus:border-orange-500 focus:outline-none resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <Button
                  type="button"
                  onClick={() => setActiveModal('NONE')}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs px-4 py-2.5 rounded-xl cursor-pointer border-none"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs px-5 py-2.5 rounded-xl shadow-md cursor-pointer border-none"
                >
                  📩 Send Alert to HR
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
