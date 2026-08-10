'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ShieldCheck, CheckCircle2, XCircle, AlertTriangle, UserCheck, FileCheck, Award, CreditCard, ExternalLink, Video, Star, X, Mic, MicOff, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';

export interface OnboardingCandidate {
  id: string;
  name: string;
  email: string;
  bacbVerified: boolean;
  backgroundCleared: boolean;
  trainingsComplete: boolean;
  artemisAccountSetup: boolean;
  payrollComplete: boolean;
  payerCredentialed: boolean;
  interviewStatus?: 'NOT_SCHEDULED' | 'SCHEDULED' | 'PASSED' | 'REJECTED';
  interviewTime?: string;
}

const SAMPLE_ONBOARDING: OnboardingCandidate[] = [
  { id: 'jane-1', name: 'Jane Doe', email: 'jane.doe@gmail.com', bacbVerified: false, backgroundCleared: false, trainingsComplete: false, artemisAccountSetup: false, payrollComplete: false, payerCredentialed: false, interviewStatus: 'NOT_SCHEDULED' },
  { id: '1', name: 'David Miller', email: 'david.m@gmail.com', bacbVerified: true, backgroundCleared: true, trainingsComplete: true, artemisAccountSetup: true, payrollComplete: true, payerCredentialed: true, interviewStatus: 'SCHEDULED', interviewTime: '10:00 AM Today' },
  { id: '2', name: 'Sarah Jenkins', email: 'sarah.j@gmail.com', bacbVerified: true, backgroundCleared: true, trainingsComplete: false, artemisAccountSetup: false, payrollComplete: true, payerCredentialed: false, interviewStatus: 'SCHEDULED', interviewTime: '02:30 PM Today' },
  { id: '3', name: 'Jessica Alba', email: 'jessica.a@outlook.com', bacbVerified: true, backgroundCleared: false, trainingsComplete: false, artemisAccountSetup: false, payrollComplete: false, payerCredentialed: false, interviewStatus: 'NOT_SCHEDULED' },
];

