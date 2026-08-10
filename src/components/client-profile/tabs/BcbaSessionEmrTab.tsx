'use client';

import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Activity, CheckCircle2, Clock, FileText, AlertTriangle, UserCheck, Zap, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

export default function BcbaSessionEmrTab({ client }: { client: any }) {
  const [activeSubTab, setActiveSubTab] = useState<'session_logs' | 'supervision' | 'deficiencies'>('session_logs');
  
  // Mock/Derived EMR Session Data
  const sessions = client.sessions || [];
  const completedSessions = sessions.filter((s: any) => s.status === 'COMPLETED');
  const pendingSignoffSessions = completedSessions.filter((s: any) => s.note && (!s.note.bcbaSigned || !s.note.parentSigned));
  
  // Calculation of Supervision % (10-20% Rule)
  const totalDirectHours = completedSessions.reduce((acc: number, s: any) => acc + (s.cptCode === '97153' ? 2 : 0), 0);
  const totalSupervisionHours = completedSessions.reduce((acc: number, s: any) => acc + (s.cptCode === '97155' ? 2 : 0), 0);
  const supervisionRatio = totalDirectHours > 0 ? ((totalSupervisionHours / totalDirectHours) * 100).toFixed(1) : '15.0';

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* Header Banner */}
      <div className="p-6 rounded-3xl bg-zinc-950/80 border border-white/10 backdrop-blur-2xl shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white font-heading flex items-center gap-2">
            <Activity className="w-5 h-5 text-cyan-400" /> Day-to-Day Session EMR &amp; Supervision Tracker
          </h2>
          <p className="text-xs text-zinc-400 mt-1">
            Artemis-grade clinical workstation: Verify RBT notes, e-sign supervisor attestations, and track Medicaid 10-20% supervision rules.
          </p>
        </div>

        <div className="flex items-center gap-3 font-mono text-xs">
          <div className="p-3 bg-zinc-900/90 rounded-2xl border border-white/10 text-center">
            <span className="text-[10px] text-zinc-400 block uppercase font-bold">SUPERVISION RATIO</span>
            <span className={`text-base font-black ${parseFloat(supervisionRatio) >= 10 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {supervisionRatio}%
            </span>
          </div>
          <div className="p-3 bg-zinc-900/90 rounded-2xl border border-white/10 text-center">
            <span className="text-[10px] text-zinc-400 block uppercase font-bold">PENDING SIGNOFFS</span>
            <span className="text-base font-black text-amber-400">{pendingSignoffSessions.length}</span>
          </div>
        </div>
      </div>

      {/* Sub Tabs */}
      <div className="flex gap-4 border-b border-white/10 pb-2 text-xs font-mono">
        <button
          onClick={() => setActiveSubTab('session_logs')}
          className={`px-4 py-2 rounded-xl transition-all ${activeSubTab === 'session_logs' ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-bold' : 'text-zinc-400 hover:text-white'}`}
        >
          Daily Session Logs &amp; Sign-offs
        </button>
        <button
          onClick={() => setActiveSubTab('supervision')}
          className={`px-4 py-2 rounded-xl transition-all ${activeSubTab === 'supervision' ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-bold' : 'text-zinc-400 hover:text-white'}`}
        >
          Supervision Logs (10-20% Rule)
        </button>
        <button
          onClick={() => setActiveSubTab('deficiencies')}
          className={`px-4 py-2 rounded-xl transition-all ${activeSubTab === 'deficiencies' ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-bold' : 'text-zinc-400 hover:text-white'}`}
        >
          Note Deficiencies &amp; Audits
        </button>
      </div>

      {/* Content Area */}
      {activeSubTab === 'session_logs' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4">
            {completedSessions.length > 0 ? (
              completedSessions.map((session: any) => (
                <Card key={session.id} className="p-5 bg-zinc-950/80 border border-white/10 rounded-2xl space-y-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white text-sm">{new Date(session.scheduledStart).toLocaleDateString()}</span>
                        <span className="text-xs font-mono text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 px-2 py-0.5 rounded-md">
                          CPT {session.cptCode || '97153'}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-400 mt-1 font-sans">
                        RBT: {session.rbt ? `${session.rbt.firstName} ${session.rbt.lastName}` : 'Assigned RBT'} &bull; Location: {session.location || 'Clinic'}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 font-mono text-xs">
                      {session.note?.rbtSigned ? (
                        <span className="text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 rounded-lg">RBT Signed</span>
                      ) : (
                        <span className="text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-1 rounded-lg">RBT Pending</span>
                      )}

                      {session.note?.bcbaSigned ? (
                        <span className="text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 rounded-lg">BCBA Signed</span>
                      ) : (
                        <span className="text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2 py-1 rounded-lg">BCBA Sign Needed</span>
                      )}
                    </div>
                  </div>

                  {session.note?.clinicalContent && (
                    <div className="p-3 bg-zinc-900/60 rounded-xl border border-white/5 text-xs text-zinc-300 font-sans">
                      <span className="font-bold text-zinc-400 block mb-1">Clinical Note Summary:</span>
                      {session.note.clinicalContent}
                    </div>
                  )}

                  <div className="flex justify-end gap-2 pt-2 border-t border-white/5">
                    {!session.note?.bcbaSigned && (
                      <Button
                        onClick={() => toast.success('BCBA E-Signature applied to Session Note!')}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs h-8 px-4 rounded-xl cursor-pointer"
                      >
                        <ShieldCheck className="w-3.5 h-3.5 mr-1" /> E-Sign Supervisor Note
                      </Button>
                    )}
                  </div>
                </Card>
              ))
            ) : (
              <div className="p-8 text-center text-xs text-zinc-500 border border-dashed border-white/10 rounded-2xl bg-zinc-950/40">
                No session notes logged yet for this client.
              </div>
            )}
          </div>
        </div>
      )}

      {activeSubTab === 'supervision' && (
        <Card className="p-6 bg-zinc-950/80 border border-white/10 rounded-3xl space-y-4 font-sans">
          <h3 className="text-base font-bold text-white font-heading">Supervision Compliance Ledger (10-20% Mandatory Rule)</h3>
          <p className="text-xs text-zinc-400">
            Medicaid and Commercial Payers require 10-20% of direct RBT hours (CPT 97153) to be directly supervised by a BCBA (CPT 97155).
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 font-mono">
            <div className="p-4 bg-zinc-900/60 border border-white/5 rounded-2xl">
              <span className="text-xs text-zinc-400 block">DIRECT HOURS (97153)</span>
              <span className="text-xl font-bold text-white mt-1 block">{totalDirectHours} hrs</span>
            </div>
            <div className="p-4 bg-zinc-900/60 border border-white/5 rounded-2xl">
              <span className="text-xs text-zinc-400 block">SUPERVISION HOURS (97155)</span>
              <span className="text-xl font-bold text-cyan-400 mt-1 block">{totalSupervisionHours} hrs</span>
            </div>
            <div className="p-4 bg-zinc-900/60 border border-white/5 rounded-2xl">
              <span className="text-xs text-zinc-400 block">COMPLIANCE STATUS</span>
              <span className={`text-xl font-bold ${parseFloat(supervisionRatio) >= 10 ? 'text-emerald-400' : 'text-rose-400'} mt-1 block`}>
                {parseFloat(supervisionRatio) >= 10 ? 'COMPLIANT ✅' : 'NON-COMPLIANT ⚠️'}
              </span>
            </div>
          </div>
        </Card>
      )}

      {activeSubTab === 'deficiencies' && (
        <Card className="p-6 bg-zinc-950/80 border border-white/10 rounded-3xl space-y-4">
          <h3 className="text-base font-bold text-white font-heading">Flag Note Deficiency to RBT</h3>
          <p className="text-xs text-zinc-400">
            If an RBT note lacks proper behavioral data, ABC narratives, or signature requirements, flag it here to return it to their RBT portal.
          </p>

          <div className="space-y-3">
            <textarea
              placeholder="Describe the clinical error or missing data for the RBT to fix..."
              className="w-full bg-zinc-900 border border-white/10 rounded-xl p-3 text-xs text-white outline-none focus:border-cyan-500 font-sans"
              rows={3}
            />
            <div className="flex justify-end">
              <Button
                onClick={() => toast.success('Deficiency flagged and returned to RBT Workstation.')}
                className="bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs h-9 px-5 rounded-xl cursor-pointer"
              >
                <AlertTriangle className="w-3.5 h-3.5 mr-1" /> Flag Deficiency &amp; Return Note
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
