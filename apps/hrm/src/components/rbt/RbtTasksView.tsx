'use client';

import React, { useState, useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import {
  ClipboardList,
  Lock,
  CheckCircle2,
  ShieldCheck,
  Calendar,
  Clock,
  Award,
  Activity,
} from 'lucide-react';
import { toast } from 'sonner';
import { getHrMembers } from '@/app/actions/hrInterviewActions';
import { getActiveApplicantId, getActiveApplicantName } from '@/lib/syncAtsProgress';
import {
  getOnboardingDoc,
  isOnboardingCompletionEvent,
  ONBOARDING_TOTAL_STEPS,
} from '@/lib/onboardingDocuments';
import { OnboardingConfirmModal } from '@/components/rbt/OnboardingConfirmModal';
import {
  HarassmentQuizPanel,
  OnboardingDocumentStatus,
  OfficialPdfBar,
  UploadCertificatePanel,
} from '@/components/rbt/OnboardingStepPanels';
import { EmbeddedOnboardingFormPanel } from '@/components/rbt/EmbeddedOnboardingForms';
import { WageOfferApplicantCard } from '@/components/rbt/WageOfferApplicantCard';
import {
  getOnboardingStepState,
  recordOnboardingAdvance,
  recordOnboardingSignature,
} from '@/app/actions/onboardingSignatureActions';
import { resolveHrmUiRole } from '@/app/actions/resolveHrmRole';
import { RbtDashboardOverview } from '@/components/rbt/RbtDashboardOverview';
import {
  completedTaskStepsFromAudit,
  mergeCompletedTaskSteps,
  resolveTaskSurface,
  type TaskSurface,
} from '@/components/rbt/RbtTasksModel';
import { addClinicDays, clinicDateKey } from '@/lib/clinicTimezone';

/**
 * `/rbt` Tasks home.
 * Hired / Active RBT → live inbox from real sources (pay holds, apps, leftover onboarding).
 * Applicant → onboarding clearance hub (no fake Leo LIVE task lists).
 */
export default function RbtTasksView() {
  const [taskSurface, setTaskSurface] = React.useState<
    TaskSurface | 'LOADING' | 'ERROR'
  >('LOADING');
  const [resolutionKey, setResolutionKey] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    const resolve = async () => {
      try {
        const role = await resolveHrmUiRole();
        if (!cancelled) setTaskSurface(resolveTaskSurface(role));
      } catch {
        if (!cancelled) setTaskSurface('ERROR');
      }
    };
    void resolve();
    const onIdentityChange = () => void resolve();
    window.addEventListener('hrm_role_changed', onIdentityChange);
    window.addEventListener('rbt_progress_synced', onIdentityChange);
    window.addEventListener('ras_applicant_session_changed', onIdentityChange);
    return () => {
      cancelled = true;
      window.removeEventListener('hrm_role_changed', onIdentityChange);
      window.removeEventListener('rbt_progress_synced', onIdentityChange);
      window.removeEventListener('ras_applicant_session_changed', onIdentityChange);
    };
  }, [resolutionKey]);

  if (taskSurface === 'LOADING') {
    return (
      <div
        className="relative mx-auto max-w-5xl overflow-hidden rounded-3xl border border-[#E2D5B7] bg-[#FFFDF8] p-8 shadow-xl"
        role="status"
        aria-live="polite"
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_rgba(249,115,22,0.08),_transparent_58%)]" />
        <div className="relative flex items-center gap-3">
          <div className="h-11 w-11 animate-pulse rounded-2xl border border-orange-200 bg-orange-100" />
          <div className="space-y-2">
            <div className="h-4 w-40 animate-pulse rounded-full bg-slate-200" />
            <div className="h-3 w-64 max-w-full animate-pulse rounded-full bg-slate-100" />
          </div>
        </div>
        <span className="sr-only">Verifying task workspace access…</span>
      </div>
    );
  }

  if (taskSurface === 'ERROR') {
    return (
      <div
        className="relative mx-auto max-w-3xl overflow-hidden rounded-3xl border border-rose-300 bg-[#FFFDF8] p-8 shadow-xl"
        role="alert"
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_rgba(244,63,94,0.08),_transparent_58%)]" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-rose-300 bg-rose-50">
              <Lock className="h-5 w-5 text-rose-600" aria-hidden="true" />
            </div>
            <div>
              <h1 className="font-heading text-xl font-black text-slate-900">
                Task access could not be verified
              </h1>
              <p className="mt-1 text-sm font-medium text-slate-600">
                Your session was not changed. Retry the secure role check.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setTaskSurface('LOADING');
              setResolutionKey((key) => key + 1);
            }}
            className="cursor-pointer rounded-xl bg-[#F97316] px-4 py-2.5 text-sm font-black text-white transition hover:bg-orange-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-300"
          >
            Retry access
          </button>
        </div>
      </div>
    );
  }

  if (taskSurface === 'DENIED') {
    return (
      <div
        className="relative mx-auto max-w-3xl overflow-hidden rounded-3xl border border-[#E2D5B7] bg-[#FFFDF8] p-8 shadow-xl"
        role="status"
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_rgba(249,115,22,0.08),_transparent_58%)]" />
        <div className="relative flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-slate-300 bg-slate-50">
            <Lock className="h-5 w-5 text-slate-600" aria-hidden="true" />
          </div>
          <div>
            <h1 className="font-heading text-xl font-black text-slate-900">
              Not your task workspace
            </h1>
            <p className="mt-1 text-sm font-medium text-slate-600">
              Open your applicant magic link, or switch to an RBT identity with DevTools when enabled.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (taskSurface === 'LIVE') {
    return <RbtDashboardOverview />;
  }

  return <ApplicantOnboardingTasksHub />;
}

