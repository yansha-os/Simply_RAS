'use client';

import React, { useState, useTransition } from 'react';
import {
  UserCircle2,
  X,
  FlaskConical,
  Trash2,
  Rocket,
  Activity,
  RefreshCw,
  ExternalLink,
  HeartPulse,
} from 'lucide-react';
import { toast } from 'sonner';
import { useHrmRole, HrmRole } from '@/lib/useHrmRole';
import { setImpersonationCookie, type DevQaStatusSnapshot } from '@/app/actions/devTools';

const CRM_BASE = (process.env.NEXT_PUBLIC_CRM_URL || 'http://localhost:3000').replace(/\/$/, '');

type HealthState = 'checking' | 'up' | 'degraded' | 'missing' | 'opaque' | 'down';

const HEALTH_META: Record<HealthState, { dot: string; label: string }> = {
  checking: { dot: 'bg-zinc-500 animate-pulse', label: 'checking…' },
  up: { dot: 'bg-green-500', label: 'healthy' },
  degraded: { dot: 'bg-amber-500', label: 'db probe failing' },
  missing: { dot: 'bg-zinc-600', label: 'not deployed yet' },
  opaque: { dot: 'bg-amber-500', label: 'reachable (no CORS)' },
  down: { dot: 'bg-rose-500', label: 'unreachable' },
};

async function probeHealth(url: string): Promise<HealthState> {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (res.ok) return 'up';
    if (res.status === 404) return 'missing';
    if (res.status === 503) return 'degraded';
    return 'down';
  } catch {
    // Cross-origin without CORS headers — opaque probe still proves the app answers.
    try {
      await fetch(url, { mode: 'no-cors', cache: 'no-store' });
      return 'opaque';
    } catch {
      return 'down';
    }
  }
}

function HealthPill({ app, state }: { app: string; state: HealthState }) {
  const meta = HEALTH_META[state];
  return (
    <div className="flex-1 flex items-center gap-1.5 rounded-lg border border-white/5 bg-zinc-900/40 px-2 py-1.5 min-w-0">
      <span className={`w-2 h-2 rounded-full shrink-0 ${meta.dot}`} />
      <span className="text-[10px] font-bold text-zinc-300 shrink-0">{app}</span>
      <span className="text-[9px] text-zinc-500 truncate">{meta.label}</span>
    </div>
  );
}

function QuickLink({
  href,
  label,
  external = false,
  disabledHint,
}: {
  href: string | null;
  label: string;
  external?: boolean;
  disabledHint?: string;
}) {
  if (!href) {
    return (
      <span
        title={disabledHint || 'Unavailable'}
        className="flex items-center gap-1 rounded-lg border border-white/5 bg-zinc-900/40 px-2 py-1.5 text-[10px] font-semibold text-zinc-600 cursor-not-allowed"
      >
        <span className="truncate">{label}</span>
      </span>
    );
  }
  return (
    <a
      href={href}
      target={external ? '_blank' : undefined}
      rel={external ? 'noreferrer' : undefined}
      className="flex items-center gap-1 rounded-lg border border-white/10 bg-zinc-900/60 px-2 py-1.5 text-[10px] font-semibold text-zinc-300 transition-colors hover:border-cyan-500/40 hover:text-cyan-300 cursor-pointer"
    >
      <span className="truncate">{label}</span>
      {external && <ExternalLink className="w-2.5 h-2.5 shrink-0 opacity-60" />}
    </a>
  );
}

function StatusRow({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="flex items-center justify-between rounded border border-white/5 bg-zinc-900/40 px-2 py-1">
      <span className="text-[9px] text-zinc-400">{label}</span>
      <span className="text-[10px] font-mono font-bold text-white">{value}</span>
    </div>
  );
}

export function HrmDevToolsUI() {
  const isDevEnabled =
    process.env.NODE_ENV !== 'production' &&
    process.env.NEXT_PUBLIC_ENABLE_DEV_TOOLS === 'true';

  if (!isDevEnabled) {
    return null;
  }

  return <HrmDevToolsPanel />;
}

function HrmDevToolsPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'roles' | 'users' | 'applicants'>('roles');
  const { role, setRole } = useHrmRole();
  const [activeUserId, setActiveUserId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [seedPending, setSeedPending] = useState(false);

  const isImpersonating = Boolean(activeUserId || (role && role !== 'NONE'));

  const hrmRoles: { role: HrmRole; label: string; route: string }[] = [
    { role: 'NONE', label: 'Public (No Role)', route: '/' },
    { role: 'APPLICANT', label: 'RBT Applicant', route: '/rbt' },
    { role: 'HEAD_HR', label: 'Head HR', route: '/' },
    { role: 'HR_AGENT', label: 'HR Agent', route: '/ats' },
    { role: 'FINANCE', label: 'Finance', route: '/payroll' },
    { role: 'RBT', label: 'RBT Active Staff', route: '/rbt/schedule' },
  ];

  const SEED_ACTIVE_USERS = [
    {
      id: 'edbd9e0c-b8cb-4206-b297-ff81dc4ade88',
      name: 'Eleanor Vance',
      role: 'HEAD_HR',
      email: 'head.hr@riseandshine.com',
      route: '/hr-dashboard',
      canDelete: false as const,
      candidateId: null as string | null,
    },
    {
      id: '6646e619-2a55-48c9-a208-2d6c1dfcdb0a',
      name: 'Marcus Vance',
      role: 'HR_AGENT',
      email: 'marcus.v@riseandshine.nyc',
      route: '/ats',
      canDelete: false as const,
      candidateId: null as string | null,
    },
    {
      id: 'usr-3',
      name: 'Emily Taylor',
      role: 'FINANCE',
      email: 'emily.t@riseandshine.nyc',
      route: '/payroll',
      canDelete: false as const,
      candidateId: null as string | null,
    },
    {
      id: 'usr-4',
      name: 'David Miller (Active RBT)',
      role: 'RBT',
      email: 'david.m@riseandshine.nyc',
      route: '/rbt/schedule',
      canDelete: false as const,
      candidateId: null as string | null,
    },
  ];

  type DevPerson = {
    id: string;
    name: string;
    role: string;
    email: string;
    route: string;
    canDelete: boolean;
    candidateId: string | null;
  };

  type DevApplicant = {
    id: string;
    name: string;
    email: string;
    role: string;
    appliedDate: string;
    stage?: string;
    activationStatus?: string;
    userId?: string | null;
  };

  const [pipelineApplicants, setPipelineApplicants] = useState<DevApplicant[]>([]);
  const [hiredRbts, setHiredRbts] = useState<DevPerson[]>([]);
  const [snapshot, setSnapshot] = useState<DevQaStatusSnapshot | null>(null);
  const [snapshotPending, setSnapshotPending] = useState(false);
  const [hrmHealth, setHrmHealth] = useState<HealthState>('checking');
  const [crmHealth, setCrmHealth] = useState<HealthState>('checking');

  const refreshQaStatus = React.useCallback(async () => {
    setSnapshotPending(true);
    try {
      const { devGetQaStatusSnapshot } = await import('@/app/actions/devTools');
      const res = await devGetQaStatusSnapshot();
      setSnapshot(res.success ? res.data : null);
    } catch {
      setSnapshot(null);
    } finally {
      setSnapshotPending(false);
    }
  }, []);

  React.useEffect(() => {
    if (!isOpen) return;
    const refreshTimer = window.setTimeout(() => {
      void refreshQaStatus();
      setHrmHealth('checking');
      setCrmHealth('checking');
      void probeHealth('/api/health').then(setHrmHealth);
      void probeHealth(`${CRM_BASE}/api/health`).then(setCrmHealth);
    }, 0);
    return () => window.clearTimeout(refreshTimer);
  }, [isOpen, refreshQaStatus]);

  const reloadDevLists = React.useCallback(async () => {
    try {
      const { devListAtsCandidates } = await import('@/app/actions/devTools');
      const res = await devListAtsCandidates();
      if (!res.success) return;

      const applicants: DevApplicant[] = [];
      const hired: DevPerson[] = [];

      for (const c of res.data) {
        if (c.stage === 'HIRED') {
          hired.push({
            id: c.userId || c.id,
            name: `${c.name} (Hired RBT)`,
            role: 'RBT',
            email: c.email,
            route: '/rbt/schedule',
            canDelete: true,
            candidateId: c.id,
          });
        } else {
          applicants.push({
            id: c.id,
            name: c.name,
            email: c.email,
            role: `${c.roleApplied} Applicant`,
            appliedDate: c.appliedDate,
            stage: c.stage,
            activationStatus: c.activationStatus,
            userId: c.userId,
          });
        }
      }

      setPipelineApplicants(applicants);
      setHiredRbts(hired);
    } catch {
      /* ignore */
    }
  }, []);

  React.useEffect(() => {
    const initialLoadTimer = window.setTimeout(() => void reloadDevLists(), 0);
    const onRefresh = () => void reloadDevLists();
    window.addEventListener('storage', onRefresh);
    window.addEventListener('focus', onRefresh);
    window.addEventListener('rbt_progress_synced', onRefresh);
    return () => {
      window.clearTimeout(initialLoadTimer);
      window.removeEventListener('storage', onRefresh);
      window.removeEventListener('focus', onRefresh);
      window.removeEventListener('rbt_progress_synced', onRefresh);
    };
  }, [reloadDevLists]);

  const activePersonnelUsers: DevPerson[] = [...SEED_ACTIVE_USERS, ...hiredRbts];

  const handleDeleteCandidate = async (candidateId: string, label: string) => {
    try {
      const { devDeleteAtsCandidate } = await import('@/app/actions/devTools');
      const res = await devDeleteAtsCandidate(candidateId);
      if (!res.success) {
        toast.error(res.error || 'Failed to delete.');
        return;
      }

      localStorage.removeItem(`ras_submitted_app_${candidateId}`);
      try {
        const customStages = JSON.parse(localStorage.getItem('ras_ats_custom_stages') || '{}');
        delete customStages[candidateId];
        localStorage.setItem('ras_ats_custom_stages', JSON.stringify(customStages));
      } catch {
        /* ignore */
      }

      const { clearApplicantSessionClient, getActiveApplicantId } = await import(
        '@/lib/syncAtsProgress'
      );
      if (getActiveApplicantId() === candidateId) {
        clearApplicantSessionClient();
      }

      await reloadDevLists();
      window.dispatchEvent(new Event('storage'));
      toast.success(`Deleted: ${label}`);
    } catch {
      toast.error('Failed to delete.');
    }
  };

  const handleCreateTestApplicant = async (name: string, email: string) => {
    setSeedPending(true);
    try {
      const { submitRbtApplication } = await import('@/app/actions/publicRbt');
      const [firstName, lastName] = name.split(' ');
      const res = await submitRbtApplication({
        firstName: firstName || 'Test',
        lastName: lastName || 'Applicant',
        email: email,
        phoneNumber: '(555) 123-4567',
        addressLine1: '150 Court Street',
        city: 'Brooklyn',
        state: 'NY',
        zipCode: '11201',
        gender: 'female',
        rbtStatus: 'Yes',
        preferredBoroughs: ['Brooklyn'],
        availabilityHours: ['Monday', 'Tuesday', 'Wednesday'],
        weeklyHours: '15-25 hours/week',
        availableToStart: 'Within 1 week',
        transportation: 'Yes - Public Transit',
        workAuth: 'Yes',
        cprStatus: 'No - Need Certification',
        yearsExperience: 'Less than 1 year',
        languages: ['English'],
        isAdult: true,
        backgroundCheckConsent: true,
      });
      if (res.success && res.applicantId) {
        toast.success(`Created test applicant: ${name}`);
        await reloadDevLists();
        window.dispatchEvent(new Event('storage'));
        await setImpersonationCookie(null, 'HR_AGENT');
        setRole('HR_AGENT');
        setTimeout(() => {
          window.location.href = '/ats';
        }, 500);
      } else if (res.success) {
        toast.message(res.message || 'Application received.');
      } else {
        toast.error(res.error || 'Failed to create applicant');
      }
    } catch {
      toast.error('Could not submit applicant');
    } finally {
      setSeedPending(false);
    }
  };

  const runDevSkip = async (mode: 'PACK_ONLY' | 'ALL_EXCEPT_OFFER') => {
    setSeedPending(true);
    try {
      const { getActiveApplicantId } = await import('@/lib/syncAtsProgress');
      const { devSkipApplicantRequirements } = await import('@/app/actions/devTools');
      const candidateId = getActiveApplicantId();
      const res = await devSkipApplicantRequirements(mode, candidateId);
      if (!res.success) {
        toast.error(res.error);
        return;
      }

      localStorage.setItem('ras_rbt_tasks_done', 'true');
      if (mode === 'ALL_EXCEPT_OFFER') {
        localStorage.setItem('ras_rbt_cleared', 'true');
        localStorage.setItem('ras_rbt_sim_completed', 'true');
        localStorage.setItem('ras_rbt_simulation_completed', 'true');
        localStorage.setItem('ras_rbt_interview_done', 'true');
        localStorage.setItem('ras_rbt_interview_passed', 'true');
        localStorage.setItem('ras_rbt_availability_set', 'true');
      }

      window.dispatchEvent(new Event('rbt_clearance_changed'));
      window.dispatchEvent(new Event('rbt_sim_changed'));
      window.dispatchEvent(new Event('rbt_tasks_changed'));
      window.dispatchEvent(new Event('rbt_interview_changed'));
      window.dispatchEvent(new Event('rbt_availability_changed'));
      window.dispatchEvent(new Event('rbt_progress_synced'));
      window.dispatchEvent(new Event('storage'));

      toast.success(
        mode === 'PACK_ONLY'
          ? `Skipped onboarding pack (${res.data.stepsCompleted} steps)`
          : `Fast-cleared all requirements for ${res.data.candidateId.slice(0, 8)}…`
      );
    } catch {
      toast.error('Dev skip failed.');
    } finally {
      setSeedPending(false);
    }
  };

  /** Upsert Demo Studio Learner for Bridges E–G / Session Studio without full intake. */
  const handleSeedStudioDemo = async (
    mode: 'STAFFING_PENDING' | 'ACTIVE',
    withSession: boolean
  ) => {
    setSeedPending(true);
    try {
      const { devSeedConnectedProductDemo } = await import('@/app/actions/devTools');
      const res = await devSeedConnectedProductDemo({ mode, withSession });
      if (!res.success) {
        toast.error(res.error || 'Seed failed');
        return;
      }
      const d = res.data;
      const sessionBit = d.sessionId
        ? ` · session ${d.sessionId.slice(0, 8)}…`
        : ' · no session';
      toast.success(
        `${d.created ? 'Created' : 'Updated'} Demo Studio Learner → ${d.status}${sessionBit}`
      );

      // Bind real RBT UUID so schedule/payroll resolve the seeded sessions (not mock-user-id).
      if (withSession && d.rbtId) {
        const boundId = await bindActiveRbtImpersonation(d.rbtId);
        setRole('RBT');
        setActiveUserId(boundId || d.rbtId);
        localStorage.setItem('hrm_active_role', 'RBT');
        window.dispatchEvent(new Event('hrm_role_changed'));
        window.dispatchEvent(new Event('rbt_clearance_changed'));
        toast.message('Impersonating seeded RBT — opening Schedule…');
        window.location.assign('/rbt/schedule');
      }
    } catch {
      toast.error('Seed failed');
    } finally {
      setSeedPending(false);
    }
  };

  const REAL_USERS: Partial<Record<HrmRole, string>> = {
    HEAD_HR: 'edbd9e0c-b8cb-4206-b297-ff81dc4ade88',
    HR_AGENT: '6646e619-2a55-48c9-a208-2d6c1dfcdb0a',
  };

  /** Clear leftover applicant magic-link session so seed Active RBT unlocks Schedule / Job Board. */
  async function prepareSeedActiveRbt() {
    try {
      const { clearApplicantDeviceSession } = await import(
        '@/app/actions/applicantSessionActions'
      );
      const {
        clearApplicantSessionClient,
        invalidateApplicantCaches,
      } = await import('@/lib/syncAtsProgress');
      await clearApplicantDeviceSession();
      clearApplicantSessionClient();
      invalidateApplicantCaches();
    } catch {
      /* ignore */
    }
  }

  /** Bind real David UUID when Seed Studio created him; fall back to role-only cookie. */
  async function bindActiveRbtImpersonation(preferredUserId?: string | null) {
    await prepareSeedActiveRbt();
    const isRealUuid =
      !!preferredUserId &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        preferredUserId
      );

    if (isRealUuid) {
      await setImpersonationCookie(preferredUserId!, null);
      return preferredUserId!;
    }

    try {
      const { resolveDemoRbtUserId } = await import('@/app/actions/devTools');
      const res = await resolveDemoRbtUserId();
      if (res.success && res.data) {
        await setImpersonationCookie(res.data, null);
        return res.data;
      }
    } catch {
      /* fall through */
    }

    await setImpersonationCookie(null, 'RBT');
    return null;
  }

  const handleResetImpersonation = () => {
    startTransition(async () => {
      setActiveUserId(null);
      await prepareSeedActiveRbt();
      await setImpersonationCookie(null, null);
      setRole('NONE');
      localStorage.setItem('hrm_active_role', 'NONE');
      window.dispatchEvent(new Event('hrm_role_changed'));
      toast.success('Cleared impersonation');
      setIsOpen(false);
    });
  };

  const handleSwitchRole = (newRole: HrmRole, label: string) => {
    startTransition(async () => {
      setActiveUserId(null);
      if (newRole === 'RBT') {
        const boundId = await bindActiveRbtImpersonation(null);
        if (boundId) setActiveUserId(boundId);
      } else {
        const realId = REAL_USERS[newRole];
        if (realId) {
          await setImpersonationCookie(realId, null);
        } else {
          await setImpersonationCookie(null, newRole === 'NONE' ? null : newRole);
        }
      }
      setRole(newRole);
      localStorage.setItem('hrm_active_role', newRole);
      window.dispatchEvent(new Event('hrm_role_changed'));
      window.dispatchEvent(new Event('rbt_clearance_changed'));
      toast.success(`Switched HRM Role to: ${label}`);
      setIsOpen(false);
      if (newRole === 'RBT') {
        window.location.href = '/rbt/schedule';
      }
    });
  };

  const handleSwitchUser = async (user: DevPerson) => {
    setActiveUserId(user.id);
    // Prefer real User UUID so Session.rbtId queries match Case Coord assignments
    const isRealUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user.id);

    if (user.candidateId) {
      // Hired applicant: bind device session + real User UUID when linked
      if (isRealUuid) {
        await setImpersonationCookie(user.id, null);
      } else {
        await setImpersonationCookie(null, 'RBT');
      }
      const { devImpersonateApplicantSession } = await import(
        '@/app/actions/applicantSessionActions'
      );
      const { cacheApplicantSessionClient } = await import('@/lib/syncAtsProgress');
      const sessionRes = await devImpersonateApplicantSession(user.candidateId);
      if (sessionRes.success && sessionRes.data) {
        cacheApplicantSessionClient(sessionRes.data);
      }
    } else if (user.role === 'RBT') {
      // Seed Active RBT (David) / staff RBT — clear leftover applicant cookie, bind real UUID
      const boundId = await bindActiveRbtImpersonation(isRealUuid ? user.id : null);
      if (boundId) setActiveUserId(boundId);
    } else if (isRealUuid) {
      await setImpersonationCookie(user.id, null);
    } else {
      await setImpersonationCookie(null, user.role);
    }

    setRole(user.role as HrmRole);
    localStorage.setItem('hrm_active_role', user.role);
    window.dispatchEvent(new Event('hrm_role_changed'));
    window.dispatchEvent(new Event('rbt_clearance_changed'));
    toast.success(`Impersonating Active User: ${user.name} (${user.role})`);
    setIsOpen(false);
    window.location.assign(user.route);
  };

  const handleImpersonateApplicant = async (app: DevApplicant) => {
    const isApproved =
      app.stage === 'OFFER' ||
      app.stage === 'PHONE_SCREEN' ||
      app.stage === 'INTERVIEW' ||
      app.stage === 'HELP_DESK' ||
      app.activationStatus === 'INVITATION_SENT' ||
      app.activationStatus === 'ACTIVE';

    if (!isApproved) {
      toast.error('Pending HR approval — approve on ATS Pipeline first');
      return;
    }

    await setImpersonationCookie(null, 'APPLICANT');
    setActiveUserId(app.id);
    setRole('APPLICANT');
    localStorage.setItem('hrm_active_role', 'APPLICANT');

    const { devImpersonateApplicantSession } = await import(
      '@/app/actions/applicantSessionActions'
    );
    const { cacheApplicantSessionClient } = await import('@/lib/syncAtsProgress');
    const sessionRes = await devImpersonateApplicantSession(app.id);
    if (!sessionRes.success || !sessionRes.data) {
      toast.error(sessionRes.error || 'Failed to bind applicant session');
      return;
    }
    cacheApplicantSessionClient(sessionRes.data);

    const impersonatedPayload = {
      applicantId: app.id,
      fullName: app.name,
      email: app.email,
      submittedAt: app.appliedDate || new Date().toISOString().split('T')[0],
    };
    localStorage.setItem('ras_latest_submitted_app', JSON.stringify(impersonatedPayload));
    localStorage.setItem(`ras_submitted_app_${app.id}`, JSON.stringify(impersonatedPayload));

    window.dispatchEvent(new Event('hrm_role_changed'));
    window.dispatchEvent(new Event('storage'));
    toast.success(`Impersonating Applicant: ${app.name}`);
    setIsOpen(false);
    window.location.assign('/rbt');
  };

  return (
    <div className="fixed bottom-4 left-4 z-[9999]">
      {!isOpen ? (
        <button
          suppressHydrationWarning
          onClick={() => setIsOpen(true)}
          className={`relative w-12 h-12 rounded-full shadow-lg flex items-center justify-center border-2 transition-all hover:scale-110 cursor-pointer ${
            isImpersonating
              ? 'bg-red-600 border-red-400'
              : 'bg-zinc-800 border-zinc-600'
          }`}
          title="Developer Tools"
        >
          <UserCircle2 className="w-6 h-6 text-white" />
          {isImpersonating && (
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full animate-pulse border-2 border-zinc-900" />
          )}
        </button>
      ) : (
        <div className="devtools-panel bg-zinc-950/95 backdrop-blur-xl border border-white/10 p-4 rounded-xl shadow-2xl w-80 mb-2 max-h-[75vh] flex flex-col animate-in slide-in-from-bottom-5">
          <div className="flex justify-between items-center mb-4 shrink-0">
            <h3 className="text-white font-bold text-sm flex items-center gap-2">
              <UserCircle2 className="w-4 h-4 text-cyan-400" />
              Dev Impersonation
            </h3>
            <button
              onClick={() => setIsOpen(false)}
              className="text-zinc-500 hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex gap-2 mb-4 border-b border-zinc-800 pb-2 shrink-0">
            <button
              onClick={() => setActiveTab('roles')}
              className={`text-xs font-semibold px-2 py-1 rounded cursor-pointer ${
                activeTab === 'roles' ? 'bg-zinc-800 text-white' : 'text-zinc-500'
              }`}
            >
              Mock Roles
            </button>
            <button
              onClick={() => setActiveTab('users')}
              className={`text-xs font-semibold px-2 py-1 rounded cursor-pointer ${
                activeTab === 'users' ? 'bg-zinc-800 text-white' : 'text-zinc-500'
              }`}
            >
              Active Users
            </button>
            <button
              onClick={() => setActiveTab('applicants')}
              className={`text-xs font-semibold px-2 py-1 rounded cursor-pointer ${
                activeTab === 'applicants' ? 'bg-zinc-800 text-white' : 'text-zinc-500'
              }`}
            >
              Applicants
            </button>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar space-y-3 pr-0.5">
            {/* Impersonate / Roles | Active Users | Applicants */}
            <div className="space-y-2">
              <button
                onClick={handleResetImpersonation}
                disabled={isPending}
                className={`w-full text-left px-3 py-2 rounded text-xs transition-colors cursor-pointer disabled:cursor-not-allowed ${
                  !activeUserId && role === 'NONE'
                    ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                    : 'text-zinc-400 hover:bg-zinc-900'
                }`}
              >
                Default (No Impersonation)
              </button>

              {activeTab === 'roles' &&
                hrmRoles.map((r) => {
                  const isSelected = !activeUserId && role === r.role;
                  return (
                    <button
                      key={r.role}
                      onClick={() => handleSwitchRole(r.role, r.label)}
                      disabled={isPending}
                      className={`w-full text-left px-3 py-2 rounded text-xs transition-colors flex flex-col gap-1 cursor-pointer disabled:cursor-not-allowed ${
                        isSelected
                          ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                          : 'text-zinc-400 hover:bg-zinc-900'
                      }`}
                    >
                      <span className="font-semibold">{r.label}</span>
                      <span className="text-[10px] opacity-70 font-mono">{r.role}</span>
                    </button>
                  );
                })}

              {activeTab === 'users' &&
                activePersonnelUsers.map((u) => {
                  const isSelected = activeUserId === u.id || activeUserId === u.candidateId;
                  return (
                    <div key={u.candidateId || u.id} className="flex gap-1">
                      <button
                        onClick={() => void handleSwitchUser(u)}
                        disabled={isPending}
                        className={`flex-1 min-w-0 text-left px-3 py-2 rounded text-xs transition-colors flex flex-col gap-1 cursor-pointer disabled:cursor-not-allowed ${
                          isSelected
                            ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                            : 'text-zinc-400 hover:bg-zinc-900'
                        }`}
                      >
                        <span className="font-semibold truncate">{u.name}</span>
                        <span className="text-[10px] opacity-70 font-mono">{u.role}</span>
                      </button>
                      {u.canDelete && u.candidateId && (
                        <button
                          type="button"
                          title="Delete hired copy"
                          onClick={() => void handleDeleteCandidate(u.candidateId!, u.name)}
                          className="shrink-0 px-2 rounded text-rose-400 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })}

              {activeTab === 'applicants' && (
                <>
                  {pipelineApplicants.length === 0 && (
                    <p className="text-[10px] text-zinc-500 px-1 py-2">
                      No applicants. Seed one below, or hired RBTs are under Active Users.
                    </p>
                  )}
                  {pipelineApplicants.map((app) => {
                    const isApproved =
                      app.stage === 'OFFER' ||
                      app.stage === 'PHONE_SCREEN' ||
                      app.stage === 'INTERVIEW' ||
                      app.stage === 'HELP_DESK' ||
                      app.activationStatus === 'INVITATION_SENT' ||
                      app.activationStatus === 'ACTIVE';
                    const isSelected = activeUserId === app.id;

                    return (
                      <div key={app.id} className="flex gap-1">
                        <button
                          onClick={() => void handleImpersonateApplicant(app)}
                          disabled={isPending || !isApproved}
                          className={`flex-1 min-w-0 text-left px-3 py-2 rounded text-xs transition-colors flex flex-col gap-1 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${
                            isSelected
                              ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                              : 'text-zinc-400 hover:bg-zinc-900'
                          }`}
                          title={
                            isApproved
                              ? 'Impersonate applicant portal'
                              : 'Pending HR approval on ATS Pipeline'
                          }
                        >
                          <span className="font-semibold truncate">{app.name}</span>
                          <span className="text-[10px] opacity-70 font-mono">
                            {isApproved ? app.stage || 'In pipeline' : 'Pending HR'}
                          </span>
                        </button>
                        <button
                          type="button"
                          title="Delete applicant"
                          onClick={() => void handleDeleteCandidate(app.id, app.name)}
                          className="shrink-0 px-2 rounded text-rose-400 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </>
              )}
            </div>

            {/* Seeds — Connected Product Loop */}
            <div className="pt-3 border-t border-zinc-800 space-y-1.5">
              <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500 flex items-center gap-1">
                <FlaskConical className="w-3 h-3 text-cyan-400" />
                Connected Product Loop
              </span>
              <button
                type="button"
                disabled={seedPending}
                onClick={() => void handleSeedStudioDemo('ACTIVE', true)}
                className="w-full cursor-pointer disabled:cursor-not-allowed rounded-xl border border-emerald-700/50 bg-emerald-950/60 py-1.5 px-2 text-center text-[10px] font-black text-emerald-300 transition-colors hover:bg-emerald-900/80"
                title="ACTIVE + scheduled 97153 for Studio → BCBA sign → payroll"
              >
                Seed Studio→payroll (ACTIVE + session)
              </button>
              <button
                type="button"
                disabled={seedPending}
                onClick={() => void handleSeedStudioDemo('STAFFING_PENDING', false)}
                className="w-full cursor-pointer disabled:cursor-not-allowed rounded-xl border border-amber-700/50 bg-amber-950/60 py-1.5 px-2 text-center text-[10px] font-black text-amber-300 transition-colors hover:bg-amber-900/80"
                title="Upserts Demo Studio Learner at STAFFING_PENDING with RBT+BCBA"
              >
                Seed staffing (STAFFING_PENDING + staff)
              </button>
              <p className="text-[9px] leading-relaxed text-zinc-500">
                Then Active Users → David Miller → Schedule → EVV Start → CRM e-sign → payroll.
              </p>
            </div>

            {/* QA quick launch — connected-product playbook flows */}
            <div className="pt-3 border-t border-zinc-800 space-y-1.5">
              <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500 flex items-center gap-1">
                <Rocket className="w-3 h-3 text-cyan-400" />
                QA Quick Launch
              </span>
              <div className="grid grid-cols-2 gap-1.5">
                <QuickLink
                  href={
                    snapshot?.demoSessionId ? `/rbt/session/${snapshot.demoSessionId}` : null
                  }
                  label="Session Studio (demo)"
                  disabledHint="Seed Studio→payroll (session) first"
                />
                <QuickLink href="/rbt/schedule" label="RBT Schedule" />
                <QuickLink href="/rbt/payroll" label="RBT Payroll" />
                <QuickLink href="/payroll" label="Payroll (Finance)" />
                <QuickLink href="/rbt/help-desk" label="Help Desk" />
                <QuickLink href="/ats" label="ATS Board" />
                <QuickLink
                  href={`${CRM_BASE}/portal-clinical/notes`}
                  external
                  label="CRM Sign queue"
                />
                <QuickLink href={`${CRM_BASE}/notes`} external label="CRM Notes → Plutus" />
                <QuickLink href={`${CRM_BASE}/case`} external label="CRM Case pipeline" />
                <QuickLink
                  href={
                    snapshot?.demoClientId
                      ? `${CRM_BASE}/client/${snapshot.demoClientId}`
                      : null
                  }
                  external
                  label="CRM Demo learner"
                  disabledHint="Seed the demo learner first"
                />
              </div>
            </div>

            {/* Status readout — live counts via gated devGetQaStatusSnapshot */}
            <div className="pt-3 border-t border-zinc-800 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500 flex items-center gap-1">
                  <Activity className="w-3 h-3 text-cyan-400" />
                  Demo World Status
                </span>
                <button
                  type="button"
                  onClick={() => void refreshQaStatus()}
                  disabled={snapshotPending}
                  title="Refresh counts"
                  className="text-zinc-500 hover:text-cyan-300 transition-colors cursor-pointer disabled:cursor-not-allowed"
                >
                  <RefreshCw className={`w-3 h-3 ${snapshotPending ? 'animate-spin' : ''}`} />
                </button>
              </div>
              {snapshot ? (
                <div className="space-y-1">
                  <StatusRow label="Unsigned notes (awaiting BCBA)" value={snapshot.unsignedNotes} />
                  <StatusRow label="Signed · not sent to Plutus" value={snapshot.signedUnconverted} />
                  <StatusRow label="Open case openings" value={snapshot.openCaseOpenings} />
                  <StatusRow label="Pending PA requests" value={snapshot.pendingPaRequests} />
                  <StatusRow
                    label="My unread notifications"
                    value={snapshot.myUnreadNotifications ?? '—'}
                  />
                </div>
              ) : (
                <p className="text-[9px] text-zinc-500">
                  {snapshotPending ? 'Loading counts…' : 'Counts unavailable.'}
                </p>
              )}
            </div>

            {/* Health — /api/health on both apps */}
            <div className="pt-3 border-t border-zinc-800 space-y-1.5">
              <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500 flex items-center gap-1">
                <HeartPulse className="w-3 h-3 text-cyan-400" />
                App Health
              </span>
              <div className="flex gap-1.5">
                <HealthPill app="HRM" state={hrmHealth} />
                <HealthPill app="CRM" state={crmHealth} />
              </div>
            </div>

            {/* Misc — applicant generators / skip */}
            <div className="pt-3 border-t border-zinc-800 space-y-1.5">
              <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500 flex items-center gap-1">
                <FlaskConical className="w-3 h-3 text-cyan-400" />
                Applicant fixtures
              </span>
              <button
                type="button"
                disabled={seedPending}
                onClick={() =>
                  void handleCreateTestApplicant(
                    'Jane Doe',
                    `jane.${Date.now().toString().slice(-4)}@gmail.com`
                  )
                }
                className="w-full cursor-pointer disabled:cursor-not-allowed rounded-xl border border-brand-orange-500/40 bg-brand-orange-500/10 py-1.5 px-2 text-center text-[10px] font-black text-brand-orange-400 transition-colors hover:bg-brand-orange-500/20"
              >
                Seed New Applicant (Jane Doe)
              </button>
              <button
                type="button"
                disabled={seedPending}
                onClick={() => void runDevSkip('PACK_ONLY')}
                className="w-full cursor-pointer disabled:cursor-not-allowed rounded-xl border border-sky-700/50 bg-sky-950/60 py-1.5 px-2 text-center text-[10px] font-black text-sky-300 transition-colors hover:bg-sky-900/80"
              >
                Skip onboarding pack (W-4 / forms)
              </button>
              <button
                type="button"
                disabled={seedPending}
                onClick={() => void runDevSkip('ALL_EXCEPT_OFFER')}
                className="w-full cursor-pointer disabled:cursor-not-allowed rounded-xl border border-emerald-700/50 bg-emerald-950/60 py-1.5 px-2 text-center text-[10px] font-black text-emerald-300 transition-colors hover:bg-emerald-900/80"
                title="Marks pack + interview + availability + sim + cert complete. LS-54 still required to hire."
              >
                Fast-Clear All
              </button>
              <p className="text-[9px] leading-relaxed text-zinc-500">
                Impersonate an applicant first. Fast-Clear still needs signed LS-54 to hire.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
