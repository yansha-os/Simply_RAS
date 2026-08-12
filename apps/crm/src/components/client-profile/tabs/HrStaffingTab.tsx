'use client';

import { useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  Briefcase,
  Calendar,
  CheckCircle2,
  Clock,
  ExternalLink,
  RefreshCw,
  UserCheck,
  UserPlus,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import StaffingReadinessChecklist from '@/components/portal-case-coord/StaffingReadinessChecklist';
import { resolveNotificationLink } from '@/lib/notificationLinks';
import type { StaffingReadinessClient } from '@/lib/staffingReadiness';

type StaffSummary = {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
};

type CaseApplicationSummary = {
  id: string;
  status?: string | null;
  rbt?: StaffSummary | null;
};

type CaseOpeningSummary = {
  id: string;
  caseCode?: string | null;
  status?: string | null;
  updatedAt?: string | Date | null;
  applications?: CaseApplicationSummary[] | null;
};

type StaffingIntegrityClient = Omit<StaffingReadinessClient, 'caseOpenings'> & {
  id: string;
  bcba?: StaffSummary | null;
  rbt?: StaffSummary | null;
  intakePacket?: { formData?: unknown } | null;
  caseOpenings?: CaseOpeningSummary[] | null;
};

type IntegrityIssue = {
  id: string;
  severity: 'error' | 'warning';
  message: string;
};

const IN_FLIGHT_APPLICATION_STATUSES = new Set([
  'APPLIED',
  'MESSAGING',
  'MEET_SCHEDULED',
  'PARENT_PENDING',
]);

const HRM_ATS_HREF = resolveNotificationLink('/ats').href;
const HRM_JOB_BOARD_HREF = resolveNotificationLink('/rbt/job-board').href;

function parseRecord(raw: unknown, label: string) {
  if (raw == null || raw === '') {
    return { value: {} as Record<string, unknown>, error: null as string | null };
  }

  let parsed = raw;
  for (let depth = 0; depth < 2 && typeof parsed === 'string'; depth += 1) {
    const value = parsed.trim();
    if (!value) {
      return { value: {} as Record<string, unknown>, error: null as string | null };
    }
    try {
      parsed = JSON.parse(value);
    } catch {
      return {
        value: {} as Record<string, unknown>,
        error: `${label} is malformed and could not be displayed.`,
      };
    }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      value: {} as Record<string, unknown>,
      error: `${label} is not stored as a valid object.`,
    };
  }

  return { value: parsed as Record<string, unknown>, error: null as string | null };
}

