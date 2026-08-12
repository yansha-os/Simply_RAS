'use client';

/**
 * Assessment PA / VOB manual Plutus tracker queue.
 * Status mutations: `@/app/(dashboard)/portal-case/actions/billing.ts` (canonical),
 * surfaced inline via `portal-billing/actions.ts` wrappers (see PaQueueShared).
 * No EDI / payer API — VOB, submitted / approved / denied + auth numbers only.
 */

import React from 'react';
import { Clock, FileCheck, ShieldAlert, ShieldCheck } from 'lucide-react';
import {
  EmptyColumn,
  PaQueueCard,
  QueueSearchInput,
  daysUntil,
  filterClientsByQuery,
  getPa,
} from './PaQueueShared';

function assessmentPa(client: any) {
  return getPa(client, 'ASSESSMENT');
}

export default function BillingPaQueue({ clients }: { clients: any[] }) {
  const [query, setQuery] = React.useState('');
  const visible = filterClientsByQuery(clients, query);

  const pendingVobQueue = visible.filter((c) => {
    const pa = assessmentPa(c);
    if (pa?.status === 'APPROVED') return false;
    if (pa) return !pa.vobCompleted || !pa.providerCredentialed;
    return c.status === 'CLINICAL_REVIEW_APPROVED';
  });

  const submittedQueue = visible.filter((c) => {
    if (pendingVobQueue.some((p) => p.id === c.id)) return false;
    const pa = assessmentPa(c);
    if (pa) {
      if (!pa.vobCompleted || !pa.providerCredentialed) return false;
      return ['NOT_STARTED', 'SUBMITTED', 'DENIED_CLERICAL', 'DENIED_CLINICAL'].includes(
        pa.status
      );
    }
    return c.status === 'VOB_COMPLETED' || c.status === 'PA_SUBMITTED';
  });

  const expiringQueue = visible.filter((c) => {
    const pa = assessmentPa(c);
    if (!pa || pa.status !== 'APPROVED' || !pa.expirationDate) return false;
    const days = daysUntil(pa.expirationDate);
    return days !== null && days <= 45;
  });

  const noResults =
    query.trim() !== '' &&
    pendingVobQueue.length + submittedQueue.length + expiringQueue.length === 0;

  return (
    <div className="space-y-8 mt-2 pb-8 animate-fade-in-up">
      <div className="relative overflow-hidden p-7 rounded-3xl bg-zinc-950/80 border border-white/10 shadow-2xl backdrop-blur-2xl">
        <div className="absolute top-0 right-1/4 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-8 w-72 h-72 bg-teal-500/8 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-mono text-[11px] font-bold">
              <span className="dot-live" />
              ASSESSMENT PA · MANUAL PLUTUS TRACKER
            </div>
            <h1 className="text-2xl lg:text-3xl font-extrabold text-white font-heading tracking-tight">
              VOB &amp; Assessment PA{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-teal-300 to-amber-300">
                Queue
              </span>
            </h1>
            <p className="text-sm text-zinc-400 max-w-2xl font-sans leading-relaxed">
              Real clients from the database — verify benefits, credentialing, and record 97151 Prior
              Authorization decisions inline (approve, deny with reason, P2P). Manual tracker only; no EDI.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2.5 flex-shrink-0">
            {[
              { code: '97151', label: 'Assessment', tone: 'text-emerald-400' },
              { code: '97153', label: 'Direct RBT', tone: 'text-teal-400' },
              { code: '97155', label: 'Protocol mod · qualified clinician', tone: 'text-violet-400' },
            ].map((cpt) => (
              <div
                key={cpt.code}
                className="p-3 bg-zinc-900/90 rounded-2xl border border-white/10 text-center font-mono backdrop-blur-xl"
              >
                <span className={`text-[10px] ${cpt.tone} font-bold block`}>CPT {cpt.code}</span>
                <span className="text-xs text-zinc-300 font-bold mt-1 block">{cpt.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10 mt-5 flex flex-col lg:flex-row lg:items-center gap-3">
          <QueueSearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search clients by name…"
          />
          <div className="flex flex-wrap gap-3">
            {[
              { label: 'Pending VOB', count: pendingVobQueue.length, cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
              { label: 'In flight', count: submittedQueue.length, cls: 'bg-teal-500/10 text-teal-400 border-teal-500/20' },
              { label: 'Expiring', count: expiringQueue.length, cls: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
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

      {noResults && (
        <EmptyColumn message={`No assessment-phase clients match “${query.trim()}”.`} />
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="space-y-4">
          <div className="flex justify-between items-center px-1 border-b border-emerald-500/20 pb-3">
            <h3 className="font-bold text-white text-sm flex items-center gap-2 font-heading">
              <Clock className="w-4 h-4 text-emerald-400" />
              1. Pending VOB / Credentialing
            </h3>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              {pendingVobQueue.length}
            </span>
          </div>
          <div>
            {pendingVobQueue.length === 0 && !noResults && (
              <EmptyColumn message="No clients awaiting VOB or credentialing." />
            )}
            {pendingVobQueue.map((c) => (
              <PaQueueCard
                key={c.id}
                client={c}
                kind="ASSESSMENT"
                icon={Clock}
                accent="emerald"
                desc="Verify benefits, copay, deductible, and provider credentialing."
              />
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex justify-between items-center px-1 border-b border-teal-500/20 pb-3">
            <h3 className="font-bold text-white text-sm flex items-center gap-2 font-heading">
              <FileCheck className="w-4 h-4 text-teal-400" />
              2. Submit / Track Assessment PA
            </h3>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-teal-500/10 text-teal-400 border border-teal-500/20">
              {submittedQueue.length}
            </span>
          </div>
          <div>
            {submittedQueue.length === 0 && !noResults && (
              <EmptyColumn message="No Assessment PAs ready to submit or awaiting payer decision." />
            )}
            {submittedQueue.map((c) => {
              const pa = assessmentPa(c);
              const desc =
                pa?.status === 'NOT_STARTED'
                  ? 'VOB complete — submit 97151 PA in Plutus, then mark submitted.'
                  : pa?.status?.startsWith('DENIED')
                    ? 'Denial logged — resolve clerical fix or P2P, then re-decision.'
                    : 'PA submitted to insurer — awaiting authorization decision.';
              return (
                <PaQueueCard
                  key={c.id}
                  client={c}
                  kind="ASSESSMENT"
                  icon={FileCheck}
                  accent="teal"
                  desc={desc}
                />
              );
            })}
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex justify-between items-center px-1 border-b border-amber-500/20 pb-3">
            <h3 className="font-bold text-white text-sm flex items-center gap-2 font-heading">
              <ShieldAlert className="w-4 h-4 text-amber-400" />
              3. Expiring Assessment Auth (&lt;45d)
            </h3>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
              {expiringQueue.length}
            </span>
          </div>
          <div>
            {expiringQueue.length === 0 && !noResults && (
              <EmptyColumn message="No approved Assessment auths expiring within 45 days." />
            )}
            {expiringQueue.map((c) => (
              <PaQueueCard
                key={c.id}
                client={c}
                kind="ASSESSMENT"
                icon={ShieldAlert}
                accent="amber"
                desc="Authorization window closing — plan re-auth or handoff to treatment PA."
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
