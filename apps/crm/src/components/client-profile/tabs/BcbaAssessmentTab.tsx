'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Database,
  LockKeyhole,
  PackageCheck,
  ShieldCheck,
} from 'lucide-react';
import { scheduleAssessment } from '@/app/(dashboard)/portal-case/actions/clinical-support';
import {
  CLINIC_TIME_ZONE,
  clinicWallClock,
  clinicWallClockToUtc,
} from '@/lib/clinicTimezone';
import { statusIndex } from '@/lib/clientStatusGates';

type BcbaAssessmentClient = {
  id: string;
  status: string;
  bcbaId: string | null;
  treatmentPlan?: unknown;
};

type AssessmentPhase = 'locked' | 'ready' | 'scheduled' | 'reconcile';

export type AssessmentState = {
  phase: AssessmentPhase;
  canSchedule: boolean;
  assessmentAt: Date | null;
  dateIssue: 'missing' | 'invalid' | null;
  hasReachedAssessmentStage: boolean;
};

const ASSESSMENT_SCHEDULED_INDEX = statusIndex('ASSESSMENT_SCHEDULED');
const DATETIME_LOCAL_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

const assessmentDateFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: CLINIC_TIME_ZONE,
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZoneName: 'short',
});

function readTreatmentPlan(raw: unknown): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try {
      const parsed: unknown = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }
  return typeof raw === 'object' && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {};
}

export function deriveAssessmentState(
  client: Pick<BcbaAssessmentClient, 'status' | 'treatmentPlan'>
): AssessmentState {
  const plan = readTreatmentPlan(client.treatmentPlan);
  const rawAssessmentAt = plan.assessmentScheduledAt;
  const hasSavedDateValue =
    rawAssessmentAt !== null &&
    rawAssessmentAt !== undefined &&
    String(rawAssessmentAt).trim().length > 0;

  let assessmentAt: Date | null = null;
  if (
    hasSavedDateValue &&
    (typeof rawAssessmentAt === 'string' || rawAssessmentAt instanceof Date)
  ) {
    const candidate =
      rawAssessmentAt instanceof Date
        ? new Date(rawAssessmentAt.getTime())
        : new Date(rawAssessmentAt);
    if (!Number.isNaN(candidate.getTime())) assessmentAt = candidate;
  }

  const currentStatusIndex = statusIndex(client.status);
  const hasReachedAssessmentStage =
    currentStatusIndex >= ASSESSMENT_SCHEDULED_INDEX;
  const dateIssue = hasSavedDateValue && !assessmentAt
    ? 'invalid'
    : hasReachedAssessmentStage && !assessmentAt
      ? 'missing'
      : null;

  if (dateIssue || (assessmentAt && !hasReachedAssessmentStage)) {
    return {
      phase: 'reconcile',
      canSchedule: false,
      assessmentAt,
      dateIssue,
      hasReachedAssessmentStage,
    };
  }

  if (assessmentAt && hasReachedAssessmentStage) {
    return {
      phase: 'scheduled',
      canSchedule: false,
      assessmentAt,
      dateIssue: null,
      hasReachedAssessmentStage,
    };
  }

  if (client.status === 'PA_APPROVED') {
    return {
      phase: 'ready',
      canSchedule: true,
      assessmentAt: null,
      dateIssue: null,
      hasReachedAssessmentStage: false,
    };
  }

  return {
    phase: 'locked',
    canSchedule: false,
    assessmentAt: null,
    dateIssue: null,
    hasReachedAssessmentStage,
  };
}

export function formatAssessmentDateEt(date: Date): string | null {
  return Number.isNaN(date.getTime()) ? null : assessmentDateFormatter.format(date);
}

