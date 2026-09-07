'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  MessageSquare,
  UserCheck,
  CheckCircle2,
  Send,
  ArrowLeft,
  Mail,
  Phone,
  FileText,
  LifeBuoy,
  Check,
  Plus,
  Video,
  Paperclip,
  X,
  AlertTriangle,
  Download,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  claimHelpTicket,
  forwardHelpTicketToHeadHr,
  listHelpTickets,
  resolveHelpTicket,
  sendHelpMessage,
  type HelpTicketDto,
} from '@/app/actions/helpDeskActions';
import { useHrmRole } from '@/lib/useHrmRole';

function getInitials(name: string) {
  if (!name?.trim()) return '??';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

interface TicketMessage {
  id: string;
  sender: 'CANDIDATE' | 'HR_AGENT';
  senderName: string;
  text: string;
  timestamp: string;
  type?: 'TEXT' | 'JITSI_CALL' | 'DOCUMENT';
  callRoomUrl?: string;
  callRoomName?: string;
  isHostJoined?: boolean;
  fileName?: string;
  fileUrl?: string;
}

interface HelpTicket {
  id: string;
  ticketNumber: string;
  category: string;
  categoryLabel: string;
  subject: string;
  message: string;
  status: 'OPEN' | 'CLAIMED' | 'IN_PROGRESS' | 'RESOLVED' | 'ESCALATED_HEAD_HR';
  createdAt: string;
  assignedHrAgent?: string;
  claimedByUserId?: string | null;
  candidateName: string;
  candidateEmail: string;
  candidatePhone: string;
  messages: TicketMessage[];
}

export default function HrHelpTicketsPage() {
  const { role } = useHrmRole();
  const [tickets, setTickets] = useState<HelpTicket[]>([]);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [replyInput, setReplyInput] = useState('');
  const [confirmingResolveTicketId, setConfirmingResolveTicketId] = useState<string | null>(null);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);

  // iMessage / Discord '+' Media Attachment Drawer State
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const [pendingCallRoom, setPendingCallRoom] = useState<{ roomName: string; roomUrl: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const mapDto = (t: HelpTicketDto): HelpTicket => ({
    id: t.id,
    ticketNumber: t.ticketNumber,
    category: t.category,
    categoryLabel: t.categoryLabel,
    subject: t.subject,
    message: t.message,
    status: (t.status === 'CLOSED' ? 'RESOLVED' : t.status) as HelpTicket['status'],
    createdAt: t.createdAt,
    assignedHrAgent: t.assignedHrAgent,
    claimedByUserId: t.claimedByUserId,
    candidateName: t.candidateName,
    candidateEmail: t.candidateEmail,
    candidatePhone: t.candidatePhone,
    messages: t.messages.map((m) => ({
      id: m.id,
      sender: m.sender === 'CANDIDATE' ? 'CANDIDATE' : 'HR_AGENT',
      senderName: m.senderName,
      text: m.text,
      timestamp: m.timestamp,
      type: m.type,
      callRoomUrl: m.callRoomUrl,
      callRoomName: m.callRoomName,
      isHostJoined: m.isHostJoined,
      fileName: m.fileName,
      fileUrl: m.fileUrl,
    })),
  });

  useEffect(() => {
    const loadTickets = (force = false) => {
      void (async () => {
        const { CACHE_KEYS, cachedFetch, getCachedStale } = await import(
          '@/lib/clientDataCache'
        );

        if (!force) {
          const stale = getCachedStale<Awaited<ReturnType<typeof listHelpTickets>>>(
            CACHE_KEYS.helpTicketsActive
          );
          if (stale?.value?.success && stale.value.data) {
            const mapped = stale.value.data.map(mapDto);
            setTickets(mapped);
            setLoadState('ready');
            setLoadError(null);
            if (mapped.length > 0) {
              setSelectedTicketId((prev) =>
                prev && mapped.some((t) => t.id === prev) ? prev : mapped[0].id
              );
            } else {
              setSelectedTicketId(null);
            }
            if (stale.fresh) return;
          }
        }

        const res = await cachedFetch(
          CACHE_KEYS.helpTicketsActive,
          () => listHelpTickets({ activeOnly: true }),
          { ttlMs: 30_000, force }
        );
        if (!res.success) {
          setLoadState('error');
          setLoadError(res.error || 'Failed to load help tickets from the database.');
          setTickets([]);
          setSelectedTicketId(null);
          return;
        }
        const mapped = res.data.map(mapDto);
        setTickets(mapped);
        setLoadState('ready');
        setLoadError(null);
        if (mapped.length > 0) {
          setSelectedTicketId((prev) =>
            prev && mapped.some((t) => t.id === prev) ? prev : mapped[0].id
          );
        } else {
          setSelectedTicketId(null);
        }
      })();
    };

    loadTickets(true);
    const onSync = () => {
      void import('@/lib/clientDataCache').then(({ CACHE_KEYS, invalidateCache }) => {
        invalidateCache(CACHE_KEYS.helpTicketsActive);
        loadTickets(true);
      });
    };
    const onFocus = () => {
      void import('@/lib/clientDataCache').then(({ CACHE_KEYS, getCachedStale }) => {
        const hit = getCachedStale(CACHE_KEYS.helpTicketsActive);
        if (!hit?.fresh) loadTickets(true);
      });
    };
    window.addEventListener('rbt_progress_synced', onSync);
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener('rbt_progress_synced', onSync);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  const selectedTicket = tickets.find(t => t.id === selectedTicketId) || tickets[0];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [selectedTicketId, selectedTicket?.messages?.length]);

  const saveAndSyncTickets = (updated: HelpTicket[]) => {
    setTickets(updated);
    window.dispatchEvent(new Event('rbt_progress_synced'));
  };

  const handleClaimTicket = async (ticketId: string) => {
    const res = await claimHelpTicket(ticketId);
    if (!res.success || !res.ticket) {
      toast.error(res.error || 'Failed to claim ticket');
      return;
    }
    const mapped = mapDto(res.ticket);
    saveAndSyncTickets(tickets.map((t) => (t.id === mapped.id ? mapped : t)));
    toast.success('Ticket claimed! You can now message the candidate live.');
  };

  const handleForwardToHeadHr = async (ticketId: string) => {
    const res = await forwardHelpTicketToHeadHr(ticketId);
    if (!res.success || !res.ticket) {
      toast.error(res.error || 'Failed to forward ticket');
      return;
    }
    const updated = tickets.filter((t) => t.id !== ticketId);
    saveAndSyncTickets(updated);
    if (selectedTicketId === ticketId) {
      setSelectedTicketId(updated.length > 0 ? updated[0].id : null);
    }
    toast.success('Ticket forwarded to Head HR for executive review!');
  };

  const handleResolveTicket = async (ticketId: string) => {
    const res = await resolveHelpTicket(ticketId);
    if (!res.success) {
      toast.error(res.error || 'Failed to resolve ticket');
      return;
    }
    const updated = tickets.filter((t) => t.id !== ticketId);
    saveAndSyncTickets(updated);
    if (selectedTicketId === ticketId) {
      setSelectedTicketId(updated.length > 0 ? updated[0].id : null);
    }
    toast.success('Ticket resolved! Candidate moved back on the ATS board.');
  };

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyInput.trim() || !selectedTicket) return;

    const res = await sendHelpMessage(selectedTicket.id, {
      text: replyInput.trim(),
      type: 'TEXT',
      senderSide: 'HR',
      senderName: selectedTicket.assignedHrAgent || 'HR Agent',
    });
    if (!res.success || !res.ticket) {
      toast.error(res.error || 'Failed to send message');
      return;
    }
    const mapped = mapDto(res.ticket);
    saveAndSyncTickets(tickets.map((t) => (t.id === mapped.id ? mapped : t)));
    setReplyInput('');
  };

  const launchJitsiMeetingWindow = (roomUrl: string) => {
    const isMobile = typeof window !== 'undefined' && (
      window.innerWidth < 768 || 
      /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
    );

    if (isMobile) {
      // Mobile browsers: Open directly in new tab or native Jitsi app
      window.open(roomUrl, '_blank');
    } else {
      // Desktop / Laptop: Open in clean centered 1280x800 popup window
      const width = 1280;
      const height = 800;
      const left = typeof window !== 'undefined' ? (window.screen.width - width) / 2 : 100;
      const top = typeof window !== 'undefined' ? (window.screen.height - height) / 2 : 100;
      window.open(
        roomUrl,
        'JitsiMeetingWindow',
        `width=${width},height=${height},top=${top},left=${left},scrollbars=yes,resizable=yes,status=no,toolbar=no,menubar=no`
      );
    }
  };

  // STEP 1: HR selects '📞 Instant Jitsi Call' from '+' drawer
  const handleInitiateJitsiCall = () => {
    setShowPlusMenu(false);
    if (!selectedTicket) return;

    const roomName = `RiseAndShine_LiveCall_${selectedTicket.ticketNumber}_${Date.now().toString().slice(-4)}`;
    const roomUrl = `https://meet.jit.si/${roomName}`;

    setPendingCallRoom({ roomName, roomUrl });
    toast.info('📞 Instant call created! Click "Join as Host First" to unlock the call for the candidate.');
  };

  // STEP 2: HR joins as host -> unlocks call card & posts to candidate chat
  const handleHostJoinAndDispatchCall = async () => {
    if (!pendingCallRoom || !selectedTicket) return;

    launchJitsiMeetingWindow(pendingCallRoom.roomUrl);

    const res = await sendHelpMessage(selectedTicket.id, {
      text: 'HR Recruiter started a live video/voice call. Click below to join instant session!',
      type: 'JITSI_CALL',
      senderSide: 'HR',
      senderName: selectedTicket.assignedHrAgent || 'HR Agent',
      callRoomUrl: pendingCallRoom.roomUrl,
      callRoomName: pendingCallRoom.roomName,
      isHostJoined: true,
    });
    if (!res.success || !res.ticket) {
      toast.error(res.error || 'Failed to dispatch call invite');
      return;
    }
    saveAndSyncTickets(tickets.map((t) => (t.id === res.ticket!.id ? mapDto(res.ticket!) : t)));
    setPendingCallRoom(null);
    toast.success('Host connected! Live Call Invite dispatched to candidate.');
  };

  // Document/PDF Upload Attachment Handler
  const handleDocumentUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setShowPlusMenu(false);
    const file = e.target.files?.[0];
    if (!file || !selectedTicket) return;

    const res = await sendHelpMessage(selectedTicket.id, {
      text: `Attached Document: ${file.name}`,
      type: 'DOCUMENT',
      senderSide: 'HR',
      senderName: selectedTicket.assignedHrAgent || 'HR Agent',
      fileName: file.name,
      fileUrl: '#',
    });
    if (!res.success || !res.ticket) {
      toast.error(res.error || 'Failed to attach document');
      return;
    }
    saveAndSyncTickets(tickets.map((t) => (t.id === res.ticket!.id ? mapDto(res.ticket!) : t)));
    toast.success(`Attached ${file.name} to chat thread!`);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 select-none animate-fade-in text-white pb-16 relative">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_rgba(249,115,22,0.12),_transparent_55%)]" />

      {/* TOP NAVIGATION BAR */}
      <div className="flex items-center justify-between border-b border-white/10 pb-4">
        <Link
          href="/ats"
          className="inline-flex items-center gap-2 text-xs font-bold text-zinc-400 hover:text-brand-orange-400 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" /> Back to ATS Candidate Pipeline
        </Link>
        <span className="text-xs font-mono font-bold text-brand-orange-400 bg-brand-orange-500/10 px-3 py-1 rounded-full border border-brand-orange-500/20">
          Prisma · AtsHelpTicket
        </span>
      </div>

      {/* HEADER BANNER */}
      <div className="bg-zinc-950/80 backdrop-blur-xl p-6 sm:p-8 rounded-3xl border border-white/10 shadow-2xl flex flex-col md:flex-row md:items-center justify-between gap-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(244,63,94,0.12),transparent_45%)] pointer-events-none" />
        <div className="flex items-center gap-4 relative z-10">
          <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-400 flex items-center justify-center font-bold shadow-lg shrink-0">
            <MessageSquare className="w-7 h-7" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl sm:text-3xl font-black font-heading text-white tracking-tight">
                HR Candidate Help Ticket Messenger
              </h1>
              <span className="bg-rose-500/10 text-rose-400 border border-rose-500/20 text-[10px] font-mono font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider inline-flex items-center gap-1.5">
                <span className="dot-live w-1.5 h-1.5 rounded-full bg-rose-400" />
                Live queue
              </span>
            </div>
            <p className="text-xs text-zinc-400 font-medium mt-1">
              Real DB tickets only — claim, chat, host Jitsi, resolve. No demo seed in LIVE.
            </p>
          </div>
        </div>
      </div>

      {/* MAIN MESSENGER CONTAINER */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* TICKETS DRAWER SIDEBAR */}
        <div className="bg-zinc-950/80 backdrop-blur-xl border border-white/10 rounded-3xl p-5 space-y-4 shadow-2xl h-fit">
          {(() => {
            const claimedTickets = tickets.filter(
              (t) => t.status !== 'RESOLVED' && (t.status as string) !== 'CLOSED'
            );
            return (
              <>
                <h3 className="text-sm font-black font-heading text-white uppercase tracking-wider flex items-center gap-2 border-b border-white/10 pb-3">
                  <LifeBuoy className="w-4 h-4 text-brand-orange-400" /> Active Tickets Queue ({claimedTickets.length})
                </h3>

                {loadState === 'loading' ? (
                  <div className="p-8 text-center text-zinc-400 font-mono text-xs border border-dashed border-white/10 rounded-2xl flex flex-col items-center gap-2">
                    <Loader2 className="w-5 h-5 animate-spin text-brand-orange-400" />
                    Loading tickets from database…
                  </div>
                ) : loadState === 'error' ? (
                  <div className="p-6 text-center space-y-2 border border-dashed border-rose-500/30 bg-rose-500/5 rounded-2xl">
                    <AlertTriangle className="w-6 h-6 text-rose-400 mx-auto" />
                    <p className="text-xs font-bold text-rose-300">Could not load tickets</p>
                    <p className="text-[11px] font-mono text-zinc-500">{loadError}</p>
                  </div>
                ) : claimedTickets.length === 0 ? (
                  <div className="p-8 text-center space-y-2 border border-dashed border-white/10 rounded-2xl bg-zinc-900/40">
                    <LifeBuoy className="w-8 h-8 text-zinc-600 mx-auto" />
                    <p className="text-xs font-bold text-zinc-300">No active help tickets</p>
                    <p className="text-[11px] font-mono text-zinc-500 leading-relaxed">
                      All tickets resolved or cleared!
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {claimedTickets.map((t) => {
                      const isSelected = selectedTicket?.id === t.id;
                      return (
                        <div
                          key={t.id}
                          onClick={() => setSelectedTicketId(t.id)}
                          className={`p-4 rounded-2xl border transition-all duration-300 cursor-pointer space-y-2 hover:scale-[1.01] hover:shadow-2xl ${
                            isSelected
                              ? 'bg-brand-orange-500/15 border-brand-orange-500/60 shadow-lg'
                              : 'bg-zinc-900/80 border-white/5 hover:border-brand-orange-500/40'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-mono text-[10px] font-black text-brand-orange-400">
                              #{t.ticketNumber}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded-full text-[9px] font-mono font-black uppercase border ${
                                t.status === 'RESOLVED'
                                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                  : 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                              }`}
                            >
                              {t.status === 'RESOLVED' ? '✓ RESOLVED' : '🛠️ CLAIMED BY YOU'}
                            </span>
                          </div>

                          <h4 className="font-extrabold text-xs text-white line-clamp-1">
                            {t.candidateName} — {t.subject}
                          </h4>

                          <p className="text-[11px] text-zinc-400 font-mono line-clamp-2 italic">
                            &quot;{t.message}&quot;
                          </p>

                          <div className="flex items-center justify-between text-[10px] font-mono text-zinc-500 pt-1 border-t border-white/5">
                            <span>{t.candidateName}</span>
                            <span>{t.createdAt}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            );
          })()}
        </div>

        {/* LIVE DISCORD/IMESSAGE MESSENGER CHAT THREAD */}
        <div className="lg:col-span-2 bg-zinc-950/80 backdrop-blur-xl border border-white/10 rounded-3xl shadow-2xl flex flex-col overflow-hidden min-h-[580px] relative">
          {selectedTicket ? (
            <>
              {/* CHAT HEADER */}
              <div className="p-5 border-b border-white/10 bg-zinc-900/80 backdrop-blur-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-black text-brand-orange-400 bg-brand-orange-500/10 border border-brand-orange-500/20 px-2.5 py-0.5 rounded-full">
                      {selectedTicket.ticketNumber}
                    </span>
                    <h3 className="font-black text-white text-base font-heading">
                      {selectedTicket.candidateName}
                    </h3>
                  </div>
                  <p className="text-xs text-zinc-400 font-mono flex items-center gap-3">
                    <span className="flex items-center gap-1"><Mail className="w-3.5 h-3.5 text-zinc-500" /> {selectedTicket.candidateEmail}</span>
                    <span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5 text-zinc-500" /> {selectedTicket.candidatePhone}</span>
                  </p>
                </div>

                <div className="flex items-center gap-2 self-start sm:self-auto">
                  {!(selectedTicket.status === 'CLAIMED' || selectedTicket.status === 'IN_PROGRESS' || !!selectedTicket.claimedByUserId) && selectedTicket.status !== 'RESOLVED' ? (
                    <button
                      onClick={() => handleClaimTicket(selectedTicket.id)}
                      className="bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-xs px-4 py-2 rounded-xl shadow-md cursor-pointer transition-all flex items-center gap-1.5"
                    >
                      <UserCheck className="w-3.5 h-3.5 text-black" />
                      <span>Claim Ticket</span>
                    </button>
                  ) : selectedTicket.status !== 'RESOLVED' ? (
                    <span className="bg-blue-500/10 text-blue-400 border border-blue-500/20 text-xs font-mono font-bold px-3 py-1.5 rounded-xl flex items-center gap-1.5">
                      <UserCheck className="w-3.5 h-3.5 text-blue-400" />
                      <span>Claimed by You</span>
                    </span>
                  ) : null}

                  {role === 'HR_AGENT' && selectedTicket.status !== 'ESCALATED_HEAD_HR' && selectedTicket.status !== 'RESOLVED' && (
                    <button
                      type="button"
                      onClick={() => handleForwardToHeadHr(selectedTicket.id)}
                      className="bg-purple-600 hover:bg-purple-500 text-white font-extrabold text-xs px-3.5 py-2 rounded-xl shadow-md cursor-pointer transition-all flex items-center gap-1.5"
                    >
                      <span>⏩ Forward to Head HR</span>
                    </button>
                  )}

                  {selectedTicket.status !== 'RESOLVED' ? (
                    confirmingResolveTicketId === selectedTicket.id ? (
                      <div className="flex items-center gap-2 bg-zinc-900 border border-emerald-500/40 p-1.5 rounded-2xl shadow-xl animate-in fade-in zoom-in-95">
                        <span className="text-[11px] font-mono font-bold text-amber-300 px-1.5 flex items-center gap-1">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                          Are you sure?
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            handleResolveTicket(selectedTicket.id);
                            setConfirmingResolveTicketId(null);
                          }}
                          className="bg-emerald-500 hover:bg-emerald-400 text-black font-black text-xs px-3 py-1.5 rounded-xl shadow-md cursor-pointer transition-all flex items-center gap-1"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Yes, Resolve</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmingResolveTicketId(null)}
                          className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold text-xs px-3 py-1.5 rounded-xl cursor-pointer transition-all"
                        >
                          <span>No, Cancel</span>
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmingResolveTicketId(selectedTicket.id)}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs px-4 py-2 rounded-xl shadow-md cursor-pointer transition-all flex items-center gap-1.5"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Resolve &amp; Close Ticket</span>
                      </button>
                    )
                  ) : (
                    <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-mono font-bold px-3 py-1 rounded-full">
                      ✓ RESOLVED
                    </span>
                  )}
                </div>
              </div>


              {/* TICKET SUBJECT BOX */}
              <div className="p-4 bg-zinc-900/60 border-b border-white/5 space-y-1">
                <span className="text-[10px] font-mono font-bold text-zinc-400 uppercase tracking-wider block">Ticket Subject &amp; Details:</span>
                <p className="text-xs font-extrabold text-white">{selectedTicket.subject}</p>
                <p className="text-xs text-zinc-300 font-mono leading-relaxed">{selectedTicket.message}</p>
              </div>

              {/* LIVE CONVERSATION MESSAGES (DISCORD/IMESSAGE STYLED) */}
              <div className="flex-1 p-6 space-y-4 overflow-y-auto bg-zinc-950/60 max-h-[380px]">
                {selectedTicket.messages.length === 0 ? (
                  <div className="h-full min-h-[160px] flex flex-col items-center justify-center text-center gap-2 text-zinc-500">
                    <MessageSquare className="w-8 h-8 text-zinc-700" />
                    <p className="text-xs font-bold text-zinc-400">No messages yet</p>
                    <p className="text-[11px] font-mono max-w-xs">
                      Claim the ticket or reply below to start the thread.
                    </p>
                  </div>
                ) : null}
                {selectedTicket.messages.map((msg) => {
                  const isHr = msg.sender !== 'CANDIDATE';

                  return (
                    <div
                      key={msg.id}
                      className={`flex gap-3 max-w-[88%] ${isHr ? 'ml-auto flex-row-reverse' : 'mr-auto'}`}
                    >
                      <div className={`w-8 h-8 rounded-2xl flex items-center justify-center font-bold text-xs shrink-0 shadow-md ${
                        isHr ? 'bg-brand-orange-500 text-white' : 'bg-zinc-800 text-zinc-300 border border-white/10'
                      }`}>
                        {isHr ? getInitials(msg.senderName || 'HR') : getInitials(msg.senderName || selectedTicket.candidateName)}
                      </div>

                      <div className={`p-4 rounded-2xl space-y-2 text-xs shadow-md backdrop-blur-xl ${
                        isHr
                          ? 'bg-brand-orange-500/90 text-white rounded-tr-none border border-brand-orange-400/30'
                          : 'bg-zinc-900/80 text-zinc-200 border border-white/10 rounded-tl-none'
                      }`}>
                        <div className="flex items-center justify-between gap-4 border-b border-white/20 pb-1 mb-1">
                          <span className="font-extrabold text-[11px]">{msg.senderName}</span>
                          <span className="font-mono text-[9px] opacity-80">{msg.timestamp}</span>
                        </div>

                        {/* RENDER TYPE: JITSI CALL INVITE BUBBLE */}
                        {msg.type === 'JITSI_CALL' ? (
                          <div className="p-3.5 bg-black/40 rounded-xl border border-white/20 space-y-2.5">
                            <div className="flex items-center gap-2">
                              <span className={`w-2.5 h-2.5 rounded-full ${msg.isHostJoined ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400 animate-pulse'}`} />
                              <span className={`font-black text-xs uppercase tracking-wider flex items-center gap-1 ${msg.isHostJoined ? 'text-emerald-300' : 'text-amber-300'}`}>
                                <Video className="w-4 h-4" /> {msg.isHostJoined ? 'Live Instant Jitsi Video Call' : 'Candidate Requested Live Call'}
                              </span>
                            </div>
                            <p className="text-xs opacity-90 leading-relaxed font-medium">{msg.text}</p>
                            {msg.isHostJoined ? (
                              <button
                                onClick={() => {
                                  if (msg.callRoomUrl) {
                                    const returnUrl = typeof window !== 'undefined' ? `${window.location.origin}/ats/help-tickets` : '';
                                    const easyUrl = `${msg.callRoomUrl}#config.prejoinPageEnabled=false&config.requireDisplayName=false&config.leaveRedirectUrl=${encodeURIComponent(returnUrl)}`;
                                    launchJitsiMeetingWindow(easyUrl);
                                  }
                                }}
                                className="w-full bg-emerald-500 hover:bg-emerald-400 text-black font-black text-xs py-2.5 rounded-xl shadow-lg transition-all cursor-pointer flex items-center justify-center gap-2"
                              >
                                <Video className="w-4 h-4 text-black" />
                                <span>🎥 Open Live Video Call Room →</span>
                              </button>
                            ) : (
                              <button
                                onClick={async () => {
                                  const { updateHelpMessageMeta } = await import('@/app/actions/helpDeskActions');
                                  const res = await updateHelpMessageMeta(msg.id, { isHostJoined: true });
                                  if (res.success && res.ticket) {
                                    saveAndSyncTickets(
                                      tickets.map((t) => (t.id === res.ticket!.id ? mapDto(res.ticket!) : t))
                                    );
                                  } else {
                                    const updated = tickets.map((t) => ({
                                      ...t,
                                      messages: (t.messages || []).map((m) =>
                                        m.id === msg.id ? { ...m, isHostJoined: true } : m
                                      ),
                                    }));
                                    saveAndSyncTickets(updated);
                                  }

                                  if (msg.callRoomUrl) {
                                    const returnUrl =
                                      typeof window !== 'undefined'
                                        ? `${window.location.origin}/ats/help-tickets`
                                        : '';
                                    const easyUrl = `${msg.callRoomUrl}#config.prejoinPageEnabled=false&config.requireDisplayName=false&config.leaveRedirectUrl=${encodeURIComponent(returnUrl)}`;
                                    launchJitsiMeetingWindow(easyUrl);
                                  }
                                  toast.success('You joined as Host! Candidate can now connect to the video call.');
                                }}
                                className="w-full bg-amber-500 hover:bg-amber-400 text-black font-black text-xs py-2.5 rounded-xl shadow-lg transition-all cursor-pointer flex items-center justify-center gap-2"
                              >
                                <Video className="w-4 h-4 text-black" />
                                <span>👑 Accept Call &amp; Start Session as Host →</span>
                              </button>
                            )}
                          </div>
                        ) : msg.type === 'DOCUMENT' ? (
                          /* RENDER TYPE: DOCUMENT/PDF ATTACHMENT BUBBLE */
                          <div className="p-3 bg-black/30 rounded-xl border border-white/10 flex items-center justify-between gap-3 font-mono text-xs">
                            <div className="flex items-center gap-2">
                              <FileText className="w-4 h-4 text-brand-orange-300" />
                              <span className="font-bold truncate max-w-[180px]">{msg.fileName}</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                if (msg.fileUrl && msg.fileUrl !== '#') {
                                  window.open(msg.fileUrl, '_blank');
                                } else {
                                  toast.message('Document preview unavailable for this attachment.');
                                }
                              }}
                              className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white cursor-pointer"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          /* RENDER TYPE: REGULAR TEXT BUBBLE */
                          <p className="leading-relaxed font-medium">{msg.text}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* HOST-LOCKED CALL PREVIEW BOX ABOVE INPUT BAR */}
              {pendingCallRoom && (
                <div className="p-3 bg-amber-500/10 border-t border-b border-amber-500/30 flex items-center justify-between gap-3 text-xs font-mono">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />
                    <span className="text-amber-300 font-bold">👑 Host Lock Required:</span>
                    <span className="text-zinc-300">Join call first before candidate invite is dispatched.</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleHostJoinAndDispatchCall}
                      className="bg-amber-500 hover:bg-amber-400 text-black font-black text-xs px-3.5 py-1.5 rounded-xl shadow cursor-pointer transition-all flex items-center gap-1.5"
                    >
                      <Video className="w-3.5 h-3.5" />
                      <span>👑 Join as Host First →</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingCallRoom(null)}
                      className="text-zinc-400 hover:text-white p-1 cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* CHAT REPLY INPUT FORM WITH '+' MEDIA ATTACHMENT DRAWER */}
              <form onSubmit={handleSendReply} className="p-4 border-t border-white/10 bg-zinc-900 flex items-center gap-3 relative">
                {/* '+' MEDIA DRAWER TOGGLE BUTTON */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowPlusMenu(!showPlusMenu)}
                    className={`w-10 h-10 rounded-2xl border flex items-center justify-center transition-all cursor-pointer shadow-md ${
                      showPlusMenu
                        ? 'bg-brand-orange-500 text-white border-brand-orange-400 rotate-45'
                        : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border-white/10 hover:text-white'
                    }`}
                    title="Add Media / Start Call"
                  >
                    <Plus className="w-5 h-5 transition-transform" />
                  </button>

                  {/* '+' MEDIA POPOVER DRAWER */}
                  {showPlusMenu && (
                    <div className="absolute bottom-14 left-0 bg-zinc-950 border border-white/15 rounded-2xl p-2.5 shadow-2xl space-y-1.5 w-60 z-50 animate-scale-up backdrop-blur-2xl">
                      <button
                        type="button"
                        onClick={handleInitiateJitsiCall}
                        className="w-full p-2.5 rounded-xl bg-zinc-900 hover:bg-brand-orange-500/20 text-white font-extrabold text-xs flex items-center gap-2.5 transition-all text-left border border-white/5 hover:border-brand-orange-500/30 cursor-pointer"
                      >
                        <div className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                          <Video className="w-4 h-4" />
                        </div>
                        <div>
                          <span className="block text-white">📞 Instant Jitsi Call</span>
                          <span className="text-[10px] text-zinc-400 font-mono">Create host-locked call</span>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full p-2.5 rounded-xl bg-zinc-900 hover:bg-brand-orange-500/20 text-white font-extrabold text-xs flex items-center gap-2.5 transition-all text-left border border-white/5 hover:border-brand-orange-500/30 cursor-pointer"
                      >
                        <div className="w-7 h-7 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center">
                          <Paperclip className="w-4 h-4" />
                        </div>
                        <div>
                          <span className="block text-white">📄 Upload PDF / File</span>
                          <span className="text-[10px] text-zinc-400 font-mono">Attach document to chat</span>
                        </div>
                      </button>
                      <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleDocumentUpload}
                        accept="application/pdf,image/*"
                        className="hidden"
                      />
                    </div>
                  )}
                </div>

                {/* TEXT INPUT FIELD */}
                <input
                  type="text"
                  value={replyInput}
                  onChange={(e) => setReplyInput(e.target.value)}
                  placeholder={`Type message to ${selectedTicket.candidateName}...`}
                  className="flex-1 bg-zinc-950 border border-white/10 rounded-2xl px-4 py-3 text-xs text-white placeholder-zinc-500 outline-none focus:border-brand-orange-500 font-medium"
                />

                <button
                  type="submit"
                  disabled={!replyInput.trim()}
                  className="bg-brand-orange-500 hover:bg-orange-600 disabled:opacity-40 disabled:hover:bg-brand-orange-500 text-white font-black text-xs px-5 py-3 rounded-2xl shadow-lg transition-all cursor-pointer disabled:cursor-not-allowed flex items-center gap-1.5 shrink-0"
                >
                  <Send className="w-4 h-4" />
                  <span>Send</span>
                </button>
              </form>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-3 text-zinc-500">
              <LifeBuoy className="w-12 h-12 text-zinc-700" />
              <h4 className="font-black text-white text-sm">
                {loadState === 'loading'
                  ? 'Loading queue…'
                  : loadState === 'error'
                    ? 'Tickets unavailable'
                    : 'No active tickets'}
              </h4>
              <p className="text-xs text-zinc-400 max-w-sm font-mono leading-relaxed">
                {loadState === 'error'
                  ? loadError || 'Database load failed.'
                  : 'When a candidate submits a ticket from /rbt/help-desk, it appears here for claim and reply.'}
              </p>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
