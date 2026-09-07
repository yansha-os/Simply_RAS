'use client';

import React, { useEffect, useMemo, useState, useTransition } from 'react';
import type { ClientStatus } from '@prisma/client';
import {
  Target,
  Activity,
  Users,
  ClipboardList,
  ArrowRight,
  Layers,
  Sparkles,
  RefreshCw,
  Link2,
  CheckCircle2,
  CircleDashed,
  AlertCircle,
  Award,
  PauseCircle,
  Archive,
  RotateCcw,
  Database,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  isCollectActiveStatus,
  parseClinicalGoalsFromTreatmentPlan,
  type ClinicalGoalStatus,
  type ClinicalGoalsSnapshot,
  type SkillTargetStatus,
  type SessionStudioSyncStatus,
  type StudioSkillTargetRow,
} from '@/lib/clinicalGoals';
import {
  getSessionStudioSyncStatus,
  syncTreatmentPlanTargetsToSessionStudio,
  updateSkillTargetStatus,
} from '@/app/actions/clinicalGoalsActions';

function statusBadge(status: ClinicalGoalStatus) {
  const s = status || 'New';
  if (s === 'Mastered') {
    return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25';
  }
  if (s === 'Continuing') {
    return 'bg-sky-500/10 text-sky-400 border-sky-500/25';
  }
  if (s === 'On Hold') {
    return 'bg-amber-500/10 text-amber-400 border-amber-500/25';
  }
  return 'bg-violet-500/10 text-violet-300 border-violet-500/25';
}

function targetStatusBadge(status: string) {
  const s = (status || '').toUpperCase();
  if (s === 'MASTERED') return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25';
  if (s === 'IN_PROGRESS') return 'bg-cyan-500/10 text-cyan-400 border-cyan-500/25';
  if (s === 'ON_HOLD') return 'bg-amber-500/10 text-amber-400 border-amber-500/25';
  if (s === 'DISCONTINUED') return 'bg-rose-500/10 text-rose-400 border-rose-500/25';
  return 'bg-violet-500/10 text-violet-300 border-violet-500/25';
}

function severityBadge(severity: string) {
  const s = (severity || '').toLowerCase();
  if (s === 'severe') return 'bg-red-500/10 text-red-400 border-red-500/25';
  if (s === 'moderate') return 'bg-amber-500/10 text-amber-400 border-amber-500/25';
  if (s === 'mild') return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25';
  return 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20';
}

function MetaCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="font-mono text-[9px] uppercase tracking-[0.6px] text-zinc-500 mb-0.5">{label}</div>
      <div className="text-[12.5px] text-zinc-300 truncate">{value || '—'}</div>
    </div>
  );
}

function GoalCardShell({
  children,
  accent,
}: {
  children: React.ReactNode;
  accent: string;
}) {
  return (
    <div
      className={`group relative overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/80 backdrop-blur-xl p-5 transition-all duration-300 hover:scale-[1.01] hover:shadow-2xl hover:border-brand-orange-500/40 ${accent}`}
    >
      <div className="pointer-events-none absolute -top-16 -right-10 h-40 w-40 rounded-full bg-brand-orange-500/5 blur-3xl" />
      {children}
    </div>
  );
}

function EmptyBlock({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/10 bg-zinc-950/40 px-6 py-10 text-center">
      <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-zinc-900/80 text-zinc-500">
        <Layers className="h-4 w-4" />
      </div>
      <p className="font-heading text-sm font-semibold text-zinc-300">{title}</p>
      <p className="mt-1 text-xs text-zinc-500 max-w-md mx-auto">{detail}</p>
    </div>
  );
}

function StudioLinkBadge({ linked }: { linked: boolean }) {
  if (linked) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-emerald-400">
        <CheckCircle2 className="h-3 w-3" />
        In Studio
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-zinc-500/20 bg-zinc-500/10 px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-zinc-500">
      <CircleDashed className="h-3 w-3" />
      Not synced
    </span>
  );
}