export function validateAssessmentSchedule(
  dateTimeLocal: string,
  materialsConfirmed: boolean,
  now = new Date()
): string | null {
  if (!dateTimeLocal.trim()) return 'Choose an assessment date and time.';

  const match = DATETIME_LOCAL_PATTERN.exec(dateTimeLocal.trim());
  const parsed = clinicWallClockToUtc(dateTimeLocal);
  if (!match || !parsed) {
    return 'Choose a valid ET date and time. Times skipped during daylight saving are unavailable.';
  }

  const [, year, month, day, hour, minute, second = '0'] = match;
  const wallClock = clinicWallClock(parsed);
  const roundTripsExactly =
    wallClock.year === Number(year) &&
    wallClock.month === Number(month) &&
    wallClock.day === Number(day) &&
    wallClock.hour === Number(hour) &&
    wallClock.minute === Number(minute) &&
    wallClock.second === Number(second);

  if (!roundTripsExactly) {
    return 'Choose a valid ET date and time. Times skipped during daylight saving are unavailable.';
  }
  if (parsed.getTime() <= now.getTime()) {
    return 'Assessment date and time must be in the future.';
  }
  if (!materialsConfirmed) {
    return 'Confirm that the requested assessment materials and forms are prepared.';
  }
  return null;
}

