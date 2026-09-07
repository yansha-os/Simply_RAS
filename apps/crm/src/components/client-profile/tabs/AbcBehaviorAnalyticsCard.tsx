'use client';

import React, { useState } from 'react';
import {
  ShieldAlert,
  Brain,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  analyzeAbcBehaviorFunctions,
  type AbcIncident,
  type BehaviorFunctionBreakdown,
} from '@/lib/clinicalMasteryEngine';

type AbcBehaviorAnalyticsCardProps = {
  incidents: AbcIncident[];
};

export function AbcBehaviorAnalyticsCard({ incidents }: AbcBehaviorAnalyticsCardProps) {
  const [isCrisisPlanExpanded, setIsCrisisPlanExpanded] = useState(false);

  const breakdown: BehaviorFunctionBreakdown = analyzeAbcBehaviorFunctions(incidents);

  return (
    <div className="space-y-4">
      {/* ABC Function Breakdown Card */}
      <div className="p-6 rounded-2xl bg-zinc-950/80 border border-white/10 backdrop-blur-xl shadow-2xl">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-orange-500/10 border border-orange-500/20 text-orange-400 flex items-center justify-center">
              <Brain className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-heading font-black text-base text-white tracking-tight">
                ABC Functional Behavior Analytics
              </h3>
              <p className="text-xs text-zinc-400 font-mono">
                {breakdown.totalIncidents} incident{breakdown.totalIncidents === 1 ? '' : 's'} recorded · Primary function:{' '}
                <strong className="text-orange-400 font-bold uppercase">
                  {breakdown.primaryHypothesizedFunction}
                </strong>
              </p>
            </div>
          </div>

          <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-white/5 border border-white/10 text-zinc-300">
            FBA Hypotheses
          </span>
        </div>

        {/* Function Distribution Bars */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          {/* Escape */}
          <div className="p-4 rounded-xl bg-zinc-900/60 border border-white/5">
            <div className="flex justify-between text-xs font-mono mb-1.5">
              <span className="text-blue-400 font-bold">ESCAPE / DEMAND</span>
              <span className="text-white font-bold">{breakdown.escapePercent}%</span>
            </div>
            <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 transition-all duration-500"
                style={{ width: `${breakdown.escapePercent}%` }}
              />
            </div>
            <p className="mt-2 text-[10.5px] font-mono text-zinc-400">
              {breakdown.escapeCount} incident{breakdown.escapeCount === 1 ? '' : 's'}
            </p>
          </div>

          {/* Attention */}
          <div className="p-4 rounded-xl bg-zinc-900/60 border border-white/5">
            <div className="flex justify-between text-xs font-mono mb-1.5">
              <span className="text-amber-400 font-bold">ATTENTION</span>
              <span className="text-white font-bold">{breakdown.attentionPercent}%</span>
            </div>
            <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-amber-500 to-orange-400 transition-all duration-500"
                style={{ width: `${breakdown.attentionPercent}%` }}
              />
            </div>
            <p className="mt-2 text-[10.5px] font-mono text-zinc-400">
              {breakdown.attentionCount} incident{breakdown.attentionCount === 1 ? '' : 's'}
            </p>
          </div>

          {/* Tangible */}
          <div className="p-4 rounded-xl bg-zinc-900/60 border border-white/5">
            <div className="flex justify-between text-xs font-mono mb-1.5">
              <span className="text-emerald-400 font-bold">TANGIBLE / ACCESS</span>
              <span className="text-white font-bold">{breakdown.tangiblePercent}%</span>
            </div>
            <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-500"
                style={{ width: `${breakdown.tangiblePercent}%` }}
              />
            </div>
            <p className="mt-2 text-[10.5px] font-mono text-zinc-400">
              {breakdown.tangibleCount} incident{breakdown.tangibleCount === 1 ? '' : 's'}
            </p>
          </div>

          {/* Sensory */}
          <div className="p-4 rounded-xl bg-zinc-900/60 border border-white/5">
            <div className="flex justify-between text-xs font-mono mb-1.5">
              <span className="text-purple-400 font-bold">SENSORY / AUTO</span>
              <span className="text-white font-bold">{breakdown.sensoryPercent}%</span>
            </div>
            <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-purple-500 to-pink-400 transition-all duration-500"
                style={{ width: `${breakdown.sensoryPercent}%` }}
              />
            </div>
            <p className="mt-2 text-[10.5px] font-mono text-zinc-400">
              {breakdown.sensoryCount} incident{breakdown.sensoryCount === 1 ? '' : 's'}
            </p>
          </div>
        </div>

        {/* Antecedents and Consequences Highlights */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-white/10">
          <div>
            <h4 className="text-xs font-mono font-bold uppercase text-zinc-400 mb-2">
              Top Antecedent Triggers
            </h4>
            {breakdown.topAntecedents.length === 0 ? (
              <p className="text-xs text-zinc-500 font-mono">No antecedent data recorded.</p>
            ) : (
              <ul className="space-y-1.5 font-mono text-xs">
                {breakdown.topAntecedents.map((item, idx) => (
                  <li
                    key={idx}
                    className="p-2 rounded-lg bg-white/[0.02] border border-white/5 flex items-center justify-between text-zinc-300"
                  >
                    <span className="truncate">{item.antecedent}</span>
                    <span className="px-1.5 py-0.5 rounded-md bg-white/5 text-[10px] text-zinc-400 shrink-0">
                      {item.count}x
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <h4 className="text-xs font-mono font-bold uppercase text-zinc-400 mb-2">
              Maintaining Consequences
            </h4>
            {breakdown.topConsequences.length === 0 ? (
              <p className="text-xs text-zinc-500 font-mono">No consequence data recorded.</p>
            ) : (
              <ul className="space-y-1.5 font-mono text-xs">
                {breakdown.topConsequences.map((item, idx) => (
                  <li
                    key={idx}
                    className="p-2 rounded-lg bg-white/[0.02] border border-white/5 flex items-center justify-between text-zinc-300"
                  >
                    <span className="truncate">{item.consequence}</span>
                    <span className="px-1.5 py-0.5 rounded-md bg-white/5 text-[10px] text-zinc-400 shrink-0">
                      {item.count}x
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Crisis / Safety Protocol Quick Banner */}
      <div className="p-5 rounded-2xl bg-gradient-to-r from-red-950/40 via-zinc-950/80 to-zinc-950/80 border border-red-500/20 backdrop-blur-xl shadow-xl">
        <div
          className="flex items-center justify-between cursor-pointer"
          onClick={() => setIsCrisisPlanExpanded(!isCrisisPlanExpanded)}
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 flex items-center justify-center shrink-0">
              <ShieldAlert className="w-4 h-4 animate-pulse" />
            </div>
            <div>
              <h4 className="font-heading font-black text-sm text-white tracking-tight flex items-center gap-2">
                <span>Behavior Crisis &amp; Safety Protocol</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-red-500/10 text-red-400 border border-red-500/20">
                  Quick Access
                </span>
              </h4>
              <p className="text-xs text-zinc-400 font-mono">
                De-escalation procedures, antecedents, and emergency safety contacts
              </p>
            </div>
          </div>

          <button
            type="button"
            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition cursor-pointer"
          >
            {isCrisisPlanExpanded ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </button>
        </div>

        {isCrisisPlanExpanded && (
          <div className="mt-4 pt-4 border-t border-red-500/20 space-y-3 font-mono text-xs animate-in fade-in duration-200">
            {/* Prevention */}
            <div className="p-3 rounded-xl bg-zinc-900/60 border border-white/5">
              <span className="text-amber-400 font-bold uppercase tracking-wider text-[11px] block mb-1">
                1. Proactive &amp; Prevention Strategies (Antecedent Control)
              </span>
              <p className="text-zinc-300 leading-relaxed">
                Provide visual schedule, first-then boards, transition countdowns (2m, 1m warnings), and functional communication training (FCT) for break requests before agitation reaches escalation.
              </p>
            </div>

            {/* De-escalation */}
            <div className="p-3 rounded-xl bg-zinc-900/60 border border-white/5">
              <span className="text-red-400 font-bold uppercase tracking-wider text-[11px] block mb-1">
                2. Active De-escalation &amp; Safety Protocol
              </span>
              <p className="text-zinc-300 leading-relaxed">
                Lower vocal volume and reduce verbal demands. Clear immediate area of hard or dangerous objects. Maintain a minimum 3-foot reactionary buffer. Prompt replacement behavior (e.g. &ldquo;I need space&rdquo; card).
              </p>
            </div>

            {/* Emergency Contacts */}
            <div className="p-3 rounded-xl bg-zinc-900/60 border border-white/5">
              <span className="text-zinc-400 font-bold uppercase tracking-wider text-[11px] block mb-1.5">
                3. Emergency Contacts
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-zinc-300">
                <div className="p-2 rounded-lg bg-white/[0.02] border border-white/5 flex items-center justify-between">
                  <span>Supervising BCBA</span>
                  <span className="text-orange-400 font-bold">Priority Line</span>
                </div>
                <div className="p-2 rounded-lg bg-white/[0.02] border border-white/5 flex items-center justify-between">
                  <span>Clinical Director</span>
                  <span className="text-zinc-400">On Call</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
