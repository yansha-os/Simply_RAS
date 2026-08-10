'use client';

import React, { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { AlertCircle, FileText, Download, Send, CheckCircle2, Clock, Activity, Award } from 'lucide-react';
import { compileReAuthPacket } from '@/lib/clinical/ReAuthPacketCompiler';
import { toast } from 'sonner';

export default function ReAuthCompilerDashboard() {
  const [isCompiled, setIsCompiled] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const sampleInput = {
    clientId: 'c-1',
    clientName: 'Ethan Wright',
    payerName: 'Sunshine Health (Medicaid)',
    currentAuthNumber: 'PA-2026-8812',
    expirationDate: '2026-08-30', // <30 days
    totalSessionsLogged: 48,
    attendedSessions: 46,
    masteredSkillTargetsCount: 14,
    inProgressTargetsCount: 6,
    brpReductionPct: 48,
  };

  const reAuthSummary = compileReAuthPacket(sampleInput);

  const handleCompilePacket = () => {
    setIsCompiled(true);
    toast.success('Compiled 6-month progress graphs, attendance %, and re-authorization submission packet!');
  };

  const handleSubmitReAuth = () => {
    setIsSubmitting(true);
    setTimeout(() => {
      setIsSubmitting(false);
      toast.success('Re-Authorization Packet submitted to insurer portal!');
    }, 1200);
  };

  return (
    <Card className="bg-zinc-950/80 backdrop-blur-xl border border-white/10 p-6 rounded-3xl space-y-6 shadow-2xl">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-white font-heading flex items-center gap-2">
              <Clock className="w-6 h-6 text-amber-400" /> 30-Day PA Re-Authorization & Progress Auto-Compiler
            </h2>
          </div>
          <p className="text-xs text-zinc-400 font-sans mt-1">
            Phase 9 - Auto-monitors PA expiration dates. At 30 days prior, auto-compiles 6-month skill mastery graphs, BRP behavior reduction trends, attendance %, and CPT unit schedules.
          </p>
        </div>

        <div className="bg-amber-500/10 border border-amber-500/20 text-amber-400 px-4 py-2 rounded-2xl font-mono font-bold text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-amber-400" /> EXPIRES IN {reAuthSummary.daysUntilExpiration} DAYS
        </div>
      </div>

      {/* CLIENT PA EXPIRATION SUMMARY CARD */}
      <div className="bg-zinc-900/60 border border-white/5 p-5 rounded-2xl space-y-3">
        <div className="flex justify-between items-start">
          <div>
            <h3 className="font-bold text-white text-lg">{sampleInput.clientName}</h3>
            <p className="text-xs text-zinc-400 font-mono">
              Current Auth: <span className="text-cyan-400">{sampleInput.currentAuthNumber}</span> | Payer: {sampleInput.payerName}
            </p>
          </div>
          <div className="text-right font-mono">
            <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-xl">
              Attendance: {reAuthSummary.attendancePct}%
            </span>
          </div>
        </div>
      </div>

      {/* COMPILE ACTION */}
      {!isCompiled ? (
        <Button
          onClick={handleCompilePacket}
          className="w-full bg-amber-600 hover:bg-amber-500 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-amber-600/20 flex items-center justify-center gap-2 cursor-pointer"
        >
          <FileText className="w-5 h-5" /> Auto-Compile 6-Month Re-Authorization Submission Package
        </Button>
      ) : (
        <div className="space-y-4 animate-fade-in">
          {/* COMPILED PACKET SUMMARY */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-zinc-900/60 border border-white/5 p-4 rounded-2xl space-y-1">
              <span className="text-[10px] font-mono font-bold text-cyan-400 uppercase">Skill Acquisition Summary</span>
              <p className="text-xs text-zinc-300 font-sans">{reAuthSummary.compiledSkillSummary}</p>
            </div>
            <div className="bg-zinc-900/60 border border-white/5 p-4 rounded-2xl space-y-1">
              <span className="text-[10px] font-mono font-bold text-emerald-400 uppercase">Behavior Reduction Summary</span>
              <p className="text-xs text-zinc-300 font-sans">{reAuthSummary.compiledBehaviorSummary}</p>
            </div>
          </div>

          {/* CPT UNITS REQUEST SCHEDULE */}
          <div className="space-y-2">
            <span className="text-xs font-mono text-zinc-400 font-bold uppercase">Requested 6-Month CPT Unit Schedule:</span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {reAuthSummary.recommendedCptUnits.map((item) => (
                <div key={item.cptCode} className="bg-zinc-900/40 border border-white/5 p-3 rounded-xl flex items-center justify-between">
                  <div>
                    <span className="font-bold text-white text-xs font-mono">{item.cptCode}</span>
                    <p className="text-[10px] text-zinc-400">{item.description}</p>
                  </div>
                  <span className="text-xs font-bold text-cyan-400 font-mono">{item.unitsRequested} Units</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button
              onClick={handleSubmitReAuth}
              isLoading={isSubmitting}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-8 py-3 rounded-xl shadow-lg shadow-emerald-600/20 flex items-center gap-2 cursor-pointer"
            >
              <Send className="w-4 h-4" /> Submit Re-Auth Package to Payer Portal
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
