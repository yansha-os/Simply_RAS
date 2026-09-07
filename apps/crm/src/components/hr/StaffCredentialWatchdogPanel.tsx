'use client';

import React, { useEffect, useState, useTransition } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  FileBadge,
  RefreshCw,
} from 'lucide-react';
import { getAgencyCredentialScorecard } from '@/app/actions/staffCredentialWatchdogActions';
import type { CredentialRosterScorecard } from '@/lib/staffCredentialWatchdog';

export default function StaffCredentialWatchdogPanel() {
  const [scorecard, setScorecard] = useState<CredentialRosterScorecard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const loadData = () => {
    startTransition(async () => {
      setLoading(true);
      setError(null);
      const res = await getAgencyCredentialScorecard();
      if (res.success && res.scorecard) {
        setScorecard(res.scorecard);
      } else {
        setError(res.error || 'Failed to load staff credential scorecard.');
      }
      setLoading(false);
    });
  };

  useEffect(() => {
    loadData();
  }, []);

  return (
    <div className="rounded-2xl border border-white/10 bg-zinc-950/80 p-5 shadow-2xl backdrop-blur-xl transition-all">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-brand-orange-500/20 bg-brand-orange-500/10 text-brand-orange-400">
            <FileBadge className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-heading text-base font-bold text-white">
                Staff Credential & Payer Credentialing Watchdog
              </h3>
              {scorecard && (
                <span
                  className={`rounded-full px-2.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider ${
                    scorecard.complianceRatePct >= 90
                      ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                      : scorecard.complianceRatePct >= 75
                      ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                      : 'bg-red-500/10 text-red-400 border border-red-500/20'
                  }`}
                >
                  {scorecard.complianceRatePct}% Compliance Rate
                </span>
              )}
            </div>
            <p className="text-xs text-zinc-400">
              Real-time expiration watchdog for NPI, CAQH, BACB licenses, Medicaid provider IDs & CPR certifications.
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
      {loading && !scorecard ? (
        <div className="flex items-center justify-center py-12 text-zinc-400">
          <RefreshCw className="h-5 w-5 animate-spin text-brand-orange-500 mr-2" />
          <span className="font-mono text-xs">Auditing provider credential files...</span>
        </div>
      ) : error ? (
        <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-xs text-red-400">
          {error}
        </div>
      ) : scorecard ? (
        <div className="mt-5 space-y-5">
          {/* Top Metrics Row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl border border-white/5 bg-zinc-900/60 p-3.5">
              <div className="text-[10px] uppercase font-mono tracking-wider text-zinc-500">
                Active Staff
              </div>
              <div className="mt-1 font-heading text-2xl font-bold text-white">
                {scorecard.totalStaff}
              </div>
            </div>

            <div className="rounded-xl border border-white/5 bg-zinc-900/60 p-3.5">
              <div className="text-[10px] uppercase font-mono tracking-wider text-zinc-500">
                Fully Cleared
              </div>
              <div className="mt-1 font-heading text-2xl font-bold text-green-400">
                {scorecard.fullyCredentialedStaffCount}
              </div>
            </div>

            <div className="rounded-xl border border-white/5 bg-zinc-900/60 p-3.5">
              <div className="text-[10px] uppercase font-mono tracking-wider text-zinc-500">
                Expiring (≤30 Days)
              </div>
              <div
                className={`mt-1 font-heading text-2xl font-bold ${
                  scorecard.expiringSoonCount > 0 ? 'text-amber-400' : 'text-zinc-400'
                }`}
              >
                {scorecard.expiringSoonCount}
              </div>
            </div>

            <div className="rounded-xl border border-white/5 bg-zinc-900/60 p-3.5">
              <div className="text-[10px] uppercase font-mono tracking-wider text-zinc-500">
                Expired / Incomplete
              </div>
              <div
                className={`mt-1 font-heading text-2xl font-bold ${
                  scorecard.expiredCount > 0 ? 'text-red-400' : 'text-zinc-400'
                }`}
              >
                {scorecard.expiredCount}
              </div>
            </div>
          </div>

          {/* Urgent Expiration Alerts */}
          {scorecard.urgentAlerts.length > 0 ? (
            <div className="space-y-2">
              <div className="text-xs font-semibold text-amber-400 uppercase font-mono tracking-wider flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5" />
                Urgent Expiration Alerts (Action Required Within 30 Days)
              </div>
              <div className="space-y-2">
                {scorecard.urgentAlerts.map((alert, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs"
                  >
                    <div>
                      <span className="font-bold text-white font-sans">{alert.staffName}</span>
                      <span className="text-amber-300 ml-2 font-mono">
                        {alert.credentialType} expires on {alert.expirationDate}
                      </span>
                    </div>
                    <span className="rounded-full bg-amber-500/20 px-2 py-0.5 font-mono text-[10px] font-bold text-amber-300">
                      {alert.daysRemaining} days left
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-3.5 text-xs text-green-300 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-400 shrink-0" />
              <span>All staff credentials and licenses are current with zero urgent 30-day expirations.</span>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
