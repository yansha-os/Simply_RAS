'use client';

import React from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CalendarPlus,
  CheckCircle2,
  Circle,
  ClipboardList,
  Lock,
  Sparkles,
  Users,
  XCircle,
} from 'lucide-react';
import {
  getStaffingReadiness,
  type StaffingNextAction,
  type StaffingReadiness,
  type StaffingReadinessClient,
} from '@/lib/staffingReadiness';

function ctaTone(kind: StaffingNextAction['kind']): {
  border: string;
  bg: string;
  text: string;
  badge: string;
} {
  switch (kind) {
    case 'publish_opening':
      return {
        border: 'border-brand-orange-500/40',
        bg: 'bg-brand-orange-500/10',
        text: 'text-brand-orange-200',
        badge: 'Publish',
      };
    case 'review_applicants':
      return {
        border: 'border-sky-500/35',
        bg: 'bg-sky-500/10',
        text: 'text-sky-200',
        badge: 'Review apps',
      };
    case 'await_parent':
      return {
        border: 'border-amber-500/35',
        bg: 'bg-amber-500/10',
        text: 'text-amber-200',
        badge: 'Parent',
      };
    case 'schedule_first_session':
      return {
        border: 'border-cyan-500/40',
        bg: 'bg-cyan-500/10',
        text: 'text-cyan-200',
        badge: 'Schedule',
      };
    case 'activate':
      return {
        border: 'border-emerald-500/40',
        bg: 'bg-emerald-500/10',
        text: 'text-emerald-200',
        badge: 'Activate',
      };
    case 'active':
      return {
        border: 'border-green-500/35',
        bg: 'bg-green-500/10',
        text: 'text-green-200',
        badge: 'ACTIVE',
      };
    default:
      return {
        border: 'border-amber-500/30',
        bg: 'bg-amber-500/10',
        text: 'text-amber-200',
        badge: 'Blocked',
      };
  }
}

function CtaIcon({ kind }: { kind: StaffingNextAction['kind'] }) {
  const cls = 'h-4 w-4 shrink-0';
  switch (kind) {
    case 'publish_opening':
      return <Sparkles className={cls} />;
    case 'review_applicants':
      return <Users className={cls} />;
    case 'schedule_first_session':
    case 'activate':
      return <CalendarPlus className={cls} />;
    case 'active':
      return <CheckCircle2 className={cls} />;
    case 'await_parent':
      return <AlertTriangle className={cls} />;
    default:
      return <Lock className={cls} />;
  }
}

