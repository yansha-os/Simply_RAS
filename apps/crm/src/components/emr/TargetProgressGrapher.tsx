'use client';

import React from 'react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Award, TrendingUp, CheckCircle, Flame, Layers, ArrowRight } from 'lucide-react';

export interface GraphSessionPoint {
  sessionDate: string;
  accuracyPct: number;
  totalTrials: number;
  phaseLine?: string; // e.g. "Baseline End", "Prompt Fading"
}

export default function TargetProgressGrapher({
  targetTitle,
  domain,
  masteryCriteria = '80% over 3 consecutive sessions',
  targetStatus = 'IN_PROGRESS',
  sessionData = [],
}: {
  targetTitle: string;
  domain: string;
  masteryCriteria?: string;
  targetStatus?: string;
  sessionData?: GraphSessionPoint[];
}) {
  // Default mock session points if empty for preview
  const dataPoints: GraphSessionPoint[] = sessionData.length > 0 ? sessionData : [
    { sessionDate: '10/01', accuracyPct: 40, totalTrials: 10 },
    { sessionDate: '10/03', accuracyPct: 55, totalTrials: 12 },
    { sessionDate: '10/05', accuracyPct: 60, totalTrials: 10, phaseLine: 'Prompt Fade' },
    { sessionDate: '10/08', accuracyPct: 80, totalTrials: 15 },
    { sessionDate: '10/10', accuracyPct: 85, totalTrials: 15 },
    { sessionDate: '10/12', accuracyPct: 90, totalTrials: 15 },
  ];

  // Evaluate automatic mastery (e.g. last 3 sessions >= 80%)
  const last3 = dataPoints.slice(-3);
  const isMasteredByRules = last3.length >= 3 && last3.every((p) => p.accuracyPct >= 80);

  return (
    <Card className="bg-zinc-950/80 backdrop-blur-xl border border-white/10 p-6 rounded-3xl space-y-6 shadow-2xl">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider">
              {domain}
            </span>
            {isMasteredByRules && (
              <span className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1">
                <Award className="w-3 h-3" /> AUTO-MASTERY CRITERIA MET
              </span>
            )}
          </div>
          <h3 className="text-xl font-bold text-white font-heading mt-1.5">{targetTitle}</h3>
          <p className="text-xs text-zinc-400 font-sans mt-0.5">
            Mastery Target: <span className="text-zinc-200 font-medium">{masteryCriteria}</span>
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="bg-zinc-900 border border-white/10 px-4 py-2 rounded-2xl text-right">
            <span className="text-[10px] font-mono font-bold text-zinc-500 uppercase block">Current Status</span>
            <span className={`text-xs font-black uppercase font-mono ${targetStatus === 'MASTERED' || isMasteredByRules ? 'text-emerald-400' : 'text-amber-400'}`}>
              {targetStatus === 'MASTERED' || isMasteredByRules ? 'MASTERED ✓' : targetStatus}
            </span>
          </div>
        </div>
      </div>

      {/* VISUAL ABA PROGRESS CHART WITH PHASE LINES */}
      <div className="space-y-2">
        <div className="flex justify-between items-center text-xs font-mono text-zinc-400">
          <span>Session Accuracy Progression (%)</span>
          <span>Target Threshold: 80%</span>
        </div>

        <div className="h-48 bg-zinc-900/80 border border-white/10 rounded-2xl p-4 flex items-end justify-between gap-3 relative overflow-hidden">
          {/* 80% Benchmark Line */}
          <div className="absolute left-0 right-0 border-b border-dashed border-emerald-500/40 text-[9px] font-mono text-emerald-400/80 px-2 flex justify-between" style={{ bottom: '80%' }}>
            <span>80% Mastery Line</span>
          </div>

          {dataPoints.map((point, idx) => (
            <div key={idx} className="flex-1 flex flex-col items-center gap-2 h-full justify-end relative group">
              {/* Phase Line Indicator */}
              {point.phaseLine && (
                <div className="absolute top-0 bottom-0 border-l-2 border-cyan-500/80 z-10 flex flex-col items-center">
                  <span className="bg-cyan-600 text-white text-[9px] font-mono font-bold px-1.5 py-0.5 rounded shadow-sm whitespace-nowrap -mt-2">
                    │ {point.phaseLine}
                  </span>
                </div>
              )}

              {/* Data Bar */}
              <div
                className={`w-full max-w-[36px] rounded-t-xl transition-all duration-500 group-hover:brightness-125 relative ${point.accuracyPct >= 80 ? 'bg-gradient-to-t from-emerald-600 to-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.3)]' : 'bg-gradient-to-t from-cyan-700 to-cyan-500'}`}
                style={{ height: `${Math.max(point.accuracyPct, 10)}%` }}
              >
                <div className="absolute -top-6 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-zinc-950 text-white text-[10px] font-mono font-bold px-2 py-0.5 rounded border border-white/20 shadow-lg pointer-events-none whitespace-nowrap z-20">
                  {point.accuracyPct}% ({point.totalTrials} trials)
                </div>
              </div>

              {/* Date Label */}
              <span className="text-[10px] font-mono text-zinc-400 font-bold">{point.sessionDate}</span>
            </div>
          ))}
        </div>
      </div>

      {/* FOOTER STATS SUMMARY */}
      <div className="grid grid-cols-3 gap-4 pt-2 border-t border-white/5">
        <div className="bg-zinc-900/50 p-3 rounded-xl border border-white/5 text-center">
          <span className="text-[10px] font-mono text-zinc-500 font-bold uppercase block">Total Sessions</span>
          <span className="text-base font-black text-white font-mono">{dataPoints.length}</span>
        </div>
        <div className="bg-zinc-900/50 p-3 rounded-xl border border-white/5 text-center">
          <span className="text-[10px] font-mono text-zinc-500 font-bold uppercase block">Latest Accuracy</span>
          <span className="text-base font-black text-emerald-400 font-mono">
            {dataPoints[dataPoints.length - 1]?.accuracyPct || 0}%
          </span>
        </div>
        <div className="bg-zinc-900/50 p-3 rounded-xl border border-white/5 text-center">
          <span className="text-[10px] font-mono text-zinc-500 font-bold uppercase block">Phase Changes</span>
          <span className="text-base font-black text-cyan-400 font-mono">
            {dataPoints.filter((p) => p.phaseLine).length}
          </span>
        </div>
      </div>
    </Card>
  );
}
