'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Users, Search, ChevronRight, Phone, Mail, Filter, Key, Copy, Check, ShieldCheck, Video, UserCheck, Clock, ChevronDown, StickyNote, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';

import { getAtsCandidates } from '@/app/actions/atsActions';
import { useHrmRole } from '@/lib/useHrmRole';

export interface Candidate {
  id: string;
  name: string;
  email: string;
  phone: string;
  roleApplied: 'RBT' | 'BCBA' | 'ADMIN';
  stage: 'APPLIED' | 'PHONE_SCREEN' | 'INTERVIEW' | 'OFFER' | 'HIRED' | 'HELP_DESK' | 'REJECTED';
  experienceYears: number;
  appliedDate: string;
  activationStatus: 'PENDING_HR_REVIEW' | 'INVITATION_SENT' | 'ACCOUNT_ACTIVE' | 'REJECTED';
  reqTasks?: boolean;
  certDone?: boolean;
  reqSim?: boolean;
  reqAvail?: boolean;
  reqInterview?: boolean;   // true only after HR submits evaluation
  interviewBooked?: boolean; // true when slot is booked but HR eval not yet submitted
  reqBackground?: boolean;
  reqCount?: number;
}

export default function AtsPipelineView() {
  const { role } = useHrmRole();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');

  // Magic Link Activation Modal State
  const [activeInviteCandidate, setActiveInviteCandidate] = useState<Candidate | null>(null);
  const [selectedProfileCandidate, setSelectedProfileCandidate] = useState<Candidate | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  const [isUpcomingOpen, setIsUpcomingOpen] = useState(true);
  const [isWaitingOpen, setIsWaitingOpen] = useState(true);
  const [isPastOpen, setIsPastOpen] = useState(false);
  const [isClaimedByMe, setIsClaimedByMe] = useState(true);

  // Help Desk Ticket Accordions State
  const [isMyTicketsOpen, setIsMyTicketsOpen] = useState(true);
  const [isUnclaimedTicketsOpen, setIsUnclaimedTicketsOpen] = useState(true);
  const [claimedTicketIds, setClaimedTicketIds] = useState<string[]>([]);
  const [hasHelpDeskAlerts, setHasHelpDeskAlerts] = useState(false);

  React.useEffect(() => {
    async function loadCandidates() {
      setIsLoading(true);
      const res = await getAtsCandidates();
      if (res.success && res.data) {
        let customStages: Record<string, { stage: Candidate['stage']; activationStatus: Candidate['activationStatus'] }> = {};
        try {
          customStages = JSON.parse(localStorage.getItem('ras_ats_custom_stages') || '{}');
          const claimed = JSON.parse(localStorage.getItem('ras_claimed_help_tickets') || '[]');
          if (Array.isArray(claimed)) setClaimedTicketIds(claimed);
        } catch (e) {}

        const interviewDone = localStorage.getItem('ras_rbt_interview_done') === 'true';
        const payloadStr = localStorage.getItem('ras_rbt_interview_payload');
        const hasInterviewPayload = payloadStr ? true : false;
        const isInterviewBooked = interviewDone || hasInterviewPayload;
        const simDone = localStorage.getItem('ras_rbt_simulation_completed') === 'true' || localStorage.getItem('ras_rbt_simulation_completed') === 'true';
        const availDone = localStorage.getItem('ras_rbt_availability_set') === 'true';
        const tasksDone = localStorage.getItem('ras_rbt_tasks_done') === 'true';
        const workingOnRequirements = simDone || availDone || tasksDone;

        let deletedIds: string[] = [];
        try {
          deletedIds = JSON.parse(localStorage.getItem('ras_deleted_applicants') || '[]');
        } catch (e) {}

        // 1. Gather all candidate sources: DB candidates + Local Storage submitted applications
        const localSubmittedApps: Candidate[] = [];
        try {
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('ras_submitted_app_')) {
              const itemStr = localStorage.getItem(key);
              if (itemStr) {
                const parsed = JSON.parse(itemStr);
                if (parsed.applicantId && parsed.fullName) {
                  localSubmittedApps.push({
                    id: parsed.applicantId,
                    name: parsed.fullName,
                    email: parsed.email || `${parsed.applicantId}@example.com`,
                    phone: parsed.phoneNumber || '(555) 000-0000',
                    roleApplied: 'RBT',
                    stage: 'APPLIED',
                    experienceYears: 2,
                    appliedDate: parsed.submittedAt ? parsed.submittedAt.split('T')[0] : new Date().toISOString().split('T')[0],
                    activationStatus: 'PENDING_HR_REVIEW',
                  });
                }
              }
            }
          }
        } catch (e) {}

        // Add fallback candidate 'c1' if not present in DB or local apps
        const candidateFallback: Candidate = {
          id: 'c1',
          name: 'Jane Doe',
          email: 'jane.doe@gmail.com',
          phone: '(555) 019-2831',
          roleApplied: 'RBT',
          stage: 'APPLIED',
          experienceYears: 2,
          appliedDate: '2026-08-04',
          activationStatus: 'PENDING_HR_REVIEW',
        };

        const rawList = [...res.data, ...localSubmittedApps, candidateFallback];

        // 2. Map candidate stages cleanly per candidate ID (strictly isolated, no name-matching hijacking)
        const merged = rawList
          .filter(c => !deletedIds.includes(c.id))
          .map(c => {
            let name = c.name;
            let email = c.email;
            let phone = c.phone;

            try {
              const storedApp = localStorage.getItem(`ras_submitted_app_${c.id}`);
              if (storedApp) {
                const parsed = JSON.parse(storedApp);
                if (parsed.fullName) name = parsed.fullName;
                if (parsed.email) email = parsed.email;
                if (parsed.phoneNumber || parsed.phone) phone = parsed.phoneNumber || parsed.phone;
              }
            } catch (e) {}

            const candEmail = (email || '').toLowerCase().trim();

            // Match candidate 1 demo applicant strictly by ID or exact demo email (never fuzzy name matching)
            const isDemoApplicant1 = c.id === 'c1' || c.id === 'cand-1' || c.id === 'usr-applicant-1' || candEmail === 'jane.doe@gmail.com';

            // Resolve stage override FIRST — needed for interview matching fallback below
            const stageOverride = customStages[c.id] || customStages[candEmail];

            let isInterviewBookedForThisCand = localStorage.getItem(`ras_rbt_interview_booked_${c.id}`) === 'true' || 
                                               localStorage.getItem(`ras_rbt_interview_booked_${candEmail}`) === 'true' ||
                                               stageOverride?.stage === 'INTERVIEW';

            if (!isInterviewBookedForThisCand && isInterviewBooked && payloadStr) {
              try {
                const payload = JSON.parse(payloadStr);
                const pEmail = (payload.candidateEmail || '').toLowerCase().trim();
                const pId = (payload.candidateId || '').trim();

                if (pEmail && candEmail && pEmail === candEmail) {
                  // Exact email match in payload
                  isInterviewBookedForThisCand = true;
                } else if (pId && (pId === c.id || (pId === 'cand-1' && isDemoApplicant1))) {
                  // Exact candidate ID match in payload
                  isInterviewBookedForThisCand = true;
                } else if (isDemoApplicant1 && (!pEmail || pEmail === 'jane.doe@gmail.com') && (!pId || pId === 'cand-1')) {
                  // Demo candidate c1 fallback (old payloads without email/id)
                  isInterviewBookedForThisCand = true;
                }
              } catch (e) {}
            } else if (!isInterviewBooked) {
              isInterviewBookedForThisCand = false;
            }

            const reqTasks = localStorage.getItem(`ras_rbt_tasks_done_${c.id}`) === 'true' ||
                             localStorage.getItem(`ras_rbt_tasks_done_${candEmail}`) === 'true' ||
                             (isDemoApplicant1 && localStorage.getItem('ras_rbt_tasks_done') === 'true');

            const certDone = localStorage.getItem(`ras_rbt_cert_uploaded_${c.id}`) === 'true' || 
                             localStorage.getItem(`ras_rbt_cert_uploaded_${candEmail}`) === 'true' || 
                             (isDemoApplicant1 && localStorage.getItem('ras_rbt_cert_uploaded') === 'true');

            const reqSim = localStorage.getItem(`ras_rbt_sim_completed_${c.id}`) === 'true' ||
                           localStorage.getItem(`ras_rbt_sim_completed_${candEmail}`) === 'true' ||
                           (isDemoApplicant1 && (localStorage.getItem('ras_rbt_sim_completed') === 'true' || localStorage.getItem('ras_rbt_simulation_completed') === 'true'));

            const reqAvail = localStorage.getItem(`ras_rbt_availability_set_${c.id}`) === 'true' ||
                             localStorage.getItem(`ras_rbt_availability_set_${candEmail}`) === 'true' ||
                             (isDemoApplicant1 && localStorage.getItem('ras_rbt_availability_set') === 'true');

            const isInterviewPassed = localStorage.getItem(`ras_rbt_interview_passed_${c.id}`) === 'true' ||
                                      localStorage.getItem(`ras_rbt_interview_passed_${candEmail}`) === 'true' ||
                                      (isDemoApplicant1 && localStorage.getItem('ras_rbt_interview_passed') === 'true');

            const reqBackground = localStorage.getItem(`ras_rbt_background_cleared_${c.id}`) === 'true' ||
                                   localStorage.getItem(`ras_rbt_background_cleared_${candEmail}`) === 'true';

            const reqInterview = isInterviewPassed;  // Only green AFTER HR submits evaluation — booking alone is NOT sufficient!
            const interviewBooked = isInterviewBookedForThisCand;  // Slot scheduled but HR eval not yet submitted

            // 5 My Tasks Candidate Requirements Progress Count
            const reqCount = [reqTasks, reqSim, reqAvail, reqInterview, certDone].filter(Boolean).length;
            const hasHelpTicket = localStorage.getItem(`ras_help_ticket_${c.id}`) || localStorage.getItem(`ras_help_ticket_${candEmail}`) || (isDemoApplicant1 && localStorage.getItem('ras_latest_help_ticket'));

            // Clean Stage Resolution Hierarchy:
            // 1. Explicit Final Custom Stage Override (OFFER, HIRED, REJECTED, HELP_DESK)
            // 2. HELP_DESK if help ticket is open
            // 3. INTERVIEW (Column 3) if THIS candidate booked an interview & pending HR evaluation!
            // 4. PHONE_SCREEN (Column 2: In Progress) if onboarding tasks started
            // 5. APPLIED (Column 1: Applied - HR Review) default for all new candidates!
            let targetStage: Candidate['stage'] = 'APPLIED';

            if (stageOverride?.stage === 'OFFER' || stageOverride?.stage === 'HIRED' || stageOverride?.stage === 'REJECTED' || stageOverride?.stage === 'HELP_DESK') {
              targetStage = stageOverride.stage;
            } else if (hasHelpTicket) {
              targetStage = 'HELP_DESK';
            } else if (interviewBooked && !isInterviewPassed) {
              // Interview SLOT BOOKED & pending HR evaluation → LOCK IN COLUMN 3: INTERVIEW!
              targetStage = 'INTERVIEW';
            } else if (stageOverride?.stage === 'INTERVIEW') {
              targetStage = 'INTERVIEW';
            } else if (reqTasks || reqSim || reqAvail || certDone || isInterviewPassed || stageOverride?.stage === 'PHONE_SCREEN') {
              targetStage = 'PHONE_SCREEN';
            } else {
              targetStage = 'APPLIED';
            }

            const resolvedActivationStatus: Candidate['activationStatus'] =
              stageOverride?.activationStatus || (targetStage === 'APPLIED' ? 'PENDING_HR_REVIEW' : 'INVITATION_SENT');

            return {
              ...c,
              name,
              email,
              phone,
              stage: targetStage,
              activationStatus: resolvedActivationStatus,
              reqTasks,
              certDone,
              reqSim,
              reqAvail,
              reqInterview,
              interviewBooked,
              reqBackground,
              reqCount,
            };
          });

        // 3. Deduplicate strictly by Candidate ID and Email so every candidate appears exactly ONCE
        const seenIds = new Set<string>();
        const seenEmails = new Set<string>();
        const uniqueCandidates = merged.filter(c => {
          const idKey = c.id;
          const emailKey = (c.email || '').toLowerCase().trim();

          if (seenIds.has(idKey) || (emailKey && seenEmails.has(emailKey))) {
            return false;
          }
          seenIds.add(idKey);
          if (emailKey) seenEmails.add(emailKey);
          return true;
        });

        setCandidates(uniqueCandidates);
        setHasHelpDeskAlerts(!!localStorage.getItem('ras_latest_help_ticket'));
      }
      setIsLoading(false);
    }
    loadCandidates();

    window.addEventListener('storage', loadCandidates);
    window.addEventListener('focus', loadCandidates);
    window.addEventListener('rbt_interview_changed', loadCandidates);
    window.addEventListener('rbt_clearance_changed', loadCandidates);
    window.addEventListener('rbt_availability_changed', loadCandidates);
    window.addEventListener('rbt_sim_changed', loadCandidates);
    return () => {
      window.removeEventListener('storage', loadCandidates);
      window.removeEventListener('focus', loadCandidates);
      window.removeEventListener('rbt_interview_changed', loadCandidates);
      window.removeEventListener('rbt_clearance_changed', loadCandidates);
      window.removeEventListener('rbt_availability_changed', loadCandidates);
      window.removeEventListener('rbt_sim_changed', loadCandidates);
    };
  }, []);

  const handleAdvanceStage = (id: string) => {
    const stageOrder: Candidate['stage'][] = ['APPLIED', 'PHONE_SCREEN', 'INTERVIEW', 'OFFER', 'HIRED'];
    
    setCandidates(prev => {
      const updated = prev.map(c => {
        if (c.id !== id) return c;
        const currentIndex = stageOrder.indexOf(c.stage);
        if (currentIndex < stageOrder.length - 1) {
          const nextStage = stageOrder[currentIndex + 1];
          toast.success(`${c.name} moved to ${nextStage.replace('_', ' ')} stage!`);
          return { ...c, stage: nextStage };
        }
        return c;
      });

      try {
        const customStages = JSON.parse(localStorage.getItem('ras_ats_custom_stages') || '{}');
        const candidate = updated.find(c => c.id === id);
        if (candidate) {
          customStages[id] = { stage: candidate.stage, activationStatus: candidate.activationStatus };
          localStorage.setItem('ras_ats_custom_stages', JSON.stringify(customStages));
        }
      } catch (e) {}

      return updated;
    });
  };

  const handleApproveAndInvite = (candidate: Candidate) => {
    setCandidates((prev) => {
      const updated = prev.map((c) =>
        c.id === candidate.id
          ? { ...c, stage: 'PHONE_SCREEN' as const, activationStatus: 'INVITATION_SENT' as const }
          : c
      );

      try {
        const customStages = JSON.parse(localStorage.getItem('ras_ats_custom_stages') || '{}');
        customStages[candidate.id] = { stage: 'PHONE_SCREEN', activationStatus: 'INVITATION_SENT' };
        localStorage.setItem('ras_ats_custom_stages', JSON.stringify(customStages));
      } catch (e) {}

      return updated;
    });
    setActiveInviteCandidate(candidate);
    toast.success(`Approved ${candidate.name}! Moved candidate to "2. In Progress" column & generated portal magic link.`);
  };

  const handleResetAllPipelineStages = () => {
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && (
          k.startsWith('ras_rbt_') || 
          k.startsWith('ras_ats_') || 
          k.startsWith('ras_help_') || 
          k.startsWith('ras_submitted_app_') ||
          k.startsWith('ras_applicant_') ||
          k.startsWith('ras_active_')
        )) {
          localStorage.removeItem(k);
        }
      }
    } catch (e) {}

    localStorage.removeItem('ras_ats_custom_stages');
    localStorage.removeItem('ras_rbt_cleared');
    localStorage.removeItem('ras_rbt_sim_completed');
    localStorage.removeItem('ras_rbt_simulation_completed');
    localStorage.removeItem('ras_rbt_availability_set');
    localStorage.removeItem('ras_rbt_tasks_done');
    localStorage.removeItem('ras_rbt_completed_steps');
    localStorage.removeItem('ras_rbt_interview_done');
    localStorage.removeItem('ras_rbt_interview_passed');
    localStorage.removeItem('ras_rbt_interview_payload');
    localStorage.removeItem('ras_latest_submitted_app');

    window.dispatchEvent(new Event('rbt_clearance_changed'));
    window.dispatchEvent(new Event('rbt_sim_changed'));
    window.dispatchEvent(new Event('rbt_tasks_changed'));
    window.dispatchEvent(new Event('rbt_interview_changed'));
    window.dispatchEvent(new Event('rbt_availability_changed'));
    window.dispatchEvent(new Event('storage'));
    toast.success('🔄 Reset all candidates to 1. Applied (HR Review) stage with 0/5 progress!');
  };

  const copyInviteLink = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    toast.success('Magic link copied to clipboard!');
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const activePipelineCandidates = candidates.filter(c => c.stage !== 'HIRED');

  const filteredCandidates = activePipelineCandidates.filter(c => {
    const matchesSearch = `${c.name} ${c.email} ${c.roleApplied}`.toLowerCase().includes(searchQuery.toLowerCase());
    if (roleFilter === 'ALL') return matchesSearch;
    return matchesSearch && c.roleApplied === roleFilter;
  });

  const hrAgentStages: { key: Candidate['stage']; title: string; color: string }[] = [
    { key: 'APPLIED', title: '1. Applied (HR Review)', color: 'border-blue-500/30 bg-blue-500/10 text-blue-400' },
    { key: 'PHONE_SCREEN', title: '2. In Progress', color: 'border-amber-500/30 bg-amber-500/10 text-amber-400' },
    { key: 'INTERVIEW', title: '3. Interview', color: 'border-purple-500/30 bg-purple-500/10 text-purple-400' },
    { key: 'HELP_DESK', title: '4. Candidate Help Desk Alerts (⚠️)', color: 'border-rose-500/40 bg-rose-500/10 text-rose-400' },
  ];

  const headHrStages: { key: Candidate['stage']; title: string; color: string }[] = [
    { key: 'APPLIED', title: '1. Applied (HR Review)', color: 'border-blue-500/30 bg-blue-500/10 text-blue-400' },
    { key: 'PHONE_SCREEN', title: '2. In Progress', color: 'border-amber-500/30 bg-amber-500/10 text-amber-400' },
    { key: 'INTERVIEW', title: '3. Interview Scheduled', color: 'border-purple-500/30 bg-purple-500/10 text-purple-400' },
    { key: 'OFFER', title: '4. Offer Extended', color: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' },
  ];

  const stages = (role === 'HR_AGENT' || hasHelpDeskAlerts) ? hrAgentStages : headHrStages;

  return (
    <div className="space-y-8">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-brand-black-800 p-6 rounded-xl border border-white/5 shadow-xl">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Users className="w-6 h-6 text-brand-orange-500" />
            ATS Applicant Tracking &amp; HR Recruiter Analytics
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Real-time candidate funnel, time-to-hire metrics, and 6-point compliance onboarding logs.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleResetAllPipelineStages}
            title="Reset all applicant custom stage overrides back to Applied stage"
            className="px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-white/10 hover:border-white/20 text-xs font-bold text-zinc-300 hover:text-white transition-all cursor-pointer flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5 text-orange-400" />
            <span>Reset All Stages</span>
          </button>

          <div className="relative">
            <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search candidate..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              suppressHydrationWarning
              className="bg-zinc-900 border border-white/10 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white outline-none focus:border-brand-orange-500 w-48"
            />
          </div>

          <div className="bg-zinc-900 border border-white/10 rounded-lg px-2.5 py-1.5 flex items-center text-xs text-zinc-400">
            <Filter className="w-3.5 h-3.5 mr-1 text-zinc-500" />
            <select
              value={roleFilter}
              onChange={e => setRoleFilter(e.target.value)}
              suppressHydrationWarning
              className="bg-transparent text-white outline-none cursor-pointer font-medium text-xs"
            >
              <option value="ALL">All Roles</option>
              <option value="RBT">RBT Candidates</option>
              <option value="BCBA">BCBA Candidates</option>
              <option value="ADMIN">Admin Staff</option>
            </select>
          </div>
        </div>
      </div>

      {/* ACTIVATION MAGIC LINK INVITATION MODAL */}
      {activeInviteCandidate && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-950 border-2 border-brand-orange-500/50 rounded-2xl p-6 max-w-lg w-full space-y-5 shadow-2xl animate-fade-in">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
                <h3 className="text-base font-bold text-white">HR Activation Magic Link Generated</h3>
              </div>
              <button
                onClick={() => setActiveInviteCandidate(null)}
                className="text-xs text-zinc-400 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs text-zinc-300">
              <p>
                Candidate <strong className="text-white">{activeInviteCandidate.name}</strong> ({activeInviteCandidate.email}) has been approved by HR.
              </p>
              <div className="bg-zinc-900 border border-white/10 rounded-xl p-3.5 space-y-2">
                <span className="text-[10px] font-mono font-bold text-brand-orange-400 uppercase tracking-wider block">Activation Magic Link URL:</span>
                <div className="flex items-center justify-between gap-2 bg-black/50 p-2.5 rounded-lg border border-white/10 text-xs font-mono text-emerald-400 break-all">
                  <span>{`http://localhost:3001/magic-link/${activeInviteCandidate.id}`}</span>
                  <button
                    onClick={() => copyInviteLink(`http://localhost:3001/magic-link/${activeInviteCandidate.id}`)}
                    className="p-1.5 rounded-md bg-zinc-800 hover:bg-brand-orange-500 text-white shrink-0 transition-colors cursor-pointer"
                  >
                    {copiedLink ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <p className="text-[11px] text-zinc-400 italic">
                An automated email containing this single-use activation link has been dispatched to {activeInviteCandidate.email}.
              </p>
            </div>

            <div className="flex justify-end pt-2">
              <Button
                onClick={() => setActiveInviteCandidate(null)}
                className="bg-brand-orange-500 hover:bg-brand-orange-600 text-white font-bold text-xs px-6 h-9 cursor-pointer"
              >
                Close Window
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* CANDIDATE PROFILE & PROGRESS MODAL */}
      {selectedProfileCandidate && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-950 border-2 border-brand-orange-500/50 rounded-3xl p-6 sm:p-8 max-w-xl w-full space-y-6 shadow-2xl animate-fade-in text-white">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-orange-500/10 border border-orange-500/30 text-[#F97316] flex items-center justify-center font-black text-lg">
                  {selectedProfileCandidate.name.substring(0, 2)}
                </div>
                <div>
                  <h3 className="text-xl font-black text-white font-heading">{selectedProfileCandidate.name}</h3>
                  <p className="text-xs text-zinc-400 font-mono">{selectedProfileCandidate.email} • {selectedProfileCandidate.phone}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedProfileCandidate(null)}
                className="text-xs text-zinc-400 hover:text-white cursor-pointer font-bold bg-zinc-900 border border-white/10 px-3 py-1.5 rounded-xl"
              >
                ✕ Close
              </button>
            </div>

            {/* Candidate Onboarding & Recruitment Progress Stepper */}
            <div className="space-y-3">
              <span className="text-xs font-mono font-bold text-brand-orange-400 uppercase tracking-wider block">Candidate Progress Funnel:</span>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { key: 'APPLIED', label: '1. Applied' },
                  { key: 'PHONE_SCREEN', label: '2. Phone' },
                  { key: 'INTERVIEW', label: '3. Interview' },
                  { key: 'OFFER', label: '4. Offer' },
                ].map((s, idx) => {
                  const stageOrder = ['APPLIED', 'PHONE_SCREEN', 'INTERVIEW', 'OFFER', 'HIRED'];
                  const isPassed = stageOrder.indexOf(selectedProfileCandidate.stage) >= idx;
                  const isCurrent = selectedProfileCandidate.stage === s.key;

                  return (
                    <div
                      key={s.key}
                      className={`p-2.5 rounded-xl border text-center text-xs font-bold transition-all ${
                        isCurrent
                          ? 'bg-brand-orange-500/20 border-brand-orange-500 text-brand-orange-400 shadow-md'
                          : isPassed
                          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                          : 'bg-zinc-900 border-white/5 text-zinc-600'
                      }`}
                    >
                      <span className="block text-[10px] uppercase font-mono">{s.label}</span>
                      <span className="text-[11px] block mt-0.5">{isPassed ? '✓ Done' : 'Pending'}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Candidate Details & Resume Meta */}
            <div className="bg-zinc-900/80 border border-white/10 rounded-2xl p-4 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-zinc-400">Role Applied For:</span>
                <span className="font-bold text-white">{selectedProfileCandidate.roleApplied}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">ABA Experience:</span>
                <span className="font-bold text-white">{selectedProfileCandidate.experienceYears} Years</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Application Date:</span>
                <span className="font-mono text-zinc-300">{selectedProfileCandidate.appliedDate}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Portal Activation Status:</span>
                <span className="font-bold text-emerald-400">
                  {selectedProfileCandidate.activationStatus === 'ACCOUNT_ACTIVE' ? '✓ Active' : selectedProfileCandidate.activationStatus === 'INVITATION_SENT' ? '✉ Magic Link Sent' : '⏳ Pending HR Approval'}
                </span>
              </div>
            </div>

            {/* Actions in Profile Modal */}
            <div className="space-y-2.5 pt-2 border-t border-white/10">
              <button
                onClick={() => {
                  handleApproveAndInvite(selectedProfileCandidate);
                  setSelectedProfileCandidate(null);
                }}
                className="w-full bg-[#F97316] hover:bg-orange-600 text-white font-extrabold text-xs py-3.5 px-4 rounded-2xl cursor-pointer shadow-lg transition-all flex items-center justify-center gap-2"
              >
                <Key className="w-4 h-4" />
                <span>Approve Applicant &amp; Send Magic Link →</span>
              </button>

              <button
                onClick={() => {
                  handleAdvanceStage(selectedProfileCandidate.id);
                  setSelectedProfileCandidate(prev => prev ? { ...prev, stage: prev.stage } : null);
                }}
                className="w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-bold text-xs py-2.5 px-4 rounded-xl cursor-pointer transition-all flex items-center justify-center gap-2"
              >
                <span>Advance Candidate Stage →</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PROMINENT UNCLAIMED INTERVIEWS QUEUE BANNER (VISIBLE TO ALL HR AGENTS) */}
      {!isClaimedByMe && (
        <div className="bg-amber-500/10 border-2 border-amber-500/50 rounded-2xl p-5 shadow-2xl space-y-3 animate-pulse-slow">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-3.5 h-3.5 rounded-full bg-amber-400 animate-ping" />
              <div>
                <h3 className="text-sm font-black uppercase text-amber-300 font-mono tracking-wider flex items-center gap-2">
                  <span>⚠️ 1 Unclaimed Candidate Interview Available</span>
                  <span className="bg-amber-500/20 text-amber-300 border border-amber-500/40 px-2.5 py-0.5 rounded-full text-[10px]">Open to All HR Staff</span>
                </h3>
                <p className="text-xs text-zinc-300 mt-0.5">
                  An applicant has scheduled an RBT onboarding screen. Click below to claim ownership.
                </p>
              </div>
            </div>
            <Button
              onClick={() => {
                setIsClaimedByMe(true);
                toast.success('Interview successfully claimed by Marcus Vance!');
              }}
              className="bg-amber-500 hover:bg-amber-400 text-black font-black text-xs px-6 h-11 rounded-xl flex items-center gap-2 shadow-xl shadow-amber-500/25 cursor-pointer transition-all hover:scale-105"
            >
              <UserCheck className="w-4 h-4 text-black" />
              <span>Claim Interview Now</span>
            </Button>
          </div>

          <div className="bg-zinc-950/80 border border-amber-500/30 p-3.5 rounded-xl flex items-center justify-between text-xs text-zinc-300">
            <div className="flex items-center gap-4">
              <span className="font-extrabold text-white">Jane Doe (RBT Applicant)</span>
              <span className="text-amber-400 font-mono font-bold">• Fri, Aug 7 at 3:00 PM</span>
              <span className="text-zinc-400 font-mono">5550192831 • jane.doe@gmail.com</span>
            </div>
            <span className="text-[10px] uppercase font-mono font-bold text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-md border border-amber-500/20">
              Needs HR Assignee
            </span>
          </div>
        </div>
      )}

      {/* 4-Column Kanban Board */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 overflow-x-auto pb-4">
        {stages.map(stage => {
          const stageCandidates = filteredCandidates.filter(c => c.stage === stage.key);
          const isInterviewStage = stage.key === 'INTERVIEW';

          return (
            <div key={stage.key} className="bg-zinc-950 p-4 rounded-xl border border-white/5 flex flex-col justify-between min-w-[260px]">
              <div>
                <div className={`p-2.5 rounded-lg border text-xs font-bold flex items-center justify-between mb-4 ${stage.color}`}>
                  <span suppressHydrationWarning>{stage.title}</span>
                  <span suppressHydrationWarning className="bg-white/10 px-2 py-0.5 rounded-full">{stageCandidates.length}</span>
                </div>

                <div className="space-y-3">
                  {/* SPECIAL 3-ACCORDION RENDER FOR STAGE 3: INTERVIEW */}
                  {isInterviewStage ? (
                    <div className="space-y-3">
                      {/* ACCORDION 1: UNCLAIMED OPEN QUEUE */}
                      {!isClaimedByMe && (
                        <div className="border border-amber-500/40 bg-amber-500/5 rounded-xl overflow-hidden transition-all">
                          <button
                            type="button"
                            onClick={() => setIsWaitingOpen(!isWaitingOpen)}
                            className="w-full p-2.5 bg-amber-500/10 flex items-center justify-between text-[11px] font-black text-amber-300 uppercase font-mono tracking-wider cursor-pointer border-b border-amber-500/20"
                          >
                            <span className="flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                              <span>1. Waiting for Claim (1)</span>
                            </span>
                            {isWaitingOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                          </button>
                          {isWaitingOpen && (
                            <div className="p-3 space-y-2">
                              {stageCandidates.map(c => (
                                <div key={c.id} className="p-3 bg-zinc-900 border border-amber-500/30 rounded-xl space-y-2">
                                  <div className="flex justify-between items-start">
                                    <h4 className="font-extrabold text-white text-xs">{c.name}</h4>
                                    <span className="text-[10px] font-bold text-amber-400 font-mono">Unclaimed</span>
                                  </div>
                                  <button
                                    onClick={() => {
                                      setIsClaimedByMe(true);
                                      toast.success(`Claimed interview slot for ${c.name}!`);
                                    }}
                                    className="w-full bg-amber-500 hover:bg-amber-600 text-black text-xs py-1.5 rounded-lg font-black transition-all cursor-pointer flex items-center justify-center gap-1"
                                  >
                                    <UserCheck className="w-3.5 h-3.5" /> Claim Slot
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* ACCORDION 2: UPCOMING CLAIMED INTERVIEWS */}
                      <div className="border border-white/10 bg-zinc-900/60 rounded-xl overflow-hidden transition-all">
                        <button
                          type="button"
                          onClick={() => setIsUpcomingOpen(!isUpcomingOpen)}
                          className="w-full p-2.5 bg-zinc-900 flex items-center justify-between text-[11px] font-black text-white uppercase font-mono tracking-wider cursor-pointer border-b border-white/10"
                        >
                          <span className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                            <span>2. Claimed Interviews ({isClaimedByMe ? stageCandidates.length : 0})</span>
                          </span>
                          {isUpcomingOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                        </button>
                        {isUpcomingOpen && (
                          <div className="p-3 space-y-3">
                            {isClaimedByMe && stageCandidates.map(c => (
                              <div key={c.id} className="bg-zinc-900 p-3.5 rounded-xl border border-white/10 space-y-2.5 shadow-md">
                                <div className="flex justify-between items-start">
                                  <h4 className="font-extrabold text-white text-xs">{c.name}</h4>
                                  <button
                                    onClick={() => {
                                      setIsClaimedByMe(false);
                                      toast.info(`Released ${c.name} slot back to unclaimed queue.`);
                                    }}
                                    className="text-[10px] text-rose-400 hover:underline cursor-pointer font-mono font-bold"
                                  >
                                    Unclaim
                                  </button>
                                </div>
                                <p className="text-[11px] text-amber-400 font-mono flex items-center gap-1">
                                  <Clock className="w-3 h-3 text-amber-400" /> Slot: Fri, Aug 7 at 3:00 PM
                                </p>
                                <div className="grid grid-cols-2 gap-2 pt-1">
                                  <a
                                    href="https://meet.jit.si/RiseAndShine_HR_Interview_cand_1"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold py-1.5 rounded-lg text-center flex items-center justify-center gap-1 shadow cursor-pointer"
                                  >
                                    <Video className="w-3 h-3 text-white" /> Join
                                  </a>
                                  <Link
                                    href={`/ats/applicant/${c.id}?tab=INTERVIEW`}
                                    className="bg-brand-orange-500 hover:bg-orange-600 text-white text-[11px] font-bold py-1.5 rounded-lg text-center flex items-center justify-center gap-1 shadow cursor-pointer"
                                  >
                                    <StickyNote className="w-3 h-3" /> Script
                                  </Link>
                                </div>
                              </div>
                            ))}
                            {(!isClaimedByMe || stageCandidates.length === 0) && (
                              <div className="p-3 text-center text-[11px] text-zinc-500 font-mono">No active claimed interviews</div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* ACCORDION 3: PAST COMPLETED ARCHIVE */}
                      <div className="border border-white/10 bg-zinc-900/40 rounded-xl overflow-hidden transition-all">
                        <button
                          type="button"
                          onClick={() => setIsPastOpen(!isPastOpen)}
                          className="w-full p-2.5 bg-zinc-900 flex items-center justify-between text-[11px] font-black text-zinc-400 uppercase font-mono tracking-wider cursor-pointer border-b border-white/5"
                        >
                          <span className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-zinc-500" />
                            <span>3. Past Archive (1)</span>
                          </span>
                          {isPastOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                        </button>
                        {isPastOpen && (
                          <div className="p-3">
                            <div className="p-2.5 bg-zinc-900 border border-white/5 rounded-lg text-[11px] text-zinc-400 space-y-1">
                              <span className="font-extrabold text-white block">Metasebia Tsegaye</span>
                              <span className="text-[10px] text-emerald-400 font-mono block">✓ Approved • Score: 4.8★</span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : stage.key === 'HELP_DESK' ? (
                    /* SPECIAL 2-ACCORDION RENDER FOR STAGE 4: CANDIDATE HELP DESK ALERTS */
                    <div className="space-y-3">
                      {/* ACCORDION 1: MY CLAIMED HELP TICKETS */}
                      <div className="border border-rose-500/40 bg-rose-500/5 rounded-xl overflow-hidden transition-all">
                        <button
                          type="button"
                          onClick={() => setIsMyTicketsOpen(!isMyTicketsOpen)}
                          className="w-full p-2.5 bg-rose-500/10 flex items-center justify-between text-[11px] font-black text-rose-300 uppercase font-mono tracking-wider cursor-pointer border-b border-rose-500/20"
                        >
                          <span className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                            <span>1. My Claimed Tickets ({stageCandidates.filter(c => claimedTicketIds.includes(c.id)).length})</span>
                          </span>
                          {isMyTicketsOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                        </button>
                        {isMyTicketsOpen && (
                          <div className="p-3 space-y-3">
                            {stageCandidates.filter(c => claimedTicketIds.includes(c.id)).map(c => {
                              let ticketMessage = "Applicant requested assistance on onboarding portal.";
                              let ticketCategory = "GENERAL_QUESTION";
                              try {
                                const ticket = JSON.parse(localStorage.getItem('ras_latest_help_ticket') || '{}');
                                if (ticket.message) ticketMessage = ticket.message;
                                if (ticket.category) ticketCategory = ticket.category;
                              } catch (e) {}

                              return (
                                <div key={c.id} className="bg-zinc-900 p-3.5 rounded-xl border border-emerald-500/40 space-y-2.5 shadow-md">
                                  <div className="flex justify-between items-start">
                                    <h4 className="font-extrabold text-white text-xs flex items-center gap-1">
                                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                                      {c.name}
                                    </h4>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const updated = claimedTicketIds.filter(id => id !== c.id);
                                        setClaimedTicketIds(updated);
                                        localStorage.setItem('ras_claimed_help_tickets', JSON.stringify(updated));
                                        window.dispatchEvent(new Event('storage'));
                                        toast.info(`🔓 Unclaimed help ticket for ${c.name}. Ticket returned to open pool.`);
                                      }}
                                      className="text-[10px] text-amber-400 hover:underline font-mono font-bold cursor-pointer"
                                      title="Unclaim ticket so another agent can assist"
                                    >
                                      🔓 Unclaim
                                    </button>
                                  </div>

                                  <div className="p-2 bg-zinc-950 rounded-lg border border-white/10 text-[11px] text-zinc-300 space-y-1 font-mono">
                                    <span className="text-[10px] text-rose-400 font-bold block uppercase">{ticketCategory.replace('_', ' ')}</span>
                                    <p className="italic text-zinc-200">"{ticketMessage}"</p>
                                  </div>

                                  <div className="flex gap-2 pt-1">
                                    <Link href="/ats/help-tickets" className="flex-1">
                                      <button
                                        type="button"
                                        className="w-full bg-[#F97316] hover:bg-orange-600 text-white font-extrabold text-[11px] py-1.5 rounded-lg text-center cursor-pointer shadow transition-all flex items-center justify-center gap-1"
                                      >
                                        💬 Go to Chat →
                                      </button>
                                    </Link>
                                    <Link href={`/ats/applicant/${c.id}`} className="flex-1">
                                      <button type="button" className="w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-bold text-[11px] py-1.5 rounded-lg text-center cursor-pointer">
                                        Open Dossier
                                      </button>
                                    </Link>
                                  </div>
                                </div>
                              );
                            })}
                            {stageCandidates.filter(c => claimedTicketIds.includes(c.id)).length === 0 && (
                              <div className="p-3 text-center text-[11px] text-zinc-500 font-mono">No claimed tickets assigned to you</div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* ACCORDION 2: UNCLAIMED HELP TICKETS */}
                      <div className="border border-white/10 bg-zinc-900/40 rounded-xl overflow-hidden transition-all">
                        <button
                          type="button"
                          onClick={() => setIsUnclaimedTicketsOpen(!isUnclaimedTicketsOpen)}
                          className="w-full p-2.5 bg-zinc-900 flex items-center justify-between text-[11px] font-black text-rose-400 uppercase font-mono tracking-wider cursor-pointer border-b border-white/5"
                        >
                          <span className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                            <span>2. Unclaimed Tickets ({stageCandidates.filter(c => !claimedTicketIds.includes(c.id)).length})</span>
                          </span>
                          {isUnclaimedTicketsOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                        </button>
                        {isUnclaimedTicketsOpen && (
                          <div className="p-3 space-y-3">
                            {stageCandidates.filter(c => !claimedTicketIds.includes(c.id)).map(c => {
                              let ticketMessage = "Applicant requested assistance on onboarding portal.";
                              let ticketCategory = "GENERAL_QUESTION";
                              try {
                                const ticket = JSON.parse(localStorage.getItem('ras_latest_help_ticket') || '{}');
                                if (ticket.message) ticketMessage = ticket.message;
                                if (ticket.category) ticketCategory = ticket.category;
                              } catch (e) {}

                              return (
                                <div key={c.id} className="bg-zinc-900 p-3 rounded-xl border border-rose-500/40 space-y-2">
                                  <div className="flex justify-between items-start">
                                    <h4 className="font-extrabold text-white text-xs">{c.name}</h4>
                                    <span className="text-[9px] font-bold text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20 font-mono">Unclaimed</span>
                                  </div>
                                  <div className="p-2 bg-zinc-950 rounded-lg border border-white/10 text-[11px] text-zinc-300 font-mono">
                                    <p className="italic text-zinc-300 truncate">"{ticketMessage}"</p>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const updated = [...claimedTicketIds, c.id];
                                      setClaimedTicketIds(updated);
                                      localStorage.setItem('ras_claimed_help_tickets', JSON.stringify(updated));
                                      
                                      // Sync to candidate help tickets state in localStorage
                                      try {
                                        const rawTickets = JSON.parse(localStorage.getItem('ras_rbt_help_tickets') || '[]');
                                        if (Array.isArray(rawTickets) && rawTickets.length > 0) {
                                          const updatedTickets = rawTickets.map((t: any) => ({
                                            ...t,
                                            status: 'CLAIMED',
                                            assignedHrAgent: 'Marcus Vance (HR Recruiter)',
                                            messages: [
                                              ...t.messages,
                                              {
                                                id: `m-claim-${Date.now()}`,
                                                sender: 'HR_AGENT',
                                                senderName: 'Marcus Vance (HR Recruiter)',
                                                text: 'Hello! I have claimed your help ticket and am reviewing your onboarding file now. How can I assist you?',
                                                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                              }
                                            ]
                                          }));
                                          localStorage.setItem('ras_rbt_help_tickets', JSON.stringify(updatedTickets));
                                        }
                                      } catch (err) {}

                                      window.dispatchEvent(new Event('storage'));
                                      toast.success(`✋ Claimed ticket for ${c.name}! Assigned to Marcus Vance.`);
                                    }}
                                    className="w-full bg-rose-600 hover:bg-rose-500 text-white font-extrabold text-xs py-1.5 rounded-lg cursor-pointer shadow flex items-center justify-center gap-1"
                                  >
                                    ✋ Claim Ticket Now
                                  </button>
                                </div>
                              );
                            })}
                            {stageCandidates.filter(c => !claimedTicketIds.includes(c.id)).length === 0 && (
                              <div className="p-3 text-center text-[11px] text-zinc-500 font-mono">No unclaimed tickets in queue</div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    /* STANDARD CARD RENDER FOR OTHER STAGES (APPLIED, PHONE, OFFER) */
                    stageCandidates.map(c => {
                      const count = c.reqCount || 0;
                      return (
                        <Link key={c.id} href={`/ats/applicant/${c.id}`} className="block">
                          <div 
                            className="bg-zinc-900/90 p-3.5 rounded-xl border border-white/10 hover:border-brand-orange-500/60 transition-all space-y-2.5 cursor-pointer hover:scale-[1.01] shadow-md group"
                          >
                            {/* Candidate Header & Role Badge */}
                            <div className="flex justify-between items-start gap-2">
                              <div className="min-w-0">
                                <h4 className="font-extrabold text-white text-xs group-hover:text-brand-orange-400 transition-colors truncate">
                                  {c.name}
                                </h4>
                                <p className="text-[11px] text-zinc-400 font-mono flex items-center gap-1 mt-0.5 truncate">
                                  <Mail className="w-3 h-3 text-zinc-500 shrink-0" /> {c.email}
                                </p>
                              </div>
                              <span className="text-[9px] font-extrabold px-2 py-0.5 rounded bg-brand-orange-500/10 text-brand-orange-400 border border-brand-orange-500/20 uppercase shrink-0">
                                {c.roleApplied}
                              </span>
                            </div>

                            {/* Requirements Live Progress Bar */}
                            <div className="space-y-1 bg-zinc-950 p-2 rounded-lg border border-white/5">
                              <div className="flex justify-between items-center text-[10px] font-mono">
                                <span className="text-zinc-400">Requirements:</span>
                                <span className="font-extrabold text-emerald-400">{count}/5 Done ({count * 20}%)</span>
                              </div>
                              <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                                <div 
                                  className="h-full bg-gradient-to-r from-amber-500 to-emerald-500 transition-all duration-500" 
                                  style={{ width: `${(count / 5) * 100}%` }} 
                                />
                              </div>
                              
                              {/* 5 Requirements Micro Status Pills */}
                              <div className="grid grid-cols-5 gap-1 pt-1 text-[8px] font-mono text-center">
                                <span 
                                  className={`px-0.5 py-0.5 rounded transition-all ${
                                    c.reqTasks 
                                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold' 
                                      : 'bg-rose-500/20 text-rose-300 border border-rose-500/30 font-bold'
                                  }`} 
                                  title="REQ 1: E-Signatures & 30 Onboarding Forms (Required)"
                                >
                                  ✍️Forms
                                </span>
                                <span 
                                  className={`px-0.5 py-0.5 rounded transition-all ${
                                    c.reqSim 
                                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold' 
                                      : 'bg-rose-500/20 text-rose-300 border border-rose-500/30 font-bold'
                                  }`} 
                                  title="REQ 4: ABA Clinical Trial Simulator (Required)"
                                >
                                  🧠Sim
                                </span>
                                <span 
                                  className={`px-0.5 py-0.5 rounded transition-all ${
                                    c.reqAvail 
                                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold' 
                                      : 'bg-rose-500/20 text-rose-300 border border-rose-500/30 font-bold'
                                  }`} 
                                  title="REQ 3: Weekly Work Availability Grid (Required)"
                                >
                                  📅Avail
                                </span>
                                <span 
                                  className={`px-0.5 py-0.5 rounded transition-all ${
                                    c.reqInterview 
                                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold' 
                                      : c.interviewBooked
                                      ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30 font-bold'
                                      : 'bg-rose-500/20 text-rose-300 border border-rose-500/30 font-bold'
                                  }`} 
                                  title={c.reqInterview ? 'REQ 2: HR Evaluation Submitted ✓' : c.interviewBooked ? 'REQ 2: Slot Booked — Awaiting HR Evaluation' : 'REQ 2: 1-on-1 HR Interview Screening (Required)'}
                                >
                                  🎙️Int
                                </span>
                                <span 
                                  className={`px-0.5 py-0.5 rounded transition-all ${
                                    c.certDone 
                                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold' 
                                      : 'bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold'
                                  }`} 
                                  title="REQ 5: 40-Hour RBT Course Upload (Optional Upgrade)"
                                >
                                  📜40-Hr
                                </span>
                              </div>
                            </div>

                            {/* Footer Phone & Portal Status */}
                            <div className="text-[10px] text-zinc-400 font-mono flex items-center justify-between pt-1 border-t border-white/5">
                              <span className="flex items-center gap-1"><Phone className="w-2.5 h-2.5 text-zinc-500" /> {c.phone}</span>
                              <span className="text-emerald-400 font-bold text-[9px]">
                                {c.activationStatus === 'ACCOUNT_ACTIVE' ? '✓ Active' : c.activationStatus === 'INVITATION_SENT' ? '✉ Invited' : '⏳ Pending HR'}
                              </span>
                            </div>
                          </div>
                        </Link>
                      );
                    })
                  )}

                  {!isInterviewStage && stageCandidates.length === 0 && (
                    <div className="p-6 text-center text-xs text-zinc-600 border border-dashed border-white/5 rounded-lg">
                      No candidates in stage
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
