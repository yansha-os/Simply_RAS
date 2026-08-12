'use client';

import React, { useMemo, useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  CheckCircle2,
  AlertTriangle,
  Download,
  FileSearch,
  Filter,
  ExternalLink,
  RotateCcw,
  ShieldCheck,
  X,
} from 'lucide-react';
import {
  setDualRunAuditMark,
  logDualRunAuditExport,
  type DualRunAuditRow,
  type DualRunAuditMarker,
  type DualRunAuditClientOption,
} from '@/app/actions/dualRunAuditActions';
import { CLINIC_TIME_ZONE } from '@/lib/clinicTimezone';

const AUDIT_GATE_TARGET = 10; // cutover checklist gate 10 — ≥10-note audit sample

type StatusFilter = 'all' | 'unreviewed' | 'audited' | 'discrepancy';

function fmtTimestamp(isoValue: string | null): string {
  if (!isoValue) return '—';
  return new Date(isoValue).toLocaleString('en-US', {
    timeZone: CLINIC_TIME_ZONE,
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function csvCell(value: string | number | boolean | null | undefined): string {
  const s = value == null ? '' : String(value);
  return `"${s.replace(/"/g, '""')}"`;
}

function buildCsv(rows: DualRunAuditRow[]): string {
  const header = [
    'noteId',
    'client',
    'dateOfService',
    'cptCode',
    'billableUnits',
    'durationMinutes',
    'rbt',
    'rbtSignerName',
    'rbtSignedAt',
    'bcba',
    'bcbaSignerName',
    'bcbaSignedAt',
    'checklist',
    'failedChecklistItems',
    'isConverted',
    'convertedAt',
    'plutusClaimRef',
    'auditMark',
    'auditNote',
    'auditedBy',
    'auditedAt',
  ];
  const lines = rows.map((r) =>
    [
      r.noteId,
      r.clientName,
      r.dosDateKey,
      r.cptCode,
      r.billableUnits,
      r.durationMinutes,
      r.rbtName,
      r.rbtSignerName,
      r.rbtSignedAt,
      r.bcbaName,
      r.bcbaSignerName,
      r.bcbaSignedAt,
      r.checklist,
      r.failedChecklistItems.join('; '),
      r.isConverted,
      r.convertedAt,
      r.plutusClaimRef,
      r.audit.mark ?? 'UNREVIEWED',
      r.audit.note,
      r.audit.markedByName,
      r.audit.markedAt,
    ]
      .map(csvCell)
      .join(',')
  );
  return [header.map(csvCell).join(','), ...lines].join('\r\n');
}

export default function DualRunAuditWorksheet({
  rows,
  clients,
  from,
  to,
  clientId,
  loadError,
}: {
  rows: DualRunAuditRow[];
  clients: DualRunAuditClientOption[];
  from: string;
  to: string;
  clientId: string | null;
  loadError: string | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  // Server markers overlaid with this session's in-flight marks.
  const [markerOverride, setMarkerOverride] = useState<Record<string, DualRunAuditMarker>>({});
  const [discrepancyFor, setDiscrepancyFor] = useState<string | null>(null);
  const [discrepancyNote, setDiscrepancyNote] = useState('');
  const [savingNoteId, setSavingNoteId] = useState<string | null>(null);

  const markedRows = useMemo(
    () =>
      rows.map((r) =>
        markerOverride[r.noteId] ? { ...r, audit: markerOverride[r.noteId] } : r
      ),
    [rows, markerOverride]
  );

  const visibleRows = useMemo(() => {
    if (statusFilter === 'all') return markedRows;
    return markedRows.filter((r) => {
      if (statusFilter === 'unreviewed') return r.audit.mark === null;
      if (statusFilter === 'audited') return r.audit.mark === 'AUDITED';
      return r.audit.mark === 'DISCREPANCY';
    });
  }, [markedRows, statusFilter]);

  const auditedCount = markedRows.filter((r) => r.audit.mark === 'AUDITED').length;
  const discrepancyCount = markedRows.filter((r) => r.audit.mark === 'DISCREPANCY').length;
  const unreviewedCount = markedRows.length - auditedCount - discrepancyCount;
  const gateMet = auditedCount >= AUDIT_GATE_TARGET && discrepancyCount === 0;

  const applyRangeFilter = (formData: FormData) => {
    const nextFrom = String(formData.get('from') || from);
    const nextTo = String(formData.get('to') || to);
    const nextClient = String(formData.get('clientId') || '');
    const params = new URLSearchParams(searchParams.toString());
    params.set('from', nextFrom);
    params.set('to', nextTo);
    if (nextClient) params.set('clientId', nextClient);
    else params.delete('clientId');
    startTransition(() => router.replace(`/portal-billing/audit?${params.toString()}`));
  };

  const saveMark = async (
    noteId: string,
    mark: 'AUDITED' | 'DISCREPANCY' | null,
    note?: string
  ) => {
    setSavingNoteId(noteId);
    const result = await setDualRunAuditMark(noteId, mark, note);
    setSavingNoteId(null);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    setMarkerOverride((prev) => ({ ...prev, [noteId]: result.marker }));
    setDiscrepancyFor(null);
    setDiscrepancyNote('');
    if (mark === 'AUDITED') toast.success('Note marked audited ✓');
    else if (mark === 'DISCREPANCY') toast.warning('Discrepancy flagged');
    else toast.message('Audit marker cleared');
  };

  const exportCsv = () => {
    if (visibleRows.length === 0) {
      toast.error('Nothing to export for the current filters.');
      return;
    }
    const blob = new Blob([buildCsv(visibleRows)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `dual-run-audit_${from}_${to}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    void logDualRunAuditExport({ from, to, rowCount: visibleRows.length });
    toast.success(`Exported ${visibleRows.length} notes — reconcile against the Artemis export.`);
  };

  if (loadError) {
    return (
      <div className="rounded-3xl border border-red-500/20 bg-red-950/20 backdrop-blur-xl p-10 text-center">
        <AlertTriangle className="mx-auto h-8 w-8 text-red-400 mb-3" />
        <p className="font-heading font-bold text-white">Cannot load the audit worksheet</p>
        <p className="text-sm text-red-300/80 mt-1.5">{loadError}</p>
      </div>
    );
  }

  return (
    <div className="relative space-y-6">
      <div className="pointer-events-none absolute -top-20 right-10 h-64 w-64 rounded-full bg-cyan-500/10 blur-3xl" />
      <div className="pointer-events-none absolute top-64 -left-16 h-56 w-56 rounded-full bg-emerald-500/5 blur-3xl" />

      {/* KPI strip */}
      <div className="grid gap-4 md:grid-cols-4 relative">
        {[
          {
            label: 'Signed notes in range',
            value: markedRows.length,
            accent: 'text-white',
            glow: 'border-white/10',
          },
          {
            label: 'Audited ✓',
            value: auditedCount,
            accent: 'text-emerald-400',
            glow: 'border-emerald-500/20 bg-emerald-500/5',
          },
          {
            label: 'Discrepancies',
            value: discrepancyCount,
            accent: discrepancyCount > 0 ? 'text-red-400' : 'text-zinc-500',
            glow: discrepancyCount > 0 ? 'border-red-500/20 bg-red-500/5' : 'border-white/10',
          },
          {
            label: 'Unreviewed',
            value: unreviewedCount,
            accent: 'text-amber-400',
            glow: 'border-amber-500/20 bg-amber-500/5',
          },
        ].map((kpi) => (
          <div
            key={kpi.label}
            className={`rounded-2xl border bg-zinc-950/80 backdrop-blur-xl p-5 transition-all duration-300 hover:scale-[1.01] hover:shadow-2xl hover:border-brand-orange-500/40 ${kpi.glow}`}
          >
            <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">
              {kpi.label}
            </span>
            <div className={`mt-2 text-3xl font-heading font-bold ${kpi.accent}`}>{kpi.value}</div>
          </div>
        ))}
      </div>

      {/* ≥10-note gate banner */}
      <div
        className={`relative rounded-2xl border p-4 flex flex-wrap items-center gap-3 backdrop-blur-xl transition-all duration-300 ${
          gateMet
            ? 'border-emerald-500/30 bg-emerald-950/30'
            : 'border-white/10 bg-zinc-950/80'
        }`}
      >
        <ShieldCheck className={`h-5 w-5 ${gateMet ? 'text-emerald-400' : 'text-zinc-500'}`} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-heading font-bold text-white">
            Cutover gate 10 — ≥{AUDIT_GATE_TARGET}-note audit sample
          </p>
          <p className="text-xs text-zinc-400 mt-0.5">
            {gateMet
              ? `Met for this range: ${auditedCount} audited, 0 open discrepancies. Record sign-off on the cohort sheet.`
              : `${auditedCount}/${AUDIT_GATE_TARGET} audited${
                  discrepancyCount > 0 ? ` · ${discrepancyCount} discrepancy(ies) must be resolved` : ''
                } — D1 → D2 needs ≥${AUDIT_GATE_TARGET} passing notes and zero open discrepancies.`}
          </p>
        </div>
        <div className="h-2 w-40 rounded-full bg-zinc-800 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              gateMet ? 'bg-emerald-500' : 'bg-brand-orange-500'
            }`}
            style={{
              width: `${Math.min(100, (auditedCount / AUDIT_GATE_TARGET) * 100)}%`,
            }}
          />
        </div>
      </div>

      {/* Filters */}
      <div className="relative rounded-2xl border border-white/10 bg-zinc-950/80 backdrop-blur-xl p-4">
        <form action={applyRangeFilter} className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-1">
              From (DOS)
            </label>
            <input
              type="date"
              name="from"
              defaultValue={from}
              className="rounded-xl border border-white/10 bg-zinc-900/80 px-3 py-2 text-sm text-white font-mono focus:border-brand-orange-500/50 focus:outline-none [color-scheme:dark]"
            />
          </div>
          <div>
            <label className="block text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-1">
              To (DOS)
            </label>
            <input
              type="date"
              name="to"
              defaultValue={to}
              className="rounded-xl border border-white/10 bg-zinc-900/80 px-3 py-2 text-sm text-white font-mono focus:border-brand-orange-500/50 focus:outline-none [color-scheme:dark]"
            />
          </div>
          <div>
            <label className="block text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-1">
              Client
            </label>
            <select
              name="clientId"
              defaultValue={clientId ?? ''}
              className="rounded-xl border border-white/10 bg-zinc-900/80 px-3 py-2 text-sm text-white focus:border-brand-orange-500/50 focus:outline-none cursor-pointer"
            >
              <option value="">All clients</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            className="cursor-pointer inline-flex items-center gap-2 rounded-xl bg-brand-orange-600 hover:bg-brand-orange-500 px-4 py-2 text-sm font-bold text-white transition-all duration-300 hover:shadow-lg hover:shadow-brand-orange-600/20"
          >
            <Filter className="h-4 w-4" /> Apply
          </button>

          <div className="ml-auto flex items-center gap-2">
            <div className="flex bg-zinc-900/80 p-1 rounded-2xl border border-white/10">
              {(
                [
                  { id: 'all', label: 'All' },
                  { id: 'unreviewed', label: 'Unreviewed' },
                  { id: 'audited', label: 'Audited' },
                  { id: 'discrepancy', label: 'Discrepancies' },
                ] as const
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setStatusFilter(t.id)}
                  className={`cursor-pointer px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    statusFilter === t.id
                      ? 'bg-cyan-600/90 text-white shadow-md shadow-cyan-600/20'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={exportCsv}
              className="cursor-pointer inline-flex items-center gap-2 rounded-xl border border-white/10 bg-zinc-900/80 hover:border-emerald-500/40 px-4 py-2 text-sm font-bold text-white transition-all duration-300"
            >
              <Download className="h-4 w-4 text-emerald-400" /> Export CSV
            </button>
          </div>
        </form>
      </div>

      {/* Worksheet table */}
      <div className="relative rounded-3xl border border-white/10 bg-zinc-950/80 backdrop-blur-xl overflow-hidden shadow-2xl">
        {visibleRows.length === 0 ? (
          <div className="p-14 text-center">
            <FileSearch className="mx-auto h-8 w-8 text-zinc-700 mb-3" />
            <p className="font-heading text-white/80">No signed notes match</p>
            <p className="text-xs mt-1.5 font-mono text-zinc-600 max-w-md mx-auto">
              Needs rbtSigned + bcbaSigned SessionNotes with DOS in range. Widen the date range or
              clear filters.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-[10px] font-mono uppercase tracking-widest text-zinc-500">
                  <th className="px-4 py-3">Client / DOS</th>
                  <th className="px-4 py-3">CPT</th>
                  <th className="px-4 py-3">Units / Dur</th>
                  <th className="px-4 py-3">RBT sign</th>
                  <th className="px-4 py-3">BCBA sign</th>
                  <th className="px-4 py-3">Checklist</th>
                  <th className="px-4 py-3">Plutus</th>
                  <th className="px-4 py-3 text-right">Audit vs Artemis</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => {
                  const saving = savingNoteId === row.noteId;
                  const isDiscrepancyOpen = discrepancyFor === row.noteId;
                  return (
                    <React.Fragment key={row.noteId}>
                      <tr
                        className={`border-b border-white/5 transition-all duration-300 hover:bg-zinc-900/40 ${
                          row.audit.mark === 'DISCREPANCY'
                            ? 'bg-red-950/20'
                            : row.audit.mark === 'AUDITED'
                              ? 'bg-emerald-950/10'
                              : ''
                        }`}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <span className="font-heading font-bold text-white">
                              {row.clientName}
                            </span>
                            {row.clientId && (
                              <Link
                                href={`/client/${row.clientId}`}
                                className="cursor-pointer text-zinc-500 hover:text-brand-orange-400 transition-colors"
                              >
                                <ExternalLink className="h-3 w-3" />
                              </Link>
                            )}
                          </div>
                          <span className="text-[11px] font-mono text-zinc-500">
                            {row.dosDateKey ?? '—'}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-cyan-400">
                          {row.cptCode ?? '—'}
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-mono text-brand-orange-300">
                            {row.billableUnits != null ? `${row.billableUnits}u` : '—'}
                          </span>
                          <span className="text-zinc-600 font-mono text-[11px]">
                            {' '}
                            · {row.durationMinutes}m
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-zinc-200 text-xs">
                            {row.rbtSignerName ?? row.rbtName ?? '—'}
                          </p>
                          <p className="text-[10px] font-mono text-zinc-500">
                            {fmtTimestamp(row.rbtSignedAt)}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-zinc-200 text-xs">
                            {row.bcbaSignerName ?? row.bcbaName ?? '—'}
                          </p>
                          <p className="text-[10px] font-mono text-zinc-500">
                            {fmtTimestamp(row.bcbaSignedAt)}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${
                              row.checklist === 'PASS'
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                : row.checklist === 'FAIL'
                                  ? 'bg-red-500/10 text-red-400 border-red-500/20'
                                  : 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20'
                            }`}
                            title={
                              row.checklist === 'FAIL'
                                ? row.failedChecklistItems.join('; ')
                                : undefined
                            }
                          >
                            {row.checklist}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {row.isConverted ? (
                            <>
                              <p className="text-[11px] font-mono text-emerald-400">
                                {row.plutusClaimRef ?? 'Converted (no ref)'}
                              </p>
                              <p className="text-[10px] font-mono text-zinc-500">
                                {fmtTimestamp(row.convertedAt)}
                              </p>
                            </>
                          ) : (
                            <span className="text-[11px] font-mono text-zinc-600">
                              Not converted
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1.5">
                            {row.audit.mark && (
                              <span
                                className={`mr-1 inline-flex items-center gap-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${
                                  row.audit.mark === 'AUDITED'
                                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                    : 'bg-red-500/10 text-red-400 border-red-500/20'
                                }`}
                                title={`${row.audit.markedByName ?? ''} · ${fmtTimestamp(
                                  row.audit.markedAt
                                )}${row.audit.note ? ` — ${row.audit.note}` : ''}`}
                              >
                                {row.audit.mark === 'AUDITED' ? (
                                  <CheckCircle2 className="h-3 w-3" />
                                ) : (
                                  <AlertTriangle className="h-3 w-3" />
                                )}
                                {row.audit.mark === 'AUDITED' ? 'Audited' : 'Discrepancy'}
                              </span>
                            )}
                            {row.audit.mark !== 'AUDITED' && (
                              <button
                                type="button"
                                disabled={saving}
                                onClick={() => saveMark(row.noteId, 'AUDITED')}
                                className={`inline-flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 text-[11px] font-bold text-emerald-400 transition-all duration-300 hover:bg-emerald-500/20 hover:shadow-lg ${
                                  saving ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
                                }`}
                              >
                                <CheckCircle2 className="h-3 w-3" /> Audited
                              </button>
                            )}
                            {row.audit.mark !== 'DISCREPANCY' && (
                              <button
                                type="button"
                                disabled={saving}
                                onClick={() => {
                                  setDiscrepancyFor(isDiscrepancyOpen ? null : row.noteId);
                                  setDiscrepancyNote('');
                                }}
                                className={`inline-flex items-center gap-1 rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-1.5 text-[11px] font-bold text-red-400 transition-all duration-300 hover:bg-red-500/20 hover:shadow-lg ${
                                  saving ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
                                }`}
                              >
                                <AlertTriangle className="h-3 w-3" /> Flag
                              </button>
                            )}
                            {row.audit.mark && (
                              <button
                                type="button"
                                disabled={saving}
                                onClick={() => saveMark(row.noteId, null)}
                                title="Clear marker (history is kept in the audit vault)"
                                className={`inline-flex items-center rounded-lg border border-white/10 bg-zinc-900/80 p-1.5 text-zinc-400 transition-all duration-300 hover:text-white ${
                                  saving ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
                                }`}
                              >
                                <RotateCcw className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {isDiscrepancyOpen && (
                        <tr className="border-b border-white/5 bg-red-950/10">
                          <td colSpan={8} className="px-4 py-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
                              <input
                                type="text"
                                autoFocus
                                value={discrepancyNote}
                                onChange={(e) => setDiscrepancyNote(e.target.value)}
                                maxLength={500}
                                placeholder="What differs vs Artemis? e.g. units: RAS 4 vs Artemis 5 (no client PHI needed)"
                                className="flex-1 min-w-[280px] rounded-xl border border-red-500/30 bg-zinc-950/80 px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-red-500/60 focus:outline-none"
                              />
                              <button
                                type="button"
                                disabled={saving || !discrepancyNote.trim()}
                                onClick={() =>
                                  saveMark(row.noteId, 'DISCREPANCY', discrepancyNote)
                                }
                                className={`rounded-xl bg-red-600 hover:bg-red-500 px-4 py-2 text-xs font-bold text-white transition-all duration-300 ${
                                  saving || !discrepancyNote.trim()
                                    ? 'cursor-not-allowed opacity-50'
                                    : 'cursor-pointer'
                                }`}
                              >
                                Save discrepancy
                              </button>
                              <button
                                type="button"
                                onClick={() => setDiscrepancyFor(null)}
                                className="cursor-pointer rounded-xl border border-white/10 p-2 text-zinc-400 hover:text-white transition-colors"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-[11px] font-mono text-zinc-600 relative">
        Markers persist as append-only AuditLogVault EDIT entries (who/when kept). CSV is generated
        in-browser for offline reconciliation against Artemis exports — timestamps shown in{' '}
        {CLINIC_TIME_ZONE}.
      </p>
    </div>
  );
}
