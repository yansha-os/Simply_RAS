'use client';

import React, { useCallback, useEffect, useState, useTransition } from 'react';
import {
  CheckCircle2,
  Navigation,
  RefreshCw,
} from 'lucide-react';
import { verifySessionEvvGeofence } from '@/app/actions/evvGeofenceActions';
import type { EvvVerificationResult } from '@/lib/evvGeofenceEngine';

interface EvvGeofenceAuditPanelProps {
  sessionId: string;
  clientName?: string;
}

export default function EvvGeofenceAuditPanel({
  sessionId,
  clientName = 'Client',
}: EvvGeofenceAuditPanelProps) {
  const [result, setResult] = useState<EvvVerificationResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const loadData = useCallback(() => {
    startTransition(async () => {
      setLoading(true);
      setError(null);
      const res = await verifySessionEvvGeofence(sessionId);
      if (res.success && res.result) {
        setResult(res.result);
      } else {
        setError(res.error || 'Failed to verify EVV geofence.');
      }
      setLoading(false);
    });
  }, [sessionId]);

  useEffect(() => {
    if (sessionId) {
      loadData();
    }
  }, [loadData, sessionId]);

  return (
    <div className="rounded-2xl border border-white/10 bg-zinc-950/80 p-5 shadow-2xl backdrop-blur-xl transition-all">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-400">
            <Navigation className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-heading text-base font-bold text-white">
                EVV Geofence & Telemetry Audit
              </h3>
              {result && (
                <span
                  className={`rounded-full px-2.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider ${
                    result.isCompliant
                      ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                      : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                  }`}
                >
                  {result.isCompliant ? 'Within geofence radius' : 'Geofence flagged'}
                </span>
              )}
            </div>
            <p className="text-xs text-zinc-400">
              500-foot GPS radius verification & State Aggregator (HHAeXchange / Sandata) export readiness for {clientName}.
            </p>
          </div>
        </div>

        <button
          onClick={loadData}
          disabled={isPending}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:border-white/20 hover:text-white transition-all cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isPending ? 'animate-spin' : ''}`} />
          Verify
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-10 text-zinc-400">
          <RefreshCw className="h-5 w-5 animate-spin text-emerald-500 mr-2" />
          <span className="font-mono text-xs">Auditing GPS check-in telemetry...</span>
        </div>
      ) : error ? (
        <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-400">
          {error}
        </div>
      ) : result ? (
        <div className="mt-4 space-y-4 font-mono text-xs">
          {/* Telemetry Status Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-xl border border-white/5 bg-zinc-900/60 p-3.5">
              <div className="text-[10px] text-zinc-500 uppercase">Check-In Telemetry</div>
              <div className="mt-1 flex items-center justify-between">
                <span className="font-sans font-semibold text-white">
                  {result.checkInStatus.replace(/_/g, ' ')}
                </span>
                {result.checkInDistanceFeet !== null && (
                  <span className="text-emerald-400 font-bold">
                    {result.checkInDistanceFeet} ft
                  </span>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-white/5 bg-zinc-900/60 p-3.5">
              <div className="text-[10px] text-zinc-500 uppercase">Check-Out Telemetry</div>
              <div className="mt-1 flex items-center justify-between">
                <span className="font-sans font-semibold text-white">
                  {result.checkOutStatus.replace(/_/g, ' ')}
                </span>
                {result.checkOutDistanceFeet !== null && (
                  <span className="text-emerald-400 font-bold">
                    {result.checkOutDistanceFeet} ft
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Audit Notes */}
          <div className="rounded-xl border border-white/5 bg-zinc-900/40 p-3 space-y-1">
            <div className="text-[10px] uppercase text-zinc-400 font-bold font-sans">
              Geofence Verification Notes
            </div>
            {result.telemetryNotes.map((note, idx) => (
              <div key={idx} className="flex items-center gap-2 text-zinc-300 text-[11px]">
                <CheckCircle2 className="h-3 w-3 text-emerald-400 shrink-0" />
                <span>{note}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
