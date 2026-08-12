'use client';

import React, { useCallback, useState, useTransition } from 'react';
import type { User } from '@repo/db';
import {
  setImpersonationCookie,
  type DevStudioSeedMode,
  type DevQaStatusSnapshot,
} from '@/app/actions/devTools';
import {
  UserCircle2,
  X,
  FlaskConical,
  Rocket,
  Activity,
  RefreshCw,
  ExternalLink,
  HeartPulse,
} from 'lucide-react';
import { toast } from 'sonner';

const HRM_BASE = (process.env.NEXT_PUBLIC_HRM_URL || 'http://localhost:3001').replace(/\/$/, '');

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

type DevToolsUser = Pick<User, 'id' | 'firstName' | 'lastName' | 'role'>;

export function DevToolsUI({ 
  users, 
  roles,
  currentImpersonatedId, 
  currentImpersonatedRole 
}: { 
  users: DevToolsUser[],
  roles: string[],
  currentImpersonatedId: string | null,
  currentImpersonatedRole: string | null
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'users' | 'roles'>('users');
  const [isPending, startTransition] = useTransition();
  const [seedPending, setSeedPending] = useState(false);
  const [snapshot, setSnapshot] = useState<DevQaStatusSnapshot | null>(null);
  const [snapshotPending, setSnapshotPending] = useState(false);
  const [crmHealth, setCrmHealth] = useState<HealthState>('checking');
  const [hrmHealth, setHrmHealth] = useState<HealthState>('checking');

  const refreshQaStatus = useCallback(async () => {
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

  const openPanel = () => {
    setIsOpen(true);
    void refreshQaStatus();
    setCrmHealth('checking');
    setHrmHealth('checking');
    void probeHealth('/api/health').then(setCrmHealth);
    void probeHealth(`${HRM_BASE}/api/health`).then(setHrmHealth);
  };

  if (
    process.env.NODE_ENV === 'production' ||
    process.env.NEXT_PUBLIC_ENABLE_DEV_TOOLS !== 'true'
  ) {
    return null;
  }

  const handleImpersonateUser = (userId: string | null) => {
    startTransition(() => {
      setImpersonationCookie(userId, null);
      setIsOpen(false);
    });
  };

  const handleImpersonateRole = (role: string) => {
    startTransition(() => {
      setImpersonationCookie(null, role);
      setIsOpen(false);
    });
  };

  const runStudioSeed = async (mode: DevStudioSeedMode, withSession: boolean) => {
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
      if (d.magicLinkToken) {
        const parentUrl = `${window.location.origin}/magic-link/${d.magicLinkToken}`;
        toast.message(`Parent portal: ${parentUrl}`, { duration: 12_000 });
        try {
          await navigator.clipboard.writeText(parentUrl);
        } catch {
          /* clipboard optional */
        }
      }
      if (mode === 'ACTIVE' && d.sessionId) {
        // Soft hint for connected demo path
        toast.message('Open HRM as RBT → /rbt/schedule → EVV Start Session');
      }
    } catch {
      toast.error('Seed failed');
    } finally {
      setSeedPending(false);
    }
  };

  return (
    <div className="fixed bottom-4 left-4 z-[9999]">
      {!isOpen ? (
        <button
          suppressHydrationWarning
          onClick={openPanel}
          className={`relative w-12 h-12 rounded-full shadow-lg flex items-center justify-center border-2 transition-all hover:scale-110 cursor-pointer ${(currentImpersonatedId || currentImpersonatedRole) ? 'bg-red-600 border-red-400' : 'bg-zinc-800 border-zinc-600'}`}
          title="Developer Tools"
        >
          <UserCircle2 className="w-6 h-6 text-white" />
          {(currentImpersonatedId || currentImpersonatedRole) && (
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
              onClick={() => setActiveTab('users')}
              className={`text-xs font-semibold px-2 py-1 rounded cursor-pointer ${activeTab === 'users' ? 'bg-zinc-800 text-white' : 'text-zinc-500'}`}
            >
              Real Users
            </button>
            <button 
              onClick={() => setActiveTab('roles')}
              className={`text-xs font-semibold px-2 py-1 rounded cursor-pointer ${activeTab === 'roles' ? 'bg-zinc-800 text-white' : 'text-zinc-500'}`}
            >
              Mock Roles
            </button>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar space-y-3">
            <div className="space-y-2">
              <button
                onClick={() => handleImpersonateUser(null)}
                disabled={isPending}
                className={`w-full text-left px-3 py-2 rounded text-xs transition-colors cursor-pointer disabled:cursor-not-allowed ${!currentImpersonatedId && !currentImpersonatedRole ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30' : 'text-zinc-400 hover:bg-zinc-900'}`}
              >
                Default (No Impersonation)
              </button>

              {activeTab === 'users' && users.filter(u => !['HR', 'HEAD_HR', 'HR_AGENT', 'FINANCE'].includes(u.role)).map(u => (
                <button
                  key={u.id}
                  onClick={() => handleImpersonateUser(u.id)}
                  disabled={isPending}
                  className={`w-full text-left px-3 py-2 rounded text-xs transition-colors flex flex-col gap-1 cursor-pointer disabled:cursor-not-allowed ${currentImpersonatedId === u.id ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30' : 'text-zinc-400 hover:bg-zinc-900'}`}
                >
                  <span className="font-semibold">{u.firstName} {u.lastName}</span>
                  <span className="text-[10px] opacity-70 font-mono">{u.role}</span>
                </button>
              ))}

              {activeTab === 'roles' && roles.filter(r => !['HR', 'HEAD_HR', 'HR_AGENT', 'FINANCE'].includes(r)).map(r => (
                <button
                  key={r}
                  onClick={() => handleImpersonateRole(r)}
                  disabled={isPending}
                  className={`w-full text-left px-3 py-2 rounded text-xs transition-colors flex flex-col gap-1 cursor-pointer disabled:cursor-not-allowed ${currentImpersonatedRole === r ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30' : 'text-zinc-400 hover:bg-zinc-900'}`}
                >
                  <span className="font-semibold">{r}</span>
                </button>
              ))}
            </div>

            {/* Connected Product Loop — fixtures */}
            <div className="pt-3 border-t border-zinc-800 space-y-1.5">
              <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500 flex items-center gap-1">
                <FlaskConical className="w-3 h-3 text-cyan-400" />
                Connected Product Loop
              </span>
              <button
                type="button"
                disabled={seedPending}
                onClick={() => void runStudioSeed('ACTIVE', true)}
                className="w-full cursor-pointer disabled:cursor-not-allowed rounded-xl border border-emerald-700/50 bg-emerald-950/60 py-1.5 px-2 text-center text-[10px] font-black text-emerald-300 transition-colors hover:bg-emerald-900/80"
                title="Upserts ACTIVE client + scheduled 97153 for Studio → BCBA sign → payroll"
              >
                Seed Studio→payroll (ACTIVE + session)
              </button>
              <button
                type="button"
                disabled={seedPending}
                onClick={() => void runStudioSeed('STAFFING_PENDING', false)}
                className="w-full cursor-pointer disabled:cursor-not-allowed rounded-xl border border-amber-700/50 bg-amber-950/60 py-1.5 px-2 text-center text-[10px] font-black text-amber-300 transition-colors hover:bg-amber-900/80"
                title="Upserts Demo Studio Learner at STAFFING_PENDING with RBT+BCBA (no session)"
              >
                Seed staffing (STAFFING_PENDING + staff)
              </button>
              <p className="text-[9px] leading-relaxed text-zinc-500">
                Seed then walk HRM Schedule → Studio → CRM e-sign → Plutus → payroll. Marker{' '}
                <span className="font-mono text-zinc-400">demo.studio.learner@…</span>.
              </p>
            </div>

            {/* QA quick launch — connected-product playbook flows */}
            <div className="pt-3 border-t border-zinc-800 space-y-1.5">
              <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500 flex items-center gap-1">
                <Rocket className="w-3 h-3 text-cyan-400" />
                QA Quick Launch
              </span>
              <div className="grid grid-cols-2 gap-1.5">
                <QuickLink href="/case" label="Case pipeline" />
                <QuickLink href="/notes" label="Notes → Plutus" />
                <QuickLink href="/portal-clinical/notes" label="BCBA sign queue" />
                <QuickLink href="/portal-billing" label="PA queues" />
                <QuickLink
                  href={snapshot?.demoClientId ? `/client/${snapshot.demoClientId}` : null}
                  label="Demo learner"
                  disabledHint="Seed the demo learner first"
                />
                <QuickLink
                  href={
                    snapshot?.demoSessionId
                      ? `${HRM_BASE}/rbt/session/${snapshot.demoSessionId}`
                      : null
                  }
                  external
                  label="HRM Studio"
                  disabledHint="Seed Studio→payroll (session) first"
                />
                <QuickLink href={`${HRM_BASE}/rbt/schedule`} external label="HRM Schedule" />
                <QuickLink href={`${HRM_BASE}/rbt/payroll`} external label="HRM Payroll" />
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
                <HealthPill app="CRM" state={crmHealth} />
                <HealthPill app="HRM" state={hrmHealth} />
              </div>
            </div>

            {/* Dual-run readiness — docs pointer only (not a claim that Artemis is replaced) */}
            <div className="pt-3 border-t border-zinc-800 space-y-1">
              <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500">
                Dual-run readiness
              </span>
              <p className="text-[9px] leading-relaxed text-zinc-500">
                Cohort go/no-go checklist (docs):{' '}
                <span className="font-mono text-zinc-400 break-all">
                  docs/superpowers/specs/2026-08-11-artemis-dual-run-cutover-checklist.md
                </span>
                . Bridges E–G wiring done; Studio depth + SQL still gate D1. Artemis not org-replaced.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
