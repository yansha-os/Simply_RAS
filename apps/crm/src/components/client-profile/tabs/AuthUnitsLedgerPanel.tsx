'use client';

import React, { useCallback, useEffect, useState, useTransition } from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  Calendar,
  Layers,
  RefreshCw,
} from 'lucide-react';
import { getClientAuthLedgers } from '@/app/actions/authCptLedgerActions';
import type { AuthCptLedgerSummary } from '@/lib/authCptLedger';

interface AuthUnitsLedgerPanelProps {
  clientId: string;
}

export default function AuthUnitsLedgerPanel({ clientId }: AuthUnitsLedgerPanelProps) {
  const [ledgers, setLedgers] = useState<AuthCptLedgerSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const loadData = useCallback(() => {
    startTransition(async () => {
      setLoading(true);
      setError(null);
      const res = await getClientAuthLedgers(clientId);
      if (res.success && res.ledgers) {
        setLedgers(res.ledgers);
      } else {
        setError(res.error || 'Failed to load CPT authorization ledgers.');
      }
      setLoading(false);
    });
  }, [clientId]);

  useEffect(() => {
    if (clientId) {
      loadData();
    }
  }, [clientId, loadData]);

  if (loading && ledgers.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-zinc-950/80 p-8 backdrop-blur-xl">
        <div className="flex items-center justify-center text-zinc-400">
          <RefreshCw className="h-6 w-6 animate-spin text-brand-orange-500 mr-3" />
          <span className="font-mono text-sm">Computing real-time CPT ledgers &amp; burn rates...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-red-400">
        <div className="flex items-center gap-2 font-semibold">
          <AlertOctagon className="h-5 w-5" />
          <span>CPT Ledger Error</span>
        </div>
        <p className="mt-1 text-xs">{error}</p>
        <button
          onClick={loadData}
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/20 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-500/30 cursor-pointer"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Retry
        </button>
      </div>
    );
  }

  if (ledgers.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-zinc-950/60 p-8 text-center backdrop-blur-xl">
        <Layers className="mx-auto h-8 w-8 text-zinc-600 mb-2" />
        <h4 className="text-sm font-semibold text-white">No Authorizations Found</h4>
        <p className="mt-1 text-xs text-zinc-400">
          This client does not have any active or historical prior authorizations recorded.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-white flex items-center gap-2">
            <Layers className="h-4 w-4 text-brand-orange-500" />
            Multi-Payer Prior Authorization & CPT Ledgers
          </h3>
          <p className="text-xs text-zinc-400">
            Real-time CPT unit burndown tracking (authorized vs scheduled vs rendered vs converted) with burn rate forecasting.
          </p>
        </div>
        <button
          onClick={loadData}
          disabled={isPending}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:border-white/20 hover:text-white transition-all cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isPending ? 'animate-spin' : ''}`} />
          Refresh Ledger
        </button>
      </div>

      {/* Ledgers List */}
      {ledgers.map((ledger) => {
        const isExpiring = ledger.daysRemaining !== null && ledger.daysRemaining <= 30;
        const isHighUtil = ledger.overallUtilizationRate >= 0.8;

        return (
          <div
            key={ledger.authorizationId}
            className="rounded-2xl border border-white/10 bg-zinc-950/80 p-5 shadow-2xl backdrop-blur-xl transition-all"
          >
            {/* Ledger Top Summary */}
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/10 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-heading text-base font-bold text-white">
                    {ledger.authNumber ? `Auth #${ledger.authNumber}` : 'Prior Authorization'}
                  </span>
                  <span className="rounded-full border border-brand-orange-500/20 bg-brand-orange-500/10 px-2.5 py-0.5 font-mono text-[10px] font-semibold text-brand-orange-400">
                    {ledger.authType}
                  </span>
                  {ledger.reAuthRecommended && (
                    <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-0.5 font-mono text-[10px] font-semibold text-amber-400 animate-pulse">
                      Re-Auth Triggered
                    </span>
                  )}
                </div>
                <div className="mt-1 flex items-center gap-3 text-xs text-zinc-400">
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5 text-zinc-500" />
                    {ledger.startDate ? ledger.startDate.split('T')[0] : '—'} →{' '}
                    {ledger.endDate ? ledger.endDate.split('T')[0] : '—'}
                  </span>
                  {ledger.daysRemaining !== null && (
                    <span
                      className={`font-mono font-medium ${
                        isExpiring ? 'text-red-400 font-bold' : 'text-zinc-400'
                      }`}
                    >
                      ({ledger.daysRemaining} days remaining)
                    </span>
                  )}
                </div>
              </div>

              {/* Aggregated Totals Card */}
              <div className="flex items-center gap-6 rounded-xl border border-white/5 bg-zinc-900/60 px-4 py-2">
                <div>
                  <div className="text-[10px] uppercase font-mono tracking-wider text-zinc-500">
                    Authorized
                  </div>
                  <div className="font-mono text-sm font-bold text-white">
                    {ledger.totalAuthorizedUnits} u
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase font-mono tracking-wider text-zinc-500">
                    Rendered
                  </div>
                  <div className="font-mono text-sm font-bold text-brand-orange-400">
                    {ledger.totalRenderedUnits} u
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase font-mono tracking-wider text-zinc-500">
                    Remaining
                  </div>
                  <div
                    className={`font-mono text-sm font-bold ${
                      ledger.totalRemainingUnits === 0
                        ? 'text-red-400'
                        : isHighUtil
                        ? 'text-amber-400'
                        : 'text-green-400'
                    }`}
                  >
                    {ledger.totalRemainingUnits} u
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase font-mono tracking-wider text-zinc-500">
                    Utilization
                  </div>
                  <div className="font-mono text-sm font-bold text-white">
                    {Math.round(ledger.overallUtilizationRate * 100)}%
                  </div>
                </div>
              </div>
            </div>

            {/* Active Alerts */}
            {ledger.alerts.length > 0 && (
              <div className="mt-4 space-y-2">
                {ledger.alerts.map((alert, idx) => (
                  <div
                    key={idx}
                    className={`flex items-start gap-2.5 rounded-xl border p-3 text-xs ${
                      alert.severity === 'CRITICAL'
                        ? 'border-red-500/30 bg-red-500/10 text-red-300'
                        : alert.severity === 'WARNING'
                        ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                        : 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300'
                    }`}
                  >
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-semibold">{alert.message}</div>
                      <div className="mt-0.5 text-[11px] opacity-80">
                        {alert.actionRecommendation}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* CPT Codes Matrix Table */}
            <div className="mt-5 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-white/10 font-mono uppercase tracking-wider text-zinc-400 text-[10px]">
                    <th className="pb-2 pl-1">CPT Code</th>
                    <th className="pb-2">Description</th>
                    <th className="pb-2 text-right">Auth</th>
                    <th className="pb-2 text-right">Sched</th>
                    <th className="pb-2 text-right">Rendered</th>
                    <th className="pb-2 text-right">Billed</th>
                    <th className="pb-2 text-right">Remaining</th>
                    <th className="pb-2 text-right">Burn Rate</th>
                    <th className="pb-2 text-right">Exhaustion</th>
                    <th className="pb-2 text-right pr-1">Health</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 font-mono">
                  {ledger.cptLines.map((line) => {
                    const pct = Math.round(line.utilizationRate * 100);

                    return (
                      <tr key={line.cptCode} className="hover:bg-white/[0.02] transition-colors">
                        <td className="py-3 pl-1 font-bold text-white flex items-center gap-1.5">
                          <span className="rounded bg-white/10 px-1.5 py-0.5 text-zinc-200">
                            {line.cptCode}
                          </span>
                        </td>
                        <td className="py-3 text-zinc-300 font-sans text-xs max-w-[200px] truncate">
                          {line.serviceDescription}
                        </td>
                        <td className="py-3 text-right font-medium text-white">
                          {line.authorizedUnits}
                        </td>
                        <td className="py-3 text-right text-zinc-400">
                          {line.scheduledUnits}
                        </td>
                        <td className="py-3 text-right font-medium text-brand-orange-400">
                          {line.renderedUnits}
                        </td>
                        <td className="py-3 text-right text-cyan-400">
                          {line.convertedUnits}
                        </td>
                        <td
                          className={`py-3 text-right font-bold ${
                            line.remainingUnits === 0
                              ? 'text-red-400'
                              : pct >= 80
                              ? 'text-amber-400'
                              : 'text-green-400'
                          }`}
                        >
                          {line.remainingUnits}
                        </td>
                        <td className="py-3 text-right text-zinc-300">
                          {line.weeklyBurnRateUnits} u/wk
                        </td>
                        <td className="py-3 text-right text-zinc-400 text-[11px]">
                          {line.projectedExhaustionDate || '—'}
                        </td>
                        <td className="py-3 text-right pr-1">
                          <span
                            className={`inline-block rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                              line.utilizationHealth === 'EXHAUSTED'
                                ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                                : line.utilizationHealth === 'CRITICAL_BURN'
                                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                : line.utilizationHealth === 'UNDERUTILIZED'
                                ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                                : 'bg-green-500/20 text-green-400 border border-green-500/30'
                            }`}
                          >
                            {line.utilizationHealth}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}
