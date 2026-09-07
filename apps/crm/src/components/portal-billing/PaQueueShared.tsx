'use client';

/**
 * Shared building blocks for the Assessment / Treatment PA queues.
 * Cards open the client profile — VOB / PA mutations happen there, not inline.
 */

import React from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { ArrowRight, PhoneCall, Search } from 'lucide-react';
import { billingPaQueueHref } from '@/lib/clientProfileTabs';

export type PaKind = 'ASSESSMENT' | 'TREATMENT';

export type QueueAccent = 'emerald' | 'teal' | 'amber' | 'orange' | 'sky' | 'rose';

export type PaQueueRequest = {
  id: string;
  type: string;
  status: string;
  updatedAt: string | Date;
  effectiveDate?: string | Date | null;
  expirationDate?: string | Date | null;
  authNumber?: string | null;
  approvedUnits?: number | null;
  vobCompleted?: boolean | null;
  providerCredentialed?: boolean | null;
  p2pResolved?: boolean | null;
  p2pNotes?: string | null;
};

export type PaQueueClient = {
  id: string;
  firstName: string;
  lastName: string;
  updatedAt: string | Date;
  paRequests?: PaQueueRequest[];
  messages?: Array<{ isFromClient: boolean; readAt: string | Date | null }>;
};

export function getPa(client: PaQueueClient, kind: PaKind): PaQueueRequest | null {
  return client.paRequests?.find((pa) => pa.type === kind) ?? null;
}

export function daysUntil(date: string | Date | null | undefined): number | null {
  if (!date) return null;
  return Math.ceil((new Date(date).getTime() - Date.now()) / 86_400_000);
}

export function daysSince(date: string | Date | null | undefined): number | null {
  if (!date) return null;
  return Math.floor((Date.now() - new Date(date).getTime()) / 86_400_000);
}

const ACCENTS: Record<QueueAccent, { hoverBorder: string; hoverText: string }> = {
  emerald: { hoverBorder: 'hover:border-emerald-500/50', hoverText: 'group-hover:text-emerald-400' },
  teal: { hoverBorder: 'hover:border-teal-500/50', hoverText: 'group-hover:text-teal-400' },
  amber: { hoverBorder: 'hover:border-amber-500/50', hoverText: 'group-hover:text-amber-400' },
  orange: { hoverBorder: 'hover:border-brand-orange-500/50', hoverText: 'group-hover:text-brand-orange-400' },
  sky: { hoverBorder: 'hover:border-sky-500/50', hoverText: 'group-hover:text-sky-400' },
  rose: { hoverBorder: 'hover:border-rose-500/50', hoverText: 'group-hover:text-rose-400' },
};

const BADGE_BASE =
  'inline-flex items-center gap-1.5 text-[10px] font-mono font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border';

/** Task palette: pending amber · approved green · denied red · P2P violet. */
export function PaStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    NOT_STARTED: {
      label: 'Ready to submit',
      className: 'bg-zinc-500/10 text-zinc-300 border-zinc-500/20',
    },
    SUBMITTED: {
      label: 'Pending decision',
      className: 'bg-amber-500/10 text-amber-400 border-amber-500/20 shadow-[0_0_12px_-2px_rgba(245,158,11,0.35)]',
    },
    APPROVED: {
      label: 'Approved',
      className: 'bg-green-500/10 text-green-400 border-green-500/20 shadow-[0_0_12px_-2px_rgba(34,197,94,0.35)]',
    },
    DENIED_CLERICAL: {
      label: 'Denied · clerical',
      className: 'bg-red-500/10 text-red-400 border-red-500/20 shadow-[0_0_12px_-2px_rgba(239,68,68,0.35)]',
    },
    DENIED_CLINICAL: {
      label: 'Denied · clinical',
      className: 'bg-red-500/10 text-red-400 border-red-500/20 shadow-[0_0_12px_-2px_rgba(239,68,68,0.35)]',
    },
  };
  const cfg = map[status] ?? {
    label: String(status),
    className: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
  };
  return (
    <span className={`${BADGE_BASE} ${cfg.className}`}>
      {status === 'SUBMITTED' && <span className="dot-live" />}
      {cfg.label}
    </span>
  );
}

