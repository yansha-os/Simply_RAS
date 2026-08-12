'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  FileSignature,
  FileText,
  Filter,
  Stethoscope,
  XCircle,
} from 'lucide-react';
import type {
  ClinicalReviewKind,
  ClinicalReviewQueueItem,
} from '@/app/actions/clinicalReviewActions';

type FilterKey = 'ALL' | ClinicalReviewKind;

const KIND_META: Record<
  ClinicalReviewKind,
  {
    label: string;
    badge: string;
    accent: string;
    glow: string;
    Icon: typeof FileText;
  }
> = {
  PACKET_REVIEW: {
    label: 'Packet review',
    badge: 'bg-teal-500/10 text-teal-300 border-teal-500/25',
    accent: 'hover:border-teal-500/40',
    glow: 'bg-teal-500/10',
    Icon: ClipboardCheck,
  },
  DEFICIENCY: {
    label: 'Deficiency',
    badge: 'bg-rose-500/10 text-rose-300 border-rose-500/25',
    accent: 'hover:border-rose-500/40',
    glow: 'bg-rose-500/10',
    Icon: AlertTriangle,
  },
  UNSIGNED_NOTE: {
    label: 'Unsigned note',
    badge: 'bg-amber-500/10 text-amber-300 border-amber-500/25',
    accent: 'hover:border-amber-500/40',
    glow: 'bg-amber-500/10',
    Icon: FileSignature,
  },
};

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

