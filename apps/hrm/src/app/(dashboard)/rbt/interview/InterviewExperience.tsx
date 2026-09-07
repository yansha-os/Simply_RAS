'use client';

import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  Check,
  CheckCircle2,
  CircleDashed,
  Clock3,
  CloudUpload,
  ExternalLink,
  LifeBuoy,
  LockKeyhole,
  Radio,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  UserRound,
  Video,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { bookOwnInterview, getInterviewPortalSnapshot } from './actions';
import {
  INTERVIEW_TIME_SLOTS_ET,
  deriveInterviewView,
  formatInterviewDateEt,
  getDefaultInterviewDateEt,
  isInterviewJoinWindowOpen,
  isSafeInterviewMeetingUrl,
  normalizeInterviewTimeEt,
  type InterviewPortalResult,
  type InterviewPortalSnapshot,
  type InterviewView,
} from './interviewUi';
import { OnboardingNextStepsPrompt } from '@/components/rbt/OnboardingNextStepsPrompt';

const cardClass =
  'rounded-3xl border border-[#E2D5B7] bg-[#FFFDF8] text-slate-900 shadow-[0_16px_50px_rgba(214,198,165,0.25)] backdrop-blur-xl';

function viewLabel(view: InterviewView) {
  switch (view) {
    case 'APPROVED':
      return 'Approved';
    case 'REVIEWED':
      return 'HR review submitted';
    case 'SCHEDULED':
      return 'Interview scheduled';
    case 'BOOKING':
      return 'Ready to schedule';
    case 'CLOSED':
      return 'Application closed';
    default:
      return 'Pending HR access';
  }
}

function viewTone(view: InterviewView) {
  if (view === 'APPROVED') {
    return 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300';
  }
  if (view === 'SCHEDULED') {
    return 'border-sky-400/30 bg-sky-400/10 text-sky-300';
  }
  if (view === 'REVIEWED') {
    return 'border-violet-400/30 bg-violet-400/10 text-violet-300';
  }
  if (view === 'CLOSED') {
    return 'border-rose-400/30 bg-rose-400/10 text-rose-300';
  }
  return 'border-orange-400/30 bg-orange-400/10 text-orange-300';
}