export function P2pBadge({ resolved }: { resolved: boolean }) {
  return (
    <span
      className={`${BADGE_BASE} bg-violet-500/10 text-violet-400 border-violet-500/20 shadow-[0_0_12px_-2px_rgba(139,92,246,0.35)]`}
    >
      <PhoneCall className="w-3 h-3" />
      {resolved ? 'P2P resolved' : 'P2P pending'}
    </span>
  );
}

/** Days since submission / denial — amber past 7d, red past 14d. */
export function AgingBadge({ pa }: { pa: PaQueueRequest | null }) {
  if (!pa) return null;
  const inFlight = ['SUBMITTED', 'DENIED_CLERICAL', 'DENIED_CLINICAL'].includes(pa.status);
  if (!inFlight) return null;
  const days = daysSince(pa.updatedAt);
  if (days === null) return null;
  const cls =
    days > 14
      ? 'bg-red-500/10 text-red-400 border-red-500/20'
      : days > 7
        ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
        : 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20';
  const label =
    pa.status === 'SUBMITTED'
      ? `In payer review · ${days}d`
      : `${days}d since denial`;
  return <span className={`${BADGE_BASE} ${cls}`}>{label}</span>;
}

export function EmptyColumn({ message }: { message: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-white/10 bg-zinc-950/40 px-4 py-8 text-center">
      <p className="text-xs leading-relaxed text-zinc-500">{message}</p>
      <p className="mt-2 font-mono text-[10px] uppercase tracking-wider text-zinc-600">
        Live from PARequest · no sample rows
      </p>
    </div>
  );
}

/** Horizontal kanban lane — matches clinical-support / intake queue boards. */
export function QueueLane({
  title,
  eyebrow,
  count,
  icon: Icon,
  accentClass,
  borderClass,
  children,
}: {
  title: string;
  eyebrow: string;
  count: number;
  icon: React.ElementType;
  accentClass: string;
  borderClass: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex min-h-[28rem] flex-col rounded-2xl border border-white/10 bg-zinc-950/60 p-4 shadow-xl backdrop-blur-xl">
      <div className={`mb-4 flex shrink-0 items-start justify-between gap-3 border-b pb-3 ${borderClass}`}>
        <div className="min-w-0">
          <p className={`font-mono text-[10px] font-bold uppercase tracking-[0.16em] ${accentClass}`}>
            {eyebrow}
          </p>
          <h2 className="mt-1 flex items-center gap-2 font-heading text-sm font-bold leading-snug text-white">
            <Icon className="h-4 w-4 shrink-0" />
            <span>{title}</span>
          </h2>
        </div>
        <span className="inline-flex min-w-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 px-2.5 py-1 font-mono text-xs font-black text-white">
          {count}
        </span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-0.5">{children}</div>
    </section>
  );
}

export function QueueBoard({
  columns,
}: {
  columns: React.ReactNode[];
}) {
  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex min-w-max gap-4 lg:grid lg:min-w-0 lg:grid-cols-3 lg:gap-4">
        {columns.map((column, index) => (
          <div
            key={index}
            className="w-[min(100vw-3rem,19rem)] shrink-0 lg:w-auto lg:min-w-0"
          >
            {column}
          </div>
        ))}
      </div>
    </div>
  );
}

export function QueueSearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative w-full lg:w-72">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-zinc-900/80 backdrop-blur-xl border border-white/10 rounded-xl pl-9 pr-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-white/25 transition-all"
      />
    </div>
  );
}

export function filterClientsByQuery<T extends Pick<PaQueueClient, 'firstName' | 'lastName'>>(
  clients: T[],
  query: string
): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return clients;
  return clients.filter((c) =>
    `${c.firstName ?? ''} ${c.lastName ?? ''}`.toLowerCase().includes(q)
  );
}

/**
 * Queue row: name / badges / dates only. Open the billing profile to record VOB or PA.
 */
