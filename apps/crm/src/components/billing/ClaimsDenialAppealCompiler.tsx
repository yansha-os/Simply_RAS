'use client';

import React, { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { FileText, Send, AlertTriangle, CheckCircle2, ShieldCheck, Download } from 'lucide-react';
import { toast } from 'sonner';

export default function ClaimsDenialAppealCompiler() {
  const [isGenerated, setIsGenerated] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const sampleDenial = {
    claimId: 'CLM-98215',
    patientName: 'Maya Lin',
    payerName: 'Sunshine Health (Medicaid)',
    billedAmount: 480.0,
    denialReasonCode: '197',
    denialDescription: 'Precertification/prior authorization/notification absent.',
    serviceDate: '2026-07-20',
  };

  const handleGenerateAppeal = () => {
    setIsGenerated(true);
    toast.success('Generated formal clinical appeal package with attached session notes & PA proof!');
  };

  const handleResubmitClaim = () => {
    setIsSubmitting(true);
    setTimeout(() => {
      setIsSubmitting(false);
      toast.success(`Claim ${sampleDenial.claimId} successfully re-submitted to 837P clearinghouse queue!`);
    }, 1200);
  };

  return (
    <Card className="bg-zinc-950/80 backdrop-blur-xl border border-white/10 p-6 rounded-3xl space-y-6 shadow-2xl">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-4">
        <div>
          <h2 className="text-xl font-bold text-white font-heading flex items-center gap-2">
            <AlertTriangle className="w-6 h-6 text-rose-400" /> 1-Click Claims Denial Appeal & Resubmission Engine
          </h2>
          <p className="text-xs text-zinc-400 font-sans mt-1">
            Phase 8 - Instantly compiles formal insurance appeal letters with attached signed session notes, PA approval proofs, and EVV logs.
          </p>
        </div>

        <span className="bg-rose-500/10 border border-rose-500/20 text-rose-400 px-4 py-2 rounded-2xl font-mono font-bold text-xs">
          Denial Code {sampleDenial.denialReasonCode}
        </span>
      </div>

      {/* DENIED CLAIM INFO */}
      <div className="bg-zinc-900/60 border border-rose-500/30 p-5 rounded-2xl space-y-3">
        <div className="flex justify-between items-start">
          <div>
            <h3 className="font-bold text-white text-lg">{sampleDenial.patientName}</h3>
            <p className="text-xs text-zinc-400 font-mono">Claim ID: {sampleDenial.claimId} | Payer: {sampleDenial.payerName}</p>
          </div>
          <span className="text-xl font-black font-mono text-rose-400">${sampleDenial.billedAmount.toFixed(2)}</span>
        </div>

        <div className="bg-rose-950/30 border border-rose-500/20 p-3 rounded-xl text-xs text-rose-300">
          <strong>Payer Denial Reason:</strong> {sampleDenial.denialDescription}
        </div>
      </div>

      {/* GENERATE APPEAL LETTER */}
      {!isGenerated ? (
        <Button
          onClick={handleGenerateAppeal}
          className="w-full bg-rose-600 hover:bg-rose-500 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-rose-600/20 flex items-center justify-center gap-2 cursor-pointer"
        >
          <FileText className="w-5 h-5" /> Auto-Compile Formal Clinical Appeal Package
        </Button>
      ) : (
        <div className="space-y-4 animate-fade-in">
          <div className="space-y-2">
            <span className="text-xs font-mono text-zinc-400 font-bold uppercase">Compiled Appeal Letter & Evidence Attachment:</span>
            <div className="bg-zinc-950 p-4 rounded-2xl border border-white/10 text-xs font-mono text-zinc-300 space-y-3 leading-relaxed">
              <p className="text-emerald-400 font-bold">RE: APPEAL OF DENIAL FOR CLAIM {sampleDenial.claimId} — PATIENT: MAYA LIN</p>
              <p>
                Dear Appeals Department at {sampleDenial.payerName},
              </p>
              <p>
                We are writing to formally appeal the denial of Claim #{sampleDenial.claimId} for service date {sampleDenial.serviceDate} under Denial Code 197. Attached to this electronic submission package please find:
              </p>
              <ul className="list-disc list-inside space-y-1 text-zinc-400 pl-2">
                <li>Approved Prior Authorization Proof (PA-2026-8812, Sunshine Health)</li>
                <li>Signed Session Note with Digital Signature Verification Hash</li>
                <li>21st Century Cures Act Geolocation EVV Timestamp Log</li>
                <li>Rendering Provider Credential Certificate (BCBA / RBT NPI)</li>
              </ul>
              <p className="text-zinc-500">Sincerely, Clinical Billing Compliance Dept.</p>
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <Button
              onClick={handleResubmitClaim}
              isLoading={isSubmitting}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-8 py-3 rounded-xl shadow-lg shadow-emerald-600/20 flex items-center gap-2 cursor-pointer"
            >
              <Send className="w-4 h-4" /> Resubmit Corrected 837P Claim Batch
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
