'use client';

import React, { useState, useEffect, useTransition } from 'react';
import {
  ShieldCheck,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Clock,
  UserCheck,
  TrendingUp,
  Users,
  Search,
  RefreshCw,
  Award,
} from 'lucide-react';
import { getSupervisionComplianceScorecard } from '@/app/actions/supervisionComplianceActions';
import type {
  MonthlySupervisionSummary,
  RbtSupervisionRow,
  ClientSupervisionRow,
} from '@/lib/supervisionCompliance';

export function SupervisionComplianceDashboard() {
  const [data, setData] = useState<
    (MonthlySupervisionSummary & { rbtRows: RbtSupervisionRow[]; clientRows: ClientSupervisionRow[] }) | null
  >(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'rbts' | 'clients'>('rbts');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [isPending, startTransition] = useTransition();

  const loadScorecard = () => {
    setLoading(true);
    startTransition(async () => {
      const res = await getSupervisionComplianceScorecard();
      if (res.success && res.scorecard) {
        setData(res.scorecard);
      }
      setLoading(false);
    });
  };

  useEffect(() => {
    let active = true;

    void getSupervisionComplianceScorecard().then((res) => {
      if (!active) return;
      if (res.success && res.scorecard) {
        setData(res.scorecard);
      }
      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, []);

  const filteredRbts = (data?.rbtRows || []).filter((rbt) => {
    const matchesSearch =
      rbt.rbtName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      rbt.supervisingBcbaNames.some((n) => n.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesStatus =
      filterStatus === 'ALL' ||
      (filterStatus === 'NON_COMPLIANT' && rbt.status === 'CRITICAL') ||
      rbt.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const filteredClients = (data?.clientRows || []).filter((client) => {
    const matchesSearch =
      client.clientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (client.bcbaName && client.bcbaName.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (client.rbtName && client.rbtName.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesStatus =
      filterStatus === 'ALL' ||
      (filterStatus === 'NON_COMPLIANT' && client.status === 'CRITICAL') ||
      client.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      {/* Header & Month Summary */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 rounded-2xl bg-[#FFFDF8] dark:bg-zinc-950/80 border border-[#E2D5B7] dark:border-white/10 backdrop-blur-xl shadow-xl relative overflow-hidden">
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-1">
            <span className="p-1.5 rounded-lg bg-orange-500/10 border border-orange-500/20 text-orange-600 dark:text-orange-400">
              <Award className="w-5 h-5" />
            </span>
            <h2 className="text-xl font-black font-heading tracking-tight text-slate-900 dark:text-white">
              Supervision Utilization Heuristic
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold bg-[#F9F5EC] dark:bg-white/5 border border-[#E2D5B7] dark:border-white/10 text-slate-700 dark:text-zinc-300">
              {data?.monthLabel || 'Current Month'}
            </span>
          </div>
          <p className="text-xs text-slate-600 dark:text-zinc-400 max-w-xl">
            CPT 97155 vs 97153 minute ratio for caseload review. This is a utilization heuristic — not BACB or Medicaid supervision compliance certification.
          </p>
        </div>

        <button
          type="button"
          onClick={loadScorecard}
          disabled={loading || isPending}
          className="self-start sm:self-center px-4 py-2 rounded-xl bg-[#F9F5EC] hover:bg-white dark:bg-white/5 dark:hover:bg-white/10 border border-[#E2D5B7] dark:border-white/10 text-xs font-mono font-bold text-slate-700 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-white transition flex items-center gap-2 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 shadow-sm"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading || isPending ? 'animate-spin' : ''}`} />
          <span>Refresh Data</span>
        </button>
      </div>

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Agency Overall Ratio */}
        <div className="p-5 rounded-2xl bg-[#FFFDF8] dark:bg-zinc-900/60 border border-[#E2D5B7] dark:border-white/10 backdrop-blur-md relative overflow-hidden shadow-md">
          <div className="flex items-center justify-between text-slate-500 dark:text-zinc-400 text-xs font-mono mb-2">
            <span>AGENCY RATIO</span>
            <TrendingUp className="w-4 h-4 text-orange-500 dark:text-orange-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black font-heading text-slate-900 dark:text-white">
              {data?.supervisionRatio != null ? `${data.supervisionRatio}%` : '—'}
            </span>
            <span className="text-xs font-mono font-bold text-slate-500 dark:text-zinc-400">/ 5.0% heuristic</span>
          </div>
          <div className="mt-3 flex items-center gap-1.5">
            {data?.isCompliant ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                <CheckCircle2 className="w-3 h-3" /> Compliant
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                <AlertTriangle className="w-3 h-3" /> Needs Attention
              </span>
            )}
            <span className="text-[11px] font-mono text-slate-500 dark:text-zinc-400">
              ({data?.daysRemainingInMonth ?? 0} days left)
            </span>
          </div>
        </div>

        {/* Metric 2: Direct Treatment Hours */}
        <div className="p-5 rounded-2xl bg-[#FFFDF8] dark:bg-zinc-900/60 border border-[#E2D5B7] dark:border-white/10 backdrop-blur-md shadow-md">
          <div className="flex items-center justify-between text-slate-500 dark:text-zinc-400 text-xs font-mono mb-2">
            <span>97153 DIRECT</span>
            <Clock className="w-4 h-4 text-blue-500 dark:text-blue-400" />
          </div>
          <div className="text-3xl font-black font-heading text-slate-900 dark:text-white">
            {data?.directHours ?? 0} <span className="text-sm font-normal text-slate-500 dark:text-zinc-400 font-mono">hrs</span>
          </div>
          <p className="mt-3 text-[11px] font-mono text-slate-500 dark:text-zinc-400">
            Across {data?.rbtCount ?? 0} active RBTs
          </p>
        </div>

        {/* Metric 3: Supervision Hours */}
        <div className="p-5 rounded-2xl bg-[#FFFDF8] dark:bg-zinc-900/60 border border-[#E2D5B7] dark:border-white/10 backdrop-blur-md shadow-md">
          <div className="flex items-center justify-between text-slate-500 dark:text-zinc-400 text-xs font-mono mb-2">
            <span>97155 SUPERVISION</span>
            <UserCheck className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
          </div>
          <div className="text-3xl font-black font-heading text-slate-900 dark:text-white">
            {data?.supervisionHours ?? 0} <span className="text-sm font-normal text-slate-500 dark:text-zinc-400 font-mono">hrs</span>
          </div>
          <p className="mt-3 text-[11px] font-mono text-slate-500 dark:text-zinc-400">
            Delivered by BCBAs this month
          </p>
        </div>

        {/* Metric 4: Hours Needed */}
        <div className="p-5 rounded-2xl bg-[#FFFDF8] dark:bg-zinc-900/60 border border-[#E2D5B7] dark:border-white/10 backdrop-blur-md shadow-md">
          <div className="flex items-center justify-between text-slate-500 dark:text-zinc-400 text-xs font-mono mb-2">
            <span>DEFICIT TO 5%</span>
            <AlertCircle className="w-4 h-4 text-amber-500 dark:text-amber-400" />
          </div>
          <div className="text-3xl font-black font-heading text-slate-900 dark:text-white">
            {data?.hoursNeededForCompliance ?? 0} <span className="text-sm font-normal text-slate-500 dark:text-zinc-400 font-mono">hrs</span>
          </div>
          <p className="mt-3 text-[11px] font-mono text-slate-500 dark:text-zinc-400">
            {data?.hoursNeededForCompliance === 0 ? 'At or above heuristic target' : 'To reach 5% heuristic target'}
          </p>
        </div>
      </div>

      {/* Tabs & Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Tab switch */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-[#F9F5EC] dark:bg-zinc-900/80 border border-[#E2D5B7] dark:border-white/10">
          <button
            type="button"
            onClick={() => setActiveTab('rbts')}
            className={`px-4 py-2 rounded-lg text-xs font-bold font-mono transition cursor-pointer flex items-center gap-2 ${
              activeTab === 'rbts'
                ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-md'
                : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white hover:bg-white dark:hover:bg-white/5'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>RBT Scorecard ({data?.rbtRows.length ?? 0})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('clients')}
            className={`px-4 py-2 rounded-lg text-xs font-bold font-mono transition cursor-pointer flex items-center gap-2 ${
              activeTab === 'clients'
                ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-md'
                : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white hover:bg-white dark:hover:bg-white/5'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Client Caseload ({data?.clientRows.length ?? 0})</span>
          </button>
        </div>

        {/* Search & Filter */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search name or BCBA..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 pr-3 py-1.5 rounded-xl bg-[#F9F5EC] dark:bg-zinc-900/80 border border-[#E2D5B7] dark:border-white/10 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:outline-none focus:border-orange-500/50 w-48 sm:w-60 font-mono"
            />
          </div>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-3 py-1.5 rounded-xl bg-[#F9F5EC] dark:bg-zinc-900/80 border border-[#E2D5B7] dark:border-white/10 text-xs text-slate-700 dark:text-zinc-300 font-mono focus:outline-none focus:border-orange-500/50 cursor-pointer"
          >
            <option value="ALL">All Statuses</option>
            <option value="NON_COMPLIANT">Under 5% (Critical)</option>
            <option value="WARNING">5% – 7% (Warning)</option>
            <option value="COMPLIANT">7%+ (Healthy)</option>
          </select>
        </div>
      </div>

      {/* RBT Scorecard Table */}
      {activeTab === 'rbts' && (
        <div className="rounded-2xl border border-[#E2D5B7] dark:border-white/10 bg-[#FFFDF8] dark:bg-zinc-950/60 overflow-hidden backdrop-blur-xl shadow-md">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F9F5EC] dark:bg-white/5 border-b border-[#E2D5B7] dark:border-white/10 text-slate-600 dark:text-zinc-400 font-mono font-bold uppercase text-[10.5px]">
                <tr>
                  <th className="px-4 py-3.5">RBT Name</th>
                  <th className="px-4 py-3.5">Assigned BCBAs</th>
                  <th className="px-4 py-3.5 text-right">Direct (97153)</th>
                  <th className="px-4 py-3.5 text-right">Supervision (97155)</th>
                  <th className="px-4 py-3.5 text-center">Ratio</th>
                  <th className="px-4 py-3.5 text-center">Status</th>
                  <th className="px-4 py-3.5 text-right">Hours Needed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2D5B7]/60 dark:divide-white/5 font-mono">
                {filteredRbts.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-slate-500 dark:text-zinc-500">
                      No RBT records found matching filters.
                    </td>
                  </tr>
                ) : (
                  filteredRbts.map((rbt) => (
                    <tr key={rbt.rbtId} className="hover:bg-[#F9F5EC]/60 dark:hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-3.5 font-bold text-slate-900 dark:text-white">
                        {rbt.rbtName}
                      </td>
                      <td className="px-4 py-3.5 text-slate-600 dark:text-zinc-400 text-[11px]">
                        {rbt.supervisingBcbaNames.join(', ') || 'Unassigned'}
                      </td>
                      <td className="px-4 py-3.5 text-right text-slate-700 dark:text-zinc-300">
                        {rbt.directHours}h
                      </td>
                      <td className="px-4 py-3.5 text-right text-slate-700 dark:text-zinc-300">
                        {rbt.supervisionHours}h
                      </td>
                      <td className="px-4 py-3.5 text-center font-bold">
                        <span
                          className={
                            rbt.status === 'CRITICAL'
                              ? 'text-rose-600 dark:text-rose-400'
                              : rbt.status === 'WARNING'
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-emerald-600 dark:text-emerald-400'
                          }
                        >
                          {rbt.ratio != null ? `${rbt.ratio}%` : '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        {rbt.status === 'CRITICAL' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                            &lt; 5.0% Critical
                          </span>
                        )}
                        {rbt.status === 'WARNING' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                            Warning (5-7%)
                          </span>
                        )}
                        {rbt.status === 'COMPLIANT' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                            Compliant
                          </span>
                        )}
                        {rbt.status === 'NO_DIRECT_HOURS' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-zinc-500/10 text-slate-500 dark:text-zinc-400 border border-zinc-500/20">
                            No Hours
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-right font-bold text-slate-700 dark:text-zinc-300">
                        {rbt.hoursNeeded > 0 ? (
                          <span className="text-rose-600 dark:text-rose-400">+{rbt.hoursNeeded}h</span>
                        ) : (
                          <span className="text-emerald-600 dark:text-emerald-400">0.0h</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Client Caseload Table */}
      {activeTab === 'clients' && (
        <div className="rounded-2xl border border-[#E2D5B7] dark:border-white/10 bg-[#FFFDF8] dark:bg-zinc-950/60 overflow-hidden backdrop-blur-xl shadow-md">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F9F5EC] dark:bg-white/5 border-b border-[#E2D5B7] dark:border-white/10 text-slate-600 dark:text-zinc-400 font-mono font-bold uppercase text-[10.5px]">
                <tr>
                  <th className="px-4 py-3.5">Client</th>
                  <th className="px-4 py-3.5">Assigned BCBA</th>
                  <th className="px-4 py-3.5">Assigned RBT</th>
                  <th className="px-4 py-3.5 text-right">Direct (97153)</th>
                  <th className="px-4 py-3.5 text-right">Supervision (97155)</th>
                  <th className="px-4 py-3.5 text-center">Ratio</th>
                  <th className="px-4 py-3.5 text-center">Status</th>
                  <th className="px-4 py-3.5 text-right">Deficit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2D5B7]/60 dark:divide-white/5 font-mono">
                {filteredClients.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-slate-500 dark:text-zinc-500">
                      No client records found matching filters.
                    </td>
                  </tr>
                ) : (
                  filteredClients.map((client) => (
                    <tr key={client.clientId} className="hover:bg-[#F9F5EC]/60 dark:hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-3.5 font-bold text-slate-900 dark:text-white">
                        {client.clientName}
                      </td>
                      <td className="px-4 py-3.5 text-slate-600 dark:text-zinc-400 text-[11px]">
                        {client.bcbaName || 'Unassigned'}
                      </td>
                      <td className="px-4 py-3.5 text-slate-600 dark:text-zinc-400 text-[11px]">
                        {client.rbtName || 'Unassigned'}
                      </td>
                      <td className="px-4 py-3.5 text-right text-slate-700 dark:text-zinc-300">
                        {client.directHours}h
                      </td>
                      <td className="px-4 py-3.5 text-right text-slate-700 dark:text-zinc-300">
                        {client.supervisionHours}h
                      </td>
                      <td className="px-4 py-3.5 text-center font-bold">
                        <span
                          className={
                            client.status === 'CRITICAL'
                              ? 'text-rose-600 dark:text-rose-400'
                              : client.status === 'WARNING'
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-emerald-600 dark:text-emerald-400'
                          }
                        >
                          {client.ratio != null ? `${client.ratio}%` : '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        {client.status === 'CRITICAL' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                            Critical
                          </span>
                        )}
                        {client.status === 'WARNING' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                            Warning
                          </span>
                        )}
                        {client.status === 'COMPLIANT' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                            Compliant
                          </span>
                        )}
                        {client.status === 'NO_DIRECT_HOURS' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-zinc-500/10 text-slate-500 dark:text-zinc-400 border border-zinc-500/20">
                            No Hours
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-right font-bold text-slate-700 dark:text-zinc-300">
                        {client.hoursNeeded > 0 ? (
                          <span className="text-rose-600 dark:text-rose-400">+{client.hoursNeeded}h</span>
                        ) : (
                          <span className="text-emerald-600 dark:text-emerald-400">0.0h</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
