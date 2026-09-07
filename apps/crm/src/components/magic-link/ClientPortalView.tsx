'use client';

import React, { useState, useTransition, useEffect, useRef, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import type { Client, ClientMessage, IntakePacket, PARequest } from '@prisma/client';
import {
  ShieldCheck,
  MessageSquare,
  CheckCircle2,
  Lock,
  CalendarDays,
  History,
  FileText,
  PenLine,
  Menu,
  X,
  ChevronRight,
  TrendingUp,
  Send,
  Loader2,
  AlertCircle,
  Check,
  Plus,
  Video,
  Paperclip,
  Download,
} from 'lucide-react';
import { toast } from 'sonner';
import { ContinuousIntakeForm } from '@/components/magic-link/ContinuousIntakeForm';
import { ClientScheduleBuilder } from '@/components/magic-link/ClientScheduleBuilder';
import { ClientNotificationBell } from '@/components/magic-link/ClientNotificationBell';
import { isClinicalFamilyCorrectionLoop, parentNeedsClinicalCorrectionAction, summarizeClinicalCorrectionStates } from '@/lib/clinicalReviewApprovals';
import { parsePacketFormData } from '@/lib/safeParseJson';
import { sendClientMessage, markClientMessagesAsRead } from '@/app/(dashboard)/portal-case/actions';
import { signTreatmentPlan } from '@/app/actions/intake';
import {
  buildParentPlanReviewSummary,
  normalizeGuardianName,
  resolveExpectedGuardianName,
} from '@/lib/parentTreatmentPlanSign';
import {
  parseMessageContent,
  encodeCallContent,
  encodeDocContent,
  generateJitsiRoomUrl,
  launchJitsiMeetingWindow,
} from '@/lib/clientChatUtils';

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

const subscribeToClientMount = () => () => undefined;
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

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
      label: 'BCBA Signed',
      className: 'bg-emerald-50 text-emerald-800 border-emerald-300',
    };
  }
  if (s.status === 'IN_PROGRESS') {
    return {
      label: 'In Progress',
      className: 'bg-emerald-50 text-emerald-800 border-emerald-300',
      pulse: true,
    };
  }
  if (s.status === 'SCHEDULED') {
    return {
      label: 'Scheduled',
      className: 'bg-[#FFF5ED] text-[#C2410C] border-[#FFD8C2]',
    };
  }
  // COMPLETED
  if (s.hasNote && !s.rbtSigned) {
    return {
      label: 'Note in Progress',
      className: 'bg-amber-50 text-amber-800 border-amber-300',
    };
  }
  if (s.rbtSigned && !s.bcbaSigned) {
    return {
      label: 'Note in Progress',
      className: 'bg-amber-50 text-amber-800 border-amber-300',
    };
  }
  return {
    label: 'Session Done',
    className: 'bg-[#F9F5EC] text-slate-700 border-[#E2D5B7]',
  };
}

