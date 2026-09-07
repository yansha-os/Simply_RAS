'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import {
  Users,
  Search,
  Phone,
  Mail,
  Filter,
  Key,
  Copy,
  Check,
  ShieldCheck,
  ChevronRight,
  ExternalLink,
  LifeBuoy,
} from 'lucide-react';
import { toast } from 'sonner';

import { getAtsCandidates, advanceAtsStage, inviteCandidate, hireCandidate } from '@/app/actions/atsActions';
import { listHelpTickets, claimHelpTicket, forwardHelpTicketToHeadHr, type HelpTicketDto } from '@/app/actions/helpDeskActions';
import { useHrmRole } from '@/lib/useHrmRole';
import { CACHE_KEYS, cachedFetch, getCachedStale, invalidateCache } from '@/lib/clientDataCache';
import {
  activationStatusLabel,
  getAtsPipelineColumns,
  type AtsStage,
} from '@/lib/atsStage';

export interface Candidate {
  id: string;
  name: string;
  email: string;
  phone: string;
  roleApplied: 'RBT' | 'BCBA' | 'ADMIN';
  stage: AtsStage;
  experienceYears: number;
  appliedDate: string;
  updatedAt?: string;
  activationStatus: 'PENDING_HR_REVIEW' | 'INVITATION_SENT' | 'ACCOUNT_ACTIVE' | 'ACTIVE' | 'REJECTED';
  magicLinkToken?: string | null;
  reqTasks?: boolean;
  certDone?: boolean;
  reqSim?: boolean;
  reqAvail?: boolean;
  reqInterview?: boolean;
  interviewBooked?: boolean;
  reqBackground?: boolean;
  reqCount?: number;
  certUploaded?: boolean;
  helpTicketId?: string | null;
  helpTicketCategory?: string | null;
  helpTicketMessage?: string | null;
  helpTicketStatus?: string | null;
  helpTicketClaimedByUserId?: string | null;
}

type AtsCandidateRow = Awaited<ReturnType<typeof getAtsCandidates>>['data'][number];

function mapCandidateRow(c: AtsCandidateRow): Candidate {
  return {
    ...c,
    certDone: c.certUploaded === true,
    activationStatus:
      c.activationStatus === 'ACTIVE'
        ? 'ACCOUNT_ACTIVE'
        : (c.activationStatus as Candidate['activationStatus']),
  };
}

