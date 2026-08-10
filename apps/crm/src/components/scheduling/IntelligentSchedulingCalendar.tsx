'use client';

import React, { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Calendar as CalendarIcon, Clock, MapPin, ShieldCheck, Lock, AlertTriangle, Plus, Sparkles, User, CheckCircle2 } from 'lucide-react';
import { rankCandidateRbts, CandidateRbt, ClientSchedulingContext } from '@/lib/scheduling/SmartStaffClientMatcher';
import { toast } from 'sonner';

export default function IntelligentSchedulingCalendar() {
  const [selectedDay, setSelectedDay] = useState<string>('Monday, Aug 3');
  const [showMatchModal, setShowMatchModal] = useState<boolean>(false);

  // Mock candidates for smart matching
  const candidateRbts: CandidateRbt[] = [
    { id: 'rbt-1', firstName: 'Marcus', lastName: 'Vance', zipCode: '33101', isPayerCredentialed: true, activeClientCount: 2 },
    { id: 'rbt-2', firstName: 'Elena', lastName: 'Rostova', zipCode: '33139', isPayerCredentialed: false, activeClientCount: 4 }, // Uncredentialed
    { id: 'rbt-3', firstName: 'David', lastName: 'Kim', zipCode: '33125', isPayerCredentialed: true, activeClientCount: 1 },
  ];

  const clientContext: ClientSchedulingContext = {
    clientId: 'c-1',
    clientName: 'Ethan Wright',
    payerName: 'Sunshine Health (Medicaid)',
    zipCode: '33101',
    authUnitsRemaining: 48,
    requestedStart: '2026-08-03T09:00:00',
    requestedEnd: '2026-08-03T11:00:00',
  };

  const existingAppts = [
    { rbtId: 'rbt-3', start: '2026-08-03T09:30:00', end: '2026-08-03T11:30:00' }, // Conflict for David
  ];

  const rankedCandidates = rankCandidateRbts(clientContext, candidateRbts, existingAppts);

  const handleBookSession = (rbtName: string) => {
    setShowMatchModal(false);
    toast.success(`Scheduled session for ${clientContext.clientName} with ${rbtName}!`);
  };

  return (
    <Card className="bg-zinc-950/80 backdrop-blur-xl border border-white/10 p-6 rounded-3xl space-y-6 shadow-2xl">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-4">
        <div>
          <h2 className="text-xl font-bold text-white font-heading flex items-center gap-2">
            <CalendarIcon className="w-6 h-6 text-cyan-400" /> Intelligent Scheduling & Smart RBT Matcher
          </h2>
          <p className="text-xs text-zinc-400 font-sans mt-1">
            Phase 5 - Multi-constraint scheduling engine. Auto-ranks RBTs by GPS travel distance, payer credential clearance, and PA unit balances.
          </p>
        </div>

        <Button
          onClick={() => setShowMatchModal(true)}
          className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold px-6 py-3 rounded-xl shadow-lg shadow-cyan-600/20 flex items-center gap-2 cursor-pointer"
        >
          <Sparkles className="w-4 h-4" /> Book Session with Smart Matcher
        </Button>
      </div>

      {/* SCHEDULE CALENDAR GRID */}
      <div className="space-y-4">
        <div className="flex justify-between items-center bg-zinc-900/60 p-3 rounded-2xl border border-white/5">
          <span className="text-sm font-bold text-white font-heading">{selectedDay}</span>
          <span className="text-xs font-mono text-cyan-400">3 Sessions Scheduled</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-zinc-900/40 border border-emerald-500/30 p-4 rounded-2xl space-y-2">
            <div className="flex justify-between items-start">
              <span className="text-[10px] font-mono text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                09:00 AM - 11:00 AM
              </span>
              <span className="text-xs font-bold text-white font-mono">$148 Billed</span>
            </div>
            <h4 className="font-bold text-white text-base">Ethan Wright</h4>
            <p className="text-xs text-zinc-400">Rendering RBT: <span className="text-zinc-200 font-semibold">Marcus Vance</span></p>
            <p className="text-[10px] font-mono text-cyan-400">Payer: Sunshine Health (PA-2026-8812)</p>
          </div>

          <div className="bg-zinc-900/40 border border-white/10 p-4 rounded-2xl space-y-2">
            <div className="flex justify-between items-start">
              <span className="text-[10px] font-mono text-cyan-400 font-bold bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20">
                01:00 PM - 03:00 PM
              </span>
            </div>
            <h4 className="font-bold text-white text-base">Lucas Vance</h4>
            <p className="text-xs text-zinc-400">Rendering RBT: <span className="text-zinc-200 font-semibold">David Kim</span></p>
            <p className="text-[10px] font-mono text-cyan-400">Payer: Simply Healthcare</p>
          </div>

          <div className="bg-zinc-900/40 border border-dashed border-white/10 p-4 rounded-2xl flex flex-col items-center justify-center text-center cursor-pointer hover:border-cyan-500/40 transition-colors" onClick={() => setShowMatchModal(true)}>
            <Plus className="w-6 h-6 text-zinc-500 mb-1" />
            <span className="text-xs font-bold text-zinc-400">Add Session Slot</span>
          </div>
        </div>
      </div>

      {/* SMART MATCHING MODAL / DRAWER */}
      {showMatchModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-zinc-950 border border-white/10 max-w-2xl w-full rounded-3xl p-6 space-y-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start border-b border-white/10 pb-4">
              <div>
                <span className="text-[10px] font-mono font-bold uppercase px-2.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                  SMART MATCHING ALGORITHM
                </span>
                <h3 className="font-bold text-white text-xl font-heading mt-1">Recommended RBTs for {clientContext.clientName}</h3>
                <p className="text-xs text-zinc-400 font-sans mt-0.5">
                  Target Payer: <span className="text-cyan-300 font-semibold">{clientContext.payerName}</span> | Location: Zip {clientContext.zipCode}
                </p>
              </div>
              <button onClick={() => setShowMatchModal(false)} className="text-zinc-400 hover:text-white font-bold text-lg cursor-pointer">
                ✕
              </button>
            </div>

            <div className="space-y-4">
              {rankedCandidates.map((res, idx) => (
                <div
                  key={res.rbt.id}
                  className={`p-4 rounded-2xl border transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                    idx === 0 && res.matchScore >= 80
                      ? 'bg-emerald-950/20 border-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.15)]'
                      : res.hasScheduleConflict || res.credentialStatus === 'HARD_LOCKED'
                      ? 'bg-rose-950/20 border-rose-500/30'
                      : 'bg-zinc-900/60 border-white/10'
                  }`}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-white text-base">{res.rbt.firstName} {res.rbt.lastName}</h4>
                      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                        {res.matchScore}% Match
                      </span>
                      {idx === 0 && res.matchScore >= 80 && (
                        <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                          <Sparkles className="w-3 h-3" /> BEST MATCH
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-zinc-400 mt-1 font-sans flex items-center gap-2">
                      <span className="flex items-center gap-1 font-mono text-zinc-300">
                        <MapPin className="w-3.5 h-3.5 text-cyan-400" /> {res.distanceMiles} miles away
                      </span>
                      <span>•</span>
                      <span>Active Cases: {res.rbt.activeClientCount}</span>
                    </p>

                    <p className={`text-xs mt-1 font-sans ${res.hasScheduleConflict || res.credentialStatus === 'HARD_LOCKED' ? 'text-rose-400' : 'text-emerald-400'}`}>
                      {res.recommendationReason}
                    </p>
                  </div>

                  <Button
                    onClick={() => handleBookSession(`${res.rbt.firstName} ${res.rbt.lastName}`)}
                    disabled={res.hasScheduleConflict || res.credentialStatus === 'HARD_LOCKED'}
                    className={`px-5 py-2.5 rounded-xl font-bold text-xs cursor-pointer ${
                      res.hasScheduleConflict || res.credentialStatus === 'HARD_LOCKED'
                        ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed border border-white/5'
                        : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/20'
                    }`}
                  >
                    Confirm & Book Session
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
