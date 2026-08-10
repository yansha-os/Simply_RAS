'use client';

import React, { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ShieldCheck, ShieldAlert, AlertTriangle, CheckCircle2, FileSearch, Search, Lock } from 'lucide-react';
import { scanSessionNoteForAuditRisks } from '@/lib/clinical/SessionNoteAuditScrubber';
import { toast } from 'sonner';

export default function MockInsuranceAuditSimulator() {
  const [isAuditing, setIsAuditing] = useState(false);
  const [auditRunComplete, setAuditRunComplete] = useState(false);

  const sampleFileAudit = scanSessionNoteForAuditRisks({
    noteId: 'n-9921',
    clinicalContent: 'Session went well, client did good during trials.',
    sessionDurationMinutes: 120,
    loggedTrialsCount: 0,
    rbtSigned: true,
    parentSigned: false,
  });

  const handleRunMockAudit = () => {
    setIsAuditing(true);
    setTimeout(() => {
      setIsAuditing(false);
      setAuditRunComplete(true);
      toast.warning('Mock Insurance Audit Simulation Complete: Flagged 3 High Audit Risk items!');
    }, 1500);
  };

  return (
    <Card className="bg-zinc-950/80 backdrop-blur-xl border border-white/10 p-6 rounded-3xl space-y-6 shadow-2xl">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-4">
        <div>
          <h2 className="text-xl font-bold text-white font-heading flex items-center gap-2">
            <FileSearch className="w-6 h-6 text-purple-400" /> Enterprise HIPAA Audit Vault & Mock Audit Simulator
          </h2>
          <p className="text-xs text-zinc-400 font-sans mt-1">
            Phase 11 - Automated pre-audit risk scanner. Scans client records for missing signatures, incomplete EVV timestamps, or generic narrative text before real payers audit.
          </p>
        </div>

        <Button
          onClick={handleRunMockAudit}
          isLoading={isAuditing}
          className="bg-purple-600 hover:bg-purple-500 text-white font-bold px-6 py-3 rounded-xl shadow-lg shadow-purple-600/20 flex items-center gap-2 cursor-pointer"
        >
          <Search className="w-4 h-4" /> Run Agency-Wide Mock Audit Simulator
        </Button>
      </div>

      {/* SIMULATOR RESULTS */}
      {auditRunComplete && (
        <div className="space-y-4 animate-fade-in">
          <div className="bg-zinc-900/60 border border-purple-500/30 p-5 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <span className="text-[10px] font-mono font-bold text-purple-400 uppercase">Audit Proofing Readiness Score</span>
              <p className="text-3xl font-black font-mono text-amber-400 mt-0.5">{sampleFileAudit.auditScore}% / 100%</p>
              <p className="text-xs text-zinc-400 mt-1">Client Record: Ethan Wright | Session Date: 08/01/2026</p>
            </div>
            <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 px-4 py-2 rounded-xl text-xs font-mono font-bold">
              {sampleFileAudit.riskFlags.length} Audit Rejection Flags Detected
            </div>
          </div>

          {/* RISK FLAGS LIST */}
          <div className="space-y-3">
            <span className="text-xs font-mono text-zinc-400 font-bold uppercase">Flagged Audit Rejection Risks:</span>
            {sampleFileAudit.riskFlags.map((flag, idx) => (
              <div key={idx} className="bg-rose-950/20 border border-rose-500/30 p-4 rounded-xl flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-rose-300 text-sm">{flag}</h4>
                  <p className="text-xs text-zinc-400 mt-1 font-sans">
                    <strong className="text-emerald-400">Recommended Fix:</strong> {sampleFileAudit.recommendations[idx] || 'Review and update clinical documentation.'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
