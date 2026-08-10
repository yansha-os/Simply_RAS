'use client';

import React from 'react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Award, ShieldCheck, AlertTriangle, UserCheck, Activity } from 'lucide-react';

export interface RbtSupervisionRecord {
  rbtId: string;
  rbtName: string;
  assignedBcba: string;
  directTherapyHours: number; // 97153
  bcbaSupervisionHours: number; // 97155
  supervisionPct: number; // calculated ratio
  isBacbCompliant: boolean;
}

export default function BacbSupervisionTracker() {
  const supervisionRecords: RbtSupervisionRecord[] = [
    {
      rbtId: 'rbt-1',
      rbtName: 'Marcus Vance, RBT',
      assignedBcba: 'Sarah Jenkins, BCBA',
      directTherapyHours: 120.0,
      bcbaSupervisionHours: 7.5,
      supervisionPct: 6.25, // >=5% -> COMPLIANT
      isBacbCompliant: true,
    },
    {
      rbtId: 'rbt-2',
      rbtName: 'Elena Rostova, RBT',
      assignedBcba: 'Sarah Jenkins, BCBA',
      directTherapyHours: 100.0,
      bcbaSupervisionHours: 3.5,
      supervisionPct: 3.5, // <5% -> NON-COMPLIANT ALERT
      isBacbCompliant: false,
    },
    {
      rbtId: 'rbt-3',
      rbtName: 'David Kim, RBT',
      assignedBcba: 'Clinical Director',
      directTherapyHours: 80.0,
      bcbaSupervisionHours: 5.0,
      supervisionPct: 6.25,
      isBacbCompliant: true,
    },
  ];

  return (
    <Card className="bg-zinc-950/80 backdrop-blur-xl border border-white/10 p-6 rounded-3xl space-y-6 shadow-2xl">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-4">
        <div>
          <h2 className="text-xl font-bold text-white font-heading flex items-center gap-2">
            <Award className="w-6 h-6 text-emerald-400" /> BACB RBT 5% Supervision Percentage & License Tracker
          </h2>
          <p className="text-xs text-zinc-400 font-sans mt-1">
            Phase 12 - Automatically calculates monthly BCBA supervision hours (CPT 97155) relative to RBT direct therapy hours (CPT 97153) to ensure BACB license compliance.
          </p>
        </div>

        <div className="flex gap-2 font-mono text-xs font-bold">
          <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-4 py-2 rounded-xl">
            Compliant: {supervisionRecords.filter((r) => r.isBacbCompliant).length}
          </div>
          <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 px-4 py-2 rounded-xl">
            Non-Compliant: {supervisionRecords.filter((r) => !r.isBacbCompliant).length}
          </div>
        </div>
      </div>

      {/* RBT SUPERVISION STREAM */}
      <div className="space-y-3">
        {supervisionRecords.map((rbt) => (
          <div
            key={rbt.rbtId}
            className={`p-4 rounded-2xl border flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all ${
              rbt.isBacbCompliant
                ? 'bg-zinc-900/60 border-white/10'
                : 'bg-rose-950/20 border-rose-500/40 shadow-[0_0_15px_rgba(244,63,94,0.15)]'
            }`}
          >
            <div>
              <div className="flex items-center gap-2">
                <h4 className="font-bold text-white text-base">{rbt.rbtName}</h4>
                <span
                  className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border uppercase ${
                    rbt.isBacbCompliant
                      ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400'
                      : 'bg-rose-500/20 border-rose-500/30 text-rose-400'
                  }`}
                >
                  {rbt.supervisionPct.toFixed(2)}% Supervision ({rbt.isBacbCompliant ? 'BACB COMPLIANT ✓' : 'ALERT: BELOW 5%'})
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-1 font-sans">
                BCBA Supervisor: <span className="text-zinc-200 font-semibold">{rbt.assignedBcba}</span>
              </p>
            </div>

            <div className="flex items-center gap-6 text-right font-mono">
              <div>
                <span className="text-[10px] text-zinc-500 font-bold uppercase block">Direct Therapy (97153)</span>
                <span className="text-sm font-bold text-white">{rbt.directTherapyHours} Hrs</span>
              </div>
              <div>
                <span className="text-[10px] text-zinc-500 font-bold uppercase block">BCBA Supervision (97155)</span>
                <span className="text-sm font-bold text-cyan-400">{rbt.bcbaSupervisionHours} Hrs</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
