'use client';

import { useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  ExternalLink,
  FileCheck2,
  Loader2,
  Lock,
  Upload,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  HARASSMENT_QUIZ,
  HARASSMENT_QUIZ_PASS_PCT,
  pdfUrl,
  type OnboardingDocDef,
} from '@/lib/onboardingDocuments';
import {
  recordOnboardingDownload,
  submitHarassmentQuiz,
  uploadOnboardingFile,
} from '@/app/actions/onboardingSignatureActions';
import {
  getOnboardingDocumentStatus,
  validateDocumentFile,
} from '@/components/rbt/documentUx';

export function OfficialPdfBar({
  doc,
  onDownloaded,
}: {
  doc: OnboardingDocDef;
  onDownloaded?: () => void;
}) {
  if (doc.pdfs.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {doc.pdfs.map((pdf) => (
        <a
          key={pdf.file}
          href={pdfUrl(pdf.file)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Open ${pdf.label} in a new tab`}
          onClick={() => {
            void recordOnboardingDownload(doc.step).then(() => onDownloaded?.());
          }}
          className="group inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-800 shadow-sm transition-all duration-300 hover:scale-[1.01] hover:border-[#F97316]/50 hover:bg-orange-50 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2"
        >
          <Download className="h-3.5 w-3.5 text-[#F97316]" aria-hidden="true" />
          {pdf.label}
          <ExternalLink
            className="h-3 w-3 text-slate-400 transition-colors group-hover:text-[#F97316]"
            aria-hidden="true"
          />
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      ))}
    </div>
  );
}

export function OnboardingDocumentStatus({
  doc,
  complete,
}: {
  doc: OnboardingDocDef;
  complete: boolean;
}) {
  const label = getOnboardingDocumentStatus(doc.kind, complete);
  return (
    <span
      role="status"
      aria-label={`Document status: ${label}`}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] font-black uppercase tracking-wide ${
        complete
          ? 'border-emerald-300 bg-emerald-100 text-emerald-800'
          : 'border-amber-300 bg-amber-100 text-amber-900'
      }`}
    >
      {complete ? (
        <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
      ) : (
        <AlertCircle className="h-3 w-3" aria-hidden="true" />
      )}
      {label}
    </span>
  );
}

export function FillableDocumentPanel({
  doc,
  alreadyDone,
  onUploaded,
}: {
  doc: OnboardingDocDef;
  alreadyDone: boolean;
  onUploaded: (fileName: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const handleUpload = async (file: File | undefined) => {
    if (!file) return;
    const validationError = validateDocumentFile(file, {
      label: 'Completed form',
      pdfOnly: true,
    });
    if (validationError) {
      setUploadError(validationError.message);
      toast.error(validationError.message);
      return;
    }

    setPending(true);
    setUploadError(null);
    try {
      const form = new FormData();
      form.append('stepNumber', String(doc.step));
      form.append('file', file);
      const res = await uploadOnboardingFile(form);
      if (!res.success) {
        setUploadError(res.error);
        toast.error(res.error);
        return;
      }
      toast.success(`Uploaded ${res.data.fileName}`);
      onUploaded(res.data.fileName);
    } catch {
      const message = 'Upload failed. Check your connection and try again.';
      setUploadError(message);
      toast.error(message);
    } finally {
      setPending(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
        Download the blank form first, then fill it out and upload your completed copy below.
      </div>
      <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-slate-800">
        <p className="mb-2 font-black text-slate-900">How to Complete This Document</p>
        <ol className="list-decimal space-y-1 pl-5 text-[13px] leading-relaxed">
          <li>Download the PDF using the button below. This is a fillable PDF form.</li>
          <li>Open the PDF in a PDF viewer (Adobe Acrobat, Preview on Mac, Adobe Reader, or similar).</li>
          <li>Fill out all required fields directly in the PDF form.</li>
          <li>Save the filled PDF to your device.</li>
          <li>Upload your completed PDF using the upload button below.</li>
        </ol>
        <p className="mt-3 text-xs italic text-slate-600">
          Note: The PDF must be opened in a PDF viewer application (not just a web browser) to properly fill out the form fields.
        </p>
      </div>
      <OfficialPdfBar doc={doc} />
      {alreadyDone && (
        <div
          role="status"
          className="flex items-start gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-900"
        >
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            Completed form on file. Upload a replacement only if HR requested a correction.
          </span>
        </div>
      )}
      {uploadError && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-900"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{uploadError}</span>
        </div>
      )}
      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-slate-200" />
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">or</span>
        <div className="h-px flex-1 bg-slate-200" />
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        aria-label={`Choose completed ${doc.title} PDF`}
        className="hidden"
        onChange={(e) => void handleUpload(e.target.files?.[0])}
      />
      <button
        type="button"
        disabled={pending}
        onClick={() => inputRef.current?.click()}
        className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-[#F97316] px-4 py-2.5 text-sm font-bold text-white shadow-sm transition-all duration-300 hover:scale-[1.01] hover:bg-[#ea6a0c] hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <Upload className="h-4 w-4" aria-hidden="true" />
        )}
        {pending
          ? 'Uploading…'
          : alreadyDone
            ? 'Replace or resubmit filled PDF'
            : 'Upload filled PDF'}
      </button>
      <p className="text-xs text-slate-500">Maximum file size: 10MB</p>
    </div>
  );
}

export function UploadCertificatePanel({
  doc,
  alreadyDone,
  onUploaded,
}: {
  doc: OnboardingDocDef;
  alreadyDone: boolean;
  onUploaded: (fileName: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const documentLabel = doc.uploadLabel || doc.title;

  const selectFile = (nextFile: File | undefined) => {
    if (!nextFile) return;
    const validationError = validateDocumentFile(nextFile, { label: documentLabel });
    if (validationError) {
      setFile(null);
      setUploadError(validationError.message);
      if (inputRef.current) inputRef.current.value = '';
      toast.error(validationError.message);
      return;
    }
    setFile(nextFile);
    setUploadError(null);
  };

  const submit = async () => {
    if (!file) {
      const message = `Choose ${documentLabel.toLowerCase()} first.`;
      setUploadError(message);
      toast.error(message);
      return;
    }

    const validationError = validateDocumentFile(file, { label: documentLabel });
    if (validationError) {
      setUploadError(validationError.message);
      toast.error(validationError.message);
      return;
    }

    setPending(true);
    setUploadError(null);
    try {
      const form = new FormData();
      form.append('stepNumber', String(doc.step));
      form.append('file', file);
      const res = await uploadOnboardingFile(form);
      if (!res.success) {
        setUploadError(res.error);
        toast.error(res.error);
        return;
      }
      toast.success(`Uploaded ${res.data.fileName}`);
      onUploaded(res.data.fileName);
      setFile(null);
      if (inputRef.current) inputRef.current.value = '';
    } catch {
      const message = 'Upload failed. Check your connection and try again.';
      setUploadError(message);
      toast.error(message);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="space-y-4">
      <OfficialPdfBar doc={doc} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="text-base font-black text-slate-900">{documentLabel}</h4>
          <p className="text-xs text-slate-500">PDF, JPEG, PNG, or WebP — max 10MB</p>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] font-black uppercase tracking-wide ${
            alreadyDone
              ? 'border-emerald-300 bg-emerald-100 text-emerald-800'
              : 'border-amber-300 bg-amber-100 text-amber-900'
          }`}
        >
          {alreadyDone ? (
            <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
          ) : (
            <AlertCircle className="h-3 w-3" aria-hidden="true" />
          )}
          {alreadyDone ? 'On file' : 'Action required'}
        </span>
      </div>

      {alreadyDone && (
        <div
          role="status"
          className="flex items-start gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-900"
        >
          <FileCheck2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            Document received. You can upload a replacement or corrected copy without losing the
            completed status.
          </span>
        </div>
      )}

      {uploadError && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-900"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{uploadError}</span>
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-inner">
        <input
          ref={inputRef}
          type="file"
          accept={`${doc.uploadAccept || 'application/pdf,image/jpeg,image/png'},image/webp`}
          aria-label={`Choose ${documentLabel}`}
          className="hidden"
          onChange={(e) => selectFile(e.target.files?.[0])}
        />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <button
            type="button"
            disabled={pending}
            onClick={() => inputRef.current?.click()}
            className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#F97316] px-4 py-2.5 text-sm font-bold text-white shadow-sm transition-all duration-300 hover:scale-[1.01] hover:bg-[#ea6a0c] hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Upload className="h-4 w-4" aria-hidden="true" />
            {alreadyDone ? 'Choose replacement' : 'Choose file'}
          </button>
          <div className="min-w-0 flex-1" aria-live="polite">
            <p className="truncate text-sm font-bold text-slate-800">
              {file?.name || (alreadyDone ? 'Current document remains on file' : 'No file chosen')}
            </p>
            <p className="text-[11px] font-medium text-slate-500">
              {file
                ? `${Math.max(file.size / 1024 / 1024, 0.01).toFixed(2)}MB selected and ready`
                : alreadyDone
                  ? 'Select a file only when replacing or resubmitting'
                  : 'Select one supported file to continue'}
            </p>
          </div>
          {file && !pending && (
            <button
              type="button"
              onClick={() => {
                setFile(null);
                if (inputRef.current) inputRef.current.value = '';
              }}
              className="cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-600 transition-colors hover:border-rose-300 hover:text-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
            >
              Clear
            </button>
          )}
        </div>
      </div>
      <button
        type="button"
        disabled={!file || pending}
        onClick={() => void submit()}
        className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#F4A261] px-4 py-3 text-sm font-black text-white shadow-lg transition-all duration-300 hover:scale-[1.01] hover:bg-[#e7924e] hover:shadow-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100 sm:w-auto"
      >
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <Upload className="h-4 w-4" aria-hidden="true" />
        )}
        {pending
          ? 'Uploading…'
          : alreadyDone
            ? `Upload replacement ${documentLabel}`
            : `Upload ${documentLabel}`}
      </button>
    </div>
  );
}

export function WageNoticePendingPanel() {
  return (
    <div className="flex flex-col items-center justify-center space-y-3 py-10 text-center">
      <Lock className="h-10 w-10 text-slate-400" />
      <p className="text-lg font-black text-slate-800">Pending from HR.</p>
      <p className="max-w-md text-sm leading-relaxed text-slate-600">
        Your NYS Wage Notice (LS-54) is being prepared by the Rise &amp; Shine HR team. You&apos;ll be notified when it&apos;s ready for your review and signature.
      </p>
    </div>
  );
}

export function HarassmentQuizPanel({
  alreadyPassed,
  lastScore,
  lastAttempt,
  onResult,
}: {
  alreadyPassed: boolean;
  lastScore?: number | null;
  lastAttempt?: number | null;
  onResult: (passed: boolean, score: number, attempt: number) => void;
}) {
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(alreadyPassed ? false : Boolean(lastScore != null && lastScore < HARASSMENT_QUIZ_PASS_PCT));
  const [score, setScore] = useState(lastScore ?? null);
  const [attempt, setAttempt] = useState(lastAttempt ?? 0);

  const submit = async () => {
    if (Object.keys(answers).length < HARASSMENT_QUIZ.length) {
      toast.error('Answer every question before submitting.');
      return;
    }
    setPending(true);
    const res = await submitHarassmentQuiz(answers);
    setPending(false);
    if (!res.success) {
      toast.error(res.error);
      return;
    }
    setScore(res.data.score);
    setAttempt(res.data.attempt);
    setFailed(!res.data.passed);
    onResult(res.data.passed, res.data.score, res.data.attempt);
    if (res.data.passed) {
      toast.success(`Quiz passed — ${res.data.score}%`);
    }
  };

  if (alreadyPassed) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-900">
        Quiz passed{score != null ? ` — ${score}%` : ''}
        {attempt ? ` · attempt #${attempt}` : ''}. You may continue after confirming.
      </div>
    );
  }

  if (failed && score != null) {
    return (
      <div className="space-y-4">
        <p className="text-lg font-black text-red-600">Quiz not passed</p>
        <p className="text-sm text-slate-800">
          Your score: <strong>{score}%</strong> ({Math.round((score / 100) * 10)}/10 correct)
          {attempt ? ` — attempt #${attempt}.` : '.'}
        </p>
        <p className="text-sm text-slate-700">
          You need <strong>{HARASSMENT_QUIZ_PASS_PCT}%</strong> (8/10) or higher to pass.
        </p>
        <p className="text-sm text-slate-600">Review the training material if needed, then retake the quiz when you are ready.</p>
        <button
          type="button"
          onClick={() => {
            setFailed(false);
            setAnswers({});
          }}
          className="cursor-pointer rounded-xl bg-[#F97316] px-4 py-2.5 text-sm font-bold text-white"
        >
          Retake Quiz
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <p className="text-sm font-bold text-slate-800">Quiz — {HARASSMENT_QUIZ_PASS_PCT}% required (8/10)</p>
      {HARASSMENT_QUIZ.map((q) => (
        <fieldset key={q.id} className="space-y-2 border-t border-slate-200 pt-4">
          <legend className="text-sm font-semibold text-slate-900">
            {q.id}. {q.prompt}
          </legend>
          {q.options.map((opt, idx) => (
            <label key={opt} className="flex cursor-pointer items-start gap-2 text-sm text-slate-700">
              <input
                type="radio"
                name={`q-${q.id}`}
                checked={answers[String(q.id)] === idx}
                onChange={() => setAnswers((prev) => ({ ...prev, [String(q.id)]: idx }))}
                className="mt-1 cursor-pointer"
              />
              <span>{opt}</span>
            </label>
          ))}
        </fieldset>
      ))}
      <button
        type="button"
        disabled={pending}
        onClick={() => void submit()}
        className="cursor-pointer rounded-xl bg-[#F97316] px-4 py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? 'Submitting…' : 'Submit quiz'}
      </button>
    </div>
  );
}