function SessionRow({ session }: { session: ParentPortalSession }) {
  const { day, timeRange } = formatSessionWhen(session.scheduledStart, session.scheduledEnd);
  const light = lightSessionStatus(session);

  return (
    <li
      className="group relative flex items-center justify-between gap-3 overflow-hidden rounded-2xl border border-[#E2D5B7] bg-white p-4 shadow-xs transition-all duration-200 hover:border-orange-400 hover:shadow-md"
    >
      <div className="relative min-w-0">
        <p className="text-sm font-bold text-slate-900 font-heading truncate">{day}</p>
        <p className="text-xs text-slate-500 font-mono mt-0.5">
          {timeRange}
          {session.placeLabel ? ` · ${session.placeLabel}` : ''}
        </p>
      </div>
      <span
        className={`relative shrink-0 inline-flex items-center gap-1.5 text-[11px] font-mono font-bold uppercase tracking-wide px-2.5 py-1 rounded-full border ${light.className}`}
      >
        {light.pulse && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />}
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
    <div className="rounded-2xl border-2 border-dashed border-[#E2D5B7] bg-[#F9F5EC]/60 px-4 py-8 text-center">
      <Icon className="mx-auto mb-3 h-8 w-8 text-slate-400" />
      <p className="text-sm font-bold text-slate-800 font-heading">{title}</p>
      <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto">{body}</p>
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
  compact?: boolean;
}) {
  if (compact) {
    if (!upcoming.length) return null;
    return (
      <div className="relative overflow-hidden rounded-3xl border border-[#E2D5B7] bg-[#FFFDF8] p-5 sm:p-6 shadow-xl shadow-orange-950/5">
        <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-[radial-gradient(ellipse_at_top_right,_rgba(249,115,22,0.10),_transparent_58%)]" />
        <div className="relative flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-2xl bg-orange-100 border border-orange-200 flex items-center justify-center shrink-0 text-[#EA580C]">
            <CalendarDays className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-black text-slate-900 font-heading">Upcoming Sessions</h2>
            <p className="text-xs text-slate-600 mt-0.5">
              Assigned visits from your care team. View My Schedule for full history.
            </p>
          </div>
        </div>
        <ul className="relative space-y-2.5">
          {upcoming.slice(0, 3).map((s) => (
            <SessionRow key={s.id} session={s} />
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-3xl border border-[#E2D5B7] bg-[#FFFDF8] p-6 sm:p-8 shadow-xl shadow-orange-950/5 space-y-6">
      <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-[radial-gradient(ellipse_at_top_right,_rgba(249,115,22,0.10),_transparent_58%)]" />
      <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#E2D5B7]/60">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-orange-100 border border-orange-200 flex items-center justify-center shrink-0 text-[#EA580C]">
            <CalendarDays className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-black text-slate-900 font-heading">Therapy Sessions</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Live schedule from your care team — dates and status summary.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#FFD8C2] bg-[#FFF5ED] px-3 py-1 font-mono text-[10px] font-bold uppercase text-[#C2410C]">
            <CalendarDays className="h-3 w-3" />
            Scheduled
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-3 py-1 font-mono text-[10px] font-bold uppercase text-amber-800">
            <FileText className="h-3 w-3" />
            Note in Progress
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 font-mono text-[10px] font-bold uppercase text-emerald-800">
            <PenLine className="h-3 w-3" />
            BCBA Signed
          </span>
        </div>
      </div>

      <div className="relative space-y-6">
        <section>
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-slate-900 font-heading flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Upcoming Visits
            </h3>
            <span className="font-mono text-[11px] font-bold text-slate-500 uppercase">
              {upcoming.length} Scheduled
            </span>
          </div>
          {upcoming.length === 0 ? (
            <EmptySessionsHint
              icon={CalendarDays}
              title="No upcoming visits scheduled"
              body="When Case Coordination schedules therapy visits, your upcoming dates will appear here."
            />
          ) : (
            <ul className="space-y-2.5">
              {upcoming.map((s) => (
                <SessionRow key={s.id} session={s} />
              ))}
            </ul>
          )}
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-slate-900 font-heading flex items-center gap-2">
              <History className="h-4 w-4 text-slate-400" />
              Past Completed Sessions
            </h3>
            <span className="font-mono text-[11px] font-bold text-slate-500 uppercase">
              {past.length} Completed
            </span>
          </div>
          {past.length === 0 ? (
            <EmptySessionsHint
              icon={History}
              title="No completed sessions yet"
              body="After therapy sessions finish, completed records and BCBA attestations will be listed here."
            />
          ) : (
            <ul className="space-y-2.5">
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
  const mounted = useSyncExternalStore(
    subscribeToClientMount,
    getClientSnapshot,
    getServerSnapshot,
  );
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const rejectionDetails =
    packet.rejectionDetails && typeof packet.rejectionDetails === 'object' && !Array.isArray(packet.rejectionDetails)
      ? (packet.rejectionDetails as Record<string, string>)
      : {};
  const rejectionFormData = parsePacketFormData(packet.formData);
  const clinicalCorrectionLoop = isClinicalFamilyCorrectionLoop({
    clientStatus: client.status,
    packetStatus: packet.status,
    rejectionDetails,
  });
  const correctionSummary = summarizeClinicalCorrectionStates(rejectionFormData, rejectionDetails);
  const awaitingFamilyCount = correctionSummary.awaitingFamilyKeys.length;
  const clinicalParentActionNeeded =
    clinicalCorrectionLoop &&
    parentNeedsClinicalCorrectionAction({
      formData: rejectionFormData,
      rejectionDetails,
      packetDocFlags: {
        insuranceCardFrontUploaded: packet.insuranceCardFrontUploaded,
        insuranceCardBackUploaded: packet.insuranceCardBackUploaded,
        medicaidCardFrontUploaded: packet.medicaidCardFrontUploaded,
        medicaidCardBackUploaded: packet.medicaidCardBackUploaded,
        diagnosticEvalUploaded: packet.diagnosticEvalUploaded,
        physicianRxUploaded: packet.physicianRxUploaded,
        iepUploaded: packet.iepUploaded,
        custodyDocsUploaded: packet.custodyDocsUploaded,
        priorAbaRecordsUploaded: packet.priorAbaRecordsUploaded,
      },
    });
  const pendingCssReview =
    clinicalCorrectionLoop && !clinicalParentActionNeeded && correctionSummary.hasNeedsCssReview;
  const hasChangesRequested =
    (clinicalCorrectionLoop && awaitingFamilyCount > 0) ||
    (packet.status === 'PENDING_CLIENT_SUBMISSION' &&
      Object.keys(rejectionDetails).length > 0 &&
      !clinicalCorrectionLoop);
  const packetNeedsParentAction =
    packet.status === 'PENDING_CLIENT_SUBMISSION' || clinicalParentActionNeeded;

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
    packetNeedsParentAction || needsTreatmentPlanSig || needsScheduleBuilder
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
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const [isUploadingDoc, setIsUploadingDoc] = useState(false);
  const [lastMessages, setLastMessages] = useState(messages);
  const [localMessages, setLocalMessages] = useState<ClientMessage[]>(messages);
  const [isPending, startTransition] = useTransition();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const typedName = parentSignatureName.trim();
  const nameSoftMismatch =
    Boolean(typedName) &&
    Boolean(expectedGuardianName) &&
    normalizeGuardianName(typedName) !== normalizeGuardianName(expectedGuardianName!);
  const canSign = Boolean(typedName) && planReviewed && !isSigning;

  const [unreadCount, setUnreadCount] = useState(
    messages.filter((message) => !message.isFromClient && !message.readAt).length
  );

  if (messages !== lastMessages) {
    setLastMessages(messages);
    setLocalMessages(messages);
  }

  useEffect(() => {
    if (activeTab === 'messages') {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [localMessages.length, activeTab]);

  // Close plus menu on outside click
  useEffect(() => {
    const handleClickOutside = () => setShowPlusMenu(false);
    if (showPlusMenu) {
      window.addEventListener('click', handleClickOutside);
      return () => window.removeEventListener('click', handleClickOutside);
    }
  }, [showPlusMenu]);

  const handleSendMessage = (e?: React.FormEvent) => {
    e?.preventDefault();
    const body = messageText.trim();
    if (!body) return;

    const optimisticId = `local-${Date.now()}`;
    const optimisticMsg: ClientMessage = {
      id: optimisticId,
      clientId: client.id,
      content: body,
      isFromClient: true,
      senderName: client.guardianName || 'Parent / Guardian',
      createdAt: new Date(),
      readAt: null,
    };

    setLocalMessages((prev) => [...prev, optimisticMsg]);
    setMessageText('');

    startTransition(async () => {
      const res = await sendClientMessage(client.id, body);
      if (!res?.success) {
        toast.error(res?.error || 'Failed to send message.');
      }
    });
  };

  const handleStartJitsiCall = () => {
    setShowPlusMenu(false);
    const roomUrl = generateJitsiRoomUrl(client.id, 'parent');
    const encoded = encodeCallContent(roomUrl, 'Parent Requested Video Meeting');

    const optimisticId = `local-call-${Date.now()}`;
    const optimisticMsg: ClientMessage = {
      id: optimisticId,
      clientId: client.id,
      content: encoded,
      isFromClient: true,
      senderName: client.guardianName || 'Parent / Guardian',
      createdAt: new Date(),
      readAt: null,
    };

    setLocalMessages((prev) => [...prev, optimisticMsg]);
    toast.success('Instant video meeting created!');
    launchJitsiMeetingWindow(roomUrl);

    startTransition(async () => {
      await sendClientMessage(client.id, encoded);
    });
  };

  const handleDocumentSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setShowPlusMenu(false);
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      toast.error('File size exceeds 10MB limit.');
      return;
    }

    setIsUploadingDoc(true);
    const toastId = toast.loading('Uploading document to care team...');
    try {
      const formData = new FormData();
      formData.append('file', file);

      const pathParts = window.location.pathname.split('/');
      const headers: Record<string, string> = {};
      if (pathParts[1] === 'magic-link' && pathParts[2]) {
        headers['x-magic-link-token'] = pathParts[2];
      }

      const res = await fetch('/api/upload', {
        method: 'POST',
        headers,
        body: formData,
      });

      const data = await res.json();
      if (!res.ok || !data?.url) {
        throw new Error(data?.error || 'Upload failed');
      }

      toast.dismiss(toastId);
      toast.success('Document uploaded and shared with clinic!');

      const encoded = encodeDocContent(data.url, file.name);
      const optimisticId = `local-doc-${Date.now()}`;
      const optimisticMsg: ClientMessage = {
        id: optimisticId,
        clientId: client.id,
        content: encoded,
        isFromClient: true,
        senderName: client.guardianName || 'Parent / Guardian',
        createdAt: new Date(),
        readAt: null,
      };

      setLocalMessages((prev) => [...prev, optimisticMsg]);

      startTransition(async () => {
        await sendClientMessage(client.id, encoded);
      });
    } catch (err: unknown) {
      toast.dismiss(toastId);
      toast.error(err instanceof Error ? err.message : 'Could not upload document.');
    } finally {
      setIsUploadingDoc(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
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

  const actionItemsBadgeCount =
    (packetNeedsParentAction ? 1 : 0) +
    (needsTreatmentPlanSig ? 1 : 0) +
    (needsScheduleBuilder ? 1 : 0);

  const switchTab = (tab: 'forms' | 'tracker' | 'schedule' | 'messages') => {
    setActiveTab(tab);
    setMobileMenuOpen(false);
    if (tab === 'messages' && unreadCount > 0) {
      setUnreadCount(0);
      markClientMessagesAsRead(client.id);
    }
  };

  useEffect(() => {
    document.documentElement.setAttribute('data-portal', 'parent-magic-link');
    return () => {
      document.documentElement.removeAttribute('data-portal');
    };
  }, []);

  const navItems = [
    {
      id: 'forms' as const,
      name: 'Action Items',
      sublabel: 'Forms & Documents',
      icon: CheckCircle2,
      badge: actionItemsBadgeCount > 0 ? actionItemsBadgeCount : null,
      badgeColor: 'bg-orange-500 text-white',
    },
    {
      id: 'tracker' as const,
      name: 'Care Tracker',
      sublabel: `Step ${currentStep} of 7`,
      icon: TrendingUp,
      badge: null,
      badgeColor: '',
    },
    ...(showScheduleTab
      ? [
          {
            id: 'schedule' as const,
            name: 'My Schedule',
            sublabel: 'Weekly Visits',
            icon: CalendarDays,
            badge: upcomingSessions.length > 0 ? upcomingSessions.length : null,
            badgeColor: 'bg-emerald-500 text-white',
          },
        ]
      : []),
    {
      id: 'messages' as const,
      name: 'Care Team Chat',
      sublabel: 'Direct Messaging',
      icon: MessageSquare,
      badge: unreadCount > 0 ? unreadCount : null,
      badgeColor: 'bg-orange-500 text-white',
    },
  ];

  return (
    <div data-portal="parent-magic-link" className="magic-link-isolated min-h-screen bg-[#FFFDF8] text-slate-900 font-sans pb-24 md:pb-12 antialiased selection:bg-orange-100 selection:text-orange-900 relative flex">
      {/* Background Subtle Radial Orange Gradients (HRM Luxury Light Style) */}
      <div className="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(ellipse_900px_700px_at_20%_10%,_rgba(255,122,69,0.08),_transparent_70%),radial-gradient(ellipse_1000px_800px_at_80%_85%,_rgba(249,115,22,0.06),_transparent_70%)]" />

      {/* PC MODE SIDEBAR (COLLAPSIBLE HOVER LIKE CRM & HRM) */}
      {/* Spacer div for PC layout */}
      <div className="w-[76px] flex-shrink-0 transition-all duration-300 hidden md:block border-r bg-[#F2ECE0] border-[#E2D5B7]" />

      {/* Modern Collapsible Sidebar Container */}
      <aside
        aria-label="Parent Portal Navigation"
        className="group fixed top-0 left-0 h-full w-[76px] hover:w-[260px] border-r-2 border-[#E2D5B7] py-5 px-[14px] flex flex-col z-50 transition-all duration-300 ease-in-out overflow-hidden bg-[#F2ECE0] text-slate-900 shadow-2xl hidden md:flex"
      >
        {/* Brand Header */}
        <div className="flex items-center gap-3 px-1 pb-4 mb-3 border-b border-[#E2D5B7] whitespace-nowrap min-w-[230px]">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#FF7A45] via-orange-500 to-amber-500 flex items-center justify-center flex-shrink-0 shadow-lg shadow-orange-500/25 border border-orange-400/40 hover:scale-105 transition-transform text-white">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <div className="font-heading font-black text-base tracking-tight text-slate-900 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
              Rise <span className="text-[#EA580C]">&amp;</span> Shine
            </div>
            <div className="flex items-center gap-1.5 font-mono text-[10px] text-[#EA580C] font-extrabold tracking-wider opacity-0 group-hover:opacity-100 transition-opacity duration-300">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>Family Portal</span>
            </div>
          </div>
        </div>

        {/* Client Mini Profile (Visible when expanded) */}
        <div className="mb-4 px-2.5 py-2.5 rounded-2xl bg-white/80 border border-[#E2D5B7] opacity-0 group-hover:opacity-100 transition-opacity duration-300 whitespace-nowrap overflow-hidden shadow-xs">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-xl bg-orange-100 border border-orange-200 text-[#EA580C] flex items-center justify-center font-bold text-xs shrink-0">
              {client.firstName?.[0]}{client.lastName?.[0]}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-bold text-slate-900 truncate">
                {client.firstName} {client.lastName}
              </div>
              <div className="text-[10px] font-mono font-semibold text-slate-500 truncate">
                {client.status.replace(/_/g, ' ')}
              </div>
            </div>
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 space-y-1.5 overflow-x-hidden overflow-y-hidden group-hover:overflow-y-auto pr-1">
          {navItems.map((item) => {
            const IconComp = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => switchTab(item.id)}
                className={`flex items-center gap-3 px-3.5 group-hover:px-3 w-[46px] h-[44px] group-hover:w-[230px] rounded-2xl text-xs font-bold cursor-pointer transition-all duration-300 ease-in-out whitespace-nowrap overflow-hidden group/item ${
                  active
                    ? 'bg-gradient-to-r from-orange-500 via-orange-500 to-amber-500 text-white font-extrabold shadow-md shadow-orange-500/20 border border-orange-600'
                    : 'text-slate-700 hover:bg-white hover:text-[#EA580C] border border-transparent shadow-xs'
                }`}
                title={item.name}
              >
                {/* Icon */}
                <span className={`w-[20px] flex-shrink-0 flex items-center justify-center transition-transform duration-200 ${
                  active ? 'text-white scale-110' : 'text-[#EA580C] group-hover/item:scale-110'
                }`}>
                  <IconComp size={18} />
                </span>

                {/* Label & Sublabel */}
                <span className="opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-between flex-1 min-w-0">
                  <span className="text-left">
                    <span className={`block truncate ${active ? 'text-white font-black' : 'text-slate-900'}`}>{item.name}</span>
                    <span className={`block text-[10px] font-mono font-medium truncate ${active ? 'text-white/80' : 'text-slate-500'}`}>{item.sublabel}</span>
                  </span>

                  {item.badge && (
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-black ${
                      active ? 'bg-white text-[#EA580C]' : 'bg-[#EA580C] text-white'
                    }`}>
                      {item.badge}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </nav>

        {/* Footer Section */}
        <div className="pt-3 border-t border-[#E2D5B7] whitespace-nowrap min-w-[230px] space-y-1.5">
          <div className="flex items-center gap-2 px-2 text-slate-500">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="text-[10px] font-mono font-bold opacity-0 group-hover:opacity-100 transition-opacity duration-300 text-slate-700 truncate">
              Single Device Bound
            </span>
          </div>
          {client.guardianName && (
            <div className="px-2 text-[10px] text-slate-500 font-mono opacity-0 group-hover:opacity-100 transition-opacity duration-300 truncate">
              Guardian: <strong className="text-slate-800">{client.guardianName}</strong>
            </div>
          )}
        </div>
      </aside>

      {/* Main Content Column */}
      <div className="flex-1 min-w-0 flex flex-col relative z-10">
        {/* Top Navbar */}
        <header className="sticky top-0 z-40 border-b border-[#E2D5B7] bg-[#FFFDF8]/95 backdrop-blur-xl shadow-xs">
          <div className="max-w-5xl w-full mx-auto px-4 py-3 flex items-center justify-between gap-3">
            {/* Active Section & Child Context */}
            <div className="flex items-center gap-3">
              {/* Mobile Only Brand Icon */}
              <div className="md:hidden w-10 h-10 rounded-2xl bg-gradient-to-br from-[#FF7A45] via-orange-500 to-amber-500 flex items-center justify-center text-white shadow-md shadow-orange-500/25 shrink-0">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-heading font-black text-base sm:text-lg text-slate-900 tracking-tight">
                    {activeTab === 'forms' && 'Action Items & Documents'}
                    {activeTab === 'tracker' && 'Care Journey Tracker'}
                    {activeTab === 'schedule' && 'Weekly Schedule & Visits'}
                    {activeTab === 'messages' && 'Care Team Messaging'}
                  </span>
                  <span className="text-[10px] font-mono font-bold uppercase tracking-wider bg-[#FFF5ED] text-[#C2410C] border border-[#FFD8C2] px-2.5 py-0.5 rounded-full">
                    Step {currentStep} / 7
                  </span>
                </div>
                <p className="text-xs text-slate-500 font-medium truncate max-w-[200px] sm:max-w-sm">
                  Child: <span className="text-slate-900 font-bold">{client.firstName} {client.lastName}</span>
                </p>
              </div>
            </div>

            {/* Desktop Right Info */}
            <div className="hidden md:flex items-center gap-3">
              <ClientNotificationBell
                token={packet.magicLinkToken ?? undefined}
                clientId={client.id}
                onNavigate={(url) => {
                  if (url.includes('messages') || url.includes('chat')) setActiveTab('messages');
                  else if (url.includes('schedule')) setActiveTab('schedule');
                  else if (url.includes('tracker')) setActiveTab('tracker');
                  else if (url.includes('forms') || url.includes('docs')) setActiveTab('forms');
                }}
              />
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#F9F5EC] border border-[#E2D5B7] text-slate-700 text-xs font-mono font-bold">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>Protected Device Bound</span>
              </div>
            </div>

            {/* Mobile Actions: Notification Bell + Hamburger */}
            <div className="flex md:hidden items-center gap-2">
              <ClientNotificationBell
                token={packet.magicLinkToken ?? undefined}
                clientId={client.id}
                onNavigate={(url) => {
                  if (url.includes('messages') || url.includes('chat')) setActiveTab('messages');
                  else if (url.includes('schedule')) setActiveTab('schedule');
                  else if (url.includes('tracker')) setActiveTab('tracker');
                  else if (url.includes('forms') || url.includes('docs')) setActiveTab('forms');
                }}
              />
              <button
                type="button"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="p-2.5 rounded-2xl border border-[#E2D5B7] bg-[#F9F5EC] hover:bg-orange-50 text-slate-700 transition cursor-pointer relative"
                aria-label="Toggle navigation menu"
              >
                {mobileMenuOpen ? <X className="w-5 h-5 text-orange-600" /> : <Menu className="w-5 h-5 text-slate-800" />}
                {(actionItemsBadgeCount > 0 || unreadCount > 0) && !mobileMenuOpen && (
                  <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-[#EA580C] border-2 border-white" />
                )}
              </button>
            </div>
          </div>
        </header>

      {/* Mobile Drawer Navigation (React Portal Mounted) */}
      {mobileMenuOpen && mounted && createPortal(
        <div
          className="fixed inset-0 z-[100] flex flex-col bg-black/50 backdrop-blur-sm animate-fade-in md:hidden"
          onClick={() => setMobileMenuOpen(false)}
        >
          <div
            className="w-full bg-[#FFFDF8] border-b border-[#E2D5B7] p-6 space-y-6 rounded-b-3xl shadow-2xl animate-slide-up relative overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[radial-gradient(ellipse_at_top_right,_rgba(249,115,22,0.12),_transparent_58%)]" />

            <div className="relative flex items-center justify-between pb-4 border-b border-[#E2D5B7]/60">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 text-white flex items-center justify-center font-bold shadow-md shadow-orange-500/20">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-heading font-black text-slate-900 text-base">Navigation Menu</h3>
                  <p className="text-xs text-slate-500">{client.firstName} {client.lastName}&apos;s Portal</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="p-2 rounded-xl bg-[#F9F5EC] hover:bg-orange-50 text-slate-700 cursor-pointer border border-[#E2D5B7]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Mobile Tab List */}
            <div className="relative space-y-2.5">
              <button
                type="button"
                onClick={() => switchTab('forms')}
                className={`w-full p-4 rounded-2xl flex items-center justify-between text-left transition cursor-pointer ${
                  activeTab === 'forms' ? 'bg-[#FFF5ED] border-2 border-[#EA580C] text-[#9A3412]' : 'bg-white border border-[#E2D5B7] text-slate-800'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                    activeTab === 'forms' ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-white' : 'bg-[#F9F5EC] text-slate-700 border border-[#E2D5B7]'
                  }`}>
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-bold text-sm">Action Items &amp; Forms</div>
                    <div className="text-xs text-slate-500">Pending intake &amp; approvals</div>
                  </div>
                </div>
                {actionItemsBadgeCount > 0 && (
                  <span className="bg-[#EA580C] text-white text-xs font-bold px-2 py-0.5 rounded-full">
                    {actionItemsBadgeCount}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => switchTab('tracker')}
                className={`w-full p-4 rounded-2xl flex items-center justify-between text-left transition cursor-pointer ${
                  activeTab === 'tracker' ? 'bg-[#FFF5ED] border-2 border-[#EA580C] text-[#9A3412]' : 'bg-white border border-[#E2D5B7] text-slate-800'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                    activeTab === 'tracker' ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-white' : 'bg-[#F9F5EC] text-slate-700 border border-[#E2D5B7]'
                  }`}>
                    <TrendingUp className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-bold text-sm">Progress Tracker</div>
                    <div className="text-xs text-slate-500">Live 7-stage roadmap</div>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400" />
              </button>

              {showScheduleTab && (
                <button
                  type="button"
                  onClick={() => switchTab('schedule')}
                  className={`w-full p-4 rounded-2xl flex items-center justify-between text-left transition cursor-pointer ${
                    activeTab === 'schedule' ? 'bg-[#FFF5ED] border-2 border-[#EA580C] text-[#9A3412]' : 'bg-white border border-[#E2D5B7] text-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                      activeTab === 'schedule' ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-white' : 'bg-[#F9F5EC] text-slate-700 border border-[#E2D5B7]'
                    }`}>
                      <CalendarDays className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="font-bold text-sm">My Schedule</div>
                      <div className="text-xs text-slate-500">Visits &amp; availability</div>
                    </div>
                  </div>
                  {hasUpcomingSessions && (
                    <span className="bg-[#FFF5ED] text-[#C2410C] border border-[#FFD8C2] text-xs font-bold px-2 py-0.5 rounded-full font-mono">
                      {upcomingSessions.length}
                    </span>
                  )}
                </button>
              )}

              <button
                type="button"
                onClick={() => switchTab('messages')}
                className={`w-full p-4 rounded-2xl flex items-center justify-between text-left transition cursor-pointer ${
                  activeTab === 'messages' ? 'bg-[#FFF5ED] border-2 border-[#EA580C] text-[#9A3412]' : 'bg-white border border-[#E2D5B7] text-slate-800'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                    activeTab === 'messages' ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-white' : 'bg-[#F9F5EC] text-slate-700 border border-[#E2D5B7]'
                  }`}>
                    <MessageSquare className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-bold text-sm">Direct Messages</div>
                    <div className="text-xs text-slate-500">Chat with care team</div>
                  </div>
                </div>
                {unreadCount > 0 && (
                  <span className="bg-[#EA580C] text-white text-xs font-bold px-2 py-0.5 rounded-full">
                    {unreadCount}
                  </span>
                )}
              </button>
            </div>

            {/* Mobile Device Status */}
            <div className="relative p-4 rounded-2xl bg-[#F9F5EC] border border-[#E2D5B7] flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 text-slate-700">
                <Lock className="w-4 h-4 text-emerald-600" />
                <span className="font-medium">Single-Device Lock Active</span>
              </div>
              <span className="text-emerald-800 font-bold font-mono">SECURE</span>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Main Container */}
      <main className="relative z-10 max-w-5xl mx-auto px-4 py-6 sm:py-8 space-y-6">
        {justSubmitted && (
          <div className="animate-slide-up rounded-3xl border-2 border-emerald-400 bg-emerald-50/90 p-5 sm:p-6 shadow-xl text-slate-900">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 shrink-0 rounded-2xl bg-emerald-100 border border-emerald-300 flex items-center justify-center text-emerald-700">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-black text-slate-900 font-heading">
                  Packet Received — Thank You!
                </h2>
                <p className="text-sm text-slate-700 mt-1 leading-relaxed font-medium">
                  Our intake team is reviewing your submitted forms and documents now. We&apos;ll notify you here if anything else is needed — you can follow real-time progress in the Progress Tracker.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ================= TAB 1: ACTION ITEMS / FORMS ================= */}
        {activeTab === 'forms' && (
          <div className="animate-slide-up space-y-6">
            {hasUpcomingSessions && (
              <TherapyLoopCard upcoming={upcomingSessions} past={pastSessions} compact />
            )}

            {/* Treatment Plan Signing Box */}
            {needsTreatmentPlanSig && (
              <div className="relative overflow-hidden rounded-3xl border border-[#E2D5B7] bg-[#FFFDF8] p-6 sm:p-8 shadow-xl shadow-orange-950/5 space-y-6">
                <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-[radial-gradient(ellipse_at_top_right,_rgba(249,115,22,0.12),_transparent_58%)]" />
                <div className="relative flex items-start gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-orange-100 border border-orange-200 flex items-center justify-center text-[#EA580C] shrink-0">
                    <PenLine className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-slate-900 font-heading">
                      Treatment Plan Signature Required
                    </h2>
                    <p className="text-sm text-slate-600 mt-0.5">
                      Your BCBA supervisor has finalized the clinical treatment plan. Please review the summary below and e-sign.
                    </p>
                  </div>
                </div>

                <div className="relative bg-[#F9F5EC] rounded-2xl p-6 border border-[#E2D5B7] space-y-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm text-slate-700">
                    <div className="bg-white p-4 rounded-xl border border-[#E2D5B7]">
                      <span className="text-xs font-mono uppercase text-slate-400 block mb-0.5">Total ABA Hours</span>
                      <strong className="text-slate-900 text-base">{planReview.hours97153 || 0} hrs/week</strong>
                    </div>
                    <div className="bg-white p-4 rounded-xl border border-[#E2D5B7]">
                      <span className="text-xs font-mono uppercase text-slate-400 block mb-0.5">Requested 97155 protocol-modification service hours (qualified clinician)</span>
                      <strong className="text-slate-900 text-base">{planReview.hours97155 || 0} hrs/week</strong>
                    </div>
                    <div className="bg-white p-4 rounded-xl border border-[#E2D5B7]">
                      <span className="text-xs font-mono uppercase text-slate-400 block mb-0.5">Parent Training (97156)</span>
                      <strong className="text-slate-900 text-base">{planReview.hours97156 || 0} hrs/week</strong>
                    </div>
                    <div className="bg-white p-4 rounded-xl border border-[#E2D5B7]">
                      <span className="text-xs font-mono uppercase text-slate-400 block mb-0.5">Service Location(s)</span>
                      <strong className="text-slate-900 text-base">{planReview.primaryLocations.join(', ') || 'Home'}</strong>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-[#E2D5B7] space-y-3">
                    <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide">Goals &amp; Safety Plan</h3>
                    {planReview.goals.length === 0 ? (
                      <p className="text-sm text-slate-500">No specific goal lines were listed. Contact your clinic coordinator if you have questions.</p>
                    ) : (
                      <ul className="space-y-2">
                        {planReview.goals.map((goal, index) => (
                          <li
                            key={`${goal.kind}-${index}`}
                            className="rounded-xl border border-[#E2D5B7] bg-white px-4 py-3 text-sm text-slate-800"
                          >
                            <span className="font-mono text-[10px] font-bold uppercase tracking-wide bg-[#F9F5EC] text-slate-700 px-2 py-0.5 rounded-md mr-2 border border-[#E2D5B7]">
                              {goal.kind}
                            </span>
                            <span className="font-bold text-slate-900">{goal.label}</span>
                            {goal.detail && goal.detail !== goal.label ? (
                              <p className="text-xs text-slate-500 mt-1">{goal.detail}</p>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="rounded-xl border border-[#FFD8C2] bg-[#FFF5ED] p-4">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-[#C2410C] mb-1">Crisis &amp; Safety Protocol</p>
                      <p className="text-sm text-slate-700 whitespace-pre-wrap">
                        {planReview.crisisPlan || 'Follow general safety protocols provided during initial assessment.'}
                      </p>
                    </div>
                  </div>

                  <label className="flex items-start gap-3 cursor-pointer select-none pt-4 border-t border-[#E2D5B7]">
                    <input
                      type="checkbox"
                      className="mt-1 h-5 w-5 cursor-pointer rounded-lg border-slate-300 text-orange-600 focus:ring-orange-500/30"
                      checked={planReviewed}
                      onChange={(e) => {
                        setPlanReviewed(e.target.checked);
                        setSignError(null);
                      }}
                      disabled={isSigning}
                    />
                    <span className="text-sm text-slate-700 font-medium">
                      I have reviewed and agree to the clinical goals, crisis/safety protocol, and weekly service hours specified above.
                    </span>
                  </label>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-2">Parent / Guardian Legal E-Signature</label>
                    <input
                      type="text"
                      className={`w-full rounded-xl p-3.5 text-slate-900 transition-all font-serif text-lg outline-none border ${
                        !typedName
                          ? 'border-amber-300 bg-amber-50/50 focus:border-amber-500'
                          : 'border-slate-300 bg-white focus:border-orange-500'
                      }`}
                      placeholder="Type your full legal name to sign"
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
                      <p className="mt-2 text-xs text-amber-700 font-medium">
                        Note: Typed signature differs slightly from guardian name on record ({expectedGuardianName}).
                      </p>
                    )}
                  </div>

                  {signError && (
                    <p className="text-sm text-red-700 border border-red-200 bg-red-50 rounded-xl px-4 py-3">{signError}</p>
                  )}
                  {signWarning && (
                    <p className="text-sm text-amber-800 border border-amber-200 bg-amber-50 rounded-xl px-4 py-3">{signWarning}</p>
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
                    className={`w-full font-black py-4 rounded-2xl transition-all cursor-pointer flex items-center justify-center gap-2 ${
                      canSign
                        ? 'bg-gradient-to-r from-orange-500 via-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white shadow-lg shadow-orange-500/25 hover:scale-[1.01]'
                        : 'bg-[#E2D5B7] text-[#8C826A] cursor-not-allowed'
                    }`}
                  >
                    {isSigning ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
                    <span>{isSigning ? 'Signing & Submitting...' : 'Sign & Submit Treatment Plan'}</span>
                  </button>
                </div>
              </div>
            )}

            {/* Schedule Builder */}
            {needsScheduleBuilder && (
              <div className="animate-slide-up">
                <ClientScheduleBuilder client={client} paRequests={client.paRequests || []} />
              </div>
            )}

            {/* Continuous Intake Form */}
            {packetNeedsParentAction && (
              <div className={`relative overflow-hidden bg-[#FFFDF8] border rounded-3xl p-6 sm:p-8 shadow-xl shadow-orange-950/5 ${
                hasChangesRequested ? 'border-red-300' : 'border-[#E2D5B7]'
              }`}>
                <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-[radial-gradient(ellipse_at_top_right,_rgba(249,115,22,0.08),_transparent_58%)]" />

                {hasChangesRequested ? (
                  <div className="relative mb-6 p-4 rounded-2xl bg-red-50 border border-red-200 space-y-1">
                    <h2 className="text-lg font-bold text-red-900 flex items-center gap-2">
                      <AlertCircle className="w-5 h-5 text-red-600" />
                      <span>Changes Requested ({awaitingFamilyCount} item{awaitingFamilyCount === 1 ? '' : 's'})</span>
                    </h2>
                    <p className="text-xs text-red-700">
                      {clinicalCorrectionLoop
                        ? 'Clinical Support asked you to re-upload a specific document. Update only the highlighted item below — you do not need to go through Intake again.'
                        : 'Our intake coordinator reviewed your packet and flagged items needing update. Please update the highlighted sections below.'}
                    </p>
                  </div>
                ) : clinicalCorrectionLoop ? (
                  <div className="relative mb-6 p-4 rounded-2xl bg-amber-50 border border-amber-200 space-y-1">
                    <h2 className="text-lg font-bold text-amber-950 flex items-center gap-2">
                      <CheckCircle2 className="w-5 h-5 text-amber-700" />
                      <span>Ready to submit to Clinical Support</span>
                    </h2>
                    <p className="text-xs text-amber-800">
                      Your new file is saved. Tap Submit Updates so Clinical Support can review it.
                    </p>
                  </div>
                ) : (
                  <div className="relative mb-6">
                    <h2 className="text-xl font-black text-slate-900 font-heading">Required Intake &amp; Consent Documents</h2>
                    <p className="text-xs text-slate-500 mt-1">Please complete the required fields and upload necessary medical documents below.</p>
                  </div>
                )}

                <div className="relative">
                  <ContinuousIntakeForm packet={packet} client={client} />
                </div>
              </div>
            )}

            {/* All Caught Up */}
            {!needsTreatmentPlanSig && !needsScheduleBuilder && !packetNeedsParentAction && (
              <div className="relative overflow-hidden bg-[#FFFDF8] border border-[#E2D5B7] rounded-3xl p-10 sm:p-14 text-center shadow-xl shadow-orange-950/5 space-y-4">
                <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-[radial-gradient(ellipse_at_top_right,_rgba(249,115,22,0.12),_transparent_58%)]" />
                <div className="relative w-16 h-16 bg-emerald-100 border border-emerald-300 rounded-3xl flex items-center justify-center mx-auto text-emerald-700 shadow-sm">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <h2 className="relative text-2xl sm:text-3xl font-black text-slate-900 font-heading">You&apos;re All Caught Up!</h2>
                <p className="relative text-sm text-slate-600 max-w-md mx-auto leading-relaxed font-medium">
                  {pendingCssReview
                    ? 'We received your updated document. Clinical Support will review it and let you know if anything else is needed.'
                    : showTherapyLoop
                    ? 'No pending forms required. Check My Schedule to view your upcoming sessions and treatment progress.'
                    : 'All necessary documents are in order. Our team is coordinating the next clinical steps for your case.'}
                </p>
              </div>
            )}
          </div>
        )}

        {/* ================= TAB 2: PROGRESS TRACKER ================= */}
        {activeTab === 'tracker' && (
          <div className="animate-slide-up space-y-6">
            {hasUpcomingSessions && (
              <TherapyLoopCard upcoming={upcomingSessions} past={pastSessions} compact />
            )}

            <div className="relative overflow-hidden bg-[#FFFDF8] border border-[#E2D5B7] p-6 sm:p-8 rounded-3xl shadow-xl shadow-orange-950/5">
              <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-[radial-gradient(ellipse_at_top_right,_rgba(249,115,22,0.12),_transparent_58%)]" />

              <div className="relative flex items-center justify-between pb-6 border-b border-[#E2D5B7]/60 mb-8">
                <div>
                  <h2 className="text-xl font-black text-slate-900 font-heading">Case Progress Tracker</h2>
                  <p className="text-xs text-slate-500 mt-0.5">Real-time status of your child&apos;s ABA journey</p>
                </div>
                <span className="font-mono text-xs font-bold uppercase bg-[#FFF5ED] text-[#C2410C] border border-[#FFD8C2] px-3.5 py-1 rounded-full shadow-xs">
                  Stage {currentStep} of 7
                </span>
              </div>

              {/* Interactive Timeline */}
              <div className="relative space-y-6 before:absolute before:inset-0 before:left-5 before:h-full before:w-0.5 before:bg-[#E2D5B7]">
                {/* Step 1 */}
                <div className="relative flex items-start gap-4">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 z-10 font-bold text-xs shadow-md ${
                    currentStep >= 1 ? 'bg-gradient-to-br from-orange-500 to-amber-500 text-white shadow-orange-500/25' : 'bg-[#F9F5EC] text-slate-500 border border-[#E2D5B7]'
                  }`}>
                    {currentStep > 1 ? <Check className="w-5 h-5" /> : '1'}
                  </div>
                  <div className={`flex-1 p-4 rounded-2xl border ${
                    currentStep === 1 ? 'border-orange-300 bg-[#FFF5ED]/80 shadow-xs' : 'border-[#E2D5B7] bg-white'
                  }`}>
                    <h3 className="font-bold text-sm text-slate-900">Step 1: Intake &amp; Documents</h3>
                    <p className="text-xs text-slate-600 mt-1">Collecting demographic info, consent signatures, and insurance records.</p>
                  </div>
                </div>

                {/* Step 2 */}
                <div className="relative flex items-start gap-4">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 z-10 font-bold text-xs shadow-md ${
                    currentStep >= 2 ? 'bg-gradient-to-br from-orange-500 to-amber-500 text-white shadow-orange-500/25' : 'bg-[#F9F5EC] text-slate-500 border border-[#E2D5B7]'
                  }`}>
                    {currentStep > 2 ? <Check className="w-5 h-5" /> : '2'}
                  </div>
                  <div className={`flex-1 p-4 rounded-2xl border ${
                    currentStep === 2 ? 'border-orange-300 bg-[#FFF5ED]/80 shadow-xs' : 'border-[#E2D5B7] bg-white'
                  }`}>
                    <h3 className="font-bold text-sm text-slate-900">Step 2: Clinical Intake Review</h3>
                    <p className="text-xs text-slate-600 mt-1">Clinical leadership reviews diagnostics and medical necessity.</p>
                  </div>
                </div>

                {/* Step 3 */}
                <div className="relative flex items-start gap-4">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 z-10 font-bold text-xs shadow-md ${
                    currentStep >= 3 ? 'bg-gradient-to-br from-orange-500 to-amber-500 text-white shadow-orange-500/25' : 'bg-[#F9F5EC] text-slate-500 border border-[#E2D5B7]'
                  }`}>
                    {currentStep > 3 ? <Check className="w-5 h-5" /> : '3'}
                  </div>
                  <div className={`flex-1 p-4 rounded-2xl border ${
                    currentStep === 3 ? 'border-orange-300 bg-[#FFF5ED]/80 shadow-xs' : 'border-[#E2D5B7] bg-white'
                  }`}>
                    <h3 className="font-bold text-sm text-slate-900">Step 3: Insurance Prior Authorization</h3>
                    <p className="text-xs text-slate-600 mt-1">Verifying benefits and securing assessment approval from your insurance payer.</p>
                  </div>
                </div>

                {/* Step 4 */}
                <div className="relative flex items-start gap-4">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 z-10 font-bold text-xs shadow-md ${
                    currentStep >= 4 ? 'bg-gradient-to-br from-orange-500 to-amber-500 text-white shadow-orange-500/25' : 'bg-[#F9F5EC] text-slate-500 border border-[#E2D5B7]'
                  }`}>
                    {currentStep > 4 ? <Check className="w-5 h-5" /> : '4'}
                  </div>
                  <div className={`flex-1 p-4 rounded-2xl border ${
                    currentStep === 4 ? 'border-orange-300 bg-[#FFF5ED]/80 shadow-xs' : 'border-[#E2D5B7] bg-white'
                  }`}>
                    <h3 className="font-bold text-sm text-slate-900">Step 4: Initial BCBA Assessment</h3>
                    <p className="text-xs text-slate-600 mt-1">Scheduling and conducting your child&apos;s functional behavior assessment.</p>
                  </div>
                </div>

                {/* Step 5 */}
                <div className="relative flex items-start gap-4">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 z-10 font-bold text-xs shadow-md ${
                    currentStep >= 5 ? 'bg-gradient-to-br from-orange-500 to-amber-500 text-white shadow-orange-500/25' : 'bg-[#F9F5EC] text-slate-500 border border-[#E2D5B7]'
                  }`}>
                    {currentStep > 5 ? <Check className="w-5 h-5" /> : '5'}
                  </div>
                  <div className={`flex-1 p-4 rounded-2xl border ${
                    currentStep === 5 ? 'border-orange-300 bg-[#FFF5ED]/80 shadow-xs' : 'border-[#E2D5B7] bg-white'
                  }`}>
                    <h3 className="font-bold text-sm text-slate-900">Step 5: Treatment Plan Review &amp; Signature</h3>
                    <p className="text-xs text-slate-600 mt-1">Parent review and signature on the customized individualized treatment plan.</p>
                  </div>
                </div>

                {/* Step 6 */}
                <div className="relative flex items-start gap-4">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 z-10 font-bold text-xs shadow-md ${
                    currentStep >= 6 ? 'bg-gradient-to-br from-orange-500 to-amber-500 text-white shadow-orange-500/25' : 'bg-[#F9F5EC] text-slate-500 border border-[#E2D5B7]'
                  }`}>
                    {currentStep > 6 ? <Check className="w-5 h-5" /> : '6'}
                  </div>
                  <div className={`flex-1 p-4 rounded-2xl border ${
                    currentStep === 6 ? 'border-orange-300 bg-[#FFF5ED]/80 shadow-xs' : 'border-[#E2D5B7] bg-white'
                  }`}>
                    <h3 className="font-bold text-sm text-slate-900">Step 6: Staffing &amp; Schedule Matching</h3>
                    <p className="text-xs text-slate-600 mt-1">Matching with an RBT practitioner and establishing weekly session times.</p>
                  </div>
                </div>

                {/* Step 7 */}
                <div className="relative flex items-start gap-4">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 z-10 font-bold text-xs shadow-md ${
                    currentStep >= 7 ? 'bg-gradient-to-br from-emerald-500 to-teal-500 text-white shadow-emerald-500/25' : 'bg-[#F9F5EC] text-slate-500 border border-[#E2D5B7]'
                  }`}>
                    {currentStep >= 7 ? <CheckCircle2 className="w-5 h-5" /> : '7'}
                  </div>
                  <div className={`flex-1 p-4 rounded-2xl border ${
                    currentStep === 7 ? 'border-emerald-300 bg-emerald-50/80 shadow-xs' : 'border-[#E2D5B7] bg-white'
                  }`}>
                    <h3 className="font-bold text-sm text-slate-900">Step 7: Ongoing Active Services</h3>
                    <p className="text-xs text-slate-600 mt-1">Regular direct ABA therapy visits and weekly supervisory sessions in progress.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ================= TAB 3: MY SCHEDULE ================= */}
        {activeTab === 'schedule' && showScheduleTab && (
          <div className="animate-slide-up space-y-6">
            {showTherapyLoop && (
              <TherapyLoopCard upcoming={upcomingSessions} past={pastSessions} />
            )}
            {hasSchedule && (
              <ClientScheduleBuilder client={client} paRequests={client.paRequests || []} />
            )}
            {!hasSchedule && showTherapyLoop && (
              <div className="bg-[#FFFDF8] border border-[#E2D5B7] rounded-3xl p-6 text-center text-xs text-slate-600 shadow-sm">
                Preferred weekly recurring availability can be adjusted with your coordinator. Visit dates update when scheduled by the clinic.
              </div>
            )}
          </div>
        )}

        {/* ================= TAB 4: MESSAGES ================= */}
        {activeTab === 'messages' && (
          <div className="relative overflow-hidden animate-slide-up bg-[#FFFDF8] border border-[#E2D5B7] rounded-3xl shadow-xl shadow-orange-950/5 flex flex-col h-[75vh]">
            {/* Header */}
            <div className="p-4 sm:p-5 border-b border-[#E2D5B7] bg-[#F9F5EC] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-orange-100 border border-orange-200 flex items-center justify-center text-[#EA580C] font-bold">
                  <MessageSquare className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-heading font-black text-slate-900 text-sm sm:text-base">Clinic Concierge &amp; Care Team</h3>
                  <div className="flex items-center gap-1.5 text-xs text-slate-500">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span>Live Secure Message Thread</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Hidden File Input */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleDocumentSelected}
              className="hidden"
              accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
            />

            {/* Message Area */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3 bg-[#F9F5EC]/40">
              {localMessages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-2">
                  <div className="w-14 h-14 rounded-2xl bg-[#F9F5EC] border border-[#E2D5B7] flex items-center justify-center text-slate-400">
                    <MessageSquare className="w-7 h-7" />
                  </div>
                  <p className="text-sm font-bold text-slate-700">No messages yet</p>
                  <p className="text-xs text-slate-500 max-w-xs text-center">
                    Send a message to your intake coordinator and clinical supervisor.
                  </p>
                </div>
              ) : (
                localMessages.map((msg, i) => {
                  const prev = localMessages[i - 1];
                  const newDay =
                    !prev ||
                    new Date(prev.createdAt).toDateString() !==
                      new Date(msg.createdAt).toDateString();
                  const parsed = parseMessageContent(msg.content);

                  return (
                    <React.Fragment key={msg.id}>
                      {newDay && (
                        <div className="flex items-center gap-3 py-2">
                          <div className="flex-1 h-px bg-[#E2D5B7]/60" />
                          <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400">
                            {new Date(msg.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                          </span>
                          <div className="flex-1 h-px bg-[#E2D5B7]/60" />
                        </div>
                      )}
                      <div
                        className={`flex flex-col ${msg.isFromClient ? 'items-end' : 'items-start'}`}
                      >
                        {parsed.type === 'JITSI_CALL' ? (
                          <div className="max-w-[90%] sm:max-w-[75%] p-4 bg-white border border-emerald-300 rounded-2xl shadow-md space-y-3">
                            <div className="flex items-center gap-2">
                              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                              <span className="font-bold text-xs text-emerald-700 uppercase tracking-wider font-mono flex items-center gap-1.5">
                                <Video className="w-4 h-4" /> Live Video Session
                              </span>
                            </div>
                            <p className="text-xs text-slate-700 font-medium">
                              {parsed.text}
                            </p>
                            <button
                              type="button"
                              onClick={() => parsed.callRoomUrl && launchJitsiMeetingWindow(parsed.callRoomUrl)}
                              className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-xs py-2.5 px-4 rounded-xl shadow-md transition-all cursor-pointer flex items-center justify-center gap-2 hover:scale-[1.01]"
                            >
                              <Video className="w-4 h-4 text-white" />
                              <span>Join Video Call →</span>
                            </button>
                          </div>
                        ) : parsed.type === 'DOCUMENT' ? (
                          <div className="max-w-[90%] sm:max-w-[75%] p-3.5 bg-white border border-[#E2D5B7] rounded-2xl flex items-center justify-between gap-3 font-mono text-xs text-slate-800 shadow-xs">
                            <div className="flex items-center gap-2.5 truncate">
                              <div className="w-8 h-8 rounded-xl bg-orange-100 border border-orange-200 flex items-center justify-center text-[#EA580C] shrink-0">
                                <FileText className="w-4 h-4" />
                              </div>
                              <span className="font-bold truncate max-w-[200px] text-slate-900">
                                {parsed.fileName}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => parsed.fileUrl && window.open(parsed.fileUrl, '_blank')}
                              className="p-2 rounded-xl bg-[#F9F5EC] hover:bg-orange-100 text-[#EA580C] border border-[#E2D5B7] transition cursor-pointer shrink-0"
                              title="Download / View document"
                            >
                              <Download className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <div
                            className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-xs ${
                              msg.isFromClient
                                ? 'bg-gradient-to-r from-orange-500 via-orange-500 to-amber-500 text-white rounded-br-xs font-medium shadow-md shadow-orange-500/20'
                                : 'bg-white border border-[#E2D5B7] text-slate-800 rounded-bl-xs'
                            }`}
                          >
                            <p className="whitespace-pre-wrap">{parsed.text}</p>
                          </div>
                        )}
                        <span className="text-[10px] font-mono text-slate-400 mt-1 px-1">
                          {msg.senderName} • {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </React.Fragment>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Bar with '+' Media Drawer */}
            <form onSubmit={handleSendMessage} className="p-3 sm:p-4 border-t border-[#E2D5B7] bg-[#FFFDF8] flex items-center gap-2">
              {/* '+' Menu Toggle Button */}
              <div className="relative">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowPlusMenu(!showPlusMenu);
                  }}
                  className="p-3 rounded-2xl bg-[#F9F5EC] hover:bg-orange-100 text-[#EA580C] border border-[#E2D5B7] transition-all cursor-pointer shrink-0"
                  title="Attach video call or document"
                >
                  <Plus className={`w-5 h-5 transition-transform ${showPlusMenu ? 'rotate-45 text-rose-500' : ''}`} />
                </button>

                {/* Popover Drawer */}
                {showPlusMenu && (
                  <div
                    className="absolute bottom-full left-0 mb-3 w-64 bg-white border border-[#E2D5B7] rounded-2xl p-2 shadow-2xl space-y-1 z-50 animate-in fade-in slide-in-from-bottom-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="px-3 py-1.5 text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                      Media &amp; Meeting Actions
                    </div>
                    <button
                      type="button"
                      onClick={handleStartJitsiCall}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-[#FFF5ED] text-left text-xs font-semibold text-slate-700 transition cursor-pointer"
                    >
                      <div className="w-8 h-8 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center">
                        <Video className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-slate-900 font-bold">Instant Video Meeting</div>
                        <div className="text-[10px] text-slate-500">Connect with care coordinator</div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploadingDoc}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-[#FFF5ED] text-left text-xs font-semibold text-slate-700 transition cursor-pointer disabled:opacity-50"
                    >
                      <div className="w-8 h-8 rounded-xl bg-orange-100 border border-orange-200 text-[#EA580C] flex items-center justify-center">
                        <Paperclip className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-slate-900 font-bold">Share Document / PDF</div>
                        <div className="text-[10px] text-slate-500">Upload records or notes</div>
                      </div>
                    </button>
                  </div>
                )}
              </div>

              <input
                type="text"
                placeholder="Type your message to the clinic..."
                className="flex-1 bg-white border border-[#E2D5B7] rounded-2xl px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 transition"
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
              />
              <button
                type="submit"
                disabled={isPending || !messageText.trim()}
                className="bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-black text-xs px-5 py-3 rounded-2xl transition shadow-md shadow-orange-500/25 flex items-center justify-center gap-1.5 cursor-pointer hover:scale-[1.01]"
              >
                {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                <span className="hidden sm:inline">Send</span>
              </button>
            </form>
          </div>
        )}
      </main>
      </div>

      {/* Mobile Sticky Bottom Navigation Bar */}
      <nav className="fixed bottom-0 inset-x-0 z-40 bg-[#FFFDF8]/95 border-t border-[#E2D5B7] backdrop-blur-xl px-2 py-1.5 flex justify-around items-center md:hidden shadow-lg">
        <button
          type="button"
          onClick={() => switchTab('forms')}
          className={`flex flex-col items-center gap-1 py-1 px-3 rounded-2xl transition cursor-pointer relative ${
            activeTab === 'forms' ? 'text-[#C2410C] font-black' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <div className={`p-1.5 rounded-xl ${activeTab === 'forms' ? 'bg-[#FFF5ED] text-[#EA580C] border border-[#FFD8C2]' : ''}`}>
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <span className="text-[10px]">Actions</span>
          {actionItemsBadgeCount > 0 && (
            <span className="absolute top-1 right-2 w-2 h-2 rounded-full bg-[#EA580C]" />
          )}
        </button>

        <button
          type="button"
          onClick={() => switchTab('tracker')}
          className={`flex flex-col items-center gap-1 py-1 px-3 rounded-2xl transition cursor-pointer relative ${
            activeTab === 'tracker' ? 'text-[#C2410C] font-black' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <div className={`p-1.5 rounded-xl ${activeTab === 'tracker' ? 'bg-[#FFF5ED] text-[#EA580C] border border-[#FFD8C2]' : ''}`}>
            <TrendingUp className="w-5 h-5" />
          </div>
          <span className="text-[10px]">Tracker</span>
        </button>

        {showScheduleTab && (
          <button
            type="button"
            onClick={() => switchTab('schedule')}
            className={`flex flex-col items-center gap-1 py-1 px-3 rounded-2xl transition cursor-pointer relative ${
              activeTab === 'schedule' ? 'text-[#C2410C] font-black' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <div className={`p-1.5 rounded-xl ${activeTab === 'schedule' ? 'bg-[#FFF5ED] text-[#EA580C] border border-[#FFD8C2]' : ''}`}>
              <CalendarDays className="w-5 h-5" />
            </div>
            <span className="text-[10px]">Schedule</span>
            {hasUpcomingSessions && (
              <span className="absolute top-1 right-2 w-2 h-2 rounded-full bg-emerald-500" />
            )}
          </button>
        )}

        <button
          type="button"
          onClick={() => switchTab('messages')}
          className={`flex flex-col items-center gap-1 py-1 px-3 rounded-2xl transition cursor-pointer relative ${
            activeTab === 'messages' ? 'text-[#C2410C] font-black' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <div className={`p-1.5 rounded-xl ${activeTab === 'messages' ? 'bg-[#FFF5ED] text-[#EA580C] border border-[#FFD8C2]' : ''}`}>
            <MessageSquare className="w-5 h-5" />
          </div>
          <span className="text-[10px]">Messages</span>
          {unreadCount > 0 && (
            <span className="absolute top-1 right-2 w-2 h-2 rounded-full bg-[#EA580C]" />
          )}
        </button>
      </nav>
    </div>
  );
}
