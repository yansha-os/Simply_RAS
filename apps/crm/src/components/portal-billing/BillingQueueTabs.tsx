'use client';

import React, { useState } from 'react';
import BillingPaQueue from './BillingPaQueue';
import TreatmentPaQueue from './TreatmentPaQueue';

/** Clients whose PA of this type is denied (clerical, or clinical with P2P unresolved). */
function attentionCount(clients: any[], type: 'ASSESSMENT' | 'TREATMENT') {
  return clients.filter((c) =>
    c.paRequests?.some(
      (p: any) =>
        p.type === type &&
        (p.status === 'DENIED_CLERICAL' || (p.status === 'DENIED_CLINICAL' && !p.p2pResolved))
    )
  ).length;
}

export default function BillingQueueTabs({
  assessmentClients,
  treatmentClients,
}: {
  assessmentClients: any[];
  treatmentClients: any[];
}) {
  const [activeTab, setActiveTab] = useState<'assessment' | 'treatment'>('assessment');

  const assessmentAttention = attentionCount(assessmentClients, 'ASSESSMENT');
  const treatmentAttention = attentionCount(treatmentClients, 'TREATMENT');

  return (
    <div className="space-y-6">
      <div className="flex gap-2 border-b border-white/10 pb-0">
        <button
          type="button"
          onClick={() => setActiveTab('assessment')}
          className={`cursor-pointer pb-3 px-3 text-sm font-semibold transition-all border-b-2 -mb-px ${
            activeTab === 'assessment'
              ? 'border-emerald-500 text-emerald-400'
              : 'border-transparent text-zinc-500 hover:text-zinc-300'
          }`}
        >
          Assessment PAs (97151)
          <span className="ml-2 font-mono text-[10px] opacity-70">
            {assessmentClients.length}
          </span>
          {assessmentAttention > 0 && (
            <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-red-500/10 text-red-400 border border-red-500/20">
              {assessmentAttention} denied
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('treatment')}
          className={`cursor-pointer pb-3 px-3 text-sm font-semibold transition-all border-b-2 -mb-px ${
            activeTab === 'treatment'
              ? 'border-brand-orange-500 text-brand-orange-400'
              : 'border-transparent text-zinc-500 hover:text-zinc-300'
          }`}
        >
          Treatment PAs (97153 / 97155 / 97156)
          <span className="ml-2 font-mono text-[10px] opacity-70">
            {treatmentClients.length}
          </span>
          {treatmentAttention > 0 && (
            <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-red-500/10 text-red-400 border border-red-500/20">
              {treatmentAttention} denied
            </span>
          )}
        </button>
      </div>

      <div className="animate-in fade-in duration-300">
        {activeTab === 'assessment' ? (
          <BillingPaQueue clients={assessmentClients} />
        ) : (
          <TreatmentPaQueue clients={treatmentClients} />
        )}
      </div>
    </div>
  );
}
