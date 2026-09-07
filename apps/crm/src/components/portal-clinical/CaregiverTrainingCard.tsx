'use client';

import React, { useCallback, useEffect, useState, useTransition } from 'react';
import {
  Calendar,
  CheckCircle2,
  GraduationCap,
  HeartHandshake,
  RefreshCw,
} from 'lucide-react';
import { getCaregiverTrainingSummary } from '@/app/actions/caregiverTrainingActions';
import type { CaregiverFidelityTrend } from '@/lib/caregiverTrainingEngine';

interface CaregiverTrainingCardProps {
  clientId: string;
  clientName?: string;
}

export default function CaregiverTrainingCard({
  clientId,
  clientName = 'Client',
}: CaregiverTrainingCardProps) {
  const [trend, setTrend] = useState<CaregiverFidelityTrend | null>(null);
  const [recentNotes, setRecentNotes] = useState<
    Array<{
      sessionId: string;
      date: string;
      fidelityScore: number;
      minutes: number;
      signerName: string | null;
    }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  const loadData = useCallback(() => {
    startTransition(async () => {
      setLoading(true);
      const res = await getCaregiverTrainingSummary(clientId);
      if (res.success && res.trend) {
        setTrend(res.trend);
        setRecentNotes(res.recentNotes || []);
      }
      setLoading(false);
    });
  }, [clientId]);

  useEffect(() => {
    if (clientId) {
      loadData();
    }
  }, [clientId, loadData]);

  if (loading && !trend) {
    return (
      <div className="flex items-center justify-center p-8 text-zinc-400">
        <RefreshCw className="h-5 w-5 animate-spin text-brand-orange-500 mr-2" />
        <span className="font-mono text-xs">Loading 97156 Caregiver Guidance history...</span>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[#E2D5B7] dark:border-white/10 bg-[#FFFDF8] dark:bg-zinc-950/80 p-5 shadow-xl backdrop-blur-xl transition-all">
      {/* Top Header */}
      <div className="flex items-center justify-between border-b border-[#E2D5B7] dark:border-white/10 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-brand-orange-500/20 bg-brand-orange-500/10 text-brand-orange-600 dark:text-brand-orange-400">
            <HeartHandshake className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-heading text-base font-bold text-slate-900 dark:text-white">
                Caregiver Training & Family Guidance (97156)
              </h3>
              <span className="rounded-full border border-green-500/20 bg-green-500/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-green-600 dark:text-green-400">
                BST Standard
              </span>
            </div>
            <p className="text-xs text-slate-600 dark:text-zinc-400">
              Behavioral Skills Training (Instruction · Modeling · Rehearsal · Feedback) & parent fidelity metrics.
            </p>
          </div>
        </div>

        <button
          onClick={loadData}
          disabled={isPending}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[#E2D5B7] dark:border-white/10 bg-[#F9F5EC] dark:bg-zinc-900 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-zinc-300 hover:border-orange-300 hover:text-slate-900 dark:hover:border-white/20 dark:hover:text-white transition-all cursor-pointer disabled:opacity-50 shadow-sm"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isPending ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Metrics Row */}
      {trend && (
        <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-xl border border-[#E2D5B7] dark:border-white/5 bg-[#F9F5EC] dark:bg-zinc-900/60 p-3.5 shadow-sm">
            <div className="text-[10px] uppercase font-mono tracking-wider text-slate-500 dark:text-zinc-500">
              Avg Fidelity
            </div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="font-heading text-2xl font-bold text-slate-900 dark:text-white">
                {trend.averageFidelity}%
              </span>
              <span
                className={`font-mono text-xs font-semibold ${
                  trend.fidelityTrajectory === 'IMPROVING'
                    ? 'text-green-600 dark:text-green-400'
                    : trend.fidelityTrajectory === 'DECLINING'
                    ? 'text-rose-600 dark:text-red-400'
                    : 'text-slate-600 dark:text-zinc-400'
                }`}
              >
                {trend.fidelityTrajectory === 'IMPROVING' ? '↑ Rising' : '→ Stable'}
              </span>
            </div>
          </div>

          <div className="rounded-xl border border-[#E2D5B7] dark:border-white/5 bg-[#F9F5EC] dark:bg-zinc-900/60 p-3.5 shadow-sm">
            <div className="text-[10px] uppercase font-mono tracking-wider text-slate-500 dark:text-zinc-500">
              Training Hours
            </div>
            <div className="mt-1 font-heading text-2xl font-bold text-brand-orange-600 dark:text-brand-orange-400">
              {(trend.totalTrainingMinutes / 60).toFixed(1)} hrs
            </div>
          </div>

          <div className="rounded-xl border border-[#E2D5B7] dark:border-white/5 bg-[#F9F5EC] dark:bg-zinc-900/60 p-3.5 shadow-sm">
            <div className="text-[10px] uppercase font-mono tracking-wider text-slate-500 dark:text-zinc-500">
              Mastered Goals
            </div>
            <div className="mt-1 font-heading text-2xl font-bold text-green-600 dark:text-green-400">
              {trend.masteredGoalsCount}
            </div>
          </div>

          <div className="rounded-xl border border-[#E2D5B7] dark:border-white/5 bg-[#F9F5EC] dark:bg-zinc-900/60 p-3.5 shadow-sm">
            <div className="text-[10px] uppercase font-mono tracking-wider text-slate-500 dark:text-zinc-500">
              Active Goals
            </div>
            <div className="mt-1 font-heading text-2xl font-bold text-cyan-600 dark:text-cyan-400">
              {trend.activeGoalsCount}
            </div>
          </div>
        </div>
      )}

      {/* BST Standard Explanation */}
      <div className="mt-4 rounded-xl border border-[#E2D5B7] dark:border-white/5 bg-[#F9F5EC]/80 dark:bg-zinc-900/40 p-3.5 text-xs text-slate-700 dark:text-zinc-300">
        <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5 mb-2">
          <GraduationCap className="h-4 w-4 text-brand-orange-500" />
          4-Stage Behavioral Skills Training (BST) Protocol
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-[11px]">
          <div className="rounded-lg bg-white dark:bg-zinc-950/60 p-2 border border-[#E2D5B7] dark:border-white/5 shadow-sm">
            <span className="text-brand-orange-600 dark:text-brand-orange-400 font-bold">1. Instruction</span>
            <p className="text-[10px] text-slate-500 dark:text-zinc-400 font-sans mt-0.5">Rationale & protocol review</p>
          </div>
          <div className="rounded-lg bg-white dark:bg-zinc-950/60 p-2 border border-[#E2D5B7] dark:border-white/5 shadow-sm">
            <span className="text-cyan-600 dark:text-cyan-400 font-bold">2. Modeling</span>
            <p className="text-[10px] text-slate-500 dark:text-zinc-400 font-sans mt-0.5">BCBA live demonstration</p>
          </div>
          <div className="rounded-lg bg-white dark:bg-zinc-950/60 p-2 border border-[#E2D5B7] dark:border-white/5 shadow-sm">
            <span className="text-amber-600 dark:text-amber-400 font-bold">3. Rehearsal</span>
            <p className="text-[10px] text-slate-500 dark:text-zinc-400 font-sans mt-0.5">Caregiver hands-on practice</p>
          </div>
          <div className="rounded-lg bg-white dark:bg-zinc-950/60 p-2 border border-[#E2D5B7] dark:border-white/5 shadow-sm">
            <span className="text-green-600 dark:text-green-400 font-bold">4. Feedback</span>
            <p className="text-[10px] text-slate-500 dark:text-zinc-400 font-sans mt-0.5">Positive praise & coaching</p>
          </div>
        </div>
      </div>

      {/* Recent 97156 Sessions */}
      <div className="mt-5">
        <div className="text-xs font-semibold text-slate-500 dark:text-zinc-400 uppercase font-mono tracking-wider mb-2">
          Recent Caregiver Guidance Notes
        </div>
        {recentNotes.length === 0 ? (
          <div className="rounded-xl border border-[#E2D5B7] dark:border-white/5 bg-[#F9F5EC] dark:bg-zinc-900/30 p-6 text-center text-xs text-slate-500 dark:text-zinc-500">
            No completed 97156 sessions recorded yet for {clientName}.
          </div>
        ) : (
          <div className="divide-y divide-[#E2D5B7]/60 dark:divide-white/5 font-mono text-xs">
            {recentNotes.map((note) => (
              <div key={note.sessionId} className="flex items-center justify-between py-2.5">
                <div className="flex items-center gap-3">
                  <Calendar className="h-3.5 w-3.5 text-slate-400 dark:text-zinc-500" />
                  <span className="text-slate-900 dark:text-white">{note.date.split('T')[0]}</span>
                  <span className="text-slate-500 dark:text-zinc-400">({note.minutes} mins)</span>
                  {note.signerName && (
                    <span className="text-[11px] text-slate-500 dark:text-zinc-500 font-sans">
                      BCBA: {note.signerName}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-brand-orange-600 dark:text-brand-orange-400">
                    {note.fidelityScore}% Fidelity
                  </span>
                  <span className="inline-flex items-center gap-1 text-[11px] text-green-600 dark:text-green-400 font-sans">
                    <CheckCircle2 className="h-3 w-3" />
                    Signed
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
