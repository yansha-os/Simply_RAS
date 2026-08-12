'use client';

/**
 * Shared building blocks for the Assessment / Treatment PA queues.
 * Live PARequest rows only — status flips go through the canonical billing
 * actions; denial reason + P2P live on the PA row (portal-billing/actions.ts).
 */

import React, { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { toast } from 'sonner';
import {
  ArrowRight,
  Check,
  Loader2,
  PhoneCall,
  Search,
  ShieldCheck,
  ShieldX,
  X,
} from 'lucide-react';
import {
  markAssessmentPaSubmitted,
  markTreatmentPaSubmitted,
  markVobComplete,
  recordPaApproval,
  recordPaDenial,
  resolvePaP2p,
} from '@/app/(dashboard)/portal-billing/actions';

export type PaKind = 'ASSESSMENT' | 'TREATMENT';

export type QueueAccent = 'emerald' | 'teal' | 'amber' | 'orange' | 'sky' | 'rose';

export function getPa(client: any, kind: PaKind) {
  return client?.paRequests?.find((p: any) => p.type === kind) ?? null;
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
export function AgingBadge({ pa }: { pa: any }) {
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
    <div className="p-8 text-center rounded-2xl border border-dashed border-white/10 bg-zinc-950/50 backdrop-blur-xl">
      <p className="text-xs text-zinc-500 font-sans leading-relaxed">{message}</p>
      <p className="text-[10px] text-zinc-600 font-mono mt-2 uppercase tracking-wider">
        Live from PARequest · no sample rows
      </p>
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

export function filterClientsByQuery(clients: any[], query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return clients;
  return clients.filter((c) =>
    `${c.firstName ?? ''} ${c.lastName ?? ''}`.toLowerCase().includes(q)
  );
}

const INPUT_CLS =
  'w-full bg-zinc-900/80 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-white/25 font-mono transition-all';

const BTN_BASE =
  'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-mono font-bold uppercase tracking-wider border transition-all duration-300 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50';

const BTN = {
  amber: `${BTN_BASE} bg-amber-500/10 text-amber-400 border-amber-500/20 hover:bg-amber-500/20 hover:border-amber-500/40`,
  green: `${BTN_BASE} bg-green-500/10 text-green-400 border-green-500/20 hover:bg-green-500/20 hover:border-green-500/40`,
  red: `${BTN_BASE} bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20 hover:border-red-500/40`,
  violet: `${BTN_BASE} bg-violet-500/10 text-violet-400 border-violet-500/20 hover:bg-violet-500/20 hover:border-violet-500/40`,
  ghost: `${BTN_BASE} bg-transparent text-zinc-500 border-white/10 hover:text-zinc-300 hover:border-white/20`,
};

type Panel = 'approve' | 'deny' | 'p2p' | null;

/**
 * One queue row: linked header (name / badges / dates) + inline PA actions.
 * Mutations mirror the canonical pipeline gates — the server re-validates all of them.
 */
export function PaQueueCard({
  client,
  kind,
  icon: Icon,
  desc,
  accent,
}: {
  client: any;
  kind: PaKind;
  icon: React.ElementType;
  desc: string;
  accent: QueueAccent;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [panel, setPanel] = useState<Panel>(null);
  const [isPending, startTransition] = useTransition();

  // Approve form
  const [authNumber, setAuthNumber] = useState('');
  const [units, setUnits] = useState('');
  const [effectiveDate, setEffectiveDate] = useState('');
  const [expirationDate, setExpirationDate] = useState('');
  // Deny form
  const [isClinical, setIsClinical] = useState(false);
  const [denialReason, setDenialReason] = useState('');
  // P2P form
  const [p2pNotes, setP2pNotes] = useState('');

  const pa = getPa(client, kind);
  const { hoverBorder, hoverText } = ACCENTS[accent];
  const unreadCount =
    client.messages?.filter((m: any) => m.isFromClient && !m.readAt).length || 0;

  const vobDone = pa ? !!pa.vobCompleted && !!pa.providerCredentialed : false;
  const showVob = kind === 'ASSESSMENT' && (!pa || !vobDone) && pa?.status !== 'APPROVED';
  const showSubmit =
    kind === 'ASSESSMENT'
      ? !!pa && vobDone && pa.status === 'NOT_STARTED'
      : (!pa && client.status === 'REPORT_ASSEMBLED') || pa?.status === 'NOT_STARTED';
  const decidable =
    !!pa && ['SUBMITTED', 'DENIED_CLERICAL', 'DENIED_CLINICAL'].includes(pa.status);
  const p2pPending = pa?.status === 'DENIED_CLINICAL' && !pa?.p2pResolved;

  const expDays = daysUntil(pa?.expirationDate);
  const fmt = (d: string | Date | null | undefined) =>
    mounted && d ? new Date(d).toLocaleDateString() : '—';

  const run = (fn: () => Promise<{ success: boolean; error?: string }>, okMsg: string) => {
    startTransition(async () => {
      const result = await fn();
      if (result.success) {
        toast.success(okMsg);
        setPanel(null);
      } else {
        toast.error(result.error || 'Action failed. Please try again.');
      }
    });
  };

  const handleSubmitPa = () =>
    run(
      () =>
        kind === 'ASSESSMENT'
          ? markAssessmentPaSubmitted(client.id)
          : markTreatmentPaSubmitted(client.id),
      `${kind === 'ASSESSMENT' ? 'Assessment' : 'Treatment'} PA marked submitted.`
    );

  const handleApprove = () => {
    if (!authNumber.trim()) return void toast.error('Auth number is required.');
    if (!units || Number(units) <= 0) return void toast.error('Approved units must be positive.');
    if (!effectiveDate || !expirationDate)
      return void toast.error('Effective and expiration dates are required.');
    if (p2pPending)
      return void toast.error('Resolve the Peer-to-Peer review before recording an approval.');
    run(
      () =>
        recordPaApproval(pa.id, {
          authNumber,
          approvedUnits: Number(units),
          effectiveDate,
          expirationDate,
        }),
      'PA approval recorded.'
    );
  };

  const handleDeny = () => {
    if (!denialReason.trim()) return void toast.error('A denial reason is required.');
    run(
      () => recordPaDenial(pa.id, { isClinical, reason: denialReason }),
      `Denial logged${isClinical ? ' — P2P opened for the BCBA' : ''}.`
    );
  };

  const handleP2p = () => {
    if (!p2pNotes.trim()) return void toast.error('P2P resolution notes are required.');
    run(() => resolvePaP2p(pa.id, p2pNotes), 'P2P resolution logged.');
  };

  return (
    <Card
      className={`bg-zinc-950/80 backdrop-blur-xl border border-white/10 ${hoverBorder} transition-all duration-300 group mb-3 shadow-xl rounded-2xl overflow-hidden hover:shadow-2xl ${panel ? '' : 'hover:scale-[1.01]'}`}
    >
      <Link href={`/client/${client.id}?tab=billing`} className="block p-4 pb-3 cursor-pointer">
        <div className="flex justify-between items-start gap-3">
          <div className="min-w-0 space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <h4
                className={`font-heading font-bold text-white ${hoverText} transition-colors text-sm truncate`}
              >
                {client.firstName} {client.lastName}
              </h4>
              {unreadCount > 0 && (
                <span className="bg-rose-500/90 text-white text-[10px] font-bold px-2 py-0.5 rounded-full leading-none shadow-md">
                  {unreadCount} new
                </span>
              )}
            </div>
            <p className="text-xs text-zinc-400 font-sans leading-relaxed">{desc}</p>
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
              <div className="text-[10px] font-mono text-zinc-500 space-y-0.5 pt-1">
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
            className={`w-8 h-8 rounded-xl bg-zinc-900/80 border border-white/10 flex items-center justify-center text-zinc-400 ${hoverText} group-hover:border-white/20 transition-all shrink-0 shadow-sm`}
          >
            <Icon className="w-4 h-4" />
          </div>
        </div>
      </Link>

      {pa?.p2pNotes && (pa.status?.startsWith('DENIED') || pa.p2pResolved) && (
        <div
          className={`mx-4 mb-3 bg-zinc-950 border-l-2 ${pa.p2pResolved ? 'border-violet-500' : 'border-red-500'} p-2.5 rounded-r-lg`}
        >
          <p className="text-[9px] text-zinc-500 font-mono font-bold uppercase tracking-wider mb-0.5">
            {pa.p2pResolved ? 'P2P resolution notes' : 'Denial reason'}
          </p>
          <p className="text-xs text-zinc-300 italic leading-relaxed">“{pa.p2pNotes}”</p>
        </div>
      )}

      <div className="px-4 pb-4 space-y-3">
        {(showVob || showSubmit || decidable || p2pPending) && (
          <div className="flex flex-wrap gap-2 border-t border-white/5 pt-3">
            {showVob && (
              <button
                type="button"
                disabled={isPending}
                className={BTN.amber}
                onClick={() => run(() => markVobComplete(client.id), 'VOB & credentialing recorded.')}
              >
                {isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <ShieldCheck className="w-3 h-3" />}
                VOB &amp; creds done
              </button>
            )}
            {showSubmit && (
              <button type="button" disabled={isPending} className={BTN.amber} onClick={handleSubmitPa}>
                {isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                Mark submitted
              </button>
            )}
            {decidable && (
              <>
                <button
                  type="button"
                  disabled={isPending || p2pPending}
                  title={p2pPending ? 'Resolve P2P before approving' : undefined}
                  className={BTN.green}
                  onClick={() => setPanel(panel === 'approve' ? null : 'approve')}
                >
                  <Check className="w-3 h-3" />
                  Approve
                </button>
                <button
                  type="button"
                  disabled={isPending}
                  className={BTN.red}
                  onClick={() => setPanel(panel === 'deny' ? null : 'deny')}
                >
                  <ShieldX className="w-3 h-3" />
                  Deny
                </button>
              </>
            )}
            {p2pPending && (
              <button
                type="button"
                disabled={isPending}
                className={BTN.violet}
                onClick={() => setPanel(panel === 'p2p' ? null : 'p2p')}
              >
                <PhoneCall className="w-3 h-3" />
                Log P2P outcome
              </button>
            )}
          </div>
        )}

        {panel === 'approve' && (
          <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-3 space-y-2 animate-fade-in-up">
            <p className="text-[10px] font-mono font-bold uppercase tracking-wider text-green-400">
              Record payer approval
            </p>
            <input
              className={INPUT_CLS}
              placeholder="Auth number"
              value={authNumber}
              onChange={(e) => setAuthNumber(e.target.value)}
            />
            <div className="grid grid-cols-3 gap-2">
              <input
                className={INPUT_CLS}
                type="number"
                min={1}
                placeholder="Units"
                value={units}
                onChange={(e) => setUnits(e.target.value)}
              />
              <input
                className={INPUT_CLS}
                type="date"
                title="Effective date"
                value={effectiveDate}
                onChange={(e) => setEffectiveDate(e.target.value)}
              />
              <input
                className={INPUT_CLS}
                type="date"
                title="Expiration date"
                value={expirationDate}
                onChange={(e) => setExpirationDate(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <button type="button" disabled={isPending} className={BTN.green} onClick={handleApprove}>
                {isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                Save approval
              </button>
              <button type="button" className={BTN.ghost} onClick={() => setPanel(null)}>
                <X className="w-3 h-3" />
                Cancel
              </button>
            </div>
          </div>
        )}

        {panel === 'deny' && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3 space-y-2 animate-fade-in-up">
            <p className="text-[10px] font-mono font-bold uppercase tracking-wider text-red-400">
              Log payer denial
            </p>
            <div className="flex gap-2">
              {[
                { v: false, label: 'Clerical (resubmit fix)' },
                { v: true, label: 'Clinical (opens P2P)' },
              ].map((opt) => (
                <button
                  key={String(opt.v)}
                  type="button"
                  onClick={() => setIsClinical(opt.v)}
                  className={`${BTN_BASE} ${
                    isClinical === opt.v
                      ? 'bg-red-500/15 text-red-300 border-red-500/40'
                      : 'bg-transparent text-zinc-500 border-white/10 hover:text-zinc-300'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <textarea
              className={`${INPUT_CLS} min-h-[64px] resize-y font-sans`}
              placeholder="Denial reason from the payer (required)"
              value={denialReason}
              onChange={(e) => setDenialReason(e.target.value)}
            />
            <div className="flex gap-2">
              <button type="button" disabled={isPending} className={BTN.red} onClick={handleDeny}>
                {isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <ShieldX className="w-3 h-3" />}
                Save denial
              </button>
              <button type="button" className={BTN.ghost} onClick={() => setPanel(null)}>
                <X className="w-3 h-3" />
                Cancel
              </button>
            </div>
          </div>
        )}

        {panel === 'p2p' && (
          <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-3 space-y-2 animate-fade-in-up">
            <p className="text-[10px] font-mono font-bold uppercase tracking-wider text-violet-400">
              Peer-to-Peer resolution
            </p>
            <textarea
              className={`${INPUT_CLS} min-h-[64px] resize-y font-sans`}
              placeholder="Outcome of the P2P call with the payer's medical director (required)"
              value={p2pNotes}
              onChange={(e) => setP2pNotes(e.target.value)}
            />
            <div className="flex gap-2">
              <button type="button" disabled={isPending} className={BTN.violet} onClick={handleP2p}>
                {isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <PhoneCall className="w-3 h-3" />}
                Mark P2P resolved
              </button>
              <button type="button" className={BTN.ghost} onClick={() => setPanel(null)}>
                <X className="w-3 h-3" />
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between border-t border-white/5 pt-3">
          <span className="text-[10px] text-zinc-500 font-mono uppercase font-bold tracking-wider">
            Updated {mounted ? new Date(client.updatedAt).toLocaleDateString() : '—'}
          </span>
          <Link
            href={`/client/${client.id}?tab=billing`}
            className={`inline-flex items-center gap-1 text-[10px] font-mono text-zinc-500 ${hoverText} cursor-pointer`}
          >
            Open billing
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
          </Link>
        </div>
      </div>
    </Card>
  );
}
