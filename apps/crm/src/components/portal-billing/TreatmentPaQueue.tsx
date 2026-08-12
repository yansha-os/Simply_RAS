'use client';

/**
 * Treatment PA manual Plutus tracker queue.
 * Status mutations: `@/app/(dashboard)/portal-case/actions/billing.ts` (canonical),
 * surfaced inline via `portal-billing/actions.ts` wrappers (see PaQueueShared).
 * No EDI / payer API — submitted / approved / denied + auth numbers only.
 */

import React from 'react';
import { Clock, FilePlus, RefreshCw, ShieldCheck } from 'lucide-react';
import {
  EmptyColumn,
  PaQueueCard,
  QueueSearchInput,
  daysUntil,
  filterClientsByQuery,
  getPa,
} from './PaQueueShared';

function treatmentPa(client: any) {
  return getPa(client, 'TREATMENT');
}

function hasParentTreatmentSignature(client: any): boolean {
  const plan = client.treatmentPlan;
  if (!plan || typeof plan !== 'object') return false;
  return !!(plan as { parentSignature?: unknown }).parentSignature;
}

export default function TreatmentPaQueue({ clients }: { clients: any[] }) {
  const [query, setQuery] = React.useState('');
  const visible = filterClientsByQuery(clients, query);

  const pendingTxPaQueue = visible.filter((c) => {
    const pa = treatmentPa(c);
    if (pa) return pa.status === 'NOT_STARTED';
    return c.status === 'REPORT_ASSEMBLED' && hasParentTreatmentSignature(c);
  });

  const submittedQueue = visible.filter((c) => {
    if (pendingTxPaQueue.some((p) => p.id === c.id)) return false;
    const pa = treatmentPa(c);
    if (pa) {
      return ['SUBMITTED', 'DENIED_CLERICAL', 'DENIED_CLINICAL'].includes(pa.status);
    }
    return c.status === 'TX_PA_SUBMITTED';
  });

  const expiringQueue = visible.filter((c) => {
    const pa = treatmentPa(c);
    if (!pa || pa.status !== 'APPROVED' || !pa.expirationDate) return false;
    const days = daysUntil(pa.expirationDate);
    return days !== null && days <= 45;
  });

  const noResults =
    query.trim() !== '' &&
    pendingTxPaQueue.length + submittedQueue.length + expiringQueue.length === 0;

  return (
    <div className="space-y-8 mt-2 pb-8 animate-fade-in-up">
      <div className="relative overflow-hidden p-7 rounded-3xl bg-zinc-950/80 border border-white/10 shadow-2xl backdrop-blur-2xl">
        <div className="absolute top-0 right-1/4 w-80 h-80 bg-brand-orange-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-8 w-72 h-72 bg-sky-500/8 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-orange-500/10 border border-brand-orange-500/20 text-brand-orange-400 font-mono text-[11px] font-bold">
            <span className="dot-live" />
            TREATMENT PA · MANUAL PLUTUS TRACKER
          </div>
          <h1 className="text-2xl lg:text-3xl font-extrabold text-white font-heading tracking-tight">
            Treatment PA{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-orange-400 via-amber-300 to-sky-300">
              Queue
            </span>
          </h1>
          <p className="text-sm text-zinc-400 max-w-2xl font-sans leading-relaxed">
            Clients with parent-signed treatment plans and live TREATMENT PARequest rows. Submit and
            track 97153 / 97155 / 97156 in Plutus manually — record approvals, denials with reason,
            and P2P outcomes inline. Approval hands the client to Case Coord staffing.
          </p>
          <div className="flex flex-col lg:flex-row lg:items-center gap-3 pt-1">
            <QueueSearchInput
              value={query}
              onChange={setQuery}
              placeholder="Search clients by name…"
            />
            <div className="flex flex-wrap gap-3">
              {[
                { label: 'Submit', count: pendingTxPaQueue.length, cls: 'bg-brand-orange-500/10 text-brand-orange-400 border-brand-orange-500/20' },
                { label: 'Tracking', count: submittedQueue.length, cls: 'bg-sky-500/10 text-sky-400 border-sky-500/20' },
                { label: 'Re-auth', count: expiringQueue.length, cls: 'bg-rose-500/10 text-rose-400 border-rose-500/20' },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-mono font-bold ${stat.cls}`}
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  {stat.label}
                  <span className="opacity-80">{stat.count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {noResults && (
        <EmptyColumn message={`No treatment-phase clients match “${query.trim()}”.`} />
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-brand-orange-500/30 pb-3 px-1">
            <h2 className="font-bold text-white text-sm flex items-center font-heading">
              <FilePlus className="w-4 h-4 text-brand-orange-500 mr-2" />
              1. Submit Treatment PA
            </h2>
            <span className="bg-brand-orange-500/10 text-brand-orange-400 border border-brand-orange-500/20 px-2.5 py-0.5 rounded-full text-xs font-mono font-bold">
              {pendingTxPaQueue.length}
            </span>
          </div>
          <div>
            {pendingTxPaQueue.length === 0 && !noResults && (
              <EmptyColumn message="No clients ready for Treatment PA submission (needs REPORT_ASSEMBLED + parent signature)." />
            )}
            {pendingTxPaQueue.map((c) => (
              <PaQueueCard
                key={c.id}
                client={c}
                kind="TREATMENT"
                icon={FilePlus}
                accent="orange"
                desc="Ready to submit 97153, 97155, 97156 in Plutus."
              />
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-sky-500/30 pb-3 px-1">
            <h2 className="font-bold text-white text-sm flex items-center font-heading">
              <Clock className="w-4 h-4 text-sky-400 mr-2" />
              2. PA Tracking
            </h2>
            <span className="bg-sky-500/10 text-sky-400 border border-sky-500/20 px-2.5 py-0.5 rounded-full text-xs font-mono font-bold">
              {submittedQueue.length}
            </span>
          </div>
          <div>
            {submittedQueue.length === 0 && !noResults && (
              <EmptyColumn message="No Treatment PAs awaiting payer decision or denial follow-up." />
            )}
            {submittedQueue.map((c) => {
              const pa = treatmentPa(c);
              const desc = pa?.status?.startsWith('DENIED')
                ? 'Denial logged — resolve and re-decision inline or in the Billing tab.'
                : 'Awaiting payer decision on treatment authorization.';
              return (
                <PaQueueCard
                  key={c.id}
                  client={c}
                  kind="TREATMENT"
                  icon={Clock}
                  accent="sky"
                  desc={desc}
                />
              );
            })}
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-rose-500/30 pb-3 px-1">
            <h2 className="font-bold text-white text-sm flex items-center font-heading">
              <RefreshCw className="w-4 h-4 text-rose-400 mr-2" />
              3. Re-Authorization Needed
            </h2>
            <span className="bg-rose-500/10 text-rose-400 border border-rose-500/20 px-2.5 py-0.5 rounded-full text-xs font-mono font-bold">
              {expiringQueue.length}
            </span>
          </div>
          <div>
            {expiringQueue.length === 0 && !noResults && (
              <EmptyColumn message="No approved Treatment auths expiring within 45 days." />
            )}
            {expiringQueue.map((c) => {
              const pa = treatmentPa(c);
              const days = daysUntil(pa?.expirationDate);
              return (
                <PaQueueCard
                  key={c.id}
                  client={c}
                  kind="TREATMENT"
                  icon={RefreshCw}
                  accent="rose"
                  desc={
                    days === null
                      ? 'Re-authorization window.'
                      : days < 0
                        ? `Auth expired ${Math.abs(days)} days ago.`
                        : `Expires in ${days} days — start re-auth.`
                  }
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
