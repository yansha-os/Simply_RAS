'use client';

import React, {
  useState,
  useEffect,
  useRef,
  useSyncExternalStore,
} from 'react';
import { createPortal } from 'react-dom';
import { 
  Calendar, 
  Clock, 
  MapPin, 
  User, 
  CheckCircle2, 
  AlertTriangle, 
  FileText, 
  ChevronLeft, 
  ChevronRight,
  Play,
  Pause,
  Lock,
  ClipboardList,
  Briefcase,
  MessageSquare,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { toast } from 'sonner';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FixIncompleteSessionDrawer, IncompleteSessionItem } from './FixIncompleteSessionDrawer';
import type { SessionStudioClient } from '@/lib/sessionStudio';
import { clearRbtPayHold, loadRbtPayHolds } from '@/lib/rbtPayHolds';
import {
  loadCompletedStudioSessions,
  loadDoneScheduleSessionIds,
  loadSessionStudioMeta,
  saveSessionStudioMeta,
} from '@/lib/sessionStudioDraft';
import {
  CLINIC_TIME_ZONE,
  addClinicDays,
  clinicDateKey,
  clinicDayIndexMonday,
  startOfClinicDay,
} from '@/lib/clinicTimezone';
import {
  describeScheduleCompletion,
  type ScheduleCompletionPresentation,
} from './RbtScheduleCompletionStatus';

interface ScheduledSession {
  id: string;
  client: string;
  age: number;
  bcba: string;
  date: string;
  dayOfWeek: string;
  time: string;
  location: string;
  status: 'CONFIRMED' | 'UPCOMING' | 'COVERAGE_REQUESTED';
  draftNoteCreated: boolean;
}

function sessionToStudioClient(s: ScheduledSession): SessionStudioClient {
  const loc = s.location.includes('School')
    ? '03 - School'
    : s.location.includes('Clinic')
      ? '11 - Clinic'
      : '12 - Home';
  return {
    id: s.id,
    name: s.client,
    age: s.age,
    bcba: s.bcba,
    locationDefault: loc,
    cptDefault: '97153-HM Adaptive Behavior Treatment (RBT)',
    ratePerHour: 28,
  };
}

type DbScheduleRow = {
  id: string;
  clientName: string;
  bcbaName: string;
  scheduledStart: string;
  scheduledEnd: string;
  location: string | null;
  status: string;
  hasNote: boolean;
};

type ScheduleCompletionRow = {
  id: string;
  client: string;
  date: string;
  time: string;
  units: number;
  status?: string | null;
};

/** Clinic-TZ calendar date YYYY-MM-DD — pinned to America/New_York like the CRM billing grids. */
function localDateKey(d: Date) {
  return clinicDateKey(d);
}

/** Clinic-TZ Monday 00:00 of the week containing `d` (host/browser TZ never matters). */
function startOfWeekMonday(d: Date) {
  return addClinicDays(startOfClinicDay(d), -clinicDayIndexMonday(d));
}

function mapDbRowsToScheduled(
  rows: DbScheduleRow[],
  doneIds: Set<string>
): ScheduledSession[] {
  return rows
    .filter(
      (s) =>
        (s.status === 'SCHEDULED' || s.status === 'IN_PROGRESS') && !doneIds.has(s.id)
    )
    .map((s) => {
      const start = new Date(s.scheduledStart);
      const end = new Date(s.scheduledEnd);
      // Time-of-day pinned to clinic TZ so it matches the clinic-TZ day bucketing below
      const time = `${start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: CLINIC_TIME_ZONE })} - ${end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: CLINIC_TIME_ZONE })} ET`;
      return {
        id: s.id,
        client: s.clientName,
        age: 0,
        bcba: s.bcbaName,
        date: localDateKey(start),
        dayOfWeek: start.toLocaleDateString('en-US', { weekday: 'long', timeZone: CLINIC_TIME_ZONE }),
        time,
        location: s.location || '12 - Home',
        status: 'CONFIRMED' as const,
        draftNoteCreated: s.hasNote,
      };
    });
}

function holdsToIncomplete(holds: ReturnType<typeof loadRbtPayHolds>): IncompleteSessionItem[] {
  return holds.map((h) => {
    const missing =
      h.missingKeys.includes('CAREGIVER_SIGN') || h.title.toLowerCase().includes('signature')
        ? ('MISSING_PARENT_SIGNATURE' as const)
        : ('MISSING_SOAP_NOTE' as const);
    return {
      id: h.sessionId,
      client: h.clientName,
      age: 0,
      bcba: 'Assigned BCBA',
      date: h.createdAt.slice(0, 10),
      time: h.sessionRef,
      location: 'See Session Studio',
      cptCode: '97153 - Adaptive Behavior Treatment',
      missingReason: missing,
      loggedTrialsCount: 0,
      rbtSignature: '',
      parentSignature: '',
      soapSummary: h.detail,
    };
  });
}

interface ActiveSessionItem {
  id: string;
  client: string;
  age: number;
  bcba: string;
  location: string;
  elapsedSeconds: number;
  isClockRunning: boolean;
  loggedTrials: number;
  accuracyPercent: number;
  cptUnits: number;
}

type ScheduleTab = 'ACTIVE' | 'INCOMPLETE' | 'SCHEDULE' | 'COMPLETED';

const SCHEDULE_TABS: ScheduleTab[] = [
  'ACTIVE',
  'INCOMPLETE',
  'SCHEDULE',
  'COMPLETED',
];

const COMPLETION_TONE_CLASSES: Record<
  ScheduleCompletionPresentation['tone'],
  { badge: string; detail: string }
> = {
  slate: {
    badge: 'border-slate-300 bg-slate-100 text-slate-700',
    detail: 'text-slate-600',
  },
  amber: {
    badge: 'border-amber-300 bg-amber-100 text-amber-900',
    detail: 'text-amber-800',
  },
  sky: {
    badge: 'border-sky-300 bg-sky-100 text-sky-900',
    detail: 'text-sky-800',
  },
  emerald: {
    badge: 'border-emerald-300 bg-emerald-100 text-emerald-900',
    detail: 'text-emerald-800',
  },
};

const subscribeToClient = () => () => {};

interface RbtScheduleViewProps {
  mode?: 'SIMULATION' | 'LIVE';
  onStartEvvClick?: () => void;
}

