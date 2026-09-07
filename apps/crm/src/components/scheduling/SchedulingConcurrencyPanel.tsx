'use client';

import React, { useState, useTransition } from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';
import { checkSessionSchedulingPreflight } from '@/app/actions/schedulingConcurrencyActions';
import type { ConcurrencyCheckResult } from '@/lib/schedulingConcurrencyEngine';

interface SchedulingConcurrencyPanelProps {
  clientId: string;
  clientName?: string;
  defaultRbtId?: string;
  defaultBcbaId?: string;
}

export default function SchedulingConcurrencyPanel({
  clientId,
  clientName = 'Client',
  defaultRbtId,
  defaultBcbaId,
}: SchedulingConcurrencyPanelProps) {
  const [cptCode, setCptCode] = useState('97153');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('11:00');
  const [concurrencyResult, setConcurrencyResult] = useState<ConcurrencyCheckResult | null>(null);
  const [headroomUnavailableReason, setHeadroomUnavailableReason] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handlePreflightCheck = () => {
    startTransition(async () => {
      setLoading(true);
      setError(null);

      const startIso = `${date}T${startTime}:00.000Z`;
      const endIso = `${date}T${endTime}:00.000Z`;

      const res = await checkSessionSchedulingPreflight({
        proposed: {
          id: 'temp-preview-id',
          clientId,
          cptCode,
          start: startIso,
          end: endIso,
          rbtId: defaultRbtId,
          bcbaId: defaultBcbaId,
        },
      });

      if (res.success) {
        setConcurrencyResult(res.concurrency || null);
        setHeadroomUnavailableReason(res.headroomUnavailableReason || null);
      } else {
        setError(res.error || 'Failed to check scheduling preflight.');
      }
      setLoading(false);
    });
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-zinc-950/80 p-5 shadow-2xl backdrop-blur-xl transition-all">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-500/20 bg-cyan-500/10 text-cyan-400">
            <Calendar className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-heading text-base font-bold text-white">
                Intelligent Scheduling & Concurrency Preflight
              </h3>
              <span className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-cyan-400">
                Rule Validator
              </span>
            </div>
            <p className="text-xs text-zinc-400">
              Validates double-billing prevention and concurrent 97155 supervision rules for {clientName}.
            </p>
          </div>
        </div>
      </div>

      {/* Form Controls */}
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-4 gap-3 font-mono text-xs">
        <div>
          <label className="text-[10px] text-zinc-500 uppercase">CPT Service Code</label>
          <select
            value={cptCode}
            onChange={(e) => setCptCode(e.target.value)}
            className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-white outline-none focus:border-brand-orange-500 transition-colors"
          >
            <option value="97153">97153 (Direct 1:1)</option>
            <option value="97155">97155 (Protocol Mod / Supervision)</option>
            <option value="97156">97156 (Family Guidance)</option>
            <option value="97151">97151 (Assessment)</option>
          </select>
        </div>

        <div>
          <label className="text-[10px] text-zinc-500 uppercase">Session Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-white outline-none focus:border-brand-orange-500 transition-colors"
          />
        </div>

        <div>
          <label className="text-[10px] text-zinc-500 uppercase">Start Time</label>
          <input
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-white outline-none focus:border-brand-orange-500 transition-colors"
          />
        </div>

        <div>
          <label className="text-[10px] text-zinc-500 uppercase">End Time</label>
          <input
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-white outline-none focus:border-brand-orange-500 transition-colors"
          />
        </div>
      </div>

      <div className="mt-4 flex justify-end">
        <button
          onClick={handlePreflightCheck}
          disabled={loading || isPending}
          className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-xs font-semibold text-cyan-300 hover:bg-cyan-500/20 transition-all cursor-pointer disabled:opacity-50"
        >
          <Sparkles className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Run Concurrency Preflight Check
        </button>
      </div>

      {/* Results */}
      {error && (
        <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-400">
          {error}
        </div>
      )}

      {concurrencyResult && (
        <div className="mt-4 space-y-3 font-mono text-xs">
          {/* Concurrency Verdict */}
          <div
            className={`rounded-xl border p-4 ${
              concurrencyResult.allowed
                ? concurrencyResult.classification === 'VALID_CONCURRENT_SUPERVISION'
                  ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300'
                  : concurrencyResult.classification === 'TRAVEL_BUFFER_WARNING'
                  ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                  : 'border-green-500/30 bg-green-500/10 text-green-300'
                : 'border-red-500/30 bg-red-500/10 text-red-300'
            }`}
          >
            <div className="flex items-center gap-2 font-bold font-sans">
              {concurrencyResult.allowed ? (
                <CheckCircle2 className="h-4 w-4 shrink-0" />
              ) : (
                <AlertOctagon className="h-4 w-4 shrink-0 text-red-400" />
              )}
              <span>
                Concurrency Status: {concurrencyResult.classification.replace(/_/g, ' ')}
              </span>
            </div>
            {concurrencyResult.conflictDetails && (
              <p className="mt-1 text-[11px] opacity-90">{concurrencyResult.conflictDetails}</p>
            )}
          </div>

          {headroomUnavailableReason && (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 text-amber-300">
              <div className="flex items-center gap-2 font-sans font-semibold">
                <AlertTriangle className="h-4 w-4" />
                Authorization headroom requires manual review
              </div>
              <p className="mt-1 text-[11px] text-amber-200/80">{headroomUnavailableReason}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
