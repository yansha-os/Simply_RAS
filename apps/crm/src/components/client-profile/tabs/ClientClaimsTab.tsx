'use client';

import React, { useCallback, useEffect, useState, useSyncExternalStore, useTransition } from 'react';
import Link from 'next/link';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  FileText,
  Loader2,
  RefreshCw,
  Send,
  ShieldAlert,
  X,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';

import { convertNoteToBillable } from '@/app/(dashboard)/notes/actions';
import {
  getClientClaimsList,
  updateClaimOutcome,
  type ClientClaimRow,
  type ClientClaimsListPayload,
} from '@/app/actions/clientClaimsActions';
import {
  claimOutcomeLabel,
  claimStatusLabel,
  type ClaimWorkflowStatus,
} from '@/lib/clientClaimsEngine';

type ClientClaimsTabProps = {
  clientId: string;
  clientName: string;
  canConvert: boolean;
};

type ModalKind = 'submit' | 'approve' | 'deny' | null;

const subscribeToClientMount = () => () => undefined;
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

const STATUS_BADGE: Record<
  ClaimWorkflowStatus,
  { className: string; dot?: boolean }
> = {
  AWAITING_BCBA: {
    className:
      'bg-amber-500/10 text-amber-400 border border-amber-500/20',
  },
  READY_TO_SUBMIT: {
    className:
      'bg-brand-orange-500/10 text-brand-orange-400 border border-brand-orange-500/20',
  },
  SUBMITTED: {
    className: 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/20',
    dot: true,
  },
  APPROVED: {
    className: 'bg-green-500/10 text-green-400 border border-green-500/20',
  },
  DENIED: {
    className: 'bg-rose-500/10 text-rose-400 border border-rose-500/20',
  },
};

function formatDos(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function SignPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wide ${
        ok
          ? 'border-green-500/25 bg-green-500/10 text-green-400'
          : 'border-zinc-600/40 bg-zinc-800/60 text-zinc-500'
      }`}
    >
      {ok ? <CheckCircle2 className="h-2.5 w-2.5" /> : <XCircle className="h-2.5 w-2.5" />}
      {label}
    </span>
  );
}

function StatusBadge({ status, outcome }: { status: ClaimWorkflowStatus; outcome: string | null }) {
  const tone = STATUS_BADGE[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${tone.className}`}
    >
      {tone.dot && <span className="dot-live h-1.5 w-1.5 rounded-full bg-cyan-400" />}
      {status === 'DENIED' && outcome ? outcome : claimStatusLabel(status)}
    </span>
  );
}

