'use client';

import React, { useEffect, useState, useSyncExternalStore, useTransition } from 'react';
import { createPortal } from 'react-dom';
import {
  Clock,
  RefreshCw,
  X,
} from 'lucide-react';
import { getClientAttendanceScorecard } from '@/app/actions/sessionCancellationActions';
import {
  getCancellationReasonLabel,
  type AttendanceScorecard,
  type CancellationReasonCategory,
} from '@/lib/sessionCancellationCoordinator';

interface AttendanceScorecardModalProps {
  isOpen: boolean;
  onClose: () => void;
  clientId: string;
  clientName?: string;
}

const subscribeToHydration = () => () => undefined;
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

export default function AttendanceScorecardModal({
  isOpen,
  onClose,
  clientId,
  clientName = 'Client',
}: AttendanceScorecardModalProps) {
  const mounted = useSyncExternalStore(
    subscribeToHydration,
    getClientSnapshot,
    getServerSnapshot
  );
  const [scorecard, setScorecard] = useState<AttendanceScorecard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (isOpen && clientId) {
      startTransition(async () => {
        setLoading(true);
        setError(null);
        const res = await getClientAttendanceScorecard(clientId);
        if (res.success && res.scorecard) {
          setScorecard(res.scorecard);
        } else {
          setError(res.error || 'Failed to load attendance scorecard.');
        }
        setLoading(false);
      });
    }
  }, [isOpen, clientId]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, onClose]);

  if (!isOpen || !mounted) return null;

  return createPortal(
    <div
      onClick={onClose}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="my-auto w-full max-w-xl rounded-2xl border border-white/10 bg-zinc-950 p-6 shadow-2xl backdrop-blur-xl relative"
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-white/10 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-heading text-lg font-bold text-white">
                Attendance & Cancellation Scorecard
              </h3>
              {scorecard && (
                <span
                  className={`rounded-full px-2.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider ${
                    scorecard.complianceTier === 'COMPLIANT'
                      ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                      : scorecard.complianceTier === 'MONITORING'
                      ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                      : 'bg-red-500/10 text-red-400 border border-red-500/20'
                  }`}
                >
                  {scorecard.complianceTier}
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-zinc-400">
              Attendance integrity, no-show monitoring & lost billable hours for {clientName}.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-12 text-zinc-400">
            <RefreshCw className="h-5 w-5 animate-spin text-brand-orange-500 mr-2" />
            <span className="font-mono text-xs">Computing attendance analytics...</span>
          </div>
        ) : error ? (
          <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-xs text-red-400">
            {error}
          </div>
        ) : scorecard ? (
          <div className="mt-5 space-y-5">
            {/* Top Metrics Row */}
            <div className="grid grid-cols-4 gap-3">
              <div className="rounded-xl border border-white/5 bg-zinc-900/60 p-3 text-center">
                <div className="text-[10px] uppercase font-mono tracking-wider text-zinc-500">
                  Attendance
                </div>
                <div
                  className={`mt-1 font-heading text-xl font-bold ${
                    scorecard.attendanceRatePct >= 85
                      ? 'text-green-400'
                      : scorecard.attendanceRatePct >= 70
                      ? 'text-amber-400'
                      : 'text-red-400'
                  }`}
                >
                  {scorecard.attendanceRatePct}%
                </div>
              </div>

              <div className="rounded-xl border border-white/5 bg-zinc-900/60 p-3 text-center">
                <div className="text-[10px] uppercase font-mono tracking-wider text-zinc-500">
                  Completed
                </div>
                <div className="mt-1 font-heading text-xl font-bold text-white">
                  {scorecard.completedSessions}
                </div>
              </div>

              <div className="rounded-xl border border-white/5 bg-zinc-900/60 p-3 text-center">
                <div className="text-[10px] uppercase font-mono tracking-wider text-zinc-500">
                  Cancelled
                </div>
                <div className="mt-1 font-heading text-xl font-bold text-brand-orange-400">
                  {scorecard.cancelledSessions}
                </div>
              </div>

              <div className="rounded-xl border border-white/5 bg-zinc-900/60 p-3 text-center">
                <div className="text-[10px] uppercase font-mono tracking-wider text-zinc-500">
                  No-Show
                </div>
                <div
                  className={`mt-1 font-heading text-xl font-bold ${
                    scorecard.noShowSessions > 0 ? 'text-red-400' : 'text-zinc-400'
                  }`}
                >
                  {scorecard.noShowSessions}
                </div>
              </div>
            </div>

            {/* Total Lost Hours Card */}
            <div className="flex items-center justify-between rounded-xl border border-amber-500/20 bg-amber-500/10 p-3.5 text-xs text-amber-300">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 shrink-0 text-amber-400" />
                <span>
                  Total lost billable duration from cancellations / absences:
                </span>
              </div>
              <span className="font-mono font-bold text-sm text-amber-200">
                {scorecard.totalLostHours} hrs
              </span>
            </div>

            {/* Reason Breakdown */}
            <div>
              <div className="text-xs font-semibold text-zinc-400 uppercase font-mono tracking-wider mb-2.5">
                Cancellation Driver Breakdown
              </div>
              <div className="space-y-2 font-mono text-xs">
                {(Object.entries(scorecard.reasonBreakdown) as [CancellationReasonCategory, number][])
                  .filter(([, count]) => count > 0)
                  .map(([reason, count]) => {
                    const pct = Math.round((count / (scorecard.cancelledSessions + scorecard.noShowSessions || 1)) * 100);

                    return (
                      <div
                        key={reason}
                        className="flex items-center justify-between rounded-lg bg-zinc-900/40 px-3 py-2 border border-white/5"
                      >
                        <span className="text-zinc-300 font-sans text-xs">
                          {getCancellationReasonLabel(reason)}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-white font-bold">{count}</span>
                          <span className="text-zinc-500 text-[11px]">({pct}%)</span>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        ) : null}

        {/* Footer */}
        <div className="mt-6 flex justify-end border-t border-white/10 pt-4">
          <button
            onClick={onClose}
            className="rounded-lg border border-white/10 bg-zinc-900 px-4 py-2 text-xs font-medium text-white hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            Close Scorecard
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
