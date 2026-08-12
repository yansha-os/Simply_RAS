'use client';

import React, { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import {
  Award,
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  HelpCircle,
  Mail,
  Upload,
  BookOpen,
  LogIn,
  Sparkles,
  AlertCircle,
  FileText,
  Loader2,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  getFortyHourCoachState,
  markFortyHourCoachStep,
  uploadFortyHourCertificate,
  type FortyHourCoachState,
} from '@/app/actions/fortyHourCourseActions';
import { ensureActiveApplicantId } from '@/lib/syncAtsProgress';
import {
  classifyApplicantAccessError,
  completedPhaseCount,
  phaseComplete,
  phaseFromStep,
  validateDocumentFile,
  type PhaseId,
} from '@/components/rbt/documentUx';

const APF_REGISTER =
  'https://courses.autismpartnershipfoundation.org/offers/it285gs6/checkout';
const APF_LOGIN = 'https://courses.autismpartnershipfoundation.org/login';
const APF_FAQ = 'https://autismpartnershipfoundation.org/rbtfaq/';

export default function RbtDocumentsPage() {
  const [coach, setCoach] = useState<FortyHourCoachState>({
    step: 'NOT_STARTED',
    registeredAt: null,
    inProgressAt: null,
    certificateReadyAt: null,
    uploadedAt: null,
    certFileName: null,
    certStoragePath: null,
  });
  const [openPhase, setOpenPhase] = useState<PhaseId | null>(1);
  const [faqOpen, setFaqOpen] = useState<string | null>('cert');
  const [dragOver, setDragOver] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [loadState, setLoadState] = useState<'LOADING' | 'READY' | 'BLOCKED'>('LOADING');
  const [accessError, setAccessError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadWarning, setUploadWarning] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        await ensureActiveApplicantId(true);
        const res = await getFortyHourCoachState();
        if (!active) return;
        if (res.success && res.data) {
          setCoach(res.data);
          setOpenPhase(phaseFromStep(res.data.step));
          setLoadState('READY');
          return;
        }
        setAccessError(res.error || 'Failed to load course progress.');
        setLoadState('BLOCKED');
      } catch {
        if (!active) return;
        setAccessError('The document service could not be reached. Please try again.');
        setLoadState('BLOCKED');
      }
    })();

    return () => {
      active = false;
    };
  }, [loadAttempt]);

  const doneCount = completedPhaseCount(coach.step);
  const allDone = coach.step === 'UPLOADED';
  const hasStoredCertificate = Boolean(coach.certStoragePath);

  const markStep = (next: 'REGISTERED' | 'IN_PROGRESS' | 'CERT_READY') => {
    startTransition(async () => {
      try {
        const res = await markFortyHourCoachStep(next);
        if (!res.success || !res.data) {
          const message = res.error || 'Could not save progress';
          const access = classifyApplicantAccessError(message);
          if (access.reason !== 'UNKNOWN') {
            setAccessError(message);
            setLoadState('BLOCKED');
          }
          toast.error(message);
          return;
        }
        setCoach(res.data);
        setOpenPhase(phaseFromStep(res.data.step));
        toast.success(
          next === 'REGISTERED'
            ? 'Account marked — next: take the free course'
            : next === 'IN_PROGRESS'
              ? 'Keep going — come back when you finish'
              : 'Great — upload your certificate PDF below'
        );
      } catch {
        toast.error('Could not save progress. Check your connection and try again.');
      }
    });
  };

  const handleFile = (file: File | undefined) => {
    if (!file || isPending) return;
    const validationError = validateDocumentFile(file, { label: 'Certificate' });
    if (validationError) {
      setUploadError(validationError.message);
      setUploadWarning(null);
      toast.error(validationError.message);
      return;
    }

    setUploadError(null);
    setUploadWarning(null);
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.append('file', file);
        const res = await uploadFortyHourCertificate(fd);
        if (!res.success || !res.data) {
          const message = res.error || 'Upload failed';
          const access = classifyApplicantAccessError(message);
          if (access.reason !== 'UNKNOWN') {
            setAccessError(message);
            setLoadState('BLOCKED');
          } else {
            setUploadError(message);
          }
          toast.error(message);
          return;
        }
        setCoach(res.data);
        setOpenPhase(4);
        setUploadWarning(res.warning || null);
        window.dispatchEvent(new Event('rbt_progress_synced'));
        toast.success(`Uploaded ${res.data.certFileName || file.name}`);
        if (res.warning) toast.message(res.warning);
      } catch {
        const message = 'Upload failed. Check your connection and try again.';
        setUploadError(message);
        toast.error(message);
      }
    });
  };

  const phases = useMemo(
    () =>
      [
        {
          id: 1 as const,
          title: 'Create your free APF account',
          subtitle: 'Takes about 2 minutes',
          tip: 'Use your legal name so it matches the certificate HR will review.',
        },
        {
          id: 2 as const,
          title: 'Complete the free 40-hour course',
          subtitle: 'At your own pace — pause anytime',
          tip: 'The course is English-only and BACB Task List 2nd Edition approved.',
        },
        {
          id: 3 as const,
          title: 'Get your certificate PDF',
          subtitle: 'APF emails it when you finish',
          tip: 'Check spam/junk. Save the PDF to your phone or computer before uploading.',
        },
        {
          id: 4 as const,
          title: 'Upload certificate here',
          subtitle: 'Required before Head HR can extend your wage offer',
          tip: 'PDF preferred. JPEG/PNG photos of the certificate are OK too.',
        },
      ] as const,
    []
  );

  if (loadState === 'LOADING') {
    return (
      <div
        className="mx-auto max-w-3xl pb-16"
        aria-busy="true"
        aria-label="Loading document status"
      >
        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-zinc-950 p-8 text-white shadow-2xl">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(249,115,22,0.18),transparent_42%)]" />
          <div className="relative flex min-h-64 flex-col items-center justify-center gap-4 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-orange-400/20 bg-orange-500/10 shadow-[0_0_30px_rgba(249,115,22,0.12)]">
              <Loader2 className="h-7 w-7 animate-spin text-orange-400" aria-hidden="true" />
            </div>
            <div>
              <h1 className="font-heading text-xl font-black">Opening your document vault</h1>
              <p className="mt-1 text-sm font-medium text-zinc-400">
                Confirming this device and loading your certificate status…
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (loadState === 'BLOCKED') {
    const access = classifyApplicantAccessError(
      accessError || 'Failed to load course progress.'
    );
    return (
      <div className="mx-auto max-w-3xl pb-16">
        <section
          role="alert"
          aria-live="assertive"
          className="relative overflow-hidden rounded-3xl border border-rose-400/20 bg-zinc-950 p-6 text-white shadow-2xl sm:p-8"
        >
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(244,63,94,0.16),transparent_46%),radial-gradient(circle_at_bottom_right,rgba(249,115,22,0.12),transparent_42%)]" />
          <div className="relative space-y-6">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-rose-400/20 bg-rose-500/10 shadow-[0_0_28px_rgba(244,63,94,0.12)]">
                <ShieldAlert className="h-6 w-6 text-rose-300" aria-hidden="true" />
              </div>
              <div>
                <p className="font-mono text-[10px] font-black uppercase tracking-[0.2em] text-rose-300">
                  Secure document access
                </p>
                <h1 className="mt-1 font-heading text-2xl font-black">{access.title}</h1>
                <p className="mt-2 max-w-xl text-sm font-medium leading-relaxed text-zinc-300">
                  {access.description}
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-3 border-t border-white/10 pt-5 sm:flex-row">
              {access.retryable && (
                <button
                  type="button"
                  onClick={() => {
                    setLoadState('LOADING');
                    setAccessError(null);
                    setLoadAttempt((attempt) => attempt + 1);
                  }}
                  className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-orange-400/30 bg-orange-500/15 px-4 py-3 text-xs font-black text-orange-200 transition-all hover:border-orange-300/60 hover:bg-orange-500/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
                >
                  <RefreshCw className="h-4 w-4" aria-hidden="true" />
                  Try again
                </button>
              )}
              <a
                href="mailto:info@riseandshine.nyc?subject=Applicant%20document%20access"
                className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-xs font-black text-zinc-100 transition-all hover:border-orange-400/40 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
              >
                <Mail className="h-4 w-4 text-orange-300" aria-hidden="true" />
                Contact HR
              </a>
            </div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-16 text-slate-900">
      {/* Header */}
      <div className="space-y-3">
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-2xl bg-orange-100 border border-orange-200 text-[#F97316] flex items-center justify-center shrink-0 shadow-sm">
            <Award className="w-7 h-7" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl sm:text-3xl font-black text-slate-900 font-heading tracking-tight">
                Free 40-Hour BACB Course
              </h1>
              <span className="bg-rose-100 text-rose-800 border border-rose-300 text-[10px] font-black px-2 py-0.5 rounded-full uppercase">
                Required
              </span>
              <span className="bg-emerald-100 text-emerald-800 border border-emerald-300 text-[10px] font-black px-2 py-0.5 rounded-full uppercase">
                $0 via APF
              </span>
            </div>
            <p className="text-sm text-slate-600 font-medium mt-1">
              Rise &amp; Shine partners with{' '}
              <strong>Autism Partnership Foundation (APF)</strong> for a free BACB-approved
              course. We can&apos;t host the videos here — this page walks you through every step
              until your certificate is on file.
            </p>
          </div>
        </div>

        {/* Progress strip */}
        <div className="bg-white border-2 border-orange-200 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3 mb-2">
            <p className="text-xs font-black text-slate-800 uppercase tracking-wide">
              Your progress
            </p>
            <p className="text-xs font-mono font-bold text-[#F97316]">
              {allDone ? 'Complete' : `${doneCount} of 4 steps`}
            </p>
          </div>
          <div
            role="progressbar"
            aria-label="40-hour course completion"
            aria-valuemin={0}
            aria-valuemax={4}
            aria-valuenow={doneCount}
            aria-valuetext={allDone ? 'Complete' : `${doneCount} of 4 steps complete`}
            className="h-2.5 rounded-full bg-slate-100 overflow-hidden border border-slate-200"
          >
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                allDone ? 'bg-emerald-500' : 'bg-[#F97316]'
              }`}
              style={{ width: `${(doneCount / 4) * 100}%` }}
            />
          </div>
          {allDone && (
            <p
              className={`mt-2 text-xs font-bold flex items-center gap-1.5 ${
                hasStoredCertificate ? 'text-emerald-700' : 'text-amber-800'
              }`}
            >
              {hasStoredCertificate ? (
                <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
              ) : (
                <AlertCircle className="w-3.5 h-3.5" aria-hidden="true" />
              )}
              {hasStoredCertificate
                ? 'Certificate on file — REQ 5 complete'
                : 'Completion recorded — upload a replacement file'}
            </p>
          )}
        </div>
      </div>

      {/* Phases */}
      <div className="space-y-3">
        {phases.map((phase) => {
          const complete = phaseComplete(phase.id, coach.step);
          const isOpen = openPhase === phase.id;
          const isCurrent = !allDone && phaseFromStep(coach.step) === phase.id;
          const status = complete ? 'Complete' : isCurrent ? 'In progress' : 'Upcoming';

          return (
            <div
              key={phase.id}
              className={`rounded-2xl border-2 overflow-hidden transition-all shadow-sm ${
                complete
                  ? 'border-emerald-300 bg-emerald-50/40'
                  : isCurrent
                    ? 'border-[#F97316] bg-white shadow-md'
                    : 'border-slate-200 bg-white'
              }`}
            >
              <button
                id={`course-phase-${phase.id}-trigger`}
                type="button"
                aria-expanded={isOpen}
                aria-controls={`course-phase-${phase.id}-panel`}
                aria-current={isCurrent ? 'step' : undefined}
                onClick={() => setOpenPhase(isOpen ? null : phase.id)}
                className="w-full flex items-center gap-3 p-4 text-left cursor-pointer hover:bg-orange-50/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#F97316]"
              >
                <span
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black shrink-0 border ${
                    complete
                      ? 'bg-emerald-500 text-white border-emerald-600'
                      : isCurrent
                        ? 'bg-[#F97316] text-white border-orange-600'
                        : 'bg-slate-100 text-slate-500 border-slate-200'
                  }`}
                >
                  {complete ? (
                    <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                  ) : (
                    phase.id
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-extrabold text-slate-900">{phase.title}</p>
                  <p className="text-[11px] text-slate-500 font-medium">{phase.subtitle}</p>
                </div>
                <span
                  className={`hidden rounded-full border px-2 py-1 font-mono text-[9px] font-black uppercase tracking-wide sm:inline-flex ${
                    complete
                      ? 'border-emerald-300 bg-emerald-100 text-emerald-800'
                      : isCurrent
                        ? 'border-orange-300 bg-orange-100 text-orange-800'
                        : 'border-slate-200 bg-slate-100 text-slate-500'
                  }`}
                >
                  {status}
                </span>
                <ChevronDown
                  className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                  aria-hidden="true"
                />
              </button>

              {isOpen && (
                <div
                  id={`course-phase-${phase.id}-panel`}
                  role="region"
                  aria-labelledby={`course-phase-${phase.id}-trigger`}
                  className="px-4 pb-5 pt-0 space-y-3 border-t border-slate-100"
                >
                  <p className="text-xs text-slate-600 font-medium pt-3 flex items-start gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-[#F97316] shrink-0 mt-0.5" />
                    {phase.tip}
                  </p>

                  {phase.id === 1 && (
                    <div className="space-y-2">
                      <a
                        href={APF_REGISTER}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full inline-flex items-center justify-center gap-2 bg-[#F97316] hover:bg-orange-600 text-white font-extrabold text-xs px-4 py-3 rounded-xl shadow-md cursor-pointer transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2"
                      >
                        Open APF free registration
                        <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                        <span className="sr-only">(opens in a new tab)</span>
                      </a>
                      <a
                        href={APF_LOGIN}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full inline-flex items-center justify-center gap-2 bg-white border-2 border-slate-200 hover:border-[#F97316] text-slate-800 font-bold text-xs px-4 py-2.5 rounded-xl cursor-pointer transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2"
                      >
                        <LogIn className="w-3.5 h-3.5" aria-hidden="true" />
                        Already registered? Log in to APF
                        <span className="sr-only">(opens in a new tab)</span>
                      </a>
                      {!complete && (
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => markStep('REGISTERED')}
                          className="w-full text-xs font-black text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 px-4 py-2.5 rounded-xl cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          ✓ I created my APF account
                        </button>
                      )}
                    </div>
                  )}

                  {phase.id === 2 && (
                    <div className="space-y-2">
                      <ul className="text-xs text-slate-700 font-medium space-y-1.5 bg-[#F0F7FF] border border-[#BFDBFE] rounded-xl p-3">
                        <li className="flex gap-2">
                          <BookOpen className="w-3.5 h-3.5 text-[#F97316] shrink-0 mt-0.5" />
                          Watch modules in the APF e-learning portal (log in each time you return).
                        </li>
                        <li className="flex gap-2">
                          <CheckCircle2 className="w-3.5 h-3.5 text-[#F97316] shrink-0 mt-0.5" />
                          Pass the module quizzes as you go — progress saves on APF&apos;s site.
                        </li>
                        <li className="flex gap-2">
                          <AlertCircle className="w-3.5 h-3.5 text-[#F97316] shrink-0 mt-0.5" />
                          You can finish over days/weeks — bookmark this Rise &amp; Shine page.
                        </li>
                      </ul>
                      <a
                        href={APF_LOGIN}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full inline-flex items-center justify-center gap-2 bg-[#F97316] hover:bg-orange-600 text-white font-extrabold text-xs px-4 py-3 rounded-xl shadow-md cursor-pointer transition-all"
                      >
                        Continue course on APF
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                      {(coach.step === 'NOT_STARTED' || coach.step === 'REGISTERED') && (
                        <button
                          type="button"
                          disabled={isPending || !phaseComplete(1, coach.step)}
                          onClick={() => markStep('IN_PROGRESS')}
                          className="w-full text-xs font-black text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 px-4 py-2.5 rounded-xl cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          ✓ I&apos;m working on the course
                        </button>
                      )}
                      {(coach.step === 'NOT_STARTED' ||
                        coach.step === 'REGISTERED' ||
                        coach.step === 'IN_PROGRESS') && (
                        <button
                          type="button"
                          disabled={isPending || !phaseComplete(1, coach.step)}
                          onClick={() => markStep('CERT_READY')}
                          className="w-full text-xs font-black text-[#F97316] bg-orange-50 border border-orange-200 hover:bg-orange-100 px-4 py-2.5 rounded-xl cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          I finished — help me find my certificate →
                        </button>
                      )}
                    </div>
                  )}

                  {phase.id === 3 && (
                    <div className="space-y-2">
                      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-2 text-xs text-slate-800 font-medium">
                        <p className="flex gap-2 font-bold text-amber-900">
                          <Mail className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                          APF emails your digital certificate when you finish
                        </p>
                        <ol className="list-decimal pl-4 space-y-1 text-slate-700">
                          <li>Open the email from Autism Partnership Foundation.</li>
                          <li>If it&apos;s missing, check Spam / Promotions.</li>
                          <li>Download or save the certificate PDF (or screenshot).</li>
                          <li>Come back here for Step 4 to upload it.</li>
                        </ol>
                      </div>
                      <a
                        href={APF_FAQ}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full inline-flex items-center justify-center gap-2 bg-white border-2 border-slate-200 hover:border-[#F97316] text-slate-800 font-bold text-xs px-4 py-2.5 rounded-xl cursor-pointer transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2"
                      >
                        <HelpCircle className="w-3.5 h-3.5" aria-hidden="true" />
                        APF FAQ (certificate &amp; login help)
                        <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                        <span className="sr-only">(opens in a new tab)</span>
                      </a>
                      {!phaseComplete(3, coach.step) ? (
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => markStep('CERT_READY')}
                          className="w-full text-xs font-black text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 px-4 py-2.5 rounded-xl cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          ✓ I have my certificate PDF ready
                        </button>
                      ) : (
                        !allDone && (
                          <button
                            type="button"
                            onClick={() => setOpenPhase(4)}
                            className="w-full text-xs font-black text-[#F97316] bg-orange-50 border border-orange-200 hover:bg-orange-100 px-4 py-2.5 rounded-xl cursor-pointer"
                          >
                            Continue to upload →
                          </button>
                        )
                      )}
                    </div>
                  )}

                  {phase.id === 4 && (
                    <div className="space-y-3">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="application/pdf,image/jpeg,image/png,image/webp,.pdf,.jpg,.jpeg,.png,.webp"
                        aria-label="Choose a 40-hour course certificate"
                        className="hidden"
                        onChange={(e) => {
                          handleFile(e.target.files?.[0]);
                          e.target.value = '';
                        }}
                      />

                      {uploadError && (
                        <div
                          role="alert"
                          className="flex items-start gap-2 rounded-xl border border-rose-300 bg-rose-50 px-3 py-2.5 text-xs font-bold text-rose-900"
                        >
                          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                          <span>{uploadError}</span>
                        </div>
                      )}
                      {uploadWarning && (
                        <div
                          role="status"
                          className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs font-bold text-amber-950"
                        >
                          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                          <span>{uploadWarning}</span>
                        </div>
                      )}

                      {allDone ? (
                        <div
                          className={`rounded-xl border-2 p-4 flex items-start gap-3 ${
                            hasStoredCertificate
                              ? 'border-emerald-300 bg-emerald-50'
                              : 'border-amber-300 bg-amber-50'
                          }`}
                        >
                          {hasStoredCertificate ? (
                            <CheckCircle2
                              className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5"
                              aria-hidden="true"
                            />
                          ) : (
                            <AlertCircle
                              className="w-5 h-5 text-amber-700 shrink-0 mt-0.5"
                              aria-hidden="true"
                            />
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p
                                className={`text-sm font-extrabold ${
                                  hasStoredCertificate ? 'text-emerald-900' : 'text-amber-950'
                                }`}
                              >
                                {hasStoredCertificate
                                  ? 'Certificate on file'
                                  : 'Completion recorded — file copy unavailable'}
                              </p>
                              <span
                                className={`rounded-full border px-2 py-0.5 font-mono text-[9px] font-black uppercase tracking-wide ${
                                  hasStoredCertificate
                                    ? 'border-emerald-300 bg-emerald-100 text-emerald-800'
                                    : 'border-amber-300 bg-amber-100 text-amber-900'
                                }`}
                              >
                                {hasStoredCertificate ? 'Uploaded' : 'Needs replacement'}
                              </span>
                            </div>
                            <p
                              className={`text-xs font-medium mt-1 font-mono break-all ${
                                hasStoredCertificate ? 'text-emerald-800' : 'text-amber-900'
                              }`}
                            >
                              {coach.certFileName || 'Certificate completion saved'}
                            </p>
                            <p
                              className={`mt-1 text-[11px] font-semibold ${
                                hasStoredCertificate ? 'text-emerald-700' : 'text-amber-800'
                              }`}
                            >
                              {hasStoredCertificate
                                ? 'Secure upload received. HR review is still pending.'
                                : 'Upload the original again so HR has a downloadable copy.'}
                            </p>
                            <button
                              type="button"
                              disabled={isPending}
                              onClick={() => fileInputRef.current?.click()}
                              className={`mt-3 inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-2 text-[11px] font-black transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                                hasStoredCertificate
                                  ? 'border-emerald-300 bg-white text-emerald-800 hover:bg-emerald-100'
                                  : 'border-amber-400 bg-amber-950 text-white hover:bg-amber-900'
                              }`}
                            >
                              <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                              {isPending ? 'Uploading…' : 'Upload replacement'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div
                          role="button"
                          tabIndex={isPending ? -1 : 0}
                          aria-disabled={isPending}
                          aria-describedby="certificate-upload-help"
                          onClick={() => {
                            if (!isPending) fileInputRef.current?.click();
                          }}
                          onKeyDown={(e) => {
                            if (!isPending && (e.key === 'Enter' || e.key === ' ')) {
                              e.preventDefault();
                              fileInputRef.current?.click();
                            }
                          }}
                          onDragOver={(e) => {
                            e.preventDefault();
                            if (!isPending) setDragOver(true);
                          }}
                          onDragLeave={() => setDragOver(false)}
                          onDrop={(e) => {
                            e.preventDefault();
                            setDragOver(false);
                            if (!isPending) handleFile(e.dataTransfer.files?.[0]);
                          }}
                          className={`rounded-2xl border-2 border-dashed px-4 py-10 text-center transition-all focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-300/50 ${
                            isPending
                              ? 'cursor-not-allowed border-slate-300 bg-slate-100 opacity-75'
                              : dragOver
                              ? 'border-[#F97316] bg-orange-50 scale-[1.01]'
                              : 'cursor-pointer border-orange-300 bg-orange-50/50 hover:border-[#F97316] hover:bg-orange-50'
                          }`}
                        >
                          {isPending ? (
                            <Loader2
                              className="w-8 h-8 text-[#F97316] mx-auto mb-2 animate-spin"
                              aria-hidden="true"
                            />
                          ) : (
                            <Upload
                              className="w-8 h-8 text-[#F97316] mx-auto mb-2"
                              aria-hidden="true"
                            />
                          )}
                          <p className="text-sm font-extrabold text-slate-900">
                            {isPending ? 'Uploading…' : 'Drop certificate here or tap to browse'}
                          </p>
                          <p
                            id="certificate-upload-help"
                            className="text-[11px] text-slate-500 font-medium mt-1"
                          >
                            PDF, JPEG, PNG, or WebP · max 10MB
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* FAQ */}
      <div className="bg-white border-2 border-slate-200 rounded-2xl p-4 space-y-2 shadow-sm">
        <h2 className="text-xs font-black text-slate-900 uppercase tracking-wide flex items-center gap-2 mb-2">
          <HelpCircle className="w-3.5 h-3.5 text-[#F97316]" />
          Common questions
        </h2>

        {[
          {
            id: 'cert',
            q: 'Where is my certificate?',
            a: 'APF emails a digital certificate when you finish. Check inbox and spam. Open the email, download the PDF, then upload it in Step 4. Physical certificates are not mailed.',
          },
          {
            id: 'login',
            q: 'I already registered — how do I get back in?',
            a: 'Use the APF course login link in Step 1 or 2. Your progress is saved on APF’s site, not inside Rise & Shine.',
          },
          {
            id: 'time',
            q: 'How long does this take?',
            a: 'About 40 hours of training content. Most people spread it over several days or weeks. You can pause anytime and return via the APF login.',
          },
          {
            id: 'why',
            q: 'Why can’t I take the course inside this app?',
            a: 'The free BACB-approved course is hosted by Autism Partnership Foundation. We send you there for training, then you upload the certificate here so HR can clear you for hire.',
          },
        ].map((item) => (
          <div key={item.id} className="border border-slate-100 rounded-xl overflow-hidden">
            <button
              id={`faq-${item.id}-trigger`}
              type="button"
              aria-expanded={faqOpen === item.id}
              aria-controls={`faq-${item.id}-panel`}
              onClick={() => setFaqOpen(faqOpen === item.id ? null : item.id)}
              className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left text-xs font-bold text-slate-800 hover:bg-slate-50 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-orange-500"
            >
              {item.q}
              <ChevronDown
                className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform ${
                  faqOpen === item.id ? 'rotate-180' : ''
                }`}
                aria-hidden="true"
              />
            </button>
            {faqOpen === item.id && (
              <p
                id={`faq-${item.id}-panel`}
                role="region"
                aria-labelledby={`faq-${item.id}-trigger`}
                className="px-3 pb-3 text-[11px] text-slate-600 font-medium leading-relaxed"
              >
                {item.a}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Help desk */}
      <div className="bg-[#F0F7FF] border-2 border-[#BFDBFE] rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-2">
          <FileText className="w-4 h-4 text-[#F97316] shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-extrabold text-slate-900">Stuck on APF or the upload?</p>
            <p className="text-[11px] text-slate-600 font-medium">
              Message HR via Help Desk — pick the 40-Hour Certificate category.
            </p>
          </div>
        </div>
        <Link
          href="/rbt/help-desk"
          className="shrink-0 inline-flex items-center justify-center gap-1.5 bg-white border border-[#BFDBFE] hover:border-[#F97316] text-slate-800 font-bold text-xs px-4 py-2.5 rounded-xl cursor-pointer transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
        >
          Open Help Desk
        </Link>
      </div>
    </div>
  );
}
