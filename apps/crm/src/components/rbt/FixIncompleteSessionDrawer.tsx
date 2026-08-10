'use client';

import React, { useState } from 'react';
import { 
  AlertTriangle, 
  CheckCircle2, 
  FileText, 
  UserCheck, 
  Clock, 
  MapPin, 
  ShieldCheck, 
  X, 
  Send,
  Sparkles
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { toast } from 'sonner';

export interface IncompleteSessionItem {
  id: string;
  client: string;
  age: number;
  bcba: string;
  date: string;
  time: string;
  location: string;
  cptCode: string;
  missingReason: 'MISSING_PARENT_SIGNATURE' | 'MISSING_SOAP_NOTE' | 'MISSING_ABC_LOG';
  loggedTrialsCount: number;
  rbtSignature: string;
  parentSignature: string;
  soapSummary: string;
}

interface FixIncompleteSessionDrawerProps {
  session: IncompleteSessionItem | null;
  isOpen: boolean;
  onClose: () => void;
  onFixComplete: (sessionId: string) => void;
}

export function FixIncompleteSessionDrawer({
  session,
  isOpen,
  onClose,
  onFixComplete
}: FixIncompleteSessionDrawerProps) {
  if (!isOpen || !session) return null;

  const [parentSignature, setParentSignature] = useState(session.parentSignature || '');
  const [soapSummary, setSoapSummary] = useState(
    session.soapSummary || 'Client engaged in manding and receptive identification tasks. 15 total DTT trials completed with 85% accuracy.'
  );

  const handleSubmitFix = (e: React.FormEvent) => {
    e.preventDefault();

    if (session.missingReason === 'MISSING_PARENT_SIGNATURE' && !parentSignature.trim()) {
      toast.error('Caregiver / Parent E-Signature is required to render claim!');
      return;
    }

    toast.success(`✓ Session note fixed & CMS-1500 claim rendered for ${session.client}!`);
    onFixComplete(session.id);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[9999999] flex justify-end animate-fade-in text-slate-900">
      <div className="bg-white max-w-lg w-full h-full p-6 sm:p-8 space-y-6 overflow-y-auto custom-scrollbar shadow-2xl relative">
        {/* Drawer Header */}
        <div className="flex items-center justify-between border-b border-orange-200 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-100 border border-amber-300 text-amber-800 flex items-center justify-center font-bold shrink-0">
              <AlertTriangle className="w-5 h-5 text-amber-600 animate-pulse" />
            </div>
            <div>
              <span className="text-[10px] font-mono font-bold text-amber-700 uppercase tracking-wider block">Incomplete Session Fix</span>
              <h3 className="text-lg font-black text-slate-900 font-heading">{session.client}</h3>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Missing Item Alert Box */}
        <div className="p-4 bg-amber-50 border-2 border-amber-200 rounded-2xl space-y-1.5 text-xs text-amber-900 font-semibold">
          <div className="flex items-center gap-1.5 text-amber-800 font-black">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            <span>Missing Requirement: {session.missingReason.replace(/_/g, ' ')}</span>
          </div>
          <p className="text-[11px] text-amber-800 leading-relaxed">
            This session was clocked out via EVV, but insurance claim payouts (CMS-1500) require all mandatory documentation to be signed and submitted.
          </p>
        </div>

        {/* Session Metadata Details */}
        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2 text-xs font-semibold text-slate-700">
          <div className="flex justify-between">
            <span className="text-slate-500">Date &amp; Time:</span>
            <strong className="text-slate-900">{session.date} ({session.time})</strong>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Location:</span>
            <strong className="text-slate-900">{session.location}</strong>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Service CPT Code:</span>
            <strong className="text-slate-900">{session.cptCode}</strong>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Logged Trials:</span>
            <strong className="text-emerald-700 font-black">{session.loggedTrialsCount} DTT Trials Recorded</strong>
          </div>
        </div>

        {/* Fix Form */}
        <form onSubmit={handleSubmitFix} className="space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-800 block">SOAP Note Objective Narrative</label>
            <textarea
              value={soapSummary}
              onChange={(e) => setSoapSummary(e.target.value)}
              rows={3}
              className="w-full bg-[#F0F7FF] border-2 border-[#BFDBFE] rounded-2xl p-3 text-xs text-slate-900 font-bold outline-none focus:border-[#F97316]"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-800 block flex items-center justify-between">
              <span>Caregiver / Parent E-Signature *</span>
              <span className="text-[10px] text-rose-600 font-black font-mono">MANDATORY</span>
            </label>
            <input
              type="text"
              value={parentSignature}
              onChange={(e) => setParentSignature(e.target.value)}
              data-scribe-id="input-parent-signature-fix"
              placeholder="Type parent full name (e.g. Elena Miller)..."
              className="w-full bg-[#F0F7FF] border-2 border-[#BFDBFE] rounded-2xl p-3 text-xs text-slate-900 font-bold outline-none focus:border-[#F97316]"
            />
          </div>

          <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-3 rounded-2xl border-2 border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              Cancel
            </button>

            <Button
              type="submit"
              data-scribe-id="btn-submit-incomplete-fix"
              className="bg-[#F97316] hover:bg-orange-600 text-white font-black text-xs px-6 py-3.5 rounded-2xl shadow-xl cursor-pointer"
            >
              ✓ Fix &amp; Render Audit-Proof Claim
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