function SecureAccessState({
  result,
  retrying,
  onRetry,
}: {
  result: Extract<InterviewPortalResult, { success: false }>;
  retrying: boolean;
  onRetry: () => void;
}) {
  const sessionIssue =
    result.reason === 'NO_SESSION' || result.reason === 'INACTIVE_SESSION';

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-3xl items-center px-4 py-12 text-slate-900">
      <section
        className={`${cardClass} relative w-full overflow-hidden p-7 sm:p-10`}
        aria-labelledby="interview-access-title"
      >
        <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-orange-500/10 blur-3xl" />
        <div className="relative space-y-6">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-orange-400/30 bg-orange-400/10 text-[#C2410C] shadow-md">
            <LockKeyhole className="h-7 w-7" aria-hidden="true" />
          </div>
          <div className="space-y-2">
            <p className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-[#C2410C]">
              Device-secured applicant workspace
            </p>
            <h1
              id="interview-access-title"
              className="font-heading text-2xl font-black tracking-tight text-slate-900 sm:text-3xl"
            >
              {sessionIssue ? 'Open your secure applicant link' : 'Interview workspace unavailable'}
            </h1>
            <p className="max-w-xl text-sm leading-6 text-slate-600">{result.error}</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={onRetry}
              disabled={retrying}
              className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-2xl bg-orange-500 px-5 py-3 text-sm font-black text-white shadow-lg transition-all duration-300 hover:scale-[1.01] hover:bg-orange-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-300 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw
                className={`h-4 w-4 ${retrying ? 'animate-spin motion-reduce:animate-none' : ''}`}
                aria-hidden="true"
              />
              {retrying ? 'Verifying access…' : 'Try secure access again'}
            </button>
            <Link
              href="/apply"
              className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-[#E2D5B7] bg-[#F9F5EC] px-5 py-3 text-sm font-bold text-slate-800 transition-all duration-300 hover:border-orange-400/40 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-300"
            >
              Return to applications
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}

function InterviewLifecycle({ snapshot }: { snapshot: InterviewPortalSnapshot }) {
  const status = snapshot.interview?.status.toUpperCase() ?? '';
  const steps = [
    {
      label: 'Appointment saved',
      detail: 'A real AtsInterview record exists',
      done: snapshot.interviewBooked && Boolean(snapshot.interview),
    },
    {
      label: 'Interview started',
      detail: 'HR joined the secured meeting room',
      done:
        Boolean(snapshot.interview?.hrJoinedAt) ||
        status === 'IN_PROGRESS' ||
        status === 'COMPLETED',
    },
    {
      label: 'HR review submitted',
      detail: 'The interviewer recorded an official outcome',
      done: status === 'COMPLETED',
    },
    {
      label: 'Requirement approved',
      detail: 'The durable interviewPassed flag is on',
      done: snapshot.interviewPassed,
    },
  ];

  return (
    <section className={`${cardClass} p-5 sm:p-6`} aria-labelledby="interview-lifecycle-title">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
            Persisted workflow
          </p>
          <h2 id="interview-lifecycle-title" className="mt-1 text-base font-black text-slate-900">
            Interview lifecycle
          </h2>
        </div>
        <ShieldCheck className="h-5 w-5 text-[#C2410C]" aria-hidden="true" />
      </div>
      <ol className="space-y-4">
        {steps.map((step, index) => (
          <li key={step.label} className="flex items-start gap-3">
            <span
              className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${
                step.done
                  ? 'border-emerald-500/30 bg-emerald-100 text-emerald-800'
                  : 'border-[#E2D5B7] bg-[#F9F5EC] text-slate-400'
              }`}
              aria-label={step.done ? 'Complete' : 'Not complete'}
            >
              {step.done ? (
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <span className="font-mono text-[10px] font-bold">{index + 1}</span>
              )}
            </span>
            <div>
              <p className={`text-sm font-bold ${step.done ? 'text-slate-900' : 'text-slate-500'}`}>
                {step.label}
              </p>
              <p className="mt-0.5 text-[11px] leading-5 text-slate-600">{step.detail}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function RecordingBoundary({ snapshot }: { snapshot: InterviewPortalSnapshot }) {
  const status = snapshot.interview?.status.toUpperCase();
  return (
    <section
      className={`${cardClass} relative overflow-hidden p-5 sm:p-6`}
      aria-labelledby="recording-boundary-title"
    >
      <div className="pointer-events-none absolute -bottom-20 -right-16 h-44 w-44 rounded-full bg-rose-500/10 blur-3xl" />
      <div className="relative space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
              Privacy boundary
            </p>
            <h2 id="recording-boundary-title" className="mt-1 text-base font-black text-slate-900">
              Recording &amp; review
            </h2>
          </div>
          <CloudUpload className="h-5 w-5 text-rose-500" aria-hidden="true" />
        </div>
        <div className="rounded-2xl border border-rose-300 bg-rose-50 p-4">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-rose-500 shadow-[0_0_12px_rgba(251,113,133,0.8)]" />
            <p className="text-xs font-black uppercase tracking-wide text-rose-800">
              Authorized HR staff only
            </p>
          </div>
          <p className="mt-2 text-xs leading-5 text-rose-900">
            Recording upload progress and errors stay in the HR interview console. A recording
            upload cannot complete or approve this requirement.
          </p>
        </div>
        <p className="flex items-center gap-2 text-xs font-semibold text-slate-600">
          {status === 'IN_PROGRESS' ? (
            <Radio className="h-4 w-4 animate-pulse text-amber-500 motion-reduce:animate-none" />
          ) : status === 'COMPLETED' ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          ) : (
            <CircleDashed className="h-4 w-4 text-slate-400" />
          )}
          {status === 'IN_PROGRESS'
            ? 'Interview in progress'
            : status === 'COMPLETED'
              ? 'Official HR review received'
              : 'Waiting for the interview'}
        </p>
      </div>
    </section>
  );
}

type BookingFormProps = {
  snapshot: InterviewPortalSnapshot;
  date: string;
  time: string;
  interviewerId: string;
  isSubmitting: boolean;
  error: string | null;
  isReschedule: boolean;
  onDateChange: (value: string) => void;
  onTimeChange: (value: string) => void;
  onInterviewerChange: (value: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onCancel?: () => void;
};

function BookingForm({
  snapshot,
  date,
  time,
  interviewerId,
  isSubmitting,
  error,
  isReschedule,
  onDateChange,
  onTimeChange,
  onInterviewerChange,
  onSubmit,
  onCancel,
}: BookingFormProps) {
  const selectedIsAvailable = snapshot.hrMembers.some(
    (member) => member.id === interviewerId
  );
  const effectiveInterviewerId = selectedIsAvailable
    ? interviewerId
    : snapshot.hrMembers[0]?.id || '';
  const hasHrMembers = snapshot.hrMembers.length > 0;

  return (
    <section className={`${cardClass} relative overflow-hidden p-6 sm:p-8`}>
      <div className="pointer-events-none absolute -left-24 -top-24 h-64 w-64 rounded-full bg-orange-500/15 blur-3xl" />
      <div className="relative">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#C2410C]">
              Eastern Time scheduling
            </p>
            <h2 className="mt-1 font-heading text-xl font-black text-slate-900">
              {isReschedule ? 'Choose a new appointment' : 'Book your HR interview'}
            </h2>
            <p className="mt-2 max-w-xl text-xs leading-5 text-slate-600">
              Every date and time below is interpreted in America/New_York and displayed as ET.
            </p>
          </div>
          <CalendarDays className="h-6 w-6 shrink-0 text-[#F97316]" aria-hidden="true" />
        </div>

        {!hasHrMembers ? (
          <div className="rounded-2xl border border-amber-300 bg-amber-50 p-5" role="status">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
              <div>
                <p className="text-sm font-black text-amber-900">
                  No HR appointment calendars are available
                </p>
                <p className="mt-1 text-xs leading-5 text-amber-800">
                  Nothing was fabricated as a fallback. Ask HR to assign an active specialist.
                </p>
                <Link
                  href="/rbt/help-desk"
                  className="mt-3 inline-flex cursor-pointer items-center gap-2 text-xs font-black text-[#C2410C] underline decoration-orange-500/40 underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-300"
                >
                  Open Help Desk
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              </div>
            </div>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-5" aria-describedby="booking-time-note">
            <div>
              <label
                htmlFor="interviewer"
                className="mb-2 block text-xs font-black text-slate-800"
              >
                HR specialist
              </label>
              <select
                id="interviewer"
                value={effectiveInterviewerId}
                onChange={(event) => onInterviewerChange(event.target.value)}
                disabled={isSubmitting}
                required
                className="w-full cursor-pointer rounded-2xl border border-[#DECFA9] bg-[#FFFDF8] px-4 py-3.5 text-sm font-bold text-slate-900 outline-none transition-all hover:border-[#F97316] focus:border-[#F97316] focus:ring-2 focus:ring-orange-500/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {snapshot.hrMembers.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name} · {member.role}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="interview-date"
                  className="mb-2 block text-xs font-black text-slate-800"
                >
                  Appointment date
                </label>
                <input
                  id="interview-date"
                  type="date"
                  value={date}
                  onChange={(event) => onDateChange(event.target.value)}
                  disabled={isSubmitting}
                  required
                  className="w-full rounded-2xl border border-[#DECFA9] bg-[#FFFDF8] px-4 py-3.5 text-sm font-bold text-slate-900 outline-none transition-all hover:border-[#F97316] focus:border-[#F97316] focus:ring-2 focus:ring-orange-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                />
              </div>
              <div>
                <label
                  htmlFor="interview-time"
                  className="mb-2 block text-xs font-black text-slate-800"
                >
                  Appointment time (ET)
                </label>
                <select
                  id="interview-time"
                  value={time}
                  onChange={(event) => onTimeChange(event.target.value)}
                  disabled={isSubmitting}
                  required
                  className="w-full cursor-pointer rounded-2xl border border-[#DECFA9] bg-[#FFFDF8] px-4 py-3.5 text-sm font-bold text-slate-900 outline-none transition-all hover:border-[#F97316] focus:border-[#F97316] focus:ring-2 focus:ring-orange-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {INTERVIEW_TIME_SLOTS_ET.map((slot) => (
                    <option key={slot} value={slot}>
                      {slot}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <p id="booking-time-note" className="flex items-center gap-2 text-[11px] text-slate-600 font-medium">
              <Clock3 className="h-3.5 w-3.5 text-[#F97316]" aria-hidden="true" />
              The meeting room opens five minutes before the persisted ET appointment.
            </p>

            {error && (
              <div
                role="alert"
                className="rounded-2xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-xs font-semibold text-rose-200"
              >
                {error}
              </div>
            )}

            <div className="flex flex-col-reverse gap-3 sm:flex-row">
              {onCancel && (
                <button
                  type="button"
                  onClick={onCancel}
                  disabled={isSubmitting}
                  className="inline-flex cursor-pointer items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-5 py-3.5 text-sm font-bold text-zinc-300 transition-all hover:border-white/20 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-300 disabled:cursor-not-allowed disabled:opacity-60 sm:w-1/3"
                >
                  Keep current appointment
                </button>
              )}
              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-orange-500 to-amber-400 px-5 py-3.5 text-sm font-black text-white shadow-xl shadow-orange-950/30 transition-all duration-300 hover:scale-[1.01] hover:shadow-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-300 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? (
                  <RefreshCw
                    className="h-4 w-4 animate-spin motion-reduce:animate-none"
                    aria-hidden="true"
                  />
                ) : (
                  <CalendarDays className="h-4 w-4" aria-hidden="true" />
                )}
                {isSubmitting
                  ? 'Saving ET appointment…'
                  : isReschedule
                    ? 'Confirm new appointment'
                    : 'Confirm interview appointment'}
              </button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}

export function InterviewExperience({
  initialResult,
}: {
  initialResult: InterviewPortalResult;
}) {
  const initialSnapshot = initialResult.success ? initialResult.data : null;
  const initialInterviewTime = normalizeInterviewTimeEt(
    initialSnapshot?.interview?.scheduledTime || INTERVIEW_TIME_SLOTS_ET[0]
  );

  const [result, setResult] = useState(initialResult);
  const [date, setDate] = useState(
    initialSnapshot?.interview?.scheduledDate || getDefaultInterviewDateEt()
  );
  const [time, setTime] = useState(
    INTERVIEW_TIME_SLOTS_ET.includes(
      initialInterviewTime as (typeof INTERVIEW_TIME_SLOTS_ET)[number]
    )
      ? initialInterviewTime
      : INTERVIEW_TIME_SLOTS_ET[0]
  );
  const [interviewerId, setInterviewerId] = useState(
    initialSnapshot?.interview?.interviewerUserId ||
      initialSnapshot?.hrMembers[0]?.id ||
      ''
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isRescheduling, setIsRescheduling] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());

  const snapshot = result.success ? result.data : null;
  const view = useMemo(
    () =>
      snapshot
        ? deriveInterviewView({
            stage: snapshot.candidate.stage,
            activationStatus: snapshot.candidate.activationStatus,
            interviewBooked: snapshot.interviewBooked,
            interviewPassed: snapshot.interviewPassed,
            interview: snapshot.interview,
          })
        : null,
    [snapshot]
  );

  const refresh = useCallback(
    async (replaceAccessState = false) => {
      setIsRefreshing(true);
      const next = await getInterviewPortalSnapshot();
      setIsRefreshing(false);
      setResult((current) =>
        next.success || replaceAccessState || !current.success ? next : current
      );
      setSyncError(next.success ? null : next.error);
      setNow(new Date());
    },
    [setResult]
  );

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNow(new Date());
      if (view === 'SCHEDULED' || view === 'REVIEWED') {
        void refresh(false);
      }
    }, 30_000);
    return () => window.clearInterval(interval);
  }, [refresh, view]);

  if (!result.success) {
    return (
      <SecureAccessState
        result={result}
        retrying={isRefreshing}
        onRetry={() => void refresh(true)}
      />
    );
  }

  if (!snapshot || !view) return null;

  const interview = snapshot.interview;
  const scheduledDate = interview?.scheduledDate || '';
  const scheduledTime = normalizeInterviewTimeEt(interview?.scheduledTime || '');
  const meetingWindowOpen = Boolean(
    scheduledDate &&
      scheduledTime &&
      isInterviewJoinWindowOpen(scheduledDate, scheduledTime, now)
  );
  const safeMeetingLink = isSafeInterviewMeetingUrl(interview?.meetingLink)
    ? interview?.meetingLink
    : null;
  const hrPresent = Boolean(interview?.hrJoinedAt);
  const effectiveInterviewerId = snapshot.hrMembers.some(
    (member) => member.id === interviewerId
  )
    ? interviewerId
    : snapshot.hrMembers[0]?.id || '';

  const submitBooking = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    setIsSubmitting(true);
    const next = await bookOwnInterview({
      interviewerId: effectiveInterviewerId,
      date,
      time,
    });
    setIsSubmitting(false);

    if (!next.success) {
      setFormError(next.error);
      toast.error(next.error);
      return;
    }

    setResult({ success: true, data: next.data });
    setIsRescheduling(false);
    setSyncError(null);
    setNow(new Date());
    toast.success(`Interview saved for ${formatInterviewDateEt(date)} at ${time}.`);
  };

  return (
    <main className="relative mx-auto max-w-6xl overflow-hidden rounded-[2.5rem] border border-[#E2D5B7] bg-[#F9F5EC] px-4 py-6 text-slate-900 shadow-[0_30px_120px_rgba(214,198,165,0.25)] sm:px-7 sm:py-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_4%,rgba(249,115,22,0.08),transparent_30%),radial-gradient(circle_at_90%_18%,rgba(56,189,248,0.08),transparent_28%)]" />
      <div className="relative space-y-7">
        <header className="flex flex-col gap-5 border-b border-[#E2D5B7] pb-7 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-3xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-orange-400/30 bg-orange-400/10 px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#C2410C]">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              Requirement 2 · Secure interview
            </div>
            <h1 className="font-heading text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">
              {snapshot.candidate.firstName}&apos;s HR interview
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600 font-medium">
              Schedule and join your official Rise &amp; Shine onboarding interview. Appointment
              times are pinned to Eastern Time and outcomes come only from persisted HR review.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isRefreshing && (
              <span
                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 font-mono text-[10px] font-bold text-zinc-400"
                role="status"
              >
                <RefreshCw
                  className="h-3 w-3 animate-spin motion-reduce:animate-none"
                  aria-hidden="true"
                />
                Syncing
              </span>
            )}
            <span
              className={`rounded-full border px-3 py-1.5 text-[11px] font-black uppercase tracking-wide ${viewTone(view)}`}
            >
              {viewLabel(view)}
            </span>
          </div>
        </header>

        <div aria-live="polite">
          {syncError && result.success && (
            <div className="flex items-start justify-between gap-3 rounded-2xl border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-xs text-amber-100">
              <span className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" aria-hidden="true" />
                Live status could not refresh. Showing the most recent secure snapshot.
              </span>
              <button
                type="button"
                onClick={() => void refresh(false)}
                className="cursor-pointer font-black text-orange-300 underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-300"
              >
                Retry
              </button>
            </div>
          )}
        </div>

        {view === 'BOOKING' && (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(280px,0.75fr)]">
            <BookingForm
              snapshot={snapshot}
              date={date}
              time={time}
              interviewerId={effectiveInterviewerId}
              isSubmitting={isSubmitting}
              error={formError}
              isReschedule={Boolean(
                interview &&
                  ['CANCELLED', 'NO_SHOW'].includes(interview.status.toUpperCase())
              )}
              onDateChange={setDate}
              onTimeChange={setTime}
              onInterviewerChange={setInterviewerId}
              onSubmit={submitBooking}
            />
            <div className="space-y-6">
              <InterviewLifecycle snapshot={snapshot} />
              <RecordingBoundary snapshot={snapshot} />
            </div>
          </div>
        )}

        {view === 'SCHEDULED' && interview && (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(280px,0.75fr)]">
            <div className="space-y-6">
              <section
                className={`${cardClass} relative overflow-hidden p-6 sm:p-8`}
                aria-labelledby="scheduled-interview-title"
              >
                <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-sky-500/10 blur-3xl" />
                <div className="relative space-y-6">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-sky-800">
                        Persisted appointment
                      </p>
                      <h2
                        id="scheduled-interview-title"
                        className="mt-1 font-heading text-2xl font-black text-slate-900"
                      >
                        {formatInterviewDateEt(scheduledDate)}
                      </h2>
                      <p className="mt-2 text-lg font-black text-[#C2410C]">
                        {scheduledTime} · Eastern Time
                      </p>
                    </div>
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-sky-300 bg-sky-50 text-sky-700">
                      <Video className="h-6 w-6" aria-hidden="true" />
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-[#E2D5B7] bg-[#F9F5EC] p-4">
                      <p className="font-mono text-[10px] font-bold uppercase tracking-wide text-slate-500">
                        HR specialist
                      </p>
                      <p className="mt-2 flex items-center gap-2 text-sm font-black text-slate-900">
                        <UserRound className="h-4 w-4 text-[#F97316]" aria-hidden="true" />
                        {interview.interviewerName || 'Assigned HR team'}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-[#E2D5B7] bg-[#F9F5EC] p-4">
                      <p className="font-mono text-[10px] font-bold uppercase tracking-wide text-slate-500">
                        Room status
                      </p>
                      <p className="mt-2 flex items-center gap-2 text-sm font-black text-slate-900">
                        <span
                          className={`h-2.5 w-2.5 rounded-full ${
                            hrPresent
                              ? 'bg-emerald-500 shadow-[0_0_14px_rgba(52,211,153,0.8)]'
                              : 'bg-amber-500 shadow-[0_0_14px_rgba(251,191,36,0.55)]'
                          }`}
                        />
                        {hrPresent ? 'HR specialist online' : 'Waiting for HR specialist'}
                      </p>
                    </div>
                  </div>

                  {meetingWindowOpen && hrPresent && safeMeetingLink ? (
                    <a
                      href={safeMeetingLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-sky-600 px-5 py-4 text-sm font-black text-white shadow-xl transition-all duration-300 hover:scale-[1.01] hover:bg-sky-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
                    >
                      <Video className="h-4 w-4" aria-hidden="true" />
                      Join secure video room
                      <ExternalLink className="h-4 w-4" aria-hidden="true" />
                    </a>
                  ) : (
                    <div
                      className="rounded-2xl border border-[#E2D5B7] bg-[#F9F5EC] p-4"
                      role="status"
                    >
                      <p className="flex items-center gap-2 text-sm font-black text-slate-800">
                        <LockKeyhole className="h-4 w-4 text-[#F97316]" aria-hidden="true" />
                        {!meetingWindowOpen
                          ? 'Room opens five minutes before the ET appointment'
                          : !hrPresent
                            ? 'Room is open; waiting for your HR specialist'
                            : 'Secure meeting link is unavailable'}
                      </p>
                      <p className="mt-1.5 text-xs leading-5 text-slate-600">
                        This status refreshes automatically. No developer override can unlock the
                        applicant room or mark the interview complete.
                      </p>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      setDate(interview.scheduledDate || getDefaultInterviewDateEt());
                      const normalized = normalizeInterviewTimeEt(
                        interview.scheduledTime || INTERVIEW_TIME_SLOTS_ET[0]
                      );
                      setTime(
                        INTERVIEW_TIME_SLOTS_ET.includes(
                          normalized as (typeof INTERVIEW_TIME_SLOTS_ET)[number]
                        )
                          ? normalized
                          : INTERVIEW_TIME_SLOTS_ET[0]
                      );
                      setInterviewerId(
                        interview.interviewerUserId || snapshot.hrMembers[0]?.id || ''
                      );
                      setFormError(null);
                      setIsRescheduling(true);
                    }}
                    disabled={isSubmitting}
                    className="w-full cursor-pointer rounded-2xl border border-violet-300 bg-violet-50 px-5 py-3.5 text-sm font-black text-violet-900 transition-all duration-300 hover:bg-violet-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Reschedule persisted appointment
                  </button>
                </div>
              </section>

              {isRescheduling && (
                <BookingForm
                  snapshot={snapshot}
                  date={date}
                  time={time}
                  interviewerId={effectiveInterviewerId}
                  isSubmitting={isSubmitting}
                  error={formError}
                  isReschedule
                  onDateChange={setDate}
                  onTimeChange={setTime}
                  onInterviewerChange={setInterviewerId}
                  onSubmit={submitBooking}
                  onCancel={() => {
                    setIsRescheduling(false);
                    setFormError(null);
                  }}
                />
              )}
            </div>
            <div className="space-y-6">
              <InterviewLifecycle snapshot={snapshot} />
              <RecordingBoundary snapshot={snapshot} />
            </div>
          </div>
        )}

        {view === 'LOCKED' && (
          <section className={`${cardClass} relative overflow-hidden p-7 sm:p-10`}>
            <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-amber-500/10 blur-3xl" />
            <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-amber-300 bg-amber-50 text-amber-700">
                <LockKeyhole className="h-7 w-7" aria-hidden="true" />
              </div>
              <div className="flex-1">
                <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#C2410C]">
                  Stage gate active
                </p>
                <h2 className="mt-1 font-heading text-2xl font-black text-slate-900">
                  Interview scheduling is not open yet
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                  HR must activate your applicant workspace before an appointment can be created.
                  This page will not invent an interview or move your ATS stage locally.
                </p>
              </div>
              <Link
                href="/rbt"
                className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-[#E2D5B7] bg-[#F9F5EC] px-5 py-3 text-sm font-black text-slate-800 transition-all hover:border-orange-400/30 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-300"
              >
                Back to My Tasks
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          </section>
        )}

        {view === 'CLOSED' && (
          <section className={`${cardClass} relative overflow-hidden p-7 sm:p-10`}>
            <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-rose-500/10 blur-3xl" />
            <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-rose-300 bg-rose-50 text-rose-700">
                <AlertTriangle className="h-7 w-7" aria-hidden="true" />
              </div>
              <div className="flex-1">
                <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-rose-700">
                  Application status
                </p>
                <h2 className="mt-1 font-heading text-2xl font-black text-slate-900">
                  Interview scheduling is closed
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                  This application is no longer in an active interview stage. Contact HR if you
                  believe the status needs review.
                </p>
              </div>
              <Link
                href="/rbt/help-desk"
                className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-rose-300 bg-rose-50 px-5 py-3 text-sm font-black text-rose-800 transition-all hover:bg-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300"
              >
                <LifeBuoy className="h-4 w-4" aria-hidden="true" />
                Contact HR
              </Link>
            </div>
          </section>
        )}

        {(view === 'REVIEWED' || view === 'APPROVED') && (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(280px,0.75fr)]">
            <section
              className={`${cardClass} relative overflow-hidden p-7 sm:p-10 ${
                view === 'APPROVED' ? 'border-emerald-300' : 'border-violet-300'
              }`}
            >
              <div
                className={`pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full blur-3xl ${
                  view === 'APPROVED' ? 'bg-emerald-500/10' : 'bg-violet-500/10'
                }`}
              />
              <div className="relative space-y-6">
                <div
                  className={`flex h-16 w-16 items-center justify-center rounded-3xl border ${
                    view === 'APPROVED'
                      ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                      : 'border-violet-300 bg-violet-50 text-violet-700'
                  }`}
                >
                  {view === 'APPROVED' ? (
                    <CheckCircle2 className="h-8 w-8" aria-hidden="true" />
                  ) : (
                    <ShieldCheck className="h-8 w-8" aria-hidden="true" />
                  )}
                </div>
                <div>
                  <p
                    className={`font-mono text-[10px] font-bold uppercase tracking-[0.18em] ${
                      view === 'APPROVED' ? 'text-emerald-800' : 'text-violet-800'
                    }`}
                  >
                    {view === 'APPROVED'
                      ? 'Durable requirement complete'
                      : 'Official interview outcome received'}
                  </p>
                  <h2 className="mt-2 font-heading text-2xl font-black text-slate-900 sm:text-3xl">
                    {view === 'APPROVED'
                      ? 'Your HR interview is approved'
                      : 'HR has submitted the interview review'}
                  </h2>
                  <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
                    {view === 'APPROVED'
                      ? 'The persisted interviewPassed flag is confirmed. Continue with any remaining onboarding requirements.'
                      : 'A completed interview record is not shown as approval unless HR also sets the persisted interviewPassed requirement flag.'}
                  </p>
                </div>
                <Link
                  href="/rbt"
                  className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-2xl bg-orange-500 px-5 py-3.5 text-sm font-black text-white shadow-xl transition-all duration-300 hover:scale-[1.01] hover:bg-orange-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-300"
                >
                  Return to My Tasks
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </div>
            </section>
            <div className="space-y-6">
              <InterviewLifecycle snapshot={snapshot} />
              <RecordingBoundary snapshot={snapshot} />
            </div>
          </div>
        )}

        {(view === 'APPROVED' || view === 'SCHEDULED' || view === 'REVIEWED') && (
          <OnboardingNextStepsPrompt currentTab="INTERVIEW" className="mt-2" />
        )}
      </div>
    </main>
  );
}
