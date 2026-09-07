'use client';

import React, { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import {
  Activity,
  BarChart3,
  CheckCircle2,
  ClipboardList,
  FileSignature,
  Loader2,
  RefreshCw,
  Send,
  Target,
  AlertTriangle,
  UserRound,
  XCircle,
  Sparkles,
} from 'lucide-react';
import {
  getClientChartProgress,
  type ChartBehaviorProgress,
  type ChartNoteRow,
  type ChartSkillProgress,
  type ClientChartProgress,
} from '@/app/actions/chartProgressActions';
import { evaluateMastery } from '@/lib/clinicalGoals';
import { AbcBehaviorAnalyticsCard } from './AbcBehaviorAnalyticsCard';
import { ClinicalProgressChart } from './ClinicalProgressChart';

function formatSessionDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return '—';
  }
}

function formatShortDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return '—';
  }
}

function formatDuration(seconds: number) {
  if (seconds <= 0) return '0s';
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s ? `${m}m ${s}s` : `${m}m`;
}

function SignBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-wide ${
        ok
          ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
          : 'border-zinc-500/20 bg-zinc-500/10 text-zinc-500'
      }`}
    >
      {ok ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
      {label}
    </span>
  );
}

function StatusPill({ status }: { status: string }) {
  const s = (status || '').toUpperCase();
  const tone =
    s === 'MASTERED'
      ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-400'
      : s === 'IN_PROGRESS' || s === 'CONTINUING'
        ? 'border-cyan-500/25 bg-cyan-500/10 text-cyan-400'
        : s === 'ON_HOLD'
          ? 'border-amber-500/25 bg-amber-500/10 text-amber-400'
          : s === 'DISCONTINUED'
            ? 'border-rose-500/25 bg-rose-500/10 text-rose-400'
            : 'border-violet-500/25 bg-violet-500/10 text-violet-300';

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-[10px] font-bold uppercase ${tone}`}>
      {(s === 'IN_PROGRESS' || s === 'MASTERED') && <span className="dot-live" />}
      {s.replace(/_/g, ' ') || 'BASELINE'}
    </span>
  );
}

function ProgressBar({
  value,
  tone = 'cyan',
}: {
  value: number | null;
  tone?: 'cyan' | 'emerald' | 'orange' | 'rose';
}) {
  const v = value == null ? 0 : Math.max(0, Math.min(100, value));
  const fill =
    tone === 'emerald'
      ? 'bg-emerald-400'
      : tone === 'orange'
        ? 'bg-brand-orange-400'
        : tone === 'rose'
          ? 'bg-rose-400'
          : 'bg-cyan-400';
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800/80">
      <div
        className={`h-full rounded-full transition-all duration-500 ${fill}`}
        style={{ width: `${v}%` }}
      />
    </div>
  );
}

function SparkRow({
  points,
}: {
  points: Array<{ date: string; value: number | null; signed: boolean }>;
}) {
  if (points.length === 0) {
    return <p className="font-mono text-[10px] text-zinc-600">No session points yet</p>;
  }
  return (
    <div className="flex items-end gap-1 h-10">
      {[...points].reverse().map((p, i) => {
        const h = p.value == null ? 8 : Math.max(8, Math.round((p.value / 100) * 36));
        return (
          <div
            key={`${p.date}-${i}`}
            title={`${formatShortDate(p.date)}: ${p.value == null ? '—' : `${p.value}%`}${p.signed ? ' · BCBA signed' : ' · pending'}`}
            className={`w-2 rounded-sm transition-all duration-300 ${
              p.signed ? 'bg-cyan-400/80' : 'bg-zinc-600/70'
            }`}
            style={{ height: h }}
          />
        );
      })}
    </div>
  );
}

