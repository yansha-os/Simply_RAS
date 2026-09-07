'use client';

import React, { useCallback, useEffect, useState, useTransition } from 'react';
import {
  CheckCircle2,
  Download,
  Filter,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { exportAuditVaultReport, queryAuditVault } from '@/app/actions/auditVaultActions';
import type { AuditVaultRecord, HashChainVerificationResult } from '@/lib/auditVaultInspector';

export default function AuditLogVaultViewer() {
  const [records, setRecords] = useState<AuditVaultRecord[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [hashVerification, setHashVerification] = useState<HashChainVerificationResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Filters
  const [actionFilter, setActionFilter] = useState<string>('');
  const [resourceFilter, setResourceFilter] = useState<string>('');

  const loadData = useCallback(() => {
    startTransition(async () => {
      setLoading(true);
      setError(null);
      const res = await queryAuditVault({
        action: actionFilter || undefined,
        resourceType: resourceFilter || undefined,
        limit: 50,
      });

      if (res.success && res.records) {
        setRecords(res.records);
        setTotalCount(res.totalCount || 0);
        setHashVerification(res.hashVerification || null);
      } else {
        setError(res.error || 'Failed to load audit logs.');
      }
      setLoading(false);
    });
  }, [actionFilter, resourceFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleExportCsv = async () => {
    const res = await exportAuditVaultReport({
      action: actionFilter || undefined,
      resourceType: resourceFilter || undefined,
    });

    if (res.success && res.csvData) {
      const blob = new Blob([res.csvData], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `audit_vault_export_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  return (
    <div className="rounded-2xl border border-[#E2D5B7] dark:border-white/10 bg-[#FFFDF8] dark:bg-zinc-950/80 p-5 shadow-xl backdrop-blur-xl transition-all">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#E2D5B7] dark:border-white/10 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-green-500/20 bg-green-500/10 text-green-600 dark:text-green-400">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-heading text-base font-bold text-slate-900 dark:text-white">
                Audit Log Vault Inspector
              </h3>
              {hashVerification?.verified && (
                <span className="inline-flex items-center gap-1 rounded-full border border-green-500/20 bg-green-500/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-green-600 dark:text-green-400">
                  <CheckCircle2 className="h-3 w-3" />
                  SHA-256 Hash Chain Verified
                </span>
              )}
            </div>
            <p className="text-xs text-slate-600 dark:text-zinc-400">
              Immutable audit trail of PHI views, signatures, exports, and status transitions with automatic PII redaction.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCsv}
            disabled={records.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#E2D5B7] dark:border-white/10 bg-[#F9F5EC] dark:bg-zinc-900 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-zinc-200 hover:bg-white dark:hover:bg-zinc-800 transition-colors cursor-pointer disabled:opacity-50 shadow-sm"
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </button>
          <button
            onClick={loadData}
            disabled={isPending}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#E2D5B7] dark:border-white/10 bg-[#F9F5EC] dark:bg-zinc-900 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-zinc-300 hover:border-orange-300 hover:text-slate-900 dark:hover:border-white/20 dark:hover:text-white transition-all cursor-pointer disabled:opacity-50 shadow-sm"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isPending ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-zinc-400 font-mono">
          <Filter className="h-3.5 w-3.5" />
          Filter:
        </div>

        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="rounded-lg border border-[#E2D5B7] dark:border-white/10 bg-white dark:bg-zinc-900 px-3 py-1.5 text-xs text-slate-900 dark:text-zinc-200 font-mono focus:outline-none focus:border-brand-orange-500/50 cursor-pointer shadow-sm"
        >
          <option value="">All Actions</option>
          <option value="VIEW">VIEW</option>
          <option value="SIGN">SIGN</option>
          <option value="EXPORT">EXPORT</option>
          <option value="EDIT">EDIT</option>
          <option value="CONVERT">CONVERT</option>
          <option value="DELETE">DELETE</option>
        </select>

        <select
          value={resourceFilter}
          onChange={(e) => setResourceFilter(e.target.value)}
          className="rounded-lg border border-[#E2D5B7] dark:border-white/10 bg-white dark:bg-zinc-900 px-3 py-1.5 text-xs text-slate-900 dark:text-zinc-200 font-mono focus:outline-none focus:border-brand-orange-500/50 cursor-pointer shadow-sm"
        >
          <option value="">All Resource Types</option>
          <option value="CLIENT">CLIENT</option>
          <option value="SESSION_NOTE">SESSION_NOTE</option>
          <option value="PA_REQUEST">PA_REQUEST</option>
          <option value="BILLING_CLAIM">BILLING_CLAIM</option>
          <option value="RE_AUTH_PACKET">RE_AUTH_PACKET</option>
        </select>

        <span className="ml-auto text-xs font-mono text-slate-500 dark:text-zinc-500">
          Showing {records.length} of {totalCount} events
        </span>
      </div>

      {/* Audit Log Table */}
      <div className="mt-4 overflow-x-auto">
        {loading && records.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-slate-500 dark:text-zinc-400">
            <RefreshCw className="h-5 w-5 animate-spin text-brand-orange-500 mr-2" />
            <span className="font-mono text-xs">Querying audit records...</span>
          </div>
        ) : error ? (
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-xs text-rose-600 dark:text-red-400">
            {error}
          </div>
        ) : records.length === 0 ? (
          <div className="rounded-xl border border-[#E2D5B7] dark:border-white/5 bg-[#F9F5EC] dark:bg-zinc-900/30 p-8 text-center text-xs text-slate-500 dark:text-zinc-500">
            No audit log records match the selected filters.
          </div>
        ) : (
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className="border-b border-[#E2D5B7] dark:border-white/10 text-[10px] uppercase text-slate-500 dark:text-zinc-400 tracking-wider">
                <th className="pb-2 pl-1">Timestamp</th>
                <th className="pb-2">Action</th>
                <th className="pb-2">Actor</th>
                <th className="pb-2">Resource</th>
                <th className="pb-2">Resource ID</th>
                <th className="pb-2 pr-1">IP Address</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2D5B7]/60 dark:divide-white/5">
              {records.map((r) => (
                <tr key={r.id} className="hover:bg-white/50 dark:hover:bg-white/[0.02] transition-colors">
                  <td className="py-2.5 pl-1 text-slate-700 dark:text-zinc-300 whitespace-nowrap">
                    {r.timestamp.replace('T', ' ').slice(0, 19)}
                  </td>
                  <td className="py-2.5">
                    <span
                      className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold ${
                        r.action === 'SIGN'
                          ? 'bg-green-500/20 text-green-700 dark:text-green-400 border border-green-500/30'
                          : r.action === 'DELETE'
                          ? 'bg-red-500/20 text-rose-700 dark:text-red-400 border border-red-500/30'
                          : r.action === 'EXPORT'
                          ? 'bg-amber-500/20 text-amber-700 dark:text-amber-400 border border-amber-500/30'
                          : 'bg-slate-200 dark:bg-white/10 text-slate-800 dark:text-zinc-300'
                      }`}
                    >
                      {r.action}
                    </span>
                  </td>
                  <td className="py-2.5 text-slate-800 dark:text-zinc-300">
                    {r.userName || r.userEmail || (
                      <span className="text-slate-400 dark:text-zinc-500">System</span>
                    )}
                  </td>
                  <td className="py-2.5 text-cyan-700 dark:text-cyan-400 font-semibold">{r.resourceType}</td>
                  <td className="py-2.5 text-slate-500 dark:text-zinc-400 text-[11px] truncate max-w-[140px]">
                    {r.resourceId}
                  </td>
                  <td className="py-2.5 pr-1 text-slate-400 dark:text-zinc-500 text-[11px]">
                    {r.ipAddress || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
