'use client';

import React, { useCallback, useEffect, useState, useTransition } from 'react';
import {
  Calendar,
  RefreshCw,
  Sliders,
} from 'lucide-react';
import { getClientProtocolModifications } from '@/app/actions/protocolModificationActions';

interface ProtocolModificationCardProps {
  clientId: string;
  clientName?: string;
}

export default function ProtocolModificationCard({
  clientId,
  clientName = 'Client',
}: ProtocolModificationCardProps) {
  const [modifications, setModifications] = useState<
    Array<{
      sessionId: string;
      date: string;
      bcbaName: string;
      modality: string;
      rbtName: string | null;
      fidelityScore: number | null;
      modificationsCount: number;
    }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const loadData = useCallback(() => {
    startTransition(async () => {
      setLoading(true);
      setError(null);
      const res = await getClientProtocolModifications(clientId);
      if (res.success && res.modifications) {
        setModifications(res.modifications);
      } else {
        setError(res.error || 'Failed to load protocol modifications.');
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
    <div className="rounded-2xl border border-white/10 bg-zinc-950/80 p-5 shadow-2xl backdrop-blur-xl transition-all">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-brand-orange-500/20 bg-brand-orange-500/10 text-brand-orange-400">
            <Sliders className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-heading text-base font-bold text-white">
                Protocol Modification & Clinical Supervision (97155)
              </h3>
              <span className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-cyan-400">
                BCBA Supervisory
              </span>
            </div>
            <p className="text-xs text-zinc-400">
              Direct treatment protocol adjustments, RBT procedural fidelity checks & clinical supervision logs.
            </p>
          </div>
        </div>

        <button
          onClick={loadData}
          disabled={isPending}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:border-white/20 hover:text-white transition-all cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isPending ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-10 text-zinc-400">
          <RefreshCw className="h-5 w-5 animate-spin text-brand-orange-500 mr-2" />
          <span className="font-mono text-xs">Loading 97155 supervisory logs...</span>
        </div>
      ) : error ? (
        <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-xs text-red-400">
          {error}
        </div>
      ) : modifications.length === 0 ? (
        <div className="mt-4 rounded-xl border border-white/5 bg-zinc-900/30 p-8 text-center text-xs text-zinc-500">
          No completed 97155 protocol modification sessions recorded for {clientName}.
        </div>
      ) : (
        <div className="mt-4 divide-y divide-white/5 font-mono text-xs">
          {modifications.map((m) => (
            <div key={m.sessionId} className="flex items-center justify-between py-3">
              <div>
                <div className="flex items-center gap-2">
                  <Calendar className="h-3.5 w-3.5 text-zinc-500" />
                  <span className="text-white font-bold">{m.date}</span>
                  <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-zinc-300">
                    {m.modality.replace(/_/g, ' ')}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-3 text-[11px] text-zinc-400 font-sans">
                  <span>BCBA: {m.bcbaName}</span>
                  {m.rbtName && <span>· Supervised RBT: {m.rbtName}</span>}
                </div>
              </div>

              <div className="text-right">
                <div className="text-brand-orange-400 font-bold">
                  {m.modificationsCount} Protocol Mod(s)
                </div>
                {m.fidelityScore !== null && (
                  <div className="text-[11px] text-green-400">
                    RBT Fidelity: {m.fidelityScore}%
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
