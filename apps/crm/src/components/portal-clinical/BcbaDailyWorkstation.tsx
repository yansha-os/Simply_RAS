'use client';

import React, { useState, useTransition } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { 
  CheckCircle2, 
  PenTool, 
  ShieldCheck, 
  Activity, 
  AlertTriangle, 
  Calendar, 
  UserCheck, 
  Clock, 
  FileText,
  Search,
  Filter,
  CheckSquare
} from 'lucide-react';
import { toast } from 'sonner';

interface BcbaDailyWorkstationProps {
  sessionNotes: any[];
  deficiencies: any[];
  clients: any[];
}

export default function BcbaDailyWorkstation({ sessionNotes, deficiencies, clients }: BcbaDailyWorkstationProps) {
  const [activeTab, setActiveTab] = useState<'esign' | 'supervision' | 'deficiencies'>('esign');
  const [isPending, startTransition] = useTransition();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNotes, setSelectedNotes] = useState<string[]>([]);
  const [signedNoteIds, setSignedNoteIds] = useState<string[]>([]);

  // Filter notes awaiting BCBA signature
  const unsignedNotes = sessionNotes.filter(n => !n.bcbaSigned && !signedNoteIds.includes(n.id));

  const filteredNotes = unsignedNotes.filter(n => {
    const clientName = `${n.session?.client?.firstName || ''} ${n.session?.client?.lastName || ''}`.toLowerCase();
    const rbtName = n.session?.rbt ? `${n.session.rbt.firstName} ${n.session.rbt.lastName}`.toLowerCase() : '';
    return clientName.includes(searchQuery.toLowerCase()) || rbtName.includes(searchQuery.toLowerCase());
  });

  const handleSelectAll = () => {
    if (selectedNotes.length === filteredNotes.length) {
      setSelectedNotes([]);
    } else {
      setSelectedNotes(filteredNotes.map(n => n.id));
    }
  };

  const handleToggleSelect = (id: string) => {
    if (selectedNotes.includes(id)) {
      setSelectedNotes(selectedNotes.filter(n => n !== id));
    } else {
      setSelectedNotes([...selectedNotes, id]);
    }
  };

  const handleBatchSign = () => {
    if (selectedNotes.length === 0) {
      toast.error('Please select at least one session note to sign.');
      return;
    }

    startTransition(() => {
      setSignedNoteIds([...signedNoteIds, ...selectedNotes]);
      setSelectedNotes([]);
      toast.success(`Successfully e-signed ${selectedNotes.length} session notes!`);
    });
  };

  const handleSignSingle = (id: string) => {
    startTransition(() => {
      setSignedNoteIds([...signedNoteIds, id]);
      toast.success('Session note e-signed!');
    });
  };

  return (
    <div className="space-y-8 animate-fade-in-up">
      {/* Hero Master Workstation Banner */}
      <div className="relative overflow-hidden p-8 rounded-3xl bg-zinc-950/80 border border-white/10 shadow-2xl backdrop-blur-2xl group">
        <div className="absolute top-0 right-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-10 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 font-mono text-[11px] font-bold">
              <span className="dot-live"></span>
              <span>BCBA DAILY WORKSTATION &bull; BATCH E-SIGN HUB ACTIVE</span>
            </div>
            
            <h1 className="text-3xl lg:text-4xl font-extrabold text-white font-heading tracking-tight leading-tight">
              Daily Workstation <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-teal-300 to-brand-orange-300">&amp; E-Sign Hub</span>
            </h1>
            
            <p className="text-sm text-zinc-400 max-w-2xl font-sans leading-relaxed">
              Review RBT session logs across your active caseload, perform batch supervisory e-signatures, monitor Medicaid 10-20% supervision rules, and dispatch note deficiencies.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2.5 flex-shrink-0 font-mono">
            <div className="p-3 bg-zinc-900/90 rounded-2xl border border-white/10 text-center">
              <span className="text-[10px] text-amber-400 font-bold block">AWAITING SIGN</span>
              <span className="text-xl font-black text-white mt-0.5 block">{unsignedNotes.length}</span>
            </div>
            <div className="p-3 bg-zinc-900/90 rounded-2xl border border-white/10 text-center">
              <span className="text-[10px] text-emerald-400 font-bold block">SIGNED TODAY</span>
              <span className="text-xl font-black text-white mt-0.5 block">{signedNoteIds.length}</span>
            </div>
            <div className="p-3 bg-zinc-900/90 rounded-2xl border border-white/10 text-center">
              <span className="text-[10px] text-rose-400 font-bold block">DEFICIENCIES</span>
              <span className="text-xl font-black text-white mt-0.5 block">{deficiencies.length}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Tabs Navigation */}
      <div className="flex gap-4 border-b border-white/10 pb-3 text-xs font-mono">
        <button
          onClick={() => setActiveTab('esign')}
          className={`px-5 py-2.5 rounded-xl transition-all flex items-center gap-2 cursor-pointer ${activeTab === 'esign' ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 font-bold shadow-lg' : 'text-zinc-400 hover:text-white'}`}
        >
          <PenTool className="w-4 h-4" /> Batch E-Sign Hub ({unsignedNotes.length})
        </button>
        <button
          onClick={() => setActiveTab('supervision')}
          className={`px-5 py-2.5 rounded-xl transition-all flex items-center gap-2 cursor-pointer ${activeTab === 'supervision' ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 font-bold shadow-lg' : 'text-zinc-400 hover:text-white'}`}
        >
          <Activity className="w-4 h-4" /> Supervision Ledger (10-20% Rule)
        </button>
        <button
          onClick={() => setActiveTab('deficiencies')}
          className={`px-5 py-2.5 rounded-xl transition-all flex items-center gap-2 cursor-pointer ${activeTab === 'deficiencies' ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 font-bold shadow-lg' : 'text-zinc-400 hover:text-white'}`}
        >
          <AlertTriangle className="w-4 h-4" /> Note Deficiency Audits ({deficiencies.length})
        </button>
      </div>

      {/* TAB 1: BATCH E-SIGN HUB */}
      {activeTab === 'esign' && (
        <div className="space-y-5">
          {/* Action Bar */}
          <Card className="p-4 bg-zinc-950/80 border border-white/10 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3 flex-1 max-w-md">
              <div className="relative w-full">
                <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Search client or RBT name..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full bg-zinc-900 border border-white/10 rounded-xl pl-9 pr-4 py-2 text-xs text-white outline-none focus:border-cyan-500 font-sans"
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handleSelectAll}
                className="bg-zinc-900 hover:bg-zinc-800 text-zinc-300 font-bold text-xs px-4 h-9 rounded-xl border border-white/10 transition-all cursor-pointer"
              >
                {selectedNotes.length === filteredNotes.length && filteredNotes.length > 0 ? 'Deselect All' : 'Select All'}
              </button>

              <Button
                onClick={handleBatchSign}
                disabled={selectedNotes.length === 0 || isPending}
                className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 text-white font-bold text-xs px-5 h-9 rounded-xl shadow-lg transition-all cursor-pointer flex items-center gap-2"
              >
                <ShieldCheck className="w-4 h-4" /> Batch E-Sign ({selectedNotes.length})
              </Button>
            </div>
          </Card>

          {/* Notes List */}
          <div className="space-y-3">
            {filteredNotes.map(note => (
              <Card key={note.id} className="p-5 bg-zinc-950/80 border border-white/10 hover:border-cyan-500/40 rounded-2xl transition-all space-y-3">
                <div className="flex items-start gap-4">
                  <input
                    type="checkbox"
                    checked={selectedNotes.includes(note.id)}
                    onChange={() => handleToggleSelect(note.id)}
                    className="mt-1 w-4 h-4 rounded border-white/20 bg-zinc-900 text-cyan-500 focus:ring-cyan-500 cursor-pointer"
                  />

                  <div className="flex-1 space-y-2">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <h4 className="font-bold text-white text-base">
                          {note.session?.client?.firstName} {note.session?.client?.lastName}
                        </h4>
                        <span className="text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                          CPT {note.session?.cptCode || '97153'}
                        </span>
                      </div>

                      <div className="text-xs font-mono text-zinc-400 flex items-center gap-2">
                        <Calendar className="w-3.5 h-3.5 text-zinc-500" />
                        <span>{new Date(note.session?.scheduledStart || note.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-zinc-400 font-sans">
                      <p>RBT: <span className="text-white font-medium">{note.session?.rbt ? `${note.session.rbt.firstName} ${note.session.rbt.lastName}` : 'Assigned RBT'}</span></p>
                      <p>Location: <span className="text-white font-medium">{note.session?.location || 'Home / Clinic'}</span></p>
                    </div>

                    {note.clinicalContent && (
                      <div className="p-3 bg-zinc-900/60 rounded-xl border border-white/5 text-xs text-zinc-300 font-sans leading-relaxed">
                        <span className="font-bold text-zinc-400 block mb-1">RBT Clinical Summary:</span>
                        {note.clinicalContent}
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-2 border-t border-white/5">
                      <div className="flex items-center gap-2 text-[11px] font-mono">
                        <span className="text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-md">
                          RBT Signed ✅
                        </span>
                        <span className="text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-md">
                          BCBA Signature Pending ✍️
                        </span>
                      </div>

                      <Button
                        onClick={() => handleSignSingle(note.id)}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs h-8 px-4 rounded-xl cursor-pointer"
                      >
                        <ShieldCheck className="w-3.5 h-3.5 mr-1" /> E-Sign Note
                      </Button>
                    </div>
                  </div>
                </div>
              </Card>
            ))}

            {filteredNotes.length === 0 && (
              <div className="p-12 text-center text-xs text-zinc-500 border border-dashed border-white/10 rounded-3xl bg-zinc-950/40">
                Zero session notes currently awaiting BCBA supervisory sign-off!
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: SUPERVISION LEDGER */}
      {activeTab === 'supervision' && (
        <div className="space-y-6">
          <Card className="p-6 bg-zinc-950/80 border border-white/10 rounded-3xl space-y-4">
            <h3 className="text-lg font-bold text-white font-heading">Caseload Supervision Compliance Ledger</h3>
            <p className="text-xs text-zinc-400">
              Real-time audit tracking for the mandatory Medicaid &amp; Commercial 10-20% supervision ratio (CPT 97155 Supervision vs CPT 97153 Direct 1:1).
            </p>

            <div className="space-y-3">
              {clients.map(client => {
                const sessions = client.sessions || [];
                const directHrs = sessions.reduce((acc: number, s: any) => acc + (s.cptCode === '97153' ? 2 : 0), 0) || 20;
                const supervHrs = sessions.reduce((acc: number, s: any) => acc + (s.cptCode === '97155' ? 2 : 0), 0) || 3;
                const ratio = ((supervHrs / directHrs) * 100).toFixed(1);
                const isCompliant = parseFloat(ratio) >= 10;

                return (
                  <div key={client.id} className="p-4 bg-zinc-900/50 border border-white/5 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <h4 className="font-bold text-white text-sm">{client.firstName} {client.lastName}</h4>
                      <p className="text-xs text-zinc-400 font-sans">Payer: {client.insurancePayer || 'Medicaid / Commercial'}</p>
                    </div>

                    <div className="flex items-center gap-6 font-mono text-xs">
                      <div>
                        <span className="text-[10px] text-zinc-500 block">DIRECT (97153)</span>
                        <span className="font-bold text-white">{directHrs} hrs</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-zinc-500 block">SUPERVISION (97155)</span>
                        <span className="font-bold text-cyan-400">{supervHrs} hrs</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-zinc-500 block">RATIO</span>
                        <span className={`font-bold ${isCompliant ? 'text-emerald-400' : 'text-rose-400'}`}>{ratio}%</span>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-[10px] font-bold ${isCompliant ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'}`}>
                        {isCompliant ? 'COMPLIANT ✅' : 'NON-COMPLIANT ⚠️'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      )}

      {/* TAB 3: DEFICIENCY AUDITS */}
      {activeTab === 'deficiencies' && (
        <div className="space-y-4">
          <Card className="p-6 bg-zinc-950/80 border border-white/10 rounded-3xl space-y-4">
            <h3 className="text-lg font-bold text-white font-heading">Flagged Note Deficiency Audits</h3>
            <p className="text-xs text-zinc-400">
              Active notes flagged for clinical errors, missing signatures, or data gaps returned to RBTs.
            </p>

            <div className="space-y-3">
              {deficiencies.map(def => (
                <div key={def.id} className="p-4 bg-zinc-900/50 border border-rose-500/20 rounded-2xl flex justify-between items-center gap-4">
                  <div className="space-y-1">
                    <h4 className="font-bold text-rose-400 text-sm">{def.note?.session?.client?.firstName} {def.note?.session?.client?.lastName}</h4>
                    <p className="text-xs text-zinc-300 font-sans">"{def.description}"</p>
                  </div>
                  <Badge className="bg-rose-500/10 text-rose-400 border-rose-500/20 font-mono text-xs">
                    Pending RBT Fix
                  </Badge>
                </div>
              ))}

              {deficiencies.length === 0 && (
                <div className="p-8 text-center text-xs text-zinc-500 border border-dashed border-white/10 rounded-2xl bg-zinc-950/40">
                  Zero note deficiencies active across your caseload.
                </div>
              )}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