function DocChip({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wide ${
        ok
          ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-400'
          : 'border-zinc-600/40 bg-zinc-900/60 text-zinc-500'
      }`}
    >
      {ok ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
      {label}
    </span>
  );
}

function QueueCard({ item }: { item: ClinicalReviewQueueItem }) {
  const meta = KIND_META[item.kind];
  const Icon = meta.Icon;

  return (
    <div
      className={`group relative overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/80 backdrop-blur-xl p-5 transition-all duration-300 hover:scale-[1.01] hover:shadow-2xl ${meta.accent}`}
    >
      <div
        className={`pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full ${meta.glow} blur-2xl opacity-0 group-hover:opacity-100 transition-opacity`}
      />

      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${meta.badge}`}
            >
              <span className="dot-live h-1.5 w-1.5 rounded-full bg-current" />
              {meta.label}
            </span>
            <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
              {item.clientStatus.replace(/_/g, ' ')}
            </span>
          </div>
          <Link
            href={item.href}
            className="font-heading text-lg font-semibold text-white hover:text-brand-orange-400 transition-colors cursor-pointer block truncate"
          >
            {item.clientFirstName} {item.clientLastName}
          </Link>
          <p className="text-sm font-medium text-zinc-200">{item.title}</p>
          <p className="text-xs text-zinc-400 font-sans leading-relaxed">{item.detail}</p>
        </div>
        <div className="shrink-0 w-10 h-10 rounded-xl bg-zinc-900 border border-white/10 flex items-center justify-center text-zinc-400 group-hover:text-brand-orange-400 group-hover:border-brand-orange-500/30 transition-all">
          <Icon className="w-4 h-4" />
        </div>
      </div>

      {item.kind === 'PACKET_REVIEW' && item.meta && (
        <div className="relative mt-4 flex flex-wrap gap-1.5 border-t border-white/5 pt-3">
          <DocChip ok={!!item.meta.formsReady} label="Forms" />
          <DocChip ok={!!item.meta.insuranceReady} label="Insurance" />
          <DocChip ok={!!item.meta.diagnosticEvalUploaded} label="Dx eval" />
          <DocChip ok={!!item.meta.physicianRxUploaded} label="Rx / referral" />
        </div>
      )}

      <div className="relative mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/5 pt-3">
        <span className="font-mono text-[10px] text-zinc-500 uppercase tracking-wider">
          Updated {formatWhen(item.updatedAt)}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          {item.secondaryHref && item.secondaryLabel && (
            <Link
              href={item.secondaryHref}
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-zinc-900/80 px-3 py-1.5 text-[11px] font-semibold text-zinc-300 hover:border-white/20 hover:text-white transition-all cursor-pointer"
            >
              {item.secondaryLabel}
            </Link>
          )}
          <Link
            href={item.href}
            className="inline-flex items-center gap-1.5 rounded-xl border border-brand-orange-500/30 bg-brand-orange-500/10 px-3 py-1.5 text-[11px] font-bold text-brand-orange-300 hover:bg-brand-orange-500/20 transition-all cursor-pointer"
          >
            Open
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function ClinicalReviewQueue({
  items,
  counts,
  viewerRole,
  scopedToBcbaId,
  loadError,
}: {
  items: ClinicalReviewQueueItem[];
  counts: { packet: number; unsigned: number; deficiency: number; total: number };
  viewerRole?: string;
  scopedToBcbaId?: string | null;
  loadError?: string | null;
}) {
  const [filter, setFilter] = useState<FilterKey>('ALL');

  const filtered = useMemo(() => {
    if (filter === 'ALL') return items;
    return items.filter((i) => i.kind === filter);
  }, [items, filter]);

  const filters: { key: FilterKey; label: string; count: number }[] = [
    { key: 'ALL', label: 'All', count: counts.total },
    { key: 'PACKET_REVIEW', label: 'Packets', count: counts.packet },
    { key: 'DEFICIENCY', label: 'Deficiencies', count: counts.deficiency },
    { key: 'UNSIGNED_NOTE', label: 'Unsigned', count: counts.unsigned },
  ];

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-zinc-950/80 backdrop-blur-2xl p-7 shadow-2xl">
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-teal-500/10 blur-3xl" />
        <div className="pointer-events-none absolute -left-10 bottom-0 h-40 w-40 rounded-full bg-brand-orange-500/10 blur-3xl" />

        <div className="relative flex flex-col lg:flex-row lg:items-end justify-between gap-5">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-teal-500/20 bg-teal-500/10 px-3 py-1 font-mono text-[11px] font-bold text-teal-300">
              <span className="dot-live" />
              CLINICAL REVIEW QUEUE
            </div>
            <h1 className="font-heading text-3xl font-extrabold tracking-tight text-white">
              Work needing clinical eyes
            </h1>
            <p className="max-w-2xl text-sm text-zinc-400 font-sans leading-relaxed">
              Live items only — packet reviews at{' '}
              <span className="font-mono text-zinc-300">DOCS_APPROVED_INTAKE</span>, open note
              deficiencies, and RBT-signed notes awaiting BCBA co-sign.
              {scopedToBcbaId
                ? ' Scoped to your BCBA caseload.'
                : viewerRole
                  ? ` Viewing as ${viewerRole.replace(/_/g, ' ')}.`
                  : ''}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href="/portal-clinical/notes"
              className="inline-flex items-center gap-2 rounded-2xl border border-amber-500/25 bg-amber-500/10 px-4 py-2.5 text-xs font-bold text-amber-300 hover:bg-amber-500/15 transition-all cursor-pointer"
            >
              <FileSignature className="w-3.5 h-3.5" />
              Unsigned notes
            </Link>
            <Link
              href="/portal-clinical/bcbas"
              className="inline-flex items-center gap-2 rounded-2xl border border-cyan-500/25 bg-cyan-500/10 px-4 py-2.5 text-xs font-bold text-cyan-300 hover:bg-cyan-500/15 transition-all cursor-pointer"
            >
              <Stethoscope className="w-3.5 h-3.5" />
              Clinical pipeline
            </Link>
          </div>
        </div>

        <div className="relative mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Total', value: counts.total, tone: 'text-white' },
            { label: 'Packets', value: counts.packet, tone: 'text-teal-300' },
            { label: 'Deficiencies', value: counts.deficiency, tone: 'text-rose-300' },
            { label: 'Unsigned', value: counts.unsigned, tone: 'text-amber-300' },
          ].map((kpi) => (
            <div
              key={kpi.label}
              className="rounded-2xl border border-white/10 bg-zinc-900/50 px-4 py-3 backdrop-blur-xl"
            >
              <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                {kpi.label}
              </p>
              <p className={`mt-1 text-2xl font-extrabold font-heading ${kpi.tone}`}>{kpi.value}</p>
            </div>
          ))}
        </div>
      </div>

      {loadError && (
        <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-300 font-sans">
          {loadError}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-zinc-500 mr-1">
          <Filter className="w-3.5 h-3.5" /> Filter
        </span>
        {filters.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`cursor-pointer rounded-xl border px-3 py-1.5 text-xs font-bold transition-all ${
              filter === f.key
                ? 'border-brand-orange-500/40 bg-brand-orange-500/15 text-brand-orange-300'
                : 'border-white/10 bg-zinc-950/60 text-zinc-400 hover:border-white/20 hover:text-white'
            }`}
          >
            {f.label}
            <span className="ml-1.5 font-mono text-[10px] opacity-70">{f.count}</span>
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="relative overflow-hidden rounded-2xl border border-dashed border-white/15 bg-zinc-950/60 backdrop-blur-xl px-8 py-14 text-center">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(20,184,166,0.06),transparent_60%)]" />
          <ClipboardCheck className="relative mx-auto h-8 w-8 text-zinc-600 mb-3" />
          <p className="relative font-heading text-lg font-semibold text-white">
            Nothing waiting for clinical review
          </p>
          <p className="relative mt-1.5 text-sm text-zinc-500 max-w-md mx-auto font-sans">
            {filter === 'ALL'
              ? 'No packet reviews, open deficiencies, or BCBA-unsigned notes right now.'
              : `No ${filters.find((f) => f.key === filter)?.label.toLowerCase() ?? 'items'} in the queue.`}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {filtered.map((item) => (
            <QueueCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