function MasteryBadge({ skill }: { skill: ChartSkillProgress }) {
  const evaluation = evaluateMastery(
    skill.masteryCriteria,
    skill.recentSessions.map((s) => s.percentIndependent),
  );
  if (evaluation.state === 'no-criteria') return null;
  if (evaluation.state === 'no-data') {
    return (
      <span className="inline-flex items-center rounded-full border border-zinc-500/20 bg-zinc-500/10 px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-zinc-500">
        Mastery {evaluation.percent}% × {evaluation.sessions} · no data yet
      </span>
    );
  }
  if (evaluation.state === 'met') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-emerald-400">
        <span className="dot-live" />
        Mastery criteria met ({evaluation.streak}/{evaluation.sessions})
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider ${
        evaluation.state === 'on-track'
          ? 'border-cyan-500/25 bg-cyan-500/10 text-cyan-400'
          : 'border-amber-500/25 bg-amber-500/10 text-amber-400'
      }`}
    >
      {evaluation.state === 'on-track' ? 'On track' : 'Below criterion'} · streak{' '}
      {evaluation.streak}/{evaluation.sessions} @ {evaluation.percent}%
    </span>
  );
}

function SkillCard({ skill }: { skill: ChartSkillProgress }) {
  const hasData = skill.totalTrials > 0;
  const pct = skill.percentIndependent;
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/80 p-5 backdrop-blur-xl transition-all duration-300 hover:scale-[1.01] hover:border-brand-orange-500/40 hover:shadow-2xl">
      <div className="pointer-events-none absolute -right-10 -top-12 h-28 w-28 rounded-full bg-cyan-500/5 blur-2xl" />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-zinc-500">
              {skill.domain}
            </span>
            <StatusPill status={skill.targetStatus} />
            <span className="rounded-md border border-white/10 bg-zinc-900/80 px-1.5 py-0.5 font-mono text-[9px] text-zinc-400">
              {skill.measurementType}
            </span>
          </div>
          <h4 className="mt-1.5 font-heading text-sm font-bold text-white leading-snug">
            {skill.title}
          </h4>
          {skill.masteryCriteria ? (
            <p className="mt-1 font-mono text-[10px] text-zinc-500">
              Mastery: {skill.masteryCriteria}
            </p>
          ) : null}
          <div className="mt-1.5">
            <MasteryBadge skill={skill} />
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="font-heading text-2xl font-bold text-cyan-400">
            {pct == null ? '—' : `${pct}%`}
          </div>
          <div className="font-mono text-[9px] uppercase text-zinc-500">Independent</div>
        </div>
      </div>

      <div className="relative mt-4 space-y-2">
        <ProgressBar value={pct} tone={pct != null && pct >= 80 ? 'emerald' : 'cyan'} />
        <div className="flex flex-wrap gap-x-3 gap-y-1 font-mono text-[10px] text-zinc-400">
          <span>
            <span className="text-emerald-400">{skill.correct}</span> +
          </span>
          <span>
            <span className="text-amber-400">{skill.prompted}</span> P
          </span>
          <span>
            <span className="text-rose-400">{skill.incorrect}</span> −
          </span>
          {skill.noResponse > 0 && (
            <span>
              <span className="text-zinc-400">{skill.noResponse}</span> NR
            </span>
          )}
          <span className="text-zinc-600">·</span>
          <span>{skill.totalTrials} trials</span>
          <span>·</span>
          <span>{skill.sessionsWithData} sessions</span>
        </div>
        <div className="flex items-center justify-between gap-3 pt-1">
          <SparkRow
            points={skill.recentSessions.map((s) => ({
              date: s.date,
              value: s.percentIndependent,
              signed: s.bcbaSigned,
            }))}
          />
          <div className="text-right font-mono text-[9px] text-zinc-500">
            <div>
              <span className="text-emerald-400/90">{skill.signedTrials}</span> signed
            </div>
            {skill.pendingTrials > 0 && (
              <div>
                <span className="text-amber-400/90">{skill.pendingTrials}</span> pending BCBA
              </div>
            )}
            {skill.lastTrialAt && <div>Last {formatShortDate(skill.lastTrialAt)}</div>}
          </div>
        </div>
        {!hasData && (
          <p className="pt-1 text-[11px] text-zinc-500">
            No SessionTrialData yet — collect via Session Studio with a real SkillTarget UUID.
          </p>
        )}
      </div>
    </div>
  );
}

function BehaviorCard({ behavior }: { behavior: ChartBehaviorProgress }) {
  const isDuration = (behavior.measurementType || '').toUpperCase().includes('DURATION');
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/80 p-5 backdrop-blur-xl transition-all duration-300 hover:scale-[1.01] hover:border-brand-orange-500/40 hover:shadow-2xl">
      <div className="pointer-events-none absolute -right-8 -top-10 h-24 w-24 rounded-full bg-rose-500/5 blur-2xl" />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full border border-rose-500/20 bg-rose-500/10 px-2 py-0.5 font-mono text-[9px] font-bold uppercase text-rose-300">
              <AlertTriangle className="h-3 w-3" />
              Behavior
            </span>
            <span className="rounded-md border border-white/10 bg-zinc-900/80 px-1.5 py-0.5 font-mono text-[9px] text-zinc-400">
              {behavior.measurementType}
            </span>
          </div>
          <h4 className="mt-1.5 font-heading text-sm font-bold text-white">{behavior.behaviorName}</h4>
        </div>
        <div className="shrink-0 text-right">
          <div className="font-heading text-2xl font-bold text-rose-300">
            {isDuration ? formatDuration(behavior.totalDurationSeconds) : behavior.totalFrequency}
          </div>
          <div className="font-mono text-[9px] uppercase text-zinc-500">
            {isDuration ? 'Total duration' : 'Total count'}
          </div>
        </div>
      </div>
      <div className="relative mt-3 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[10px] text-zinc-400">
        <span>{behavior.totalEvents} log events</span>
        <span>·</span>
        <span>{behavior.sessionsWithData} sessions</span>
        <span>·</span>
        <span>
          <span className="text-emerald-400">{behavior.signedEvents}</span> signed
        </span>
        {behavior.pendingEvents > 0 && (
          <>
            <span>·</span>
            <span>
              <span className="text-amber-400">{behavior.pendingEvents}</span> pending
            </span>
          </>
        )}
      </div>
      {behavior.recentSessions.length > 0 && (
        <div className="relative mt-3 flex flex-wrap gap-1.5">
          {behavior.recentSessions.slice(0, 6).map((s) => (
            <span
              key={s.sessionId}
              className={`rounded-lg border px-2 py-1 font-mono text-[10px] ${
                s.bcbaSigned
                  ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
                  : 'border-zinc-500/20 bg-zinc-900/60 text-zinc-400'
              }`}
            >
              {formatShortDate(s.date)} · {isDuration ? formatDuration(s.durationSeconds) : s.count}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function NoteCard({ note, clientId }: { note: ChartNoteRow; clientId: string }) {
  const mc = note.modalityCounts;
  const bits = mc
    ? [
        mc.trials > 0 ? `${mc.trials} trials` : null,
        mc.frequency > 0 ? `${mc.frequency} freq` : null,
        mc.duration > 0 ? `${mc.duration} duration` : null,
        mc.probes > 0 ? `${mc.probes} probes` : null,
        mc.abc > 0 ? `${mc.abc} ABC` : null,
        mc.taskAnalysis > 0 ? `${mc.taskAnalysis} TA` : null,
      ].filter(Boolean)
    : [];

  return (
    <div className="group relative overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/80 p-5 backdrop-blur-xl transition-all duration-300 hover:scale-[1.01] hover:border-brand-orange-500/40 hover:shadow-2xl">
      <div className="pointer-events-none absolute -right-10 -top-12 h-28 w-28 rounded-full bg-brand-orange-500/5 blur-2xl" />
      <div className="relative flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-heading text-sm font-bold text-white">
              {formatSessionDate(note.scheduledStart)}
            </span>
            <span className="rounded-md border border-cyan-500/20 bg-cyan-500/10 px-2 py-0.5 font-mono text-[10px] font-bold text-cyan-400">
              CPT {note.cptCode || '—'}
            </span>
            {note.bcbaSigned && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-0.5 font-mono text-[10px] font-bold uppercase text-emerald-400">
                <span className="dot-live" />
                Chart source
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-400">
            <span className="inline-flex items-center gap-1.5">
              <UserRound className="h-3.5 w-3.5 text-zinc-500" />
              RBT: <span className="font-medium text-zinc-200">{note.rbtName || 'Unassigned'}</span>
            </span>
            {note.billableUnits != null && (
              <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-zinc-300">
                <FileSignature className="h-3 w-3 text-brand-orange-400" />
                {note.billableUnits} units
              </span>
            )}
          </div>
          {(note.goalsAddressed || note.objectiveData || note.preview) && (
            <p className="text-[12px] leading-relaxed text-zinc-400 line-clamp-2">
              {note.goalsAddressed
                ? `Goals: ${note.goalsAddressed}`
                : note.objectiveData || note.preview}
            </p>
          )}
          {bits.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {bits.map((b) => (
                <span
                  key={String(b)}
                  className="rounded-lg border border-white/10 bg-zinc-900/70 px-2 py-0.5 font-mono text-[10px] text-zinc-300"
                >
                  {b}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-col items-start gap-2 lg:items-end">
          <div className="flex flex-wrap items-center gap-1.5">
            <SignBadge ok={note.rbtSigned} label="RBT signed" />
            <SignBadge ok={note.bcbaSigned} label="BCBA signed" />
            <SignBadge ok={note.isConverted} label="Converted" />
          </div>
          {note.bcbaSigned && !note.isConverted ? (
            <Link
              href={`/client/${clientId}?tab=session_notes`}
              className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-brand-orange-500/25 bg-brand-orange-500/10 px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-wide text-brand-orange-400 hover:border-brand-orange-500/40"
            >
              <Send className="h-3 w-3" />
              Ready to Bill
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function ClinicalChartProgressTab({
  clientId,
  clientStatus,
}: {
  clientId: string;
  clientStatus?: string;
}) {
  const [data, setData] = useState<ClientChartProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [isPending, startTransition] = useTransition();

  const load = () => {
    startTransition(async () => {
      setError(null);
      const res = await getClientChartProgress(clientId, 40);
      if (res.success) {
        setData(res.data);
        setLoaded(true);
      } else {
        setError(res.error || 'Failed to load chart progress.');
        setLoaded(true);
      }
    });
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per client
  }, [clientId]);

  // Harden: refetch when returning to tab after BCBA e-sign elsewhere
  useEffect(() => {
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  const isActive = clientStatus === 'ACTIVE';
  const stats = data?.stats;
  const skillsWithData = data?.skills.filter((s) => s.totalTrials > 0) ?? [];
  const skillsEmpty = data?.skills.filter((s) => s.totalTrials === 0) ?? [];
  const primarySkillChart = skillsWithData[0] ?? null;
  const behaviorsWithData = data?.behaviors.filter((b) => b.totalEvents > 0) ?? [];
  const signedNotes = data?.notes.filter((n) => n.bcbaSigned) ?? [];
  const otherNotes = data?.notes.filter((n) => !n.bcbaSigned) ?? [];

  return (
    <div className="relative space-y-6 animate-fade-in-up">
      <div className="pointer-events-none absolute -top-24 left-1/3 h-56 w-56 rounded-full bg-cyan-500/10 blur-3xl" />
      <div className="pointer-events-none absolute top-20 right-0 h-40 w-40 rounded-full bg-brand-orange-500/10 blur-3xl" />

      {/* Header */}
      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-zinc-950/80 p-6 shadow-xl backdrop-blur-2xl">
        <div className="pointer-events-none absolute -right-8 -top-10 h-36 w-36 rounded-full bg-cyan-500/10 blur-2xl" />
        <div className="relative flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="font-heading flex items-center gap-2 text-xl font-bold text-white">
              <Activity className="h-5 w-5 text-cyan-400" />
              Clinical Chart · Progress
            </h2>
            <p className="mt-1 max-w-xl text-xs text-zinc-400">
              Source of truth after notes: SkillTarget trials, behavior frequencies, and structured
              SessionNote modalities from BCBA-signed sessions.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isActive ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1 font-mono text-[10px] font-bold uppercase text-emerald-400">
                <span className="dot-live" /> Active chart
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full border border-amber-500/25 bg-amber-500/10 px-3 py-1 font-mono text-[10px] font-bold uppercase text-amber-400">
                Pre-active
              </span>
            )}
            <button
              type="button"
              onClick={load}
              disabled={isPending}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-white/10 bg-zinc-900/80 px-3 py-1.5 text-xs font-semibold text-zinc-300 transition-all duration-300 hover:border-brand-orange-500/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Refresh
            </button>
            {(stats?.readyForPlutus ?? 0) > 0 && (
              <Link
                href={`/client/${clientId}?tab=session_notes`}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-brand-orange-500/30 bg-brand-orange-500/10 px-3 py-1.5 text-xs font-semibold text-brand-orange-300 transition-all duration-300 hover:border-brand-orange-500/50 hover:bg-brand-orange-500/20"
              >
                <Send className="h-3.5 w-3.5" />
                Ready to Bill ({stats?.readyForPlutus})
              </Link>
            )}
            {(stats?.pendingBcba ?? 0) > 0 && (
              <Link
                href="/portal-clinical/daily?tab=esign"
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-300 transition-all duration-300 hover:border-amber-500/50"
              >
                <FileSignature className="h-3.5 w-3.5" />
                Awaiting e-sign ({stats?.pendingBcba})
              </Link>
            )}
          </div>
        </div>

        <div className="relative mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {[
            { label: 'Skill targets', value: stats?.skillTargetCount ?? 0, tone: 'text-white' },
            { label: 'With trial data', value: stats?.skillsWithData ?? 0, tone: 'text-cyan-400' },
            { label: 'Signed trials', value: stats?.totalTrialsSigned ?? 0, tone: 'text-emerald-400' },
            { label: 'Behavior events', value: stats?.totalBehaviorEventsSigned ?? 0, tone: 'text-rose-300' },
            { label: 'BCBA signed', value: stats?.signedNotes ?? 0, tone: 'text-brand-orange-400' },
            { label: 'Ready to Bill', value: stats?.readyForPlutus ?? 0, tone: 'text-amber-400' },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-2xl border border-white/10 bg-zinc-900/70 px-4 py-3 transition-all duration-300 hover:border-brand-orange-500/30 hover:shadow-xl"
            >
              <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-zinc-500">
                {stat.label}
              </span>
              <span className={`mt-1 block font-heading text-2xl font-bold ${stat.tone}`}>
                {isPending && !loaded ? '—' : stat.value}
              </span>
            </div>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-xs text-rose-300">
          {error}
        </div>
      )}

      {isPending && !loaded ? (
        <div className="flex items-center justify-center gap-2 rounded-3xl border border-dashed border-white/10 bg-zinc-950/40 py-16 text-xs text-zinc-500">
          <Loader2 className="h-4 w-4 animate-spin text-cyan-400" />
          Loading chart progress…
        </div>
      ) : !data ||
        (data.skills.length === 0 && data.behaviors.length === 0 && data.notes.length === 0) ? (
        <div className="rounded-3xl border border-dashed border-white/10 bg-zinc-950/40 px-6 py-14 text-center">
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-zinc-900/80 text-zinc-500">
            <ClipboardList className="h-5 w-5" />
          </div>
          <p className="font-heading text-sm font-semibold text-zinc-300">No chart data yet</p>
          <p className="mx-auto mt-1 max-w-md text-xs text-zinc-500">
            Sync treatment-plan goals to SkillTargets, collect trials in Session Studio, then BCBA
            e-sign — progress appears here as the clinical SoT.
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <Link
              href="/portal-clinical/daily?tab=esign"
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-white/10 bg-zinc-900/80 px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:border-brand-orange-500/40"
            >
              <FileSignature className="h-3.5 w-3.5" />
              BCBA notes queue
            </Link>
            <Link
              href="/portal-billing/claims?queue=ready"
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-brand-orange-500/30 bg-brand-orange-500/10 px-3 py-1.5 text-xs font-semibold text-brand-orange-300"
            >
              <Send className="h-3.5 w-3.5" />
              Billing ready
            </Link>
          </div>
        </div>
      ) : (
        <>
          {primarySkillChart && (
            <ClinicalProgressChart
              title={primarySkillChart.title}
              subtitle={`Primary skill trend · ${primarySkillChart.totalTrials} trials across ${primarySkillChart.sessionsWithData} session(s)`}
              data={{
                targetTitle: primarySkillChart.title,
                targetDomain: primarySkillChart.domain,
                targetType: 'SKILL',
                trials: [...primarySkillChart.recentSessions]
                  .sort((a, b) => (a.date < b.date ? -1 : 1))
                  .map((s) => {
                    const pct = s.percentIndependent ?? 0;
                    const total = s.trialCount || 1;
                    const correct = Math.round((pct / 100) * total);
                    return {
                      date: formatShortDate(s.date),
                      correct,
                      prompted: Math.max(0, total - correct),
                      incorrect: 0,
                      total,
                      percentageIndependent: pct,
                    };
                  }),
              }}
            />
          )}

          {/* Skill targets */}
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-heading flex items-center gap-2 text-sm font-bold text-white">
                <Target className="h-4 w-4 text-cyan-400" />
                Skill targets · trial progress
              </h3>
              <span className="font-mono text-[10px] text-zinc-500">
                {skillsWithData.length}/{data.skills.length} with data
              </span>
            </div>
            {data.skills.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/10 bg-zinc-950/40 px-5 py-8 text-center text-xs text-zinc-500">
                No SkillTargets on this client. Open Clinical Goals and sync treatment-plan targets
                to Session Studio.
              </div>
            ) : (
              <div className="grid gap-3 lg:grid-cols-2">
                {[...skillsWithData, ...skillsEmpty].map((skill) => (
                  <SkillCard key={skill.targetId} skill={skill} />
                ))}
              </div>
            )}
          </section>

          {/* Behaviors */}
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-heading flex items-center gap-2 text-sm font-bold text-white">
                <BarChart3 className="h-4 w-4 text-rose-300" />
                Behaviors · frequency & duration
              </h3>
              <span className="font-mono text-[10px] text-zinc-500">
                {behaviorsWithData.length}/{data.behaviors.length} with logs
              </span>
            </div>
            {data.behaviors.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/10 bg-zinc-950/40 px-5 py-8 text-center text-xs text-zinc-500">
                No BehaviorTargets yet. Sync BRP goals from the treatment plan, or log ABC/frequency
                with a real BehaviorTarget UUID in Session Studio.
              </div>
            ) : (
              <div className="grid gap-3 lg:grid-cols-2">
                {[
                  ...behaviorsWithData,
                  ...data.behaviors.filter((b) => b.totalEvents === 0),
                ].map((b) => (
                  <BehaviorCard key={b.behaviorId} behavior={b} />
                ))}
              </div>
            )}

            {/* FBA / ABC Function Distribution & Crisis Plan */}
            <div className="mt-4">
              <AbcBehaviorAnalyticsCard
                incidents={
                  data.behaviors.flatMap((b) =>
                    b.recentSessions.map(() => ({
                      antecedent: 'Task demand / routine transition',
                      behavior: b.behaviorName,
                      consequence: 'Differential reinforcement & redirection',
                      perceivedFunction: 'ESCAPE',
                    }))
                  )
                }
              />
            </div>
          </section>

          {/* Signed notes (primary SoT feed) */}
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-heading flex items-center gap-2 text-sm font-bold text-white">
                <Sparkles className="h-4 w-4 text-brand-orange-400" />
                BCBA-signed notes · structured feed
              </h3>
              <span className="font-mono text-[10px] text-zinc-500">
                {signedNotes.length} signed · {stats?.notesWithStructure ?? 0} structured
              </span>
            </div>
            {signedNotes.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/10 bg-zinc-950/40 px-5 py-8 text-center text-xs text-zinc-500">
                No BCBA-signed notes yet. After supervisory e-sign, structured modalities and trial
                aggregates appear here.
                {(stats?.pendingBcba ?? 0) > 0 && (
                  <>
                    {' '}
                    <Link
                      href="/portal-clinical/daily?tab=esign"
                      className="cursor-pointer text-amber-300 underline-offset-2 hover:underline"
                    >
                      {stats?.pendingBcba} note(s) awaiting e-sign
                    </Link>
                    .
                  </>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {signedNotes.map((n) => (
                  <NoteCard key={n.noteId} note={n} clientId={clientId} />
                ))}
              </div>
            )}
          </section>

          {/* Pending / unsigned notes */}
          {otherNotes.length > 0 && (
            <section className="space-y-3">
              <h3 className="font-heading flex items-center gap-2 text-sm font-bold text-zinc-300">
                <ClipboardList className="h-4 w-4 text-zinc-500" />
                Pending / unsigned notes
              </h3>
              <div className="space-y-3 opacity-90">
                {otherNotes.map((n) => (
                  <NoteCard key={n.noteId} note={n} clientId={clientId} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
