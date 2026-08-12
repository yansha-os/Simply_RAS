'use client';

import React, { useState, useTransition } from 'react';
import type { Client, ClientMessage, IntakePacket, PARequest } from '@prisma/client';
import {
  ShieldCheck,
  MessageSquare,
  MapPin,
  CheckCircle2,
  Lock,
  CalendarDays,
  History,
  FileText,
  PenLine,
} from 'lucide-react';
import { ContinuousIntakeForm } from '@/components/magic-link/ContinuousIntakeForm';
import { ClientScheduleBuilder } from '@/components/magic-link/ClientScheduleBuilder';
import { sendClientMessage, markClientMessagesAsRead } from '@/app/(dashboard)/portal-case/actions';
import { signTreatmentPlan } from '@/app/actions/intake';
import {
  buildParentPlanReviewSummary,
  normalizeGuardianName,
  resolveExpectedGuardianName,
} from '@/lib/parentTreatmentPlanSign';

export type ParentPortalSession = {
  id: string;
  scheduledStart: string;
  scheduledEnd: string;
  status: string;
  placeLabel: string | null;
  rbtSigned: boolean;
  bcbaSigned: boolean;
  hasNote: boolean;
};

/** @deprecated Use ParentPortalSession */
export type ParentUpcomingSession = ParentPortalSession;

type ClientPortalClient = Client & {
  paRequests?: PARequest[];
};

type TreatmentPlanSummary = {
  status: string | null;
  parentSignature: string | null;
  preferredSchedule: unknown;
  hours97153: number;
  hours97155: number;
  hours97156: number;
  primaryLocations: string[];
};

