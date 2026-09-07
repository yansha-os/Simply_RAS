'use client';

import React, { useEffect, useState, useSyncExternalStore, useTransition } from 'react';
import { createPortal } from 'react-dom';
import {
  CheckCircle2,
  Copy,
  Scale,
  Sparkles,
  X,
} from 'lucide-react';
import { generateClaimDenialAppeal } from '@/app/actions/denialAppealActions';
import type { DenialAppealInput, DenialAppealPacket } from '@/lib/denialAppealEngine';

interface DenialAppealCompilerModalProps {
  isOpen: boolean;
  onClose: () => void;
  claimId?: string;
  clientName?: string;
  payerName?: string;
  dateOfService?: string;
  cptCode?: string;
  billedUnits?: number;
  billedAmount?: number;
}

const subscribeToHydration = () => () => undefined;
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

export default function DenialAppealCompilerModal({
  isOpen,
  onClose,
  claimId = 'CLM-2026-001',
  clientName = 'Client Name',
  payerName = 'Empire BCBS',
  dateOfService = '2026-05-15',
  cptCode = '97153',
  billedUnits = 8,
  billedAmount = 220,
}: DenialAppealCompilerModalProps) {
  const mounted = useSyncExternalStore(
    subscribeToHydration,
    getClientSnapshot,
    getServerSnapshot
  );
  const [denialCode, setDenialCode] = useState('CO-197');
  const [authNumber, setAuthNumber] = useState('PA-2026-NY-991');
  const [bcbaName, setBcbaName] = useState('Dr. Sarah Connor, BCBA');
  const [customNotes, setCustomNotes] = useState('');
  const [packet, setPacket] = useState<DenialAppealPacket | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, onClose]);

  const handleGenerateAppeal = () => {
    startTransition(async () => {
      setLoading(true);
      setError(null);

      const input: DenialAppealInput = {
        claimId,
        clientName,
        memberId: 'MEM-883920',
        payerName,
        dateOfService,
        cptCode,
        billedUnits,
        billedAmountDollar: billedAmount,
        denialCode,
        authNumber,
        bcbaName,
        customRebuttalNotes: customNotes,
      };

      const res = await generateClaimDenialAppeal(input);
      if (res.success && res.packet) {
        setPacket(res.packet);
      } else {
        setError(res.error || 'Failed to generate appeal packet.');
      }
      setLoading(false);
    });
  };

  const handleCopyText = () => {
    if (!packet) return;
    navigator.clipboard.writeText(packet.appealNarrative);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isOpen || !mounted) return null;

  return createPortal(
    <div
      onClick={onClose}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in overflow-y-auto"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="my-auto w-full max-w-3xl rounded-2xl border border-white/10 bg-zinc-950 p-6 shadow-2xl backdrop-blur-xl relative max-h-[90vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-white/10 pb-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-brand-orange-500/20 bg-brand-orange-500/10 text-brand-orange-400">
              <Scale className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-heading text-lg font-bold text-white">
                  Payer Claim Denial Appeal Compiler
                </h3>
                <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-0.5 font-mono text-[10px] font-semibold text-amber-400">
                  Level 1 Dispute
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                Automated clinical & clerical appeal generation with evidence bundle attachments for {clientName}.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="mt-5 space-y-5 overflow-y-auto pr-1 flex-1 font-mono text-xs">
          {/* Denial Form Configuration */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-[10px] uppercase text-zinc-500">Payer Denial Reason Code</label>
              <select
                value={denialCode}
                onChange={(e) => setDenialCode(e.target.value)}
                className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-white outline-none focus:border-brand-orange-500"
              >
                <option value="CO-197">CO-197: Auth Missing / Expired</option>
                <option value="CO-50">CO-50: Medical Necessity Dispute</option>
                <option value="CO-16">CO-16: Lacks Information / Note Error</option>
                <option value="CO-4">CO-4: Modifier / POS Mismatch</option>
                <option value="CO-29">CO-29: Timely Filing Dispute</option>
              </select>
            </div>

            <div>
              <label className="text-[10px] uppercase text-zinc-500">Prior Auth Number</label>
              <input
                type="text"
                value={authNumber}
                onChange={(e) => setAuthNumber(e.target.value)}
                className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-white outline-none focus:border-brand-orange-500"
              />
            </div>

            <div>
              <label className="text-[10px] uppercase text-zinc-500">BCBA Signer Name</label>
              <input
                type="text"
                value={bcbaName}
                onChange={(e) => setBcbaName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-white outline-none focus:border-brand-orange-500"
              />
            </div>
          </div>

          <div>
            <label className="text-[10px] uppercase text-zinc-500">
              Additional Clinical Rebuttal Notes (Optional)
            </label>
            <textarea
              value={customNotes}
              onChange={(e) => setCustomNotes(e.target.value)}
              placeholder="e.g. Note reflects in-home direct trial data and meets all NY Medicaid guidelines..."
              rows={2}
              className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-900 p-2.5 text-white outline-none focus:border-brand-orange-500 text-xs font-sans"
            />
          </div>

          <div className="flex justify-end">
            <button
              onClick={handleGenerateAppeal}
              disabled={loading || isPending}
              className="inline-flex items-center gap-1.5 rounded-lg border border-brand-orange-500/30 bg-brand-orange-500 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-orange-600 transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Sparkles className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Generate Clinical Appeal Letter
            </button>
          </div>

          {error && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-red-400">
              {error}
            </div>
          )}

          {/* Generated Appeal Letter Preview */}
          {packet && (
            <div className="space-y-4 rounded-xl border border-white/10 bg-zinc-900/60 p-4">
              <div className="flex items-center justify-between border-b border-white/10 pb-2">
                <span className="text-white font-bold font-sans">
                  {packet.formalSubjectLine}
                </span>
                <button
                  onClick={handleCopyText}
                  className="inline-flex items-center gap-1 text-[11px] text-zinc-300 hover:text-white transition-colors cursor-pointer"
                >
                  <Copy className="h-3.5 w-3.5" />
                  {copied ? 'Copied!' : 'Copy Letter'}
                </button>
              </div>

              <pre className="whitespace-pre-wrap font-mono text-xs text-zinc-300 bg-zinc-950 p-3 rounded-lg border border-white/5 max-h-56 overflow-y-auto">
                {packet.appealNarrative}
              </pre>

              {/* Evidence Checklist */}
              <div>
                <div className="text-[11px] font-bold text-brand-orange-400 uppercase tracking-wider mb-1.5 font-sans">
                  Bundled Evidence Checklist for Payer
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {packet.attachedEvidenceChecklist.map((item, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-2 rounded bg-zinc-950/80 p-2 text-[11px] text-zinc-300 border border-white/5"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5 text-green-400 shrink-0" />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-5 flex items-center justify-end gap-3 border-t border-white/10 pt-4 shrink-0">
          <button
            onClick={onClose}
            className="rounded-lg border border-white/10 bg-zinc-900 px-4 py-2 text-xs font-medium text-zinc-300 hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
