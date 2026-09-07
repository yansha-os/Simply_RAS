'use client';

import React, { useEffect, useState, useSyncExternalStore, useTransition } from 'react';
import { createPortal } from 'react-dom';
import {
  CheckCircle2,
  FileCheck2,
  GraduationCap,
  HeartHandshake,
  Layers,
  Printer,
  RefreshCw,
  Save,
  TrendingDown,
  X,
} from 'lucide-react';
import { generateReAuthDraft, saveReAuthPacket } from '@/app/actions/reAuthPacketActions';
import type { ReAuthPacketPayload } from '@/lib/reAuthPacketCompiler';

interface ReAuthCompilerModalProps {
  isOpen: boolean;
  onClose: () => void;
  clientId: string;
  clientName?: string;
}

const subscribeToHydration = () => () => undefined;
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

export default function ReAuthCompilerModal({
  isOpen,
  onClose,
  clientId,
  clientName = 'Client',
}: ReAuthCompilerModalProps) {
  const mounted = useSyncExternalStore(
    subscribeToHydration,
    getClientSnapshot,
    getServerSnapshot
  );
  const [draft, setDraft] = useState<ReAuthPacketPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (isOpen && clientId) {
      startTransition(async () => {
        setLoading(true);
        setError(null);
        setSavedSuccess(false);
        const res = await generateReAuthDraft(clientId);
        if (res.success && res.draft) {
          setDraft(res.draft);
        } else {
          setError(res.error || 'Failed to generate re-authorization packet.');
        }
        setLoading(false);
      });
    }
  }, [isOpen, clientId]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, onClose]);

  const handleSavePacket = async () => {
    if (!draft) return;
    setSaving(true);
    setError(null);
    const res = await saveReAuthPacket(clientId, draft);
    setSaving(false);
    if (res.success) {
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 4000);
    } else {
      setError(res.error || 'Failed to save packet.');
    }
  };

  const handlePrint = () => {
    window.print();
  };

  if (!isOpen || !mounted) return null;

  return createPortal(
    <div
      onClick={onClose}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in overflow-y-auto"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="my-auto w-full max-w-4xl rounded-2xl border border-[#E2D5B7] dark:border-white/10 bg-[#FFFDF8] dark:bg-zinc-950 p-6 shadow-2xl backdrop-blur-xl relative max-h-[90vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-[#E2D5B7] dark:border-white/10 pb-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-brand-orange-500/20 bg-brand-orange-500/10 text-brand-orange-600 dark:text-brand-orange-400">
              <FileCheck2 className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-heading text-lg font-bold text-slate-900 dark:text-white">
                  6-Month Clinical Re-Authorization Packet Compiler (97151)
                </h3>
                <span className="rounded-full border border-green-500/20 bg-green-500/10 px-2.5 py-0.5 font-mono text-[10px] font-semibold text-green-600 dark:text-green-400">
                  Payer Ready
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-zinc-400">
                Automated clinical synthesis: target mastery curves, ABC behavior reductions, caregiver guidance & BCBA CPT requests for {clientName}.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              disabled={!draft}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#E2D5B7] dark:border-white/10 bg-[#F9F5EC] dark:bg-zinc-900 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-zinc-300 hover:bg-white dark:hover:bg-zinc-800 transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 shadow-sm"
            >
              <Printer className="h-3.5 w-3.5" />
              Print / PDF
            </button>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 dark:text-zinc-400 hover:bg-slate-200 dark:hover:bg-white/10 hover:text-slate-800 dark:hover:text-white transition-colors cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="mt-5 space-y-6 overflow-y-auto pr-1 flex-1">
          {loading ? (
            <div className="flex items-center justify-center py-20 text-slate-500 dark:text-zinc-400">
              <RefreshCw className="h-6 w-6 animate-spin text-brand-orange-500 mr-3" />
              <span className="font-mono text-sm">Synthesizing clinical charts & trajectories...</span>
            </div>
          ) : error ? (
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-xs text-rose-600 dark:text-red-400">
              {error}
            </div>
          ) : draft ? (
            <div className="space-y-6">
              {/* Demographics & Evaluation Window */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-xl border border-[#E2D5B7] dark:border-white/5 bg-[#F9F5EC] dark:bg-zinc-900/60 p-3 shadow-sm">
                  <div className="text-[10px] uppercase font-mono tracking-wider text-slate-500 dark:text-zinc-500">
                    Client Name
                  </div>
                  <div className="mt-1 font-semibold text-slate-900 dark:text-white text-sm truncate">
                    {draft.clientName}
                  </div>
                </div>

                <div className="rounded-xl border border-[#E2D5B7] dark:border-white/5 bg-[#F9F5EC] dark:bg-zinc-900/60 p-3 shadow-sm">
                  <div className="text-[10px] uppercase font-mono tracking-wider text-slate-500 dark:text-zinc-500">
                    Diagnosis
                  </div>
                  <div className="mt-1 font-mono text-xs font-medium text-cyan-600 dark:text-cyan-400 truncate">
                    {draft.diagnosisCodes.join(', ')}
                  </div>
                </div>

                <div className="rounded-xl border border-[#E2D5B7] dark:border-white/5 bg-[#F9F5EC] dark:bg-zinc-900/60 p-3 shadow-sm">
                  <div className="text-[10px] uppercase font-mono tracking-wider text-slate-500 dark:text-zinc-500">
                    Eval Period
                  </div>
                  <div className="mt-1 font-mono text-xs text-slate-700 dark:text-zinc-300">
                    {draft.evaluationPeriodStart} → {draft.evaluationPeriodEnd}
                  </div>
                </div>

                <div className="rounded-xl border border-[#E2D5B7] dark:border-white/5 bg-[#F9F5EC] dark:bg-zinc-900/60 p-3 shadow-sm">
                  <div className="text-[10px] uppercase font-mono tracking-wider text-slate-500 dark:text-zinc-500">
                    Treatment Attendance
                  </div>
                  <div className="mt-1 font-mono text-sm font-bold text-green-600 dark:text-green-400">
                    {draft.attendancePct}%
                  </div>
                </div>
              </div>

              {/* Skill Acquisition Summary */}
              <div className="rounded-xl border border-[#E2D5B7] dark:border-white/10 bg-[#F9F5EC]/80 dark:bg-zinc-900/40 p-4 shadow-sm">
                <div className="flex items-center justify-between border-b border-[#E2D5B7] dark:border-white/10 pb-3">
                  <div className="flex items-center gap-2">
                    <GraduationCap className="h-4 w-4 text-brand-orange-500 dark:text-brand-orange-400" />
                    <span className="font-heading text-sm font-bold text-slate-900 dark:text-white">
                      1. Skill Acquisition Progress & Prompt Fading
                    </span>
                  </div>
                  <div className="font-mono text-xs text-slate-500 dark:text-zinc-400">
                    <span className="text-green-600 dark:text-green-400 font-bold">
                      {draft.skillGraphSummary.masteredTargetsCount} Mastered
                    </span>{' '}
                    / {draft.skillGraphSummary.totalTargetsCount} Total
                  </div>
                </div>

                {draft.skillGraphSummary.targets.length === 0 ? (
                  <p className="mt-3 text-xs text-slate-500 dark:text-zinc-500 font-mono">
                    No active skill targets found in client chart.
                  </p>
                ) : (
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full text-left text-xs font-mono">
                      <thead>
                        <tr className="border-b border-[#E2D5B7] dark:border-white/5 text-[10px] uppercase text-slate-500 dark:text-zinc-500">
                          <th className="pb-1.5">Domain</th>
                          <th className="pb-1.5">Target Title</th>
                          <th className="pb-1.5 text-right">Baseline</th>
                          <th className="pb-1.5 text-right">Current Acc</th>
                          <th className="pb-1.5 text-right">Prompt Trend</th>
                          <th className="pb-1.5 text-right">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E2D5B7]/60 dark:divide-white/5">
                        {draft.skillGraphSummary.targets.map((t) => (
                          <tr key={t.targetId} className="hover:bg-white/50 dark:hover:bg-white/[0.02]">
                            <td className="py-2 text-slate-600 dark:text-zinc-400">{t.domain}</td>
                            <td className="py-2 text-slate-900 dark:text-white font-sans font-medium">{t.title}</td>
                            <td className="py-2 text-right text-slate-500 dark:text-zinc-400">
                              {t.baselineData !== null ? `${t.baselineData}%` : '—'}
                            </td>
                            <td className="py-2 text-right font-bold text-brand-orange-600 dark:text-brand-orange-400">
                              {t.currentAccuracyPct}%
                            </td>
                            <td className="py-2 text-right text-cyan-600 dark:text-cyan-400 text-[11px]">
                              {t.promptLevelTrend}
                            </td>
                            <td className="py-2 text-right">
                              <span
                                className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${
                                  t.targetStatus === 'MASTERED'
                                    ? 'bg-green-500/20 text-green-700 dark:text-green-400'
                                    : 'bg-amber-500/20 text-amber-700 dark:text-amber-400'
                                }`}
                              >
                                {t.targetStatus}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Behavior Reductions Summary */}
              <div className="rounded-xl border border-[#E2D5B7] dark:border-white/10 bg-[#F9F5EC]/80 dark:bg-zinc-900/40 p-4 shadow-sm">
                <div className="flex items-center justify-between border-b border-[#E2D5B7] dark:border-white/10 pb-3">
                  <div className="flex items-center gap-2">
                    <TrendingDown className="h-4 w-4 text-green-600 dark:text-green-400" />
                    <span className="font-heading text-sm font-bold text-slate-900 dark:text-white">
                      2. Challenging Behavior Reductions & BIP Efficacy
                    </span>
                  </div>
                  <div className="font-mono text-xs text-green-600 dark:text-green-400 font-bold">
                    {draft.behaviorGraphSummary.reducedBehaviorsCount} /{' '}
                    {draft.behaviorGraphSummary.totalBehaviorsCount} Reduced
                  </div>
                </div>

                {draft.behaviorGraphSummary.behaviors.length === 0 ? (
                  <p className="mt-3 text-xs text-slate-500 dark:text-zinc-500 font-mono">
                    No behavior targets tracked in client chart.
                  </p>
                ) : (
                  <div className="mt-3 space-y-2">
                    {draft.behaviorGraphSummary.behaviors.map((b) => (
                      <div
                        key={b.behaviorId}
                        className="flex items-center justify-between rounded-lg bg-white dark:bg-zinc-950/60 p-2.5 border border-[#E2D5B7] dark:border-white/5 text-xs font-mono shadow-sm"
                      >
                        <div>
                          <div className="font-bold text-slate-900 dark:text-white font-sans">{b.behaviorName}</div>
                          <div className="text-[11px] text-slate-500 dark:text-zinc-400 mt-0.5">
                            Replacement: {b.replacementBehavior}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-bold text-green-600 dark:text-green-400">
                            {b.reductionPercentage}% Reduction
                          </div>
                          <div className="text-[10px] text-slate-500 dark:text-zinc-500">
                            {b.baselineFrequency} freq → {b.currentFrequency} freq
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Caregiver Guidance Progress */}
              <div className="rounded-xl border border-[#E2D5B7] dark:border-white/10 bg-[#F9F5EC]/80 dark:bg-zinc-900/40 p-4 shadow-sm">
                <div className="flex items-center justify-between border-b border-[#E2D5B7] dark:border-white/10 pb-3">
                  <div className="flex items-center gap-2">
                    <HeartHandshake className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
                    <span className="font-heading text-sm font-bold text-slate-900 dark:text-white">
                      3. Caregiver Training (97156) & Generalization
                    </span>
                  </div>
                  <div className="font-mono text-xs text-slate-700 dark:text-zinc-300">
                    {draft.caregiverSummary.totalTrainingHours} hrs completed ·{' '}
                    {draft.caregiverSummary.averageFidelityScore}% Avg Fidelity
                  </div>
                </div>
                <p className="mt-2 text-xs text-slate-700 dark:text-zinc-300">
                  Caregivers successfully completed BST training and demonstrated {draft.caregiverSummary.averageFidelityScore}% procedural fidelity across routine home interventions.
                </p>
              </div>

              {/* CPT Re-Authorization Request Table */}
              <div className="rounded-xl border border-brand-orange-500/20 bg-brand-orange-500/5 p-4 shadow-sm">
                <div className="flex items-center justify-between border-b border-brand-orange-500/20 pb-3">
                  <div className="flex items-center gap-2">
                    <Layers className="h-4 w-4 text-brand-orange-600 dark:text-brand-orange-400" />
                    <span className="font-heading text-sm font-bold text-slate-900 dark:text-white">
                      4. Proposed 6-Month CPT Request Matrix
                    </span>
                  </div>
                  <div className="font-mono text-xs font-bold text-brand-orange-600 dark:text-brand-orange-400">
                    {draft.cptRequestPayload.totalWeeklyHours} hrs/wk ·{' '}
                    {draft.cptRequestPayload.totalUnitsRequested} Total Units
                  </div>
                </div>

                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-left text-xs font-mono">
                    <thead>
                      <tr className="border-b border-[#E2D5B7] dark:border-white/10 text-[10px] uppercase text-slate-500 dark:text-zinc-400">
                        <th className="pb-2">CPT</th>
                        <th className="pb-2">Service Description</th>
                        <th className="pb-2 text-right">Weekly Hrs</th>
                        <th className="pb-2 text-right">6-Mo Units</th>
                        <th className="pb-2 pl-4">Clinical Justification</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E2D5B7]/60 dark:divide-white/5">
                      {draft.cptRequestPayload.lines.map((l) => (
                        <tr key={l.cptCode}>
                          <td className="py-2.5 font-bold text-slate-900 dark:text-white">{l.cptCode}</td>
                          <td className="py-2.5 text-slate-700 dark:text-zinc-300 font-sans">{l.description}</td>
                          <td className="py-2.5 text-right font-bold text-brand-orange-600 dark:text-brand-orange-400">
                            {l.weeklyHoursRequested} hrs
                          </td>
                          <td className="py-2.5 text-right font-bold text-slate-900 dark:text-white">
                            {l.totalUnits6Months} u
                          </td>
                          <td className="py-2.5 pl-4 text-slate-500 dark:text-zinc-400 font-sans text-[11px] max-w-xs">
                            {l.clinicalJustification}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="mt-6 flex items-center justify-between border-t border-[#E2D5B7] dark:border-white/10 pt-4 shrink-0">
          <div>
            {savedSuccess && (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-green-600 dark:text-green-400 font-mono">
                <CheckCircle2 className="h-4 w-4" />
                Re-Authorization Packet Saved to Chart!
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="rounded-lg border border-[#E2D5B7] dark:border-white/10 bg-[#F9F5EC] dark:bg-zinc-900 px-4 py-2 text-xs font-medium text-slate-700 dark:text-zinc-300 hover:bg-white dark:hover:bg-zinc-800 transition-colors cursor-pointer shadow-sm"
            >
              Close
            </button>
            <button
              onClick={handleSavePacket}
              disabled={saving || !draft}
              className="inline-flex items-center gap-1.5 rounded-lg border border-brand-orange-500/30 bg-brand-orange-500 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-orange-600 transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 shadow-sm"
            >
              <Save className={`h-4 w-4 ${saving ? 'animate-spin' : ''}`} />
              Save Re-Auth Packet
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