function TargetActionButton({
  label,
  icon,
  onClick,
  disabled,
  tone,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  disabled: boolean;
  tone: 'emerald' | 'amber' | 'rose' | 'cyan';
}) {
  const tones = {
    emerald:
      'border-emerald-500/25 bg-emerald-500/10 text-emerald-400 hover:border-emerald-500/50 hover:bg-emerald-500/20',
    amber:
      'border-amber-500/25 bg-amber-500/10 text-amber-400 hover:border-amber-500/50 hover:bg-amber-500/20',
    rose: 'border-rose-500/25 bg-rose-500/10 text-rose-400 hover:border-rose-500/50 hover:bg-rose-500/20',
    cyan: 'border-cyan-500/25 bg-cyan-500/10 text-cyan-400 hover:border-cyan-500/50 hover:bg-cyan-500/20',
  } as const;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-wide transition-all duration-300 ${tones[tone]} ${
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:scale-[1.02]'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function StudioTargetRow({
  target,
  pending,
  onStatusChange,
}: {
  target: StudioSkillTargetRow;
  pending: boolean;
  onStatusChange: (targetId: string, status: SkillTargetStatus) => void;
}) {
  const active = isCollectActiveStatus(target.targetStatus);
  return (
    <div
      className={`group relative overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/80 backdrop-blur-xl p-4 transition-all duration-300 hover:border-brand-orange-500/40 hover:shadow-xl ${
        active ? '' : 'opacity-80'
      }`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-emerald-400">
              {target.domain}
            </span>
            <span
              className={`rounded-full border px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider ${targetStatusBadge(target.targetStatus)}`}
            >
              {target.targetStatus.replace(/_/g, ' ')}
            </span>
            <span className="rounded-md border border-white/10 bg-zinc-900/80 px-1.5 py-0.5 font-mono text-[9px] text-zinc-400">
              {target.measurementType}
            </span>
            {active ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-500/20 bg-cyan-500/10 px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-cyan-400">
                <span className="dot-live" />
                In Collect
              </span>
            ) : (
              <span className="rounded-full border border-zinc-500/20 bg-zinc-500/10 px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-zinc-500">
                Hidden from Collect
              </span>
            )}
          </div>
          <p className="mt-1.5 text-sm font-medium text-white leading-snug">{target.title}</p>
          {target.masteryCriteria && (
            <p className="mt-0.5 font-mono text-[10px] text-zinc-500">
              Mastery · {target.masteryCriteria}
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap gap-1.5 sm:justify-end">
          {active ? (
            <>
              <TargetActionButton
                label="Mastered"
                icon={<Award className="h-3 w-3" />}
                tone="emerald"
                disabled={pending}
                onClick={() => onStatusChange(target.id, 'MASTERED')}
              />
              <TargetActionButton
                label="Hold"
                icon={<PauseCircle className="h-3 w-3" />}
                tone="amber"
                disabled={pending}
                onClick={() => onStatusChange(target.id, 'ON_HOLD')}
              />
              <TargetActionButton
                label="Discontinue"
                icon={<Archive className="h-3 w-3" />}
                tone="rose"
                disabled={pending}
                onClick={() => onStatusChange(target.id, 'DISCONTINUED')}
              />
            </>
          ) : (
            <TargetActionButton
              label="Reactivate"
              icon={<RotateCcw className="h-3 w-3" />}
              tone="cyan"
              disabled={pending}
              onClick={() => onStatusChange(target.id, 'IN_PROGRESS')}
            />
          )}
        </div>
      </div>
    </div>
  );
}

type SyncHealth = 'synced' | 'partial' | 'none' | 'empty';

function resolveSyncHealth(
  syncableSkill: number,
  syncableBrp: number,
  studio: SessionStudioSyncStatus | null,
  matchedSkills: number,
  matchedBehaviors: number,
): SyncHealth {
  const need = syncableSkill + syncableBrp;
  if (need === 0) return 'empty';
  if (!studio) return 'none';
  const matched = matchedSkills + matchedBehaviors;
  if (matched >= need && studio.skillCount + studio.behaviorCount > 0) return 'synced';
  if (matched > 0 || studio.skillCount + studio.behaviorCount > 0) return 'partial';
  return 'none';
}

export default function ClinicalGoalsTab({
  client,
  onOpenTreatmentPlan,
}: {
  client: { id: string; status: ClientStatus; treatmentPlan: unknown };
  onOpenTreatmentPlan?: () => void;
}) {
  const [isSyncing, startSync] = useTransition();
  const [studioSync, setStudioSync] = useState<SessionStudioSyncStatus | null>(null);
  const [studioLoading, setStudioLoading] = useState(true);
  const [lastSyncSummary, setLastSyncSummary] = useState<string | null>(null);

  const snapshot: ClinicalGoalsSnapshot = useMemo(
    () => parseClinicalGoalsFromTreatmentPlan(client.treatmentPlan),
    [client.treatmentPlan],
  );

  const skillsByDomain = useMemo(() => {
    const map = new Map<string, typeof snapshot.skillGoals>();
    for (const g of snapshot.skillGoals) {
      const key = g.domain || 'Unassigned';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(g);
    }
    return Array.from(map.entries());
  }, [snapshot]);

  const hasAnyTargets =
    snapshot.skillGoals.length > 0 ||
    snapshot.brpGoals.length > 0 ||
    snapshot.parentGoals.length > 0;

  const syncableSkillCount = snapshot.skillGoals.filter((g) => Boolean(g.description?.trim())).length;
  const syncableBrpCount = snapshot.brpGoals.filter((b) => Boolean(b.behavior?.trim())).length;
  const canSyncStudio = syncableSkillCount > 0 || syncableBrpCount > 0;

  const skillTitleSet = useMemo(
    () => new Set(studioSync?.skillTitles ?? []),
    [studioSync?.skillTitles],
  );
  const behaviorNameSet = useMemo(
    () => new Set(studioSync?.behaviorNames ?? []),
    [studioSync?.behaviorNames],
  );

  const matchedSkills = useMemo(
    () =>
      snapshot.skillGoals.filter((g) => {
        const title = g.description?.trim().toLowerCase();
        return title && skillTitleSet.has(title);
      }).length,
    [snapshot.skillGoals, skillTitleSet],
  );
  const matchedBehaviors = useMemo(
    () =>
      snapshot.brpGoals.filter((b) => {
        const name = b.behavior?.trim().toLowerCase();
        return name && behaviorNameSet.has(name);
      }).length,
    [snapshot.brpGoals, behaviorNameSet],
  );

  const syncHealth = resolveSyncHealth(
    syncableSkillCount,
    syncableBrpCount,
    studioSync,
    matchedSkills,
    matchedBehaviors,
  );

  const durableTotal = (studioSync?.skillCount ?? 0) + (studioSync?.behaviorCount ?? 0);

  const planEmpty =
    !snapshot.hasPlan ||
    (!hasAnyTargets &&
      !snapshot.domains.some((d) => d.severity || d.description) &&
      !snapshot.planStatus);

  const refreshStudioStatus = async () => {
    setStudioLoading(true);
    const res = await getSessionStudioSyncStatus(client.id);
    if (res.success) {
      setStudioSync(res.data);
    }
    setStudioLoading(false);
  };

  useEffect(() => {
    let cancelled = false;
    void getSessionStudioSyncStatus(client.id).then((res) => {
      if (cancelled) return;
      if (res.success) setStudioSync(res.data);
      setStudioLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [client.id]);

  const handleSyncToSessionStudio = () => {
    if (isSyncing) return;
    startSync(async () => {
      const res = await syncTreatmentPlanTargetsToSessionStudio(client.id);
      if (!res.success) {
        toast.error(res.error || 'Sync failed');
        return;
      }
      const durable = res.skillTargetsTotal + res.behaviorTargetsTotal;
      const summary = `${res.skillTargetsTotal} skill · ${res.behaviorTargetsTotal} behavior · ${durable} durable total`;
      setLastSyncSummary(summary);
      toast.success(
        `Session Studio now has ${durable} durable target${durable === 1 ? '' : 's'} (${res.skillsCreated} skill created, ${res.skillsUpdated} updated; ${res.behaviorsCreated} behavior created, ${res.behaviorsUpdated} updated).`,
      );
      // Reconcile per-target rows from the DB (includes rows beyond this TP snapshot)
      await refreshStudioStatus();
    });
  };

  const [statusPendingId, setStatusPendingId] = useState<string | null>(null);

  const handleTargetStatusChange = async (targetId: string, status: SkillTargetStatus) => {
    if (statusPendingId) return;
    setStatusPendingId(targetId);
    const res = await updateSkillTargetStatus(client.id, targetId, status);
    if (!res.success) {
      toast.error(res.error || 'Failed to update target status.');
    } else {
      setStudioSync((prev) =>
        prev
          ? {
              ...prev,
              skillTargets: prev.skillTargets.map((t) =>
                t.id === targetId ? { ...t, targetStatus: status } : t,
              ),
            }
          : prev,
      );
      toast.success(
        isCollectActiveStatus(status)
          ? 'Target reactivated — it will appear in Studio Collect again.'
          : `Target marked ${status.replace(/_/g, ' ').toLowerCase()} — removed from Studio Collect; trial history is kept.`,
      );
    }
    setStatusPendingId(null);
  };

  const syncStatusCopy =
    syncHealth === 'synced'
      ? 'Treatment-plan skill & behavior goals match durable Session Studio targets.'
      : syncHealth === 'partial'
        ? 'Some TP goals are already in Session Studio; sync again after Treatment Plan edits.'
        : syncHealth === 'empty'
          ? 'Add skill or behavior goals on the Treatment Plan before syncing to Session Studio.'
          : 'TP goals are not yet written as durable SkillTarget / BehaviorTarget rows for Collect.';

  return (
    <div className="relative space-y-6">
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-3xl">
        <div className="absolute -top-24 left-1/4 h-56 w-56 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="absolute top-40 right-0 h-48 w-48 rounded-full bg-brand-orange-500/10 blur-3xl" />
      </div>

      {/* Header */}
      <div className="rounded-2xl border border-white/10 bg-zinc-950/80 backdrop-blur-xl p-6 shadow-xl">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-emerald-500/25 bg-emerald-500/10 text-emerald-400">
              <Target className="h-5 w-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-heading text-xl font-semibold text-white">Clinical Goals</h2>
                {snapshot.planStatus ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                    <span className="dot-live" />
                    TP {snapshot.planStatus.replace(/_/g, ' ')}
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-full border border-zinc-500/20 bg-zinc-500/10 px-2.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                    No TP status
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-zinc-400 max-w-xl">
                Treatment-plan goals (skill, BIP, caregiver) with sync status to Session Studio{' '}
                <span className="font-mono text-zinc-300">SkillTarget</span> /{' '}
                <span className="font-mono text-zinc-300">BehaviorTarget</span> rows.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleSyncToSessionStudio}
              disabled={!canSyncStudio || isSyncing}
              className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-bold shadow-lg transition-all duration-300 ${
                !canSyncStudio || isSyncing
                  ? 'cursor-not-allowed border-white/5 bg-zinc-900/40 text-zinc-500 shadow-none'
                  : 'cursor-pointer border-emerald-500/40 bg-emerald-500/15 text-emerald-300 hover:border-emerald-500/60 hover:bg-emerald-500/25 hover:scale-[1.02] hover:shadow-emerald-500/20'
              }`}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              {isSyncing ? 'Syncing…' : 'Sync targets to Session Studio'}
            </button>
            {onOpenTreatmentPlan && (
              <button
                type="button"
                onClick={onOpenTreatmentPlan}
                className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-brand-orange-500/30 bg-brand-orange-500/10 px-4 py-2.5 text-xs font-bold text-brand-orange-400 transition-all duration-300 hover:border-brand-orange-500/50 hover:bg-brand-orange-500/20 hover:scale-[1.02]"
              >
                <ClipboardList className="h-3.5 w-3.5" />
                Open Treatment Plan
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {client.status === 'ACTIVE' && !studioLoading && durableTotal === 0 && canSyncStudio && (
          <div className="mt-4 flex items-start gap-3 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
            <div className="text-xs leading-relaxed text-amber-100/90">
              <span className="font-semibold text-amber-300">ACTIVE sandbox client:</span> sync
              treatment-plan goals to durable SkillTargets before Session Studio claim-ready submit.
              Dev demo targets (t1/b1…) are blocked on ACTIVE clients by pilot hygiene guards.
            </div>
          </div>
        )}

        {/* TP counts */}
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: 'TP total', value: snapshot.counts.total, tone: 'text-white' },
            { label: 'Skill goals', value: snapshot.counts.skill, tone: 'text-emerald-400' },
            { label: 'Behavior (BIP)', value: snapshot.counts.brp, tone: 'text-red-400' },
            { label: 'Caregiver', value: snapshot.counts.parent, tone: 'text-violet-300' },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-xl border border-white/5 bg-zinc-900/60 px-4 py-3 transition-all duration-300 hover:border-white/15"
            >
              <div className="font-mono text-[9px] uppercase tracking-[0.6px] text-zinc-500">{stat.label}</div>
              <div className={`mt-1 font-heading text-2xl font-semibold ${stat.tone}`}>{stat.value}</div>
            </div>
          ))}
        </div>

        {/* Session Studio sync strip */}
        <div className="mt-4 relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-zinc-900/90 via-zinc-950/80 to-emerald-950/20 p-4">
          <div className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full bg-emerald-500/10 blur-2xl" />
          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3 min-w-0">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-400">
                <Link2 className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-heading text-sm font-semibold text-white">Session Studio bridge</span>
                  {studioLoading ? (
                    <span className="inline-flex items-center rounded-full border border-zinc-500/20 bg-zinc-500/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-zinc-400">
                      Checking…
                    </span>
                  ) : syncHealth === 'synced' ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-emerald-400">
                      <span className="dot-live" />
                      Synced
                    </span>
                  ) : syncHealth === 'partial' ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/25 bg-amber-500/10 px-2.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-amber-400">
                      <AlertCircle className="h-3 w-3" />
                      Partial
                    </span>
                  ) : syncHealth === 'empty' ? (
                    <span className="inline-flex items-center rounded-full border border-zinc-500/20 bg-zinc-500/10 px-2.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-zinc-400">
                      Nothing to sync
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full border border-zinc-500/25 bg-zinc-500/10 px-2.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-zinc-400">
                      <CircleDashed className="h-3 w-3" />
                      Not synced
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-zinc-400">{syncStatusCopy}</p>
                {lastSyncSummary && (
                  <p className="mt-1.5 font-mono text-[10px] text-emerald-400/90">
                    Last sync · {lastSyncSummary}
                  </p>
                )}
                <p className="mt-1 font-mono text-[10px] text-zinc-600">
                  Caregiver goals stay on the TP only — they are not SkillTargets.
                </p>
              </div>
            </div>

            <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3.5 py-2.5 min-w-[7.5rem]">
                <div className="font-mono text-[9px] uppercase tracking-[0.6px] text-emerald-500/80">
                  Durable skills
                </div>
                <div className="mt-0.5 font-heading text-xl font-semibold text-emerald-300">
                  {studioLoading ? '—' : (studioSync?.skillCount ?? 0)}
                </div>
                <div className="font-mono text-[9px] text-zinc-500">
                  {matchedSkills}/{syncableSkillCount} TP matched
                </div>
              </div>
              <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-3.5 py-2.5 min-w-[7.5rem]">
                <div className="font-mono text-[9px] uppercase tracking-[0.6px] text-red-400/80">
                  Durable BIP
                </div>
                <div className="mt-0.5 font-heading text-xl font-semibold text-red-300">
                  {studioLoading ? '—' : (studioSync?.behaviorCount ?? 0)}
                </div>
                <div className="font-mono text-[9px] text-zinc-500">
                  {matchedBehaviors}/{syncableBrpCount} TP matched
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-zinc-900/70 px-3.5 py-2.5 min-w-[7.5rem]">
                <div className="font-mono text-[9px] uppercase tracking-[0.6px] text-zinc-500">
                  Studio total
                </div>
                <div className="mt-0.5 font-heading text-xl font-semibold text-white">
                  {studioLoading ? '—' : durableTotal}
                </div>
                <div className="font-mono text-[9px] text-zinc-500">after sync count</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Durable Studio targets — clinical status management */}
      {studioSync && (studioSync.skillTargets.length > 0 || studioSync.behaviorTargets.length > 0) && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-heading text-sm font-semibold text-zinc-200 flex items-center gap-2">
              <Database className="h-4 w-4 text-cyan-400" />
              Durable Studio targets
            </h3>
            <span className="font-mono text-[10px] text-zinc-500">
              {studioSync.skillTargets.filter((t) => isCollectActiveStatus(t.targetStatus)).length}/
              {studioSync.skillTargets.length} in Collect
            </span>
          </div>
          <p className="text-xs text-zinc-500 -mt-1">
            Status changes here are the clinical archive flow — Mastered / On hold / Discontinued
            targets stop appearing in Session Studio Collect, but their trial history stays on the
            chart.
          </p>
          <div className="space-y-2.5">
            {studioSync.skillTargets.map((t) => (
              <StudioTargetRow
                key={t.id}
                target={t}
                pending={statusPendingId === t.id}
                onStatusChange={handleTargetStatusChange}
              />
            ))}
          </div>
          {studioSync.behaviorTargets.length > 0 && (
            <div className="rounded-2xl border border-white/10 bg-zinc-950/60 p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-rose-300">
                  Behavior targets (always collected)
                </span>
                <span className="font-mono text-[10px] text-zinc-600">
                  no status column — cannot be archived
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {studioSync.behaviorTargets.map((b) => (
                  <span
                    key={b.id}
                    className="rounded-lg border border-rose-500/20 bg-rose-500/5 px-2 py-1 font-mono text-[10px] text-rose-200/90"
                  >
                    {b.behaviorName}
                    <span className="ml-1.5 text-zinc-500">{b.measurementType}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {planEmpty ? (
        <div className="rounded-2xl border border-dashed border-amber-500/25 bg-amber-500/5 px-8 py-14 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-500/20 bg-zinc-950/60 text-amber-400">
            <Sparkles className="h-5 w-5" />
          </div>
          <h3 className="font-heading text-lg font-semibold text-white">No treatment plan goals yet</h3>
          <p className="mx-auto mt-2 max-w-md text-sm text-zinc-400">
            This client has no skill, behavior, or caregiver targets in{' '}
            <span className="font-mono text-zinc-300">treatmentPlan</span>. Complete the BCBA Treatment Plan
            to populate domains and targets here, then sync to Session Studio.
          </p>
          {onOpenTreatmentPlan && (
            <button
              type="button"
              onClick={onOpenTreatmentPlan}
              className="mt-6 inline-flex cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-zinc-950/80 px-4 py-2.5 text-xs font-bold text-zinc-200 transition-all duration-300 hover:border-brand-orange-500/40 hover:text-white"
            >
              Go to Treatment Plan
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Domain severity */}
          <section className="space-y-3">
            <h3 className="font-heading text-sm font-semibold text-zinc-200 flex items-center gap-2">
              <Layers className="h-4 w-4 text-zinc-400" />
              Domain severity
            </h3>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              {snapshot.domains.map((d) => (
                <div
                  key={d.key}
                  className="rounded-2xl border border-white/10 bg-zinc-950/70 p-4 transition-all duration-300 hover:border-brand-orange-500/30 hover:shadow-xl"
                >
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-xs font-semibold text-white">{d.label}</span>
                    <span
                      className={`rounded-full border px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider ${severityBadge(d.severity)}`}
                    >
                      {d.severity || 'Unset'}
                    </span>
                  </div>
                  <p className="text-[12.5px] leading-relaxed text-zinc-400 line-clamp-4">
                    {d.description || 'No domain narrative recorded in the treatment plan.'}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {/* Skill acquisition */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-heading text-sm font-semibold text-zinc-200 flex items-center gap-2">
                <Target className="h-4 w-4 text-emerald-400" />
                Skill acquisition
              </h3>
              <span className="font-mono text-[10px] text-zinc-500">
                {snapshot.counts.skill} TP · {matchedSkills} in Studio
              </span>
            </div>

            {snapshot.skillGoals.length === 0 ? (
              <EmptyBlock
                title="No skill goals"
                detail="Skill acquisition objectives appear here once added on the Treatment Plan tab. Sync writes them as SkillTarget rows for Session Studio Collect."
              />
            ) : (
              <div className="space-y-5">
                {skillsByDomain.map(([domain, goals]) => (
                  <div key={domain} className="space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                        {domain}
                      </span>
                      <span className="font-mono text-[10px] text-zinc-600">{goals.length}</span>
                    </div>
                    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                      {goals.map((g, idx) => {
                        const title = g.description?.trim().toLowerCase() || '';
                        const linked = Boolean(title && skillTitleSet.has(title));
                        return (
                          <GoalCardShell key={`${domain}-${idx}`} accent="">
                            <div className="flex items-start justify-between gap-3 mb-3">
                              <p className="text-sm font-medium text-white leading-snug">
                                {g.description || 'Untitled skill objective'}
                              </p>
                              <div className="flex shrink-0 flex-col items-end gap-1.5">
                                <span
                                  className={`rounded-full border px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider ${statusBadge(g.status)}`}
                                >
                                  {g.status}
                                </span>
                                <StudioLinkBadge linked={linked} />
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                              <MetaCell label="Baseline" value={g.baseline} />
                              <MetaCell label="Current" value={g.currentLevel} />
                              <MetaCell label="Mastery" value={g.mastery} />
                              <MetaCell label="Target" value={g.targetDate} />
                            </div>
                          </GoalCardShell>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Behavior reduction */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-heading text-sm font-semibold text-zinc-200 flex items-center gap-2">
                <Activity className="h-4 w-4 text-red-400" />
                Behavior reduction
              </h3>
              <span className="font-mono text-[10px] text-zinc-500">
                {snapshot.counts.brp} TP · {matchedBehaviors} in Studio
              </span>
            </div>

            {snapshot.brpGoals.length === 0 ? (
              <EmptyBlock
                title="No behavior targets"
                detail="BIP / maladaptive behavior targets from the treatment plan will list here. Sync maps them to BehaviorTarget for Session Studio."
              />
            ) : (
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {snapshot.brpGoals.map((b, idx) => {
                  const name = b.behavior?.trim().toLowerCase() || '';
                  const linked = Boolean(name && behaviorNameSet.has(name));
                  return (
                    <GoalCardShell key={`brp-${idx}`} accent="">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div>
                          <p className="text-sm font-medium text-white leading-snug">
                            {b.behavior || 'Untitled target behavior'}
                          </p>
                          {b.function && (
                            <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                              Function · {b.function}
                            </p>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-1.5">
                          <span
                            className={`rounded-full border px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider ${statusBadge(b.status)}`}
                          >
                            {b.status}
                          </span>
                          <span className="rounded-full border border-white/10 bg-zinc-900/80 px-2 py-0.5 font-mono text-[9px] uppercase text-zinc-400">
                            Risk {b.risk}
                          </span>
                          <StudioLinkBadge linked={linked} />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mt-3">
                        <MetaCell label="Baseline" value={b.baseline} />
                        <MetaCell label="Current" value={b.currentLevel} />
                        <MetaCell label="Mastery" value={b.mastery} />
                        <MetaCell label="Target" value={b.targetDate} />
                      </div>
                    </GoalCardShell>
                  );
                })}
              </div>
            )}
          </section>

          {/* Caregiver */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-heading text-sm font-semibold text-zinc-200 flex items-center gap-2">
                <Users className="h-4 w-4 text-violet-400" />
                Caregiver goals
              </h3>
              <span className="font-mono text-[10px] text-zinc-500">
                {snapshot.counts.parent} TP only
              </span>
            </div>

            {snapshot.parentGoals.length === 0 ? (
              <EmptyBlock
                title="No caregiver goals"
                detail="Parent / caregiver training objectives appear here after they are authored on the Treatment Plan. They are not synced to Session Studio SkillTargets."
              />
            ) : (
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {snapshot.parentGoals.map((p, idx) => (
                  <GoalCardShell key={`parent-${idx}`} accent="">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <p className="text-sm font-medium text-white leading-snug">
                        {p.description || 'Untitled caregiver objective'}
                      </p>
                      <div className="flex shrink-0 flex-col items-end gap-1.5">
                        <span
                          className={`rounded-full border px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider ${statusBadge(p.status)}`}
                        >
                          {p.status}
                        </span>
                        <span className="inline-flex items-center rounded-full border border-violet-500/20 bg-violet-500/10 px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-violet-300">
                          TP only
                        </span>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <MetaCell label="Baseline" value={p.baseline} />
                      <MetaCell label="Current" value={p.currentLevel} />
                      <MetaCell label="Mastery" value={p.mastery} />
                      <MetaCell label="Target" value={p.targetDate} />
                    </div>
                  </GoalCardShell>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