export default function RbtOnboardingChecklist() {
  const [candidates, setCandidates] = useState<OnboardingCandidate[]>(SAMPLE_ONBOARDING);
  const [activeInterviewCandidate, setActiveInterviewCandidate] = useState<OnboardingCandidate | null>(null);
  const [isMicOn, setIsMicOn] = useState(true);
  const [scoreClinical, setScoreClinical] = useState(5);
  const [scoreComm, setScoreComm] = useState(5);
  const [interviewerNotes, setInterviewerNotes] = useState('');

  useEffect(() => {
    const checkInterviewData = () => {
      const interviewDone = localStorage.getItem('ras_rbt_interview_done') === 'true';
      const interviewPassed = localStorage.getItem('ras_rbt_interview_passed') === 'true';
      const payloadStr = localStorage.getItem('ras_rbt_interview_payload');

      if (!payloadStr && !interviewDone) {
        setCandidates(prev => prev.map(c => {
          if (c.name.toLowerCase().includes('jane')) {
            return { ...c, interviewStatus: 'NOT_SCHEDULED', interviewTime: undefined };
          }
          return c;
        }));
        return;
      }

      if (payloadStr) {
        try {
          const payload = JSON.parse(payloadStr);
          setCandidates(prev => prev.map(c => {
            if (c.name.toLowerCase().includes('jane')) {
              return {
                ...c,
                interviewStatus: interviewPassed ? 'PASSED' : 'SCHEDULED',
                interviewTime: `${payload.date} at ${payload.time}`
              };
            }
            return c;
          }));
        } catch (e) {}
      }
    };

    checkInterviewData();
    window.addEventListener('rbt_interview_changed', checkInterviewData);
    window.addEventListener('storage', checkInterviewData);
    return () => {
      window.removeEventListener('rbt_interview_changed', checkInterviewData);
      window.removeEventListener('storage', checkInterviewData);
    };
  }, []);

  const toggleCheck = (candidateId: string, field: keyof OnboardingCandidate) => {
    setCandidates(prev => prev.map(c => {
      if (c.id !== candidateId) return c;
      const updatedValue = !c[field];
      toast.success(`Updated checklist item for ${c.name}`);
      return { ...c, [field]: updatedValue };
    }));
  };

  const handlePassInterview = (candidate: OnboardingCandidate) => {
    setCandidates(prev => prev.map(c => c.id === candidate.id ? { 
      ...c, 
      interviewStatus: 'PASSED',
      bacbVerified: true,
      backgroundCleared: true,
      trainingsComplete: true,
      artemisAccountSetup: true,
      payrollComplete: true,
      payerCredentialed: true
    } : c));

    // Save clearance and interview passed to localStorage so RBT candidate screen immediately unlocks!
    localStorage.setItem('ras_rbt_cleared', 'true');
    localStorage.setItem('ras_rbt_interview_done', 'true');
    localStorage.setItem('ras_rbt_interview_passed', 'true');
    const payloadStr = localStorage.getItem('ras_rbt_interview_payload');
    if (payloadStr) {
      try {
        const payload = JSON.parse(payloadStr);
        payload.status = 'COMPLETED';
        localStorage.setItem('ras_rbt_interview_payload', JSON.stringify(payload));
      } catch (e) {}
    }
    window.dispatchEvent(new Event('rbt_clearance_changed'));
    window.dispatchEvent(new Event('rbt_interview_changed'));

    setActiveInterviewCandidate(null);
    toast.success(`🎉 ${candidate.name} passed HR Interview! Onboarding Clearance Approved & RBT Portal Fully Unlocked.`);
  };

  const handleRejectInterview = (candidate: OnboardingCandidate) => {
    setCandidates(prev => prev.map(c => c.id === candidate.id ? { ...c, interviewStatus: 'REJECTED' } : c));
    setActiveInterviewCandidate(null);
    toast.error(`HR Interview for ${candidate.name} marked as Rejected.`);
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-brand-black-800 p-6 rounded-xl border border-white/5">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-green-400" />
            RBT Compliance &amp; Onboarding Workbench
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Conduct live HR interviews, evaluate candidate credentials, and issue clearance for client staffing assignment.
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {candidates.map(candidate => {
          const completedCount = [
            candidate.bacbVerified,
            candidate.backgroundCleared,
            candidate.trainingsComplete,
            candidate.artemisAccountSetup,
            candidate.payrollComplete,
            candidate.payerCredentialed
          ].filter(Boolean).length;

          const isFullyEligible = completedCount === 6;

          return (
            <Card key={candidate.id} className={`border transition-all bg-zinc-950 ${
              isFullyEligible ? 'border-green-500/30 shadow-green-500/5' : 'border-white/10'
            }`}>
              <CardHeader className="pb-4 border-b border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-3">
                    <h3 className="text-lg font-bold text-white">{candidate.name}</h3>
                    <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase border ${
                      isFullyEligible 
                        ? 'bg-green-500/10 text-green-400 border-green-500/20' 
                        : 'bg-brand-orange-500/10 text-brand-orange-400 border-brand-orange-500/20'
                    }`}>
                      {isFullyEligible ? 'Eligible for Assignment ✓' : `Onboarding (${completedCount}/6)`}
                    </span>
                    {candidate.interviewStatus === 'SCHEDULED' && (
                      <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase bg-blue-500/20 text-blue-400 border border-blue-500/30 flex items-center gap-1 animate-pulse">
                        <Video className="w-3 h-3" />
                        Interview Scheduled ({candidate.interviewTime})
                      </span>
                    )}
                    {candidate.interviewStatus === 'PASSED' && (
                      <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                        HR Interview Passed
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-zinc-400 mt-0.5">{candidate.email}</p>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    suppressHydrationWarning
                    onClick={() => setActiveInterviewCandidate(candidate)}
                    className="bg-[#F97316] hover:bg-orange-600 text-white font-black text-xs px-4 py-2 rounded-xl transition-all flex items-center gap-2 cursor-pointer shadow-md"
                  >
                    <Video className="w-4 h-4 text-yellow-200" />
                    <span>Conduct HR Interview →</span>
                  </button>

                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-zinc-400">Progress:</span>
                    <div className="w-28 h-2.5 bg-zinc-900 rounded-full overflow-hidden border border-white/5">
                      <div 
                        className={`h-full transition-all duration-500 ${isFullyEligible ? 'bg-green-500' : 'bg-brand-orange-500'}`}
                        style={{ width: `${(completedCount / 6) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="pt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* 1. BACB Verification */}
                <div 
                  onClick={() => toggleCheck(candidate.id, 'bacbVerified')}
                  className={`p-4 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
                    candidate.bacbVerified ? 'bg-green-500/10 border-green-500/30 text-white' : 'bg-zinc-900/50 border-white/5 text-zinc-400 hover:border-white/20'
                  }`}
                >
                  <Award className={`w-5 h-5 shrink-0 mt-0.5 ${candidate.bacbVerified ? 'text-green-400' : 'text-zinc-500'}`} />
                  <div>
                    <h4 className="text-xs font-bold">1. BACB Credential Verification</h4>
                    <p className="text-[11px] text-zinc-400 mt-0.5">Verified active RBT license on BACB registry.</p>
                  </div>
                </div>

                {/* 2. Background Check */}
                <div 
                  onClick={() => toggleCheck(candidate.id, 'backgroundCleared')}
                  className={`p-4 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
                    candidate.backgroundCleared ? 'bg-green-500/10 border-green-500/30 text-white' : 'bg-zinc-900/50 border-white/5 text-zinc-400 hover:border-white/20'
                  }`}
                >
                  <ShieldCheck className={`w-5 h-5 shrink-0 mt-0.5 ${candidate.backgroundCleared ? 'text-green-400' : 'text-zinc-500'}`} />
                  <div>
                    <h4 className="text-xs font-bold">2. Background & OIG Cleared</h4>
                    <p className="text-[11px] text-zinc-400 mt-0.5">FBI fingerprinting & OIG exclusion checks.</p>
                  </div>
                </div>

                {/* 3. Clinical & CPR Trainings */}
                <div 
                  onClick={() => toggleCheck(candidate.id, 'trainingsComplete')}
                  className={`p-4 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
                    candidate.trainingsComplete ? 'bg-green-500/10 border-green-500/30 text-white' : 'bg-zinc-900/50 border-white/5 text-zinc-400 hover:border-white/20'
                  }`}
                >
                  <FileCheck className={`w-5 h-5 shrink-0 mt-0.5 ${candidate.trainingsComplete ? 'text-green-400' : 'text-zinc-500'}`} />
                  <div>
                    <h4 className="text-xs font-bold">3. CPR & HIPAA Training</h4>
                    <p className="text-[11px] text-zinc-400 mt-0.5">Completed required safety & HIPAA compliance modules.</p>
                  </div>
                </div>

                {/* 4. Artemis Account Provisioned */}
                <div 
                  onClick={() => toggleCheck(candidate.id, 'artemisAccountSetup')}
                  className={`p-4 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
                    candidate.artemisAccountSetup ? 'bg-green-500/10 border-green-500/30 text-white' : 'bg-zinc-900/50 border-white/5 text-zinc-400 hover:border-white/20'
                  }`}
                >
                  <UserCheck className={`w-5 h-5 shrink-0 mt-0.5 ${candidate.artemisAccountSetup ? 'text-green-400' : 'text-zinc-500'}`} />
                  <div>
                    <h4 className="text-xs font-bold">4. Internal EMR Provisioned</h4>
                    <p className="text-[11px] text-zinc-400 mt-0.5">User account & session portal credentials active.</p>
                  </div>
                </div>

                {/* 5. Payroll Complete */}
                <div 
                  onClick={() => toggleCheck(candidate.id, 'payrollComplete')}
                  className={`p-4 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
                    candidate.payrollComplete ? 'bg-green-500/10 border-green-500/30 text-white' : 'bg-zinc-900/50 border-white/5 text-zinc-400 hover:border-white/20'
                  }`}
                >
                  <CreditCard className={`w-5 h-5 shrink-0 mt-0.5 ${candidate.payrollComplete ? 'text-green-400' : 'text-zinc-500'}`} />
                  <div>
                    <h4 className="text-xs font-bold">5. W-4 / Direct Deposit</h4>
                    <p className="text-[11px] text-zinc-400 mt-0.5">Payroll tax forms & bank routing setup.</p>
                  </div>
                </div>

                {/* 6. Payer Credentialed */}
                <div 
                  onClick={() => toggleCheck(candidate.id, 'payerCredentialed')}
                  className={`p-4 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
                    candidate.payerCredentialed ? 'bg-green-500/10 border-green-500/30 text-white' : 'bg-zinc-900/50 border-white/5 text-zinc-400 hover:border-white/20'
                  }`}
                >
                  <CheckCircle2 className={`w-5 h-5 shrink-0 mt-0.5 ${candidate.payerCredentialed ? 'text-green-400' : 'text-zinc-500'}`} />
                  <div>
                    <h4 className="text-xs font-bold">6. Payer Credentialing</h4>
                    <p className="text-[11px] text-zinc-400 mt-0.5">Medicaid & Commercial insurer roster approval.</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* LIVE HR CANDIDATE VIDEO INTERVIEW MODAL */}
      {activeInterviewCandidate && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-fade-in select-none">
          <div className="bg-zinc-950 border-2 border-brand-orange-500/50 rounded-3xl max-w-4xl w-full p-6 sm:p-8 space-y-6 text-white shadow-2xl relative max-h-[90vh] overflow-y-auto custom-scrollbar">
            <button
              onClick={() => setActiveInterviewCandidate(null)}
              className="absolute top-6 right-6 text-zinc-400 hover:text-white p-2 rounded-full hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Modal Header */}
            <div className="flex items-center gap-3 border-b border-white/10 pb-4">
              <div className="w-12 h-12 rounded-2xl bg-orange-500/20 border border-orange-500/40 text-[#F97316] flex items-center justify-center font-black text-xl shadow-md">
                <Video className="w-6 h-6 text-[#F97316]" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-bold font-heading text-white">{activeInterviewCandidate.name}</h2>
                  <span className="bg-blue-500/20 text-blue-400 border border-blue-500/30 text-[10px] font-mono font-black px-2.5 py-0.5 rounded-full uppercase">
                    RBT Onboarding Candidate Interview
                  </span>
                </div>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Interview Slot: <strong className="text-orange-400">{activeInterviewCandidate.interviewTime || 'Live Interview'}</strong> · Recruiter: Eleanor Vance (Head HR)
                </p>
              </div>
            </div>

            {/* Main Video Room Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left Column: Simulated WebRTC Candidate Video Stream */}
              <div className="lg:col-span-2 space-y-4">
                <div className="relative aspect-video bg-zinc-900 rounded-2xl overflow-hidden border-2 border-white/10 shadow-inner flex flex-col justify-between p-4">
                  {/* Top Bar inside Video Feed */}
                  <div className="flex justify-between items-center z-10">
                    <span className="bg-red-600/90 text-white font-mono font-black text-[10px] px-2.5 py-1 rounded-full flex items-center gap-1.5 animate-pulse shadow-md">
                      <span className="w-2 h-2 rounded-full bg-white animate-ping" />
                      REC LIVE WEBRTC ROOM
                    </span>
                    <span className="bg-black/60 backdrop-blur-md text-zinc-300 font-mono text-[10px] px-2.5 py-1 rounded-full border border-white/10">
                      720p HD · 24ms Latency
                    </span>
                  </div>

                  {/* Simulated Candidate Video Feed Image & Pulse */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-t from-zinc-950 via-zinc-900 to-zinc-950">
                    <div className="relative">
                      <div className="w-28 h-28 rounded-full bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center text-white text-3xl font-black shadow-2xl border-4 border-white/20">
                        {activeInterviewCandidate.name.split(' ').map(n => n[0]).join('')}
                      </div>
                      <span className="absolute bottom-1 right-1 w-5 h-5 bg-emerald-500 rounded-full border-2 border-zinc-950 shadow-md" title="Mic Active" />
                    </div>
                    <h3 className="mt-4 text-base font-bold text-white tracking-wide">{activeInterviewCandidate.name}</h3>
                    <p className="text-xs text-orange-400 font-semibold mt-0.5">BACB Certified RBT Candidate</p>
                  </div>

                  {/* Bottom Video Controls */}
                  <div className="flex justify-between items-center z-10 pt-2 border-t border-white/10 bg-black/40 backdrop-blur-md px-3 py-2 rounded-xl">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setIsMicOn(!isMicOn)}
                        className={`p-2 rounded-xl border text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors ${
                          isMicOn ? 'bg-zinc-800 border-zinc-700 text-white' : 'bg-red-500/20 border-red-500/40 text-red-400'
                        }`}
                      >
                        {isMicOn ? <Mic className="w-4 h-4 text-emerald-400" /> : <MicOff className="w-4 h-4 text-red-400" />}
                        <span>{isMicOn ? 'Mic Active' : 'Muted'}</span>
                      </button>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono text-zinc-400">Audio Sync: 100% OK</span>
                    </div>
                  </div>
                </div>

                {/* Candidate Live Transcription & Answer Feed */}
                <div className="p-4 bg-zinc-900/80 border border-white/10 rounded-2xl space-y-2">
                  <h4 className="text-xs font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-2">
                    <MessageSquare className="w-3.5 h-3.5 text-orange-400" />
                    Live Audio Transcription Stream:
                  </h4>
                  <div className="p-3 bg-zinc-950 rounded-xl border border-white/5 text-xs text-zinc-300 space-y-1 font-mono">
                    <p><strong className="text-orange-400">RBT ({activeInterviewCandidate.name}):</strong> "I completed my 40-hour RBT course and passed the Scribe DTT simulation with 100% accuracy on trial logging and prompt fading."</p>
                    <p><strong className="text-blue-400">Eleanor Vance (Head HR):</strong> "Great! How do you handle maladaptive behavior during home therapy sessions?"</p>
                  </div>
                </div>
              </div>

              {/* Right Column: HR Evaluation Rubric & 1-Click Clearance Actions */}
              <div className="space-y-4">
                <div className="p-4 bg-zinc-900/90 border border-white/10 rounded-2xl space-y-4">
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider border-b border-white/10 pb-2 flex items-center gap-2">
                    <Star className="w-4 h-4 text-amber-400" />
                    HR Candidate Scoring Rubric:
                  </h4>

                  {/* Rating 1: Clinical DTT Knowledge */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs">
                      <span className="font-semibold text-zinc-300">1. Clinical DTT Knowledge</span>
                      <span className="font-mono font-bold text-orange-400">{scoreClinical}/5 Stars</span>
                    </div>
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map(star => (
                        <button
                          key={star}
                          onClick={() => setScoreClinical(star)}
                          className={`flex-1 py-1 rounded-lg border text-xs font-bold cursor-pointer transition-all ${
                            star <= scoreClinical ? 'bg-amber-500/20 border-amber-500/40 text-amber-400' : 'bg-zinc-950 border-white/5 text-zinc-600'
                          }`}
                        >
                          ★ {star}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Rating 2: Communication & Reliability */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs">
                      <span className="font-semibold text-zinc-300">2. Communication &amp; Availability</span>
                      <span className="font-mono font-bold text-orange-400">{scoreComm}/5 Stars</span>
                    </div>
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map(star => (
                        <button
                          key={star}
                          onClick={() => setScoreComm(star)}
                          className={`flex-1 py-1 rounded-lg border text-xs font-bold cursor-pointer transition-all ${
                            star <= scoreComm ? 'bg-amber-500/20 border-amber-500/40 text-amber-400' : 'bg-zinc-950 border-white/5 text-zinc-600'
                          }`}
                        >
                          ★ {star}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* HR Notes */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-zinc-300">3. HR Interviewer Notes &amp; Feedback:</label>
                    <textarea
                      value={interviewerNotes}
                      onChange={(e) => setInterviewerNotes(e.target.value)}
                      placeholder="Candidate demonstrated excellent understanding of BRP timers and DTT trial logging..."
                      className="w-full bg-zinc-950 border border-white/10 rounded-xl p-3 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-orange-500 h-20 resize-none"
                    />
                  </div>
                </div>

                {/* Decision Action Buttons */}
                <div className="space-y-2 pt-2">
                  <button
                    onClick={() => handlePassInterview(activeInterviewCandidate)}
                    className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs py-3.5 px-4 rounded-xl cursor-pointer shadow-lg transition-all flex items-center justify-center gap-2"
                  >
                    <CheckCircle2 className="w-4 h-4 text-emerald-200" />
                    <span>✅ Pass Candidate &amp; Approve Onboarding Clearance</span>
                  </button>

                  <button
                    onClick={() => handleRejectInterview(activeInterviewCandidate)}
                    className="w-full bg-rose-950/80 hover:bg-rose-900 border border-rose-800 text-rose-300 font-bold text-xs py-2.5 px-4 rounded-xl cursor-pointer transition-all flex items-center justify-center gap-2"
                  >
                    <XCircle className="w-4 h-4 text-rose-400" />
                    <span>Decline / Reject Candidate</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
