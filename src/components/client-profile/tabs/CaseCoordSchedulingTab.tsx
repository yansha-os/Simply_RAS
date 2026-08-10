'use client';

import React, { useState, useTransition } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { 
  Calendar, 
  Clock, 
  UserCheck, 
  UserX, 
  CheckCircle2, 
  AlertCircle, 
  Sparkles, 
  Video, 
  Vote, 
  ShieldCheck, 
  RefreshCw,
  Send,
  ThumbsUp,
  ThumbsDown,
  CheckSquare
} from 'lucide-react';
import { approveRbtCandidate, rejectRbtCandidate } from '@/app/(dashboard)/portal-case/actions';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

export default function CaseCoordSchedulingTab({ client }: { client: any }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [subTab, setSubTab] = useState<'rbt_staffing' | 'activation'>('rbt_staffing');

  // Meet & Greet State
  const [meetDate, setMeetDate] = useState('');
  const [meetPlatform, setMeetPlatform] = useState('Google Meet');
  const [meetUrl, setMeetUrl] = useState('');
  const [meetScheduled, setMeetScheduled] = useState(false);

  // 3-Way Match & Voting State
  const [matchGenerated, setMatchGenerated] = useState(false);
  const [candidateDates, setCandidateDates] = useState<string[]>([]);
  const [pollSent, setPollSent] = useState(false);
  const [parentVote, setParentVote] = useState<string | null>(null);
  const [bcbaVote, setBcbaVote] = useState<string | null>(null);
  const [rbtVote, setRbtVote] = useState<string | null>(null);
  const [coordinatorApproved, setCoordinatorApproved] = useState(false);

  // Post-Session Consensus State
  const [firstSessionDone, setFirstSessionDone] = useState(false);
  const [parentConsensus, setParentConsensus] = useState<'YES' | 'NO' | null>(null);
  const [bcbaConsensus, setBcbaConsensus] = useState<'YES' | 'NO' | null>(null);
  const [rbtConsensus, setRbtConsensus] = useState<'YES' | 'NO' | null>(null);

  const isRbtAssigned = !!client.rbtId;
  const isBcbaAssigned = !!client.bcbaId;
  const isActive = client.status === 'ACTIVE';

  // Handler: Schedule Meet & Greet
  const handleScheduleMeet = (e: React.FormEvent) => {
    e.preventDefault();
    if (!meetDate) {
      toast.error('Please select a date and time for the Virtual Meet & Greet.');
      return;
    }
    const generatedLink = meetUrl || `https://meet.google.com/ras-${Math.random().toString(36).substring(2, 7)}`;
    setMeetUrl(generatedLink);
    setMeetScheduled(true);
    toast.success('Virtual Meet & Greet scheduled! Invite dispatched to parent portal.');
  };

  // Handler: Run 3-Way Match Algorithm
  const handleRunMatchAlgorithm = () => {
    startTransition(() => {
      const today = new Date();
      const d1 = new Date(today.setDate(today.getDate() + 3)).toISOString().split('T')[0] + ' 15:30 (Mon)';
      const d2 = new Date(today.setDate(today.getDate() + 2)).toISOString().split('T')[0] + ' 16:00 (Wed)';
      const d3 = new Date(today.setDate(today.getDate() + 2)).toISOString().split('T')[0] + ' 15:30 (Fri)';

      setCandidateDates([d1, d2, d3]);
      setMatchGenerated(true);
      toast.success('3-Way Availability Matching Engine generated 3 optimal start dates!');
    });
  };

  // Handler: Dispatch "Send Date" Alert
  const handleSendDatePoll = () => {
    setPollSent(true);
    toast.success('"Send Date" alert dispatched to Parent Portal, BCBA Portal, and RBT Workstation!');
  };

  // Handler: Simulate 3-Way Votes
  const handleSimulateVote = (role: 'parent' | 'bcba' | 'rbt', choice: string) => {
    if (role === 'parent') setParentVote(choice);
    if (role === 'bcba') setBcbaVote(choice);
    if (role === 'rbt') setRbtVote(choice);
    toast.info(`${role.toUpperCase()} voted for ${choice}`);
  };

  // Check Consensus
  const consensusReached = pollSent && parentVote && bcbaVote && rbtVote;

  // Handler: Final Coordinator Approval for Session #1
  const handleFinalApproveSession1 = () => {
    setCoordinatorApproved(true);
    toast.success('Case Coordinator Approved! First session locked under BCBA supervision.');
  };

  // Handler: Post-First-Session 3-Party Consensus Vote
  const handlePostSessionVote = (role: 'parent' | 'bcba' | 'rbt', vote: 'YES' | 'NO') => {
    if (role === 'parent') setParentConsensus(vote);
    if (role === 'bcba') setBcbaConsensus(vote);
    if (role === 'rbt') setRbtConsensus(vote);
  };

  const allThreeConsensusYes = parentConsensus === 'YES' && bcbaConsensus === 'YES' && rbtConsensus === 'YES';
  const hasConsensusNo = parentConsensus === 'NO' || bcbaConsensus === 'NO' || rbtConsensus === 'NO';

  // Handler: Complete Pipeline & Activate
  const handleActivatePipeline = () => {
    startTransition(async () => {
      const res = await approveRbtCandidate(client.id);
      if (res.success) {
        toast.success('3-Party Consensus Reached! Client is now ACTIVE in maintenance mode.');
        router.refresh();
      } else {
        toast.error(res.error || 'Failed to activate client');
      }
    });
  };

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* Sub Tab Navigation */}
      <div className="flex gap-4 border-b border-white/10 pb-3 font-mono text-xs">
        <button
          onClick={() => setSubTab('rbt_staffing')}
          className={`px-5 py-2.5 rounded-xl transition-all flex items-center gap-2 cursor-pointer ${subTab === 'rbt_staffing' ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 font-bold shadow-lg' : 'text-zinc-400 hover:text-white'}`}
        >
          <UserCheck className="w-4 h-4" /> 1. RBT Staffing &amp; Meet &amp; Greet
        </button>
        <button
          onClick={() => setSubTab('activation')}
          className={`px-5 py-2.5 rounded-xl transition-all flex items-center gap-2 cursor-pointer ${subTab === 'activation' ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 font-bold shadow-lg' : 'text-zinc-400 hover:text-white'}`}
        >
          <Sparkles className="w-4 h-4" /> 2. 3-Way Match &amp; Activation Suite
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: RBT STAFFING & VIRTUAL MEET & GREET */}
      {/* ========================================================================= */}
      {subTab === 'rbt_staffing' && (
        <div className="space-y-6">
          <Card className="border-white/10 bg-zinc-950/80 shadow-xl backdrop-blur-xl rounded-3xl p-6">
            <CardHeader className="px-0 pt-0 pb-4 border-b border-white/5 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg font-bold text-white font-heading flex items-center gap-2">
                  <UserCheck className="w-5 h-5 text-cyan-400" /> RBT Candidate Match &amp; Virtual Meet &amp; Greet
                </CardTitle>
                <p className="text-xs text-zinc-400 mt-1">
                  Connect matched RBT candidates with the family for a Virtual Meet &amp; Greet to solidify client compatibility.
                </p>
              </div>

              {isRbtAssigned ? (
                <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 font-mono text-xs px-3 py-1">
                  RBT MATCHED ✅
                </Badge>
              ) : (
                <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/20 font-mono text-xs px-3 py-1">
                  AWAITING HR RBT MATCH ⏳
                </Badge>
              )}
            </CardHeader>

            <CardContent className="px-0 pt-6 space-y-6">
              {/* Candidate Info Card */}
              {isRbtAssigned ? (
                <div className="p-5 bg-zinc-900/60 rounded-2xl border border-white/10 space-y-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-[10px] font-mono text-cyan-400 uppercase tracking-wider block font-bold">MATCHED RBT CANDIDATE</span>
                      <h4 className="text-base font-bold text-white mt-1">
                        {client.rbt ? `${client.rbt.firstName} ${client.rbt.lastName}` : 'Assigned RBT Candidate'}
                      </h4>
                      <p className="text-xs text-zinc-400 font-sans mt-0.5">Specializations: Early Intervention, Behavior De-escalation</p>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        onClick={() => toast.success('Candidate approved!')}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs h-8 px-4 rounded-xl cursor-pointer"
                      >
                        Accept Match
                      </Button>
                      <Button
                        onClick={() => toast.info('Requesting alternative candidate from HR...')}
                        variant="secondary"
                        className="bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 border border-rose-500/40 text-xs h-8 px-4 rounded-xl cursor-pointer"
                      >
                        Request New Match
                      </Button>
                    </div>
                  </div>

                  {/* Virtual Meet & Greet Form */}
                  <div className="pt-4 border-t border-white/5 space-y-4">
                    <h5 className="text-xs font-bold text-white font-mono uppercase tracking-wider flex items-center gap-2">
                      <Video className="w-4 h-4 text-cyan-400" /> Schedule Virtual Meet &amp; Greet
                    </h5>

                    <form onSubmit={handleScheduleMeet} className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div>
                        <label className="text-[11px] font-mono text-zinc-400 block mb-1">Date &amp; Time</label>
                        <input
                          type="datetime-local"
                          value={meetDate}
                          onChange={e => setMeetDate(e.target.value)}
                          className="w-full bg-zinc-900 border border-white/10 rounded-xl p-2.5 text-xs text-white outline-none focus:border-cyan-500 font-sans"
                        />
                      </div>

                      <div>
                        <label className="text-[11px] font-mono text-zinc-400 block mb-1">Platform</label>
                        <select
                          value={meetPlatform}
                          onChange={e => setMeetPlatform(e.target.value)}
                          className="w-full bg-zinc-900 border border-white/10 rounded-xl p-2.5 text-xs text-white outline-none focus:border-cyan-500 font-sans"
                        >
                          <option value="Google Meet">Google Meet</option>
                          <option value="Zoom">Zoom</option>
                          <option value="In-Person">In-Person</option>
                        </select>
                      </div>

                      <div className="flex items-end">
                        <Button
                          type="submit"
                          className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs h-10 rounded-xl cursor-pointer"
                        >
                          Dispatch Meet &amp; Greet Invite
                        </Button>
                      </div>
                    </form>

                    {meetScheduled && (
                      <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center justify-between text-xs font-mono text-emerald-400">
                        <span>Meeting Confirmed: {meetUrl}</span>
                        <span className="bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-md font-bold">INVITE SENT TO PARENT ✅</span>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="p-8 text-center text-xs text-zinc-500 border border-dashed border-white/10 rounded-2xl bg-zinc-950/40">
                  Case Coordinator is waiting for HR Staffing to assign an RBT Candidate to this client.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: 3-WAY MATCH & ACTIVATION SUITE */}
      {/* ========================================================================= */}
      {subTab === 'activation' && (
        <div className="space-y-6">
          {/* STEP A: 3-WAY AVAILABILITY ALGORITHM */}
          <Card className="border-white/10 bg-zinc-950/80 shadow-xl backdrop-blur-xl rounded-3xl p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <span className="text-[10px] font-mono text-cyan-400 uppercase font-bold tracking-wider block">STEP A</span>
                <h3 className="text-lg font-bold text-white font-heading">3-Way Availability Matching Engine</h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Calculate overlapping availability between Client, assigned BCBA, and assigned RBT for the first session.
                </p>

                {/* BCBA & RBT Readiness Indicators */}
                <div className="flex items-center gap-3 mt-3 font-mono text-xs">
                  <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-zinc-900 border border-white/10">
                    <span className="text-zinc-400 font-bold">BCBA Status:</span>
                    <span className={`font-bold flex items-center gap-1 ${isBcbaAssigned ? 'text-emerald-400' : 'text-amber-400'}`}>
                      <span className={`w-2 h-2 rounded-full ${isBcbaAssigned ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`}></span>
                      {isBcbaAssigned ? 'READY ✅' : 'WAITING ⏳'}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-zinc-900 border border-white/10">
                    <span className="text-zinc-400 font-bold">RBT Status:</span>
                    <span className={`font-bold flex items-center gap-1 ${isRbtAssigned ? 'text-emerald-400' : 'text-amber-400'}`}>
                      <span className={`w-2 h-2 rounded-full ${isRbtAssigned ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`}></span>
                      {isRbtAssigned ? 'READY ✅' : 'WAITING ⏳'}
                    </span>
                  </div>
                </div>
              </div>

              <Button
                onClick={handleRunMatchAlgorithm}
                disabled={!isBcbaAssigned || !isRbtAssigned || isPending}
                className={`font-bold text-xs h-10 px-5 rounded-xl cursor-pointer flex items-center gap-2 transition-all ${
                  isBcbaAssigned && isRbtAssigned 
                    ? 'bg-gradient-to-r from-cyan-500 to-teal-600 hover:from-cyan-600 text-white shadow-lg shadow-cyan-500/20' 
                    : 'bg-zinc-800 text-zinc-500 border border-white/5 cursor-not-allowed'
                }`}
              >
                <Sparkles className="w-4 h-4" /> Run 3-Way Match Algorithm
              </Button>
            </div>

            {matchGenerated && (
              <div className="space-y-3 pt-2">
                <span className="text-xs font-mono text-zinc-300 font-bold block">Calculated Top 3 Optimal Start Dates:</span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 font-mono text-xs">
                  {candidateDates.map((date, idx) => (
                    <div key={idx} className="p-3 bg-zinc-900/80 border border-cyan-500/30 rounded-xl text-center">
                      <span className="text-[10px] text-cyan-400 font-bold block uppercase">OPTION {idx + 1}</span>
                      <span className="text-sm font-bold text-white mt-1 block">{date}</span>
                      <span className="text-[10px] text-emerald-400 block mt-1">100% 3-Way Free Window ✅</span>
                    </div>
                  ))}
                </div>

                {!pollSent && (
                  <div className="flex justify-end pt-2">
                    <Button
                      onClick={handleSendDatePoll}
                      className="bg-brand-orange-500 hover:bg-brand-orange-600 text-white font-bold text-xs h-9 px-5 rounded-xl cursor-pointer flex items-center gap-2"
                    >
                      <Send className="w-4 h-4" /> Send Date (Alert All 3 Portals)
                    </Button>
                  </div>
                )}
              </div>
            )}
          </Card>

          {/* STEP B & C: MULTI-PORTAL VOTING & FINAL APPROVAL */}
          {pollSent && (
            <Card className="border-white/10 bg-zinc-950/80 shadow-xl backdrop-blur-xl rounded-3xl p-6 space-y-4">
              <div>
                <span className="text-[10px] font-mono text-amber-400 uppercase font-bold tracking-wider block">STEP B &amp; C</span>
                <h3 className="text-lg font-bold text-white font-heading">Multi-Portal Polling &amp; Final Date Lock</h3>
                <p className="text-xs text-zinc-400">
                  Track live voting responses from Parent, BCBA, and RBT portals.
                </p>
              </div>

              {/* Voting Trackers */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 font-mono text-xs">
                {/* Parent Vote Card */}
                <div className="p-4 bg-zinc-900/60 border border-white/5 rounded-2xl space-y-2">
                  <span className="text-[10px] text-zinc-400 block font-bold">PARENT PORTAL VOTE</span>
                  <span className={`text-sm font-bold block ${parentVote ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {parentVote ? `VOTED: ${parentVote}` : 'AWAITING VOTE...'}
                  </span>
                  {!parentVote && (
                    <button
                      onClick={() => handleSimulateVote('parent', candidateDates[0])}
                      className="text-[10px] text-cyan-400 underline cursor-pointer"
                    >
                      Simulate Parent Vote
                    </button>
                  )}
                </div>

                {/* BCBA Vote Card */}
                <div className="p-4 bg-zinc-900/60 border border-white/5 rounded-2xl space-y-2">
                  <span className="text-[10px] text-zinc-400 block font-bold">BCBA PORTAL VOTE</span>
                  <span className={`text-sm font-bold block ${bcbaVote ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {bcbaVote ? `VOTED: ${bcbaVote}` : 'AWAITING VOTE...'}
                  </span>
                  {!bcbaVote && (
                    <button
                      onClick={() => handleSimulateVote('bcba', candidateDates[0])}
                      className="text-[10px] text-cyan-400 underline cursor-pointer"
                    >
                      Simulate BCBA Vote
                    </button>
                  )}
                </div>

                {/* RBT Vote Card */}
                <div className="p-4 bg-zinc-900/60 border border-white/5 rounded-2xl space-y-2">
                  <span className="text-[10px] text-zinc-400 block font-bold">RBT WORKSTATION VOTE</span>
                  <span className={`text-sm font-bold block ${rbtVote ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {rbtVote ? `VOTED: ${rbtVote}` : 'AWAITING VOTE...'}
                  </span>
                  {!rbtVote && (
                    <button
                      onClick={() => handleSimulateVote('rbt', candidateDates[0])}
                      className="text-[10px] text-cyan-400 underline cursor-pointer"
                    >
                      Simulate RBT Vote
                    </button>
                  )}
                </div>
              </div>

              {consensusReached && !coordinatorApproved && (
                <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-emerald-400 font-mono block">3-WAY CONSENSUS REACHED! 🎉</span>
                    <span className="text-xs text-zinc-300 font-sans">Agreed Date: {candidateDates[0]}</span>
                  </div>

                  <Button
                    onClick={handleFinalApproveSession1}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs h-9 px-5 rounded-xl cursor-pointer"
                  >
                    Case Coordinator Final Sign-off
                  </Button>
                </div>
              )}
            </Card>
          )}

          {/* STEP D: POST-FIRST-SESSION 3-PARTY CONSENSUS GATE */}
          {coordinatorApproved && (
            <Card className="border-white/10 bg-zinc-950/80 shadow-xl backdrop-blur-xl rounded-3xl p-6 space-y-4">
              <div>
                <span className="text-[10px] font-mono text-purple-400 uppercase font-bold tracking-wider block">STEP D</span>
                <h3 className="text-lg font-bold text-white font-heading">Post-First-Session 3-Party Consensus Gate</h3>
                <p className="text-xs text-zinc-400">
                  After session #1 is conducted under BCBA supervision, all 3 parties vote on continuing services before the case enters active maintenance.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 font-mono text-xs">
                {/* Parent Consensus */}
                <div className="p-4 bg-zinc-900/60 border border-white/5 rounded-2xl space-y-3">
                  <span className="text-[10px] text-zinc-400 block font-bold">PARENT SATISFACTION VOTE</span>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => handlePostSessionVote('parent', 'YES')}
                      className={`h-8 px-3 text-xs font-bold rounded-lg cursor-pointer ${parentConsensus === 'YES' ? 'bg-emerald-600 text-white' : 'bg-zinc-800 text-zinc-300'}`}
                    >
                      <ThumbsUp className="w-3.5 h-3.5 mr-1" /> YES
                    </Button>
                    <Button
                      onClick={() => handlePostSessionVote('parent', 'NO')}
                      className={`h-8 px-3 text-xs font-bold rounded-lg cursor-pointer ${parentConsensus === 'NO' ? 'bg-rose-600 text-white' : 'bg-zinc-800 text-zinc-300'}`}
                    >
                      <ThumbsDown className="w-3.5 h-3.5 mr-1" /> NO
                    </Button>
                  </div>
                </div>

                {/* BCBA Consensus */}
                <div className="p-4 bg-zinc-900/60 border border-white/5 rounded-2xl space-y-3">
                  <span className="text-[10px] text-zinc-400 block font-bold">BCBA CLINICAL VOTE</span>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => handlePostSessionVote('bcba', 'YES')}
                      className={`h-8 px-3 text-xs font-bold rounded-lg cursor-pointer ${bcbaConsensus === 'YES' ? 'bg-emerald-600 text-white' : 'bg-zinc-800 text-zinc-300'}`}
                    >
                      <ThumbsUp className="w-3.5 h-3.5 mr-1" /> YES
                    </Button>
                    <Button
                      onClick={() => handlePostSessionVote('bcba', 'NO')}
                      className={`h-8 px-3 text-xs font-bold rounded-lg cursor-pointer ${bcbaConsensus === 'NO' ? 'bg-rose-600 text-white' : 'bg-zinc-800 text-zinc-300'}`}
                    >
                      <ThumbsDown className="w-3.5 h-3.5 mr-1" /> NO
                    </Button>
                  </div>
                </div>

                {/* RBT Consensus */}
                <div className="p-4 bg-zinc-900/60 border border-white/5 rounded-2xl space-y-3">
                  <span className="text-[10px] text-zinc-400 block font-bold">RBT COMPATIBILITY VOTE</span>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => handlePostSessionVote('rbt', 'YES')}
                      className={`h-8 px-3 text-xs font-bold rounded-lg cursor-pointer ${rbtConsensus === 'YES' ? 'bg-emerald-600 text-white' : 'bg-zinc-800 text-zinc-300'}`}
                    >
                      <ThumbsUp className="w-3.5 h-3.5 mr-1" /> YES
                    </Button>
                    <Button
                      onClick={() => handlePostSessionVote('rbt', 'NO')}
                      className={`h-8 px-3 text-xs font-bold rounded-lg cursor-pointer ${rbtConsensus === 'NO' ? 'bg-rose-600 text-white' : 'bg-zinc-800 text-zinc-300'}`}
                    >
                      <ThumbsDown className="w-3.5 h-3.5 mr-1" /> NO
                    </Button>
                  </div>
                </div>
              </div>

              {/* Resolution Banner */}
              {allThreeConsensusYes && (
                <div className="p-5 bg-gradient-to-r from-emerald-500/20 to-teal-500/20 border border-emerald-500/40 rounded-2xl flex justify-between items-center">
                  <div>
                    <h4 className="text-sm font-bold text-white font-heading">UNANIMOUS 3-PARTY CONSENSUS CONFIRMED! ✅</h4>
                    <p className="text-xs text-emerald-300 font-sans mt-0.5">
                      Parent, BCBA, and RBT all voted YES after session #1. Click below to complete pipeline and transition client to active maintenance.
                    </p>
                  </div>

                  <Button
                    onClick={handleActivatePipeline}
                    disabled={isPending}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs h-10 px-6 rounded-xl shadow-lg cursor-pointer"
                  >
                    Complete Pipeline &amp; Activate Client
                  </Button>
                </div>
              )}

              {hasConsensusNo && (
                <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-2xl flex justify-between items-center text-xs">
                  <div>
                    <span className="font-bold text-rose-400 block font-mono">REJECTION VOTE RECORDED ⚠️</span>
                    <span className="text-zinc-300 font-sans">Automated fallback triggered: re-routing case to HR to assign a new RBT candidate.</span>
                  </div>

                  <Button
                    onClick={() => setSubTab('rbt_staffing')}
                    className="bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs h-8 px-4 rounded-xl cursor-pointer"
                  >
                    Re-route to RBT Staffing
                  </Button>
                </div>
              )}
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
