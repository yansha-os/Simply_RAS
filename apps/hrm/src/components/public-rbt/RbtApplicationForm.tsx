'use client';

import React, { useState, useEffect, useRef } from 'react';
import { submitRbtApplication } from '@/app/actions/publicRbt';
import { attachApplicantDocuments } from '@/app/actions/candidateDocumentActions';
import { toast } from 'sonner';
import {
  User,
  ClipboardCheck,
  Calendar,
  Shield,
  FileText,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Upload,
  Check,
  RotateCcw,
  AlertCircle,
  Eye,
  Trash2,
  XCircle,
} from 'lucide-react';
import {
  classifyApplicantAccessError,
  validateDocumentFile,
} from '@/components/rbt/documentUx';
import { resolvePrivateApplicantLocation } from './applicantAddressPrivacy';

const DRAFT_KEY = 'rbt_app_draft_v2';

const NYC_BOROUGHS = [
  'Manhattan',
  'Brooklyn',
  'Queens',
  'Bronx',
  'Staten Island',
  'Long Island',
  'Westchester',
  'New Jersey',
] as const;

export default function RbtApplicationForm() {
  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [documentSubmissionIssue, setDocumentSubmissionIssue] = useState<string | null>(null);
  const [landingAccessError, setLandingAccessError] = useState<string | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    // Step 1: Personal Info
    firstName: '',
    lastName: '',
    email: '',
    phoneNumber: '',
    searchAddress: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    state: '',
    zipCode: '',
    gender: '',

    // Step 2: RBT Readiness
    courseCompleted: '',
    yearsExperience: '',
    languages: [] as string[],
    transportation: '',

    // Step 3: Availability
    weekdays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
    weekends: ['Saturday'],
    weeklyHours: '15-25 hours/week',
    boroughs: [] as string[],
    availableToStart: '',

    // Step 4: Compliance & Eligibility
    workAuth: '',
    backgroundCheck: '',
    isAdultConfirmed: false,
    cprStatus: '',
    additionalNotes: '',

    // Step 5: Resume & Documents
    resumeFileName: '',
    idFileName: '',
    rbtCertFileName: '',
  });
  const privateApplicantLocation = resolvePrivateApplicantLocation(formData.zipCode);

  // Keep File blobs in memory for Storage upload (no localStorage data URLs)
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [govtIdFile, setGovtIdFile] = useState<File | null>(null);
  const [fortyHourCertFile, setFortyHourCertFile] = useState<File | null>(null);
  const [previewUrls, setPreviewUrls] = useState<{
    resume?: string;
    govtId?: string;
    fortyHourCert?: string;
  }>({});
  const previewUrlsRef = useRef(previewUrls);
  const previewDialogRef = useRef<HTMLDivElement>(null);
  const previewCloseButtonRef = useRef<HTMLButtonElement>(null);
  // Applicant Document Preview Modal State
  const [previewModal, setPreviewModal] = useState<{
    name: string;
    url: string;
    mimeType: string;
  } | null>(null);

  // LOAD DRAFT FROM LOCAL STORAGE (form fields only — not file blobs)
  useEffect(() => {
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.formData) {
          // Browser-only draft hydration intentionally occurs after mount.
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setFormData((prev) => ({ ...prev, ...parsed.formData }));
        }
        if (parsed.currentStep) {
          setCurrentStep(parsed.currentStep);
        }
      }
    } catch {}
  }, []);

  useEffect(() => {
    const error = new URLSearchParams(window.location.search).get('error');
    if (!error) return;
    const timer = window.setTimeout(() => setLandingAccessError(error), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    previewUrlsRef.current = previewUrls;
  }, [previewUrls]);

  useEffect(() => {
    return () => {
      const urls = previewUrlsRef.current;
      if (urls.fortyHourCert) URL.revokeObjectURL(urls.fortyHourCert);
      if (urls.resume) URL.revokeObjectURL(urls.resume);
      if (urls.govtId) URL.revokeObjectURL(urls.govtId);
    };
  }, []);

  useEffect(() => {
    if (!previewModal) return;
    const trigger =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusFrame = window.requestAnimationFrame(() => {
      previewCloseButtonRef.current?.focus();
    });

    const handleDialogKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setPreviewModal(null);
        return;
      }
      if (event.key !== 'Tab' || !previewDialogRef.current) return;

      const focusable = Array.from(
        previewDialogRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), iframe, [tabindex]:not([tabindex="-1"])'
        )
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const activeElement = document.activeElement;

      if (event.shiftKey && (activeElement === first || !previewDialogRef.current.contains(activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', handleDialogKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener('keydown', handleDialogKeyDown);
      document.body.style.overflow = previousOverflow;
      window.requestAnimationFrame(() => {
        if (trigger?.isConnected) trigger.focus();
      });
    };
  }, [previewModal]);

  const updateField = <K extends keyof typeof formData,>(
    field: K,
    value: (typeof formData)[K]
  ) => {
    setFormData((prev) => {
      const updated = { ...prev, [field]: value };
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({ formData: updated, currentStep }));
      } catch {}
      return updated;
    });
  };

  const clearDraft = () => {
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch (e) {}
    setFormData({
      firstName: '',
      lastName: '',
      email: '',
      phoneNumber: '',
      searchAddress: '',
      addressLine1: '',
      addressLine2: '',
      city: '',
      state: '',
      zipCode: '',
      gender: '',
      courseCompleted: '',
      yearsExperience: '',
      languages: [],
      transportation: '',
      weekdays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
      weekends: ['Saturday'],
      weeklyHours: '15-25 hours/week',
      boroughs: [],
      availableToStart: '',
      workAuth: '',
      backgroundCheck: '',
      isAdultConfirmed: false,
      cprStatus: '',
      additionalNotes: '',
      resumeFileName: '',
      idFileName: '',
      rbtCertFileName: '',
    });
    setResumeFile(null);
    setGovtIdFile(null);
    setFortyHourCertFile(null);
    setPreviewUrls((prev) => {
      if (prev.resume) URL.revokeObjectURL(prev.resume);
      if (prev.govtId) URL.revokeObjectURL(prev.govtId);
      if (prev.fortyHourCert) URL.revokeObjectURL(prev.fortyHourCert);
      return {};
    });
    setDocumentSubmissionIssue(null);
    setCurrentStep(1);
    toast.info('Form cleared and reset.');
  };

  const toggleArrayItem = (
    field: 'languages' | 'weekdays' | 'weekends' | 'boroughs',
    item: string
  ) => {
    setFormData((prev) => {
      const current = prev[field];
      const updated = current.includes(item)
        ? current.filter((i) => i !== item)
        : [...current, item];
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({ formData: { ...prev, [field]: updated }, currentStep }));
      } catch (e) {}
      return { ...prev, [field]: updated };
    });
  };

  const handleNextStep = () => {
    if (currentStep === 1) {
      if (!formData.firstName || !formData.lastName || !formData.email || !formData.phoneNumber) {
        toast.error('Please fill in all required contact details before proceeding.');
        return;
      }
      if (
        !formData.addressLine1.trim() ||
        !formData.city.trim() ||
        !formData.state.trim() ||
        privateApplicantLocation.status === 'UNAVAILABLE'
      ) {
        toast.error(
          'Enter your street, city, state, and a valid 5-digit ZIP. No external address lookup is performed.'
        );
        return;
      }
    }
    if (currentStep === 2) {
      if (!formData.courseCompleted) {
        toast.error('Please select whether you have completed the 40-Hour RBT course.');
        return;
      }
      if (!formData.transportation) {
        toast.error('Please tell us about your transportation.');
        return;
      }
    }
    if (currentStep === 3) {
      if (formData.weekdays.length + formData.weekends.length === 0) {
        toast.error('Select at least one available day.');
        return;
      }
      if (!formData.weeklyHours) {
        toast.error('Please select your preferred weekly hours.');
        return;
      }
      if (formData.boroughs.length === 0) {
        toast.error('Select at least one preferred borough / area.');
        return;
      }
      if (!formData.availableToStart) {
        toast.error('Please tell us how soon you can start.');
        return;
      }
    }
    if (currentStep === 4) {
      if (!formData.workAuth || !formData.backgroundCheck) {
        toast.error('Please complete the compliance questions to proceed.');
        return;
      }
      if (formData.workAuth === 'No') {
        toast.error('US work authorization is required for this role.');
        return;
      }
      if (!formData.isAdultConfirmed) {
        toast.error('Please confirm you are 18 years of age or older.');
        return;
      }
      if (formData.backgroundCheck !== 'Yes') {
        toast.error('Background check authorization is required to proceed.');
        return;
      }
    }
    if (currentStep === 5) {
      if (!resumeFile || !formData.resumeFileName) {
        toast.error('Please upload your resume before continuing.');
        return;
      }
      if (!govtIdFile || !formData.idFileName) {
        toast.error('Please upload a government-issued ID before continuing.');
        return;
      }
    }
    const nextStep = Math.min(currentStep + 1, 6);
    setCurrentStep(nextStep);
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ formData, currentStep: nextStep }));
    } catch (e) {}
  };

  const handlePrevStep = () => {
    const prevStep = Math.max(currentStep - 1, 1);
    setCurrentStep(prevStep);
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ formData, currentStep: prevStep }));
    } catch (e) {}
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setDocumentSubmissionIssue(null);
    try {
      const res = await submitRbtApplication({
        firstName: formData.firstName,
        lastName: formData.lastName,
        email: formData.email,
        phoneNumber: formData.phoneNumber,
        addressLine1: formData.addressLine1,
        addressLine2: formData.addressLine2,
        city: formData.city.trim(),
        state: formData.state.trim(),
        zipCode:
          privateApplicantLocation.status === 'ZIP_ONLY'
            ? privateApplicantLocation.postalCode
            : formData.zipCode.trim(),
        gender: formData.gender || undefined,
        rbtStatus: formData.courseCompleted,
        cprStatus: formData.cprStatus || undefined,
        yearsExperience: formData.yearsExperience || undefined,
        languages: formData.languages,
        preferredBoroughs: formData.boroughs,
        availabilityHours: formData.weekdays.concat(formData.weekends),
        weeklyHours: formData.weeklyHours || undefined,
        availableToStart: formData.availableToStart || undefined,
        transportation: formData.transportation || undefined,
        workAuth: formData.workAuth || undefined,
        additionalNotes: formData.additionalNotes || undefined,
        isAdult: formData.isAdultConfirmed,
        backgroundCheckConsent: formData.backgroundCheck === 'Yes',
        resumeFileName: formData.resumeFileName,
        govtIdFileName: formData.idFileName,
        fortyHourCertFileName: formData.rbtCertFileName || undefined,
      });

      if (res.success && !res.applicantId) {
        try {
          localStorage.removeItem(DRAFT_KEY);
          localStorage.removeItem('ras_file_data_urls');
        } catch {
          // Submission is complete even if local draft cleanup is unavailable.
        }
        setDocumentSubmissionIssue(null);
        setIsSubmitted(true);
        toast.success(res.message || 'Application received.');
        return;
      }

      if (res.success && res.applicantId) {
        let uploadIssue: string | null = null;
        if (resumeFile || govtIdFile || fortyHourCertFile) {
          if (!res.uploadToken) {
            uploadIssue =
              'Application saved, but secure document access could not be created. Contact HR before sending files again.';
          } else {
            try {
              const docs = new FormData();
              if (resumeFile) docs.append('resume', resumeFile);
              if (govtIdFile) docs.append('govtId', govtIdFile);
              if (fortyHourCertFile) docs.append('fortyHourCert', fortyHourCertFile);
              const uploadRes = await attachApplicantDocuments(
                res.applicantId,
                res.uploadToken,
                docs
              );
              if (!uploadRes.success) {
                uploadIssue =
                  uploadRes.error || 'Application saved, but document upload failed.';
              } else if (fortyHourCertFile) {
                toast.success(
                  '40-Hour certificate saved — that requirement is already complete.'
                );
              }
            } catch {
              uploadIssue =
                'Application saved, but the document service could not be reached. Check your connection before trying again.';
            }
          }
        }
        setDocumentSubmissionIssue(uploadIssue);

        try {
          localStorage.removeItem(DRAFT_KEY);
          localStorage.removeItem('ras_file_data_urls');
          // Metadata-only cache for Dev Tools / same-browser ATS peek (no file blobs)
          const submittedAppPayload = {
            applicantId: res.applicantId,
            fullName: `${formData.firstName} ${formData.lastName}`,
            email: formData.email,
            phoneNumber: formData.phoneNumber,
            address: `${formData.addressLine1}${formData.addressLine2 ? ', ' + formData.addressLine2 : ''}, ${formData.city}, ${formData.state} ${formData.zipCode}`,
            gender: formData.gender,
            rbtStatus: formData.courseCompleted,
            cprStatus: formData.cprStatus || null,
            yearsExperience: formData.yearsExperience || null,
            languages: formData.languages,
            boroughs: formData.boroughs.join(', '),
            weeklyHours: formData.weeklyHours || null,
            availableToStart: formData.availableToStart || null,
            workAuth: formData.workAuth,
            backgroundCheck: formData.backgroundCheck,
            transportation: formData.transportation,
            availability: formData.weekdays.concat(formData.weekends).join(', '),
            additionalNotes: formData.additionalNotes || null,
            resumeFileName: formData.resumeFileName || null,
            govtIdFileName: formData.idFileName || null,
            fortyHourCertFileName: formData.rbtCertFileName || null,
            submittedAt: new Date().toISOString(),
          };
          localStorage.setItem(`ras_submitted_app_${res.applicantId}`, JSON.stringify(submittedAppPayload));
          localStorage.setItem('ras_latest_submitted_app', JSON.stringify(submittedAppPayload));
        } catch (e) {}
        setIsSubmitted(true);
        if (uploadIssue) {
          toast.warning('Application saved, but your documents still need attention.');
        } else {
          toast.success('Your RBT application has been submitted successfully!');
        }
      } else {
        toast.error(res.error || 'Failed to submit application.');
      }
    } catch {
      toast.error('An error occurred while submitting.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const steps = [
    { num: 1, title: 'Personal Info', icon: User },
    { num: 2, title: 'RBT Readiness', icon: ClipboardCheck },
    { num: 3, title: 'Availability', icon: Calendar },
    { num: 4, title: 'Compliance', icon: Shield },
    { num: 5, title: 'Resume', icon: FileText },
    { num: 6, title: 'Review', icon: CheckCircle2 },
  ];

  if (landingAccessError) {
    const access = classifyApplicantAccessError(landingAccessError);
    return (
      <section
        role="alert"
        aria-live="assertive"
        className="relative mx-auto my-12 max-w-2xl overflow-hidden rounded-3xl border border-rose-400/20 bg-zinc-950 p-8 text-white shadow-2xl"
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(244,63,94,0.16),transparent_46%),radial-gradient(circle_at_bottom_right,rgba(249,115,22,0.12),transparent_42%)]" />
        <div className="relative space-y-6 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-rose-400/20 bg-rose-500/10 shadow-[0_0_30px_rgba(244,63,94,0.12)]">
            <AlertCircle className="h-8 w-8 text-rose-300" aria-hidden="true" />
          </div>
          <div>
            <p className="font-mono text-[10px] font-black uppercase tracking-[0.2em] text-rose-300">
              Applicant portal
            </p>
            <h1 className="mt-2 font-heading text-3xl font-black">{access.title}</h1>
            <p className="mx-auto mt-3 max-w-lg text-sm font-medium leading-relaxed text-zinc-300">
              {access.description}
            </p>
            <p className="mx-auto mt-3 max-w-lg rounded-xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-xs font-bold leading-relaxed text-amber-200">
              Do not submit another application from this screen unless HR specifically asks you
              to apply again.
            </p>
          </div>
          <div className="flex flex-col justify-center gap-3 border-t border-white/10 pt-5 sm:flex-row">
            <a
              href="mailto:info@riseandshine.nyc?subject=Applicant%20portal%20access"
              className="inline-flex cursor-pointer items-center justify-center rounded-xl border border-orange-400/30 bg-orange-500/15 px-5 py-3 text-xs font-black text-orange-200 transition-all hover:border-orange-300/60 hover:bg-orange-500/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
            >
              Contact HR for next steps
            </a>
            {/* A full navigation intentionally clears any in-memory application state. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/"
              className="inline-flex cursor-pointer items-center justify-center rounded-xl border border-white/10 bg-white/5 px-5 py-3 text-xs font-black text-zinc-100 transition-all hover:border-white/20 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
            >
              Return home
            </a>
          </div>
        </div>
      </section>
    );
  }

  if (isSubmitted) {
    const documentIssue = documentSubmissionIssue
      ? classifyApplicantAccessError(documentSubmissionIssue)
      : null;
    return (
      <div
        className={`bg-white border-2 rounded-3xl p-10 max-w-2xl mx-auto text-center space-y-6 shadow-2xl my-12 animate-fade-in ${
          documentIssue ? 'border-amber-300' : 'border-emerald-300'
        }`}
      >
        <div
          className={`w-20 h-20 border-2 rounded-full flex items-center justify-center mx-auto shadow-lg ${
            documentIssue
              ? 'border-amber-300 bg-amber-100 text-amber-700'
              : 'border-emerald-300 bg-emerald-100 text-emerald-600'
          }`}
        >
          {documentIssue ? (
            <AlertCircle className="w-10 h-10" aria-hidden="true" />
          ) : (
            <CheckCircle2 className="w-10 h-10" aria-hidden="true" />
          )}
        </div>
        <div className="space-y-3">
          <h2 className="text-3xl sm:text-4xl font-black text-slate-900 font-heading">
            {documentIssue ? 'Application Saved — Documents Need Attention' : 'Application Submitted!'}
          </h2>
          <p className="text-slate-700 text-base max-w-md mx-auto leading-relaxed font-medium">
            Thank you,{' '}
            <strong className="text-[#F97316] font-bold">{formData.firstName}</strong>! Our HR
            Recruitment Team has received your RBT application.
          </p>
          {documentIssue && (
            <div
              role="alert"
              className="max-w-md mx-auto rounded-2xl border border-amber-300 bg-amber-50 p-4 text-left"
            >
              <p className="text-sm font-black text-amber-950">{documentIssue.title}</p>
              <p className="mt-1 text-xs font-semibold leading-relaxed text-amber-900">
                {documentIssue.description}
              </p>
              <p className="mt-2 font-mono text-[10px] font-bold text-amber-800">
                Your application is saved, but HR should not treat the files as received yet.
              </p>
            </div>
          )}
          <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4 text-xs text-slate-800 space-y-1 max-w-md mx-auto text-left">
            <span className="font-mono font-extrabold text-[#F97316] uppercase block">Next Steps • HR Review Gatekeeper:</span>
            <p className="font-medium text-slate-700 leading-relaxed">
              Our HR Specialists will analyze your resume and compliance documents. Upon approval, an activation email containing your single-use <strong>Magic Link</strong> will be sent to <span className="font-bold text-slate-900">{formData.email}</span> so you can activate your RBT Employee Portal.
            </p>
          </div>
        </div>
        <div className="flex flex-col items-stretch justify-center gap-3 sm:flex-row">
          {documentIssue?.retryable ? (
            <button
              type="button"
              onClick={() => {
                setIsSubmitted(false);
                setCurrentStep(5);
              }}
              className="bg-[#F97316] hover:bg-orange-600 text-white font-extrabold text-sm px-6 py-3.5 rounded-2xl cursor-pointer shadow-xl shadow-orange-500/30 transition-all hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2"
            >
              Review files and try again
            </button>
          ) : documentIssue ? (
            <a
              href="mailto:info@riseandshine.nyc?subject=Applicant%20document%20upload"
              className="inline-flex cursor-pointer items-center justify-center rounded-2xl bg-[#F97316] px-6 py-3.5 text-sm font-extrabold text-white shadow-xl shadow-orange-500/30 transition-all hover:scale-105 hover:bg-orange-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2"
            >
              Contact HR
            </a>
          ) : null}
          <button
            type="button"
            onClick={() => (window.location.href = '/')}
            className="cursor-pointer rounded-2xl border border-slate-300 bg-white px-6 py-3.5 text-sm font-extrabold text-slate-700 shadow-sm transition-all hover:scale-105 hover:border-orange-300 hover:text-[#F97316] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2"
          >
            Return to Home Page
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border-2 border-orange-200/90 rounded-3xl p-6 sm:p-10 shadow-2xl space-y-8 animate-fade-in my-4">
      {/* CARD HEADER TITLE & DRAFT RESET BUTTON */}
      <div className="flex items-center justify-between border-b border-orange-100 pb-4">
        <div>
          <h1 className="text-3xl sm:text-4xl font-black text-slate-900 font-heading tracking-tight">
            RBT Application
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 font-bold mt-1">
            Join our team and make a difference in children&apos;s lives
          </p>
        </div>

        <button
          onClick={clearDraft}
          title="Clear form and start over"
          suppressHydrationWarning
          className="text-xs text-slate-400 hover:text-rose-600 font-bold flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 hover:border-rose-300 transition-all cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Start Over</span>
        </button>
      </div>

      {/* 6-STEP PROGRESS INDICATOR */}
      <div className="relative pt-2 pb-4">
        {/* Step Circles & Bar */}
        <div className="flex items-center justify-between relative z-10 max-w-2xl mx-auto">
          {steps.map((s) => {
            const IconComp = s.icon;
            const isCompleted = currentStep > s.num;
            const isActive = currentStep === s.num;

            return (
              <div key={s.num} className="flex flex-col items-center gap-2">
                <div
                  onClick={() => isCompleted && setCurrentStep(s.num)}
                  className={`w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                    isCompleted
                      ? 'bg-[#10B981] text-white shadow-md cursor-pointer'
                      : isActive
                      ? 'bg-orange-100 border-2 border-[#F97316] text-[#F97316] shadow-lg shadow-orange-500/20 scale-105'
                      : 'bg-slate-100 border border-slate-300 text-slate-400'
                  }`}
                >
                  {isCompleted ? <Check className="w-5 h-5 stroke-[3]" /> : <IconComp className="w-5 h-5" />}
                </div>

                <span
                  className={`text-[11px] font-bold text-center hidden sm:block ${
                    isCompleted
                      ? 'text-slate-800'
                      : isActive
                      ? 'text-[#F97316] font-extrabold'
                      : 'text-slate-400'
                  }`}
                >
                  {s.title}
                </span>
              </div>
            );
          })}
        </div>

        {/* CONNECTING STEP LINE */}
        <div className="absolute top-[30px] left-[8%] right-[8%] h-1 bg-slate-200 -z-0 rounded-full" />

        {/* STEP COUNT SUBTITLE */}
        <div className="text-center mt-4">
          <span className="text-xs font-mono font-extrabold text-[#F97316] bg-orange-50 px-3 py-1 rounded-full border border-orange-200">
            Step {currentStep} of 6
          </span>
        </div>
      </div>

      {/* STEP CONTENT CONTAINER */}
      <div className="space-y-6 min-h-[380px] pt-2">
        {/* STEP 1: PERSONAL INFORMATION */}
        {currentStep === 1 && (
          <div className="space-y-5 animate-fade-in">
            <div className="space-y-1 border-b border-orange-100 pb-3">
              <h2 className="text-xl font-black text-slate-900 font-heading">Personal Information</h2>
              <p className="text-xs text-slate-600 font-bold">Please provide your basic information.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="flex items-center justify-between text-xs font-extrabold text-slate-800 mb-1.5">
                  <span>First Name *</span>
                  {formData.firstName && <Check className="w-3.5 h-3.5 text-emerald-600" />}
                </label>
                <input
                  type="text"
                  value={formData.firstName}
                  onChange={(e) => updateField('firstName', e.target.value)}
                  placeholder="John"
                  suppressHydrationWarning
                  className="w-full bg-white border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-900 font-bold focus:border-[#F97316] focus:ring-2 focus:ring-orange-500/20 focus:outline-none transition-all"
                />
              </div>

              <div>
                <label className="flex items-center justify-between text-xs font-extrabold text-slate-800 mb-1.5">
                  <span>Last Name *</span>
                  {formData.lastName && <Check className="w-3.5 h-3.5 text-emerald-600" />}
                </label>
                <input
                  type="text"
                  value={formData.lastName}
                  onChange={(e) => updateField('lastName', e.target.value)}
                  placeholder="Doe"
                  suppressHydrationWarning
                  className="w-full bg-white border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-900 font-bold focus:border-[#F97316] focus:ring-2 focus:ring-orange-500/20 focus:outline-none transition-all"
                />
              </div>

              <div>
                <label className="flex items-center justify-between text-xs font-extrabold text-slate-800 mb-1.5">
                  <span>Email Address *</span>
                  {formData.email && <Check className="w-3.5 h-3.5 text-emerald-600" />}
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => updateField('email', e.target.value)}
                  placeholder="candidate@example.com"
                  suppressHydrationWarning
                  className="w-full bg-white border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-900 font-bold focus:border-[#F97316] focus:ring-2 focus:ring-orange-500/20 focus:outline-none transition-all"
                />
              </div>

              <div>
                <label className="flex items-center justify-between text-xs font-extrabold text-slate-800 mb-1.5">
                  <span>Phone Number *</span>
                  {formData.phoneNumber && <Check className="w-3.5 h-3.5 text-emerald-600" />}
                </label>
                <input
                  type="tel"
                  value={formData.phoneNumber}
                  onChange={(e) => updateField('phoneNumber', e.target.value)}
                  placeholder="(929) 555-0199"
                  suppressHydrationWarning
                  className="w-full bg-white border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-900 font-bold focus:border-[#F97316] focus:ring-2 focus:ring-orange-500/20 focus:outline-none transition-all"
                />
              </div>

              <div className="sm:col-span-2 rounded-2xl border border-sky-200 bg-sky-50/80 p-4">
                <div className="flex items-start gap-3">
                  <Shield className="mt-0.5 h-4 w-4 shrink-0 text-sky-700" aria-hidden="true" />
                  <div>
                    <p className="font-mono text-[10px] font-extrabold uppercase tracking-wider text-sky-800">
                      Private address entry
                    </p>
                    <p className="mt-1 text-[11px] font-medium leading-relaxed text-sky-900">
                      Enter the address manually. The street address is not sent to a public
                      location service; only the ZIP is evaluated locally for a coarse area.
                    </p>
                  </div>
                </div>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-extrabold text-slate-800 mb-1.5">
                  Street Address *
                </label>
                <input
                  type="text"
                  autoComplete="address-line1"
                  value={formData.addressLine1}
                  onChange={(e) => updateField('addressLine1', e.target.value)}
                  placeholder="2137 33rd Street"
                  suppressHydrationWarning
                  className="w-full bg-white border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-900 font-bold focus:border-[#F97316] focus:ring-2 focus:ring-orange-500/20 focus:outline-none transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-extrabold text-slate-800 mb-1.5">
                  City *
                </label>
                <input
                  type="text"
                  autoComplete="address-level2"
                  value={formData.city}
                  onChange={(e) => updateField('city', e.target.value)}
                  placeholder="Astoria"
                  suppressHydrationWarning
                  className="w-full bg-white border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-900 font-bold focus:border-[#F97316] focus:ring-2 focus:ring-orange-500/20 focus:outline-none transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-extrabold text-slate-800 mb-1.5">
                  State *
                </label>
                <input
                  type="text"
                  autoComplete="address-level1"
                  maxLength={2}
                  value={formData.state}
                  onChange={(e) => updateField('state', e.target.value.toUpperCase())}
                  placeholder="NY"
                  suppressHydrationWarning
                  className="w-full bg-white border border-slate-300 rounded-xl px-4 py-2.5 text-sm uppercase text-slate-900 font-bold focus:border-[#F97316] focus:ring-2 focus:ring-orange-500/20 focus:outline-none transition-all"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-extrabold text-slate-800 mb-1.5">
                  ZIP Code *
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="postal-code"
                  maxLength={10}
                  value={formData.zipCode}
                  onChange={(e) => updateField('zipCode', e.target.value)}
                  placeholder="11105"
                  suppressHydrationWarning
                  className="w-full bg-white border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-900 font-bold focus:border-[#F97316] focus:ring-2 focus:ring-orange-500/20 focus:outline-none transition-all"
                />
                {formData.zipCode && (
                  <p
                    className={`mt-2 text-[11px] font-bold ${
                      privateApplicantLocation.status === 'ZIP_ONLY'
                        ? 'text-emerald-700'
                        : 'text-amber-700'
                    }`}
                  >
                    {privateApplicantLocation.status === 'ZIP_ONLY'
                      ? privateApplicantLocation.borough
                        ? `ZIP recognized locally · ${privateApplicantLocation.borough}`
                        : 'ZIP recognized locally · borough unavailable'
                      : 'Enter a valid 5-digit ZIP. External address verification is unavailable.'}
                  </p>
                )}
              </div>

              {/* OPTIONAL APARTMENT / SUITE NUMBER */}
              <div className="sm:col-span-2">
                <label className="block text-xs font-extrabold text-slate-800 mb-1.5">Address Line 2 (Apt/Suite - Optional)</label>
                <input
                  type="text"
                  value={formData.addressLine2}
                  onChange={(e) => updateField('addressLine2', e.target.value)}
                  placeholder="Apt 4B"
                  suppressHydrationWarning
                  className="w-full bg-white border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-900 font-bold focus:border-[#F97316] focus:ring-2 focus:ring-orange-500/20 focus:outline-none transition-all"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-extrabold text-slate-800 mb-1.5">Gender *</label>
                <select
                  value={formData.gender}
                  onChange={(e) => updateField('gender', e.target.value)}
                  suppressHydrationWarning
                  className="w-full bg-white border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-900 font-bold focus:border-[#F97316] focus:ring-2 focus:ring-orange-500/20 focus:outline-none transition-all"
                >
                  <option value="">Select...</option>
                  <option value="Female">Female</option>
                  <option value="Male">Male</option>
                  <option value="Non-binary">Non-binary</option>
                  <option value="Prefer not to say">Prefer not to say</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* STEP 2: RBT READINESS */}
        {currentStep === 2 && (
          <div className="space-y-5 animate-fade-in">
            <div className="space-y-1 border-b border-orange-100 pb-3">
              <h2 className="text-xl font-black text-slate-900 font-heading">RBT Readiness</h2>
              <p className="text-xs text-slate-600 font-bold">
                Quick screening — if you already finished the 40-hour course, you can upload the certificate on the Documents step.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-extrabold text-slate-800 mb-1.5">
                  40-Hour RBT Course Already Completed? *
                </label>
                <select
                  value={formData.courseCompleted}
                  onChange={(e) => updateField('courseCompleted', e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-900 font-bold focus:border-[#F97316] focus:ring-2 focus:ring-orange-500/20 focus:outline-none transition-all cursor-pointer"
                >
                  <option value="">Select...</option>
                  <option value="Yes">Yes — I have my certificate</option>
                  <option value="In Progress">In Progress</option>
                  <option value="No, but interested in free training">
                    No — I&apos;ll take the free APF course
                  </option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-extrabold text-slate-800 mb-1.5">
                  Years of ABA / childcare experience
                </label>
                <select
                  value={formData.yearsExperience}
                  onChange={(e) => updateField('yearsExperience', e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-900 font-bold focus:border-[#F97316] focus:ring-2 focus:ring-orange-500/20 focus:outline-none transition-all cursor-pointer"
                >
                  <option value="">Select...</option>
                  <option value="No Experience">No Experience</option>
                  <option value="Less than 1 year">Less than 1 year</option>
                  <option value="1-2 years">1-2 years</option>
                  <option value="3-5 years">3-5 years</option>
                  <option value="5+ years">5+ years</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-extrabold text-slate-800 mb-2">
                  Languages Spoken
                </label>
                <div className="flex flex-wrap gap-3 text-xs text-slate-800">
                  {['English', 'Spanish', 'French', 'Mandarin', 'Arabic', 'Other'].map((lang) => {
                    const isChecked = formData.languages.includes(lang);
                    return (
                      <label
                        key={lang}
                        className="flex items-center gap-2 cursor-pointer font-bold hover:text-slate-900"
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleArrayItem('languages', lang)}
                          className="w-4 h-4 text-[#F97316] border-slate-300 rounded focus:ring-orange-500 cursor-pointer"
                        />
                        <span>{lang}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-xs font-extrabold text-slate-800 mb-1.5">
                  Reliable Transportation? *
                </label>
                <select
                  value={formData.transportation}
                  onChange={(e) => updateField('transportation', e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-900 font-bold focus:border-[#F97316] focus:ring-2 focus:ring-orange-500/20 focus:outline-none transition-all cursor-pointer"
                >
                  <option value="">Select...</option>
                  <option value="Yes - Personal Vehicle">Yes - Personal Vehicle</option>
                  <option value="Yes - Public Transit">Yes - Public Transit</option>
                  <option value="No">No</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* STEP 3: AVAILABILITY */}
        {currentStep === 3 && (
          <div className="space-y-5 animate-fade-in">
            <div className="space-y-1 border-b border-orange-100 pb-3">
              <h2 className="text-xl font-black text-slate-900 font-heading">Availability</h2>
              <p className="text-xs text-slate-600 font-bold">
                Most sessions are after 2PM on weekdays and on weekends. You&apos;ll set a detailed hour grid later
                in the portal — this is just for HR matching.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-extrabold text-slate-800 mb-2">
                  Weekday Availability (after 2PM) *
                </label>
                <div className="flex flex-wrap gap-4 text-xs text-slate-800 font-bold">
                  {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].map((day) => {
                    const isChecked = formData.weekdays.includes(day);
                    return (
                      <label key={day} className="flex items-center gap-2 cursor-pointer hover:text-slate-900">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleArrayItem('weekdays', day)}
                          className="w-4 h-4 text-[#F97316] border-slate-300 rounded focus:ring-orange-500 cursor-pointer"
                        />
                        <span>{day}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-xs font-extrabold text-slate-800 mb-2">Weekend Availability</label>
                <div className="flex flex-wrap gap-4 text-xs text-slate-800 font-bold">
                  {['Saturday', 'Sunday'].map((day) => {
                    const isChecked = formData.weekends.includes(day);
                    return (
                      <label key={day} className="flex items-center gap-2 cursor-pointer hover:text-slate-900">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleArrayItem('weekends', day)}
                          className="w-4 h-4 text-[#F97316] border-slate-300 rounded focus:ring-orange-500 cursor-pointer"
                        />
                        <span>{day}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-xs font-extrabold text-slate-800 mb-1.5">
                  Preferred Weekly Hours *
                </label>
                <select
                  value={formData.weeklyHours}
                  onChange={(e) => updateField('weeklyHours', e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-900 font-bold focus:border-[#F97316] focus:ring-2 focus:ring-orange-500/20 focus:outline-none transition-all cursor-pointer"
                >
                  <option value="">Select...</option>
                  <option value="10-15 hours/week">10-15 hours/week</option>
                  <option value="15-25 hours/week">15-25 hours/week</option>
                  <option value="25-35 hours/week">25-35 hours/week</option>
                  <option value="35+ hours/week">35+ hours/week</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-extrabold text-slate-800 mb-2">
                  Preferred Boroughs / Areas *
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-slate-800 font-bold">
                  {NYC_BOROUGHS.map((b) => {
                    const isChecked = formData.boroughs.includes(b);
                    return (
                      <label
                        key={b}
                        className={`flex items-center gap-2 cursor-pointer rounded-xl border px-3 py-2 transition-all ${
                          isChecked
                            ? 'border-[#F97316] bg-orange-50 text-slate-900'
                            : 'border-slate-200 bg-white hover:border-orange-200'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleArrayItem('boroughs', b)}
                          className="w-4 h-4 text-[#F97316] border-slate-300 rounded focus:ring-orange-500 cursor-pointer"
                        />
                        <span>{b}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-xs font-extrabold text-slate-800 mb-1.5">
                  How soon can you start? *
                </label>
                <select
                  value={formData.availableToStart}
                  onChange={(e) => updateField('availableToStart', e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-900 font-bold focus:border-[#F97316] focus:ring-2 focus:ring-orange-500/20 focus:outline-none transition-all cursor-pointer"
                >
                  <option value="">Select...</option>
                  <option value="Immediately">Immediately</option>
                  <option value="Within 1 week">Within 1 week</option>
                  <option value="1-2 weeks">1–2 weeks</option>
                  <option value="2-4 weeks">2–4 weeks</option>
                  <option value="1+ month">1+ month</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* STEP 4: COMPLIANCE & ELIGIBILITY */}
        {currentStep === 4 && (
          <div className="space-y-5 animate-fade-in">
            <div className="space-y-1 border-b border-orange-100 pb-3">
              <h2 className="text-xl font-black text-slate-900 font-heading">Compliance &amp; Eligibility</h2>
              <p className="text-xs text-slate-600 font-bold">Please confirm your eligibility and compliance requirements.</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-extrabold text-slate-800 mb-1.5">Are you authorized to work in the US? *</label>
                <select
                  value={formData.workAuth}
                  onChange={(e) => updateField('workAuth', e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-900 font-bold focus:border-[#F97316] focus:ring-2 focus:ring-orange-500/20 focus:outline-none transition-all"
                >
                  <option value="">Select...</option>
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-extrabold text-slate-800 mb-1.5">
                  Can you authorize a background check? *
                </label>
                <select
                  value={formData.backgroundCheck}
                  onChange={(e) => updateField('backgroundCheck', e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-900 font-bold focus:border-[#F97316] focus:ring-2 focus:ring-orange-500/20 focus:outline-none transition-all cursor-pointer"
                >
                  <option value="">Select...</option>
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                </select>
              </div>

              <label className="flex items-start gap-3 p-4 rounded-2xl border-2 border-slate-200 bg-slate-50 cursor-pointer hover:border-[#F97316]/50 transition-all">
                <input
                  type="checkbox"
                  checked={formData.isAdultConfirmed}
                  onChange={(e) => updateField('isAdultConfirmed', e.target.checked)}
                  className="mt-0.5 w-4 h-4 text-[#F97316] border-slate-300 rounded focus:ring-orange-500 cursor-pointer"
                />
                <span className="text-xs font-bold text-slate-800">
                  I confirm that I am <strong>18 years of age or older</strong> *
                </span>
              </label>

              <div>
                <label className="block text-xs font-extrabold text-slate-800 mb-1.5">
                  CPR/First Aid Certified?
                </label>
                <select
                  value={formData.cprStatus}
                  onChange={(e) => updateField('cprStatus', e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-900 font-bold focus:border-[#F97316] focus:ring-2 focus:ring-orange-500/20 focus:outline-none transition-all cursor-pointer"
                >
                  <option value="">Select...</option>
                  <option value="Yes - Active">Yes - Active</option>
                  <option value="Expired (Will Renew)">Expired (Will Renew)</option>
                  <option value="No - Need Certification">No - Need Certification</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-extrabold text-slate-800 mb-1.5">Additional Notes (Optional)</label>
                <textarea
                  rows={3}
                  value={formData.additionalNotes}
                  onChange={(e) => updateField('additionalNotes', e.target.value)}
                  placeholder="Any additional information you'd like to share..."
                  className="w-full bg-white border border-slate-300 rounded-xl p-3 text-sm text-slate-900 font-bold focus:border-[#F97316] focus:ring-2 focus:ring-orange-500/20 focus:outline-none transition-all"
                />
              </div>
            </div>
          </div>
        )}

        {/* STEP 5: RESUME & DOCUMENTS (CLEAN UPLOADERS) */}
        {currentStep === 5 && (
          <div className="space-y-5 animate-fade-in">
            <div className="space-y-1 border-b border-orange-100 pb-3">
              <h2 className="text-xl font-black text-slate-900 font-heading">Resume &amp; Documents</h2>
              <p className="text-xs text-slate-600 font-bold">
                Resume and government ID are required. Upload a 40-hour certificate only if you already have one.
              </p>
            </div>

            <div className="space-y-4">
              {/* Resume Drag & Drop Zone */}
              <div>
                <label className="block text-xs font-extrabold text-slate-800 mb-1.5">Resume * (PDF, JPG, PNG, or WEBP, max 10MB)</label>
                {formData.resumeFileName ? (
                  <div className="border-2 border-slate-200 bg-white rounded-2xl p-4 flex items-center justify-between shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-[#F97316]">
                        <FileText className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-xs font-black text-slate-900">{formData.resumeFileName}</p>
                        <p className="text-[10px] font-mono text-slate-500">Attached Resume File • Ready for Submission</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          if (previewUrls.resume) {
                            setPreviewModal({
                              name: formData.resumeFileName,
                              url: previewUrls.resume,
                              mimeType: resumeFile?.type || '',
                            });
                          } else {
                            toast.info(`Resume attached: ${formData.resumeFileName}`);
                          }
                        }}
                        aria-label="Preview attached resume"
                        className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
                        title="Preview Attached Resume"
                      >
                        <Eye className="w-4 h-4 text-slate-700" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          updateField('resumeFileName', '');
                          setResumeFile(null);
                          setPreviewUrls((prev) => {
                            if (prev.resume) URL.revokeObjectURL(prev.resume);
                            return { ...prev, resume: undefined };
                          });
                          toast.info('Resume removed. You can now upload a new file.');
                        }}
                        aria-label="Remove resume and choose another file"
                        className="p-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 transition-colors cursor-pointer border border-rose-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
                        title="Delete & Re-upload Resume"
                      >
                        <Trash2 className="w-4 h-4 text-rose-600" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="border-2 border-dashed border-orange-200 hover:border-[#F97316] rounded-2xl p-6 text-center space-y-2 bg-orange-50/40 transition-all relative focus-within:border-[#F97316] focus-within:ring-4 focus-within:ring-orange-300/40">
                    <Upload className="w-7 h-7 text-[#F97316] mx-auto" />
                    <p className="text-xs text-slate-800 font-extrabold">Click to upload or drag and drop</p>
                    <p className="text-[10px] text-slate-500 uppercase font-mono font-bold">PDF, JPG, PNG, OR WEBP (MAX 10MB)</p>
                    <input
                      type="file"
                      accept="application/pdf,image/jpeg,image/png,image/webp"
                      aria-label="Choose required resume"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const validationError = validateDocumentFile(file, { label: 'Resume' });
                          if (validationError) {
                            toast.error(validationError.message);
                            e.target.value = '';
                            return;
                          }
                          updateField('resumeFileName', file.name);
                          setResumeFile(file);
                          setPreviewUrls((prev) => {
                            if (prev.resume) URL.revokeObjectURL(prev.resume);
                            return { ...prev, resume: URL.createObjectURL(file) };
                          });
                          toast.success(`Attached ${file.name}`);
                        }
                      }}
                      className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                    />
                  </div>
                )}
              </div>

              {/* ID Drag & Drop Zone */}
              <div>
                <label className="block text-xs font-extrabold text-slate-800 mb-1.5">Government-issued ID * (PDF, JPG, PNG, or WEBP, max 10MB)</label>
                {formData.idFileName ? (
                  <div className="border-2 border-slate-200 bg-white rounded-2xl p-4 flex items-center justify-between shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-600">
                        <Shield className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-xs font-black text-slate-900">{formData.idFileName}</p>
                        <p className="text-[10px] font-mono text-slate-500">Attached Identification Card • Ready for Submission</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          if (previewUrls.govtId) {
                            setPreviewModal({
                              name: formData.idFileName,
                              url: previewUrls.govtId,
                              mimeType: govtIdFile?.type || '',
                            });
                          } else {
                            toast.info(`ID attached: ${formData.idFileName}`);
                          }
                        }}
                        aria-label="Preview attached government-issued ID"
                        className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
                        title="Preview Attached Photo ID"
                      >
                        <Eye className="w-4 h-4 text-slate-700" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          updateField('idFileName', '');
                          setGovtIdFile(null);
                          setPreviewUrls((prev) => {
                            if (prev.govtId) URL.revokeObjectURL(prev.govtId);
                            return { ...prev, govtId: undefined };
                          });
                          toast.info('Photo ID removed. You can now upload a new file.');
                        }}
                        aria-label="Remove government-issued ID and choose another file"
                        className="p-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 transition-colors cursor-pointer border border-rose-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
                        title="Delete & Re-upload Photo ID"
                      >
                        <Trash2 className="w-4 h-4 text-rose-600" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="border-2 border-dashed border-orange-200 hover:border-[#F97316] rounded-2xl p-6 text-center space-y-2 bg-orange-50/40 transition-all relative focus-within:border-[#F97316] focus-within:ring-4 focus-within:ring-orange-300/40">
                    <Upload className="w-7 h-7 text-[#F97316] mx-auto" />
                    <p className="text-xs text-slate-800 font-extrabold">Click to upload or drag and drop</p>
                    <p className="text-[10px] text-slate-500 uppercase font-mono font-bold">PDF, JPG, PNG, OR WEBP (MAX 10MB)</p>
                    <input
                      type="file"
                      accept="application/pdf,image/jpeg,image/png,image/webp"
                      aria-label="Choose required government-issued ID"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const validationError = validateDocumentFile(file, {
                            label: 'Government-issued ID',
                          });
                          if (validationError) {
                            toast.error(validationError.message);
                            e.target.value = '';
                            return;
                          }
                          updateField('idFileName', file.name);
                          setGovtIdFile(file);
                          setPreviewUrls((prev) => {
                            if (prev.govtId) URL.revokeObjectURL(prev.govtId);
                            return { ...prev, govtId: URL.createObjectURL(file) };
                          });
                          toast.success(`Attached ID: ${file.name}`);
                        }
                      }}
                      className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                    />
                  </div>
                )}
              </div>

              {/* Optional 40-Hour BACB Certificate — skips REQ 5 if uploaded */}
              <div>
                <div className="flex flex-wrap items-center gap-2 mb-1.5">
                  <label className="block text-xs font-extrabold text-slate-800">
                    40-Hour BACB Course Certificate (Optional)
                  </label>
                  <span className="text-[9px] font-mono font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-300 px-1.5 py-0.5 rounded">
                    Skip later if you upload now
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 font-medium mb-2">
                  Already finished the free APF (or any BACB-approved) 40-hour course? Upload the
                  certificate PDF here and you won&apos;t need to redo that step in the portal.
                </p>
                {formData.rbtCertFileName ? (
                  <div className="border-2 border-emerald-200 bg-emerald-50/60 rounded-2xl p-4 flex items-center justify-between shadow-sm">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-600 shrink-0">
                        <CheckCircle2 className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-black text-slate-900 truncate">
                          {formData.rbtCertFileName}
                        </p>
                        <p className="text-[10px] font-mono text-emerald-700">
                          40-Hour cert attached · Will clear REQ 5 on submit
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          if (previewUrls.fortyHourCert) {
                            setPreviewModal({
                              name: formData.rbtCertFileName,
                              url: previewUrls.fortyHourCert,
                              mimeType: fortyHourCertFile?.type || '',
                            });
                          } else {
                            toast.info(`Certificate attached: ${formData.rbtCertFileName}`);
                          }
                        }}
                        aria-label="Preview attached 40-hour certificate"
                        className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
                        title="Preview certificate"
                      >
                        <Eye className="w-4 h-4 text-slate-700" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          updateField('rbtCertFileName', '');
                          setFortyHourCertFile(null);
                          setPreviewUrls((prev) => {
                            if (prev.fortyHourCert) URL.revokeObjectURL(prev.fortyHourCert);
                            return { ...prev, fortyHourCert: undefined };
                          });
                          toast.info('40-Hour certificate removed.');
                        }}
                        aria-label="Remove 40-hour certificate"
                        className="p-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 transition-colors cursor-pointer border border-rose-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
                        title="Remove certificate"
                      >
                        <Trash2 className="w-4 h-4 text-rose-600" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="border-2 border-dashed border-emerald-200 hover:border-emerald-500 rounded-2xl p-6 text-center space-y-2 bg-emerald-50/40 transition-all relative focus-within:border-emerald-500 focus-within:ring-4 focus-within:ring-emerald-300/40">
                    <Upload className="w-7 h-7 text-emerald-600 mx-auto" />
                    <p className="text-xs text-slate-800 font-extrabold">
                      {formData.courseCompleted === 'Yes'
                        ? 'Upload your 40-Hour certificate to skip that requirement'
                        : 'Click to upload 40-Hour certificate (optional)'}
                    </p>
                    <p className="text-[10px] text-slate-500 uppercase font-mono font-bold">
                      PDF, JPG, PNG, OR WEBP (MAX 10MB)
                    </p>
                    <input
                      type="file"
                      accept="application/pdf,image/jpeg,image/png,image/webp"
                      aria-label="Choose optional 40-hour course certificate"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const validationError = validateDocumentFile(file, {
                            label: '40-hour certificate',
                          });
                          if (validationError) {
                            toast.error(validationError.message);
                            e.target.value = '';
                            return;
                          }
                          updateField('rbtCertFileName', file.name);
                          setFortyHourCertFile(file);
                          if (formData.courseCompleted !== 'Yes') {
                            updateField('courseCompleted', 'Yes');
                          }
                          setPreviewUrls((prev) => {
                            if (prev.fortyHourCert) URL.revokeObjectURL(prev.fortyHourCert);
                            return { ...prev, fortyHourCert: URL.createObjectURL(file) };
                          });
                          toast.success(`Attached 40-Hour cert: ${file.name}`);
                        }
                      }}
                      className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                    />
                  </div>
                )}
              </div>

            </div>
          </div>
        )}

        {/* STEP 6: REVIEW */}
        {currentStep === 6 && (
          <div className="space-y-5 animate-fade-in">
            <div className="space-y-1 border-b border-orange-100 pb-3">
              <h2 className="text-xl font-black text-slate-900 font-heading">Review &amp; Submit Application</h2>
              <p className="text-xs text-slate-600 font-bold">Please review your information before final submission.</p>
            </div>

            <div className="bg-orange-50/80 border-2 border-orange-200 rounded-3xl p-6 space-y-4 text-xs text-slate-900">
              <div className="grid grid-cols-2 gap-3 pb-3 border-b border-orange-200">
                <div>
                  <span className="font-mono text-[#F97316] uppercase font-bold block">Candidate Name:</span>
                  <span className="font-black text-slate-900 text-base">{formData.firstName} {formData.lastName}</span>
                </div>
                <div>
                  <span className="font-mono text-[#F97316] uppercase font-bold block">Contact Info:</span>
                  <span className="font-bold text-slate-900">{formData.email}</span>
                  <span className="block text-slate-600 font-bold">{formData.phoneNumber}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pb-3 border-b border-orange-200">
                <div>
                  <span className="font-mono text-[#F97316] uppercase font-bold block">40-Hr RBT Status:</span>
                  <span className="font-bold text-[#F97316]">{formData.courseCompleted || 'Not Specified'}</span>
                  {formData.rbtCertFileName ? (
                    <span className="block text-[10px] font-bold text-emerald-700 mt-1">
                      Cert attached: {formData.rbtCertFileName}
                    </span>
                  ) : (
                    <span className="block text-[10px] font-medium text-slate-500 mt-1">
                      No certificate uploaded — can complete later in portal
                    </span>
                  )}
                </div>
                <div>
                  <span className="font-mono text-[#F97316] uppercase font-bold block">Applicant Address:</span>
                  <span className="font-bold text-slate-900">{formData.addressLine1}, {formData.city} {formData.state} {formData.zipCode}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pb-3 border-b border-orange-200">
                <div>
                  <span className="font-mono text-[#F97316] uppercase font-bold block">Boroughs:</span>
                  <span className="font-bold text-slate-900">
                    {formData.boroughs.join(', ') || '—'}
                  </span>
                </div>
                <div>
                  <span className="font-mono text-[#F97316] uppercase font-bold block">Start / Hours:</span>
                  <span className="font-bold text-slate-900">
                    {formData.availableToStart || '—'} · {formData.weeklyHours || '—'}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pb-3 border-b border-orange-200">
                <div>
                  <span className="font-mono text-[#F97316] uppercase font-bold block">Availability:</span>
                  <span className="font-bold text-slate-900">
                    {formData.weekdays.concat(formData.weekends).join(', ') || '—'}
                  </span>
                </div>
                <div>
                  <span className="font-mono text-[#F97316] uppercase font-bold block">Transport / CPR:</span>
                  <span className="font-bold text-slate-900">
                    {formData.transportation || '—'} · {formData.cprStatus || 'CPR n/a'}
                  </span>
                </div>
              </div>

              <div>
                <span className="font-mono text-[#F97316] uppercase font-bold block">Documents:</span>
                <span className="font-bold text-slate-900">
                  Resume: {formData.resumeFileName || 'Missing'} · ID: {formData.idFileName || 'Missing'}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* FOOTER BUTTONS */}
      <div className="flex items-center justify-between pt-6 border-t border-orange-100">
        <button
          type="button"
          onClick={handlePrevStep}
          disabled={currentStep === 1 || isSubmitting}
          className={`px-5 py-2.5 rounded-xl text-xs font-extrabold flex items-center gap-2 border transition-all ${
            currentStep === 1
              ? 'opacity-40 cursor-not-allowed border-slate-200 text-slate-400'
              : 'border-slate-300 text-slate-800 hover:bg-slate-100 cursor-pointer shadow-sm'
          }`}
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>

        {currentStep < 6 ? (
          <button
            type="button"
            onClick={handleNextStep}
            suppressHydrationWarning
            className="bg-[#F97316] hover:bg-orange-600 text-white font-extrabold text-xs px-7 py-3 rounded-xl cursor-pointer shadow-lg shadow-orange-500/25 transition-all flex items-center gap-2"
          >
            Next <ArrowRight className="w-4 h-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            suppressHydrationWarning
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs px-8 py-3 rounded-xl cursor-pointer shadow-lg shadow-emerald-500/25 transition-all flex items-center gap-2"
          >
            {isSubmitting ? 'Submitting...' : 'Submit Application'} <CheckCircle2 className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* APPLICANT DOCUMENT PREVIEW MODAL */}
      {previewModal && (
        <div
          className="fixed inset-0 z-[999999] bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setPreviewModal(null);
          }}
        >
          <div
            ref={previewDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="applicant-document-preview-title"
            className="bg-zinc-950 border border-white/10 rounded-3xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden text-white relative"
          >
            <div className="p-4 border-b border-white/10 flex items-center justify-between bg-zinc-900">
              <div className="flex items-center gap-2.5">
                <FileText className="w-5 h-5 text-[#F97316]" aria-hidden="true" />
                <h3
                  id="applicant-document-preview-title"
                  className="font-extrabold text-white text-xs"
                >
                  {previewModal.name}
                </h3>
              </div>
              <button
                ref={previewCloseButtonRef}
                type="button"
                aria-label="Close document preview"
                onClick={() => setPreviewModal(null)}
                className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
              >
                <XCircle className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>
            <div className="flex-1 overflow-hidden p-0 bg-zinc-950 flex items-center justify-center min-h-[400px]">
              {previewModal.mimeType.startsWith('image/') ? (
                <img
                  src={previewModal.url}
                  alt={`Preview of ${previewModal.name}`}
                  className="max-w-full max-h-[600px] object-contain rounded-xl border border-white/10 shadow-lg"
                />
              ) : (
                <iframe
                  src={`${previewModal.url}#toolbar=0&navpanes=0`}
                  className="w-full h-[550px] rounded-xl border-0"
                  title={`Preview of ${previewModal.name}`}
                />
              )}
            </div>
            <div className="p-3.5 border-t border-white/10 bg-zinc-950 flex flex-wrap justify-end gap-2">
              <a
                href={previewModal.url}
                download={previewModal.name}
                className="px-4 py-2 rounded-xl bg-orange-500/15 hover:bg-orange-500/25 text-orange-300 text-xs font-bold transition-colors cursor-pointer border border-orange-400/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
              >
                Download copy
              </a>
              <button
                type="button"
                onClick={() => setPreviewModal(null)}
                className="px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-xs font-bold transition-colors cursor-pointer border border-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