export function PaQueueCard({
  client,
  kind,
  icon: Icon,
  desc,
  accent,
}: {
  client: PaQueueClient;
  kind: PaKind;
  icon: React.ElementType;
  desc: string;
  accent: QueueAccent;
}) {
  const pa = getPa(client, kind);
  const { hoverBorder, hoverText } = ACCENTS[accent];
  const unreadCount =
    client.messages?.filter((message) => message.isFromClient && !message.readAt).length || 0;

  const vobDone = pa ? !!pa.vobCompleted && !!pa.providerCredentialed : false;
  const needsVob = kind === 'ASSESSMENT' && (!pa || !vobDone) && pa?.status !== 'APPROVED';
  const billingHref = billingPaQueueHref(client.id, kind, needsVob);

  const expDays = daysUntil(pa?.expirationDate);
  const fmt = (d: string | Date | null | undefined) =>
    d ? new Date(d).toLocaleDateString('en-US', { timeZone: 'America/New_York' }) : '—';

  return (
    <Link href={billingHref} className="group mb-3 block cursor-pointer">
      <Card
        className={`overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/80 shadow-xl backdrop-blur-xl transition-all duration-300 hover:scale-[1.01] hover:shadow-2xl ${hoverBorder}`}
      >
        <div className="space-y-3 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <h4
                  className={`truncate font-heading text-sm font-bold text-white transition-colors ${hoverText}`}
                >
                  {client.firstName} {client.lastName}
                </h4>
                {unreadCount > 0 && (
                  <span className="rounded-full bg-rose-500/90 px-2 py-0.5 text-[10px] font-bold leading-none text-white shadow-md">
                    {unreadCount} new
                  </span>
                )}
              </div>
              <p className="font-sans text-xs leading-relaxed text-zinc-400">{desc}</p>
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {pa?.status && <PaStatusBadge status={pa.status} />}
                {!pa && kind === 'TREATMENT' && <PaStatusBadge status="NOT_STARTED" />}
                {pa?.status === 'DENIED_CLINICAL' && <P2pBadge resolved={!!pa.p2pResolved} />}
                <AgingBadge pa={pa} />
                {expDays !== null && pa?.status === 'APPROVED' && (
                  <span
                    className={`${BADGE_BASE} ${
                      expDays <= 15
                        ? 'bg-red-500/10 text-red-400 border-red-500/20'
                        : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                    }`}
                  >
                    {expDays < 0 ? `Expired ${Math.abs(expDays)}d ago` : `Expires in ${expDays}d`}
                  </span>
                )}
              </div>
              {pa && (
                <div className="space-y-0.5 pt-1 font-mono text-[10px] text-zinc-500">
                  <p>
                    PA {String(pa.id).slice(0, 8).toUpperCase()}
                    {pa.status === 'SUBMITTED' && ` · Submitted ${fmt(pa.updatedAt)}`}
                    {pa.status === 'APPROVED' && ` · Decided ${fmt(pa.updatedAt)}`}
                    {pa.status?.startsWith('DENIED') && ` · Denied ${fmt(pa.updatedAt)}`}
                  </p>
                  {pa.authNumber && (
                    <p>
                      Auth #{pa.authNumber}
                      {pa.approvedUnits != null ? ` · ${pa.approvedUnits} units` : ''}
                      {pa.effectiveDate && pa.expirationDate
                        ? ` · ${fmt(pa.effectiveDate)} → ${fmt(pa.expirationDate)}`
                        : ''}
                    </p>
                  )}
                </div>
              )}
            </div>
            <div
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-zinc-900/80 text-zinc-400 shadow-sm transition-all group-hover:border-white/20 ${hoverText}`}
            >
              <Icon className="h-4 w-4" />
            </div>
          </div>

          {pa?.p2pNotes && (pa.status?.startsWith('DENIED') || pa.p2pResolved) && (
            <div
              className={`rounded-r-lg border-l-2 bg-zinc-950 p-2.5 ${pa.p2pResolved ? 'border-violet-500' : 'border-red-500'}`}
            >
              <p className="mb-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-zinc-500">
                {pa.p2pResolved ? 'P2P resolution notes' : 'Denial reason'}
              </p>
              <p className="text-xs italic leading-relaxed text-zinc-300">“{pa.p2pNotes}”</p>
            </div>
          )}

          <div className="flex items-center justify-between border-t border-white/5 pt-3">
            <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-zinc-500">
              Updated {fmt(client.updatedAt)}
            </span>
            <span
              className={`inline-flex items-center gap-1 font-mono text-[10px] text-zinc-500 ${hoverText}`}
            >
              Open profile
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </span>
          </div>
        </div>
      </Card>
    </Link>
  );
}