function ApplicantOnboardingTasksHub() {
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
  const [lastAuditHash, setLastAuditHash] = useState<string | null>(null);
  const [confirmKind, setConfirmKind] = useState<'SIGN' | 'NEXT' | null>(null);
  const [confirmPending, setConfirmPending] = useState(false);
  const [progressIssue, setProgressIssue] = useState<string | null>(null);
  const [progressReloadKey, setProgressReloadKey] = useState(0);

  // HR Interview Modal State
  const [hrMembers, setHrMembers] = useState<{ id: string; name: string; role: string; email: string }[]>([]);
  const [selectedHrId, setSelectedHrId] = useState('');
  const [selectedHr, setSelectedHr] = useState('Marcus Vance (HR Agent)');
  const [interviewDate, setInterviewDate] = useState(() =>
    clinicDateKey(addClinicDays(new Date(), 1))
  );
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
  const dialogRef = useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (activeModal === 'NONE') return;

    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const focusableSelector =
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const focusFirst = window.requestAnimationFrame(() => {
      const focusable =
        dialogRef.current?.querySelectorAll<HTMLElement>(focusableSelector) ?? [];
      (focusable[0] ?? dialogRef.current)?.focus();
    });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setActiveModal('NONE');
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;

      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(focusableSelector)
      );
      if (focusable.length === 0) {
        event.preventDefault();
        dialogRef.current.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFirst);
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [activeModal]);

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
    const frame = window.requestAnimationFrame(() => {
      setCheckRead(false);
      setCheckAgree(false);
      setCheckESign(false);
      setIsSigned(completedSteps.includes(currentStep));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [currentStep, completedSteps]);

  React.useEffect(() => {
    void getHrMembers().then((res) => {
      if (!res.success || res.data.length === 0) return;
      setHrMembers(res.data);
      const marcus =
        res.data.find((m) => m.name.toLowerCase().includes('marcus')) || res.data[0];
      setSelectedHrId(marcus.id);
      setSelectedHr(`${marcus.name} (${marcus.role})`);
    });
  }, []);

  React.useEffect(() => {
    void getOnboardingStepState().then((res) => {
      if (!res.success || !res.data) {
        setProgressIssue(res.error || 'Could not load the onboarding audit trail.');
        return;
      }
      const auditSteps = completedTaskStepsFromAudit(res.data.events);
      setCompletedSteps((previous) =>
        mergeCompletedTaskSteps(previous, auditSteps)
      );
      if (auditSteps.length === ONBOARDING_TOTAL_STEPS) {
        setTasksDone(true);
      }
      const latest = res.data.events.find(
        (event) =>
          event.stepNumber === currentStep && isOnboardingCompletionEvent(event)
      );
      setLastAuditHash(latest?.auditHash ?? null);
      setProgressIssue(null);
    });
  }, [currentStep, progressReloadKey]);

  const markStepComplete = async (step: number, auditHash?: string) => {
    if (auditHash) setLastAuditHash(auditHash);
    setIsSigned(true);
    const updated = mergeCompletedTaskSteps(completedSteps, [step]);
    setCompletedSteps(updated);
    const allDone = Array.from({ length: ONBOARDING_TOTAL_STEPS }, (_, i) => i + 1).every((s) =>
      updated.includes(s)
    );
    if (allDone) {
      setTasksDone(true);
      window.dispatchEvent(new Event('rbt_tasks_changed'));
    }
    const { syncAtsProgress } = await import('@/lib/syncAtsProgress');
    // The server rebuilds task completion from OnboardingSignatureEvent rows.
    const synced = await syncAtsProgress({});
    if (!synced) {
      setProgressIssue(
        'This step is in the signed audit trail, but the task summary could not sync. Retry after reconnecting.'
      );
      toast.warning('Step recorded; task summary sync is pending.');
      return;
    }
    setProgressIssue(null);
    if (allDone) {
      toast.success('All onboarding documents complete. Waiting for Head HR wage offer.');
    } else {
      toast.success(`Step ${step} saved. Confirm to continue to the next page.`);
    }
  };

  const handleSignDocument = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSigned) {
      if (currentStep < ONBOARDING_TOTAL_STEPS) setConfirmKind('NEXT');
      return;
    }
    if (!checkRead || !checkAgree || !checkESign) {
      toast.error('Please accept all consent terms and agreements before signing.');
      return;
    }
    if (!fullName.trim()) {
      toast.error('Please type your full legal name to sign.');
      return;
    }
    setConfirmKind('SIGN');
  };

  const confirmSignNow = async () => {
    setConfirmPending(true);
    const res = await recordOnboardingSignature({
      stepNumber: currentStep,
      signerName: fullName.trim(),
      consents: { read: checkRead, agree: checkAgree, eSign: checkESign },
    });
    setConfirmPending(false);
    if (!res.success) {
      toast.error(res.error);
      return;
    }
    setConfirmKind(null);
    await markStepComplete(currentStep, res.data.auditHash);
  };

  const confirmAdvanceNow = async () => {
    if (!completedSteps.includes(currentStep)) {
      toast.error('Complete this step before moving on.');
      return;
    }
    setConfirmPending(true);
    const res = await recordOnboardingAdvance(currentStep, currentStep + 1);
    setConfirmPending(false);
    if (!res.success) {
      toast.error(res.error);
      return;
    }
    setConfirmKind(null);
    setCurrentStep((prev) => Math.min(ONBOARDING_TOTAL_STEPS, prev + 1));
  };

  const handleSkipStep26 = async () => {
    toast.error(
      'Mandated reporter training cannot be skipped as signed-complete. Upload the certificate when ready, or ask HR to record a documented deferral.'
    );
  };

  const handleSkipStep27 = async () => {
    toast.error(
      'CPR certification cannot be skipped as signed-complete. Upload the certificate when ready, or ask HR to record a documented deferral.'
    );
  };

  const handleBookInterview = async (e: React.FormEvent) => {
    e.preventDefault();

    const realCandidateId = getActiveApplicantId() || '';
    const realCandidateName = getActiveApplicantName() || 'Applicant';

    if (!realCandidateId) {
      toast.error('No active applicant selected.');
      return;
    }

    if (!selectedHrId) {
      toast.error('Select an HR specialist first.');
      return;
    }

    const { bookHrInterview } = await import('@/app/actions/hrInterviewActions');
    const res = await bookHrInterview({
      candidateId: realCandidateId,
      candidateName: realCandidateName,
      hrInterviewerId: selectedHrId,
      hrInterviewerName: selectedHr || 'Marcus Vance',
      date: interviewDate,
      time: interviewTime,
    });

    if (!res.success) {
      toast.error(res.error || 'Failed to book interview');
      return;
    }

    setInterviewBooked(true);
    setActiveModal('NONE');
    window.dispatchEvent(new Event('rbt_interview_changed'));
    window.dispatchEvent(new Event('rbt_progress_synced'));
    toast.success(
      `HR Interview scheduled with ${selectedHr || 'Marcus Vance'} on ${interviewDate} at ${interviewTime}!`
    );
  };

  const handleSaveAvailability = async (e: React.FormEvent) => {
    e.preventDefault();
    const { syncAtsProgress } = await import('@/lib/syncAtsProgress');
    const synced = await syncAtsProgress({
      preferredBoroughs: selectedBoroughs,
    });
    if (!synced) {
      setProgressIssue('Availability could not be saved to your onboarding record.');
      toast.error('Could not save availability. Please try again.');
      return;
    }
    setActiveModal('NONE');
    window.dispatchEvent(new Event('rbt_availability_changed'));
    setProgressIssue('Borough preferences saved. Complete the weekly grid to finish availability.');
    toast.success('Borough preferences saved. Complete the weekly availability grid next.');
  };

  const handleCertUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const formData = new FormData();
      formData.append('file', file);
      const { uploadFortyHourCertificate } = await import(
        '@/app/actions/fortyHourCourseActions'
      );
      const result = await uploadFortyHourCertificate(formData);
      if (!result.success || !result.data) {
        const message =
          result.error ||
          'Certificate upload could not be stored. Please try again.';
        setProgressIssue(message);
        toast.error(message);
        return;
      }

      setCertFileName(result.data.certFileName || file.name);
      setCertUploaded(true);
      setProgressIssue(null);
      window.dispatchEvent(new Event('rbt_progress_synced'));
      toast.success(`Uploaded ${file.name}! BACB 40-Hour Certificate saved.`);
    } catch {
      const message =
        'Certificate upload could not be stored. Check your connection and try again.';
      setProgressIssue(message);
      toast.error(message);
    } finally {
      e.target.value = '';
    }
  };

  // Trial Simulator Controls
  const handleTrial = async (type: 'CORRECT' | 'PROMPTED' | 'INCORRECT') => {
    if (trialsCount >= 10) return;
    const newCount = trialsCount + 1;
    setTrialsCount(newCount);
    if (type === 'CORRECT') setCorrectCount(correctCount + 1);
    if (type === 'PROMPTED') setPromptedCount(promptedCount + 1);
    if (type === 'INCORRECT') setIncorrectCount(incorrectCount + 1);

    if (newCount === 10) {
      setSimCompleted(true);
      setProgressIssue(
        'Practice completed locally. Simulation readiness remains pending until a durable assessment record is implemented.'
      );
      toast.info('Practice complete. This attempt does not clear onboarding readiness.');
    }
  };

  const resetSimulator = () => {
    setTrialsCount(0);
    setCorrectCount(0);
    setPromptedCount(0);
    setIncorrectCount(0);
    setSimCompleted(false);
  };

  const isRbtCleared =
    tasksDone && interviewPassed && availabilitySet && simulatorPassed && certUploaded;
  const coreCompletedCount = [
    tasksDone,
    interviewPassed,
    availabilitySet,
    simulatorPassed,
    certUploaded,
  ].filter(Boolean).length;

  React.useEffect(() => {
    const applySnapshot = (data: {
      tasksDone: boolean;
      tasksCompletedSteps: number[];
      availabilityDone: boolean;
      simulationDone: boolean;
      interviewBooked: boolean;
      interviewPassed: boolean;
      certUploaded: boolean;
      clearedForHire: boolean;
    }) => {
      setCompletedSteps((previous) =>
        mergeCompletedTaskSteps(previous, data.tasksCompletedSteps)
      );
      setTasksDone((previous) => previous || data.tasksDone);
      setAvailabilitySet(data.availabilityDone);
      setSimulatorPassed(data.simulationDone);
      setSimCompleted(data.simulationDone);
      setInterviewBooked(data.interviewBooked);
      setInterviewPassed(data.interviewPassed);
      setCertUploaded(data.certUploaded);
      if (
        data.clearedForHire ||
        (data.tasksDone &&
          data.interviewPassed &&
          data.availabilityDone &&
          data.simulationDone &&
          data.certUploaded)
      ) {
        window.dispatchEvent(new Event('rbt_clearance_changed'));
      }
    };

    const loadFromDb = () => {
      void import('@/lib/syncAtsProgress').then(({ loadAtsProgress }) =>
        loadAtsProgress().then((data) => {
          if (data) {
            applySnapshot(data);
            setProgressIssue(null);
          } else {
            setProgressIssue('Persisted onboarding progress could not be loaded.');
          }
        })
      );
    };

    loadFromDb();
    window.addEventListener('rbt_sim_changed', loadFromDb);
    window.addEventListener('simulationCompleted', loadFromDb);
    window.addEventListener('rbt_availability_changed', loadFromDb);
    window.addEventListener('rbt_interview_changed', loadFromDb);
    window.addEventListener('rbt_tasks_changed', loadFromDb);
    window.addEventListener('rbt_progress_synced', loadFromDb);
    return () => {
      window.removeEventListener('rbt_sim_changed', loadFromDb);
      window.removeEventListener('simulationCompleted', loadFromDb);
      window.removeEventListener('rbt_availability_changed', loadFromDb);
      window.removeEventListener('rbt_interview_changed', loadFromDb);
      window.removeEventListener('rbt_tasks_changed', loadFromDb);
      window.removeEventListener('rbt_progress_synced', loadFromDb);
    };
  }, [progressReloadKey]);

  const totalSteps = ONBOARDING_TOTAL_STEPS;
  const currentDoc = getOnboardingDoc(currentStep);
  const usesTypedSignature = currentDoc.kind === 'ESIGN' || currentDoc.kind === 'ACK';
  const allPackStepsDone = Array.from({ length: ONBOARDING_TOTAL_STEPS }, (_, i) => i + 1).every((s) =>
    completedSteps.includes(s)
  );
  /** Only after final step (27) is submitted — not while mid-pack on uploads. */
  const packComplete = allPackStepsDone && (tasksDone || completedSteps.includes(ONBOARDING_TOTAL_STEPS));
  /** Pack + interview + availability + sim + 40-hr cert — then wait for Head HR / LS-54. */
  const allRequirementsDone =
    packComplete && interviewPassed && availabilitySet && simulatorPassed && certUploaded;
  const tierAComplete = completedSteps.filter(s => s <= 22).length;
  const tierBComplete = completedSteps.filter(s => s > 22).length;
  const stepsList = Array.from({ length: totalSteps }, (_, i) => i + 1);

  const remainingRequirements: {
    key: string;
    label: string;
    detail: string;
    done: boolean;
    href?: string;
  }[] = [
    {
      key: 'interview',
      label: 'HR Interview',
      detail: interviewPassed
        ? 'Approved by HR'
        : interviewBooked
        ? 'Slot booked — awaiting HR evaluation'
        : 'Book and complete your interview',
      done: interviewPassed,
      href: '/rbt/interview',
    },
    {
      key: 'availability',
      label: 'Set Availability',
      detail: availabilitySet ? 'Schedule submitted' : 'Submit your weekly availability',
      done: availabilitySet,
      href: '/rbt/availability',
    },
    {
      key: 'simulation',
      label: 'Data Collection Simulation',
      detail: simulatorPassed ? 'Simulation passed' : 'Complete the 10-trial simulator',
      done: simulatorPassed,
      href: '/rbt/simulation',
    },
    {
      key: 'cert',
      label: '40-Hour Course Certificate',
      detail: certUploaded ? 'Certificate on file' : 'Upload your RBT 40-hour certificate',
      done: certUploaded,
      href: '/rbt/documents',
    },
  ];

  const formattedDate = new Date().toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
  const minimumInterviewDate = clinicDateKey(new Date());

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-12">
      {progressIssue ? (
        <div
          className="relative overflow-hidden rounded-2xl border border-amber-300 bg-amber-50 p-4 text-slate-900 shadow-md"
          role="alert"
        >
          <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <Clock className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
              <div>
                <p className="text-sm font-black text-amber-900">
                  Progress sync needs attention
                </p>
                <p className="mt-0.5 text-xs font-medium text-amber-800">
                  {progressIssue}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setProgressReloadKey((key) => key + 1)}
              className="cursor-pointer rounded-xl border border-amber-300 bg-white px-3.5 py-2 text-xs font-black text-amber-900 transition hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
            >
              Retry progress
            </button>
          </div>
        </div>
      ) : null}
      {/* ONBOARDING & SERVICE CLEARANCE HUB BANNER - 100% OPAQUE PURE WHITE */}
      <div className="bg-white border-2 border-orange-200 rounded-3xl shadow-xl p-6 sm:p-8 space-y-6 text-slate-900">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-orange-100 pb-5">
          <div>
            <div className="flex items-center gap-2.5">
              <ShieldCheck className={`w-7 h-7 ${isRbtCleared ? 'text-emerald-600' : 'text-[#F97316]'}`} />
              <h1 className="text-2xl font-black text-slate-900 font-heading tracking-tight">
                RBT Service Clearance Onboarding Hub
              </h1>
            </div>
            <p className="text-xs text-slate-600 font-semibold mt-1">
              Complete all <strong>5 requirements</strong> below — including the mandatory{' '}
              <strong>40-Hour BACB Course</strong> — before Head HR can extend your wage offer.
            </p>
          </div>

          <div className="flex flex-col items-end gap-2">
            <span className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-black uppercase tracking-wide border shadow-sm ${
              isRbtCleared
                ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                : 'bg-orange-100 text-[#F97316] border-orange-300'
            }`}>
              <span className={`w-2.5 h-2.5 rounded-full ${isRbtCleared ? 'bg-emerald-500 animate-pulse' : 'bg-[#F97316]'}`} />
              {isRbtCleared
                ? '✓ CLEARED AS REGISTERED BEHAVIOR TECHNICIAN (RBT)'
                : `${coreCompletedCount} OF 5 REQUIREMENTS DONE`}
            </span>

            <div className="flex items-center gap-3">
              <Link
                href="/rbt/help-desk"
                className="bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 border border-rose-300 font-extrabold text-xs px-3.5 py-1.5 rounded-full flex items-center gap-1.5 cursor-pointer transition-all shadow-sm"
              >
                <span>💬 Need Help? Contact HR Recruiter</span>
              </Link>
            </div>
          </div>
        </div>

        {/* 5 PARALLEL REQUIREMENTS CARDS - CLICK TO NAVIGATE TO DEDICATED TAB */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
          {/* REQ 1: MY TASKS */}
          <button
            type="button"
            onClick={() => window.scrollTo({ top: 450, behavior: 'smooth' })}
            className={`flex w-full cursor-pointer flex-col justify-between gap-2.5 rounded-2xl border-2 p-4 text-left shadow-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F97316]/70 ${
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
              <p className="text-[10px] text-slate-600 font-medium">
                {completedSteps.length}/{totalSteps} onboarding steps complete
              </p>
            </div>
            <span className={`text-[10px] font-black ${tasksDone ? 'text-emerald-700' : 'text-[#F97316]'}`}>
              {tasksDone ? '✓ Completed' : 'Sign Forms Below ↓'}
            </span>
          </button>

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

          {/* REQ 5: 40-HR CERTIFICATE (MANDATORY) */}
          <Link
            href="/rbt/documents"
            className={`p-4 rounded-2xl border-2 flex flex-col justify-between gap-2.5 transition-all cursor-pointer shadow-sm ${
              certUploaded
                ? 'bg-emerald-50/90 border-emerald-300 text-slate-900'
                : 'bg-[#F0F7FF] border-[#BFDBFE] text-slate-900 hover:border-[#F97316]'
            }`}
          >
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono font-bold text-slate-600">REQ 5</span>
                {certUploaded ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <Award className="w-4 h-4 text-[#F97316]" />}
              </div>
              <h4 className="font-extrabold text-xs text-slate-900">40-Hr Course</h4>
              <p className="text-[10px] text-slate-600 font-medium">
                {certFileName ? 'Uploaded' : 'Mandatory for hire'}
              </p>
            </div>
            <span className={`text-[10px] font-black ${certUploaded ? 'text-emerald-700' : 'text-[#F97316]'}`}>
              {certUploaded ? '✓ Verified' : 'Upload Cert →'}
            </span>
          </Link>
        </div>
      </div>

      {/* HR INTERVIEW BOOKING MODAL */}
      {activeModal === 'INTERVIEW' && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="rbt-interview-dialog-title"
            tabIndex={-1}
            className="bg-white border-2 border-orange-200 rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl animate-fade-in text-slate-900 focus:outline-none"
          >
            <div className="flex items-center justify-between border-b border-orange-100 pb-3">
              <h3 id="rbt-interview-dialog-title" className="text-lg font-black text-slate-900 font-heading">Book HR Onboarding Interview</h3>
              <button
                type="button"
                onClick={() => setActiveModal('NONE')}
                aria-label="Close interview dialog"
                className="cursor-pointer rounded-lg p-1 font-bold text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F97316]/70"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleBookInterview} className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-800 block mb-1">Select HR Specialist</label>
                <select
                  value={selectedHrId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setSelectedHrId(id);
                    const member = hrMembers.find((m) => m.id === id);
                    if (member) setSelectedHr(`${member.name} (${member.role})`);
                  }}
                  className="w-full bg-blue-50/50 border border-blue-200 rounded-xl p-2.5 text-xs text-slate-900 font-bold cursor-pointer"
                >
                  {hrMembers.length === 0 ? (
                    <option value="">Loading HR specialists…</option>
                  ) : (
                    hrMembers.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} ({m.role})
                      </option>
                    ))
                  )}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-bold text-slate-800 block mb-1">Date</label>
                  <input
                    type="date"
                    value={interviewDate}
                    min={minimumInterviewDate}
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
                    <option value="10:00 AM">10:00 AM ET</option>
                    <option value="01:30 PM">01:30 PM ET</option>
                    <option value="04:00 PM">04:00 PM ET</option>
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
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="rbt-availability-dialog-title"
            tabIndex={-1}
            className="bg-white border-2 border-orange-200 rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl animate-fade-in text-slate-900 focus:outline-none"
          >
            <div className="flex items-center justify-between border-b border-orange-100 pb-3">
              <h3 id="rbt-availability-dialog-title" className="text-lg font-black text-slate-900 font-heading">Set Weekly Availability &amp; Boroughs</h3>
              <button
                type="button"
                onClick={() => setActiveModal('NONE')}
                aria-label="Close availability dialog"
                className="cursor-pointer rounded-lg p-1 font-bold text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F97316]/70"
              >
                ✕
              </button>
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
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="rbt-certificate-dialog-title"
            tabIndex={-1}
            className="bg-white border-2 border-orange-200 rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl animate-fade-in text-slate-900 focus:outline-none"
          >
            <div className="flex items-center justify-between border-b border-orange-100 pb-3">
              <h3 id="rbt-certificate-dialog-title" className="text-lg font-black text-slate-900 font-heading">Upload 40-Hour RBT Certificate</h3>
              <button
                type="button"
                onClick={() => setActiveModal('NONE')}
                aria-label="Close certificate dialog"
                className="cursor-pointer rounded-lg p-1 font-bold text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F97316]/70"
              >
                ✕
              </button>
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
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="rbt-simulator-dialog-title"
            tabIndex={-1}
            className="bg-white border-2 border-orange-200 rounded-3xl p-6 max-w-lg w-full space-y-5 shadow-2xl animate-fade-in text-slate-900 focus:outline-none"
          >
            <div className="flex items-center justify-between border-b border-orange-100 pb-3">
              <div className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-[#F97316]" aria-hidden="true" />
                <h3 id="rbt-simulator-dialog-title" className="text-lg font-black text-slate-900 font-heading">ABA Data Collection Simulator</h3>
              </div>
              <button
                type="button"
                onClick={() => setActiveModal('NONE')}
                aria-label="Close simulator dialog"
                className="cursor-pointer rounded-lg p-1 font-bold text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F97316]/70"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div className="bg-blue-50/70 p-4 rounded-2xl border border-blue-200 space-y-2">
                <div className="flex justify-between items-center text-xs font-bold">
                  <span className="text-slate-900">Trial Progress: {trialsCount} / 10 Trials</span>
                  <span className="text-[#F97316]">Target: 10 Trials</span>
                </div>
                <div
                  className="w-full h-3 bg-blue-100 rounded-full overflow-hidden flex"
                  role="progressbar"
                  aria-label="Simulation trial progress"
                  aria-valuemin={0}
                  aria-valuemax={10}
                  aria-valuenow={trialsCount}
                >
                  <div className="bg-[#F97316] h-full transition-all duration-300" style={{ width: `${(trialsCount / 10) * 100}%` }} />
                </div>
              </div>

              <div className="p-4 bg-orange-50 rounded-2xl border border-orange-200 text-center space-y-2">
                <span className="text-[10px] font-mono font-bold text-[#F97316] uppercase tracking-wider block">Simulated SD (Instruction):</span>
                <p className="text-sm font-extrabold text-slate-900 font-heading">
                  &quot;Touch the Blue Square&quot;
                </p>
                <p className="text-xs text-slate-600">Record learner response prompt level below:</p>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  disabled={trialsCount >= 10}
                  onClick={() => void handleTrial('CORRECT')}
                  className="bg-emerald-500 hover:bg-emerald-600 text-white font-extrabold text-xs py-3 rounded-xl shadow-md cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                >
                  + Correct (+)
                </button>

                <button
                  type="button"
                  disabled={trialsCount >= 10}
                  onClick={() => void handleTrial('PROMPTED')}
                  className="bg-amber-500 hover:bg-amber-600 text-white font-extrabold text-xs py-3 rounded-xl shadow-md cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                >
                  + Prompted (+P)
                </button>

                <button
                  type="button"
                  disabled={trialsCount >= 10}
                  onClick={() => void handleTrial('INCORRECT')}
                  className="bg-rose-500 hover:bg-rose-600 text-white font-extrabold text-xs py-3 rounded-xl shadow-md cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
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

      {/* 27-STEP COMPLIANCE TASK WORKFLOW — replaced by wage-offer wait after step 27 */}
      <div className="space-y-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-orange-100 border border-orange-200 text-[#F97316] flex items-center justify-center shrink-0 shadow-md mt-1">
            <ClipboardList className="w-7 h-7" />
          </div>
          <div>
            <h2 className="text-3xl font-black text-slate-900 font-heading tracking-tight">My Tasks</h2>
            <p className="text-sm font-semibold text-slate-700 mt-0.5">
              {allRequirementsDone
                ? 'All requirements complete — waiting for Head HR'
                : packComplete
                ? `Documents done · ${remainingRequirements.filter((r) => !r.done).length} requirement(s) still to do`
                : `${completedSteps.length} of ${totalSteps} complete · Policies: ${tierAComplete}/22 · Forms & uploads: ${tierBComplete}/5`}
            </p>
          </div>
        </div>

        <div className="w-full h-px bg-slate-200 my-4" />

        {packComplete && allRequirementsDone ? (
          <WageOfferApplicantCard packComplete />
        ) : packComplete ? (
          <div className="space-y-4 rounded-3xl border-2 border-orange-200 bg-white p-6 shadow-xl text-slate-900 sm:p-8">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-orange-200 bg-orange-50 text-[#F97316]">
                <ClipboardList className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-heading text-xl font-black text-slate-900">
                  Finish your remaining requirements
                </h3>
                <p className="mt-1 text-sm leading-relaxed text-slate-600">
                  Your onboarding documents are done. Complete the items below, then this page will switch to
                  Waiting for Head HR for your wage notice (LS-54).
                </p>
              </div>
            </div>

            <ul className="space-y-2">
              {remainingRequirements.map((req) => {
                const inner = (
                  <>
                    <div className="flex items-start gap-3">
                      {req.done ? (
                        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                      ) : (
                        <Clock className="mt-0.5 h-5 w-5 shrink-0 text-[#F97316]" />
                      )}
                      <div>
                        <p className="text-sm font-black text-slate-900">{req.label}</p>
                        <p className="text-xs font-medium text-slate-600">{req.detail}</p>
                      </div>
                    </div>
                    <span
                      className={`shrink-0 rounded-lg px-2 py-1 text-[10px] font-black uppercase tracking-wide ${
                        req.done
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-orange-100 text-orange-800'
                      }`}
                    >
                      {req.done ? 'Done' : 'To do'}
                    </span>
                  </>
                );

                const className = `flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 transition-all ${
                  req.done
                    ? 'border-emerald-200 bg-emerald-50/80'
                    : 'border-slate-200 bg-slate-50 hover:border-[#F97316]/40 hover:bg-orange-50/40'
                }`;

                if (req.href && !req.done) {
                  return (
                    <li key={req.key}>
                      <Link href={req.href} className={`${className} cursor-pointer`}>
                        {inner}
                      </Link>
                    </li>
                  );
                }

                if (req.key === 'simulation' && !req.done) {
                  return (
                    <li key={req.key}>
                      <button
                        type="button"
                        onClick={() => setActiveModal('SIMULATOR')}
                        className={`${className} w-full cursor-pointer text-left`}
                      >
                        {inner}
                      </button>
                    </li>
                  );
                }

                return (
                  <li key={req.key}>
                    <div className={className}>{inner}</div>
                  </li>
                );
              })}
            </ul>

            <p className="text-center text-[11px] font-semibold text-slate-500">
              {remainingRequirements.filter((r) => r.done).length} of {remainingRequirements.length}{' '}
              remaining requirements complete
            </p>
          </div>
        ) : (
        <>
        {/* STEP NUMBER POINTERS */}
        <div className="flex items-center gap-2 overflow-x-auto pb-3 custom-scrollbar">
          {stepsList.map((stepNum) => {
            const isCurrent = currentStep === stepNum;
            const isDone = completedSteps.includes(stepNum);
            const isUnlocked = stepNum === 1 || completedSteps.includes(stepNum - 1);

            return (
              <button
                type="button"
                key={stepNum}
                disabled={!isUnlocked && !isDone}
                onClick={() => {
                  if (isUnlocked || isDone) setCurrentStep(stepNum);
                  else toast.error(`Please complete Step ${stepNum - 1} first.`);
                }}
                aria-current={isCurrent ? 'step' : undefined}
                aria-disabled={!isUnlocked && !isDone}
                aria-label={`Onboarding step ${stepNum}${
                  isDone ? ', completed' : isUnlocked ? ', available' : ', locked'
                }`}
                className={`min-w-[36px] h-9 rounded-full text-xs font-bold transition-all flex items-center justify-center shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F97316]/70 ${
                  isCurrent
                    ? 'cursor-pointer bg-[#F97316] text-white shadow-lg shadow-orange-500/30 scale-105'
                    : isDone
                    ? 'cursor-pointer bg-emerald-100 text-emerald-700 border border-emerald-300'
                    : isUnlocked
                      ? 'cursor-pointer bg-[#F0F7FF] text-slate-700 border border-[#BFDBFE] hover:border-[#F97316]'
                      : 'cursor-not-allowed bg-slate-100 text-slate-400 border border-slate-200 opacity-70'
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
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h3 className="text-2xl font-black text-slate-900 font-heading">
              Step {currentStep} of {totalSteps}: {currentDoc.title}
            </h3>
            <OnboardingDocumentStatus
              doc={currentDoc}
              complete={completedSteps.includes(currentStep)}
            />
          </div>
          <p className="text-[11px] font-mono text-slate-500">{currentDoc.legalCite} · pack {currentDoc.version}</p>

          {currentDoc.kind === 'EMBEDDED' ? (
            <EmbeddedOnboardingFormPanel
              doc={currentDoc}
              alreadyDone={completedSteps.includes(currentStep)}
              signerName={fullName}
              onSubmitted={(auditHash) => {
                void markStepComplete(currentStep, auditHash);
              }}
            />
          ) : currentDoc.kind === 'UPLOAD' ? (
            <UploadCertificatePanel
              doc={currentDoc}
              alreadyDone={completedSteps.includes(currentStep)}
              onUploaded={() => {
                void markStepComplete(currentStep);
              }}
              onSkip={currentStep === 26 ? handleSkipStep26 : currentStep === 27 ? handleSkipStep27 : undefined}
            />
          ) : currentDoc.kind === 'QUIZ' ? (
            <div className="space-y-4">
              <OfficialPdfBar doc={currentDoc} />
              <HarassmentQuizPanel
                alreadyPassed={completedSteps.includes(25)}
                onResult={(passed) => {
                  if (passed) void markStepComplete(25);
                }}
              />
            </div>
          ) : (
            <>
          <OfficialPdfBar doc={currentDoc} />
          {/* DOCUMENT PREVIEWER */}
          <div
            ref={documentRef}
            onScroll={handleScroll}
            className="border-2 border-slate-200 rounded-2xl p-6 max-h-[420px] overflow-y-auto space-y-4 text-xs text-slate-700 leading-relaxed bg-[#FFFDF9] shadow-inner custom-scrollbar relative"
          >
            {/* DOCUMENT LOGO HEADER */}
            <div className="border-b border-orange-200 pb-4 text-center space-y-1">
              <div className="flex items-center justify-center gap-3">
                <Image
                  src="/logo.png"
                  alt="Rise & Shine ABA Logo"
                  width={48}
                  height={48}
                  className="h-12 w-12 object-contain"
                />
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
                    This Consent allows you to receive, review, sign, and store documents from Rise &amp; Shine ABA LLC in electronic form rather than on paper. Federal law (the Electronic Signatures in Global and National Commerce Act, or &quot;E-SIGN&quot; Act, 15 U.S.C. §§ 7001 et seq.) and New York State law (the Electronic Signatures and Records Act, NY State Technology Law §§ 301-309, or &quot;ESRA&quot;) give electronic signatures and electronic records the same legal validity as paper signatures and paper records — but only if the parties agree, and only if certain disclosures are provided. This document provides those disclosures and obtains your consent.
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
                  Welcome to Rise &amp; Shine ABA. We are thrilled you&apos;ve chosen to join our team and to bring your skills to the children and families we serve. Whether you&apos;ll be working in homes, schools, telehealth, or community settings, your role is essential to our mission of helping children grow, learn, and shine.
                </p>

                <h5 className="font-bold text-slate-900 text-xs">1. Your Employment Classification</h5>
                <p>You are being hired as a <strong>W-2 employee</strong> of Rise &amp; Shine ABA LLC. This means:</p>
                <ul className="list-disc pl-5 space-y-1 text-[11px] text-slate-700">
                  <li>We withhold federal, state, and FICA taxes from each paycheck.</li>
                  <li>We provide workers&apos; compensation, disability, and Paid Family Leave coverage as required by New York law.</li>
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

                <h5 className="font-bold text-slate-900 text-xs mt-3">3. Critical Policy You&apos;ll See Throughout Onboarding</h5>
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
                    <li><strong>Zero Social Media Exemption:</strong> Never post client photos, videos, or stories on social media—even if &quot;de-identified&quot;.</li>
                    <li>Access PHI only under the federal &quot;Minimum Necessary Rule&quot;.</li>
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
                    <li>Client Name and Client ID number in the RAS EMR</li>
                    <li>Date of service and exact start/end times (to the minute — no rounding)</li>
                    <li>Service location (home, clinic, school, telehealth, community)</li>
                    <li>CPT code billed (97153 RBT direct, 97155 BCBA protocol modification, 97156 parent training)</li>
                    <li>Specific goals targeted, ABA interventions used, and quantitative trial data</li>
                    <li>RBT signature &amp; Parent/Guardian signature</li>
                  </ul>
                </div>

                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-900 text-[11px] font-semibold">
                  ⏰ <strong>The 24-Hour Rule:</strong> Every session note must be submitted and signed in the RAS EMR within 24 hours of session end. Notes past 24 hours are non-billable and unpaid.
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
                    <li>GPS geolocation in the RAS EMR verifies session location compliance.</li>
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
              /* STEP 13: RBT SUPERVISION CONTRACT */
              <div className="space-y-4 text-slate-800 leading-relaxed text-xs">
                <div className="text-center border-b pb-3 border-slate-200 space-y-1">
                  <h4 className="text-sm font-black text-slate-900 uppercase font-heading tracking-wide">
                    RBT SUPERVISION CONTRACT
                  </h4>
                  <p className="text-[11px] text-slate-500 font-mono italic">
                    Agency acknowledgment • Check current certification and assignment requirements
                  </p>
                </div>

                <div className="space-y-2">
                  <h5 className="font-bold text-slate-900 text-xs">1. Certification and Local Requirements</h5>
                  <ul className="list-disc pl-5 space-y-1 text-[11px] text-slate-700">
                    <li>Current BACB certification requirements govern RBT certification supervision; verify the current source and version directly with BACB or your qualified supervisor.</li>
                    <li>Agency policy, payer contracts, and state rules are separate and may add requirements for a specific assignment.</li>
                    <li><strong>Confirm current supervision plan with your qualified supervisor/HR.</strong></li>
                    <li>This portal does not calculate or certify supervision compliance.</li>
                  </ul>
                </div>

                <div className="space-y-2">
                  <h5 className="font-bold text-slate-900 text-xs">2. Scope of RBT Practice</h5>
                  <p>RBTs implement assigned treatment protocols under qualified-supervisor direction and do not independently design treatment plans or FBAs. Follow the confirmed supervision plan and current scope requirements for each assignment.</p>
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
                  <p className="text-[11px] text-slate-500 font-mono italic">NYS Workers&apos; Compensation Board Official Disclosure</p>
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
                  <p className="text-[11px] text-slate-500 font-mono italic">NYS Workers&apos; Compensation Board • Helpline: (844) 337-6303</p>
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
            ) : null}
          </div>

          {/* CONSENT CHECKBOXES AND SIGNATURE FIELD (ONLY WHEN NOT YET SIGNED) */}
          <form onSubmit={handleSignDocument} className="space-y-4 pt-2">
            {!isSigned && (
              <>
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
                        By typing my name below and clicking &apos;Sign &amp; Move to Next Document&apos;, I am signing this document electronically. I agree that my electronic signature is the legal equivalent of my handwritten signature on this document.
                      </span>
                    </label>
                  </div>
                </div>

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
              </>
            )}

            {/* INJECT GOOGLE FONTS FOR AUDIT LOG CURSIVE SIGNATURE */}
            <style dangerouslySetInnerHTML={{ __html: `
              @import url('https://fonts.googleapis.com/css2?family=Great+Vibes&family=Dancing+Script:wght@700&display=swap');
              .font-signature {
                font-family: 'Great Vibes', 'Dancing Script', cursive !important;
              }
            ` }} />

            {/* AUDIT LOG SIGNATURE SEAL FOR SIGNED DOCUMENTS */}
            {isSigned && (
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
                    {fullName.trim() || 'Verified Signatory'}
                  </div>
                  {/* INK STROKE LINE */}
                  <div className="w-56 h-0.5 bg-gradient-to-r from-amber-400/80 via-yellow-200 to-transparent rounded-full shadow-sm" />
                </div>

                <div className="flex items-center justify-between pt-1 border-t border-amber-500/20 text-[10px] font-mono text-slate-400 relative z-10">
                  <div>
                    <span className="text-slate-500 block text-[9px]">SIGNATORY LEGAL NAME</span>
                    <span className="font-bold text-slate-200">{fullName.trim() || 'Verified Signatory'}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-slate-500 block text-[9px]">TIMESTAMP &amp; AUDIT HASH</span>
                    <span className="font-bold text-amber-300/90">{formattedDate} ET · {lastAuditHash ? lastAuditHash.slice(0, 12) : 'persisted'}</span>
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
                ? (isSigned ? '✓ Final Document Signed' : 'Sign this document')
                : (isSigned ? 'Confirm & go to next page' : 'Sign this document')}
            </Button>
          </form>
            </>
          )}

          {!usesTypedSignature && completedSteps.includes(currentStep) && currentStep < totalSteps && (
            <button
              type="button"
              onClick={() => setConfirmKind('NEXT')}
              className="w-full cursor-pointer rounded-2xl bg-[#F4A261] py-3.5 text-sm font-black text-white shadow-lg transition hover:bg-[#e7924e]"
            >
              Confirm & go to next page
            </button>
          )}
          {!usesTypedSignature &&
            completedSteps.includes(currentStep) &&
            currentStep === totalSteps && (
            <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-center text-sm font-semibold text-emerald-800">
              Final step saved. Finishing your onboarding pack…
            </p>
          )}
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
                toast.error('Please complete the current document first.');
                return;
              }
              setConfirmKind('NEXT');
            }}
            className="bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 font-bold text-xs px-5 py-2.5 rounded-xl cursor-pointer shadow-sm flex items-center gap-1"
          >
            <span>Next</span>
            <span>&gt;</span>
          </Button>
        </div>
        </>
        )}
      </div>

      {/* HELP DESK MODAL FOR APPLICANTS */}
      {activeModal === 'HELP_DESK' && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="rbt-help-dialog-title"
            tabIndex={-1}
            className="bg-white border-2 border-orange-200 rounded-3xl p-6 sm:p-8 max-w-md w-full space-y-5 shadow-2xl animate-fade-in relative text-slate-900 focus:outline-none"
          >
            <div className="flex items-center justify-between border-b border-orange-100 pb-3">
              <div>
                <h3 id="rbt-help-dialog-title" className="text-base font-black text-slate-900 font-heading flex items-center gap-2">
                  💬 Contact HR Recruiter Help Desk
                </h3>
                <p className="text-xs text-slate-600 font-medium mt-0.5">Send an assistance alert to your assigned HR Specialist</p>
              </div>
              <button
                type="button"
                onClick={() => setActiveModal('NONE')}
                aria-label="Close help desk dialog"
                className="cursor-pointer rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F97316]/70"
              >
                ✕
              </button>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const candidateId = getActiveApplicantId();
                if (!candidateId || candidateId === 'c1') {
                  toast.error('No active applicant selected.');
                  return;
                }
                const { createHelpTicket } = await import('@/app/actions/helpDeskActions');
                const res = await createHelpTicket({
                  candidateId,
                  category: helpCategory,
                  subject: 'Onboarding assistance request',
                  message: helpMessage || 'Applicant requested assistance on onboarding portal.',
                });
                if (!res.success) {
                  toast.error(res.error || 'Failed to send alert');
                  return;
                }
                setActiveModal('NONE');
                window.dispatchEvent(new Event('rbt_progress_synced'));
                toast.success('Assistance alert sent! Profile flagged in Help Desk Alerts.');
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

      <OnboardingConfirmModal
        open={confirmKind === 'SIGN'}
        title="Confirm electronic signature"
        body={
          <p>
            You are about to electronically sign <strong>{currentDoc.title}</strong>. This is a legally binding
            action under the federal E-SIGN Act and New York ESRA. Are you sure?
          </p>
        }
        confirmLabel="Sign now"
        pending={confirmPending}
        onCancel={() => setConfirmKind(null)}
        onConfirm={() => void confirmSignNow()}
      />
      <OnboardingConfirmModal
        open={confirmKind === 'NEXT'}
        title="Confirm before continuing"
        body={
          <p>
            You completed <strong>{currentDoc.title}</strong>. Confirm to leave this page and open the next
            onboarding step. This confirmation is recorded in your audit trail.
          </p>
        }
        confirmLabel="Continue"
        pending={confirmPending}
        onCancel={() => setConfirmKind(null)}
        onConfirm={() => void confirmAdvanceNow()}
      />
    </div>
  );
}