export function RbtScheduleView({ mode = 'LIVE', onStartEvvClick }: RbtScheduleViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<ScheduleTab>(() => {
    const requestedTab = searchParams.get('tab');
    return requestedTab && SCHEDULE_TABS.includes(requestedTab as ScheduleTab)
      ? requestedTab as ScheduleTab
      : mode === 'LIVE' ? 'SCHEDULE' : 'ACTIVE';
  });
  const [viewMode, setViewMode] = useState<'CALENDAR' | 'TIMELINE'>('CALENDAR');
  const [weekAnchor, setWeekAnchor] = useState(() => startOfWeekMonday(new Date()));
  const [showSickDayModal, setShowSickDayModal] = useState(false);
  const [selectedSessionForSick, setSelectedSessionForSick] = useState<ScheduledSession | null>(null);
  const sickDialogRef = useRef<HTMLDivElement>(null);
  const mounted = useSyncExternalStore(
    subscribeToClient,
    () => true,
    () => false
  );
  const [scheduleLoading, setScheduleLoading] = useState(mode === 'LIVE');
  const [scheduleRefreshing, setScheduleRefreshing] = useState(false);

  // Incomplete Drawer State (SIMULATION only)
  const [selectedIncompleteSession, setSelectedIncompleteSession] = useState<IncompleteSessionItem | null>(null);
  const [isIncompleteDrawerOpen, setIsIncompleteDrawerOpen] = useState(false);

  // Active Session Timer State
  const [activeSessionSeconds, setActiveSessionSeconds] = useState(6320); // ~1h 45m initial
  const [isActiveClockRunning, setIsActiveClockRunning] = useState(true);

  // Sick Day Form State
  const [sickReason, setSickReason] = useState('Sudden Illness / Sick Day');
  const [sickNote, setSickNote] = useState('');

  const [reqStatus, setReqStatus] = useState({
    tasksDone: false,
    interviewBooked: false,
    availabilitySet: false,
    simCompleted: false,
    isHired: false,
  });

  const handleScheduleTabKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    currentTab: ScheduleTab
  ) => {
    const currentIndex = SCHEDULE_TABS.indexOf(currentTab);
    let nextIndex: number | null = null;

    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % SCHEDULE_TABS.length;
    if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + SCHEDULE_TABS.length) % SCHEDULE_TABS.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = SCHEDULE_TABS.length - 1;
    if (nextIndex === null) return;

    event.preventDefault();
    const nextTab = SCHEDULE_TABS[nextIndex];
    setActiveTab(nextTab);
    document.getElementById(`rbt-schedule-tab-${nextTab}`)?.focus();
  };

  useEffect(() => {
    if (mode !== 'SIMULATION' || !isActiveClockRunning) return;
    const timer = window.setInterval(
      () => setActiveSessionSeconds((seconds) => seconds + 1),
      1000
    );
    return () => window.clearInterval(timer);
  }, [isActiveClockRunning, mode]);

  useEffect(() => {
    if (!showSickDayModal) return;
    sickDialogRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowSickDayModal(false);
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [showSickDayModal]);

  const formatSeconds = (sec: number) => {
    const hrs = Math.floor(sec / 3600);
    const mins = Math.floor((sec % 3600) / 60);
    const secs = sec % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const activeBillableUnits = Math.round(Math.floor(activeSessionSeconds / 60) / 15);
  /** LIVE schedule is staff-only after HR hire — not when onboarding reqs / clearedForHire are done. */
  const isScheduleUnlocked = mode === 'SIMULATION' || reqStatus.isHired;

  const [activeSession] = useState<ActiveSessionItem | null>(
    mode === 'SIMULATION'
      ? {
          id: 'act-1',
          client: 'Leo Miller',
          age: 6,
          bcba: 'Dr. Sarah Jenkins, BCBA',
          location: '12 - Home Session · Park Slope, Brooklyn',
          elapsedSeconds: activeSessionSeconds,
          isClockRunning: true,
          loggedTrials: 14,
          accuracyPercent: 85,
          cptUnits: activeBillableUnits
        }
      : null
  );

  const [incompleteSessions, setIncompleteSessions] = useState<IncompleteSessionItem[]>(
    mode === 'SIMULATION'
      ? [
          {
            id: 'inc-1',
            client: 'Maya Rodriguez',
            age: 4,
            bcba: 'Marcus Vance, BCBA',
            date: '2026-08-03',
            time: '03:30 PM - 05:30 PM',
            location: '03 - School Session · Astoria, Queens',
            cptCode: '97153 - Adaptive Behavior Treatment',
            missingReason: 'MISSING_PARENT_SIGNATURE',
            loggedTrialsCount: 18,
            rbtSignature: 'Sarah Jenkins, BT',
            parentSignature: '',
            soapSummary: 'Client engaged in DTT trials. Prompt fading applied successfully.'
          },
          {
            id: 'inc-2',
            client: 'Lucas Miller',
            age: 8,
            bcba: 'Dr. Sarah Jenkins, BCBA',
            date: '2026-08-02',
            time: '04:00 PM - 06:00 PM',
            location: '11 - Clinic Session · Upper West Side, NY',
            cptCode: '97153 - Adaptive Behavior Treatment',
            missingReason: 'MISSING_SOAP_NOTE',
            loggedTrialsCount: 12,
            rbtSignature: 'Sarah Jenkins, BT',
            parentSignature: 'Elena Miller',
            soapSummary: ''
          }
        ]
      : []
  );

  const [completedSessions, setCompletedSessions] = useState<ScheduleCompletionRow[]>(
    mode === 'SIMULATION'
      ? [
          { id: 'cmp-1', client: 'Ethan Vance', date: '2026-08-01', time: '01:00 PM - 03:00 PM', units: 8, status: 'COMPLETED' },
          { id: 'cmp-2', client: 'Leo Miller', date: '2026-07-31', time: '02:00 PM - 04:00 PM', units: 8, status: 'COMPLETED' }
        ]
      : []
  );

  const [sessions, setSessions] = useState<ScheduledSession[]>(
    mode === 'SIMULATION'
      ? [
          { 
            id: 's1', 
            client: 'Leo Miller', 
            age: 6, 
            bcba: 'Dr. Sarah Jenkins, BCBA', 
            date: '2026-08-10', 
            dayOfWeek: 'Monday', 
            time: '02:00 PM - 04:00 PM', 
            location: '12 - Home Session · Park Slope, Brooklyn', 
            status: 'CONFIRMED',
            draftNoteCreated: true 
          },
          { 
            id: 's2', 
            client: 'Maya Rodriguez', 
            age: 4, 
            bcba: 'Marcus Vance, BCBA', 
            date: '2026-08-11', 
            dayOfWeek: 'Tuesday', 
            time: '03:30 PM - 05:30 PM', 
            location: '03 - School Session · Astoria, Queens', 
            status: 'UPCOMING',
            draftNoteCreated: true 
          },
          { 
            id: 's3', 
            client: 'Lucas Miller', 
            age: 8, 
            bcba: 'Dr. Sarah Jenkins, BCBA', 
            date: '2026-08-13', 
            dayOfWeek: 'Thursday', 
            time: '04:00 PM - 06:00 PM', 
            location: '11 - Clinic Session · Upper West Side, NY', 
            status: 'UPCOMING',
            draftNoteCreated: false 
          },
          { 
            id: 's4', 
            client: 'Ethan Vance', 
            age: 5, 
            bcba: 'Dr. Amanda Chen', 
            date: '2026-08-14', 
            dayOfWeek: 'Friday', 
            time: '01:00 PM - 03:00 PM', 
            location: '12 - Home Session · Riverdale, Bronx', 
            status: 'UPCOMING',
            draftNoteCreated: false 
          }
        ]
      : []
  );

  useEffect(() => {
    const syncHolds = () => {
      if (mode !== 'LIVE') return;
      setIncompleteSessions(holdsToIncomplete(loadRbtPayHolds()));
    };
    const syncCompleted = () => {
      if (mode !== 'LIVE') return;
      setCompletedSessions(loadCompletedStudioSessions());
    };
    const syncScheduleDone = (opts?: { soft?: boolean }) => {
      if (mode !== 'LIVE') return;
      const done = new Set(loadDoneScheduleSessionIds());
      if (!opts?.soft) setScheduleLoading(true);
      void import('@/app/actions/payrollActions').then(({ listRbtScheduledSessions }) =>
        listRbtScheduledSessions().then((res) => {
          // LIVE: only CRM/DB sessions — never seed fake clients when empty
          const mapped = mapDbRowsToScheduled(res.sessions || [], done);
          setSessions(mapped);
          if (!opts?.soft && mapped.length > 0) {
            const earliest = mapped
              .map((s) => new Date(`${s.date}T12:00:00`))
              .sort((a, b) => a.getTime() - b.getTime())[0];
            if (earliest) setWeekAnchor(startOfWeekMonday(earliest));
          }
        })
      ).catch(() => {
        setSessions([]);
      }).finally(() => {
        setScheduleLoading(false);
        setScheduleRefreshing(false);
      });
    };
    syncHolds();
    syncCompleted();
    syncScheduleDone();

    const loadFromDb = () => {
      void import('@/lib/syncAtsProgress').then(({ loadAtsProgress, isLiveStaffRbtUnlocked }) =>
        loadAtsProgress().then((data) => {
          if (!data) {
            if (isLiveStaffRbtUnlocked()) {
              setReqStatus({
                tasksDone: true,
                interviewBooked: true,
                availabilitySet: true,
                simCompleted: true,
                isHired: true,
              });
            }
            return;
          }
          setReqStatus({
            tasksDone: data.tasksDone,
            interviewBooked: data.interviewBooked || data.interviewPassed,
            availabilitySet: data.availabilityDone,
            simCompleted: data.simulationDone,
            isHired: isLiveStaffRbtUnlocked(data.stage),
          });
        })
      );
    };

    loadFromDb();
    const onScheduleDoneChanged = () => syncScheduleDone({ soft: true });
    const onFocus = () => {
      syncHolds();
      syncCompleted();
      syncScheduleDone({ soft: true });
      loadFromDb();
    };
    window.addEventListener('rbt_sim_changed', loadFromDb);
    window.addEventListener('simulationCompleted', loadFromDb);
    window.addEventListener('rbt_clearance_changed', loadFromDb);
    window.addEventListener('rbt_tasks_changed', loadFromDb);
    window.addEventListener('rbt_availability_changed', loadFromDb);
    window.addEventListener('rbt_progress_synced', loadFromDb);
    window.addEventListener('ras_rbt_pay_holds_changed', syncHolds);
    window.addEventListener('ras_rbt_completed_changed', syncCompleted);
    window.addEventListener('ras_rbt_schedule_done_changed', onScheduleDoneChanged);
    window.addEventListener('storage', syncHolds);
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener('rbt_sim_changed', loadFromDb);
      window.removeEventListener('simulationCompleted', loadFromDb);
      window.removeEventListener('rbt_clearance_changed', loadFromDb);
      window.removeEventListener('rbt_tasks_changed', loadFromDb);
      window.removeEventListener('rbt_availability_changed', loadFromDb);
      window.removeEventListener('rbt_progress_synced', loadFromDb);
      window.removeEventListener('ras_rbt_pay_holds_changed', syncHolds);
      window.removeEventListener('ras_rbt_completed_changed', syncCompleted);
      window.removeEventListener('ras_rbt_schedule_done_changed', onScheduleDoneChanged);
      window.removeEventListener('storage', syncHolds);
      window.removeEventListener('focus', onFocus);
    };
  }, [mode]);

  const refreshLiveSchedule = () => {
    if (mode !== 'LIVE') return;
    setScheduleRefreshing(true);
    const done = new Set(loadDoneScheduleSessionIds());
    void import('@/app/actions/payrollActions').then(({ listRbtScheduledSessions }) =>
      listRbtScheduledSessions().then((res) => {
        const fromDb = mapDbRowsToScheduled(res.sessions || [], done);
        setSessions(fromDb);
        if (fromDb.length > 0) {
          const earliest = fromDb
            .map((s) => new Date(`${s.date}T12:00:00`))
            .sort((a, b) => a.getTime() - b.getTime())[0];
          if (earliest) setWeekAnchor(startOfWeekMonday(earliest));
        }
        toast.success(fromDb.length > 0 ? 'Schedule updated from CRM.' : 'Still waiting on Case Coord for shifts.');
      })
    ).catch(() => {
      setSessions([]);
      toast.error('Could not refresh schedule.');
    }).finally(() => {
      setScheduleRefreshing(false);
      setScheduleLoading(false);
    });
  };

  const openSessionStudio = (session: ScheduledSession) => {
    if (mode === 'SIMULATION' && onStartEvvClick) {
      onStartEvvClick();
      return;
    }
    if (mode === 'SIMULATION') {
      router.push('/rbt/simulation');
      return;
    }
    const meta = sessionToStudioClient(session);
    saveSessionStudioMeta(session.id, meta);
    router.push(`/rbt/session/${session.id}`);
  };

  const resumeIncompleteStudio = (session: IncompleteSessionItem) => {
    if (mode === 'SIMULATION') {
      setSelectedIncompleteSession(session);
      setIsIncompleteDrawerOpen(true);
      return;
    }
    const existing = loadSessionStudioMeta(session.id);
    if (!existing) {
      saveSessionStudioMeta(session.id, {
        id: session.id,
        name: session.client,
        age: session.age || 0,
        bcba: session.bcba,
        locationDefault: '12 - Home',
        cptDefault: '97153-HM Adaptive Behavior Treatment (RBT)',
        ratePerHour: 28,
      });
    }
    router.push(`/rbt/session/${session.id}`);
  };

  if (!mounted) {
    return (
      <h2 className="max-w-4xl mx-auto py-12 text-center select-none font-black text-slate-400 animate-pulse">
        Checking Onboarding Clearance Status...
      </h2>
    );
  }

  if (mode === 'LIVE' && !isScheduleUnlocked) {
    return (
      <div className="relative max-w-4xl mx-auto py-12 px-6 text-center select-none space-y-6 animate-fade-in">
        <div className="pointer-events-none absolute inset-0 -z-10 rounded-[2rem] bg-[radial-gradient(ellipse_at_top,_rgba(249,115,22,0.12),_transparent_55%)]" />
        <div className="bg-white/90 backdrop-blur-xl border border-orange-200/80 rounded-3xl p-8 sm:p-10 shadow-2xl shadow-orange-500/10 space-y-6 transition-all duration-300">
          <div className="w-20 h-20 rounded-3xl bg-amber-100/90 border border-amber-300/80 text-amber-700 flex items-center justify-center mx-auto shadow-md shadow-amber-500/20">
            <Lock className="w-10 h-10 text-[#F97316]" />
          </div>

          <div className="space-y-2">
            <span className="inline-flex items-center gap-2 bg-amber-100 text-amber-800 border border-amber-300/80 text-[10px] font-mono font-black px-3.5 py-1 rounded-full uppercase tracking-wider">
              <span className="dot-live w-1.5 h-1.5 rounded-full bg-amber-500" />
              WAITING FOR HIRE
            </span>
            <h2 className="text-2xl font-black font-heading text-slate-900 tracking-tight">
              My Schedule &amp; Calendar Locked
            </h2>
            <p className="text-xs text-slate-600 font-semibold max-w-lg mx-auto leading-relaxed">
              Your live client schedule unlocks only after Head HR hires you. Finish any remaining requirements on{' '}
              <strong>My Tasks</strong>, then wait for your wage notice / hire — completing the applicant pack does not open this tab.
            </p>
          </div>

          <div className="p-5 bg-slate-50/90 border border-slate-200/90 rounded-2xl text-left space-y-3 max-w-lg mx-auto">
            <h4 className="text-xs font-black text-slate-900 font-heading uppercase tracking-wider border-b border-slate-200 pb-2">
              Where you are in the cycle
            </h4>
            <div className="space-y-2 text-xs font-extrabold">
              <div className={`p-2.5 rounded-xl border flex items-center justify-between transition-colors ${reqStatus.tasksDone ? 'bg-emerald-50 border-emerald-300 text-emerald-900' : 'bg-rose-50 border-rose-300 text-rose-900'}`}>
                <span className="flex items-center gap-2">
                  {reqStatus.tasksDone ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <Clock className="w-4 h-4 text-rose-500" />}
                  Documents &amp; e-sign pack
                </span>
                <span className="text-[10px] font-mono font-black">{reqStatus.tasksDone ? 'DONE' : 'PENDING'}</span>
              </div>
              <div className={`p-2.5 rounded-xl border flex items-center justify-between transition-colors ${reqStatus.simCompleted ? 'bg-emerald-50 border-emerald-300 text-emerald-900' : 'bg-rose-50 border-rose-300 text-rose-900'}`}>
                <span className="flex items-center gap-2">
                  {reqStatus.simCompleted ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <Clock className="w-4 h-4 text-rose-500" />}
                  Data simulation
                </span>
                <span className="text-[10px] font-mono font-black">{reqStatus.simCompleted ? 'DONE' : 'PENDING'}</span>
              </div>
              <div className={`p-2.5 rounded-xl border flex items-center justify-between transition-colors ${reqStatus.availabilitySet ? 'bg-emerald-50 border-emerald-300 text-emerald-900' : 'bg-rose-50 border-rose-300 text-rose-900'}`}>
                <span className="flex items-center gap-2">
                  {reqStatus.availabilitySet ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <Clock className="w-4 h-4 text-rose-500" />}
                  Availability
                </span>
                <span className="text-[10px] font-mono font-black">{reqStatus.availabilitySet ? 'DONE' : 'PENDING'}</span>
              </div>
              <div className={`p-2.5 rounded-xl border flex items-center justify-between transition-colors ${reqStatus.interviewBooked ? 'bg-emerald-50 border-emerald-300 text-emerald-900' : 'bg-rose-50 border-rose-300 text-rose-900'}`}>
                <span className="flex items-center gap-2">
                  {reqStatus.interviewBooked ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <Clock className="w-4 h-4 text-rose-500" />}
                  HR interview
                </span>
                <span className="text-[10px] font-mono font-black">{reqStatus.interviewBooked ? 'DONE' : 'PENDING'}</span>
              </div>
              <div className="p-2.5 rounded-xl border flex items-center justify-between bg-amber-50 border-amber-300 text-amber-950">
                <span className="flex items-center gap-2">
                  <Lock className="w-4 h-4 text-[#F97316]" />
                  Hired by Head HR
                </span>
                <span className="text-[10px] font-mono font-black">NOT YET</span>
              </div>
            </div>
          </div>

          <div className="pt-2 flex flex-col sm:flex-row justify-center gap-3">
            <Link
              href="/rbt"
              className="inline-flex items-center justify-center gap-2 bg-[#F97316] hover:bg-orange-600 text-white font-black text-xs px-6 py-4 rounded-2xl shadow-xl shadow-orange-500/25 transition-all duration-300 hover:scale-[1.01] cursor-pointer"
            >
              <ClipboardList className="w-4.5 h-4.5" />
              <span>Go to My Tasks →</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const handleOpenSickModal = (session?: ScheduledSession) => {
    setSelectedSessionForSick(session || null);
    setShowSickDayModal(true);
  };

  const handleSubmitSickDayRequest = (e: React.FormEvent) => {
    e.preventDefault();

    if (selectedSessionForSick) {
      setSessions(prev => prev.map(s => s.id === selectedSessionForSick.id ? { ...s, status: 'COVERAGE_REQUESTED' } : s));
    }

    setShowSickDayModal(false);
    setSickNote('');
    if (mode === 'SIMULATION') {
      toast.info('Practice call-out recorded locally. No coordinator or HR staff was contacted.');
    } else {
      toast.info('Call-out status updated in this view. Contact dispatch directly if immediate coverage is required.');
    }
  };

  const handleOpenFixDrawer = (session: IncompleteSessionItem) => {
    resumeIncompleteStudio(session);
  };

  const handleFixComplete = (sessionId: string) => {
    if (mode === 'LIVE') clearRbtPayHold(sessionId);
    setIncompleteSessions((prev) => prev.filter((s) => s.id !== sessionId));
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-12 text-slate-900">
      {mode === 'SIMULATION' && (
        <div
          className="relative overflow-hidden rounded-3xl border border-sky-300/30 bg-slate-950 p-5 text-white shadow-2xl"
          role="note"
          aria-label="Simulation schedule boundary"
        >
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.18),_transparent_48%)]" />
          <div className="relative flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <span className="font-mono text-[10px] font-black uppercase tracking-[0.18em] text-sky-300">
                Simulation schedule · fictional people
              </span>
              <p className="mt-1 max-w-2xl text-xs font-semibold leading-relaxed text-slate-300">
                Tabs, timers, fixes, and call-outs on this screen are practice-only. No staff are contacted and no clinical, billing, EVV, schedule, or payroll records are changed.
              </p>
            </div>
            <span className="shrink-0 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1.5 font-mono text-[10px] font-black uppercase text-emerald-300">
              No live writes
            </span>
          </div>
        </div>
      )}

      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-orange-200 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <Calendar className="w-7 h-7 text-[#F97316]" />
            <h1 className="text-3xl font-black text-slate-900 font-heading tracking-tight">
              {mode === 'SIMULATION' ? 'Simulation Schedule Sandbox' : 'My Therapy Session Schedule & Calendar'}
            </h1>
          </div>
          <p className="text-xs text-slate-600 font-semibold mt-1">
            {mode === 'SIMULATION'
              ? 'Practice navigating sample sessions, incomplete-note examples, and a fictional weekly schedule.'
              : 'Start EVV from Upcoming Schedule → Session Studio (collect → note → sign). Clinical review, billing, and payroll remain separate confirmed states.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {mode === 'LIVE' && (
            <Link
              href="/rbt/job-board"
              className="bg-[#F97316] hover:bg-orange-600 text-white font-black text-xs px-4 py-2.5 rounded-2xl shadow-lg flex items-center gap-2 transition-all cursor-pointer"
            >
              <Briefcase className="w-4 h-4" />
              <span>Go to Job Board</span>
            </Link>
          )}
          {/* 🚨 REQUEST SICK DAY / CALL-OUT BUTTON */}
          <button
            type="button"
            onClick={() => handleOpenSickModal()}
            data-scribe-id="btn-request-sick-day"
            className="bg-rose-500 hover:bg-rose-600 text-white font-black text-xs px-4 py-2.5 rounded-2xl shadow-lg flex items-center gap-2 transition-all cursor-pointer"
          >
            <AlertTriangle className="w-4 h-4 text-yellow-200" />
            <span>{mode === 'SIMULATION' ? 'Practice a Call-Out' : 'Request Sick Day / Call-Out'}</span>
          </button>
        </div>
      </div>

      {mode === 'LIVE' && !scheduleLoading && sessions.length === 0 && !activeSession && (
        <div className="rounded-3xl border-2 border-dashed border-orange-300 bg-orange-50/90 p-6 sm:p-8 text-center space-y-4 shadow-sm">
          <div className="w-14 h-14 rounded-2xl bg-white border-2 border-orange-200 text-[#F97316] flex items-center justify-center mx-auto shadow-md">
            <Calendar className="w-7 h-7" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-black font-heading text-slate-900">No CRM sessions on your schedule yet</h2>
            <p className="text-xs text-slate-600 font-semibold max-w-lg mx-auto leading-relaxed">
              Waiting on <strong>Case Coordination</strong> to assign shifts after your job-board match is confirmed.
              Once they schedule you in CRM, tap <strong>Refresh schedule</strong> or open{' '}
              <strong>Communication</strong> to follow up.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={refreshLiveSchedule}
              disabled={scheduleRefreshing}
              className="inline-flex items-center gap-2 rounded-2xl bg-[#F97316] enabled:hover:bg-orange-600 disabled:opacity-60 text-white text-xs font-black px-5 py-3 shadow-lg enabled:cursor-pointer disabled:cursor-not-allowed"
            >
              <RefreshCw className={`w-4 h-4 ${scheduleRefreshing ? 'animate-spin' : ''}`} />
              {scheduleRefreshing ? 'Refreshing…' : 'Refresh schedule'}
            </button>
            <Link
              href="/rbt/communication"
              className="inline-flex items-center gap-2 rounded-2xl border-2 border-orange-200 bg-white hover:bg-orange-50 text-slate-800 text-xs font-black px-5 py-3 cursor-pointer"
            >
              <MessageSquare className="w-4 h-4 text-[#F97316]" />
              Message Case Coord
            </Link>
            <Link
              href="/rbt/job-board"
              className="inline-flex items-center gap-2 rounded-2xl border-2 border-orange-200 bg-white hover:bg-orange-50 text-slate-800 text-xs font-black px-5 py-3 cursor-pointer"
            >
              <Briefcase className="w-4 h-4 text-[#F97316]" />
              Job Board
            </Link>
          </div>
        </div>
      )}

      {mode === 'LIVE' && scheduleLoading && sessions.length === 0 && (
        <div className="rounded-3xl border-2 border-orange-200 bg-white/80 p-8 text-center shadow-sm">
          <p className="text-sm font-black text-slate-500 animate-pulse">Loading your CRM schedule…</p>
        </div>
      )}

      <div
        className="flex flex-wrap border-b border-orange-200 gap-2"
        role="tablist"
        aria-label={mode === 'SIMULATION' ? 'Simulation schedule views' : 'Schedule views'}
      >
        <button
          id="rbt-schedule-tab-ACTIVE"
          type="button"
          role="tab"
          aria-selected={activeTab === 'ACTIVE'}
          aria-controls="rbt-schedule-panel-ACTIVE"
          tabIndex={activeTab === 'ACTIVE' ? 0 : -1}
          onClick={() => setActiveTab('ACTIVE')}
          onKeyDown={(event) => handleScheduleTabKeyDown(event, 'ACTIVE')}
          data-scribe-id="tab-active-sessions"
          className={`px-4 py-3 font-heading font-black text-xs rounded-t-2xl transition-all cursor-pointer flex items-center gap-2 ${
            activeTab === 'ACTIVE'
              ? 'bg-white border-2 border-b-0 border-orange-200 text-[#F97316] shadow-sm'
              : 'bg-[#F0F7FF] text-slate-600 border border-blue-200 hover:text-slate-900'
          }`}
        >
          <span className={`h-2.5 w-2.5 rounded-full ${mode === 'SIMULATION' ? 'bg-sky-500 animate-pulse' : 'bg-amber-500'}`} />
          <span>{mode === 'SIMULATION' ? 'Active Practice Session' : 'Session Activity'} ({activeSession ? 1 : 0})</span>
        </button>

        <button
          id="rbt-schedule-tab-INCOMPLETE"
          type="button"
          role="tab"
          aria-selected={activeTab === 'INCOMPLETE'}
          aria-controls="rbt-schedule-panel-INCOMPLETE"
          tabIndex={activeTab === 'INCOMPLETE' ? 0 : -1}
          onClick={() => setActiveTab('INCOMPLETE')}
          onKeyDown={(event) => handleScheduleTabKeyDown(event, 'INCOMPLETE')}
          data-scribe-id="tab-incomplete-sessions"
          className={`px-4 py-3 font-heading font-black text-xs rounded-t-2xl transition-all cursor-pointer flex items-center gap-2 ${
            activeTab === 'INCOMPLETE'
              ? 'bg-white border-2 border-b-0 border-orange-200 text-[#F97316] shadow-sm'
              : 'bg-[#F0F7FF] text-slate-600 border border-blue-200 hover:text-slate-900'
          }`}
        >
          <AlertTriangle className="w-4 h-4 text-amber-500" />
          <span>{mode === 'SIMULATION' ? 'Incomplete Note Samples' : 'Incomplete Documentation'} ({incompleteSessions.length})</span>
        </button>

        <button
          id="rbt-schedule-tab-SCHEDULE"
          type="button"
          role="tab"
          aria-selected={activeTab === 'SCHEDULE'}
          aria-controls="rbt-schedule-panel-SCHEDULE"
          tabIndex={activeTab === 'SCHEDULE' ? 0 : -1}
          onClick={() => setActiveTab('SCHEDULE')}
          onKeyDown={(event) => handleScheduleTabKeyDown(event, 'SCHEDULE')}
          data-scribe-id="tab-upcoming-schedule"
          className={`px-4 py-3 font-heading font-black text-xs rounded-t-2xl transition-all cursor-pointer flex items-center gap-2 ${
            activeTab === 'SCHEDULE'
              ? 'bg-white border-2 border-b-0 border-orange-200 text-[#F97316] shadow-sm'
              : 'bg-[#F0F7FF] text-slate-600 border border-blue-200 hover:text-slate-900'
          }`}
        >
          <Calendar className="w-4 h-4 text-[#F97316]" />
          <span>{mode === 'SIMULATION' ? 'Sample Schedule' : 'Upcoming Schedule'} ({sessions.length})</span>
        </button>

        <button
          id="rbt-schedule-tab-COMPLETED"
          type="button"
          role="tab"
          aria-selected={activeTab === 'COMPLETED'}
          aria-controls="rbt-schedule-panel-COMPLETED"
          tabIndex={activeTab === 'COMPLETED' ? 0 : -1}
          onClick={() => setActiveTab('COMPLETED')}
          onKeyDown={(event) => handleScheduleTabKeyDown(event, 'COMPLETED')}
          data-scribe-id="tab-completed-claims"
          className={`px-4 py-3 font-heading font-black text-xs rounded-t-2xl transition-all cursor-pointer flex items-center gap-2 ${
            activeTab === 'COMPLETED'
              ? 'bg-white border-2 border-b-0 border-orange-200 text-[#F97316] shadow-sm'
              : 'bg-[#F0F7FF] text-slate-600 border border-blue-200 hover:text-slate-900'
          }`}
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span>{mode === 'SIMULATION' ? 'Completed Samples' : 'Completion Status'} ({completedSessions.length})</span>
        </button>
      </div>

      {/* 🔴 TAB 1: ACTIVE LIVE SESSIONS VIEW */}
      {activeTab === 'ACTIVE' && (
        <div
          id="rbt-schedule-panel-ACTIVE"
          role="tabpanel"
          aria-labelledby="rbt-schedule-tab-ACTIVE"
          className="bg-white border-2 border-orange-200 rounded-3xl p-6 sm:p-8 space-y-6 shadow-xl"
        >
          <div className="flex items-center justify-between border-b border-orange-100 pb-4">
            <div>
              <h3 className="text-lg font-black text-slate-900 font-heading flex items-center gap-2">
                <span className={`w-3 h-3 rounded-full ${mode === 'SIMULATION' ? 'bg-sky-500' : 'bg-amber-500'}`} />
                {mode === 'SIMULATION' ? 'Simulated Session in Progress' : 'Session Activity Status'}
              </h3>
              <p className="text-xs text-slate-600 font-semibold mt-0.5">
                {mode === 'SIMULATION'
                  ? 'A local practice timer and fictional session summary. No EVV visit exists.'
                  : 'Authoritative clock-in and EVV status is available in Session Studio; this schedule panel does not currently receive that evidence.'}
              </p>
            </div>
            <span className={`${mode === 'SIMULATION' ? 'border-sky-300 bg-sky-100 text-sky-800' : 'border-amber-300 bg-amber-100 text-amber-900'} border text-[10px] font-black px-3 py-1 rounded-full uppercase`}>
              {mode === 'SIMULATION' ? 'SIMULATED TIMER' : 'CLOCK-IN STATUS NOT CONFIRMED'}
            </span>
          </div>

          {activeSession ? (
            <div className="p-6 bg-white border-2 border-orange-200 rounded-3xl shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <h4 className="text-xl font-black font-heading text-[#F97316]">
                    {activeSession.client}{mode === 'SIMULATION' ? ' (fictional)' : ''}
                  </h4>
                  <span className="bg-orange-100 text-[#F97316] border border-orange-300 text-[10px] font-black font-mono px-2.5 py-0.5 rounded-full">
                    Age {activeSession.age}
                  </span>
                  <span className="bg-emerald-100 text-emerald-800 border border-emerald-300 text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1">
                    {mode === 'SIMULATION' ? 'SAMPLE EVV' : (
                      <>
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> EVV STATUS NOT CONFIRMED
                      </>
                    )}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-4 text-xs font-extrabold text-slate-700">
                  <span className="flex items-center gap-1.5"><MapPin className="w-4 h-4 text-purple-600" /> {activeSession.location}</span>
                  <span className="flex items-center gap-1.5"><User className="w-4 h-4 text-blue-600" /> {activeSession.bcba}</span>
                </div>

                <div className="flex flex-wrap items-center gap-3 text-xs pt-1">
                  <div className="bg-emerald-50 border-2 border-emerald-200 px-3.5 py-1.5 rounded-2xl font-mono text-emerald-900 font-black">
                    {mode === 'SIMULATION' ? 'Sample' : 'Logged'}: {activeSession.loggedTrials} DTT Trials ({activeSession.accuracyPercent}% response rate)
                  </div>
                  <div className="bg-orange-50 border-2 border-orange-200 px-3.5 py-1.5 rounded-2xl font-mono text-[#F97316] font-black">
                    {mode === 'SIMULATION' ? 'Practice estimate' : 'Units'}: {activeBillableUnits}.0 CPT 97153 units
                  </div>
                </div>
              </div>

              {/* LIVE CLOCK & RESUME ACTION */}
              <div className="flex flex-col items-end gap-3 border-t md:border-t-0 md:border-l border-orange-100 pt-4 md:pt-0 md:pl-6">
                <div className="bg-orange-50/90 border-2 border-[#F97316] px-4 py-2 rounded-2xl text-right shadow-md">
                  <span className="text-[9px] font-mono font-black text-[#F97316] uppercase tracking-widest block">
                    {mode === 'SIMULATION' ? 'Practice elapsed time' : 'Displayed elapsed time'}
                  </span>
                  <span className="text-xl font-mono font-black text-slate-900">{formatSeconds(activeSessionSeconds)}</span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsActiveClockRunning(!isActiveClockRunning)}
                    aria-label={isActiveClockRunning ? 'Pause practice timer' : 'Resume practice timer'}
                    aria-pressed={!isActiveClockRunning}
                    className="p-2.5 rounded-xl bg-slate-100 border border-slate-300 text-slate-700 hover:bg-slate-200 cursor-pointer transition-all"
                  >
                    {isActiveClockRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 text-emerald-600" />}
                  </button>

                  {onStartEvvClick ? (
                    <button
                      type="button"
                      onClick={onStartEvvClick}
                      data-scribe-id="btn-resume-live-session"
                      className="bg-[#F97316] hover:bg-orange-600 text-white font-black text-xs px-6 py-3 rounded-2xl shadow-xl flex items-center gap-2 transition-all cursor-pointer"
                    >
                      <span>{mode === 'SIMULATION' ? 'Continue Practice Data Collection' : '▶️ Resume Session Data Collection'}</span>
                    </button>
                  ) : (
                    <Link
                      href="/rbt/simulation"
                      data-scribe-id="btn-resume-live-session"
                      className="bg-[#F97316] hover:bg-orange-600 text-white font-black text-xs px-6 py-3 rounded-2xl shadow-xl flex items-center gap-2 transition-all cursor-pointer"
                    >
                      <span>Continue Practice Data Collection</span>
                    </Link>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="p-8 text-center bg-slate-50 border-2 border-dashed border-slate-200 rounded-3xl space-y-3">
              <div className="w-10 h-10 rounded-2xl bg-orange-100 text-[#F97316] flex items-center justify-center font-bold mx-auto">
                <Briefcase className="w-5 h-5 text-[#F97316]" />
              </div>
              <h4 className="text-sm font-black text-slate-900 font-heading">
                {mode === 'SIMULATION' ? 'No active practice scenario' : 'No active-session evidence in this view'}
              </h4>
              <p className="text-xs text-slate-500 font-medium max-w-md mx-auto">
                {mode === 'LIVE'
                  ? 'Open Session Studio for authoritative clock-in state, or start an upcoming session from the schedule.'
                  : (
                    <>
                      Open the <strong>Sample Schedule</strong> tab to select another fictional practice scenario.
                    </>
                  )}
              </p>
              {mode === 'LIVE' ? (
                <button
                  type="button"
                  onClick={() => setActiveTab('SCHEDULE')}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#F97316] hover:bg-orange-600 text-white text-[11px] font-black px-4 py-2 cursor-pointer"
                >
                  Go to Upcoming Schedule →
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setActiveTab('SCHEDULE')}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#F97316] hover:bg-orange-600 text-white text-[11px] font-black px-4 py-2 cursor-pointer"
                >
                  Open Sample Schedule →
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: INCOMPLETE DOCUMENTATION VIEW */}
      {activeTab === 'INCOMPLETE' && (
        <div
          id="rbt-schedule-panel-INCOMPLETE"
          role="tabpanel"
          aria-labelledby="rbt-schedule-tab-INCOMPLETE"
          className="bg-white border-2 border-orange-200 rounded-3xl p-6 sm:p-8 space-y-6 shadow-xl"
        >
          <div className="flex items-center justify-between border-b border-orange-100 pb-4">
            <div>
              <h3 className="text-lg font-black text-slate-900 font-heading flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
                {mode === 'SIMULATION' ? 'Sample Incomplete Notes' : 'Incomplete Sessions Needing Attention'}
              </h3>
              <p className="text-xs text-slate-600 font-semibold mt-0.5">
                {mode === 'SIMULATION'
                  ? 'Fictional examples for practicing how to identify and repair missing documentation.'
                  : 'Locally listed documentation issues that need attention. Billing, clinical review, and payroll status are not confirmed here.'}
              </p>
            </div>
            <span className="bg-amber-100 text-amber-900 border border-amber-300 text-[10px] font-black px-3 py-1 rounded-full uppercase">
              ACTION REQUIRED ({incompleteSessions.length})
            </span>
          </div>

          <div className="space-y-4">
            {incompleteSessions.length === 0 ? (
              <div className="p-8 text-center bg-emerald-50 rounded-3xl border border-emerald-200 space-y-2">
                <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
                <h4 className="font-black text-slate-900 text-sm">
                  {mode === 'SIMULATION' ? 'Practice samples resolved' : 'No documentation issues listed'}
                </h4>
                <p className="text-xs text-slate-600">
                  {mode === 'SIMULATION'
                    ? 'The sample cards were removed from this local attempt only.'
                    : 'This local list does not confirm signatures, clinical review, billing, or payroll status.'}
                </p>
              </div>
            ) : (
              incompleteSessions.map((session) => (
                <div
                  key={session.id}
                  className="bg-amber-50/60 border-2 border-amber-300 rounded-3xl p-6 shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <h4 className="text-lg font-black text-slate-900 font-heading">
                        {session.client}{mode === 'SIMULATION' ? ' · fictional' : ''}
                      </h4>
                      <span className="bg-amber-200 text-amber-900 border border-amber-300 text-[10px] font-mono font-black px-2.5 py-0.5 rounded-full">
                        ⚠️ {session.missingReason.replace(/_/g, ' ')}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-4 text-xs font-semibold text-slate-600">
                      <span className="flex items-center gap-1"><Calendar className="w-4 h-4 text-[#F97316]" /> {session.date}</span>
                      <span className="flex items-center gap-1"><Clock className="w-4 h-4 text-[#F97316]" /> {session.time}</span>
                      <span className="flex items-center gap-1"><MapPin className="w-4 h-4 text-purple-600" /> {session.location}</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleOpenFixDrawer(session)}
                    data-scribe-id="btn-fix-incomplete-session"
                    className="bg-[#F97316] hover:bg-orange-600 text-white font-black text-xs px-6 py-3.5 rounded-2xl shadow-lg cursor-pointer transition-all flex items-center justify-center gap-2"
                  >
                    <span>
                      {mode === 'LIVE' ? 'Resume Session Studio →' : 'Open Practice Fix →'}
                    </span>
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* 📅 TAB 3: UPCOMING SCHEDULE VIEW */}
      {activeTab === 'SCHEDULE' && (
        <div
          id="rbt-schedule-panel-SCHEDULE"
          role="tabpanel"
          aria-labelledby="rbt-schedule-tab-SCHEDULE"
          className="space-y-4"
        >
          {/* VIEW MODE TOGGLE STRIP */}
          <div className="flex justify-end">
            <div className="bg-[#F0F7FF] border-2 border-[#BFDBFE] p-1 rounded-2xl flex items-center gap-1">
              <button
                onClick={() => setViewMode('CALENDAR')}
                className={`px-3 py-1.5 rounded-xl font-extrabold text-xs transition-all cursor-pointer ${
                  viewMode === 'CALENDAR' ? 'bg-[#F97316] text-white shadow-sm' : 'text-slate-700 hover:text-slate-900'
                }`}
              >
                📅 Calendar Grid
              </button>
              <button
                onClick={() => setViewMode('TIMELINE')}
                className={`px-3 py-1.5 rounded-xl font-extrabold text-xs transition-all cursor-pointer ${
                  viewMode === 'TIMELINE' ? 'bg-[#F97316] text-white shadow-sm' : 'text-slate-700 hover:text-slate-900'
                }`}
              >
                📋 Timeline Feed
              </button>
            </div>
          </div>

          {viewMode === 'CALENDAR' ? (
            <div className="bg-white border-2 border-orange-200 rounded-3xl p-6 shadow-xl space-y-6">
              <div className="flex items-center justify-between border-b border-orange-100 pb-4">
                <div className="flex items-center gap-2">
                  <span className="text-base font-black text-slate-900 font-heading">
                    {weekAnchor.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: CLINIC_TIME_ZONE })} — Weekly Schedule
                  </span>
                  <span className="bg-orange-100 text-[#F97316] border border-orange-300 text-[10px] font-black px-2.5 py-0.5 rounded-full">
                    {sessions.length} Upcoming Sessions
                  </span>
                </div>

                <div className="flex items-center gap-2 text-xs font-bold text-slate-600">
                  <button
                    type="button"
                    onClick={() => setWeekAnchor((prev) => addClinicDays(prev, -7))}
                    className="p-2 hover:bg-orange-50 rounded-xl cursor-pointer"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span>
                    {weekAnchor.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: CLINIC_TIME_ZONE })}
                    {' – '}
                    {addClinicDays(weekAnchor, 4).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      timeZone: CLINIC_TIME_ZONE,
                    })}
                  </span>
                  <button
                    type="button"
                    onClick={() => setWeekAnchor((prev) => addClinicDays(prev, 7))}
                    className="p-2 hover:bg-orange-50 rounded-xl cursor-pointer"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Mon–Fri calendar matrix keyed by clinic-TZ date (not hardcoded demo week) */}
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                {Array.from({ length: 5 }, (_, idx) => {
                  const dayDate = addClinicDays(weekAnchor, idx);
                  const dateKey = localDateKey(dayDate);
                  const dayLabel = dayDate.toLocaleDateString('en-US', {
                    weekday: 'long',
                    month: 'short',
                    day: 'numeric',
                    timeZone: CLINIC_TIME_ZONE,
                  });
                  const daySessions = sessions.filter((s) => s.date === dateKey);

                  return (
                    <div key={dateKey} className="bg-slate-50 border-2 border-slate-200 rounded-2xl p-3.5 space-y-3 min-h-[220px]">
                      <div className="border-b border-slate-200 pb-2 flex items-center justify-between">
                        <span className="text-xs font-black text-slate-900 font-heading">{dayLabel}</span>
                        <span className="text-[10px] font-mono font-bold text-slate-400">{daySessions.length}</span>
                      </div>

                      {daySessions.length === 0 ? (
                        <div className="text-[11px] text-slate-400 font-semibold italic text-center pt-8">
                          No sessions scheduled
                        </div>
                      ) : (
                        daySessions.map((session) => (
                          <div
                            key={session.id}
                            className={`p-3 rounded-2xl border-2 space-y-2 transition-all shadow-sm ${
                              session.status === 'COVERAGE_REQUESTED'
                                ? 'bg-rose-50 border-rose-300'
                                : 'bg-white border-orange-200 hover:border-[#F97316]'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <strong className="text-xs font-extrabold text-slate-900">
                                {session.client}{mode === 'SIMULATION' ? ' · fictional' : ''}
                              </strong>
                              <span className={`text-[9px] font-mono font-black px-2 py-0.5 rounded border ${
                                session.status === 'COVERAGE_REQUESTED'
                                  ? 'bg-rose-100 text-rose-800 border-rose-300'
                                  : 'bg-emerald-100 text-emerald-800 border-emerald-300'
                              }`}>
                                {session.status === 'COVERAGE_REQUESTED'
                                  ? mode === 'SIMULATION' ? 'PRACTICE CALL-OUT' : 'SICK CALL-OUT'
                                  : mode === 'SIMULATION' ? `SAMPLE ${session.status}` : session.status}
                              </span>
                            </div>

                            <div className="text-[11px] text-slate-600 font-semibold space-y-0.5">
                              <p className="flex items-center gap-1"><Clock className="w-3 h-3 text-[#F97316]" /> {session.time}</p>
                              <p className="flex items-center gap-1 text-[10px] text-slate-500 truncate"><MapPin className="w-3 h-3 text-purple-600" /> {session.location}</p>
                            </div>

                            <div className="flex flex-col gap-1.5 pt-1 border-t border-slate-100">
                              {mode === 'SIMULATION' && onStartEvvClick ? (
                                <button
                                  type="button"
                                  onClick={onStartEvvClick}
                                  data-scribe-id="btn-evv-start-session"
                                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] py-1.5 rounded-xl text-center shadow-sm cursor-pointer"
                                >
                                  Start Practice Session →
                                </button>
                              ) : mode === 'SIMULATION' ? (
                                <Link
                                  href="/rbt/simulation"
                                  data-scribe-id="btn-evv-start-session"
                                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] py-1.5 rounded-xl text-center shadow-sm cursor-pointer"
                                >
                                  Start Practice Session →
                                </Link>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => openSessionStudio(session)}
                                  data-scribe-id="btn-evv-start-session"
                                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] py-1.5 rounded-xl text-center shadow-sm cursor-pointer"
                                >
                                  EVV Start Session →
                                </button>
                              )}

                              {session.status !== 'COVERAGE_REQUESTED' && (
                                <button
                                  type="button"
                                  onClick={() => handleOpenSickModal(session)}
                                  className="text-[10px] font-bold text-rose-600 hover:underline text-left cursor-pointer"
                                >
                                  {mode === 'SIMULATION' ? 'Practice a call-out' : '🚨 Request Sick Call-Out'}
                                </button>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {sessions.length === 0 ? (
                <div className="bg-white border-2 border-dashed border-orange-200 rounded-3xl p-8 text-center space-y-3 shadow-sm">
                  <Calendar className="w-8 h-8 text-[#F97316] mx-auto" />
                  <h4 className="text-sm font-black text-slate-900 font-heading">No upcoming sessions</h4>
                  <p className="text-xs text-slate-500 font-medium max-w-md mx-auto">
                    {mode === 'LIVE'
                      ? 'Case Coord has not scheduled any shifts for you yet. Refresh after they assign sessions in CRM.'
                      : 'No practice sessions in this view.'}
                  </p>
                  {mode === 'LIVE' && (
                    <button
                      type="button"
                      onClick={refreshLiveSchedule}
                      disabled={scheduleRefreshing}
                      className="inline-flex items-center gap-2 rounded-xl bg-[#F97316] enabled:hover:bg-orange-600 disabled:opacity-60 text-white text-[11px] font-black px-4 py-2 enabled:cursor-pointer disabled:cursor-not-allowed"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${scheduleRefreshing ? 'animate-spin' : ''}`} />
                      Refresh schedule
                    </button>
                  )}
                </div>
              ) : (
                sessions.map((session) => (
                <div
                  key={session.id}
                  className={`bg-white border-2 rounded-3xl p-6 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all ${
                    session.status === 'COVERAGE_REQUESTED' ? 'border-rose-300 bg-rose-50/50' : 'border-orange-200 hover:border-[#F97316]'
                  }`}
                >
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <h3 className="text-lg font-black text-slate-900 font-heading">
                        {session.client}{mode === 'SIMULATION' ? ' · fictional' : ''}
                      </h3>
                      <span className="bg-orange-100 text-[#F97316] border border-orange-300 text-[10px] font-black px-2.5 py-0.5 rounded-full">
                        Age {session.age}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-4 text-xs font-semibold text-slate-600">
                      <span className="flex items-center gap-1.5 text-slate-900 font-bold"><Calendar className="w-4 h-4 text-[#F97316]" /> {session.dayOfWeek}, {session.date}</span>
                      <span className="flex items-center gap-1"><Clock className="w-4 h-4 text-[#F97316]" /> {session.time}</span>
                      <span className="flex items-center gap-1"><User className="w-4 h-4 text-blue-600" /> {session.bcba}</span>
                      <span className="flex items-center gap-1"><MapPin className="w-4 h-4 text-purple-600" /> {session.location}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {mode === 'SIMULATION' && onStartEvvClick ? (
                      <button
                        type="button"
                        onClick={onStartEvvClick}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs px-5 py-3 rounded-2xl shadow-md cursor-pointer transition-all"
                      >
                        Start Practice Session
                      </button>
                    ) : mode === 'SIMULATION' ? (
                      <Link
                        href="/rbt/simulation"
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs px-5 py-3 rounded-2xl shadow-md cursor-pointer transition-all"
                      >
                        Start Practice Session
                      </Link>
                    ) : (
                      <button
                        type="button"
                        onClick={() => openSessionStudio(session)}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs px-5 py-3 rounded-2xl shadow-md cursor-pointer transition-all"
                      >
                        EVV Start Session
                      </button>
                    )}
                  </div>
                </div>
              ))
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: COMPLETION RECORDS WITH EVIDENCE-GATED STATUS COPY */}
      {activeTab === 'COMPLETED' && (
        <div
          id="rbt-schedule-panel-COMPLETED"
          role="tabpanel"
          aria-labelledby="rbt-schedule-tab-COMPLETED"
          className="bg-white border-2 border-orange-200 rounded-3xl p-6 sm:p-8 space-y-6 shadow-xl"
        >
          <div className="flex items-center justify-between border-b border-orange-100 pb-4">
            <div>
              <h3 className="text-lg font-black text-slate-900 font-heading flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                {mode === 'SIMULATION' ? 'Sample Completion Cards' : 'Completed Session Documentation'}
              </h3>
              <p className="text-xs text-slate-600 font-semibold mt-0.5">
                {mode === 'SIMULATION'
                  ? 'Fictional examples illustrate session completion only; no signatures, billing conversion, or payroll state is implied.'
                  : 'Later clinical and billing states appear only when durable SessionNote evidence is present in this schedule data.'}
              </p>
            </div>
            <span className="bg-slate-100 text-slate-700 border border-slate-300 text-[10px] font-black px-3 py-1 rounded-full uppercase">
              {completedSessions.length} {mode === 'SIMULATION' ? 'SAMPLE CARDS' : 'COMPLETION RECORDS'}
            </span>
          </div>

          <p
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className="sr-only"
          >
            {completedSessions.length === 0
              ? 'No completed session records are listed.'
              : `${completedSessions.length} completed session ${completedSessions.length === 1 ? 'record is' : 'records are'} listed. Billing and clinical review are announced only when confirmed by durable note evidence.`}
          </p>

          <div className="space-y-3">
            {completedSessions.length === 0 ? (
              <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-slate-50/90 p-8 text-center shadow-sm">
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(249,115,22,0.08),_transparent_58%)]" />
                <div className="relative space-y-2">
                  <FileText className="mx-auto h-8 w-8 text-slate-400" aria-hidden="true" />
                  <h4 className="font-heading text-sm font-black text-slate-900">
                    No completion records listed
                  </h4>
                  <p className="text-xs font-semibold text-slate-600">
                    Billing and clinical review status are not yet confirmed in this view.
                  </p>
                </div>
              </div>
            ) : completedSessions.map((c) => {
              // This list currently comes from local Studio metadata, not a SessionNote DTO.
              // Pass only its local status until the server query supplies durable note evidence.
              const completion = describeScheduleCompletion({ status: c.status });
              const toneClasses = COMPLETION_TONE_CLASSES[completion.tone];

              return (
                <article
                  key={c.id}
                  aria-label={`${c.client} completion status: ${completion.label}`}
                  className="relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-50/90 p-4 text-xs font-semibold shadow-sm transition-all duration-300 hover:border-orange-300 hover:shadow-lg"
                >
                  <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(249,115,22,0.07),_transparent_48%)]" />
                  <div className="relative flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <strong className="text-sm font-bold text-slate-900">
                          {c.client}{mode === 'SIMULATION' ? ' · fictional' : ''}
                        </strong>
                        <span className={`rounded-full border px-2.5 py-0.5 font-mono text-[10px] font-black uppercase ${toneClasses.badge}`}>
                          <span className="sr-only">Status: </span>
                          {completion.label}
                        </span>
                      </div>
                      <p className="text-slate-500">
                        {c.date} ({c.time}) · {c.units}.0 documented CPT 97153 units
                      </p>
                    </div>

                    <div className="max-w-sm space-y-1 text-left sm:text-right">
                      {completion.reference && (
                        <span className="block font-mono text-[10px] font-black text-emerald-700">
                          Plutus reference: {completion.reference}
                        </span>
                      )}
                      <span className={`block text-[11px] font-bold leading-relaxed ${toneClasses.detail}`}>
                        {completion.detail}
                      </span>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      )}

      {/* 🚨 SICK DAY / EMERGENCY TIME-OFF CALL-OUT MODAL */}
      {mounted && showSickDayModal && createPortal(
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[999999] flex items-center justify-center p-4">
          <div
            ref={sickDialogRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby="rbt-callout-dialog-title"
            aria-describedby="rbt-callout-dialog-description"
            className="bg-white border-2 border-rose-300 rounded-3xl max-w-lg w-full p-6 sm:p-8 space-y-6 shadow-2xl animate-fade-in text-slate-900 relative z-[1000000] outline-none"
          >
            <div className="flex items-center justify-between border-b border-rose-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-rose-100 border border-rose-300 text-rose-700 flex items-center justify-center font-bold">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <div>
                  <h3 id="rbt-callout-dialog-title" className="text-lg font-black text-slate-900 font-heading">
                    {mode === 'SIMULATION' ? 'Practice a Call-Out' : 'Request Sick Day / Call-Out'}
                  </h3>
                  <span id="rbt-callout-dialog-description" className="text-[11px] text-slate-500 font-semibold">
                    {mode === 'SIMULATION'
                      ? 'Training form only — no coordinator or HR staff will be contacted.'
                      : 'Record the affected shift, then contact dispatch directly for urgent coverage.'}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowSickDayModal(false)}
                aria-label="Close call-out dialog"
                className="text-slate-400 hover:text-slate-700 font-bold text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitSickDayRequest} className="space-y-4">
              {selectedSessionForSick && (
                <div className="p-3.5 bg-rose-50 rounded-2xl border border-rose-200 text-xs text-rose-900 font-semibold space-y-1">
                  <strong>{mode === 'SIMULATION' ? 'Fictional affected session:' : 'Affected Client Session:'}</strong>
                  <p>{selectedSessionForSick.client}{mode === 'SIMULATION' ? ' · fictional' : ''} · {selectedSessionForSick.dayOfWeek}, {selectedSessionForSick.date} ({selectedSessionForSick.time})</p>
                </div>
              )}

              <div>
                <label htmlFor="rbt-callout-reason" className="text-xs font-bold text-slate-800 block mb-1.5">Reason for Call-Out</label>
                <select
                  id="rbt-callout-reason"
                  value={sickReason}
                  onChange={(e) => setSickReason(e.target.value)}
                  className="w-full bg-[#F0F7FF] border-2 border-[#BFDBFE] rounded-2xl p-3 text-xs text-slate-900 font-bold outline-none focus:border-rose-500"
                >
                  <option value="Sudden Illness / Sick Day">Sudden Illness / Sick Day</option>
                  <option value="Family Emergency">Family Emergency</option>
                  <option value="Vehicle / Transportation Breakdown">Vehicle / Transportation Breakdown</option>
                  <option value="Planned Paid Time Off (PTO)">Planned Paid Time Off (PTO)</option>
                </select>
              </div>

              <div>
                <label htmlFor="rbt-callout-note" className="text-xs font-bold text-slate-800 block mb-1.5">
                  {mode === 'SIMULATION' ? 'Practice coverage note' : 'Message for Case Coordinator'}
                </label>
                <textarea
                  id="rbt-callout-note"
                  value={sickNote}
                  onChange={(e) => setSickNote(e.target.value)}
                  placeholder={mode === 'SIMULATION'
                    ? 'Type a fictional note for this practice scenario…'
                    : 'Provide brief details for emergency RBT substitute matching…'}
                  className="w-full bg-[#F0F7FF] border-2 border-[#BFDBFE] rounded-2xl p-3 text-xs text-slate-900 font-bold outline-none focus:border-rose-500 h-24"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowSickDayModal(false)}
                  className="px-5 py-3 rounded-2xl border-2 border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <Button
                  type="submit"
                  className="bg-rose-600 hover:bg-rose-700 text-white font-black text-xs px-6 py-3.5 rounded-2xl shadow-lg cursor-pointer"
                >
                  {mode === 'SIMULATION' ? 'Record Practice Call-Out Locally' : 'Update Call-Out Status'}
                </Button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* 🌟 SIMULATION-only incomplete fix drawer */}
      {mode === 'SIMULATION' && (
        <FixIncompleteSessionDrawer
          key={selectedIncompleteSession?.id ?? 'closed-practice-fix'}
          mode="SIMULATION"
          session={selectedIncompleteSession}
          isOpen={isIncompleteDrawerOpen}
          onClose={() => setIsIncompleteDrawerOpen(false)}
          onFixComplete={handleFixComplete}
        />
      )}
    </div>
  );
}