function minimumClinicDateTime(now = new Date()): string {
  const nextMinute = new Date(now.getTime() + 60_000);
  const wallClock = clinicWallClock(nextMinute);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${wallClock.year}-${pad(wallClock.month)}-${pad(wallClock.day)}T${pad(
    wallClock.hour
  )}:${pad(wallClock.minute)}`;
}

function readableStatus(status: string): string {
  return status ? status.replaceAll('_', ' ') : 'UNKNOWN';
}

export default function BcbaAssessmentTab({
  client,
}: {
  client: BcbaAssessmentClient;
}) {
  const router = useRouter();
  const assessmentState = deriveAssessmentState(client);
  const minimumDateTime = useMemo(() => minimumClinicDateTime(), []);
  const [scheduledDate, setScheduledDate] = useState('');
  const [materialsConfirmed, setMaterialsConfirmed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [didSubmit, setDidSubmit] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [submitFeedback, setSubmitFeedback] = useState<{
    kind: 'error' | 'success';
    message: string;
  } | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!assessmentState.canSchedule || isSubmitting || didSubmit) return;

    const error = validateAssessmentSchedule(scheduledDate, materialsConfirmed);
    if (error) {
      setValidationError(error);
      setSubmitFeedback(null);
      return;
    }

    if (!client.id) {
      setSubmitFeedback({
        kind: 'error',
        message: 'This client record is missing its identifier. The assessment was not scheduled.',
      });
      return;
    }

    setValidationError(null);
    setSubmitFeedback(null);
    setIsSubmitting(true);

    try {
      // Preserve the timezone-less browser value. The action interprets it as
      // America/New_York wall-clock time and persists the corresponding instant.
      const result = await scheduleAssessment({
        clientId: client.id,
        date: scheduledDate,
        expectedClientStatus: client.status,
        expectedBcbaId: client.bcbaId,
        reason: 'BCBA assessment scheduled from client profile',
      });
      if (!result.success) {
        setSubmitFeedback({
          kind: 'error',
          message: result.error || 'The assessment could not be scheduled.',
        });
        return;
      }

      setDidSubmit(true);
      setSubmitFeedback({
        kind: 'success',
        message: 'Assessment scheduled. Refreshing the saved ET appointment…',
      });
      router.refresh();
    } catch {
      setSubmitFeedback({
        kind: 'error',
        message: 'The assessment could not be scheduled. No completion was recorded.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const statusLabel = readableStatus(client.status);
  const formattedAssessmentAt = assessmentState.assessmentAt
    ? formatAssessmentDateEt(assessmentState.assessmentAt)
    : null;

  const badge = {
    locked: {
      label: 'Locked',
      className: 'border-zinc-500/25 bg-zinc-500/10 text-zinc-300',
    },
    ready: {
      label: 'Ready to schedule',
      className: 'border-cyan-400/25 bg-cyan-400/10 text-cyan-300',
    },
    scheduled: {
      label: 'Scheduled',
      className: 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300',
    },
    reconcile: {
      label: 'Needs reconciliation',
      className: 'border-amber-400/25 bg-amber-400/10 text-amber-300',
    },
  }[assessmentState.phase];

  return (
    <div className="max-w-4xl space-y-6">
      <Card className="group relative w-full overflow-hidden border-white/10 bg-zinc-950/80 shadow-2xl shadow-black/30 backdrop-blur-xl">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-48 bg-[radial-gradient(circle_at_18%_0%,rgba(249,115,22,0.16),transparent_58%)]"
        />

        <CardHeader className="relative border-b border-white/5 px-6 py-6 sm:px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-orange-400/20 bg-orange-400/10 shadow-lg shadow-orange-950/30">
                  <CalendarClock className="h-5 w-5 text-orange-300" aria-hidden="true" />
                </span>
                <CardTitle className="text-xl text-white">
                  Assessment scheduling &amp; prep
                </CardTitle>
              </div>
              <p className="max-w-2xl text-sm leading-6 text-zinc-400">
                Confirm the preflight materials, then create the durable 97151 assessment
                appointment in the clinic&apos;s Eastern Time.
              </p>
            </div>

            <span
              className={`inline-flex w-fit items-center rounded-full border px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.12em] ${badge.className}`}
            >
              {badge.label}
            </span>
          </div>
        </CardHeader>

        <CardContent className="relative p-6 sm:p-8">
          <div className="mb-6 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-white/8 bg-white/[0.025] px-4 py-3">
              <div className="mb-1 flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-zinc-500">
                <Database className="h-3.5 w-3.5" aria-hidden="true" />
                Pipeline status
              </div>
              <p className="text-sm font-semibold text-zinc-200">{statusLabel}</p>
            </div>
            <div className="rounded-xl border border-white/8 bg-white/[0.025] px-4 py-3">
              <div className="mb-1 flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-zinc-500">
                <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
                Scheduling timezone
              </div>
              <p className="text-sm font-semibold text-zinc-200">Eastern Time (ET)</p>
            </div>
          </div>

          {assessmentState.phase === 'scheduled' &&
            assessmentState.assessmentAt &&
            formattedAssessmentAt && (
              <section
                aria-labelledby="assessment-scheduled-title"
                className="overflow-hidden rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.055] shadow-xl shadow-emerald-950/20"
              >
                <div className="flex items-start gap-4 p-5 sm:p-6">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-emerald-400/25 bg-emerald-400/10">
                    <CheckCircle2 className="h-5 w-5 text-emerald-300" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <h4
                      id="assessment-scheduled-title"
                      className="font-heading text-lg font-semibold text-white"
                    >
                      Saved assessment appointment
                    </h4>
                    <time
                      dateTime={assessmentState.assessmentAt.toISOString()}
                      className="mt-2 block text-base font-semibold text-emerald-200"
                    >
                      {formattedAssessmentAt}
                    </time>
                    <p className="mt-2 text-sm leading-6 text-zinc-400">
                      This time comes from the persisted assessment schedule and is rendered in
                      ET. Materials are not shown as complete because no separate checklist
                      completion is stored.
                    </p>
                  </div>
                </div>
              </section>
            )}

          {assessmentState.phase === 'reconcile' && (
            <section
              aria-labelledby="assessment-reconcile-title"
              className="rounded-2xl border border-amber-400/20 bg-amber-400/[0.055] p-5 shadow-xl shadow-amber-950/20 sm:p-6"
            >
              <div className="flex items-start gap-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-amber-400/25 bg-amber-400/10">
                  <AlertTriangle className="h-5 w-5 text-amber-300" aria-hidden="true" />
                </span>
                <div>
                  <h4
                    id="assessment-reconcile-title"
                    className="font-heading text-lg font-semibold text-white"
                  >
                    Schedule data needs reconciliation
                  </h4>
                  <p className="mt-2 text-sm leading-6 text-zinc-300">
                    {assessmentState.dateIssue === 'invalid'
                      ? 'The saved assessment date cannot be read as a valid instant.'
                      : assessmentState.dateIssue === 'missing'
                        ? `The pipeline is ${statusLabel}, but no persisted assessment date is available.`
                        : `A persisted assessment date exists, but the pipeline remains ${statusLabel}.`}
                  </p>
                  {formattedAssessmentAt && assessmentState.assessmentAt && (
                    <p className="mt-3 font-mono text-xs text-amber-200">
                      Saved date:{' '}
                      <time dateTime={assessmentState.assessmentAt.toISOString()}>
                        {formattedAssessmentAt}
                      </time>
                    </p>
                  )}
                  <p className="mt-3 text-xs leading-5 text-zinc-500">
                    This screen will not infer a scheduled appointment, auto-complete prep, or
                    create a duplicate event. Clinical Support should reconcile the client record.
                  </p>
                </div>
              </div>
            </section>
          )}

          {assessmentState.phase === 'locked' && (
            <section
              aria-labelledby="assessment-locked-title"
              className="rounded-2xl border border-white/10 bg-zinc-900/55 p-8 text-center shadow-inner shadow-black/30"
            >
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-zinc-950/80">
                <LockKeyhole className="h-5 w-5 text-zinc-400" aria-hidden="true" />
              </span>
              <h4
                id="assessment-locked-title"
                className="mt-4 font-heading text-lg font-semibold text-white"
              >
                Scheduling is not available yet
              </h4>
              <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-zinc-400">
                Assessment scheduling unlocks only after the Assessment PA is approved. The
                current pipeline status is{' '}
                <span className="font-semibold text-zinc-200">{statusLabel}</span>.
              </p>
            </section>
          )}

          {assessmentState.phase === 'ready' && (
            <form
              aria-busy={isSubmitting}
              aria-labelledby="assessment-form-title"
              className="space-y-5"
              noValidate
              onSubmit={handleSubmit}
            >
              <div className="rounded-2xl border border-white/10 bg-zinc-900/65 p-5 shadow-xl shadow-black/20 sm:p-6">
                <div className="mb-5 flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-400/10">
                    <ShieldCheck className="h-4 w-4 text-cyan-300" aria-hidden="true" />
                  </span>
                  <div>
                    <h4
                      id="assessment-form-title"
                      className="font-heading text-lg font-semibold text-white"
                    >
                      Create the 97151 appointment
                    </h4>
                    <p className="mt-1 text-sm leading-6 text-zinc-400">
                      A successful submission saves the ET date, creates a scheduled assessment
                      session, and advances the pipeline to Assessment Scheduled.
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label
                      htmlFor="assessment-scheduled-at"
                      className="text-xs font-bold uppercase tracking-[0.08em] text-zinc-300"
                    >
                      Assessment date &amp; time <span className="text-orange-300">*</span>
                    </label>
                    <span className="rounded-md border border-cyan-400/15 bg-cyan-400/[0.07] px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-cyan-300">
                      Eastern Time
                    </span>
                  </div>
                  <input
                    id="assessment-scheduled-at"
                    name="assessmentScheduledAt"
                    type="datetime-local"
                    value={scheduledDate}
                    min={minimumDateTime}
                    required
                    autoComplete="off"
                    disabled={isSubmitting || didSubmit}
                    aria-invalid={Boolean(validationError)}
                    aria-describedby={`assessment-time-help${validationError ? ' assessment-validation-error' : ''}`}
                    onChange={(event) => {
                      setScheduledDate(event.target.value);
                      setValidationError(null);
                      setSubmitFeedback(null);
                    }}
                    className="h-12 w-full cursor-pointer rounded-xl border border-white/10 bg-zinc-950/90 px-4 text-sm text-white outline-none [color-scheme:dark] transition-all duration-300 hover:border-white/20 focus:border-orange-400/60 focus:ring-2 focus:ring-orange-400/15 disabled:cursor-not-allowed disabled:opacity-60"
                  />
                  <p
                    id="assessment-time-help"
                    className="flex items-center gap-2 text-xs leading-5 text-zinc-500"
                  >
                    <Clock3 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    Enter the clinic wall-clock time in ET. The saved appointment will retain
                    the correct EST or EDT offset.
                  </p>
                </div>

                <div className="mt-5 rounded-xl border border-white/8 bg-zinc-950/60 p-4">
                  <div className="flex items-start gap-3">
                    <input
                      id="assessment-materials-confirmed"
                      name="materialsConfirmed"
                      type="checkbox"
                      checked={materialsConfirmed}
                      required
                      disabled={isSubmitting || didSubmit}
                      aria-invalid={Boolean(validationError)}
                      aria-describedby={`assessment-materials-help${validationError ? ' assessment-validation-error' : ''}`}
                      onChange={(event) => {
                        setMaterialsConfirmed(event.target.checked);
                        setValidationError(null);
                        setSubmitFeedback(null);
                      }}
                      className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-zinc-600 bg-zinc-900 text-orange-500 focus:ring-2 focus:ring-orange-400/40 focus:ring-offset-2 focus:ring-offset-zinc-950 disabled:cursor-not-allowed"
                    />
                    <div>
                      <label
                        htmlFor="assessment-materials-confirmed"
                        className="cursor-pointer text-sm font-semibold text-zinc-200"
                      >
                        I confirm the requested assessment materials and forms are prepared.
                      </label>
                      <p
                        id="assessment-materials-help"
                        className="mt-1 text-xs leading-5 text-zinc-500"
                      >
                        Required for this submission. This is a session-only acknowledgment;
                        RAS does not store a separate materials-complete field, so it is never
                        auto-checked from pipeline progress.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {validationError && (
                <div
                  id="assessment-validation-error"
                  role="alert"
                  className="flex items-start gap-3 rounded-xl border border-red-400/20 bg-red-400/[0.07] px-4 py-3 text-sm text-red-200"
                >
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{validationError}</span>
                </div>
              )}

              {submitFeedback && (
                <div
                  role={submitFeedback.kind === 'error' ? 'alert' : 'status'}
                  aria-live={submitFeedback.kind === 'error' ? 'assertive' : 'polite'}
                  className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${
                    submitFeedback.kind === 'error'
                      ? 'border-red-400/20 bg-red-400/[0.07] text-red-200'
                      : 'border-emerald-400/20 bg-emerald-400/[0.07] text-emerald-200'
                  }`}
                >
                  {submitFeedback.kind === 'error' ? (
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  ) : (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  )}
                  <span>{submitFeedback.message}</span>
                </div>
              )}

              {isSubmitting && (
                <p role="status" aria-live="polite" className="sr-only">
                  Scheduling the assessment in Eastern Time.
                </p>
              )}

              <div className="flex flex-col gap-3 border-t border-white/5 pt-5 sm:flex-row sm:items-center sm:justify-between">
                <p className="flex items-center gap-2 text-xs text-zinc-500">
                  <PackageCheck className="h-4 w-4 text-orange-300" aria-hidden="true" />
                  Both required inputs must be confirmed before submission.
                </p>
                <Button
                  type="submit"
                  variant="primary"
                  isLoading={isSubmitting}
                  disabled={
                    !scheduledDate ||
                    !materialsConfirmed ||
                    isSubmitting ||
                    didSubmit
                  }
                  className="cursor-pointer bg-orange-600 px-5 text-white shadow-lg shadow-orange-950/30 hover:bg-orange-500 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? 'Scheduling…' : didSubmit ? 'Scheduled' : 'Confirm & schedule'}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
