'use client';

import React, {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useTransition,
} from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Briefcase,
  MapPin,
  Clock,
  Video,
  MessageSquare,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Plus,
  Baby,
  Languages,
  CalendarDays,
  Sparkles,
  ChevronDown,
  Check,
  RefreshCw,
  ExternalLink,
  Users,
  LoaderCircle,
  ShieldCheck,
} from 'lucide-react';
import {
  closeCaseOpening,
  createCaseOpening,
  recordParentApplicationAcceptance,
  recordParentApplicationDecline,
  sendApplicationStaffMessage,
  sendParentCaseMessage,
  updateCaseApplicationStatus,
} from '@/app/actions/caseOpeningActions';
import {
  WEEK_DAYS,
  WeeklyScheduleUnitGrid,
  countSelectedUnits,
  scheduleToUnitGrid,
  summarizeWeekSchedule,
  unitGridToSchedule,
  unitsToHours,
  type WeekSchedule,
} from './WeeklyScheduleUnitGrid';
import StaffingReadinessChecklist from '@/components/portal-case-coord/StaffingReadinessChecklist';
import {
  ApplicationFlowBar,
  APPLICATION_STATUS_STYLES,
  countNewApplications,
  sortApplicationsByInboxPriority,
} from '@/components/portal-case-coord/ApplicationFlowBar';
import {
  getStaffingReadiness,
  type StaffingReadinessClient,
} from '@/lib/staffingReadiness';
import { resolveNotificationLink } from '@/lib/notificationLinks';

type Application = {
  id: string;
  status: string;
  message: string | null;
  meetAt: string | Date | null;
  meetLink: string | null;
  createdAt?: string | Date | null;
  rbt: { id: string; firstName: string; lastName: string; email: string };
};

type Opening = {
  id: string;
  caseCode: string;
  status: string;
  weeklyHours: number | null;
  borough: string | null;
  zipCode?: string | null;
  childAge?: number | null;
  ageBand?: string | null;
  clientInitials?: string | null;
  scheduleText: string | null;
  daysOfWeek?: string | null;
  scheduleJson?: unknown;
  sessionLengthMinutes?: number | null;
  languagePref?: string | null;
  genderPref?: string | null;
  serviceSetting?: string | null;
  listingHighlights?: string | null;
  bcbaDisplayName?: string | null;
  transportationNotes?: string | null;
  applications: Application[];
};

type TreatmentPlanData = {
  staffingPreferences?: {
    language?: string;
    gender?: string;
    serviceSetting?: string;
  };
  preferredSchedule?: unknown;
};

export type ClientJobBoardData = StaffingReadinessClient & {
  id: string;
  firstName: string;
  lastName: string;
  status: string;
  caseCoordinatorId?: string | null;
  childAge?: number | string | null;
  parentAddress?: string | null;
  treatmentPlan?: unknown;
  intakePacket?: { formData?: unknown } | null;
  caseOpenings?: Opening[];
};

type ActionResponse = {
  success: boolean;
  error?: string;
};

const OPENING_STATUSES = ['OPEN', 'FILLED', 'CLOSED'] as const;
const LIVE_APPLICATION_STATUSES = [
  'APPLIED',
  'MESSAGING',
  'MEET_SCHEDULED',
  'PARENT_PENDING',
] as const;
const TERMINAL_APPLICATION_STATUSES = ['APPROVED', 'REJECTED', 'WITHDRAWN'] as const;
const HRM_JOB_BOARD_URL = resolveNotificationLink('/rbt/job-board').href;
const UNKNOWN_APPLICATION_STYLE = 'border-zinc-500/20 bg-zinc-500/10 text-zinc-400';

const LANGUAGE_OPTIONS = [
  'No preference',
  'English',
  'Spanish',
  'Mandarin',
  'Cantonese',
  'Russian',
  'Arabic',
  'Bengali',
  'Haitian Creole',
  'Other',
];
const GENDER_OPTIONS = ['No preference', 'Female', 'Male'];
const SERVICE_SETTING_OPTIONS = [
  'In-home ABA (97153)',
  'Community-based ABA',
  'Clinic / center-based',
  'Hybrid (home + community)',
];

const selectClass =
  'w-full cursor-pointer rounded-lg border border-white/10 bg-[#09090b] px-3 py-2 text-sm text-white outline-none focus:border-brand-orange-500';

