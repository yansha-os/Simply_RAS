'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { 
  MessageSquare, 
  UserCheck, 
  CheckCircle2, 
  ShieldCheck, 
  Send, 
  Clock, 
  ArrowLeft, 
  User, 
  Mail, 
  Phone, 
  FileText, 
  LifeBuoy,
  Check,
  Plus,
  Video,
  Paperclip,
  X,
  Minimize2,
  Maximize2,
  ExternalLink,
  AlertTriangle,
  Sparkles,
  Download
} from 'lucide-react';
import { toast } from 'sonner';

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
  status: 'OPEN' | 'CLAIMED' | 'IN_PROGRESS' | 'RESOLVED';
  createdAt: string;
  assignedHrAgent?: string;
  candidateName: string;
  candidateEmail: string;
  candidatePhone: string;
  messages: TicketMessage[];
}

export default function HrHelpTicketsPage() {
  const [tickets, setTickets] = useState<HelpTicket[]>([]);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [replyInput, setReplyInput] = useState('');
  const [confirmingResolveTicketId, setConfirmingResolveTicketId] = useState<string | null>(null);

  // iMessage / Discord '+' Media Attachment Drawer State
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const [pendingCallRoom, setPendingCallRoom] = useState<{ roomName: string; roomUrl: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const loadTickets = () => {
      try {
        const saved = JSON.parse(localStorage.getItem('ras_rbt_help_tickets') || '[]');
        let candidateName = 'azm karim';
        let candidateEmail = 'adawdzkarim05@gmail.com';
        let candidatePhone = '(929) 501-1117';

        const storedApp = localStorage.getItem('ras_submitted_app_c1') || localStorage.getItem('ras_latest_submitted_app');
        if (storedApp) {
          const parsed = JSON.parse(storedApp);
          if (parsed.fullName) candidateName = parsed.fullName;
          else if (parsed.name) candidateName = parsed.name;
          if (parsed.email) candidateEmail = parsed.email;
          if (parsed.phoneNumber || parsed.phone) candidatePhone = parsed.phoneNumber || parsed.phone;
        }

        if (Array.isArray(saved) && saved.length > 0) {
          const activeOnly = saved.filter((t: any) => t.status !== 'RESOLVED');
          if (activeOnly.length !== saved.length) {
            localStorage.setItem('ras_rbt_help_tickets', JSON.stringify(activeOnly));
          }

          const formatted = activeOnly.map((t: any) => ({
            ...t,
            candidateName: (!t.candidateName || t.candidateName.includes('Jane')) ? candidateName : t.candidateName,
            candidateEmail: t.candidateEmail || candidateEmail,
            candidatePhone: t.candidatePhone || candidatePhone,
            messages: (t.messages || []).map((m: any) => ({
              ...m,
              senderName: m.sender === 'CANDIDATE' && (!m.senderName || m.senderName.includes('Jane')) ? candidateName : m.senderName,
            })),
          }));
          setTickets(formatted);
          if (formatted.length > 0) {
            if (!selectedTicketId || !formatted.some(t => t.id === selectedTicketId)) {
              setSelectedTicketId(formatted[0].id);
            }
          } else {
            setSelectedTicketId(null);
          }
        } else {
          const latestTicket = localStorage.getItem('ras_latest_help_ticket');
          if (latestTicket) {
            try {
              const parsed = JSON.parse(latestTicket);
              const defaultTicket: HelpTicket = {
                id: parsed.ticketId || 't-active',
                ticketNumber: 'TICK-4819',
                category: parsed.category || 'GENERAL_QUESTION',
                categoryLabel: 'Onboarding & Support Request',
                subject: parsed.subject || 'Candidate Onboarding Assistance Request',
                message: parsed.message || 'Applicant requested assistance from HR Recruiter.',
                status: 'OPEN',
                createdAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' }),
                candidateName,
                candidateEmail,
                candidatePhone,
                messages: [
                  {
                    id: 'm-1',
                    sender: 'CANDIDATE',
                    senderName: candidateName,
                    text: parsed.message || 'Applicant requested assistance from HR Recruiter.',
                    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    type: 'TEXT'
                  }
                ]
              };
              setTickets([defaultTicket]);
              setSelectedTicketId(defaultTicket.id);
            } catch (e) {}
          } else {
            setTickets([]);
          }
        }
      } catch (e) {}
    };

    loadTickets();
    window.addEventListener('storage', loadTickets);
    return () => window.removeEventListener('storage', loadTickets);
  }, []);

  const selectedTicket = tickets.find(t => t.id === selectedTicketId) || tickets[0];

  // Helper to save tickets to localStorage and dispatch sync event
  const saveAndSyncTickets = (updated: HelpTicket[]) => {
    setTickets(updated);
    localStorage.setItem('ras_rbt_help_tickets', JSON.stringify(updated));
    window.dispatchEvent(new Event('storage'));
  };

  const handleClaimTicket = (ticketId: string) => {
    const updated = tickets.map(t => {
      if (t.id === ticketId) {
        const claimMessage: TicketMessage = {
          id: `m-${Date.now()}`,
          sender: 'HR_AGENT',
          senderName: 'Marcus Vance (HR Recruiter)',
          text: 'Hello! I have claimed your help ticket and am reviewing your onboarding file now. How can I assist you?',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          type: 'TEXT'
        };
        return {
          ...t,
          status: 'CLAIMED' as const,
          assignedHrAgent: 'Marcus Vance (HR Recruiter)',
          messages: [...t.messages, claimMessage]
        };
      }
      return t;
    });

    saveAndSyncTickets(updated);
    toast.success('✋ Ticket claimed! You can now message the candidate live.');
  };

  const handleResolveTicket = (ticketId: string) => {
    const updated = tickets.filter(t => t.id !== ticketId);

    saveAndSyncTickets(updated);

    if (selectedTicketId === ticketId) {
      setSelectedTicketId(updated.length > 0 ? updated[0].id : null);
    }

    try {
      const customStages = JSON.parse(localStorage.getItem('ras_ats_custom_stages') || '{}');
      const payload = { stage: 'PHONE_SCREEN', activationStatus: 'INVITATION_SENT' };
      customStages['c1'] = payload;
      customStages['cand-1'] = payload;
      customStages['usr-applicant-1'] = payload;
      localStorage.setItem('ras_ats_custom_stages', JSON.stringify(customStages));
      localStorage.removeItem('ras_latest_help_ticket');
      window.dispatchEvent(new Event('storage'));
    } catch (e) {}

    toast.success('✓ Ticket resolved & deleted! Candidate moved back to "In Progress" column on ATS board.');
  };

  const handleSendReply = (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyInput.trim() || !selectedTicket) return;

    const newMsg: TicketMessage = {
      id: `m-${Date.now()}`,
      sender: 'HR_AGENT',
      senderName: 'Marcus Vance (HR Recruiter)',
      text: replyInput.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      type: 'TEXT'
    };

    const updated = tickets.map(t => {
      if (t.id === selectedTicket.id) {
        return {
          ...t,
          status: 'CLAIMED' as const,
          assignedHrAgent: 'Marcus Vance (HR Recruiter)',
          messages: [...t.messages, newMsg]
        };
      }
      return t;
    });

    saveAndSyncTickets(updated);
    setReplyInput('');
    toast.success('Message sent!');
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
  const handleHostJoinAndDispatchCall = () => {
    if (!pendingCallRoom || !selectedTicket) return;

    // Launch standalone window for HR Host (bypasses 5-min iframe limit)
    launchJitsiMeetingWindow(pendingCallRoom.roomUrl);

    // Create host-verified Jitsi call invite message bubble
    const callMsg: TicketMessage = {
      id: `m-${Date.now()}`,
      sender: 'HR_AGENT',
      senderName: 'Marcus Vance (HR Recruiter)',
      text: '📞 HR Recruiter Marcus Vance started a live video/voice call. Click below to join instant session!',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      type: 'JITSI_CALL',
      callRoomUrl: pendingCallRoom.roomUrl,
      callRoomName: pendingCallRoom.roomName,
      isHostJoined: true
    };

    const updated = tickets.map(t => {
      if (t.id === selectedTicket.id) {
        return {
          ...t,
          status: 'CLAIMED' as const,
          assignedHrAgent: 'Marcus Vance (HR Recruiter)',
          messages: [...t.messages, callMsg]
        };
      }
      return t;
    });

    saveAndSyncTickets(updated);
    setPendingCallRoom(null);
    toast.success('👑 Host connected! Live Call Invite dispatched to candidate.');
  };

  // Document/PDF Upload Attachment Handler
  const handleDocumentUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    setShowPlusMenu(false);
    const file = e.target.files?.[0];
    if (!file || !selectedTicket) return;

    const fileMsg: TicketMessage = {
      id: `m-${Date.now()}`,
      sender: 'HR_AGENT',
      senderName: 'Marcus Vance (HR Recruiter)',
      text: `📄 Attached Document: ${file.name}`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      type: 'DOCUMENT',
      fileName: file.name,
      fileUrl: '#'
    };

    const updated = tickets.map(t => {
      if (t.id === selectedTicket.id) {
        return {
          ...t,
          messages: [...t.messages, fileMsg]
        };
      }
      return t;
    });

    saveAndSyncTickets(updated);
    toast.success(`Attached ${file.name} to chat thread!`);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 select-none animate-fade-in text-white pb-16 relative">
      {/* TOP NAVIGATION BAR */}
      <div className="flex items-center justify-between border-b border-white/10 pb-4">
        <Link href="/ats" className="inline-flex items-center gap-2 text-xs font-bold text-zinc-400 hover:text-brand-orange-400 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to ATS Candidate Pipeline
        </Link>
        <span className="text-xs font-mono font-bold text-brand-orange-400 bg-brand-orange-500/10 px-3 py-1 rounded-full border border-brand-orange-500/20">
          DISCORD/IMESSAGE ULTRA-PREMIUM MESSENGER
        </span>
      </div>

      {/* HEADER BANNER */}
      <div className="bg-zinc-950 p-6 sm:p-8 rounded-3xl border border-white/10 shadow-2xl flex flex-col md:flex-row md:items-center justify-between gap-6 relative overflow-hidden">
        <div className="flex items-center gap-4 relative z-10">
          <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-400 flex items-center justify-center font-bold shadow-lg shrink-0">
            <MessageSquare className="w-7 h-7" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl sm:text-3xl font-black font-heading text-white tracking-tight">
                HR Candidate Help Ticket Messenger
              </h1>
              <span className="bg-rose-500/10 text-rose-400 border border-rose-500/20 text-[10px] font-mono font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                LIVE MESSAGING &amp; CALLS
              </span>
            </div>
            <p className="text-xs text-zinc-400 font-medium mt-1">
              Communicate live with candidates, host instant Jitsi voice/video sessions, and review onboarding files.
            </p>
          </div>
        </div>
      </div>

      {/* MAIN MESSENGER CONTAINER */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* TICKETS DRAWER SIDEBAR */}
        <div className="bg-zinc-950 border border-white/10 rounded-3xl p-5 space-y-4 shadow-2xl h-fit">
          <h3 className="text-sm font-black font-heading text-white uppercase tracking-wider flex items-center gap-2 border-b border-white/10 pb-3">
            <LifeBuoy className="w-4 h-4 text-brand-orange-400" /> Active Tickets ({tickets.length})
          </h3>

          <div className="space-y-3">
            {tickets.length === 0 ? (
              <div className="p-8 text-center text-zinc-500 font-mono text-xs border border-dashed border-white/10 rounded-2xl space-y-2">
                <p>No active candidate support tickets in queue.</p>
              </div>
            ) : (
              tickets.map((t) => {
                const isSelected = selectedTicket?.id === t.id;
                return (
                  <div
                    key={t.id}
                    onClick={() => setSelectedTicketId(t.id)}
                    className={`p-4 rounded-2xl border transition-all cursor-pointer space-y-2 ${
                      isSelected
                        ? 'bg-brand-orange-500/10 border-brand-orange-500/60 shadow-lg'
                        : 'bg-zinc-900/80 border-white/5 hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[10px] font-black text-brand-orange-400">
                        {t.ticketNumber}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-mono font-black uppercase border ${
                        t.status === 'RESOLVED'
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                          : t.status === 'CLAIMED'
                          ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                          : 'bg-rose-500/10 text-rose-400 border-rose-500/20 animate-pulse'
                      }`}>
                        {t.status === 'RESOLVED' ? '✓ RESOLVED' : t.status === 'CLAIMED' ? '🟡 CLAIMED BY YOU' : '🔴 UNCLAIMED'}
                      </span>
                    </div>

                    <h4 className="font-extrabold text-xs text-white line-clamp-1">
                      {t.candidateName} — {t.subject}
                    </h4>

                    <p className="text-[11px] text-zinc-400 font-mono line-clamp-2 italic">
                      "{t.message}"
                    </p>

                    <div className="flex items-center justify-between text-[10px] font-mono text-zinc-500 pt-1 border-t border-white/5">
                      <span>{t.candidateName}</span>
                      <span>{t.createdAt}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* LIVE DISCORD/IMESSAGE MESSENGER CHAT THREAD */}
        <div className="lg:col-span-2 bg-zinc-950 border border-white/10 rounded-3xl shadow-2xl flex flex-col overflow-hidden min-h-[580px] relative">
          {selectedTicket ? (
            <>
              {/* CHAT HEADER */}
              <div className="p-5 border-b border-white/10 bg-zinc-900/90 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
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
                  {selectedTicket.status !== 'CLAIMED' && selectedTicket.status !== 'RESOLVED' && (
                    <button
                      onClick={() => handleClaimTicket(selectedTicket.id)}
                      className="bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-xs px-4 py-2 rounded-xl shadow-md cursor-pointer transition-all flex items-center gap-1.5"
                    >
                      <UserCheck className="w-3.5 h-3.5 text-black" />
                      <span>Claim Ticket</span>
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
                {selectedTicket.messages.map((msg) => {
                  const isHr = msg.sender === 'HR_AGENT';

                  return (
                    <div
                      key={msg.id}
                      className={`flex gap-3 max-w-[88%] ${isHr ? 'ml-auto flex-row-reverse' : 'mr-auto'}`}
                    >
                      <div className={`w-8 h-8 rounded-2xl flex items-center justify-center font-bold text-xs shrink-0 shadow-md ${
                        isHr ? 'bg-brand-orange-500 text-white' : 'bg-zinc-800 text-zinc-300 border border-white/10'
                      }`}>
                        {isHr ? 'HR' : 'CD'}
                      </div>

                      <div className={`p-4 rounded-2xl space-y-2 text-xs shadow-md backdrop-blur-xl ${
                        isHr
                          ? 'bg-brand-orange-500 text-white rounded-tr-none'
                          : 'bg-zinc-900 text-zinc-200 border border-white/10 rounded-tl-none'
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
                                onClick={() => {
                                  // Mark host as joined and save to localStorage
                                  const updated = tickets.map(t => ({
                                    ...t,
                                    messages: (t.messages || []).map(m => m.id === msg.id ? { ...m, isHostJoined: true } : m)
                                  }));
                                  saveAndSyncTickets(updated);

                                  if (msg.callRoomUrl) {
                                    const returnUrl = typeof window !== 'undefined' ? `${window.location.origin}/ats/help-tickets` : '';
                                    const easyUrl = `${msg.callRoomUrl}#config.prejoinPageEnabled=false&config.requireDisplayName=false&config.leaveRedirectUrl=${encodeURIComponent(returnUrl)}`;
                                    launchJitsiMeetingWindow(easyUrl);
                                  }
                                  toast.success('👑 You joined as Host! Candidate/Parent can now connect to the video call.');
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
                              onClick={() => toast.success(`Downloading ${msg.fileName}...`)}
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
                      onClick={() => setPendingCallRoom(null)}
                      className="text-zinc-400 hover:text-white p-1"
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
                  className="bg-brand-orange-500 hover:bg-orange-600 text-white font-black text-xs px-5 py-3 rounded-2xl shadow-lg transition-all cursor-pointer flex items-center gap-1.5 shrink-0"
                >
                  <Send className="w-4 h-4" />
                  <span>Send</span>
                </button>
              </form>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-3 text-zinc-500">
              <LifeBuoy className="w-12 h-12 text-zinc-700" />
              <h4 className="font-black text-white text-sm">No Ticket Selected</h4>
              <p className="text-xs text-zinc-400 max-w-xs font-mono">Select a candidate ticket from the left panel to start chatting live.</p>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
