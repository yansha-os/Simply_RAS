'use client';

import { AlertTriangle, Ban, CheckCircle2, ShieldCheck, Sparkles } from 'lucide-react';
import type { BillingCheckItem } from '@/lib/sessionStudio';
import type { ClaimReadyGap } from '@/lib/sessionStudioClaimReady';

type Props = {
  readyCount: number;
  totalCount: number;
  claimReady: boolean;
  checklist: BillingCheckItem[];
  blocks: ClaimReadyGap[];
  warnings: ClaimReadyGap[];
  /** Soft-pass SESSION_TIME while still clocked in */
  clockedIn?: boolean;
  /** Compact chips only (COLLECT/NOTE); Sign shows full gap list */
  variant?: 'chips' | 'sign';
};

/** RBT documentation checklist; server validation remains authoritative. */
export function SessionClaimReadyPanel({
  readyCount,
  totalCount,
  claimReady,
  checklist,
  blocks,
  warnings,
  clockedIn = false,
  variant = 'chips',
}: Props) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3.5 shadow-sm transition-all duration-300 hover:border-orange-200/80">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
        <p className="text-[10px] font-mono font-black uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-[#F97316]" />
          Documentation checklist · {readyCount}/{totalCount}
        </p>
        <span
          className={`text-[10px] font-black px-2.5 py-1 rounded-full border shrink-0 ${
            claimReady
              ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
              : 'bg-rose-50 text-rose-800 border-rose-300'
          }`}
        >
          {claimReady ? 'READY TO SUBMIT' : 'NEEDS ATTENTION'}
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {checklist.map((c) => {
          const softOk = c.ok || (c.key === 'SESSION_TIME' && clockedIn);
          return (
            <span
              key={c.key}
              title={c.hint}
              className={`text-[9px] font-bold px-2 py-1 rounded-lg border transition-colors ${
                softOk
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-slate-50 border-slate-200 text-slate-500'
              }`}
            >
              {softOk ? '✓' : '○'} {c.label}
            </span>
          );
        })}
      </div>

      {variant === 'sign' && !claimReady && blocks.length > 0 && (
        <div className="mt-3 rounded-2xl border-2 border-rose-200 bg-rose-50/90 p-4 flex flex-col gap-3">
          <div className="flex gap-2 items-start">
            <Ban className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
            <div>
              <p className="text-xs font-black text-rose-950">
                Finish these before documentation submit
              </p>
              <p className="text-[11px] text-rose-800/90 font-medium mt-0.5 leading-relaxed">
                Incomplete remains available so you can preserve the service close and finish
                required documentation later.
              </p>
            </div>
          </div>
          <ul className="flex flex-col gap-2.5">
            {blocks.map((g) => (
              <li
                key={g.key}
                className="rounded-xl border border-rose-200/80 bg-white/80 px-3 py-2.5"
              >
                <p className="text-[11px] font-black text-rose-950 flex items-center gap-1.5">
                  <AlertTriangle className="w-3 h-3 shrink-0" />
                  {g.label}
                </p>
                <p className="text-[11px] text-rose-900/85 font-medium mt-1 leading-relaxed">
                  {g.microcopy}
                </p>
                <p className="text-[10px] text-slate-600 font-medium mt-1.5 leading-relaxed">
                  <span className="font-mono text-[9px] uppercase tracking-wide text-slate-400 mr-1.5">
                    Fix
                  </span>
                  {g.howToFix}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {variant === 'sign' && claimReady && (
        <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50/80 px-3.5 py-2.5 flex gap-2 items-start">
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
          <p className="text-[11px] font-medium text-emerald-900 leading-relaxed">
            All documentation minimums are complete. Submit sends the structured note to the
            BCBA review queue.
          </p>
        </div>
      )}

      {variant === 'sign' && warnings.length > 0 && (
        <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50/80 p-3.5 flex flex-col gap-2">
          <p className="text-[10px] font-mono font-black uppercase tracking-wider text-amber-800 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" />
            Soft warnings — submit still allowed
          </p>
          <ul className="flex flex-col gap-2">
            {warnings.map((w) => (
              <li key={w.key} className="text-[11px] text-amber-950/90 font-medium leading-relaxed">
                <span className="font-black">{w.label}.</span> {w.microcopy}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