export default function StaffingReadinessChecklist({
  client,
  compact = false,
  onCtaClick,
  ctaKinds,
}: {
  client: StaffingReadinessClient;
  compact?: boolean;
  /** Optional handler when Case Coord clicks the next-action CTA */
  onCtaClick?: (action: StaffingNextAction) => void;
  /** When set, Continue only shows for these next-action kinds */
  ctaKinds?: StaffingNextAction['kind'][];
}) {
  const readiness: StaffingReadiness = getStaffingReadiness(client);
  const { nextAction } = readiness;
  const tone = ctaTone(nextAction.kind);
  const interactive =
    Boolean(onCtaClick) &&
    (ctaKinds
      ? ctaKinds.includes(nextAction.kind)
      : nextAction.kind !== 'active' && nextAction.kind !== 'blocked');
  const postItems = readiness.items.filter((i) => i.requiredForPost);
  const pipelineItems = readiness.items.filter((i) => !i.requiredForPost);
  const showPipeline = !compact || pipelineItems.some((i) => i.met) || readiness.canPostOpening;

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border backdrop-blur-xl transition-all duration-300 ${
        readiness.ready
          ? 'border-green-500/30 bg-green-500/5'
          : 'border-white/10 bg-zinc-950/80'
      } ${compact ? 'p-4' : 'p-5'}`}
    >
      <div className="pointer-events-none absolute -top-16 right-0 h-32 w-32 rounded-full bg-brand-orange-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-12 left-8 h-24 w-24 rounded-full bg-cyan-500/10 blur-3xl" />

      <div className="relative flex items-start justify-between gap-3 mb-3">
        <div>
          <h3 className="font-heading text-sm font-semibold text-white flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-brand-orange-400" />
            Staffing readiness
          </h3>
          {!compact && (
            <p className="mt-1 text-xs text-zinc-400">
              Honest PASS/FAIL against live client state. ACTIVE still needs a durable first Session
              (Bridge E) — never granted by staffing accept alone.
            </p>
          )}
        </div>
        <span
          className={`shrink-0 rounded-md border px-2 py-0.5 font-mono text-[10px] font-bold uppercase ${
            readiness.ready
              ? 'border-green-500/30 bg-green-500/10 text-green-400'
              : 'border-amber-500/30 bg-amber-500/10 text-amber-300'
          }`}
        >
          {readiness.ready ? 'Post-ready' : 'Blocked'}
        </span>
      </div>

      {/* Next-action CTA */}
      <div
        className={`relative mb-4 rounded-xl border ${tone.border} ${tone.bg} px-3 py-2.5`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5 min-w-0">
            <span className={`mt-0.5 ${tone.text}`}>
              <CtaIcon kind={nextAction.kind} />
            </span>
            <div className="min-w-0">
              <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                Next action
              </p>
              <p className={`mt-0.5 text-xs font-medium ${tone.text}`}>{nextAction.label}</p>
              {nextAction.kind === 'blocked' && nextAction.blockers && nextAction.blockers.length > 0 && (
                <ul className="mt-1.5 space-y-0.5">
                  {nextAction.blockers.map((b) => (
                    <li key={b} className="flex items-center gap-1.5 font-mono text-[10px] text-amber-300/80">
                      <XCircle className="h-3 w-3 shrink-0" />
                      {b}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <span
            className={`shrink-0 rounded-md border px-2 py-0.5 font-mono text-[9px] font-bold uppercase ${tone.border} ${tone.text}`}
          >
            {tone.badge}
          </span>
        </div>
        {interactive && (
          <button
            type="button"
            onClick={() => onCtaClick?.(nextAction)}
            className={`mt-2.5 inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border ${tone.border} bg-zinc-950/50 px-3 py-2 text-xs font-semibold ${tone.text} transition-all duration-300 hover:scale-[1.01] hover:border-brand-orange-500/50 hover:shadow-lg`}
          >
            Continue
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="relative space-y-3">
        <div>
          {!compact && (
            <p className="mb-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-zinc-500">
              Required to publish opening
            </p>
          )}
          <ul className="space-y-2">
            {postItems.map((item) => (
              <li
                key={item.id}
                className="flex items-start gap-2.5 rounded-xl border border-white/5 bg-zinc-900/40 px-3 py-2 transition-all duration-300 hover:border-white/10"
              >
                {item.met ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-400" />
                ) : (
                  <Circle className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className={`text-xs font-medium ${item.met ? 'text-zinc-200' : 'text-zinc-400'}`}>
                      {item.label}
                    </p>
                    <span
                      className={`shrink-0 rounded border px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase ${
                        item.met
                          ? 'border-green-500/25 bg-green-500/10 text-green-400'
                          : 'border-red-500/25 bg-red-500/10 text-red-400'
                      }`}
                    >
                      {item.met ? 'Pass' : 'Fail'}
                    </span>
                  </div>
                  {item.detail && (
                    <p className="mt-0.5 font-mono text-[10px] text-zinc-500">{item.detail}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>

        {showPipeline && (
          <div>
            {!compact && (
              <p className="mb-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                Staffing pipeline
              </p>
            )}
            <ul className="space-y-2">
              {pipelineItems.map((item) => (
                <li
                  key={item.id}
                  className="flex items-start gap-2.5 rounded-xl border border-white/5 bg-zinc-900/40 px-3 py-2 transition-all duration-300 hover:border-white/10"
                >
                  {item.met ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-400" />
                  ) : (
                    <Circle className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className={`text-xs font-medium ${item.met ? 'text-zinc-200' : 'text-zinc-400'}`}>
                        {item.label}
                      </p>
                      <span
                        className={`shrink-0 rounded border px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase ${
                          item.met
                            ? 'border-green-500/25 bg-green-500/10 text-green-400'
                            : 'border-zinc-500/25 bg-zinc-500/10 text-zinc-500'
                        }`}
                      >
                        {item.met ? 'Pass' : 'Fail'}
                      </span>
                    </div>
                    {item.detail && (
                      <p className="mt-0.5 font-mono text-[10px] text-zinc-500">{item.detail}</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

export { getStaffingReadiness };