type ClientPortalViewProps = {
  packet: IntakePacket;
  client: ClientPortalClient;
  messages: ClientMessage[];
  upcomingSessions?: ParentPortalSession[];
  pastSessions?: ParentPortalSession[];
  /** When client is ACTIVE or STAFFING_PENDING — show My Schedule even if empty. */
  showTherapyLoop?: boolean;
  /** Set right after a successful packet submit (?success=true) — shows a confirmation banner. */
  justSubmitted?: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function treatmentPlanSummary(value: Client['treatmentPlan']): TreatmentPlanSummary {
  const plan = isRecord(value) ? value : {};
  const primaryLocations = Array.isArray(plan.primaryLocations)
    ? plan.primaryLocations.filter(
        (location): location is string => typeof location === 'string'
      )
    : [];

  return {
    status: typeof plan.status === 'string' ? plan.status : null,
    parentSignature:
      typeof plan.parentSignature === 'string' ? plan.parentSignature : null,
    preferredSchedule: plan.preferredSchedule,
    hours97153: typeof plan.hours97153 === 'number' ? plan.hours97153 : 0,
    hours97155: typeof plan.hours97155 === 'number' ? plan.hours97155 : 0,
    hours97156: typeof plan.hours97156 === 'number' ? plan.hours97156 : 0,
    primaryLocations,
  };
}

function formatSessionWhen(startIso: string, endIso: string) {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const day = start.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  const startTime = start.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const endTime = end.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return { day, timeRange: `${startTime} – ${endTime}` };
}

type LightStatus = {
  label: string;
  className: string;
  pulse?: boolean;
};

/** Parent-safe light status from Session.status + SessionNote sign flags (no EDI). */
function lightSessionStatus(s: ParentPortalSession): LightStatus {
  if (s.bcbaSigned) {
    return {
      label: 'BCBA signed',
      className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25',
    };
  }
  if (s.status === 'IN_PROGRESS') {
    return {
      label: 'In progress',
      className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25',
      pulse: true,
    };
  }
  if (s.status === 'SCHEDULED') {
    return {
      label: 'Scheduled',
      className: 'bg-amber-500/10 text-amber-400 border-amber-500/25',
    };
  }
  // COMPLETED (and any other past)
  if (s.hasNote && !s.rbtSigned) {
    return {
      label: 'Note in progress',
      className: 'bg-sky-500/10 text-sky-400 border-sky-500/25',
    };
  }
  if (s.rbtSigned && !s.bcbaSigned) {
    return {
      label: 'Note in progress',
      className: 'bg-sky-500/10 text-sky-400 border-sky-500/25',
    };
  }
  return {
    label: 'Session done',
    className: 'bg-zinc-500/10 text-zinc-300 border-white/15',
  };
}

function SessionRow({ session }: { session: ParentPortalSession }) {
  const { day, timeRange } = formatSessionWhen(session.scheduledStart, session.scheduledEnd);
  const light = lightSessionStatus(session);

  return (
    <li
      className="group relative flex items-center justify-between gap-3 overflow-hidden rounded-xl border border-white/10 bg-zinc-950/80 px-4 py-3 backdrop-blur-xl transition-all duration-300 hover:scale-[1.01] hover:border-brand-orange-500/40 hover:shadow-2xl"
    >
      <div className="pointer-events-none absolute -right-8 -top-10 h-24 w-24 rounded-full bg-brand-orange-500/5 blur-2xl opacity-0 transition-opacity group-hover:opacity-100" />
      <div className="relative min-w-0">
        <p className="text-sm font-semibold text-white font-heading truncate">{day}</p>
        <p className="text-xs text-zinc-400 font-mono mt-0.5">
          {timeRange}
          {session.placeLabel ? ` · ${session.placeLabel}` : ''}
        </p>
      </div>
      <span
        className={`relative shrink-0 inline-flex items-center gap-1.5 text-[10px] font-mono font-bold uppercase tracking-wide px-2 py-1 rounded-md border ${light.className}`}
      >
        {light.pulse && <span className="dot-live" />}
        {light.label}
      </span>
    </li>
  );
}

function EmptySessionsHint({
  icon: Icon,
  title,
  body,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-xl border border-dashed border-white/10 bg-zinc-950/50 px-4 py-8 text-center">
      <Icon className="mx-auto mb-3 h-8 w-8 text-zinc-600" />
      <p className="text-sm font-semibold text-zinc-300 font-heading">{title}</p>
      <p className="mt-1 text-xs text-zinc-500 max-w-sm mx-auto">{body}</p>
    </div>
  );
}

function TherapyLoopCard({
  upcoming,
  past,
  compact = false,
}: {
  upcoming: ParentPortalSession[];
  past: ParentPortalSession[];
  /** When true, only show a short upcoming teaser (Action Items / Tracker). */
  compact?: boolean;
}) {
  if (compact) {
    if (!upcoming.length) return null;
    return (
      <div className="relative overflow-hidden rounded-2xl border border-emerald-500/20 bg-zinc-950/80 p-5 backdrop-blur-xl shadow-[0_0_40px_rgba(16,185,129,0.08)]">
        <div className="pointer-events-none absolute -left-10 top-0 h-32 w-32 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="relative flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center shrink-0">
            <CalendarDays className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white font-heading">Upcoming sessions</h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Dates assigned by your care team. Open My Schedule for full history.
            </p>
          </div>
        </div>
        <ul className="relative space-y-2">
          {upcoming.slice(0, 3).map((s) => (
            <SessionRow key={s.id} session={s} />
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/80 p-6 backdrop-blur-xl shadow-2xl">
      <div className="pointer-events-none absolute -right-16 -top-20 h-48 w-48 rounded-full bg-emerald-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -left-10 bottom-0 h-36 w-36 rounded-full bg-brand-orange-500/5 blur-3xl" />

      <div className="relative mb-6">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center shrink-0">
            <CalendarDays className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white font-heading">Therapy sessions</h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Live schedule from your care team — dates and light status only.
            </p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-zinc-900/60 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wide text-zinc-400">
            <CalendarDays className="h-3 w-3 text-amber-400" />
            Scheduled
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-zinc-900/60 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wide text-zinc-400">
            <FileText className="h-3 w-3 text-sky-400" />
            Note in progress
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-zinc-900/60 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wide text-zinc-400">
            <CheckCircle2 className="h-3 w-3 text-zinc-400" />
            Session done
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-zinc-900/60 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wide text-zinc-400">
            <PenLine className="h-3 w-3 text-emerald-400" />
            BCBA signed
          </span>
        </div>
      </div>

      <div className="relative space-y-8">
        <section>
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-white font-heading flex items-center gap-2">
              <span className="dot-live" />
              Upcoming
            </h3>
            <span className="font-mono text-[10px] text-zinc-500 uppercase tracking-wide">
              {upcoming.length} scheduled
            </span>
          </div>
          {upcoming.length === 0 ? (
            <EmptySessionsHint
              icon={CalendarDays}
              title="No upcoming visits yet"
              body="When Case Coordination schedules therapy, your next visit dates will appear here."
            />
          ) : (
            <ul className="space-y-2">
              {upcoming.map((s) => (
                <SessionRow key={s.id} session={s} />
              ))}
            </ul>
          )}
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-white font-heading flex items-center gap-2">
              <History className="h-4 w-4 text-zinc-500" />
              Past sessions
            </h3>
            <span className="font-mono text-[10px] text-zinc-500 uppercase tracking-wide">
              {past.length} completed
            </span>
          </div>
          {past.length === 0 ? (
            <EmptySessionsHint
              icon={History}
              title="No completed sessions yet"
              body="After a visit finishes, it will show here with a light status (session done, note in progress, or BCBA signed)."
            />
          ) : (
            <ul className="space-y-2">
              {past.map((s) => (
                <SessionRow key={s.id} session={s} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

export default function ClientPortalView({
  packet,
  client,
  messages,
  upcomingSessions = [],
  pastSessions = [],
  showTherapyLoop = false,
  justSubmitted = false,
}: ClientPortalViewProps) {
  const rejectionCount =
    packet.rejectionDetails && typeof packet.rejectionDetails === 'object'
      ? Object.keys(packet.rejectionDetails).length
      : 0;
  const hasChangesRequested = packet.status === 'PENDING_CLIENT_SUBMISSION' && rejectionCount > 0;

  const treatmentPlan = treatmentPlanSummary(client.treatmentPlan);
  const planReview = buildParentPlanReviewSummary(client.treatmentPlan);
  const expectedGuardianName = resolveExpectedGuardianName({
    guardianName: client.guardianName,
    formData: packet.formData,
  });
  const needsTreatmentPlanSig = treatmentPlan.status === 'COMPLETED' && !treatmentPlan.parentSignature;
  const needsScheduleBuilder =
    ['TX_PA_APPROVED', 'STAFFING_PENDING'].includes(client.status) && !treatmentPlan.preferredSchedule;
  const hasSchedule = !!treatmentPlan.preferredSchedule;
  const hasUpcomingSessions = upcomingSessions.length > 0;
  const showScheduleTab = hasSchedule || showTherapyLoop;

  const defaultTab =
    packet.status === 'PENDING_CLIENT_SUBMISSION' || needsTreatmentPlanSig || needsScheduleBuilder
      ? 'forms'
      : showTherapyLoop
        ? 'schedule'
        : 'tracker';
  const [activeTab, setActiveTab] = useState<'forms' | 'tracker' | 'schedule' | 'messages'>(defaultTab);
  const [parentSignatureName, setParentSignatureName] = useState('');
  const [planReviewed, setPlanReviewed] = useState(false);
  const [signError, setSignError] = useState<string | null>(null);
  const [signWarning, setSignWarning] = useState<string | null>(null);
  const [isSigning, setIsSigning] = useState(false);
  const [messageText, setMessageText] = useState('');
  const [isPending, startTransition] = useTransition();

  const typedName = parentSignatureName.trim();
  const nameSoftMismatch =
    Boolean(typedName) &&
    Boolean(expectedGuardianName) &&
    normalizeGuardianName(typedName) !== normalizeGuardianName(expectedGuardianName!);
  const canSign = Boolean(typedName) && planReviewed && !isSigning;

  const [unreadCount, setUnreadCount] = useState(
    messages.filter((message) => !message.isFromClient && !message.readAt).length
  );

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageText.trim()) return;

    startTransition(async () => {
      await sendClientMessage(client.id, messageText);
      setMessageText('');
    });
  };

  const getStatusStep = () => {
    const s = client.status;
    if (['INQUIRY', 'MAGIC_LINK_SENT'].includes(s)) return 1;
    if (['DOCS_SUBMITTED', 'DOCS_APPROVED_INTAKE'].includes(s)) return 2;
    if (['CLINICAL_REVIEW_APPROVED', 'VOB_COMPLETED', 'PA_SUBMITTED'].includes(s)) return 3;
    if (['PA_APPROVED', 'ASSESSMENT_SCHEDULED'].includes(s)) return 4;
    if (['REPORT_ASSEMBLED', 'TX_PA_SUBMITTED'].includes(s)) return 5;
    if (['TX_PA_APPROVED', 'STAFFING_PENDING'].includes(s)) return 6;
    if (s === 'ACTIVE') return 7;
    return 1;
  };

  const currentStep = getStatusStep();

  return (
    <div className="min-h-screen bg-[#0a0a0c] bg-grid-pattern text-white">
      {/* Header */}
      <header className="border-b border-white/5 bg-[#0f1115]/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-brand-blue-500" />
            <span className="font-bold tracking-wide font-heading">Simple RAS Portal</span>
          </div>
          <div className="text-xs text-zinc-400 flex items-center font-mono">
            <Lock className="w-3 h-3 mr-1" /> Secure Session
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-4 flex gap-6 mt-2 overflow-x-auto">
          <button
            type="button"
            className={`pb-3 text-sm font-semibold transition-colors border-b-2 cursor-pointer ${activeTab === 'forms' ? 'border-brand-gold-500 text-brand-gold-500' : 'border-transparent text-zinc-400 hover:text-white'}`}
            onClick={() => setActiveTab('forms')}
          >
            Action Items
            {(packet.status === 'PENDING_CLIENT_SUBMISSION' || needsTreatmentPlanSig || needsScheduleBuilder) && (
              <span className="ml-2 bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">
                {(packet.status === 'PENDING_CLIENT_SUBMISSION' && (needsTreatmentPlanSig || needsScheduleBuilder)) ? '2' : '1'}
              </span>
            )}
          </button>
          <button
            type="button"
            className={`pb-3 text-sm font-semibold transition-colors border-b-2 cursor-pointer ${activeTab === 'tracker' ? 'border-brand-gold-500 text-brand-gold-500' : 'border-transparent text-zinc-400 hover:text-white'}`}
            onClick={() => setActiveTab('tracker')}
          >
            Progress Tracker
          </button>
          {showScheduleTab && (
            <button
              type="button"
              className={`pb-3 text-sm font-semibold transition-colors border-b-2 flex items-center cursor-pointer ${activeTab === 'schedule' ? 'border-brand-gold-500 text-brand-gold-500' : 'border-transparent text-zinc-400 hover:text-white'}`}
              onClick={() => setActiveTab('schedule')}
            >
              My Schedule
              {hasUpcomingSessions && (
                <span className="ml-2 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] px-1.5 py-0.5 rounded-full font-mono">
                  {upcomingSessions.length}
                </span>
              )}
            </button>
          )}
          <button
            type="button"
            className={`pb-3 text-sm font-semibold transition-colors border-b-2 flex items-center cursor-pointer ${activeTab === 'messages' ? 'border-brand-gold-500 text-brand-gold-500' : 'border-transparent text-zinc-400 hover:text-white'}`}
            onClick={() => {
              setActiveTab('messages');
              if (unreadCount > 0) {
                setUnreadCount(0);
                markClientMessagesAsRead(client.id);
              }
            }}
          >
            Messages
            {unreadCount > 0 && (
              <span className="ml-2 bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full min-w-[16px] text-center inline-block leading-none">{unreadCount}</span>
            )}
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">

        {justSubmitted && (
          <div className="mb-6 animate-slide-up rounded-2xl border border-green-500/25 bg-green-500/[0.06] p-5 shadow-[0_0_40px_rgba(34,197,94,0.1)] backdrop-blur-xl">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 shrink-0 rounded-full bg-green-500/15 border border-green-500/25 flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5 text-green-400" />
              </div>
              <div>
                <h2 className="text-base font-bold text-white font-heading">Packet received — thank you!</h2>
                <p className="text-sm text-zinc-400 mt-0.5">
                  Our team is reviewing your forms and documents now. We&apos;ll message you here if anything else is needed —
                  you can follow along in the Progress Tracker.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* FORMS TAB */}
        {activeTab === 'forms' && (
          <div className="animate-slide-up space-y-8">
            {hasUpcomingSessions && (
              <TherapyLoopCard upcoming={upcomingSessions} past={pastSessions} compact />
            )}

            {needsTreatmentPlanSig && (
              <div className="bg-[#0f1115] border border-brand-blue-500/30 p-6 rounded-2xl shadow-[0_0_50px_rgba(0,200,255,0.1)]">
                <h2 className="text-xl font-bold mb-2 font-heading">Treatment Plan Signature Required</h2>
                <p className="text-sm text-zinc-400 mb-6">
                  Your BCBA has finalized your child&apos;s treatment plan. Please review the summary below, then type your name to sign.
                </p>
                <div className="bg-zinc-950 rounded-xl p-6 border border-white/5 space-y-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm text-zinc-300">
                    <div><strong>Total ABA Hours Requested:</strong> {planReview.hours97153 || 0} hrs/week</div>
                    <div><strong>Requested 97155 protocol-modification service hours (qualified clinician):</strong> {planReview.hours97155 || 0} hrs/week</div>
                    <div><strong>Parent Training:</strong> {planReview.hours97156 || 0} hrs/week</div>
                    <div><strong>Service Locations:</strong> {planReview.primaryLocations.join(', ') || 'N/A'}</div>
                  </div>

                  <div className="pt-4 border-t border-white/5 space-y-3">
                    <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wide">Goals &amp; crisis plan</h3>
                    {planReview.goals.length === 0 ? (
                      <p className="text-sm text-zinc-500">No goal lines were listed on this plan yet. Contact the clinic if this looks incomplete.</p>
                    ) : (
                      <ul className="space-y-2">
                        {planReview.goals.map((goal, index) => (
                          <li
                            key={`${goal.kind}-${index}`}
                            className="rounded-lg border border-white/5 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-300"
                          >
                            <span className="font-mono text-[10px] uppercase tracking-wide text-zinc-500 mr-2">
                              {goal.kind}
                            </span>
                            <span className="text-white font-medium">{goal.label}</span>
                            {goal.detail && goal.detail !== goal.label ? (
                              <p className="text-xs text-zinc-500 mt-1">{goal.detail}</p>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.06] px-3 py-2">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-amber-400/90 mb-1">Crisis / safety plan</p>
                      <p className="text-sm text-zinc-300 whitespace-pre-wrap">
                        {planReview.crisisPlan || 'Not documented on this plan.'}
                      </p>
                    </div>
                  </div>

                  <label className="flex items-start gap-3 cursor-pointer select-none pt-2 border-t border-white/5">
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 cursor-pointer rounded border-zinc-600 bg-zinc-900 text-brand-blue-500 focus:ring-brand-blue-500/40"
                      checked={planReviewed}
                      onChange={(e) => {
                        setPlanReviewed(e.target.checked);
                        setSignError(null);
                      }}
                      disabled={isSigning}
                    />
                    <span className="text-sm text-zinc-300">
                      I have reviewed the goals, crisis/safety plan, and service hours above.
                    </span>
                  </label>

                  <div>
                    <label className="block text-xs font-bold text-zinc-500 uppercase mb-2">Parent/Guardian E-Signature</label>
                    <input
                      type="text"
                      className={`w-full rounded-lg p-3 text-white transition-all duration-300 font-signature text-lg outline-none border ${
                        !typedName
                          ? '!border-yellow-500/50 !bg-yellow-500/10 focus:!border-yellow-400 placeholder:!text-yellow-500/50'
                          : '!border-zinc-700 !bg-zinc-900 focus:!border-brand-blue-500'
                      }`}
                      placeholder="Type your full name to sign"
                      value={parentSignatureName}
                      onChange={(e) => {
                        setParentSignatureName(e.target.value);
                        setSignError(null);
                        setSignWarning(null);
                      }}
                      disabled={isSigning}
                      autoComplete="name"
                    />
                    {nameSoftMismatch && (
                      <p className="mt-2 text-xs text-amber-400/90">
                        Typed name doesn&apos;t match the guardian name on file
                        {expectedGuardianName ? ` (${expectedGuardianName})` : ''}. You can still sign — the clinic may follow up.
                      </p>
                    )}
                  </div>

                  {signError && (
                    <p className="text-sm text-red-400 border border-red-500/20 bg-red-500/10 rounded-lg px-3 py-2">{signError}</p>
                  )}
                  {signWarning && (
                    <p className="text-sm text-amber-400/90 border border-amber-500/20 bg-amber-500/10 rounded-lg px-3 py-2">{signWarning}</p>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      if (!canSign) return;
                      setIsSigning(true);
                      setSignError(null);
                      setSignWarning(null);
                      startTransition(async () => {
                        const result = await signTreatmentPlan(client.id, parentSignatureName, {
                          planReviewed: true,
                        });
                        setIsSigning(false);
                        if (!result.success) {
                          setSignError(result.error || 'Could not sign treatment plan.');
                          return;
                        }
                        if ('warning' in result && result.warning) {
                          setSignWarning(result.warning);
                        }
                      });
                    }}
                    disabled={!canSign}
                    className={`w-full font-bold py-3 rounded-lg transition-all duration-500 mt-2 border ${
                      canSign
                        ? 'bg-green-500 hover:bg-green-600 text-white shadow-[0_0_20px_rgba(34,197,94,0.6)] border-green-400 scale-[1.02] cursor-pointer'
                        : 'bg-zinc-800 text-zinc-500 cursor-not-allowed border-transparent'
                    }`}
                  >
                    {isSigning ? 'Signing...' : 'Sign & Submit Treatment Plan'}
                  </button>
                </div>
              </div>
            )}

            {needsScheduleBuilder && (
              <div className="animate-slide-up">
                <ClientScheduleBuilder client={client} paRequests={client.paRequests || []} />
              </div>
            )}

            {packet.status === 'PENDING_CLIENT_SUBMISSION' && (
              <div className={`bg-[#0f1115] border p-6 rounded-2xl ${hasChangesRequested ? 'border-red-500/30 shadow-[0_0_50px_rgba(239,68,68,0.1)]' : 'border-brand-orange-500/30 shadow-[0_0_50px_rgba(255,107,0,0.1)]'}`}>
                {hasChangesRequested ? (
                  <>
                    <h2 className="text-xl font-bold mb-2 flex items-center gap-2.5">
                      Changes Requested
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500/25 bg-red-500/10 px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wide text-red-400">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-400" />
                        {rejectionCount} item{rejectionCount === 1 ? '' : 's'}
                      </span>
                    </h2>
                    <p className="text-sm text-zinc-400 mb-6">
                      Our team reviewed your packet and needs a few things fixed or re-uploaded. The details are listed below —
                      everything else you sent is already saved and approved.
                    </p>
                  </>
                ) : (
                  <>
                    <h2 className="text-xl font-bold mb-2">Required Intake Documents</h2>
                    <p className="text-sm text-zinc-400 mb-6">Please complete the following forms. For your privacy, once submitted, this data will be securely locked and no longer visible on your device.</p>
                  </>
                )}
                <div className="bg-zinc-950 rounded-xl p-4">
                  <ContinuousIntakeForm packet={packet} client={client} />
                </div>
              </div>
            )}

            {!needsTreatmentPlanSig && !needsScheduleBuilder && packet.status !== 'PENDING_CLIENT_SUBMISSION' && (
              <div className={`text-center ${hasUpcomingSessions ? 'py-8' : 'py-20'}`}>
                <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle2 className="w-8 h-8 text-green-500" />
                </div>
                <h2 className="text-xl font-bold text-white mb-2 font-heading">All Caught Up!</h2>
                <p className="text-zinc-400">
                  {showTherapyLoop
                    ? 'No pending forms. Check My Schedule for upcoming and past therapy visits.'
                    : 'You have no pending action items. We are processing your case.'}
                </p>
              </div>
            )}
          </div>
        )}

        {/* TRACKER TAB */}
        {activeTab === 'tracker' && (
          <div className="animate-slide-up space-y-6">
            {hasUpcomingSessions && (
              <TherapyLoopCard upcoming={upcomingSessions} past={pastSessions} compact />
            )}
            <div className="bg-[#0f1115]/80 border border-white/10 p-8 rounded-2xl backdrop-blur-xl">
            <h2 className="text-xl font-bold mb-8 font-heading">Case Progress</h2>

            <div className="space-y-8 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-white/10 before:to-transparent">

              <div className={`relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active`}>
                <div className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-[#0f1115] bg-brand-gold-500 text-black shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 shadow-[0_0_20px_rgba(255,200,0,0.4)] z-10">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded-xl border border-brand-gold-500/30 bg-brand-gold-500/5">
                  <h3 className="font-bold text-brand-gold-400">Step 1: Intake & Documents</h3>
                  <p className="text-xs text-zinc-400 mt-1">Collecting demographic and medical records.</p>
                </div>
              </div>

              <div className={`relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group ${currentStep >= 2 ? 'is-active' : ''}`}>
                <div className={`flex items-center justify-center w-10 h-10 rounded-full border-4 border-[#0f1115] shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10 ${currentStep >= 2 ? 'bg-brand-blue-500 text-white shadow-[0_0_20px_rgba(0,150,255,0.4)]' : 'bg-zinc-800 text-zinc-500'}`}>
                  {currentStep > 2 ? <CheckCircle2 className="w-5 h-5" /> : <MapPin className="w-5 h-5" />}
                </div>
                <div className={`w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded-xl border ${currentStep >= 2 ? 'border-brand-blue-500/30 bg-brand-blue-500/5' : 'border-white/5 bg-zinc-900/50'}`}>
                  <h3 className={`font-bold ${currentStep >= 2 ? 'text-brand-blue-400' : 'text-zinc-500'}`}>Step 2: Clinical Review</h3>
                  <p className="text-xs text-zinc-400 mt-1">Our clinical team is reviewing your medical necessity.</p>
                </div>
              </div>

              <div className={`relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group ${currentStep >= 3 ? 'is-active' : ''}`}>
                <div className={`flex items-center justify-center w-10 h-10 rounded-full border-4 border-[#0f1115] shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10 ${currentStep >= 3 ? 'bg-purple-500 text-white shadow-[0_0_20px_rgba(150,0,255,0.4)]' : 'bg-zinc-800 text-zinc-500'}`}>
                  {currentStep > 3 ? <CheckCircle2 className="w-5 h-5" /> : <MapPin className="w-5 h-5" />}
                </div>
                <div className={`w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded-xl border ${currentStep >= 3 ? 'border-purple-500/30 bg-purple-500/5' : 'border-white/5 bg-zinc-900/50'}`}>
                  <h3 className={`font-bold ${currentStep >= 3 ? 'text-purple-400' : 'text-zinc-500'}`}>Step 3: Authorization</h3>
                  <p className="text-xs text-zinc-400 mt-1">Verifying benefits and securing Prior Authorization from insurance.</p>
                </div>
              </div>

              <div className={`relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group ${currentStep >= 4 ? 'is-active' : ''}`}>
                <div className={`flex items-center justify-center w-10 h-10 rounded-full border-4 border-[#0f1115] shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10 ${currentStep >= 4 ? 'bg-green-500 text-white shadow-[0_0_20px_rgba(0,255,100,0.4)]' : 'bg-zinc-800 text-zinc-500'}`}>
                  {currentStep > 4 ? <CheckCircle2 className="w-5 h-5" /> : <MapPin className="w-5 h-5" />}
                </div>
                <div className={`w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded-xl border ${currentStep >= 4 ? 'border-green-500/30 bg-green-500/5' : 'border-white/5 bg-zinc-900/50'}`}>
                  <h3 className={`font-bold ${currentStep >= 4 ? 'text-green-400' : 'text-zinc-500'}`}>Step 4: Assessment</h3>
                  <p className="text-xs text-zinc-400 mt-1">Scheduling and conducting your initial BCBA assessment.</p>
                </div>
              </div>

              <div className={`relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group ${currentStep >= 5 ? 'is-active' : ''}`}>
                <div className={`flex items-center justify-center w-10 h-10 rounded-full border-4 border-[#0f1115] shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10 ${currentStep >= 5 ? 'bg-brand-orange-500 text-white shadow-[0_0_20px_rgba(255,107,0,0.4)]' : 'bg-zinc-800 text-zinc-500'}`}>
                  {currentStep > 5 ? <CheckCircle2 className="w-5 h-5" /> : <MapPin className="w-5 h-5" />}
                </div>
                <div className={`w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded-xl border ${currentStep >= 5 ? 'border-brand-orange-500/30 bg-brand-orange-500/5' : 'border-white/5 bg-zinc-900/50'}`}>
                  <h3 className={`font-bold ${currentStep >= 5 ? 'text-brand-orange-400' : 'text-zinc-500'}`}>Step 5: Treatment Plan</h3>
                  <p className="text-xs text-zinc-400 mt-1">Reviewing and signing your customized treatment plan.</p>
                </div>
              </div>

              <div className={`relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group ${currentStep >= 6 ? 'is-active' : ''}`}>
                <div className={`flex items-center justify-center w-10 h-10 rounded-full border-4 border-[#0f1115] shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10 ${currentStep >= 6 ? 'bg-pink-500 text-white shadow-[0_0_20px_rgba(236,72,153,0.4)]' : 'bg-zinc-800 text-zinc-500'}`}>
                  {currentStep > 6 ? <CheckCircle2 className="w-5 h-5" /> : <MapPin className="w-5 h-5" />}
                </div>
                <div className={`w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded-xl border ${currentStep >= 6 ? 'border-pink-500/30 bg-pink-500/5' : 'border-white/5 bg-zinc-900/50'}`}>
                  <h3 className={`font-bold ${currentStep >= 6 ? 'text-pink-400' : 'text-zinc-500'}`}>Step 6: Staffing & Scheduling</h3>
                  <p className="text-xs text-zinc-400 mt-1">You will be assigned a BCBA, RBT, and Case Coordinator, and build your schedule.</p>
                </div>
              </div>

              <div className={`relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group ${currentStep >= 7 ? 'is-active' : ''}`}>
                <div className={`flex items-center justify-center w-10 h-10 rounded-full border-4 border-[#0f1115] shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10 ${currentStep >= 7 ? 'bg-emerald-500 text-white shadow-[0_0_20px_rgba(16,185,129,0.4)]' : 'bg-zinc-800 text-zinc-500'}`}>
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div className={`w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded-xl border ${currentStep >= 7 ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-white/5 bg-zinc-900/50'}`}>
                  <h3 className={`font-bold ${currentStep >= 7 ? 'text-emerald-400' : 'text-zinc-500'}`}>Step 7: Active Services</h3>
                  <p className="text-xs text-zinc-400 mt-1">Congratulations! Your ongoing ABA services have begun.</p>
                </div>
              </div>

            </div>
            </div>
          </div>
        )}

        {/* SCHEDULE TAB — preferred availability + live therapy loop */}
        {activeTab === 'schedule' && showScheduleTab && (
          <div className="animate-slide-up space-y-6">
            {showTherapyLoop && (
              <TherapyLoopCard upcoming={upcomingSessions} past={pastSessions} />
            )}
            {hasSchedule && (
              <ClientScheduleBuilder client={client} paRequests={client.paRequests || []} />
            )}
            {!hasSchedule && showTherapyLoop && (
              <p className="text-xs text-zinc-500 text-center">
                Preferred weekly availability can be set during staffing. Visit dates above update when Case Coordination schedules sessions.
              </p>
            )}
          </div>
        )}

        {/* MESSAGES TAB */}
        {activeTab === 'messages' && (
          <div className="animate-slide-up flex flex-col h-[70vh] bg-[#0f1115]/80 border border-white/10 rounded-2xl overflow-hidden shadow-2xl backdrop-blur-xl">
            <div className="p-4 border-b border-white/5 bg-zinc-900/80 flex items-center gap-3">
              <div className="w-10 h-10 bg-brand-blue-500/20 rounded-full flex items-center justify-center">
                <MessageSquare className="w-5 h-5 text-brand-blue-500" />
              </div>
              <div>
                <h3 className="font-bold text-white font-heading">Clinic Concierge</h3>
                <p className="text-xs text-zinc-400">Usually replies in a few hours</p>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-[#0a0a0c]">
              {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-zinc-500">
                  <MessageSquare className="w-10 h-10 mb-3 opacity-30" />
                  <p className="text-sm">No messages yet. Say hello!</p>
                </div>
              ) : (
                messages.map(msg => (
                  <div key={msg.id} className={`flex flex-col ${msg.isFromClient ? 'items-end' : 'items-start'}`}>
                    <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-[14px] leading-relaxed shadow-sm ${msg.isFromClient ? 'bg-brand-blue-600 text-white rounded-br-none' : 'bg-zinc-800 border border-white/5 text-zinc-200 rounded-bl-none'}`}>
                      {msg.content}
                    </div>
                    <span className="text-[10px] text-zinc-500 mt-1 px-1 font-mono">{msg.senderName} • {new Date(msg.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                  </div>
                ))
              )}
            </div>

            <form onSubmit={handleSendMessage} className="p-4 border-t border-white/5 bg-zinc-900/80 flex gap-3">
              <input
                type="text"
                placeholder="Type a message..."
                className="flex-1 bg-zinc-950 border border-white/10 rounded-full px-5 py-2.5 text-sm text-white focus:outline-none focus:border-brand-blue-500 transition-colors"
                value={messageText}
                onChange={e => setMessageText(e.target.value)}
              />
              <button
                type="submit"
                disabled={isPending || !messageText.trim()}
                className="bg-brand-blue-600 hover:bg-brand-blue-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer text-white rounded-full px-6 font-semibold text-sm transition-colors shadow-lg"
              >
                {isPending ? '...' : 'Send'}
              </button>
            </form>
          </div>
        )}

      </main>
    </div>
  );
}
