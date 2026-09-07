'use client';

import React, { useEffect, useState, useTransition } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { scrubUnconvertedSessionClaims } from '@/app/actions/claimScrubberActions';
import type { ClaimScrubberBatchSummary } from '@/lib/claimScrubberEngine';

export default function ClaimScrubberDashboard() {
  const [batch, setBatch] = useState<ClaimScrubberBatchSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterMode, setFilterMode] = useState<'ALL' | 'CLEAN' | 'DEFECTIVE'>('ALL');
  const [isPending, startTransition] = useTransition();

  const loadData = () => {
    startTransition(async () => {
      setLoading(true);
      setError(null);
      const res = await scrubUnconvertedSessionClaims();
      if (res.success && res.batchSummary) {
        setBatch(res.batchSummary);
      } else {
        setError(res.error || 'Failed to scrub session claims.');
      }
      setLoading(false);
    });
  };

  useEffect(() => {
    loadData();
  }, []);

  const displayedClaims = (batch?.claims || []).filter((c) => {
    if (filterMode === 'CLEAN') return c.status === 'CLEAN';
    if (filterMode === 'DEFECTIVE') return c.status === 'DEFECTIVE';
    return true;
  });

  return (
    <div className="rounded-2xl border border-white/10 bg-zinc-950/80 p-5 shadow-2xl backdrop-blur-xl transition-all">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-green-500/20 bg-green-500/10 text-green-400">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-heading text-base font-bold text-white">
                Pre-Submission Claim Scrubber & Denial Prevention
              </h3>
              {batch && (
                <span
                  className={`rounded-full px-2.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider ${
                    batch.cleanClaimRatePct >= 95
                      ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                      : batch.cleanClaimRatePct >= 80
                      ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                      : 'bg-red-500/10 text-red-400 border border-red-500/20'
                  }`}
                >
                  {batch.cleanClaimRatePct}% First-Pass Clean Rate
                </span>
              )}
            </div>
            <p className="text-xs text-zinc-400">
              Validates prior auths, CMS POS codes, dual e-signatures, rendering NPIs, and zero deficiencies prior to claim filing.
            </p>
          </div>
        </div>

        <button
          onClick={loadData}
          disabled={isPending}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:border-white/20 hover:text-white transition-all cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isPending ? 'animate-spin' : ''}`} />
          Scrub Claims
        </button>
      </div>

      {/* Content */}
      {loading && !batch ? (
        <div className="flex items-center justify-center py-16 text-zinc-400">
          <RefreshCw className="h-6 w-6 animate-spin text-brand-orange-500 mr-2" />
          <span className="font-mono text-xs">Scrubbing claim batches against payer rules...</span>
        </div>
      ) : error ? (
        <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-xs text-red-400">
          {error}
        </div>
      ) : batch ? (
        <div className="mt-5 space-y-6">
          {/* Top Metrics Row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl border border-white/5 bg-zinc-900/60 p-3.5">
              <div className="text-[10px] uppercase font-mono tracking-wider text-zinc-500">
                Notes Scrubbed
              </div>
              <div className="mt-1 font-heading text-2xl font-bold text-white">
                {batch.totalNotesScrubbed}
              </div>
            </div>

            <div className="rounded-xl border border-white/5 bg-zinc-900/60 p-3.5">
              <div className="text-[10px] uppercase font-mono tracking-wider text-zinc-500">
                Clean Claims
              </div>
              <div className="mt-1 font-heading text-2xl font-bold text-green-400">
                {batch.cleanClaimsCount}
              </div>
            </div>

            <div className="rounded-xl border border-white/5 bg-zinc-900/60 p-3.5">
              <div className="text-[10px] uppercase font-mono tracking-wider text-zinc-500">
                Defects Flagged
              </div>
              <div
                className={`mt-1 font-heading text-2xl font-bold ${
                  batch.defectiveClaimsCount > 0 ? 'text-amber-400' : 'text-zinc-400'
                }`}
              >
                {batch.defectiveClaimsCount}
              </div>
            </div>

            <div className="rounded-xl border border-white/5 bg-zinc-900/60 p-3.5">
              <div className="text-[10px] uppercase font-mono tracking-wider text-zinc-500">
                Est. Clean Revenue
              </div>
              <div className="mt-1 font-heading text-2xl font-bold text-brand-orange-400">
                ${batch.totalEstimatedRevenue.toLocaleString()}
              </div>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setFilterMode('ALL')}
                className={`rounded-lg px-3 py-1.5 text-xs font-mono font-semibold transition-colors cursor-pointer ${
                  filterMode === 'ALL'
                    ? 'bg-white/15 text-white'
                    : 'bg-zinc-900 text-zinc-400 hover:text-white'
                }`}
              >
                All ({batch.totalNotesScrubbed})
              </button>
              <button
                onClick={() => setFilterMode('CLEAN')}
                className={`rounded-lg px-3 py-1.5 text-xs font-mono font-semibold transition-colors cursor-pointer ${
                  filterMode === 'CLEAN'
                    ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                    : 'bg-zinc-900 text-zinc-400 hover:text-white'
                }`}
              >
                Clean ({batch.cleanClaimsCount})
              </button>
              <button
                onClick={() => setFilterMode('DEFECTIVE')}
                className={`rounded-lg px-3 py-1.5 text-xs font-mono font-semibold transition-colors cursor-pointer ${
                  filterMode === 'DEFECTIVE'
                    ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                    : 'bg-zinc-900 text-zinc-400 hover:text-white'
                }`}
              >
                Defective ({batch.defectiveClaimsCount})
              </button>
            </div>
          </div>

          {/* Claims List Table */}
          <div className="overflow-x-auto">
            {displayedClaims.length === 0 ? (
              <div className="rounded-xl border border-white/5 bg-zinc-900/30 p-8 text-center text-xs text-zinc-500">
                No session notes match the selected scrub filter.
              </div>
            ) : (
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className="border-b border-white/10 text-[10px] uppercase text-zinc-400 tracking-wider">
                    <th className="pb-2 pl-1">Status</th>
                    <th className="pb-2">Client</th>
                    <th className="pb-2">DOS</th>
                    <th className="pb-2">CPT</th>
                    <th className="pb-2 text-right">Units</th>
                    <th className="pb-2 pl-4">Defects & Remediation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {displayedClaims.map((claim) => (
                    <tr key={claim.sessionId} className="hover:bg-white/[0.02] transition-colors">
                      <td className="py-3 pl-1">
                        {claim.status === 'CLEAN' ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-green-500/10 px-2 py-0.5 text-[10px] font-bold text-green-400 border border-green-500/20">
                            <CheckCircle2 className="h-3 w-3" />
                            Clean
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-400 border border-amber-500/20">
                            <AlertTriangle className="h-3 w-3" />
                            {claim.defects.length} Defect(s)
                          </span>
                        )}
                      </td>
                      <td className="py-3 font-sans font-semibold text-white">
                        {claim.clientName}
                      </td>
                      <td className="py-3 text-zinc-300">{claim.dateOfService}</td>
                      <td className="py-3 text-cyan-400 font-bold">{claim.cptCode}</td>
                      <td className="py-3 text-right font-bold text-white">
                        {claim.billableUnits} u
                      </td>
                      <td className="py-3 pl-4 font-sans text-xs">
                        {claim.defects.length === 0 ? (
                          <span className="text-green-400 text-[11px] font-mono">
                            Ready for Claim Export
                          </span>
                        ) : (
                          <div className="space-y-1">
                            {claim.defects.map((d, i) => (
                              <div key={i} className="text-[11px] text-amber-300">
                                • {d.message}{' '}
                                <span className="text-zinc-500 font-mono">
                                  ({d.remediationStep})
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