export default function ClientClaimsTab({
  clientId,
  clientName,
  canConvert,
}: ClientClaimsTabProps) {
  const mounted = useSyncExternalStore(
    subscribeToClientMount,
    getClientSnapshot,
    getServerSnapshot,
  );
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [payload, setPayload] = useState<ClientClaimsListPayload | null>(null);
  const [filter, setFilter] = useState<ClaimWorkflowStatus | 'ALL'>('ALL');
  const [modalKind, setModalKind] = useState<ModalKind>(null);
  const [activeRow, setActiveRow] = useState<ClientClaimRow | null>(null);
  const [claimRef, setClaimRef] = useState('');
  const [denyClinical, setDenyClinical] = useState(false);
  const [isPending, startTransition] = useTransition();

  const load = useCallback(() => {
    startTransition(async () => {
      setError(null);
      const res = await getClientClaimsList(clientId);
      if (res.success) {
        setPayload(res.data);
        setLoaded(true);
      } else {
        setError(res.error || 'Failed to load claims.');
        setLoaded(true);
      }
    });
  }, [clientId]);

  useEffect(() => {
    load();
  }, [load]);

  const closeModal = useCallback(() => {
    setModalKind(null);
    setActiveRow(null);
    setClaimRef('');
    setDenyClinical(false);
  }, []);

  useEffect(() => {
    if (!modalKind) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeModal();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [closeModal, modalKind]);

  const openModal = (kind: ModalKind, row: ClientClaimRow) => {
    setActiveRow(row);
    setModalKind(kind);
    setClaimRef(row.plutusClaimRef ?? '');
    setDenyClinical(false);
  };

  const runSubmit = () => {
    if (!activeRow) return;
    const ref = claimRef.trim();
    if (!ref) {
      toast.error('Enter a claim or batch reference.');
      return;
    }
    if (!activeRow.expectedSubmissionFingerprint) {
      toast.error('Note revision incomplete — refresh and try again.');
      return;
    }
    startTransition(async () => {
      const res = await convertNoteToBillable(activeRow.id, {
        plutusClaimRef: ref,
        expectedNoteUpdatedAt: activeRow.expectedNoteUpdatedAt,
        expectedSubmissionFingerprint: activeRow.expectedSubmissionFingerprint!,
      });
      if (res.success) {
        toast.success('Claim submitted and marked filed.');
        closeModal();
        load();
      } else {
        toast.error('error' in res ? res.error : 'Submit failed.');
      }
    });
  };

  const runOutcome = (outcome: 'APPROVED' | 'DENIED_CLERICAL' | 'DENIED_CLINICAL') => {
    if (!activeRow) return;
    startTransition(async () => {
      const res = await updateClaimOutcome(activeRow.id, outcome);
      if (res.success) {
        toast.success(
          outcome === 'APPROVED' ? 'Claim marked approved.' : 'Claim marked denied.',
        );
        closeModal();
        load();
      } else {
        toast.error(res.error);
      }
    });
  };

  const counts = payload?.statusCounts;
  const rows =
    payload?.rows.filter((row) => filter === 'ALL' || row.status === filter) ?? [];
  const allowConvert = canConvert && (payload?.canConvert ?? false);

  const statCards: Array<{ key: ClaimWorkflowStatus | 'ALL'; label: string; tone: string }> = [
    { key: 'ALL', label: 'All claims', tone: 'text-white' },
    { key: 'AWAITING_BCBA', label: 'Awaiting BCBA', tone: 'text-amber-400' },
    { key: 'READY_TO_SUBMIT', label: 'Ready to submit', tone: 'text-brand-orange-400' },
    { key: 'SUBMITTED', label: 'Submitted', tone: 'text-cyan-300' },
    { key: 'APPROVED', label: 'Approved', tone: 'text-green-400' },
    { key: 'DENIED', label: 'Denied', tone: 'text-rose-400' },
  ];

  return (
    <div className="relative space-y-6 animate-fade-in-up">
      <div className="pointer-events-none absolute -top-20 right-0 h-48 w-48 rounded-full bg-brand-orange-500/10 blur-3xl" />

      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-zinc-950/80 p-6 shadow-xl backdrop-blur-2xl transition-all duration-300 hover:border-brand-orange-500/30">
        <div className="relative flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-brand-orange-400">
              Billing · per-client claims
            </p>
            <h2 className="mt-1 font-heading text-xl font-bold text-white">
              Claims · {clientName}
            </h2>
            <p className="mt-1 max-w-2xl text-xs text-zinc-400">
              Track each session note through billing adjudication — co-sign, submit with a
              claim reference, then record payer approved or denied. Use the{' '}
              <span className="text-zinc-300">global queue</span> for cross-client triage.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={load}
              disabled={isPending}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-white/10 bg-zinc-900/80 px-3 py-1.5 text-xs font-semibold text-zinc-300 transition-all duration-300 hover:border-brand-orange-500/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              Refresh
            </button>
            <Link
              href="/portal-billing/claims"
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-cyan-500/25 bg-cyan-500/10 px-3 py-1.5 text-xs font-semibold text-cyan-300 transition-all duration-300 hover:border-cyan-500/40"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Global queue
            </Link>
          </div>
        </div>

        {counts && (
          <div className="relative mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {statCards.map((stat) => {
              const value =
                stat.key === 'ALL'
                  ? payload?.rows.length ?? 0
                  : counts[stat.key as ClaimWorkflowStatus];
              const active = filter === stat.key;
              return (
                <button
                  key={stat.key}
                  type="button"
                  onClick={() => setFilter(stat.key)}
                  className={`cursor-pointer rounded-2xl border px-3 py-3 text-left transition-all duration-300 hover:scale-[1.01] hover:border-brand-orange-500/30 ${
                    active
                      ? 'border-brand-orange-500/40 bg-brand-orange-500/5'
                      : 'border-white/10 bg-zinc-900/70'
                  }`}
                >
                  <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-zinc-500">
                    {stat.label}
                  </span>
                  <span className={`mt-1 block font-heading text-2xl font-bold ${stat.tone}`}>
                    {isPending && !loaded ? '—' : value}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          <div className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="h-4 w-4" />
            Could not load claims
          </div>
          <p className="mt-1 text-xs">{error}</p>
          <button
            type="button"
            onClick={load}
            className="mt-2 inline-flex cursor-pointer items-center gap-1 rounded-lg border border-rose-500/30 px-2 py-1 text-[11px] font-medium text-rose-200 hover:bg-rose-500/10"
          >
            Retry
          </button>
        </div>
      )}

      {isPending && !loaded && (
        <div className="flex items-center justify-center rounded-2xl border border-white/10 bg-zinc-950/80 py-16 backdrop-blur-xl">
          <Loader2 className="mr-3 h-6 w-6 animate-spin text-brand-orange-500" />
          <span className="font-mono text-sm text-zinc-400">Loading claims…</span>
        </div>
      )}

      {payload && (
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/60 backdrop-blur-xl">
          <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3 text-xs text-zinc-500">
            <FileText className="h-3.5 w-3.5 text-brand-orange-400" />
            Session claim rows — submit and adjudicate inline (not the global kanban)
          </div>

          {rows.length === 0 ? (
            <div className="px-6 py-14 text-center text-sm text-zinc-500">
              No claims in this filter yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[880px] text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10 font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                    <th className="px-4 py-3 font-semibold">DOS</th>
                    <th className="px-4 py-3 font-semibold">CPT · Units</th>
                    <th className="px-4 py-3 font-semibold">Signatures</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Scrub / Auth</th>
                    <th className="px-4 py-3 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.id}
                      className="border-b border-white/5 transition-colors hover:bg-white/[0.02]"
                    >
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs text-zinc-200">
                          {formatDos(row.dateOfService)}
                        </span>
                        {row.plutusClaimRef && (
                          <p className="mt-0.5 font-mono text-[10px] text-zinc-500">
                            Ref {row.plutusClaimRef}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs text-brand-orange-400">
                          {row.cptCode ?? '—'}
                        </span>
                        <span className="ml-2 font-mono text-xs text-zinc-400">
                          {row.billableUnits ?? '—'} u
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          <SignPill ok={row.rbtSigned} label="RBT" />
                          <SignPill ok={row.parentSigned} label="Parent" />
                          <SignPill ok={row.bcbaSigned} label="BCBA" />
                        </div>
                        {(row.rbtName || row.bcbaName) && (
                          <p className="mt-1 font-mono text-[10px] text-zinc-600">
                            {[row.rbtName, row.bcbaName].filter(Boolean).join(' · ')}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge
                          status={row.status}
                          outcome={claimOutcomeLabel(row.claimOutcome)}
                        />
                      </td>
                      <td className="px-4 py-3">
                        {row.convertBlockers.length > 0 ? (
                          <div className="flex items-start gap-1 text-[11px] text-rose-400">
                            <ShieldAlert className="mt-0.5 h-3 w-3 shrink-0" />
                            <span className="line-clamp-2">{row.convertBlockers[0]}</span>
                          </div>
                        ) : row.scrubWarnings.length > 0 ? (
                          <div className="flex items-start gap-1 text-[11px] text-amber-400">
                            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                            <span className="line-clamp-2">{row.scrubWarnings[0]}</span>
                          </div>
                        ) : row.authUnitStop?.enforced === true && row.authUnitStop.exceeded ? (
                          <span className="text-[11px] text-amber-400">
                            Auth units exceeded ({row.authUnitStop.cptCode})
                          </span>
                        ) : row.authUnitStop?.manualReviewRequired ? (
                          <span className="text-[11px] text-amber-400">
                            Auth review required
                          </span>
                        ) : (
                          <span className="font-mono text-[10px] text-zinc-600">Clear</span>
                        )}
                        {row.openDeficiencyCount > 0 && (
                          <p className="mt-0.5 font-mono text-[10px] text-rose-400">
                            {row.openDeficiencyCount} open deficiency
                            {row.openDeficiencyCount > 1 ? 'ies' : ''}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {row.status === 'READY_TO_SUBMIT' && allowConvert && (
                          <button
                            type="button"
                            disabled={
                              isPending || row.convertBlockers.length > 0
                            }
                            onClick={() => openModal('submit', row)}
                            className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-brand-orange-500/30 bg-brand-orange-500/10 px-2.5 py-1 text-[11px] font-semibold text-brand-orange-300 transition-all hover:border-brand-orange-500/50 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <Send className="h-3 w-3" />
                            Submit claim
                          </button>
                        )}
                        {row.status === 'SUBMITTED' && allowConvert && (
                          <div className="flex justify-end gap-1.5">
                            <button
                              type="button"
                              disabled={isPending}
                              onClick={() => openModal('approve', row)}
                              className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-green-500/30 bg-green-500/10 px-2 py-1 text-[11px] font-semibold text-green-300 transition-all hover:border-green-500/50 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              disabled={isPending}
                              onClick={() => openModal('deny', row)}
                              className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-rose-500/30 bg-rose-500/10 px-2 py-1 text-[11px] font-semibold text-rose-300 transition-all hover:border-rose-500/50 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              Deny
                            </button>
                          </div>
                        )}
                        {row.status === 'AWAITING_BCBA' && (
                          <span className="font-mono text-[10px] text-zinc-600">
                            Awaiting clinical co-sign
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {modalKind && activeRow && mounted &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-md animate-fade-in"
            onClick={closeModal}
          >
            <div
              className="m-auto w-full max-w-md rounded-2xl border border-white/10 bg-zinc-950/95 p-6 shadow-2xl backdrop-blur-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-4 flex items-start justify-between">
                <div>
                  <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-brand-orange-400">
                    {modalKind === 'submit'
                      ? 'Submit claim'
                      : modalKind === 'approve'
                        ? 'Mark approved'
                        : 'Mark denied'}
                  </p>
                  <h3 className="mt-1 font-heading text-lg font-bold text-white">
                    {formatDos(activeRow.dateOfService)} · {activeRow.cptCode ?? 'CPT'}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={closeModal}
                  className="cursor-pointer rounded-lg p-1 text-zinc-500 hover:bg-white/5 hover:text-white"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {modalKind === 'submit' && (
                <>
                  <p className="mb-3 text-xs text-zinc-400">
                    Enter the Plutus claim or batch reference. This sets{' '}
                    <span className="font-mono text-zinc-300">isConverted</span> for this
                    session note.
                  </p>
                  <label className="mb-4 block">
                    <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                      Claim reference
                    </span>
                    <input
                      type="text"
                      value={claimRef}
                      onChange={(e) => setClaimRef(e.target.value)}
                      maxLength={200}
                      className="mt-1 w-full rounded-xl border border-white/10 bg-zinc-900/80 px-3 py-2 font-mono text-sm text-white outline-none focus:border-brand-orange-500/50"
                      placeholder="e.g. BATCH-2026-0819"
                    />
                  </label>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={runSubmit}
                    className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-brand-orange-500/40 bg-brand-orange-500/15 py-2.5 text-sm font-semibold text-brand-orange-200 transition-all hover:bg-brand-orange-500/25 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                    Submit &amp; mark filed
                  </button>
                </>
              )}

              {modalKind === 'approve' && (
                <>
                  <p className="mb-4 text-xs text-zinc-400">
                    Record payer approval for claim ref{' '}
                    <span className="font-mono text-zinc-200">
                      {activeRow.plutusClaimRef ?? '—'}
                    </span>
                    .
                  </p>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => runOutcome('APPROVED')}
                    className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-green-500/40 bg-green-500/15 py-2.5 text-sm font-semibold text-green-200 transition-all hover:bg-green-500/25 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4" />
                    )}
                    Confirm approved
                  </button>
                </>
              )}

              {modalKind === 'deny' && (
                <>
                  <p className="mb-3 text-xs text-zinc-400">
                    Record payer denial (mirrors PA deny types).
                  </p>
                  <div className="mb-4 flex gap-2">
                    <button
                      type="button"
                      onClick={() => setDenyClinical(false)}
                      className={`flex-1 cursor-pointer rounded-xl border px-3 py-2 text-xs font-semibold transition-all ${
                        !denyClinical
                          ? 'border-rose-500/40 bg-rose-500/10 text-rose-200'
                          : 'border-white/10 text-zinc-400 hover:border-white/20'
                      }`}
                    >
                      Clerical
                    </button>
                    <button
                      type="button"
                      onClick={() => setDenyClinical(true)}
                      className={`flex-1 cursor-pointer rounded-xl border px-3 py-2 text-xs font-semibold transition-all ${
                        denyClinical
                          ? 'border-rose-500/40 bg-rose-500/10 text-rose-200'
                          : 'border-white/10 text-zinc-400 hover:border-white/20'
                      }`}
                    >
                      Clinical
                    </button>
                  </div>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() =>
                      runOutcome(denyClinical ? 'DENIED_CLINICAL' : 'DENIED_CLERICAL')
                    }
                    className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-rose-500/40 bg-rose-500/15 py-2.5 text-sm font-semibold text-rose-200 transition-all hover:bg-rose-500/25 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <XCircle className="h-4 w-4" />
                    )}
                    Confirm denied
                  </button>
                </>
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
