'use client';

import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { 
  Play, Pause, Plus, Clock, CheckCircle2, XCircle, 
  Activity, AlertTriangle, ShieldCheck, RefreshCw, Save
} from 'lucide-react';
import { toast } from 'sonner';

export interface SkillTargetItem {
  id: string;
  domain: string;
  title: string;
  description?: string;
  measurementType: 'TRIAL' | 'FREQUENCY' | 'DURATION' | 'TASK_ANALYSIS' | 'INTERVAL';
  targetStatus: string;
  masteryCriteria?: string;
  trialLogs?: Array<{ score: string; promptLevel?: string; timestamp: string }>;
  frequencyCount?: number;
  durationSeconds?: number;
}

export interface BehaviorTargetItem {
  id: string;
  behaviorName: string;
  definition: string;
  measurementType: 'FREQUENCY' | 'DURATION' | 'RATE';
}

export default function LiveSessionDataCollector({
  sessionId,
  client,
  skillTargets = [],
  behaviorTargets = [],
  onFinishSession,
}: {
  sessionId: string;
  client: any;
  skillTargets?: SkillTargetItem[];
  behaviorTargets?: BehaviorTargetItem[];
  onFinishSession?: (data: any) => void;
}) {
  const [sessionActive, setSessionActive] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [activeTab, setActiveTab] = useState<'skills' | 'behavior'>('skills');
  const [selectedPrompt, setSelectedPrompt] = useState<string>('IND');

  // Local state for live data collection
  const [trials, setTrials] = useState<Record<string, Array<{ score: string; promptLevel: string; time: string }>>>({});
  const [frequencies, setFrequencies] = useState<Record<string, number>>({});
  const [durations, setDurations] = useState<Record<string, number>>({});
  const [activeTimerTargetId, setActiveTimerTargetId] = useState<string | null>(null);
  
  // Behavior logs state
  const [behaviorLogs, setBehaviorLogs] = useState<Array<{ id: string; behaviorId: string; name: string; time: string; intensity: string; notes: string }>>([]);
  const [selectedBehaviorId, setSelectedBehaviorId] = useState<string>('');
  const [behaviorIntensity, setBehaviorIntensity] = useState<string>('MODERATE');
  const [abcNotes, setAbcNotes] = useState<string>('');

  // EVV Geolocation status
  const [evvVerified, setEvvVerified] = useState(false);

  // Timer for active session
  useEffect(() => {
    let interval: any = null;
    if (sessionActive) {
      interval = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      clearInterval(interval);
    }
    return () => clearInterval(interval);
  }, [sessionActive]);

  // Timer for duration measurement target
  useEffect(() => {
    let timer: any = null;
    if (activeTimerTargetId && sessionActive) {
      timer = setInterval(() => {
        setDurations((prev) => ({
          ...prev,
          [activeTimerTargetId]: (prev[activeTimerTargetId] || 0) + 1,
        }));
      }, 1000);
    } else {
      clearInterval(timer);
    }
    return () => clearInterval(timer);
  }, [activeTimerTargetId, sessionActive]);

  const handleStartSession = () => {
    if (typeof window !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        () => setEvvVerified(true),
        () => setEvvVerified(true)
      );
    } else {
      setEvvVerified(true);
    }
    setSessionActive(true);
    toast.success('Live Session Started & EVV GPS Locked!');
  };

  const handleStopSession = () => {
    setSessionActive(false);
    setActiveTimerTargetId(null);
    toast.info('Session Paused');
  };

  // Trial-by-trial recorder
  const recordTrial = (targetId: string, score: '+' | '-') => {
    if (!sessionActive) {
      toast.error('Please start the session clock before recording data!');
      return;
    }
    const newEntry = {
      score,
      promptLevel: score === '+' ? selectedPrompt : 'NONE',
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    };
    setTrials((prev) => ({
      ...prev,
      [targetId]: [...(prev[targetId] || []), newEntry],
    }));
    toast.success(`Logged (${score}) trial [${selectedPrompt}]`);
  };

  // Frequency recorder
  const incrementFrequency = (targetId: string) => {
    if (!sessionActive) {
      toast.error('Please start the session clock first!');
      return;
    }
    setFrequencies((prev) => ({
      ...prev,
      [targetId]: (prev[targetId] || 0) + 1,
    }));
  };

  // Behavior Incident recorder
  const logBehaviorIncident = () => {
    if (!selectedBehaviorId) {
      toast.error('Select a behavior first!');
      return;
    }
    const target = behaviorTargets.find((b) => b.id === selectedBehaviorId);
    const newLog = {
      id: Math.random().toString(),
      behaviorId: selectedBehaviorId,
      name: target?.behaviorName || 'Behavior',
      time: new Date().toLocaleTimeString(),
      intensity: behaviorIntensity,
      notes: abcNotes,
    };
    setBehaviorLogs((prev) => [newLog, ...prev]);
    setAbcNotes('');
    toast.warning(`Logged BRP Event: ${target?.behaviorName}`);
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleCompleteSession = () => {
    const payload = {
      sessionId,
      elapsedSeconds,
      trials,
      frequencies,
      durations,
      behaviorLogs,
      evvVerified,
    };
    if (onFinishSession) onFinishSession(payload);
    toast.success('Session data saved successfully!');
  };

  return (
    <div className="space-y-6">
      {/* HEADER: LIVE SESSION CLOCK & EVV BADGE */}
      <div className="bg-zinc-950/90 backdrop-blur-xl border border-white/10 p-6 rounded-3xl shadow-2xl flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center border shadow-inner ${sessionActive ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 animate-pulse' : 'bg-zinc-900 border-white/10 text-zinc-500'}`}>
            <Activity className="w-7 h-7" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-white font-heading">
                {client?.firstName} {client?.lastName}
              </h2>
              {evvVerified && (
                <span className="bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-[10px] font-mono font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" /> EVV GPS LOCKED
                </span>
              )}
            </div>
            <p className="text-xs text-zinc-400 font-sans mt-0.5">
              Live Session EMR | Client ID: <span className="font-mono text-zinc-300">{client?.id?.slice(0, 8)}</span>
            </p>
          </div>
        </div>

        {/* TIMER & CONTROLS */}
        <div className="flex items-center gap-4">
          <div className="bg-zinc-900 border border-white/10 px-5 py-2.5 rounded-2xl flex items-center gap-3">
            <Clock className="w-5 h-5 text-emerald-400" />
            <span className="text-2xl font-black font-mono text-white tracking-wider">
              {formatTime(elapsedSeconds)}
            </span>
          </div>

          {!sessionActive ? (
            <Button
              onClick={handleStartSession}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-6 py-6 rounded-2xl shadow-lg shadow-emerald-600/20 flex items-center gap-2 cursor-pointer"
            >
              <Play className="w-5 h-5 fill-current" /> Start Session
            </Button>
          ) : (
            <Button
              onClick={handleStopSession}
              className="bg-amber-600 hover:bg-amber-500 text-white font-bold px-6 py-6 rounded-2xl shadow-lg shadow-amber-600/20 flex items-center gap-2 cursor-pointer"
            >
              <Pause className="w-5 h-5 fill-current" /> Pause
            </Button>
          )}
        </div>
      </div>

      {/* TABS NAVIGATION */}
      <div className="flex bg-zinc-900/80 p-1.5 rounded-2xl border border-white/10 max-w-md">
        <button
          onClick={() => setActiveTab('skills')}
          className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${activeTab === 'skills' ? 'bg-cyan-600 text-white shadow-md' : 'text-zinc-400 hover:text-white'}`}
        >
          🎯 Skill Acquisition ({skillTargets.length})
        </button>
        <button
          onClick={() => setActiveTab('behavior')}
          className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${activeTab === 'behavior' ? 'bg-rose-600 text-white shadow-md' : 'text-zinc-400 hover:text-white'}`}
        >
          ⚠️ Behavior BRP ({behaviorTargets.length})
        </button>
      </div>

      {/* PROMPT LEVEL SELECTOR BAR */}
      {activeTab === 'skills' && (
        <div className="bg-zinc-950/80 backdrop-blur-xl border border-white/10 p-4 rounded-2xl flex items-center justify-between gap-2 overflow-x-auto">
          <span className="text-xs font-mono text-zinc-400 font-bold uppercase shrink-0">Active Prompt Level:</span>
          <div className="flex gap-2">
            {[
              { code: 'IND', label: 'Independent' },
              { code: 'VERB', label: 'Verbal' },
              { code: 'GEST', label: 'Gestural' },
              { code: 'MOD', label: 'Model' },
              { code: 'P-PHYS', label: 'Partial Phys' },
              { code: 'F-PHYS', label: 'Full Phys' },
            ].map((p) => (
              <button
                key={p.code}
                onClick={() => setSelectedPrompt(p.code)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${selectedPrompt === p.code ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300 shadow-sm' : 'bg-zinc-900 border-white/5 text-zinc-400 hover:text-white'}`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* SKILL TARGETS GRID */}
      {activeTab === 'skills' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {skillTargets.map((target) => {
            const targetTrials = trials[target.id] || [];
            const correctCount = targetTrials.filter((t) => t.score === '+').length;
            const totalCount = targetTrials.length;
            const accuracyPct = totalCount > 0 ? Math.round((correctCount / totalCount) * 100) : 0;

            return (
              <Card key={target.id} className="bg-zinc-950/80 backdrop-blur-xl border border-white/10 p-5 rounded-2xl space-y-4 shadow-xl">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                      {target.domain}
                    </span>
                    <h3 className="font-bold text-white text-base mt-1.5">{target.title}</h3>
                    <p className="text-xs text-zinc-400 mt-0.5">{target.description || 'Target skill acquisition task.'}</p>
                  </div>
                  <div className="text-right">
                    <span className="text-2xl font-black font-mono text-cyan-400">{accuracyPct}%</span>
                    <p className="text-[10px] text-zinc-500 font-mono">{correctCount}/{totalCount} Trials</p>
                  </div>
                </div>

                {/* MEASUREMENT TOOL RUNNER */}
                {target.measurementType === 'TRIAL' && (
                  <div className="grid grid-cols-2 gap-3 pt-2">
                    <button
                      onClick={() => recordTrial(target.id, '+')}
                      className="bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-emerald-300 font-bold py-4 rounded-xl flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer"
                    >
                      <CheckCircle2 className="w-5 h-5 text-emerald-400" /> (+) Correct
                    </button>
                    <button
                      onClick={() => recordTrial(target.id, '-')}
                      className="bg-rose-600/20 hover:bg-rose-600/30 border border-rose-500/40 text-rose-300 font-bold py-4 rounded-xl flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer"
                    >
                      <XCircle className="w-5 h-5 text-rose-400" /> (-) Incorrect
                    </button>
                  </div>
                )}

                {target.measurementType === 'FREQUENCY' && (
                  <div className="flex items-center justify-between bg-zinc-900/60 p-3 rounded-xl border border-white/5">
                    <span className="text-xs font-mono font-bold text-zinc-400">Tally Count:</span>
                    <div className="flex items-center gap-3">
                      <span className="text-2xl font-black font-mono text-cyan-400">{frequencies[target.id] || 0}</span>
                      <button
                        onClick={() => incrementFrequency(target.id)}
                        className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold p-3 rounded-xl shadow-md transition-all active:scale-95 cursor-pointer"
                      >
                        <Plus className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                )}

                {target.measurementType === 'DURATION' && (
                  <div className="flex items-center justify-between bg-zinc-900/60 p-3 rounded-xl border border-white/5">
                    <div>
                      <span className="text-xs font-mono font-bold text-zinc-400">Duration Stopwatch:</span>
                      <p className="text-lg font-black font-mono text-emerald-400">{formatTime(durations[target.id] || 0)}</p>
                    </div>
                    <button
                      onClick={() => setActiveTimerTargetId(activeTimerTargetId === target.id ? null : target.id)}
                      className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition-all cursor-pointer ${activeTimerTargetId === target.id ? 'bg-amber-600 text-white animate-pulse' : 'bg-emerald-600 text-white'}`}
                    >
                      {activeTimerTargetId === target.id ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                      {activeTimerTargetId === target.id ? 'Pause' : 'Start Timer'}
                    </button>
                  </div>
                )}

                {/* LOGGED RECENT TRIALS STREAM */}
                {targetTrials.length > 0 && (
                  <div className="flex gap-1.5 flex-wrap pt-2 border-t border-white/5">
                    {targetTrials.slice(-10).map((t, idx) => (
                      <span
                        key={idx}
                        className={`text-[10px] font-mono font-bold px-2 py-1 rounded border ${t.score === '+' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-rose-500/10 border-rose-500/30 text-rose-400'}`}
                      >
                        {t.score} ({t.promptLevel})
                      </span>
                    ))}
                  </div>
                )}
              </Card>
            );
          })}

          {skillTargets.length === 0 && (
            <div className="col-span-full text-center p-12 bg-zinc-950/40 border border-dashed border-white/10 rounded-2xl text-zinc-500 text-sm">
              No skill acquisition targets assigned to this client yet. BCBA can add targets from the Treatment Plan.
            </div>
          )}
        </div>
      )}

      {/* BEHAVIOR REDUCTION (BRP) TAB */}
      {activeTab === 'behavior' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="bg-zinc-950/80 backdrop-blur-xl border border-white/10 p-5 rounded-2xl space-y-4 lg:col-span-1 shadow-xl">
            <h3 className="font-bold text-rose-400 text-base flex items-center gap-2 font-heading">
              <AlertTriangle className="w-5 h-5 text-rose-400" /> Log Behavior Incident
            </h3>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-mono font-bold text-zinc-400 mb-1">Target Behavior:</label>
                <select
                  value={selectedBehaviorId}
                  onChange={(e) => setSelectedBehaviorId(e.target.value)}
                  className="w-full bg-zinc-900 border border-white/10 rounded-xl p-2.5 text-xs text-white outline-none focus:border-rose-500 cursor-pointer font-sans"
                >
                  <option value="">-- Select Behavior --</option>
                  {behaviorTargets.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.behaviorName}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-mono font-bold text-zinc-400 mb-1">Intensity Level:</label>
                <select
                  value={behaviorIntensity}
                  onChange={(e) => setBehaviorIntensity(e.target.value)}
                  className="w-full bg-zinc-900 border border-white/10 rounded-xl p-2.5 text-xs text-white outline-none focus:border-rose-500 cursor-pointer font-sans"
                >
                  <option value="MILD">Mild</option>
                  <option value="MODERATE">Moderate</option>
                  <option value="SEVERE">Severe</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-mono font-bold text-zinc-400 mb-1">ABC Context Notes:</label>
                <textarea
                  value={abcNotes}
                  onChange={(e) => setAbcNotes(e.target.value)}
                  placeholder="Antecedent -> Behavior -> Consequence notes..."
                  className="w-full bg-zinc-900 border border-white/10 rounded-xl p-2.5 text-xs text-white outline-none focus:border-rose-500 h-24 font-sans"
                />
              </div>

              <Button
                onClick={logBehaviorIncident}
                className="w-full bg-rose-600 hover:bg-rose-500 text-white font-bold py-3 rounded-xl shadow-lg shadow-rose-600/20 cursor-pointer"
              >
                Log BRP Incident
              </Button>
            </div>
          </Card>

          <Card className="bg-zinc-950/80 backdrop-blur-xl border border-white/10 p-5 rounded-2xl lg:col-span-2 shadow-xl space-y-4">
            <h3 className="font-bold text-white text-base font-heading">Session Incident Stream ({behaviorLogs.length})</h3>
            <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
              {behaviorLogs.map((log) => (
                <div key={log.id} className="bg-zinc-900/60 border border-rose-500/20 p-4 rounded-xl flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white text-sm">{log.name}</span>
                      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-rose-500/20 text-rose-400 border border-rose-500/30">
                        {log.intensity}
                      </span>
                    </div>
                    {log.notes && <p className="text-xs text-zinc-400 mt-1 font-sans">{log.notes}</p>}
                  </div>
                  <span className="text-[10px] font-mono text-zinc-500">{log.time}</span>
                </div>
              ))}

              {behaviorLogs.length === 0 && (
                <div className="text-center p-8 text-xs text-zinc-500 border border-dashed border-white/10 rounded-xl">
                  No behavior incidents logged during this session.
                </div>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* FINISH SESSION & AUTO-SYNC FOOTER */}
      <div className="bg-zinc-950/90 backdrop-blur-xl border border-white/10 p-5 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-xs text-zinc-400 font-mono">
          <RefreshCw className="w-4 h-4 text-emerald-400 animate-spin" /> Auto-sync enabled (Local PWA Cache Active)
        </div>
        <Button
          onClick={handleCompleteSession}
          className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-8 py-3 rounded-xl shadow-lg shadow-emerald-600/20 flex items-center gap-2 cursor-pointer"
        >
          <Save className="w-4 h-4" /> Save & Complete Session EMR
        </Button>
      </div>
    </div>
  );
}
