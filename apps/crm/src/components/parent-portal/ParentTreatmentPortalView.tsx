'use client';

import React, { useCallback, useEffect, useState, useTransition } from 'react';
import {
  Award,
  BookOpen,
  Calendar,
  Heart,
  RefreshCw,
  Sparkles,
  Star,
  Video,
} from 'lucide-react';
import { getParentPortalOverview } from '@/app/actions/parentPortalActions';
import type { ParentPortalSummary } from '@/lib/parentPortalEngine';

interface ParentTreatmentPortalViewProps {
  clientId: string;
}

export default function ParentTreatmentPortalView({ clientId }: ParentTreatmentPortalViewProps) {
  const [summary, setSummary] = useState<ParentPortalSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const loadData = useCallback(() => {
    startTransition(async () => {
      setLoading(true);
      setError(null);
      const res = await getParentPortalOverview(clientId);
      if (res.success && res.summary) {
        setSummary(res.summary);
      } else {
        setError(res.error || 'Failed to load parent portal.');
      }
      setLoading(false);
    });
  }, [clientId]);

  useEffect(() => {
    if (clientId) {
      loadData();
    }
  }, [clientId, loadData]);

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="rounded-2xl border border-brand-orange-500/20 bg-gradient-to-r from-zinc-950 via-zinc-900 to-zinc-950 p-6 shadow-2xl backdrop-blur-xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-brand-orange-500/30 bg-brand-orange-500/10 text-brand-orange-400">
              <Heart className="h-7 w-7" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-heading text-xl font-bold text-white">
                  Welcome to {summary?.clientName || 'Your Child'}&apos;s Treatment Hub
                </h2>
                <span className="rounded-full border border-green-500/20 bg-green-500/10 px-2.5 py-0.5 font-mono text-[10px] font-semibold text-green-400">
                  Active Care
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-1">
                Parent & Guardian Portal (prototype) · milestones and carryover activities for staff review.
              </p>
            </div>
          </div>

          <button
            onClick={loadData}
            disabled={isPending}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-zinc-900 px-3.5 py-2 text-xs font-medium text-zinc-300 hover:border-white/20 hover:text-white transition-all cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isPending ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Content */}
      {loading && !summary ? (
        <div className="flex items-center justify-center py-20 text-zinc-400">
          <RefreshCw className="h-6 w-6 animate-spin text-brand-orange-500 mr-2" />
          <span className="font-mono text-xs">Loading treatment progress & milestones...</span>
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-xs text-red-400">
          {error}
        </div>
      ) : summary ? (
        <div className="space-y-6">
          {/* Key Metrics Row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl border border-white/5 bg-zinc-900/60 p-4">
              <div className="text-[10px] uppercase font-mono tracking-wider text-zinc-500">
                Mastered Goals
              </div>
              <div className="mt-1 font-heading text-2xl font-bold text-green-400 flex items-center gap-1.5">
                <Star className="h-5 w-5 fill-green-400 text-green-400" />
                {summary.totalMasteredGoals}
              </div>
            </div>

            <div className="rounded-xl border border-white/5 bg-zinc-900/60 p-4">
              <div className="text-[10px] uppercase font-mono tracking-wider text-zinc-500">
                Goals in Progress
              </div>
              <div className="mt-1 font-heading text-2xl font-bold text-brand-orange-400">
                {summary.inProgressGoalsCount}
              </div>
            </div>

            <div className="rounded-xl border border-white/5 bg-zinc-900/60 p-4">
              <div className="text-[10px] uppercase font-mono tracking-wider text-zinc-500">
                Weekly Therapy
              </div>
              <div className="mt-1 font-heading text-2xl font-bold text-cyan-400">
                {summary.weeklyRenderedHours} hrs/wk
              </div>
            </div>

            <div className="rounded-xl border border-white/5 bg-zinc-900/60 p-4">
              <div className="text-[10px] uppercase font-mono tracking-wider text-zinc-500">
                Attendance Rate
              </div>
              <div className="mt-1 font-heading text-2xl font-bold text-white font-mono">
                {summary.attendanceRatePct}%
              </div>
            </div>
          </div>

          {/* Next Scheduled Session Banner */}
          {summary.nextScheduledSession && (
            <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/20 text-cyan-400">
                    {summary.nextScheduledSession.isTelehealth ? (
                      <Video className="h-5 w-5" />
                    ) : (
                      <Calendar className="h-5 w-5" />
                    )}
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-white">
                      Next Session: {summary.nextScheduledSession.date} at{' '}
                      {summary.nextScheduledSession.time}
                    </div>
                    <div className="text-[11px] text-zinc-400">
                      With {summary.nextScheduledSession.providerName} (
                      {summary.nextScheduledSession.cptCode})
                    </div>
                  </div>
                </div>

                {summary.nextScheduledSession.isTelehealth &&
                  summary.nextScheduledSession.telehealthRoomUrl && (
                    <a
                      href={summary.nextScheduledSession.telehealthRoomUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-500/30 bg-cyan-500 px-4 py-2 text-xs font-semibold text-zinc-950 hover:bg-cyan-400 transition-colors cursor-pointer"
                    >
                      <Video className="h-3.5 w-3.5" />
                      Join Telehealth Session
                    </a>
                  )}
              </div>
            </div>
          )}

          {/* Milestone Badges & Celebrations */}
          <div className="rounded-2xl border border-white/10 bg-zinc-950/80 p-5 shadow-xl">
            <div className="flex items-center gap-2 border-b border-white/10 pb-3">
              <Award className="h-5 w-5 text-amber-400" />
              <h3 className="font-heading text-sm font-bold text-white">
                Clinical Milestones & Celebrations
              </h3>
            </div>

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              {summary.milestones.map((m) => (
                <div
                  key={m.id}
                  className="flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3.5"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/20 text-amber-300 shrink-0">
                    <Sparkles className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="font-bold text-xs text-white">{m.title}</div>
                    <p className="text-[11px] text-zinc-300 mt-0.5">{m.description}</p>
                    <span className="text-[10px] text-zinc-500 font-mono mt-1 block">
                      Achieved {m.achievedDate}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Caregiver BST Carryover Homework */}
          <div className="rounded-2xl border border-white/10 bg-zinc-950/80 p-5 shadow-xl">
            <div className="flex items-center gap-2 border-b border-white/10 pb-3">
              <BookOpen className="h-5 w-5 text-brand-orange-400" />
              <h3 className="font-heading text-sm font-bold text-white">
                Parent Guidance & Home Practice Activities
              </h3>
            </div>

            <div className="mt-4 space-y-4">
              {summary.homeworkTasks.map((hw) => (
                <div
                  key={hw.id}
                  className="rounded-xl border border-white/5 bg-zinc-900/50 p-4 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="font-bold text-sm text-white">{hw.title}</div>
                    <span className="rounded bg-brand-orange-500/20 px-2 py-0.5 text-[10px] font-semibold text-brand-orange-300 font-mono">
                      {hw.targetFrequency}
                    </span>
                  </div>

                  <div className="space-y-1.5 pl-2">
                    {hw.steps.map((step, idx) => (
                      <div key={idx} className="flex items-start gap-2 text-xs text-zinc-300">
                        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-white/10 text-[10px] font-bold text-zinc-400 shrink-0 mt-0.5">
                          {idx + 1}
                        </span>
                        <span>{step}</span>
                      </div>
                    ))}
                  </div>

                  {hw.bcbaNotes && (
                    <div className="rounded-lg bg-zinc-950/60 p-2.5 text-[11px] text-zinc-400 border border-white/5">
                      <span className="font-semibold text-zinc-300">BCBA Note:</span> {hw.bcbaNotes}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
