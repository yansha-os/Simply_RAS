'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Activity, Play, Square, CheckCircle2, ShieldCheck, Send, FileText, Lock } from 'lucide-react';
import { toast } from 'sonner';

type DeidentifiedClientContext = {
  deidentifiedName: string;
  childAge: number;
  cptCode: string;
  location: string;
};

type SkillTarget = {
  id: string;
  name: string;
  domain: string;
  trials: {
    independent: number;
    prompted: number;
    total: number;
  };
};

type BehaviorSummary = {
  id: string;
  name: string;
  count: number;
  durationMinutes: number;
};

export default function RbtDeidentifiedSessionView() {
  // Session State
  const [sessionActive, setSessionActive] = useState(false);
  const [sessionTimeSeconds, setSessionTimeSeconds] = useState(0);
  const [timerInterval, setTimerInterval] = useState<ReturnType<typeof window.setInterval> | null>(
    null
  );

  // De-identified Client Context (ZERO PHI)
  const clientContext: DeidentifiedClientContext = {
    deidentifiedName: 'Liam M.',
    childAge: 4,
    cptCode: '97153 (Adaptive Behavior Tx)',
    location: 'Home / Clinic'
  };

  // Skill Acquisition Targets
  const [targets, setTargets] = useState<SkillTarget[]>([
    { id: '1', name: 'Expressive Identification (Objects)', domain: 'Mand/Tact', trials: { independent: 5, prompted: 2, total: 7 } },
    { id: '2', name: 'Receptive Instruction Following', domain: 'Listener Responding', trials: { independent: 8, prompted: 1, total: 9 } },
    { id: '3', name: 'Peer Social Turn-Taking', domain: 'Social Skills', trials: { independent: 3, prompted: 4, total: 7 } },
  ]);

  // Behavior Reduction (BRP) Counters
  const [behaviors, setBehaviors] = useState<BehaviorSummary[]>([
    { id: 'b1', name: 'Tantrum / Crying', count: 2, durationMinutes: 4 },
    { id: 'b2', name: 'Elopement', count: 0, durationMinutes: 0 },
  ]);

  // Signatures
  const [rbtSignature, setRbtSignature] = useState('');
  const [parentSignature, setParentSignature] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);

  const startSession = () => {
    setSessionActive(true);
    toast.success('Session started! Data collection active.');
    const interval = setInterval(() => {
      setSessionTimeSeconds(prev => prev + 1);
    }, 1000);
    setTimerInterval(interval);
  };

  const stopSession = () => {
    setSessionActive(false);
    if (timerInterval) clearInterval(timerInterval);
    toast.info('Session stopped. Complete session note below.');
  };

  const recordTrial = (targetId: string, result: 'independent' | 'prompted') => {
    if (!sessionActive) {
      toast.error('Please click "Start Session" before recording data.');
      return;
    }

    setTargets(prev => prev.map(t => {
      if (t.id !== targetId) return t;
      return {
        ...t,
        trials: {
          ...t.trials,
          independent: result === 'independent' ? t.trials.independent + 1 : t.trials.independent,
          prompted: result === 'prompted' ? t.trials.prompted + 1 : t.trials.prompted,
          total: t.trials.total + 1
        }
      };
    }));
  };

  const incrementBehavior = (bId: string) => {
    if (!sessionActive) {
      toast.error('Please start session first.');
      return;
    }
    setBehaviors(prev => prev.map(b => b.id === bId ? { ...b, count: b.count + 1 } : b));
  };

  const handleSubmitSessionNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!rbtSignature.trim() || !parentSignature.trim()) {
      toast.error('Both RBT and Parent digital signatures are required.');
      return;
    }

    setIsSubmitted(true);
    toast.success('Session note signed & submitted! Converted into billable 97153 units for Billing Team.');
  };

  const formatTimer = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-8">
      {/* Top Banner: De-Identified Client Header (Zero-PHI) */}
      <div className="bg-zinc-950 p-6 rounded-xl border border-brand-orange-500/30 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-brand-orange-500/10 border border-brand-orange-500/30 flex items-center justify-center text-brand-orange-400 font-bold shrink-0">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-white">Client: {clientContext.deidentifiedName}</h1>
              <span className="bg-zinc-800 text-zinc-300 text-[10px] font-bold px-2 py-0.5 rounded border border-white/10 flex items-center gap-1">
                <Lock className="w-3 h-3 text-green-400" /> De-Identified View
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-1">
              Age {clientContext.childAge} • CPT {clientContext.cptCode} • {clientContext.location}
            </p>
          </div>
        </div>

        {/* Live Timer Controls */}
        <div className="flex items-center gap-4 bg-zinc-900 px-5 py-3 rounded-xl border border-white/10">
          <div>
            <span className="text-[10px] text-zinc-500 uppercase font-bold block">Session Timer</span>
            <span className="font-mono text-xl font-black text-white">{formatTimer(sessionTimeSeconds)}</span>
          </div>

          {!sessionActive ? (
            <Button onClick={startSession} className="bg-green-600 hover:bg-green-700 text-white font-bold text-xs px-4 h-9">
              <Play className="w-4 h-4 mr-1.5 fill-current" /> Start Session
            </Button>
          ) : (
            <Button onClick={stopSession} className="bg-red-600 hover:bg-red-700 text-white font-bold text-xs px-4 h-9">
              <Square className="w-4 h-4 mr-1.5 fill-current" /> Stop Session
            </Button>
          )}
        </div>
      </div>

      {/* 1. Skill Acquisition Trial-by-Trial Data Collection */}
      <Card className="border-white/10 bg-zinc-950 shadow-lg">
        <CardHeader className="pb-4 border-b border-white/5">
          <CardTitle className="text-base text-white flex items-center gap-2">
            <Activity className="w-5 h-5 text-brand-orange-400" />
            Skill Acquisition Trial Data Collection
          </CardTitle>
          <p className="text-xs text-zinc-400 mt-1">Click Independent (+) or Prompted (P) for each trial run.</p>
        </CardHeader>
        <CardContent className="pt-6 space-y-4">
          {targets.map(target => {
            const indPct = target.trials.total > 0 ? Math.round((target.trials.independent / target.trials.total) * 100) : 0;

            return (
              <div key={target.id} className="p-4 bg-zinc-900 rounded-xl border border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-brand-blue-500/10 text-brand-blue-400 border border-brand-blue-500/20">
                      {target.domain}
                    </span>
                    <h4 className="text-sm font-bold text-white">{target.name}</h4>
                  </div>

                  <div className="flex items-center gap-4 mt-2 text-xs text-zinc-400">
                    <span>Total Trials: <strong className="text-white">{target.trials.total}</strong></span>
                    <span>Independent: <strong className="text-green-400">{target.trials.independent}</strong></span>
                    <span>Prompted: <strong className="text-amber-400">{target.trials.prompted}</strong></span>
                    <span className="font-bold text-brand-orange-400">{indPct}% Success</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    onClick={() => recordTrial(target.id, 'independent')}
                    className="bg-green-600/20 hover:bg-green-600 text-green-400 hover:text-white border border-green-500/30 text-xs font-bold px-3.5 h-8"
                  >
                    + Independent
                  </Button>
                  <Button
                    onClick={() => recordTrial(target.id, 'prompted')}
                    className="bg-amber-500/20 hover:bg-amber-600 text-amber-400 hover:text-white border border-amber-500/30 text-xs font-bold px-3.5 h-8"
                  >
                    P Prompted
                  </Button>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* 2. Behavior Reduction (BRP) Counters */}
      <Card className="border-white/10 bg-zinc-950 shadow-lg">
        <CardHeader className="pb-4 border-b border-white/5">
          <CardTitle className="text-base text-white flex items-center gap-2">
            <Activity className="w-5 h-5 text-red-400" />
            Behavior Reduction (BRP) Data Collection
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          {behaviors.map(b => (
            <div key={b.id} className="p-4 bg-zinc-900 rounded-xl border border-white/5 flex items-center justify-between">
              <div>
                <h4 className="text-sm font-bold text-white">{b.name}</h4>
                <p className="text-xs text-zinc-400 mt-0.5">Frequency Count: <strong className="text-red-400">{b.count}</strong> occurrences</p>
              </div>

              <Button
                onClick={() => incrementBehavior(b.id)}
                className="bg-red-600/20 hover:bg-red-600 text-red-400 hover:text-white border border-red-500/30 text-xs font-bold px-3 h-8"
              >
                + Log Occurrence
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* 3. SOAP Session Note Compiler & Digital Signatures */}
      <Card className="border-white/10 bg-zinc-950 shadow-lg">
        <CardHeader className="pb-4 border-b border-white/5">
          <CardTitle className="text-base text-white flex items-center gap-2">
            <FileText className="w-5 h-5 text-brand-blue-400" />
            SOAP Session Note & Digital Signatures
          </CardTitle>
          <p className="text-xs text-zinc-400 mt-1">Compiled session note to convert completed units for Billing Team.</p>
        </CardHeader>
        <CardContent className="pt-6">
          {isSubmitted ? (
            <div className="bg-green-500/10 p-6 rounded-xl border border-green-500/20 text-center space-y-2">
              <CheckCircle2 className="w-10 h-10 text-green-400 mx-auto" />
              <h3 className="text-base font-bold text-white">Session Note Signed & Converted!</h3>
              <p className="text-xs text-zinc-400">
                Session data for {clientContext.deidentifiedName} has been transmitted directly to the Billing Team in CRM for claim submission.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmitSessionNote} className="space-y-6">
              <div className="p-4 bg-zinc-900 rounded-xl border border-white/5 space-y-2 text-xs text-zinc-300">
                <strong className="text-white block">Auto-Generated Summary:</strong>
                <p>Client participated in 97153 therapy for {formatTimer(sessionTimeSeconds)}.</p>
                <p>Target goals ran: 3 skill acquisition targets with 23 total trial runs.</p>
                <p>BRP occurrences logged: 2 Tantrum events noted.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">RBT Digital Signature</label>
                  <input
                    type="text"
                    placeholder="Type full legal name (e.g. John Doe, RBT)"
                    value={rbtSignature}
                    onChange={e => setRbtSignature(e.target.value)}
                    className="w-full bg-zinc-900 border border-white/10 rounded-lg p-3 text-xs text-white outline-none focus:border-brand-orange-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">Parent / Guardian Digital Signature</label>
                  <input
                    type="text"
                    placeholder="Type parent full name"
                    value={parentSignature}
                    onChange={e => setParentSignature(e.target.value)}
                    className="w-full bg-zinc-900 border border-white/10 rounded-lg p-3 text-xs text-white outline-none focus:border-brand-orange-500"
                    required
                  />
                </div>
              </div>

              <Button
                type="submit"
                className="w-full bg-green-600 hover:bg-green-700 text-white font-bold text-sm h-11 flex items-center justify-center gap-2 cursor-pointer"
              >
                <Send className="w-4 h-4" /> Sign Note & Convert to Billing Claim
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