function textValue(record: Record<string, unknown>, key: string) {
  const value = record[key];
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

function staffName(staff?: StaffSummary | null) {
  if (!staff) return null;
  return [staff.firstName, staff.lastName].filter(Boolean).join(' ').trim() || null;
}

function openingTimestamp(value?: string | Date | null) {
  if (!value) return 0;
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function displayHref(href: string) {
  return href.replace(/^https?:\/\//i, '');
}

function openingTone(status?: string | null) {
  if (status === 'OPEN') return 'border-green-500/25 bg-green-500/10 text-green-300';
  if (status === 'FILLED') return 'border-sky-500/25 bg-sky-500/10 text-sky-300';
  return 'border-zinc-500/25 bg-zinc-500/10 text-zinc-400';
}

export default function StaffingIntegrityTab({
  client,
}: {
  client: StaffingIntegrityClient;
}) {
  const router = useRouter();
  const [isRefreshing, startRefresh] = useTransition();
  const treatmentPlan = parseRecord(client.treatmentPlan, 'Treatment plan');
  const staffingPreferences = parseRecord(
    treatmentPlan.value.staffingPreferences,
    'Staffing preferences'
  );
  const intakeForm = parseRecord(client.intakePacket?.formData, 'Intake schedule');

  const preferenceFields = [
    { label: 'Preferred gender', value: textValue(staffingPreferences.value, 'gender') },
    { label: 'Preferred language', value: textValue(staffingPreferences.value, 'language') },
    { label: 'Race / ethnicity', value: textValue(staffingPreferences.value, 'race') },
    { label: 'Age preference', value: textValue(staffingPreferences.value, 'age') },
  ];

  const openingPayload = client.caseOpenings;
  const openingsLoaded = Array.isArray(openingPayload);
  const openings: CaseOpeningSummary[] = Array.isArray(openingPayload)
    ? [...openingPayload].sort(
        (left, right) => openingTimestamp(right.updatedAt) - openingTimestamp(left.updatedAt)
      )
    : [];
  const applicationsLoaded = openings.every((opening) => Array.isArray(opening.applications));
  const openOpening = openings.find((opening) => opening.status === 'OPEN') ?? null;
  const filledOpening = openings.find((opening) => opening.status === 'FILLED') ?? null;
  const currentOpening = openOpening ?? filledOpening ?? openings[0] ?? null;
  const currentApplications = currentOpening?.applications ?? [];
  const allApplications = openings.flatMap((opening) => opening.applications ?? []);
  const approvedForAssignedRbt =
    allApplications.find(
      (application) =>
        application.status === 'APPROVED' &&
        Boolean(client.rbtId) &&
        application.rbt?.id === client.rbtId
    ) ?? null;
  const filledApprovedApplication =
    filledOpening?.applications?.find((application) => application.status === 'APPROVED') ?? null;
  const inFlightApplicationCount = currentApplications.filter((application) =>
    IN_FLIGHT_APPLICATION_STATUSES.has(application.status ?? '')
  ).length;
  const newApplicationCount = currentApplications.filter(
    (application) => application.status === 'APPLIED'
  ).length;

  const integrityIssues: IntegrityIssue[] = [];
  if (!openingsLoaded) {
    integrityIssues.push({
      id: 'openings-not-loaded',
      severity: 'error',
      message: 'Case-opening history was not loaded, so job-board readiness cannot be verified.',
    });
  } else if (!applicationsLoaded) {
    integrityIssues.push({
      id: 'applications-not-loaded',
      severity: 'error',
      message: 'One or more case openings are missing application history.',
    });
  }
  if (treatmentPlan.error) {
    integrityIssues.push({
      id: 'treatment-plan-parse',
      severity: 'warning',
      message: treatmentPlan.error,
    });
  }
  if (staffingPreferences.error) {
    integrityIssues.push({
      id: 'staffing-preferences-parse',
      severity: 'warning',
      message: staffingPreferences.error,
    });
  }
  if (intakeForm.error) {
    integrityIssues.push({
      id: 'intake-form-parse',
      severity: 'warning',
      message: intakeForm.error,
    });
  }
  if (client.bcbaId && !client.bcba) {
    integrityIssues.push({
      id: 'bcba-relation-missing',
      severity: 'error',
      message: 'A BCBA assignment ID exists, but its staff record could not be resolved.',
    });
  } else if (client.bcbaId && client.bcba?.id !== client.bcbaId) {
    integrityIssues.push({
      id: 'bcba-relation-mismatch',
      severity: 'error',
      message: 'The loaded BCBA record does not match Client.bcbaId.',
    });
  }
  if (client.rbtId && !client.rbt) {
    integrityIssues.push({
      id: 'rbt-relation-missing',
      severity: 'error',
      message: 'An RBT assignment ID exists, but its staff record could not be resolved.',
    });
  } else if (client.rbtId && client.rbt?.id !== client.rbtId) {
    integrityIssues.push({
      id: 'rbt-relation-mismatch',
      severity: 'error',
      message: 'The loaded RBT record does not match Client.rbtId.',
    });
  }
  if (client.rbtApproved && !client.rbtId) {
    integrityIssues.push({
      id: 'approval-without-rbt',
      severity: 'error',
      message: 'The parent-approval flag is set without an assigned RBT.',
    });
  }
  if (filledOpening && applicationsLoaded && !filledApprovedApplication) {
    integrityIssues.push({
      id: 'filled-without-approved-application',
      severity: 'error',
      message: `${filledOpening.caseCode || 'The latest filled opening'} is FILLED without an APPROVED application.`,
    });
  }
  if (
    filledApprovedApplication?.rbt?.id &&
    client.rbtId &&
    filledApprovedApplication.rbt.id !== client.rbtId
  ) {
    integrityIssues.push({
      id: 'filled-rbt-mismatch',
      severity: 'error',
      message: `${filledOpening?.caseCode || 'The filled opening'} approves a different RBT than the client assignment.`,
    });
  }
  if (
    client.rbtApproved &&
    client.rbtId &&
    openingsLoaded &&
    applicationsLoaded &&
    !approvedForAssignedRbt
  ) {
    integrityIssues.push({
      id: 'approved-without-application',
      severity: 'warning',
      message: 'The assigned RBT is marked parent-approved, but no matching APPROVED job-board application is on file.',
    });
  }
  if (approvedForAssignedRbt && !client.rbtApproved) {
    integrityIssues.push({
      id: 'application-approved-flag-missing',
      severity: 'error',
      message: 'A matching application is APPROVED, but Client.rbtApproved is not set.',
    });
  }
  if (openOpening && client.rbtApproved && client.rbtId) {
    integrityIssues.push({
      id: 'open-listing-after-assignment',
      severity: 'warning',
      message: `${openOpening.caseCode || 'An opening'} is still OPEN while an approved RBT is assigned; confirm this is an intentional replacement search.`,
    });
  }

  const bcbaLabel =
    staffName(client.bcba) ?? (client.bcbaId ? 'Assigned staff record unavailable' : 'Not assigned');
  const rbtLabel =
    staffName(client.rbt) ??
    (client.rbtId
      ? 'Assigned staff record unavailable'
      : openOpening
        ? `Recruiting through ${openOpening.caseCode || 'the live opening'}`
        : 'Not assigned');
  const rbtState =
    client.rbtId && client.rbtApproved
      ? 'Parent approved'
      : client.rbtId
        ? 'Approval pending'
        : openOpening
          ? 'Recruiting'
          : 'Unassigned';
  const crmCaseCoordHref = `/client/${encodeURIComponent(client.id)}?mode=case-coord&tab=staffing`;
  const hasIntegrityErrors = integrityIssues.some((issue) => issue.severity === 'error');
  const refreshSnapshot = () => {
    startRefresh(() => {
      router.refresh();
    });
  };

  return (
    <div className="space-y-6">
      <Card className="relative w-full overflow-hidden border-white/10 bg-zinc-950/85 shadow-2xl backdrop-blur-xl">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-brand-orange-500/10 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-24 left-1/3 h-56 w-56 rounded-full bg-cyan-500/10 blur-3xl"
        />

        <CardHeader className="relative border-b border-white/5 pb-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-3 font-heading text-xl text-white">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-brand-orange-500/25 bg-brand-orange-500/10 shadow-lg shadow-brand-orange-500/10">
                  <UserCheck className="h-5 w-5 text-brand-orange-400" aria-hidden />
                </span>
                Staffing integrity
              </CardTitle>
              <p className="mt-2 max-w-3xl text-sm leading-relaxed text-zinc-400">
                Read-only server snapshot. Clinical assigns the BCBA; Case Coordination publishes and
                fills the opening; HRM owns ATS and the RBT applicant experience.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-zinc-300">
                {client.status?.replace(/_/g, ' ') || 'Status unavailable'}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-green-500/20 bg-green-500/10 px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-green-300">
                <span className="dot-live" aria-hidden />
                Server fetched
              </span>
              <button
                type="button"
                onClick={refreshSnapshot}
                disabled={isRefreshing}
                aria-busy={isRefreshing}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-zinc-300 transition-all duration-300 hover:border-brand-orange-500/40 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RefreshCw
                  className={`h-3 w-3 ${isRefreshing ? 'animate-spin text-brand-orange-300' : ''}`}
                  aria-hidden
                />
                {isRefreshing ? 'Refreshing' : 'Refresh'}
              </button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="relative space-y-6 pt-6">
          <StaffingReadinessChecklist client={client} compact />

          {integrityIssues.length > 0 && (
            <section
              aria-labelledby="staffing-integrity-alerts"
              aria-live="polite"
              className={`rounded-2xl border p-4 ${
                hasIntegrityErrors
                  ? 'border-red-500/25 bg-red-500/[0.08]'
                  : 'border-amber-500/25 bg-amber-500/[0.08]'
              }`}
            >
              <div className="flex items-start gap-3">
                <AlertCircle
                  className={`mt-0.5 h-5 w-5 shrink-0 ${
                    hasIntegrityErrors ? 'text-red-300' : 'text-amber-300'
                  }`}
                  aria-hidden
                />
                <div>
                  <h3
                    id="staffing-integrity-alerts"
                    className={`font-heading text-sm font-semibold ${
                      hasIntegrityErrors ? 'text-red-200' : 'text-amber-200'
                    }`}
                  >
                    {hasIntegrityErrors ? 'Staffing data needs attention' : 'Staffing data warning'}
                  </h3>
                  <ul className="mt-2 space-y-1.5">
                    {integrityIssues.map((issue) => (
                      <li
                        key={issue.id}
                        className={`flex items-start gap-2 text-xs leading-relaxed ${
                          issue.severity === 'error' ? 'text-red-200/90' : 'text-amber-200/90'
                        }`}
                      >
                        <span
                          className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                            issue.severity === 'error' ? 'bg-red-400' : 'bg-amber-400'
                          }`}
                          aria-hidden
                        />
                        {issue.message}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </section>
          )}

          <div className="grid gap-6 xl:grid-cols-2">
            <div className="space-y-6">
              <section
                aria-labelledby="staffing-preferences-heading"
                className="rounded-3xl border border-white/10 bg-zinc-900/50 p-5 shadow-xl backdrop-blur-xl"
              >
                <h3
                  id="staffing-preferences-heading"
                  className="flex items-center border-b border-white/5 pb-3 font-heading font-semibold text-white"
                >
                  <UserPlus className="mr-2 h-4 w-4 text-brand-orange-400" aria-hidden />
                  Staffing preferences
                </h3>
                <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                  {preferenceFields.map((field) => (
                    <div
                      key={field.label}
                      className="rounded-xl border border-white/5 bg-zinc-950/80 p-3 transition-all duration-300 hover:border-brand-orange-500/25"
                    >
                      <dt className="text-xs text-zinc-500">{field.label}</dt>
                      <dd className={`mt-1 text-sm font-medium ${field.value ? 'text-zinc-200' : 'text-zinc-500'}`}>
                        {field.value || 'Not recorded'}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>

              <section
                aria-labelledby="staffing-schedule-heading"
                className="rounded-3xl border border-white/10 bg-zinc-900/50 p-5 shadow-xl backdrop-blur-xl"
              >
                <h3
                  id="staffing-schedule-heading"
                  className="flex items-center border-b border-white/5 pb-3 font-heading font-semibold text-white"
                >
                  <Calendar className="mr-2 h-4 w-4 text-amber-400" aria-hidden />
                  Requested schedule
                </h3>
                <dl className="mt-4 space-y-3">
                  <div className="flex items-start gap-3 rounded-xl border border-white/5 bg-zinc-950/80 p-3">
                    <Clock className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400" aria-hidden />
                    <div>
                      <dt className="text-xs text-zinc-500">Requested hours</dt>
                      <dd className="mt-1 text-sm font-medium text-zinc-200">
                        {textValue(intakeForm.value, 'requestedHours') || 'Not recorded'}
                      </dd>
                    </div>
                  </div>
                  <div className="rounded-xl border border-white/5 bg-zinc-950/80 p-3">
                    <dt className="text-xs text-zinc-500">School / work schedule</dt>
                    <dd className="mt-1 text-sm font-medium leading-relaxed text-zinc-200">
                      {textValue(intakeForm.value, 'schoolSchedule') || 'Not recorded'}
                    </dd>
                  </div>
                </dl>
              </section>
            </div>

            <div className="space-y-6">
              <section
                aria-labelledby="current-assignment-heading"
                className="rounded-3xl border border-white/10 bg-zinc-900/50 p-5 shadow-xl backdrop-blur-xl"
              >
                <h3
                  id="current-assignment-heading"
                  className="flex items-center border-b border-white/5 pb-3 font-heading font-semibold text-white"
                >
                  <UserCheck className="mr-2 h-4 w-4 text-cyan-400" aria-hidden />
                  Durable assignments
                </h3>
                <dl className="mt-4 space-y-3">
                  <div className="rounded-xl border border-white/5 bg-zinc-950/80 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <dt className="text-xs text-zinc-500">BCBA · Clinical Director owned</dt>
                        <dd className="mt-1 text-sm font-semibold text-white">{bcbaLabel}</dd>
                      </div>
                      <span
                        className={`shrink-0 rounded-full border px-2 py-0.5 font-mono text-[9px] font-bold uppercase ${
                          client.bcbaId
                            ? 'border-green-500/25 bg-green-500/10 text-green-300'
                            : 'border-zinc-500/25 bg-zinc-500/10 text-zinc-400'
                        }`}
                      >
                        {client.bcbaId ? 'Assigned' : 'Unassigned'}
                      </span>
                    </div>
                  </div>

                  <div className="rounded-xl border border-white/5 bg-zinc-950/80 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <dt className="text-xs text-zinc-500">RBT · Case Coord / job-board owned</dt>
                        <dd className="mt-1 text-sm font-semibold text-white">{rbtLabel}</dd>
                        {approvedForAssignedRbt && (
                          <p className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] text-green-300">
                            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                            Matches an APPROVED application
                          </p>
                        )}
                      </div>
                      <span
                        className={`shrink-0 rounded-full border px-2 py-0.5 font-mono text-[9px] font-bold uppercase ${
                          client.rbtApproved && client.rbtId
                            ? 'border-green-500/25 bg-green-500/10 text-green-300'
                            : client.rbtId
                              ? 'border-amber-500/25 bg-amber-500/10 text-amber-300'
                              : openOpening
                                ? 'border-sky-500/25 bg-sky-500/10 text-sky-300'
                                : 'border-zinc-500/25 bg-zinc-500/10 text-zinc-400'
                        }`}
                      >
                        {rbtState}
                      </span>
                    </div>
                  </div>
                </dl>
              </section>

              <section
                aria-labelledby="job-board-evidence-heading"
                className="rounded-3xl border border-white/10 bg-zinc-900/50 p-5 shadow-xl backdrop-blur-xl"
              >
                <h3
                  id="job-board-evidence-heading"
                  className="flex items-center border-b border-white/5 pb-3 font-heading font-semibold text-white"
                >
                  <Briefcase className="mr-2 h-4 w-4 text-brand-orange-400" aria-hidden />
                  Job-board evidence
                </h3>

                {!openingsLoaded ? (
                  <div className="mt-4 rounded-2xl border border-red-500/25 bg-red-500/[0.08] p-5 text-center">
                    <AlertCircle className="mx-auto h-6 w-6 text-red-300" aria-hidden />
                    <p className="mt-2 text-sm font-semibold text-red-200">Unable to verify openings</p>
                    <p className="mt-1 text-xs text-red-200/70">
                      Reload the client profile. If this persists, the profile query is missing case openings.
                    </p>
                  </div>
                ) : !currentOpening ? (
                  <div className="mt-4 rounded-2xl border border-dashed border-white/15 bg-zinc-950/60 p-6 text-center">
                    <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04]">
                      <Briefcase className="h-5 w-5 text-zinc-500" aria-hidden />
                    </span>
                    <p className="mt-3 text-sm font-semibold text-zinc-200">No case opening on record</p>
                    <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-zinc-500">
                      This client is not currently visible on the HRM RBT Job Board.{' '}
                      {client.rbtId
                        ? 'The assignment may predate the job-board workflow.'
                        : 'Case Coordination must publish when readiness passes.'}
                    </p>
                  </div>
                ) : (
                  <div className="mt-4 space-y-4">
                    <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-zinc-950 to-zinc-900 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-brand-orange-300">
                            {currentOpening.caseCode || 'Case code unavailable'}
                          </p>
                          <p className="mt-1 text-sm font-semibold text-white">
                            {currentOpening.status === 'OPEN'
                              ? 'Live recruiting listing'
                              : currentOpening.status === 'FILLED'
                                ? 'Filled from job-board workflow'
                                : 'Closed listing history'}
                          </p>
                        </div>
                        <span
                          className={`rounded-full border px-2.5 py-1 font-mono text-[9px] font-bold uppercase ${openingTone(
                            currentOpening.status
                          )}`}
                        >
                          {currentOpening.status || 'Unknown'}
                        </span>
                      </div>
                    </div>

                    <dl className="grid grid-cols-3 gap-2">
                      <div className="rounded-xl border border-white/5 bg-zinc-950/70 p-3">
                        <dt className="font-mono text-[9px] uppercase tracking-wider text-zinc-500">
                          Applications
                        </dt>
                        <dd className="mt-1 font-heading text-xl font-bold text-white">
                          {currentApplications.length}
                        </dd>
                      </div>
                      <div className="rounded-xl border border-white/5 bg-zinc-950/70 p-3">
                        <dt className="font-mono text-[9px] uppercase tracking-wider text-zinc-500">
                          In flight
                        </dt>
                        <dd className="mt-1 font-heading text-xl font-bold text-sky-300">
                          {inFlightApplicationCount}
                        </dd>
                      </div>
                      <div className="rounded-xl border border-white/5 bg-zinc-950/70 p-3">
                        <dt className="font-mono text-[9px] uppercase tracking-wider text-zinc-500">
                          New
                        </dt>
                        <dd className="mt-1 font-heading text-xl font-bold text-brand-orange-300">
                          {newApplicationCount}
                        </dd>
                      </div>
                    </dl>

                    {filledApprovedApplication?.rbt && (
                      <p className="flex items-center gap-2 rounded-xl border border-green-500/20 bg-green-500/10 p-3 text-xs text-green-200">
                        <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
                        Approved application: {staffName(filledApprovedApplication.rbt) || 'Staff name unavailable'}
                      </p>
                    )}
                  </div>
                )}
              </section>
            </div>
          </div>

          <section
            aria-labelledby="staffing-handoff-heading"
            className="rounded-3xl border border-white/10 bg-gradient-to-br from-zinc-900/90 via-zinc-950 to-zinc-950 p-5 shadow-2xl"
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h3
                  id="staffing-handoff-heading"
                  className="font-heading text-base font-semibold text-white"
                >
                  CRM → HRM handoff
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-zinc-400">
                  Use CRM to manage this case. Use HRM for ATS and the hired RBT&apos;s applicant-side
                  job board.
                </p>
              </div>
              <span className="font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-zinc-600">
                Full navigation across apps
              </span>
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-3">
              <Link
                href={crmCaseCoordHref}
                className="group flex min-w-0 cursor-pointer items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition-all duration-300 hover:scale-[1.01] hover:border-brand-orange-500/40 hover:shadow-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange-400"
                aria-label="Open this client's Case Coordination staffing view in CRM"
              >
                <span className="min-w-0">
                  <span className="block font-mono text-[9px] font-bold uppercase tracking-wider text-brand-orange-300">
                    CRM · Case Coord
                  </span>
                  <span className="mt-1 block text-sm font-semibold text-white">Manage this case</span>
                  <span className="mt-1 block truncate font-mono text-[10px] text-zinc-500">
                    {crmCaseCoordHref}
                  </span>
                </span>
                <ExternalLink
                  className="h-4 w-4 shrink-0 text-zinc-500 transition group-hover:text-brand-orange-300"
                  aria-hidden
                />
              </Link>

              <a
                href={HRM_ATS_HREF}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex min-w-0 cursor-pointer items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition-all duration-300 hover:scale-[1.01] hover:border-cyan-500/40 hover:shadow-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
                aria-label="Open the HRM ATS workspace in a new tab"
              >
                <span className="min-w-0">
                  <span className="block font-mono text-[9px] font-bold uppercase tracking-wider text-cyan-300">
                    HRM · Staff
                  </span>
                  <span className="mt-1 block text-sm font-semibold text-white">Open ATS workspace</span>
                  <span className="mt-1 block truncate font-mono text-[10px] text-zinc-500">
                    {displayHref(HRM_ATS_HREF)}
                  </span>
                </span>
                <ExternalLink
                  className="h-4 w-4 shrink-0 text-zinc-500 transition group-hover:text-cyan-300"
                  aria-hidden
                />
              </a>

              <a
                href={HRM_JOB_BOARD_HREF}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex min-w-0 cursor-pointer items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition-all duration-300 hover:scale-[1.01] hover:border-green-500/40 hover:shadow-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-400"
                aria-label="Open the RBT-facing HRM Job Board in a new tab"
              >
                <span className="min-w-0">
                  <span className="block font-mono text-[9px] font-bold uppercase tracking-wider text-green-300">
                    HRM · RBT view
                  </span>
                  <span className="mt-1 block text-sm font-semibold text-white">Open RBT Job Board</span>
                  <span className="mt-1 block truncate font-mono text-[10px] text-zinc-500">
                    {displayHref(HRM_JOB_BOARD_HREF)}
                  </span>
                </span>
                <ExternalLink
                  className="h-4 w-4 shrink-0 text-zinc-500 transition group-hover:text-green-300"
                  aria-hidden
                />
              </a>
            </div>

            <div className="mt-4 flex items-start gap-2 rounded-xl border border-sky-500/20 bg-sky-500/10 p-3 text-xs leading-relaxed text-sky-200">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              Parent acceptance assigns the RBT and fills the opening. It never sets ACTIVE; a durable
              first therapy session is still required.
            </div>
          </section>
        </CardContent>
      </Card>
    </div>
  );
}