/** Dark custom select — native <option> menus render white on Windows and clash with CRM chrome. */
function DarkSelect({
  label,
  value,
  onChange,
  options,
  placeholder = 'Select…',
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  options: string[];
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const listboxId = useId();

  const focusOption = useCallback((index: number) => {
    const count = options.length;
    if (!count) return;
    const wrapped = (index + count) % count;
    optionRefs.current[wrapped]?.focus();
  }, [options.length]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const selectedIndex = Math.max(0, options.indexOf(value));
    const frame = requestAnimationFrame(() => focusOption(selectedIndex));
    return () => cancelAnimationFrame(frame);
  }, [focusOption, open, options, value]);

  return (
    <div ref={rootRef} className="relative z-20">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setOpen(true);
          }
        }}
        className={`${selectClass} flex items-center justify-between gap-2 text-left`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-label={label}
      >
        <span className={value ? 'truncate text-white' : 'truncate text-zinc-500'}>
          {value || placeholder}
        </span>
        <ChevronDown
          aria-hidden="true"
          className={`h-3.5 w-3.5 shrink-0 text-zinc-400 transition ${open ? 'rotate-180 text-brand-orange-400' : ''}`}
        />
      </button>
      {open && (
        <ul
          id={listboxId}
          role="listbox"
          aria-label={label}
          className="absolute left-0 right-0 z-[80] mt-1.5 max-h-56 overflow-auto rounded-xl border border-white/15 bg-[#09090b] py-1 shadow-[0_20px_50px_rgba(0,0,0,0.9)]"
        >
          {options.map((opt, index) => {
            const selected = opt === value;
            return (
              <li key={opt} role="presentation">
                <button
                  ref={(node) => {
                    optionRefs.current[index] = node;
                  }}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => {
                    onChange(opt);
                    setOpen(false);
                    requestAnimationFrame(() => triggerRef.current?.focus());
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'ArrowDown') {
                      event.preventDefault();
                      focusOption(index + 1);
                    } else if (event.key === 'ArrowUp') {
                      event.preventDefault();
                      focusOption(index - 1);
                    } else if (event.key === 'Home') {
                      event.preventDefault();
                      focusOption(0);
                    } else if (event.key === 'End') {
                      event.preventDefault();
                      focusOption(options.length - 1);
                    } else if (event.key === 'Escape') {
                      event.preventDefault();
                      setOpen(false);
                    }
                  }}
                  className={`flex w-full cursor-pointer items-center justify-between gap-2 px-3 py-2 text-left text-sm transition ${
                    selected
                      ? 'bg-[#1c1917] text-brand-orange-200'
                      : 'bg-[#09090b] text-zinc-200 hover:bg-[#18181b] hover:text-white'
                  }`}
                >
                  <span className="truncate">{opt}</span>
                  {selected && (
                    <Check
                      aria-hidden="true"
                      className="h-3.5 w-3.5 shrink-0 text-brand-orange-400"
                    />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function isKnownOpeningStatus(status: string): status is (typeof OPENING_STATUSES)[number] {
  return OPENING_STATUSES.includes(status as (typeof OPENING_STATUSES)[number]);
}

function isLiveApplicationStatus(
  status: string
): status is (typeof LIVE_APPLICATION_STATUSES)[number] {
  return LIVE_APPLICATION_STATUSES.includes(
    status as (typeof LIVE_APPLICATION_STATUSES)[number]
  );
}

function isTerminalApplicationStatus(
  status: string
): status is (typeof TERMINAL_APPLICATION_STATUSES)[number] {
  return TERMINAL_APPLICATION_STATUSES.includes(
    status as (typeof TERMINAL_APPLICATION_STATUSES)[number]
  );
}

function normalizeZip(raw: unknown): string {
  if (raw == null) return '';
  const digits = String(raw).replace(/\D/g, '').slice(0, 5);
  return digits.length === 5 ? digits : '';
}

function parseRecord(raw: unknown): Record<string, unknown> {
  if (typeof raw === 'string') {
    try {
      return parseRecord(JSON.parse(raw));
    } catch {
      return {};
    }
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return raw as Record<string, unknown>;
}

function zipFromAddress(address?: string | null) {
  if (!address) return '';
  const m = address.match(/\b(\d{5})(?:-\d{4})?\b/);
  return m?.[1] || '';
}

function zipFromClientSources(client: ClientJobBoardData): string {
  const fromParent = zipFromAddress(client.parentAddress);
  if (fromParent) return fromParent;
  const form = parseRecord(client.intakePacket?.formData);
  const directZip = normalizeZip(form.zipCode ?? form.zip);
  if (directZip) return directZip;
  return zipFromAddress(
    [form.address, form.city, form.state, form.zipCode ?? form.zip]
      .filter(Boolean)
      .join(' ')
  );
}

/** NYC ZIP → borough (same idea as Overview address / HRM distance map prefixes). */
function boroughFromZip(zip: string): string {
  const z = (zip || '').replace(/\D/g, '').slice(0, 5);
  if (z.length !== 5) return '';
  const prefix3 = parseInt(z.slice(0, 3), 10);
  if (Number.isNaN(prefix3)) return '';
  if (prefix3 >= 100 && prefix3 <= 102) return 'Manhattan';
  if (prefix3 === 103) return 'Staten Island';
  if (prefix3 === 104) return 'Bronx';
  if (prefix3 === 112) return 'Brooklyn';
  // Only 11004/11005 are NYC; other 110xx ZIPs extend into Nassau County.
  if (
    z === '11004' ||
    z === '11005' ||
    prefix3 === 111 ||
    prefix3 === 113 ||
    prefix3 === 114 ||
    prefix3 === 116
  ) {
    return 'Queens';
  }
  return '';
}

/** Same source as Overview tab: client.childAge (ignore nonsensical values). */
function ageFromOverview(client: ClientJobBoardData): number | null {
  let n: number | null = null;
  if (typeof client?.childAge === 'number' && !Number.isNaN(client.childAge)) {
    n = client.childAge;
  } else if (client?.childAge != null && String(client.childAge).trim() !== '') {
    const parsed = Number(client.childAge);
    if (!Number.isNaN(parsed)) n = parsed;
  }
  if (n == null || n < 0 || n > 30) return null;
  return n;
}

/** Exact daily session length when every selected day uses the same window. */
function sessionLengthFromSchedule(schedule: WeekSchedule): number | null {
  const lengths: number[] = [];
  for (const day of WEEK_DAYS) {
    const slot = schedule[day];
    if (!slot?.start || !slot?.end) continue;
    const [sh, sm] = slot.start.split(':').map(Number);
    const [eh, em] = slot.end.split(':').map(Number);
    const mins = eh * 60 + em - (sh * 60 + sm);
    if (mins > 0) lengths.push(mins);
  }
  if (!lengths.length) return null;
  return lengths.every((length) => length === lengths[0]) ? lengths[0] : null;
}

function ReadOnlyField({
  label,
  value,
  source,
  emptyHint = 'Not on file',
}: {
  label: string;
  value: string;
  source: string;
  emptyHint?: string;
}) {
  const hasValue = !!value && value !== '—';
  return (
    <div className="block space-y-1 text-xs text-zinc-400">
      <div className="flex items-center justify-between gap-2">
        <span>{label}</span>
        <span className="font-mono text-[9px] uppercase tracking-wider text-zinc-600">{source}</span>
      </div>
      <div
        className={`rounded-lg border px-3 py-2 text-sm ${
          hasValue
            ? 'border-white/10 bg-[#09090b] font-semibold text-white'
            : 'border-amber-500/20 bg-amber-500/5 font-medium text-amber-200/90'
        }`}
      >
        {hasValue ? value : emptyHint}
      </div>
    </div>
  );
}

function normalizePreferredSchedule(raw: unknown): WeekSchedule {
  const base: WeekSchedule = Object.fromEntries(WEEK_DAYS.map((d) => [d, null]));
  if (!raw || typeof raw !== 'object') return base;
  const obj = raw as Record<string, unknown>;
  for (const day of WEEK_DAYS) {
    const slot = obj[day];
    if (slot && typeof slot === 'object') {
      const s = slot as { start?: string; end?: string };
      if (s.start && s.end) {
        base[day] = { start: String(s.start), end: String(s.end) };
      }
    }
  }
  return base;
}

function withOption(options: string[], value: string) {
  if (!value || options.includes(value)) return options;
  return [value, ...options];
}

function formatMeetDate(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return 'Invalid date';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(date);
}

function isFutureMeetDate(value: string): boolean {
  if (!value) return false;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) && timestamp > Date.now();
}

export default function ClientJobBoardPanel({
  client,
  onRequestActivationTab,
}: {
  client: ClientJobBoardData;
  /** Jump to First Session & Activate when checklist CTA says schedule/activate */
  onRequestActivationTab?: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const tp = parseRecord(client.treatmentPlan) as TreatmentPlanData;
  const prefs = tp.staffingPreferences || {};
  const preferredScheduleKey = JSON.stringify(tp.preferredSchedule ?? null) || 'null';
  const preferredSchedule = useMemo(
    () => normalizePreferredSchedule(JSON.parse(preferredScheduleKey)),
    [preferredScheduleKey]
  );
  const portalUnitGrid = useMemo(() => scheduleToUnitGrid(preferredSchedule), [preferredSchedule]);

  const [unitGrid, setUnitGrid] = useState(() => scheduleToUnitGrid(preferredSchedule));
  const weekSchedule = useMemo(() => unitGridToSchedule(unitGrid), [unitGrid]);
  const selectedUnits = useMemo(() => countSelectedUnits(unitGrid), [unitGrid]);
  const hoursNeeded = unitsToHours(selectedUnits);

  // Read-only: age from Overview (client.childAge); borough from ZIP; ZIP from address
  const childAge = ageFromOverview(client);
  const zipCode = zipFromClientSources(client);
  const borough = boroughFromZip(zipCode);
  const sessionLength = useMemo(() => sessionLengthFromSchedule(weekSchedule), [weekSchedule]);
  const listingHours = Math.round(hoursNeeded);

  const [languagePref, setLanguagePref] = useState(prefs.language || 'No preference');
  const [genderPref, setGenderPref] = useState(prefs.gender || 'No preference');
  const [serviceSetting, setServiceSetting] = useState(prefs.serviceSetting || '');
  const [listingHighlights, setListingHighlights] = useState('');

  const [rbtMsg, setRbtMsg] = useState('');
  const [parentMsg, setParentMsg] = useState('');
  const [meetAt, setMeetAt] = useState('');
  const [meetAtIsFuture, setMeetAtIsFuture] = useState(false);

  const openCreateForm = () => {
    setUnitGrid(scheduleToUnitGrid(preferredSchedule));
    setLanguagePref(prefs.language || 'No preference');
    setGenderPref(prefs.gender || 'No preference');
    setServiceSetting(prefs.serviceSetting || '');
    setListingHighlights('');
    setActionError(null);
    setShowCreate(true);
  };

  const selectApplication = (applicationId: string) => {
    setSelectedAppId(applicationId);
    setRbtMsg('');
    setMeetAt('');
    setMeetAtIsFuture(false);
    setActionError(null);
  };

  const openings: Opening[] = useMemo(() => {
    const raw = (client.caseOpenings || []) as Opening[];
    return raw.map((o) => ({
      ...o,
      applications: sortApplicationsByInboxPriority(
        (o.applications || []).map((a) => ({
          ...a,
          meetAt: a.meetAt
            ? typeof a.meetAt === 'string'
              ? a.meetAt
              : new Date(a.meetAt).toISOString()
            : null,
          createdAt: a.createdAt
            ? typeof a.createdAt === 'string'
              ? a.createdAt
              : new Date(a.createdAt).toISOString()
            : null,
        }))
      ),
    }));
  }, [client.caseOpenings]);

  const openListings = openings.filter((o) => o.status === 'OPEN');
  const invalidListingStates = openings.filter((o) => !isKnownOpeningStatus(o.status));
  const listingStatesValid = invalidListingStates.length === 0;
  const openListing = openListings[0] ?? null;
  const activeOpening = openListing || openings[0] || null;
  const applications = useMemo(() => activeOpening?.applications || [], [activeOpening]);
  const selectedApp = selectedAppId
    ? applications.find((application) => application.id === selectedAppId) || null
    : applications[0] || null;
  const newAppCount = countNewApplications(applications);
  const applicationCounts = useMemo(
    () => ({
      total: applications.length,
      active: applications.filter((app) => isLiveApplicationStatus(app.status)).length,
      accepted: applications.filter((app) => app.status === 'APPROVED').length,
      declined: applications.filter((app) => app.status === 'REJECTED').length,
      withdrawn: applications.filter((app) => app.status === 'WITHDRAWN').length,
      unknown: applications.filter(
        (app) =>
          !isLiveApplicationStatus(app.status) &&
          !isTerminalApplicationStatus(app.status)
      ).length,
    }),
    [applications]
  );
  const applicationStateIssues: string[] = [];
  if (applicationCounts.accepted > 1) {
    applicationStateIssues.push(`${applicationCounts.accepted} applicants are APPROVED`);
  }
  if (activeOpening?.status === 'OPEN' && applicationCounts.accepted > 0) {
    applicationStateIssues.push('listing is OPEN despite an APPROVED applicant');
  }
  if (activeOpening?.status === 'FILLED' && applicationCounts.accepted !== 1) {
    applicationStateIssues.push(
      `FILLED listing has ${applicationCounts.accepted} APPROVED applicants`
    );
  }
  if (applicationCounts.unknown > 0) {
    applicationStateIssues.push(
      `${applicationCounts.unknown} applicant status${applicationCounts.unknown === 1 ? ' is' : 'es are'} unsupported`
    );
  }

  const readiness = getStaffingReadiness(client);
  const canPost =
    readiness.canPostOpening &&
    !openListing &&
    (client.status === 'STAFFING_PENDING' || client.status === 'ACTIVE');

  const refresh = () => router.refresh();
  const requestRefresh = () => {
    setActionError(null);
    startTransition(() => router.refresh());
  };

  const surfaceActionError = (message: string | undefined, fallback: string) => {
    const next = message?.trim() || fallback;
    setActionError(next);
    toast.error(next);
  };

  const runAction = <T extends ActionResponse,>(
    operation: () => Promise<T>,
    options: {
      successMessage: string | ((result: T) => string);
      fallbackError: string;
      onSuccess?: (result: T) => void;
      refreshAfter?: boolean;
    }
  ) => {
    setActionError(null);
    startTransition(async () => {
      try {
        const result = await operation();
        if (!result.success) {
          surfaceActionError(result.error, options.fallbackError);
          return;
        }
        setActionError(null);
        options.onSuccess?.(result);
        toast.success(
          typeof options.successMessage === 'function'
            ? options.successMessage(result)
            : options.successMessage
        );
        if (options.refreshAfter !== false) refresh();
      } catch {
        surfaceActionError(undefined, options.fallbackError);
      }
    });
  };

  const hasValidZip = /^\d{5}$/.test(zipCode);
  const hasSchedule = selectedUnits > 0;
  const publishChecks = [
    {
      label: 'Staffing readiness and client stage',
      met: readiness.canPostOpening &&
        (client.status === 'STAFFING_PENDING' || client.status === 'ACTIVE'),
    },
    { label: 'Existing listing states are valid', met: listingStatesValid },
    { label: 'No other OPEN listing', met: !openListing },
    { label: 'Valid 5-digit client ZIP', met: hasValidZip },
    { label: 'NYC borough resolved from ZIP', met: Boolean(borough) },
    { label: 'Schedule totals at least one listed hour', met: hasSchedule && listingHours > 0 },
    { label: 'Service setting selected', met: Boolean(serviceSetting) },
  ];
  const canPublish = publishChecks.every((check) => check.met);
  const selectedAppIsLive = selectedApp ? isLiveApplicationStatus(selectedApp.status) : false;
  const selectedAppIsTerminal = selectedApp
    ? isTerminalApplicationStatus(selectedApp.status)
    : false;
  const selectedAppStatusKnown = selectedAppIsLive || selectedAppIsTerminal;
  const canAdvanceSelected =
    activeOpening?.status === 'OPEN' &&
    selectedAppIsLive &&
    openListings.length === 1 &&
    applicationStateIssues.length === 0;
  const canMarkMessaging =
    canAdvanceSelected && selectedApp?.status === 'APPLIED';
  const canScheduleMeet =
    canAdvanceSelected &&
    (selectedApp?.status === 'APPLIED' ||
      selectedApp?.status === 'MESSAGING' ||
      selectedApp?.status === 'MEET_SCHEDULED');
  const canSendToParent =
    canAdvanceSelected && selectedApp?.status === 'MEET_SCHEDULED';
  const canRecordParentDecision =
    canAdvanceSelected && selectedApp?.status === 'PARENT_PENDING';
  const canMessageSelectedRbt =
    Boolean(selectedApp) &&
    selectedAppStatusKnown &&
    (selectedApp?.status === 'APPROVED' || canAdvanceSelected);
  const activeOpeningUnitCount = activeOpening?.scheduleJson
    ? countSelectedUnits(
        scheduleToUnitGrid(normalizePreferredSchedule(activeOpening.scheduleJson))
      )
    : null;
  const activeListingIssues = activeOpening
    ? [
        !/^\d{5}$/.test(activeOpening.zipCode || '') ? 'valid 5-digit ZIP' : null,
        !activeOpening.borough ? 'borough' : null,
        !activeOpening.scheduleText || !activeOpening.daysOfWeek ? 'weekly schedule' : null,
        !activeOpening.weeklyHours || activeOpening.weeklyHours <= 0 ? 'weekly hours' : null,
      ].filter((issue): issue is string => Boolean(issue))
    : [];

  // HRM apply writes CaseApplication in shared DB — CRM must refresh to see APPLIED.
  useEffect(() => {
    const onFocus = () => router.refresh();
    const onVis = () => {
      if (document.visibilityState === 'visible') router.refresh();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVis);
    const timer = window.setInterval(() => router.refresh(), 25000);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVis);
      window.clearInterval(timer);
    };
  }, [router]);

  return (
    <div className="space-y-6">
      <StaffingReadinessChecklist
        client={client}
        ctaKinds={['publish_opening', 'schedule_first_session', 'activate']}
        onCtaClick={(action) => {
          if (action.kind === 'publish_opening') {
            openCreateForm();
            return;
          }
          if (action.kind === 'schedule_first_session' || action.kind === 'activate') {
            onRequestActivationTab?.();
          }
        }}
      />

      <div
        className="relative overflow-hidden rounded-3xl border border-white/10 bg-zinc-950/80 p-6 shadow-xl backdrop-blur-xl"
        aria-busy={isPending}
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-28 -top-28 h-72 w-72 rounded-full bg-[radial-gradient(circle,rgba(249,115,22,0.16),transparent_68%)]"
        />
        <div className="relative flex flex-col gap-4 border-b border-white/5 pb-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h3 className="flex items-center gap-2 font-heading text-lg font-bold text-white">
              <Briefcase aria-hidden="true" className="h-5 w-5 text-brand-orange-400" />
              Job Board &amp; Applicants
              {newAppCount > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-sky-300">
                  <span aria-hidden="true" className="dot-live" />
                  {newAppCount} new
                </span>
              )}
            </h3>
            <p className="mt-1 max-w-xl text-xs text-zinc-400">
              Publish a real job-style listing. RBTs apply on HRM (de-identified). Applications land here as{' '}
              <span className="text-sky-300">APPLIED</span> — advance meet / parent / assign. Parent accept does not set
              ACTIVE alone.
            </p>
            <p className="mt-2 max-w-xl text-[11px] leading-relaxed text-zinc-500">
              CRM stores the listing ZIP and schedule. Commute, radius, and match scores are calculated
              only in HRM from each RBT&apos;s saved travel profile; this panel does not invent estimates.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={HRM_JOB_BOARD_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-sky-500/25 bg-sky-500/10 px-3 py-1.5 text-xs font-semibold text-sky-200 transition hover:border-sky-400/50 hover:bg-sky-500/15"
              aria-label="Open the HRM RBT Job Board in a new tab"
            >
              HRM board <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
            </a>
            <button
              type="button"
              disabled={isPending}
              onClick={requestRefresh}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-semibold text-zinc-300 transition hover:border-brand-orange-500/40 disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="Refresh listing and applicant data"
            >
              <RefreshCw
                aria-hidden="true"
                className={`h-3.5 w-3.5 ${isPending ? 'animate-spin' : ''}`}
              />
              Refresh
            </button>
            {activeOpening ? (
              <span
                className={`rounded-md border px-2.5 py-1 font-mono text-[10px] font-bold uppercase ${
                  activeOpening.status === 'OPEN'
                    ? 'border-green-500/20 bg-green-500/10 text-green-400'
                    : activeOpening.status === 'FILLED'
                      ? 'border-sky-500/20 bg-sky-500/10 text-sky-300'
                      : activeOpening.status === 'CLOSED'
                        ? 'border-zinc-500/20 bg-zinc-500/10 text-zinc-400'
                        : 'border-red-500/30 bg-red-500/10 text-red-300'
                }`}
              >
                {activeOpening.caseCode} · {activeOpening.status}
              </span>
            ) : (
              <span className="rounded-md border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 font-mono text-[10px] font-bold uppercase text-amber-400">
                No listing yet
              </span>
            )}
          </div>
        </div>

        <div className="relative" aria-live="polite">
          {isPending && (
            <div
              role="status"
              className="mt-4 flex items-center gap-2 rounded-xl border border-sky-500/20 bg-sky-500/10 px-3 py-2 text-xs font-medium text-sky-200"
            >
              <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" />
              Updating listing data…
            </div>
          )}
          {actionError && (
            <div
              role="alert"
              className="mt-4 flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200"
            >
              <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-semibold">Action failed</p>
                <p className="mt-0.5 text-red-200/85">{actionError}</p>
              </div>
            </div>
          )}
        </div>

        {openListings.length > 1 && (
          <div
            role="alert"
            className="relative mt-4 flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200"
          >
            <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              Data conflict: {openListings.length} listings are marked OPEN. Applicant workflow
              actions are locked until only one OPEN listing remains.
            </p>
          </div>
        )}

        {!listingStatesValid && (
          <div
            role="alert"
            className="relative mt-4 flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200"
          >
            <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              Unsupported listing state found:{' '}
              {invalidListingStates.map((opening) => `${opening.caseCode} · ${opening.status}`).join(', ')}.
              Those records are read-only and new publishing is locked until corrected.
            </p>
          </div>
        )}

        {!canPost && !openListing && (
          <div className="relative mt-4 flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-200">
            <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-medium">{readiness.nextAction.label}</p>
              <p className="mt-1 text-amber-200/80">
                Parent accept / RBT approve will not set ACTIVE without a first Session (Bridge E).
              </p>
            </div>
          </div>
        )}

        {!openListing && (
          <div className="relative mt-4 space-y-3">
            {!showCreate ? (
              <div className="relative overflow-hidden rounded-2xl border border-dashed border-white/10 bg-zinc-900/35 p-6">
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(249,115,22,0.09),transparent_58%)]"
                />
                <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-brand-orange-500/25 bg-brand-orange-500/10">
                      <Briefcase aria-hidden="true" className="h-5 w-5 text-brand-orange-300" />
                    </div>
                    <div>
                      <p className="font-heading text-sm font-semibold text-white">
                        {activeOpening ? 'No live listing' : 'No listing has been posted'}
                      </p>
                      <p className="mt-1 max-w-lg text-xs leading-relaxed text-zinc-500">
                        {activeOpening
                          ? `${activeOpening.caseCode} is ${activeOpening.status}. Publish a new OPEN listing only if this client still needs staffing.`
                          : 'Publish once readiness, a valid client ZIP, and a real weekly schedule are on file.'}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={!canPost || !listingStatesValid || isPending}
                    onClick={openCreateForm}
                    className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-brand-orange-500/40 bg-brand-orange-500/10 px-4 py-2.5 text-sm font-semibold text-brand-orange-200 transition-all duration-300 hover:scale-[1.01] hover:bg-brand-orange-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Plus aria-hidden="true" className="h-4 w-4" /> Create job listing
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4 rounded-2xl border border-white/10 bg-zinc-900/50 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-white">
                  <Sparkles className="h-4 w-4 text-brand-orange-400" />
                  Job listing details
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <ReadOnlyField
                    label="Child age"
                    value={childAge != null ? String(childAge) : ''}
                    source="Overview"
                    emptyHint="Not provided"
                  />
                  <ReadOnlyField
                    label="Borough"
                    value={borough}
                    source="From ZIP"
                    emptyHint="Need a valid NYC ZIP"
                  />
                  <ReadOnlyField
                    label="ZIP code"
                    value={zipCode}
                    source="Parent address"
                    emptyHint="No ZIP on parent address"
                  />
                  <label className="block space-y-1 text-xs text-zinc-400">
                    Hours needed
                    <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-[#09090b] px-3 py-2 text-sm text-white">
                      <span className="font-semibold">{listingHours || 0}</span>
                      <span className="font-mono text-[10px] text-zinc-500">
                        listed hrs · {hoursNeeded || 0} exact schedule hrs · {selectedUnits} units
                      </span>
                    </div>
                  </label>
                  <ReadOnlyField
                    label="Session length (min)"
                    value={sessionLength != null ? String(sessionLength) : ''}
                    source="Listing grid"
                    emptyHint={selectedUnits > 0 ? 'Varies by day' : 'No schedule window'}
                  />
                  <label className="block space-y-1 text-xs text-zinc-400">
                    Service setting
                    <DarkSelect
                      label="Service setting"
                      value={serviceSetting}
                      onChange={setServiceSetting}
                      options={withOption(SERVICE_SETTING_OPTIONS, serviceSetting)}
                      placeholder="Select setting…"
                    />
                  </label>
                  <label className="block space-y-1 text-xs text-zinc-400">
                    Language preference
                    <DarkSelect
                      label="Language preference"
                      value={languagePref}
                      onChange={setLanguagePref}
                      options={withOption(LANGUAGE_OPTIONS, languagePref)}
                    />
                  </label>
                  <label className="block space-y-1 text-xs text-zinc-400">
                    RBT gender preference
                    <DarkSelect
                      label="RBT gender preference"
                      value={genderPref}
                      onChange={setGenderPref}
                      options={withOption(GENDER_OPTIONS, genderPref)}
                    />
                  </label>
                  <label className="block space-y-1 text-xs text-zinc-400 sm:col-span-2 lg:col-span-3">
                    Listing highlights (job description blurb)
                    <textarea
                      className="min-h-[72px] w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white outline-none focus:border-brand-orange-500"
                      value={listingHighlights}
                      onChange={(e) => setListingHighlights(e.target.value)}
                      placeholder="Optional factual details only — do not add estimated commute or match claims."
                      maxLength={500}
                    />
                  </label>
                </div>

                <WeeklyScheduleUnitGrid
                  value={unitGrid}
                  onChange={setUnitGrid}
                  portalGrid={portalUnitGrid}
                />

                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {publishChecks.map((check) => (
                    <div
                      key={check.label}
                      className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-[11px] font-medium ${
                        check.met
                          ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
                          : 'border-amber-500/20 bg-amber-500/10 text-amber-200'
                      }`}
                    >
                      {check.met ? (
                        <Check aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                      ) : (
                        <AlertCircle aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                      )}
                      {check.label}
                    </div>
                  ))}
                </div>

                <div className="flex items-start gap-2 rounded-xl border border-sky-500/20 bg-sky-500/10 p-3 text-[11px] leading-relaxed text-sky-200">
                  <ShieldCheck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
                  <p>
                    Travel anchor: listing ZIP {zipCode || 'missing'}. HRM compares this only with an
                    RBT&apos;s real saved ZIP, transportation mode, and radius. No commute or match value
                    is authored in CRM.
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={isPending || !canPublish}
                    className="cursor-pointer rounded-lg bg-brand-orange-500 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={() => {
                      const { daysOfWeek, scheduleText } = summarizeWeekSchedule(weekSchedule);
                      runAction(
                        () =>
                          createCaseOpening({
                          clientId: client.id,
                          expectedCaseCoordinatorId: client.caseCoordinatorId ?? null,
                          weeklyHours: listingHours || null,
                          borough: borough || null,
                          zipCode,
                          childAge,
                          scheduleText,
                          daysOfWeek,
                          scheduleJson: weekSchedule,
                          sessionLengthMinutes: sessionLength,
                          languagePref: languagePref || null,
                          genderPref: genderPref || null,
                          serviceSetting: serviceSetting || null,
                          listingHighlights: listingHighlights.trim() || null,
                          }),
                        {
                          successMessage: (result) =>
                            `Posted ${result.data?.caseCode || 'case opening'}`,
                          fallbackError: 'Failed to publish the case opening.',
                          onSuccess: () => setShowCreate(false),
                        }
                      );
                    }}
                  >
                    Publish to HRM Job Board
                  </button>
                  <button
                    type="button"
                    disabled={isPending}
                    className="cursor-pointer rounded-lg border border-white/10 px-4 py-2 text-sm text-zinc-300 disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={() => {
                      setActionError(null);
                      setShowCreate(false);
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {activeOpening && (
          <div className="mt-4 space-y-4">
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-zinc-900/90 to-zinc-950">
              <div className="h-1 bg-gradient-to-r from-brand-orange-500 via-amber-400 to-cyan-400" />
              <div className="space-y-3 p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-mono text-[11px] text-brand-orange-300">{activeOpening.caseCode}</p>
                    <h4 className="font-heading text-xl text-white">
                      {activeOpening.clientInitials || `${client.firstName?.[0]}.${client.lastName?.[0]}.`} · Age{' '}
                      {activeOpening.childAge ?? '—'}
                    </h4>
                    <p className="mt-1 text-sm text-zinc-400">
                      {activeOpening.serviceSetting || 'Service setting not recorded'} · Supervised by{' '}
                      {activeOpening.bcbaDisplayName || 'BCBA not recorded on listing'}
                    </p>
                  </div>
                  {activeOpening.status === 'OPEN' && (
                    <button
                      type="button"
                      disabled={isPending}
                      className="cursor-pointer text-xs text-red-300 hover:underline disabled:cursor-not-allowed"
                      onClick={() => {
                        runAction(() => closeCaseOpening(activeOpening.id), {
                          successMessage: 'Opening closed',
                          fallbackError: 'Failed to close the case opening.',
                        });
                      }}
                    >
                      Close listing
                    </button>
                  )}
                </div>

                {activeOpening.status === 'OPEN' && activeListingIssues.length > 0 && (
                  <div
                    role="alert"
                    className="flex items-start gap-2 rounded-xl border border-amber-500/25 bg-amber-500/10 p-3 text-xs text-amber-200"
                  >
                    <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
                    <p>
                      This OPEN listing is missing {activeListingIssues.join(', ')}. HRM can show it,
                      but schedule/travel matching will remain incomplete until the listing is replaced
                      with factual data.
                    </p>
                  </div>
                )}

                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="flex items-start gap-2 rounded-xl border border-white/5 bg-white/[0.03] p-3 text-xs">
                    <MapPin aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 text-cyan-400" />
                    <div>
                      <p className="text-zinc-500">Travel anchor</p>
                      <p className="font-medium text-zinc-200">{activeOpening.borough || 'TBD'}</p>
                      <p className="font-mono text-zinc-400">ZIP {activeOpening.zipCode || '—'}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2 rounded-xl border border-white/5 bg-white/[0.03] p-3 text-xs">
                    <Baby aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 text-brand-orange-400" />
                    <div>
                      <p className="text-zinc-500">Client</p>
                      <p className="font-medium text-zinc-200">
                        Age {activeOpening.childAge ?? '—'} · {activeOpening.ageBand || 'Band TBD'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2 rounded-xl border border-white/5 bg-white/[0.03] p-3 text-xs">
                    <Clock aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 text-amber-400" />
                    <div>
                      <p className="text-zinc-500">Hours needed</p>
                      <p className="font-medium text-zinc-200">
                        {activeOpening.weeklyHours ?? '—'} hrs/wk
                        {activeOpeningUnitCount
                          ? ` · ${activeOpeningUnitCount} exact schedule units`
                          : activeOpening.weeklyHours
                            ? ` · ${Math.round(Number(activeOpening.weeklyHours) * 4)} units from listed hours`
                          : ''}
                        {activeOpening.sessionLengthMinutes
                          ? ` · ${activeOpening.sessionLengthMinutes} min sessions`
                          : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2 rounded-xl border border-white/5 bg-white/[0.03] p-3 text-xs">
                    <CalendarDays aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 text-violet-400" />
                    <div>
                      <p className="text-zinc-500">Weekly schedule</p>
                      <p className="font-medium text-zinc-200">
                        {activeOpening.daysOfWeek || 'Days TBD'}
                        {activeOpening.scheduleText ? ` · ${activeOpening.scheduleText}` : ''}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {activeOpening.languagePref && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-white/10 px-2.5 py-1 text-[11px] text-zinc-300">
                      <Languages className="h-3 w-3" /> {activeOpening.languagePref}
                    </span>
                  )}
                  {activeOpening.genderPref && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-white/10 px-2.5 py-1 text-[11px] text-zinc-300">
                      RBT: {activeOpening.genderPref}
                    </span>
                  )}
                </div>

                {activeOpening.listingHighlights && (
                  <p className="rounded-xl border border-brand-orange-500/15 bg-brand-orange-500/5 px-3 py-2 text-xs leading-relaxed text-zinc-300">
                    {activeOpening.listingHighlights}
                  </p>
                )}
                {activeOpening.transportationNotes && (
                  <p className="rounded-xl border border-sky-500/15 bg-sky-500/5 px-3 py-2 text-xs leading-relaxed text-sky-200">
                    <span className="font-semibold">Travel / access notes: </span>
                    {activeOpening.transportationNotes}
                  </p>
                )}
              </div>
            </div>

            <div
              role="group"
              className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6"
              aria-label="Applicant counts for this listing"
            >
              {[
                { label: 'Total', value: applicationCounts.total, tone: 'text-white' },
                { label: 'New', value: newAppCount, tone: 'text-sky-300' },
                { label: 'Active', value: applicationCounts.active, tone: 'text-violet-300' },
                { label: 'Accepted', value: applicationCounts.accepted, tone: 'text-emerald-300' },
                { label: 'Rejected', value: applicationCounts.declined, tone: 'text-red-300' },
                { label: 'Withdrawn', value: applicationCounts.withdrawn, tone: 'text-zinc-400' },
              ].map((count) => (
                <div
                  key={count.label}
                  className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2"
                >
                  <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-zinc-600">
                    {count.label}
                  </p>
                  <p className={`mt-0.5 font-heading text-lg font-bold ${count.tone}`}>
                    {count.value}
                  </p>
                </div>
              ))}
            </div>

            {applicationStateIssues.length > 0 && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200"
              >
                <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  Applicant state conflict: {applicationStateIssues.join('; ')}. Workflow actions
                  are locked until the durable states are corrected.
                </p>
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-5">
              <div className="space-y-2 md:col-span-2">
                <h4 className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                  <Users aria-hidden="true" className="h-3.5 w-3.5" />
                  Applicants ({applicationCounts.total})
                  {newAppCount > 0 ? ` · ${newAppCount} new` : ''}
                </h4>
                {applications.length === 0 && (
                  <div className="rounded-xl border border-dashed border-white/10 bg-zinc-950/40 p-5 text-center">
                    <Users aria-hidden="true" className="mx-auto mb-2 h-5 w-5 text-zinc-600" />
                    <p className="text-xs font-medium text-zinc-400">
                      {activeOpening.status === 'OPEN'
                        ? 'No applicants yet'
                        : `No applications were recorded before this listing became ${activeOpening.status}.`}
                    </p>
                    {activeOpening.status === 'OPEN' && (
                      <p className="mt-1 text-[11px] leading-relaxed text-zinc-600">
                        Waiting for real RBT applications from HRM. This tab refreshes on focus and
                        every 25 seconds.
                      </p>
                    )}
                  </div>
                )}
                {applications.map((app) => (
                  <button
                    key={app.id}
                    type="button"
                    onClick={() => selectApplication(app.id)}
                    aria-pressed={selectedApp?.id === app.id}
                    className={`w-full cursor-pointer rounded-xl border p-3 text-left transition-all duration-300 hover:scale-[1.01] ${
                      selectedApp?.id === app.id
                        ? 'border-brand-orange-500/40 bg-zinc-900 shadow-xl'
                        : 'border-white/10 bg-zinc-950/60 hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-white">
                        {app.rbt.firstName} {app.rbt.lastName}
                      </p>
                      {app.status === 'APPLIED' && (
                        <span className="inline-flex items-center gap-1 rounded border border-sky-500/30 bg-sky-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase text-sky-300">
                          <span aria-hidden="true" className="dot-live" /> New
                        </span>
                      )}
                    </div>
                    <p className="truncate font-mono text-[11px] text-zinc-500">{app.rbt.email}</p>
                    <span
                      className={`mt-2 inline-block rounded border px-1.5 py-0.5 text-[10px] font-semibold ${
                        APPLICATION_STATUS_STYLES[app.status] || UNKNOWN_APPLICATION_STYLE
                      }`}
                    >
                      {app.status.replace(/_/g, ' ')}
                    </span>
                  </button>
                ))}
              </div>

              <div className="space-y-3 md:col-span-3">
                {!selectedApp ? (
                  <div className="rounded-2xl border border-dashed border-white/10 bg-zinc-950/40 p-7 text-center">
                    <MessageSquare
                      aria-hidden="true"
                      className="mx-auto mb-2 h-5 w-5 text-zinc-600"
                    />
                    <p className="font-heading text-sm font-semibold text-zinc-300">
                      {applications.length === 0 ? 'Applicant inbox is empty' : 'Select an applicant'}
                    </p>
                    <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-zinc-600">
                      {applications.length === 0
                        ? 'Real HRM applications will appear here after refresh.'
                        : 'Choose a record to review its durable status, communicate, and record the parent decision.'}
                    </p>
                  </div>
                ) : (
                  <>
                    {selectedAppStatusKnown ? (
                      <ApplicationFlowBar status={selectedApp.status} />
                    ) : (
                      <div
                        role="alert"
                        className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200"
                      >
                        <AlertCircle
                          aria-hidden="true"
                          className="mt-0.5 h-4 w-4 shrink-0"
                        />
                        Unsupported application status “{selectedApp.status}”. Workflow actions are
                        locked.
                      </div>
                    )}

                    {selectedAppIsLive && !canAdvanceSelected && (
                      <div className="flex items-start gap-2 rounded-xl border border-amber-500/25 bg-amber-500/10 p-3 text-xs text-amber-200">
                        <AlertCircle
                          aria-hidden="true"
                          className="mt-0.5 h-4 w-4 shrink-0"
                        />
                        <p>
                          Workflow is read-only because{' '}
                          {applicationStateIssues.length > 0
                            ? 'the applicant states conflict with the listing'
                            : openListings.length > 1
                            ? 'multiple listings are OPEN'
                            : `listing ${activeOpening.caseCode} is ${activeOpening.status}`}
                          .
                        </p>
                      </div>
                    )}

                    {selectedAppIsLive && (
                      <div className="space-y-3 rounded-xl border border-white/10 bg-zinc-900/40 p-3">
                        <label className="block space-y-1 text-xs text-zinc-400">
                          Meet date/time
                          <input
                            type="datetime-local"
                            className="w-full cursor-pointer rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-50"
                            value={meetAt}
                            disabled={!canScheduleMeet || isPending}
                            aria-invalid={Boolean(meetAt) && !meetAtIsFuture}
                            onChange={(event) => {
                              const next = event.target.value;
                              setSelectedAppId(selectedApp.id);
                              setMeetAt(next);
                              setMeetAtIsFuture(isFutureMeetDate(next));
                            }}
                          />
                        </label>
                        {meetAt && !meetAtIsFuture && (
                          <p role="alert" className="text-[11px] font-medium text-amber-300">
                            Choose a future date and time before scheduling.
                          </p>
                        )}

                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={isPending || !canMarkMessaging}
                            className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-violet-500/30 bg-violet-500/10 px-3 py-1.5 text-xs text-violet-200 disabled:cursor-not-allowed disabled:opacity-50"
                            onClick={() =>
                              runAction(
                                () =>
                                  updateCaseApplicationStatus(
                                    selectedApp.id,
                                    'MESSAGING',
                                    selectedApp.status
                                  ),
                                {
                                  successMessage: 'Marked messaging',
                                  fallbackError: 'Failed to update the applicant to messaging.',
                                }
                              )
                            }
                          >
                            <MessageSquare aria-hidden="true" className="h-3.5 w-3.5" /> Messaging
                          </button>
                          <button
                            type="button"
                            disabled={isPending || !canScheduleMeet || !meetAtIsFuture}
                            className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-200 disabled:cursor-not-allowed disabled:opacity-50"
                            onClick={() => {
                              if (!isFutureMeetDate(meetAt)) {
                                setMeetAtIsFuture(false);
                                surfaceActionError(
                                  undefined,
                                  'Choose a future date and time before scheduling.'
                                );
                                return;
                              }
                              runAction(
                                () =>
                                  updateCaseApplicationStatus(
                                    selectedApp.id,
                                    'MEET_SCHEDULED',
                                    selectedApp.status,
                                    { meetAt }
                                  ),
                                {
                                  successMessage: 'Meet scheduled',
                                  fallbackError: 'Failed to schedule the meet and greet.',
                                  onSuccess: () => {
                                    setMeetAt('');
                                    setMeetAtIsFuture(false);
                                  },
                                }
                              );
                            }}
                          >
                            <Video aria-hidden="true" className="h-3.5 w-3.5" /> Schedule video
                          </button>
                          <button
                            type="button"
                            disabled={isPending || !canSendToParent}
                            className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-brand-orange-500/30 bg-brand-orange-500/10 px-3 py-1.5 text-xs text-brand-orange-200 disabled:cursor-not-allowed disabled:opacity-50"
                            onClick={() =>
                              runAction(
                                () =>
                                  updateCaseApplicationStatus(
                                    selectedApp.id,
                                    'PARENT_PENDING',
                                    selectedApp.status
                                  ),
                                {
                                  successMessage: 'Awaiting parent decision',
                                  fallbackError: 'Failed to update the parent-decision status.',
                                }
                              )
                            }
                          >
                            Parent deciding
                          </button>
                          <button
                            type="button"
                            disabled={isPending || !canRecordParentDecision}
                            className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-1.5 text-xs text-green-300 disabled:cursor-not-allowed disabled:opacity-50"
                            onClick={() =>
                              runAction(
                                () =>
                                  recordParentApplicationAcceptance({
                                    applicationId: selectedApp.id,
                                    expectedApplicationStatus: selectedApp.status,
                                    expectedOpeningStatus: activeOpening.status,
                                    expectedClientRbtId: client.rbtId ?? null,
                                    expectedRbtApproved: client.rbtApproved === true,
                                    decisionEvidence: 'VERBAL_CONFIRMATION_RECORDED',
                                  }),
                                {
                                  successMessage:
                                    'Parent liked — RBT assigned. ACTIVE still requires first Session.',
                                  fallbackError: 'Failed to accept and assign the applicant.',
                                }
                              )
                            }
                          >
                            <CheckCircle2 aria-hidden="true" className="h-3.5 w-3.5" /> Parent
                            likes → assign
                          </button>
                          <button
                            type="button"
                            disabled={isPending || !canRecordParentDecision}
                            className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs text-red-300 disabled:cursor-not-allowed disabled:opacity-50"
                            onClick={() =>
                              runAction(
                                () =>
                                  recordParentApplicationDecline({
                                    applicationId: selectedApp.id,
                                    expectedApplicationStatus: selectedApp.status,
                                    expectedOpeningStatus: activeOpening.status,
                                    expectedClientRbtId: client.rbtId ?? null,
                                    expectedRbtApproved: client.rbtApproved === true,
                                    decisionEvidence: 'VERBAL_CONFIRMATION_RECORDED',
                                  }),
                                {
                                  successMessage: 'Declined — opening stays open',
                                  fallbackError: 'Failed to decline the applicant.',
                                }
                              )
                            }
                          >
                            <XCircle aria-hidden="true" className="h-3.5 w-3.5" /> Parent declines
                          </button>
                        </div>
                      </div>
                    )}

                    {selectedApp.meetAt && (
                      <div className="flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                        <CalendarDays aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                        Meet scheduled for {formatMeetDate(selectedApp.meetAt)}
                      </div>
                    )}

                    {selectedApp.meetLink && (
                      <a
                        href={selectedApp.meetLink}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex cursor-pointer items-center gap-1 text-xs text-sky-300 hover:underline"
                        aria-label="Open the scheduled video meet in a new tab"
                      >
                        <Video aria-hidden="true" className="h-3.5 w-3.5" /> Open meet link
                      </a>
                    )}

                    {selectedApp.message && (
                      <p className="rounded-lg border border-white/5 bg-zinc-950 p-3 text-xs text-zinc-300">
                        <span className="text-zinc-500">RBT note: </span>
                        {selectedApp.message}
                      </p>
                    )}

                    <div className="space-y-2 rounded-xl border border-white/10 bg-zinc-950/80 p-3">
                      <label className="block space-y-2 text-[10px] font-bold uppercase text-zinc-500">
                        Message RBT
                        <textarea
                          className="min-h-[64px] w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm font-normal normal-case text-white outline-none focus:border-brand-orange-500 disabled:cursor-not-allowed disabled:opacity-50"
                          value={rbtMsg}
                          disabled={!canMessageSelectedRbt || isPending}
                          onChange={(event) => {
                            setSelectedAppId(selectedApp.id);
                            setRbtMsg(event.target.value);
                          }}
                          placeholder={
                            canMessageSelectedRbt
                              ? 'Send a factual staffing update…'
                              : 'Messaging is closed for rejected or withdrawn applications.'
                          }
                          maxLength={2000}
                        />
                      </label>
                      <button
                        type="button"
                        disabled={isPending || !canMessageSelectedRbt || !rbtMsg.trim()}
                        className="cursor-pointer rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                        onClick={() =>
                          runAction(
                            () => sendApplicationStaffMessage(selectedApp.id, rbtMsg),
                            {
                              successMessage: 'Sent to RBT',
                              fallbackError: 'Failed to send the RBT message.',
                              onSuccess: () => setRbtMsg(''),
                            }
                          )
                        }
                      >
                        Send to RBT
                      </button>
                    </div>

                    <div className="space-y-2 rounded-xl border border-white/10 bg-zinc-950/80 p-3">
                      <label className="block space-y-2 text-[10px] font-bold uppercase text-zinc-500">
                        Message parent about this case
                        <textarea
                          className="min-h-[64px] w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm font-normal normal-case text-white outline-none focus:border-brand-orange-500 disabled:cursor-not-allowed disabled:opacity-50"
                          value={parentMsg}
                          disabled={isPending}
                          onChange={(event) => setParentMsg(event.target.value)}
                          placeholder="Send a factual case-coordination update…"
                          maxLength={2000}
                        />
                      </label>
                      <button
                        type="button"
                        disabled={isPending || !parentMsg.trim()}
                        className="cursor-pointer rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                        onClick={() =>
                          runAction(
                            () => sendParentCaseMessage(client.id, parentMsg),
                            {
                              successMessage: 'Sent to parent thread',
                              fallbackError: 'Failed to send the parent message.',
                              onSuccess: () => setParentMsg(''),
                            }
                          )
                        }
                      >
                        Send to parent
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