function calculateDaysIdle(
  updatedAt: string | undefined,
  snapshotAt: number | null
): number | null {
  if (!updatedAt || snapshotAt === null) return null;
  const ms = snapshotAt - new Date(updatedAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  return Math.floor(ms / 86_400_000);
}

export default function AtsPipelineView() {
  const router = useRouter();
  const { role } = useHrmRole();
  const isHrAgent = role === 'HR_AGENT';

  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [helpTickets, setHelpTickets] = useState<HelpTicketDto[]>([]);
  const [unclaimedSectionOpen, setUnclaimedSectionOpen] = useState(true);
  const [claimedSectionOpen, setClaimedSectionOpen] = useState(true);
  const [isClaimingTicketId, setIsClaimingTicketId] = useState<string | null>(null);
  const [candidateSnapshotAt, setCandidateSnapshotAt] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');

  const [activeInviteCandidate, setActiveInviteCandidate] = useState<Candidate | null>(null);
  const [selectedProfileCandidate, setSelectedProfileCandidate] = useState<Candidate | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  const refreshHelpTickets = React.useCallback(async () => {
    const res = await listHelpTickets({ activeOnly: true });
    if (res.success && res.data) {
      setHelpTickets(res.data);
    }
  }, []);

  const refreshCandidates = React.useCallback(async (force = false) => {
    const refresh = await cachedFetch(
      CACHE_KEYS.atsCandidates,
      () => getAtsCandidates(),
      {
        ttlMs: 45_000,
        force,
        onStale: (stale) => {
          if (stale.success && stale.data) {
            setCandidates(stale.data.map(mapCandidateRow));
            setCandidateSnapshotAt(Date.now());
            setIsLoading(false);
          }
        },
      }
    );
    if (!refresh.success || !refresh.data) {
      if (refresh.error) toast.error(refresh.error);
      return null;
    }
    const mapped = refresh.data.map(mapCandidateRow);
    setCandidates(mapped);
    setCandidateSnapshotAt(Date.now());
    return mapped;
  }, []);

  React.useEffect(() => {
    async function loadCandidates(force = false) {
      const stale = getCachedStale<{
        success: boolean;
        data: Awaited<ReturnType<typeof getAtsCandidates>>['data'];
      }>(CACHE_KEYS.atsCandidates);
      if (stale?.value?.success && stale.value.data) {
        setCandidates(stale.value.data.map(mapCandidateRow));
        setCandidateSnapshotAt(Date.now());
        setIsLoading(false);
        if (stale.fresh && !force) return;
      } else {
        setIsLoading(true);
      }
      await refreshCandidates(force);
      setIsLoading(false);
    }
    void loadCandidates(false);

    const onSync = () => {
      invalidateCache(CACHE_KEYS.atsCandidates);
      void loadCandidates(true);
      void refreshHelpTickets();
    };
    const onFocus = () => {
      const hit = getCachedStale(CACHE_KEYS.atsCandidates);
      if (!hit?.fresh) void loadCandidates(true);
      void refreshHelpTickets();
    };
    window.addEventListener('rbt_progress_synced', onSync);
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener('rbt_progress_synced', onSync);
      window.removeEventListener('focus', onFocus);
    };
  }, [refreshCandidates, refreshHelpTickets]);

  React.useEffect(() => {
    queueMicrotask(() => void refreshHelpTickets());
  }, [refreshHelpTickets]);

  const handleClaimTicket = async (ticketId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setIsClaimingTicketId(ticketId);
    const res = await claimHelpTicket(ticketId);
    setIsClaimingTicketId(null);
    if (!res.success) {
      toast.error(res.error || 'Failed to claim ticket');
      return;
    }
    toast.success('Ticket claimed! Opening Help Tickets console...');
    router.push(`/ats/help-tickets?ticketId=${ticketId}`);
  };

  const handleForwardTicket = async (ticketId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const res = await forwardHelpTicketToHeadHr(ticketId);
    if (!res.success) {
      toast.error(res.error || 'Failed to forward ticket');
      return;
    }
    toast.success('Ticket forwarded to Head HR for executive review!');
    setHelpTickets((prev) => prev.filter((t) => t.id !== ticketId));
    void refreshHelpTickets();
  };

  const handleAdvanceStage = async (id: string) => {
    const current = candidates.find((c) => c.id === id);
    if (!current) return;

    if (current.stage === 'OFFER') {
      const res = await hireCandidate(id);
      if (!res.success) {
        toast.error(res.error || 'Hire failed');
        return;
      }
      toast.success(`${current.name} hired!`);
    } else {
      const res = await advanceAtsStage(id);
      if (!res.success) {
        toast.error(res.error || 'Could not advance stage');
        return;
      }
      toast.success(`${current.name} advanced`);
    }

    const mapped = await refreshCandidates(true);
    if (!mapped) return;

    setSelectedProfileCandidate((prev) => {
      if (!prev || prev.id !== id) return prev;
      return mapped.find((c) => c.id === id) ?? prev;
    });
  };

  const handleApproveAndInvite = async (candidate: Candidate) => {
    // Eager optimistic update so card instantly moves to PHONE_SCREEN column
    setCandidates((prev) =>
      prev.map((c) =>
        c.id === candidate.id
          ? { ...c, stage: 'PHONE_SCREEN' as AtsStage, activationStatus: 'INVITATION_SENT' }
          : c
      )
    );

    const res = await inviteCandidate(candidate.id);
    if (!res.success) {
      toast.error(res.error || 'Invite failed');
      // Rollback on failure
      void refreshCandidates(true);
      return;
    }

    invalidateCache(CACHE_KEYS.atsCandidates);
    await refreshCandidates(true);

    if (res.candidate) {
      setActiveInviteCandidate({
        ...candidate,
        stage: res.candidate.stage,
        activationStatus:
          res.candidate.activationStatus === 'ACTIVE'
            ? 'ACCOUNT_ACTIVE'
            : (res.candidate.activationStatus as Candidate['activationStatus']),
        magicLinkToken: res.candidate.magicLinkToken,
      });
    }

    if (res.magicLinkUrl) {
      try {
        await navigator.clipboard.writeText(res.magicLinkUrl);
        toast.success('Invite ready — magic link copied to clipboard');
      } catch {
        toast.success(res.message || 'Invite ready — copy the magic link from the modal');
      }
    } else {
      toast.success(res.message || `Approved ${candidate.name}`);
    }
  };

  const copyInviteLink = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    toast.success('Magic link copied to clipboard!');
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const activePipelineCandidates = candidates.filter(
    (c) => c.stage !== 'HIRED' && c.stage !== 'REJECTED'
  );

  const filteredCandidates = activePipelineCandidates.filter((c) => {
    const matchesSearch = `${c.name} ${c.email} ${c.roleApplied}`
      .toLowerCase()
      .includes(searchQuery.toLowerCase());
    if (roleFilter === 'ALL') return matchesSearch;
    return matchesSearch && c.roleApplied === roleFilter;
  });

  const defaultStages = getAtsPipelineColumns({ includeHelpDesk: false });

  const stages: Array<{
    key: string;
    title: string;
    shortLabel: string;
    badgeClass: string;
    isHelpDeskCol?: boolean;
  }> = isHrAgent
    ? [
        {
          key: 'APPLIED',
          title: 'Applied',
          shortLabel: 'HR Review',
          badgeClass: 'border-blue-500/30 bg-blue-500/10 text-blue-400',
        },
        {
          key: 'PHONE_SCREEN',
          title: 'In Progress',
          shortLabel: 'Onboarding',
          badgeClass: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
        },
        {
          key: 'INTERVIEW',
          title: 'Interview',
          shortLabel: 'Booked',
          badgeClass: 'border-purple-500/30 bg-purple-500/10 text-purple-400',
        },
        {
          key: 'HELP_TICKETS',
          title: 'Help Tickets',
          shortLabel: 'Unclaimed & Active',
          badgeClass: 'border-rose-500/40 bg-rose-500/10 text-rose-400',
          isHelpDeskCol: true,
        },
      ]
    : defaultStages;

  return (
    <div className="relative space-y-8">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 left-1/3 h-64 w-64 rounded-full bg-brand-orange-500/10 blur-3xl"
      />

      {/* Header Banner */}
      <div className="relative flex flex-col gap-4 rounded-2xl border border-white/10 bg-zinc-950/80 p-6 shadow-2xl backdrop-blur-xl md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="font-heading flex items-center gap-2 text-2xl font-bold text-white">
            <Users className="h-6 w-6 text-brand-orange-500" />
            ATS Pipeline
          </h1>
          <p suppressHydrationWarning className="mt-1 text-xs text-zinc-400">
            {activePipelineCandidates.length} candidate{activePipelineCandidates.length === 1 ? '' : 's'} in
            the live funnel — empty columns stay empty until someone lands there.
          </p>
          {isLoading && (
            <p className="mt-2 font-mono text-[10px] uppercase tracking-wider text-zinc-500">
              Syncing candidates…
            </p>
          )}
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-500" />
            <input
              type="text"
              placeholder="Search candidate..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              suppressHydrationWarning
              className="w-48 rounded-lg border border-white/10 bg-zinc-900/80 py-1.5 pl-9 pr-3 text-xs text-white outline-none backdrop-blur-sm focus:border-brand-orange-500"
            />
          </div>

          <div className="flex items-center rounded-lg border border-white/10 bg-zinc-900/80 px-2.5 py-1.5 text-xs text-zinc-400 backdrop-blur-sm">
            <Filter className="mr-1 h-3.5 w-3.5 text-zinc-500" />
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              suppressHydrationWarning
              className="cursor-pointer bg-transparent text-xs font-medium text-white outline-none"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="animate-fade-in w-full max-w-lg space-y-5 rounded-2xl border border-brand-orange-500/50 bg-zinc-950/95 p-6 shadow-2xl backdrop-blur-xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-emerald-400" />
                <h3 className="text-base font-bold text-white">HR Activation Magic Link Generated</h3>
              </div>
              <button
                type="button"
                onClick={() => setActiveInviteCandidate(null)}
                className="cursor-pointer text-xs text-zinc-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs text-zinc-300">
              <p>
                Candidate <strong className="text-white">{activeInviteCandidate.name}</strong> (
                {activeInviteCandidate.email}) has been approved by HR.
              </p>
              <div className="space-y-2 rounded-xl border border-white/10 bg-zinc-900/80 p-3.5">
                <span className="block font-mono text-[10px] font-bold uppercase tracking-wider text-brand-orange-400">
                  Activation Magic Link URL:
                </span>
                <div className="flex items-center justify-between gap-2 break-all rounded-lg border border-white/10 bg-black/50 p-2.5 font-mono text-xs text-emerald-400">
                  <span>
                    {`${typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3001'}/magic-link/${activeInviteCandidate.magicLinkToken || activeInviteCandidate.id}`}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      copyInviteLink(
                        `${window.location.origin}/magic-link/${activeInviteCandidate.magicLinkToken || activeInviteCandidate.id}`
                      )
                    }
                    className="shrink-0 cursor-pointer rounded-md bg-zinc-800 p-1.5 text-white transition-colors hover:bg-brand-orange-500"
                  >
                    {copiedLink ? (
                      <Check className="h-4 w-4 text-emerald-400" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
              <p className="text-[11px] italic text-zinc-400">
                Share this single-use activation link with {activeInviteCandidate.email}.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Link
                href={`/ats/applicant/${activeInviteCandidate.id}`}
                className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-white/10 bg-zinc-900 px-4 text-xs font-bold text-zinc-200 transition-colors hover:border-brand-orange-500/40 hover:text-white"
              >
                Open dossier <ExternalLink className="h-3.5 w-3.5" />
              </Link>
              <Button
                onClick={() => setActiveInviteCandidate(null)}
                className="h-9 cursor-pointer bg-brand-orange-500 px-6 text-xs font-bold text-white hover:bg-brand-orange-600"
              >
                Close Window
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* CANDIDATE PROFILE & PROGRESS MODAL */}
      {selectedProfileCandidate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="animate-fade-in w-full max-w-xl space-y-6 rounded-3xl border border-brand-orange-500/50 bg-zinc-950/95 p-6 text-white shadow-2xl backdrop-blur-xl sm:p-8">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-orange-500/30 bg-orange-500/10 text-lg font-black text-[#F97316]">
                  {selectedProfileCandidate.name.substring(0, 2)}
                </div>
                <div>
                  <h3 className="font-heading text-xl font-black text-white">
                    {selectedProfileCandidate.name}
                  </h3>
                  <p className="font-mono text-xs text-zinc-400">
                    {selectedProfileCandidate.email} • {selectedProfileCandidate.phone}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedProfileCandidate(null)}
                className="cursor-pointer rounded-xl border border-white/10 bg-zinc-900 px-3 py-1.5 text-xs font-bold text-zinc-400 hover:text-white"
              >
                ✕ Close
              </button>
            </div>

            <div className="space-y-3">
              <span className="block font-mono text-xs font-bold uppercase tracking-wider text-brand-orange-400">
                Candidate Progress Funnel:
              </span>
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
                      className={`rounded-xl border p-2.5 text-center text-xs font-bold transition-all ${
                        isCurrent
                          ? 'border-brand-orange-500 bg-brand-orange-500/20 text-brand-orange-400 shadow-md'
                          : isPassed
                            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                            : 'border-white/5 bg-zinc-900 text-zinc-600'
                      }`}
                    >
                      <span className="block font-mono text-[10px] uppercase">{s.label}</span>
                      <span className="mt-0.5 block text-[11px]">
                        {isPassed ? '✓ Done' : 'Pending'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2 rounded-2xl border border-white/10 bg-zinc-900/80 p-4 text-xs backdrop-blur-sm">
              <div className="flex justify-between">
                <span className="text-zinc-400">Role Applied For:</span>
                <span className="font-bold text-white">{selectedProfileCandidate.roleApplied}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">ABA Experience:</span>
                <span className="font-bold text-white">
                  {selectedProfileCandidate.experienceYears} Years
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Application Date:</span>
                <span className="font-mono text-zinc-300">
                  {selectedProfileCandidate.appliedDate}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Portal Activation Status:</span>
                <span className="font-bold text-emerald-400">
                  {activationStatusLabel(selectedProfileCandidate.activationStatus).label}
                </span>
              </div>
            </div>

            <div className="space-y-2.5 border-t border-white/10 pt-2">
              <Link
                href={`/ats/applicant/${selectedProfileCandidate.id}`}
                className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl border border-white/10 bg-zinc-900 py-3 text-xs font-extrabold text-white transition-all duration-300 hover:scale-[1.01] hover:border-brand-orange-500/40 hover:shadow-2xl"
              >
                Open full dossier <ChevronRight className="h-4 w-4" />
              </Link>

              <button
                type="button"
                onClick={async () => {
                  await handleApproveAndInvite(selectedProfileCandidate);
                  setSelectedProfileCandidate(null);
                }}
                className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-[#F97316] px-4 py-3.5 text-xs font-extrabold text-white shadow-lg transition-all hover:bg-orange-600"
              >
                <Key className="h-4 w-4" />
                <span>Approve Applicant &amp; Send Magic Link →</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  void handleAdvanceStage(selectedProfileCandidate.id);
                }}
                className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-zinc-800 px-4 py-2.5 text-xs font-bold text-zinc-200 transition-all hover:bg-zinc-700"
              >
                <span>Advance Candidate Stage →</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Live kanban — real stages only, honest empties */}
      <div className="flex flex-col gap-4 overflow-x-auto pb-4 md:flex-row md:items-stretch">
        {stages.map((stage) => {
          const stageCandidates = filteredCandidates.filter((c) => c.stage === stage.key);

          return (
            <div
              key={stage.key}
              className="relative flex min-h-[280px] w-full min-w-[240px] flex-1 flex-col rounded-2xl border border-white/10 bg-zinc-950/70 p-4 shadow-xl backdrop-blur-xl md:max-w-none"
            >
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 top-0 h-24 rounded-t-2xl bg-gradient-to-b from-white/[0.03] to-transparent"
              />

              <div
                className={`relative mb-4 flex items-center justify-between rounded-xl border p-2.5 text-xs font-bold ${stage.badgeClass}`}
              >
                <div className="min-w-0">
                  <span suppressHydrationWarning className="block truncate">
                    {stage.title}
                  </span>
                  <span className="mt-0.5 block font-mono text-[10px] font-medium opacity-70">
                    {stage.shortLabel}
                  </span>
                </div>
                <span
                  suppressHydrationWarning
                  className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 font-mono"
                >
                  {stage.isHelpDeskCol ? helpTickets.length : stageCandidates.length}
                </span>
              </div>

              {stage.isHelpDeskCol ? (
                <div className="relative flex-1 space-y-3 font-sans">
                  {/* SECTION 1: UNCLAIMED TICKETS */}
                  {(() => {
                    const unclaimed = helpTickets.filter(
                      (t) => !t.claimedByUserId || t.status === 'OPEN'
                    );
                    return (
                      <div className="rounded-xl border border-amber-500/20 bg-zinc-900/60 overflow-hidden">
                        <button
                          type="button"
                          onClick={() => setUnclaimedSectionOpen((prev) => !prev)}
                          className="w-full p-2.5 bg-amber-500/10 hover:bg-amber-500/20 flex items-center justify-between transition-colors cursor-pointer text-left"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-amber-400 font-extrabold text-xs uppercase tracking-wider font-mono">
                              🙋 Unclaimed Tickets
                            </span>
                            <span className="bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold">
                              {unclaimed.length}
                            </span>
                          </div>
                          <span className="text-zinc-400 text-[10px] font-mono font-bold">
                            {unclaimedSectionOpen ? '▼ Minimize' : '▶ Expand'}
                          </span>
                        </button>

                        {unclaimedSectionOpen && (
                          <div className="p-2.5 space-y-2.5">
                            {unclaimed.length === 0 ? (
                              <p className="text-[10px] font-mono text-zinc-500 text-center py-2 italic">
                                No unclaimed tickets in queue.
                              </p>
                            ) : (
                              unclaimed.map((t) => (
                                <div
                                  key={t.id}
                                  className="group space-y-2 rounded-xl border border-amber-500/20 bg-zinc-900/90 p-3 shadow-md backdrop-blur-sm transition-all duration-300 hover:scale-[1.01] hover:border-amber-500/50 hover:shadow-xl"
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                      <h4 className="truncate text-xs font-extrabold text-white transition-colors group-hover:text-amber-400">
                                        {t.candidateName || 'Applicant'}
                                      </h4>
                                      <p className="mt-0.5 flex items-center gap-1 truncate font-mono text-[10px] text-zinc-400">
                                        <Mail className="h-3 w-3 shrink-0 text-zinc-500" /> {t.candidateEmail || 'Candidate'}
                                      </p>
                                    </div>
                                    <span className="shrink-0 rounded border border-amber-500/40 bg-amber-500/20 text-amber-300 px-2 py-0.5 text-[9px] font-extrabold uppercase font-mono animate-pulse">
                                      🙋 Unclaimed
                                    </span>
                                  </div>

                                  <div className="mt-1.5 space-y-1 rounded-lg border border-white/5 bg-zinc-950/90 p-2 text-xs text-zinc-300 font-mono">
                                    <div className="flex items-center justify-between text-[10px] text-amber-400 font-bold">
                                      <span className="truncate max-w-[140px]">{t.categoryLabel || t.category}</span>
                                      <span className="shrink-0 font-mono">#{t.ticketNumber}</span>
                                    </div>
                                    <p className="line-clamp-2 text-[11px] text-zinc-300 font-sans leading-snug">
                                      {t.subject || t.message || 'Help ticket open'}
                                    </p>
                                  </div>

                                  <div className="flex gap-2 pt-1">
                                    <button
                                      type="button"
                                      onClick={(e) => handleClaimTicket(t.id, e)}
                                      disabled={isClaimingTicketId === t.id}
                                      className="flex flex-1 cursor-pointer items-center justify-center gap-1 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 py-1.5 text-[11px] font-black transition-all shadow-sm border-none"
                                    >
                                      <span>{isClaimingTicketId === t.id ? 'Claiming...' : '🙋 Claim Ticket'}</span>
                                    </button>
                                    <Link
                                      href={`/ats/help-tickets?ticketId=${t.id}`}
                                      className="flex flex-1 cursor-pointer items-center justify-center gap-1 rounded-lg border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 py-1.5 text-[11px] font-bold text-amber-300 transition-all text-center"
                                    >
                                      <span>Fix Ticket →</span>
                                    </Link>
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* SECTION 2: PERSONAL CLAIMED TICKETS */}
                  {(() => {
                    const claimed = helpTickets.filter(
                      (t) => t.claimedByUserId || t.status === 'CLAIMED' || t.status === 'IN_PROGRESS'
                    );
                    return (
                      <div className="rounded-xl border border-blue-500/20 bg-zinc-900/60 overflow-hidden">
                        <button
                          type="button"
                          onClick={() => setClaimedSectionOpen((prev) => !prev)}
                          className="w-full p-2.5 bg-blue-500/10 hover:bg-blue-500/20 flex items-center justify-between transition-colors cursor-pointer text-left"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-blue-400 font-extrabold text-xs uppercase tracking-wider font-mono">
                              🛠️ Personal Claimed Tickets
                            </span>
                            <span className="bg-blue-500/20 text-blue-300 border border-blue-500/30 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold">
                              {claimed.length}
                            </span>
                          </div>
                          <span className="text-zinc-400 text-[10px] font-mono font-bold">
                            {claimedSectionOpen ? '▼ Minimize' : '▶ Expand'}
                          </span>
                        </button>

                        {claimedSectionOpen && (
                          <div className="p-2.5 space-y-2.5">
                            {claimed.length === 0 ? (
                              <p className="text-[10px] font-mono text-zinc-500 text-center py-2 italic">
                                No claimed tickets yet.
                              </p>
                            ) : (
                              claimed.map((t) => (
                                <div
                                  key={t.id}
                                  className="group space-y-2 rounded-xl border border-blue-500/20 bg-zinc-900/90 p-3 shadow-md backdrop-blur-sm transition-all duration-300 hover:scale-[1.01] hover:border-blue-500/50 hover:shadow-xl"
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                      <h4 className="truncate text-xs font-extrabold text-white transition-colors group-hover:text-blue-400">
                                        {t.candidateName || 'Applicant'}
                                      </h4>
                                      <p className="mt-0.5 flex items-center gap-1 truncate font-mono text-[10px] text-zinc-400">
                                        <Mail className="h-3 w-3 shrink-0 text-zinc-500" /> {t.candidateEmail || 'Candidate'}
                                      </p>
                                    </div>
                                    <span className="shrink-0 rounded border border-blue-500/40 bg-blue-500/20 text-blue-300 px-2 py-0.5 text-[9px] font-extrabold uppercase font-mono">
                                      🛠️ Claimed
                                    </span>
                                  </div>

                                  <div className="mt-1.5 space-y-1 rounded-lg border border-white/5 bg-zinc-950/90 p-2 text-xs text-zinc-300 font-mono">
                                    <div className="flex items-center justify-between text-[10px] text-blue-400 font-bold">
                                      <span className="truncate max-w-[140px]">{t.categoryLabel || t.category}</span>
                                      <span className="shrink-0 font-mono">#{t.ticketNumber}</span>
                                    </div>
                                    <p className="line-clamp-2 text-[11px] text-zinc-300 font-sans leading-snug">
                                      {t.subject || t.message || 'Help ticket open'}
                                    </p>
                                  </div>

                                  <div className="flex gap-2 pt-1">
                                    <Link
                                      href={`/ats/help-tickets?ticketId=${t.id}`}
                                      className="flex flex-1 cursor-pointer items-center justify-center gap-1 rounded-lg border border-blue-500/40 bg-blue-500/10 hover:bg-blue-500/20 py-1.5 text-[11px] font-bold text-blue-300 transition-all text-center"
                                    >
                                      <span>Fix Ticket →</span>
                                    </Link>

                                    {t.status !== 'ESCALATED_HEAD_HR' && (
                                      <button
                                        type="button"
                                        onClick={(e) => handleForwardTicket(t.id, e)}
                                        className="flex flex-1 cursor-pointer items-center justify-center gap-1 rounded-lg border border-purple-500/40 bg-purple-500/20 hover:bg-purple-500/30 py-1.5 text-[11px] font-bold text-purple-300 transition-all text-center"
                                      >
                                        <span>⏩ Forward</span>
                                      </button>
                                    )}
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {helpTickets.length === 0 && (
                    <div className="flex min-h-[160px] flex-col items-center justify-center rounded-xl border border-dashed border-white/10 bg-zinc-900/30 px-4 py-8 text-center backdrop-blur-sm">
                      <LifeBuoy className="w-7 h-7 text-zinc-600 mb-2 animate-pulse" />
                      <p className="text-xs font-bold text-zinc-400">No active help tickets</p>
                      <p className="mt-1 font-mono text-[10px] text-zinc-500">
                        All candidate questions &amp; help tickets resolved!
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="relative flex-1 space-y-3">
                  {stageCandidates.map((c) => {
                    const count = c.reqCount || 0;
                    const act = activationStatusLabel(c.activationStatus);
                    const certDone = c.certDone === true || c.certUploaded === true;
                    const idle = calculateDaysIdle(c.updatedAt, candidateSnapshotAt);
                    const isStalled = idle !== null && idle >= 5;

                    return (
                      <div
                        key={c.id}
                        className="group space-y-2.5 rounded-xl border border-white/10 bg-zinc-900/80 p-3.5 shadow-md backdrop-blur-sm transition-all duration-300 hover:scale-[1.01] hover:border-brand-orange-500/40 hover:shadow-2xl"
                      >
                        <Link
                          href={`/ats/applicant/${c.id}`}
                          className="block cursor-pointer"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <h4 className="truncate text-xs font-extrabold text-white transition-colors group-hover:text-brand-orange-400">
                                {c.name}
                              </h4>
                              <p className="mt-0.5 flex items-center gap-1 truncate font-mono text-[11px] text-zinc-400">
                                <Mail className="h-3 w-3 shrink-0 text-zinc-500" /> {c.email}
                              </p>
                            </div>
                            <span className="shrink-0 rounded border border-brand-orange-500/20 bg-brand-orange-500/10 px-2 py-0.5 text-[9px] font-extrabold uppercase text-brand-orange-400">
                              {c.roleApplied}
                            </span>
                          </div>

                          <div className="mt-2.5 space-y-1 rounded-lg border border-white/5 bg-zinc-950/80 p-2">
                            <div className="flex items-center justify-between font-mono text-[10px]">
                              <span className="text-zinc-400">Requirements:</span>
                              <span className="font-extrabold text-emerald-400">
                                {count}/5 Done ({count * 20}%)
                              </span>
                            </div>
                            <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
                              <div
                                className="h-full bg-gradient-to-r from-amber-500 to-emerald-500 transition-all duration-500"
                                style={{ width: `${(count / 5) * 100}%` }}
                              />
                            </div>

                            <div className="grid grid-cols-5 gap-1 pt-1 text-center font-mono text-[8px]">
                              <span
                                className={`rounded px-0.5 py-0.5 font-bold transition-all ${
                                  c.reqTasks
                                    ? 'border border-emerald-500/30 bg-emerald-500/20 text-emerald-300'
                                    : 'border border-rose-500/30 bg-rose-500/20 text-rose-300'
                                }`}
                                title="E-Signatures & onboarding forms"
                              >
                                Forms
                              </span>
                              <span
                                className={`rounded px-0.5 py-0.5 font-bold transition-all ${
                                  c.reqSim
                                    ? 'border border-emerald-500/30 bg-emerald-500/20 text-emerald-300'
                                    : 'border border-rose-500/30 bg-rose-500/20 text-rose-300'
                                }`}
                                title="ABA clinical trial simulator"
                              >
                                Sim
                              </span>
                              <span
                                className={`rounded px-0.5 py-0.5 font-bold transition-all ${
                                  c.reqAvail
                                    ? 'border border-emerald-500/30 bg-emerald-500/20 text-emerald-300'
                                    : 'border border-rose-500/30 bg-rose-500/20 text-rose-300'
                                }`}
                                title="Weekly work availability"
                              >
                                Avail
                              </span>
                              <span
                                className={`rounded px-0.5 py-0.5 font-bold transition-all ${
                                  c.reqInterview
                                    ? 'border border-emerald-500/30 bg-emerald-500/20 text-emerald-300'
                                    : c.interviewBooked
                                      ? 'border border-blue-500/30 bg-blue-500/20 text-blue-300'
                                      : 'border border-rose-500/30 bg-rose-500/20 text-rose-300'
                                }`}
                                title={
                                  c.reqInterview
                                    ? 'Interview evaluated'
                                    : c.interviewBooked
                                      ? 'Slot booked — awaiting evaluation'
                                      : 'Interview required'
                                }
                              >
                                Int
                              </span>
                              <span
                                className={`rounded px-0.5 py-0.5 font-bold transition-all ${
                                  certDone
                                    ? 'border border-emerald-500/30 bg-emerald-500/20 text-emerald-300'
                                    : 'border border-rose-500/30 bg-rose-500/20 text-rose-300'
                                }`}
                                title="40-hour RBT course"
                              >
                                40-Hr
                              </span>
                            </div>
                          </div>

                          <div className="mt-2 flex items-center justify-between border-t border-white/5 pt-1 font-mono text-[10px] text-zinc-400">
                            <span className="flex items-center gap-1">
                              <Phone className="h-2.5 w-2.5 text-zinc-500" /> {c.phone || '—'}
                            </span>
                            <span className="flex items-center gap-1.5">
                              {isStalled && (
                                <span
                                  suppressHydrationWarning
                                  title={`No activity for ${idle} days — candidate may be stalled`}
                                  className={`rounded-full border px-1.5 py-0.5 text-[9px] font-extrabold ${
                                    idle >= 10
                                      ? 'border-rose-500/30 bg-rose-500/10 text-rose-400'
                                      : 'border-amber-500/30 bg-amber-500/10 text-amber-400'
                                  }`}
                                >
                                  ⏳ {idle}d idle
                                </span>
                              )}
                              <span
                                className={`text-[9px] font-bold ${
                                  act.tone === 'active'
                                    ? 'text-emerald-400'
                                    : act.tone === 'invited'
                                      ? 'text-amber-400'
                                      : 'text-zinc-400'
                                }`}
                              >
                                {act.label}
                              </span>
                            </span>
                          </div>
                        </Link>

                        <div className="flex gap-2 pt-0.5">
                          <Link
                            href={`/ats/applicant/${c.id}`}
                            className="flex flex-1 cursor-pointer items-center justify-center gap-1 rounded-lg border border-white/10 bg-zinc-950/60 py-1.5 text-[11px] font-bold text-zinc-200 transition-all hover:border-brand-orange-500/40 hover:text-white"
                          >
                            Dossier <ChevronRight className="h-3 w-3" />
                          </Link>
                          {stage.key === 'INTERVIEW' && (
                            <Link
                              href={`/ats/applicant/${c.id}?tab=INTERVIEW`}
                              className="flex flex-1 cursor-pointer items-center justify-center gap-1 rounded-lg border border-purple-500/30 bg-purple-500/10 py-1.5 text-[11px] font-bold text-purple-300 transition-all hover:border-purple-400/50 hover:text-purple-200"
                            >
                              Interview
                            </Link>
                          )}
                          {stage.key === 'APPLIED' && (
                            <button
                              type="button"
                              onClick={() => setSelectedProfileCandidate(c)}
                              className="flex flex-1 cursor-pointer items-center justify-center gap-1 rounded-lg border border-brand-orange-500/30 bg-brand-orange-500/10 py-1.5 text-[11px] font-bold text-brand-orange-400 transition-all hover:border-brand-orange-500/50"
                            >
                              Quick review
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {stageCandidates.length === 0 && (
                    <div className="flex min-h-[140px] flex-col items-center justify-center rounded-xl border border-dashed border-white/10 bg-zinc-900/30 px-4 py-8 text-center backdrop-blur-sm">
                      <p className="text-xs font-medium text-zinc-500">No applicants</p>
                      <p className="mt-1 font-mono text-[10px] text-zinc-600">
                        Stage empty — not a demo placeholder
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
