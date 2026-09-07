'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  LifeBuoy,
  PlusCircle,
  MessageSquare,
  Clock,
  Send,
  FileText,
  Plus,
  Video,
  Paperclip,
  Download,
  Loader2,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  createHelpTicket,
  escalateTicketToHeadHrByApplicant,
  listHelpTickets,
  sendHelpMessage,
  type HelpTicketDto,
} from '@/app/actions/helpDeskActions';
import {
  ensureActiveApplicantId,
  getActiveApplicantName,
} from '@/lib/syncAtsProgress';

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
  candidateName?: string;
  messages: TicketMessage[];
}

interface OutboxReply {
  localId: string;
  ticketId: string;
  text: string;
  status: 'sending' | 'failed';
}

function getInitials(name: string) {
  if (!name?.trim()) return '??';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function resolveCandidateDisplayName(fallback?: string) {
  return getActiveApplicantName() || fallback || 'Applicant';
}

export default function RbtHelpDeskPage() {
  const [tickets, setTickets] = useState<HelpTicket[]>([]);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [category, setCategory] = useState('GENERAL_QUESTION');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [requestHeadHr] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<'NEW_TICKET' | 'ACTIVE_TICKETS'>('NEW_TICKET');
  const [replyInput, setReplyInput] = useState('');
  const [outbox, setOutbox] = useState<OutboxReply[]>([]);
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const replyRef = useRef<HTMLTextAreaElement>(null);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'no_session' | 'error'>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [candidateId, setCandidateId] = useState<string | null>(null);
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
    candidateName: t.candidateName,
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

  const [isOfferStage, setIsOfferStage] = useState(false);

  useEffect(() => {
    const loadTickets = () => {
      void (async () => {
        const id = await ensureActiveApplicantId();
        if (!id || id === 'c1') {
          setCandidateId(null);
          setTickets([]);
          setSelectedTicketId(null);
          setLoadState('no_session');
          setLoadError(null);
          setActiveTab('NEW_TICKET');
          return;
        }
        setCandidateId(id);

        try {
          const { getMyWageOffer } = await import('@/app/actions/wageOfferActions');
          const wageRes = await getMyWageOffer();
          if (wageRes.success && wageRes.data) {
            setIsOfferStage(true);
          }
        } catch {
          setIsOfferStage(false);
        }

        const res = await listHelpTickets({ candidateId: id, activeOnly: true });
        if (!res.success) {
          setTickets([]);
          setSelectedTicketId(null);
          setLoadState('error');
          setLoadError(res.error || 'Failed to load tickets from the database.');
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
          setActiveTab((tab) => (tab === 'NEW_TICKET' ? tab : 'ACTIVE_TICKETS'));
        } else {
          setSelectedTicketId(null);
        }
      })();
    };

    loadTickets();
    window.addEventListener('rbt_progress_synced', loadTickets);
    window.addEventListener('ras_applicant_session_changed', loadTickets);
    window.addEventListener('focus', loadTickets);
    return () => {
      window.removeEventListener('rbt_progress_synced', loadTickets);
      window.removeEventListener('ras_applicant_session_changed', loadTickets);
      window.removeEventListener('focus', loadTickets);
    };
  }, []);

  const selectedTicket = tickets.find((t) => t.id === selectedTicketId) || tickets[0];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [selectedTicketId, selectedTicket?.messages?.length, outbox.length]);

  const saveAndSyncTickets = (updated: HelpTicket[]) => {
    setTickets(updated);
    window.dispatchEvent(new Event('rbt_progress_synced'));
  };

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !message.trim()) {
      toast.error('Please enter a subject and message for your support ticket.');
      return;
    }

    const id = (await ensureActiveApplicantId()) || candidateId;
    if (!id || id === 'c1') {
      toast.error(
        'No active applicant session. Open your magic link or use Dev Tools to select a candidate.'
      );
      setLoadState('no_session');
      return;
    }

    setIsSubmitting(true);
    const res = await createHelpTicket({
      candidateId: id,
      category,
      subject,
      message,
      candidateName: resolveCandidateDisplayName(),
      requestHeadHr,
    });
    setIsSubmitting(false);

    if (!res.success || !res.ticket) {
      toast.error(res.error || 'Failed to submit ticket');
      return;
    }

    const mapped = mapDto(res.ticket);
    saveAndSyncTickets([mapped, ...tickets.filter((t) => t.id !== mapped.id)]);
    setSelectedTicketId(mapped.id);
    setSubject('');
    setMessage('');
    setActiveTab('ACTIVE_TICKETS');
    setLoadState('ready');
    toast.success('Support ticket submitted to HR.');
  };

  const handleEscalateToHeadHr = async (ticketId: string) => {
    const res = await escalateTicketToHeadHrByApplicant(ticketId);
    if (!res.success || !res.ticket) {
      toast.error(res.error || 'Failed to escalate ticket');
      return;
    }
    const mapped = mapDto(res.ticket);
    setTickets((prev) => prev.map((t) => (t.id === mapped.id ? mapped : t)));
    toast.success('Ticket escalated directly to Head of HR!');
  };

  const autosizeReply = () => {
    const el = replyRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  };

  const dispatchReply = (ticket: HelpTicket, entry: OutboxReply) => {
    void (async () => {
      const res = await sendHelpMessage(ticket.id, {
        text: entry.text,
        type: 'TEXT',
        senderSide: 'CANDIDATE',
        senderName: resolveCandidateDisplayName(ticket.candidateName),
      });
      if (!res.success || !res.ticket) {
        toast.error(res.error || 'Failed to send message');
        setOutbox((prev) =>
          prev.map((o) => (o.localId === entry.localId ? { ...o, status: 'failed' } : o))
        );
        return;
      }
      const mapped = mapDto(res.ticket);
      setOutbox((prev) => prev.filter((o) => o.localId !== entry.localId));
      // Functional update — dispatch can resolve after other ticket state changes.
      setTickets((prev) => prev.map((t) => (t.id === mapped.id ? mapped : t)));
      window.dispatchEvent(new Event('rbt_progress_synced'));
    })();
  };

  const handleSendReply = (e?: React.FormEvent) => {
    e?.preventDefault();
    const body = replyInput.trim();
    if (!body || !selectedTicket) return;

    const entry: OutboxReply = {
      localId: `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      ticketId: selectedTicket.id,
      text: body,
      status: 'sending',
    };
    setOutbox((prev) => [...prev, entry]);
    setReplyInput('');
    requestAnimationFrame(autosizeReply);
    dispatchReply(selectedTicket, entry);
  };

  const retryReply = (entry: OutboxReply) => {
    const ticket = tickets.find((t) => t.id === entry.ticketId);
    if (!ticket) return;
    setOutbox((prev) =>
      prev.map((o) => (o.localId === entry.localId ? { ...o, status: 'sending' } : o))
    );
    dispatchReply(ticket, { ...entry, status: 'sending' });
  };

  const launchJitsiMeetingWindow = (roomUrl: string) => {
    const isMobile =
      typeof window !== 'undefined' &&
      (window.innerWidth < 768 || /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent));

    if (isMobile) {
      window.open(roomUrl, '_blank');
    } else {
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

  const handleRequestJitsiCall = async () => {
    setShowPlusMenu(false);
    if (!selectedTicket) return;

    const roomName = `RiseAndShine_LiveCall_${selectedTicket.ticketNumber}_${Date.now().toString().slice(-4)}`;
    const roomUrl = `https://meet.jit.si/${roomName}`;

    const res = await sendHelpMessage(selectedTicket.id, {
      text: 'Candidate requested an instant 1-on-1 video call session. Awaiting HR Host to start call...',
      type: 'JITSI_CALL',
      senderSide: 'CANDIDATE',
      senderName: resolveCandidateDisplayName(selectedTicket.candidateName),
      callRoomUrl: roomUrl,
      callRoomName: roomName,
      isHostJoined: false,
    });
    if (!res.success || !res.ticket) {
      toast.error(res.error || 'Failed to send call request');
      return;
    }
    saveAndSyncTickets(tickets.map((t) => (t.id === res.ticket!.id ? mapDto(res.ticket!) : t)));
    toast.info('Call request sent — waiting for HR to join as host.');
  };

  const handleDocumentUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setShowPlusMenu(false);
    const file = e.target.files?.[0];
    if (!file || !selectedTicket) return;

    const res = await sendHelpMessage(selectedTicket.id, {
      text: `Attached File: ${file.name}`,
      type: 'DOCUMENT',
      senderSide: 'CANDIDATE',
      senderName: resolveCandidateDisplayName(selectedTicket.candidateName),
      fileName: file.name,
      fileUrl: '#',
    });
    if (!res.success || !res.ticket) {
      toast.error(res.error || 'Failed to attach file');
      return;
    }
    saveAndSyncTickets(tickets.map((t) => (t.id === res.ticket!.id ? mapDto(res.ticket!) : t)));
    toast.success(`Attached ${file.name} to chat thread.`);
    e.target.value = '';
  };

  const sessionBlocked = loadState === 'no_session';

  return (
    <div className="max-w-6xl mx-auto space-y-6 select-none animate-fade-in text-slate-900 pb-16 relative">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_rgba(249,115,22,0.08),_transparent_55%)]" />

      {/* HEADER */}
      <div className="bg-[#FFFDF8] backdrop-blur-xl p-6 sm:p-8 rounded-3xl border border-[#E2D5B7] shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6 relative overflow-hidden text-slate-900">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(249,115,22,0.06),transparent_45%)] pointer-events-none" />
        <div className="flex items-center gap-4 relative z-10">
          <div className="w-14 h-14 rounded-2xl bg-orange-100 border border-orange-200 text-[#F97316] flex items-center justify-center shrink-0 shadow-sm">
            <LifeBuoy className="w-8 h-8" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl sm:text-3xl font-black font-heading tracking-tight text-slate-900">
                RBT Candidate Help Desk
              </h1>
              <span className="bg-orange-100 text-orange-800 border border-orange-300 text-[10px] font-mono font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider inline-flex items-center gap-1.5">
                <span className="dot-live w-1.5 h-1.5 rounded-full bg-orange-500" />
                Live support
              </span>
            </div>
            <p className="text-xs text-slate-600 font-medium mt-1">
              Real AtsHelpTicket rows — ask HR about certs, interviews, availability, or wage offers.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 relative z-10 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('NEW_TICKET')}
            className={`px-4 py-2.5 rounded-2xl font-black text-xs transition-all cursor-pointer shadow-md flex items-center gap-2 border ${
              activeTab === 'NEW_TICKET'
                ? 'bg-brand-orange-500 text-white border-brand-orange-400'
                : 'bg-[#F9F5EC] hover:bg-white text-slate-800 border-[#E2D5B7] hover:border-brand-orange-500/40'
            }`}
          >
            <PlusCircle className="w-4 h-4" />
            <span>Create Ticket</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('ACTIVE_TICKETS')}
            className={`px-4 py-2.5 rounded-2xl font-black text-xs transition-all cursor-pointer shadow-md flex items-center gap-2 border ${
              activeTab === 'ACTIVE_TICKETS'
                ? 'bg-brand-orange-500 text-white border-brand-orange-400'
                : 'bg-[#F9F5EC] hover:bg-white text-slate-800 border-[#E2D5B7] hover:border-brand-orange-500/40'
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            <span>My Tickets ({tickets.length})</span>
          </button>
        </div>
      </div>

      {sessionBlocked && (
        <div className="bg-amber-50 border border-amber-300 rounded-3xl p-5 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-sm font-bold text-amber-900">No applicant session</p>
            <p className="text-xs font-mono text-amber-800 leading-relaxed">
              Open your magic-link invite or use Dev Tools to impersonate a real AtsCandidate.
              Help desk will not invent demo tickets.
            </p>
          </div>
        </div>
      )}

      {/* NEW TICKET */}
      {activeTab === 'NEW_TICKET' && (
        <div className="bg-[#FFFDF8] border border-[#E2D5B7] rounded-3xl p-6 sm:p-8 space-y-6 shadow-xl max-w-2xl mx-auto">
          <div className="flex items-center gap-3 border-b border-[#E2D5B7] pb-4">
            <div className="w-10 h-10 rounded-2xl bg-orange-100 border border-orange-200 text-[#F97316] flex items-center justify-center">
              <LifeBuoy className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-900 font-heading">Submit help ticket</h2>
              <p className="text-xs text-slate-600 font-medium">
                Creates a durable AtsHelpTicket HR can claim from /ats/help-tickets.
              </p>
            </div>
          </div>

          <form onSubmit={handleCreateTicket} className="space-y-4 text-xs font-semibold text-slate-700">
            <div>
              <label className="block mb-1.5 font-bold uppercase tracking-wider text-slate-600">
                Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                disabled={sessionBlocked}
                className="w-full bg-[#FFFDF8] border border-[#E2D5B7] rounded-2xl p-3 text-xs text-slate-900 font-bold outline-none focus:border-brand-orange-500 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="GENERAL_QUESTION">General Onboarding &amp; Compliance</option>
                <option value="UPLOAD_CERTIFICATE">40-Hour RBT Certificate upload</option>
                <option value="INTERVIEW_SCHEDULE">HR Interview scheduling</option>
                <option value="SIMULATION_QUIZ">ABA Clinical Trial Simulator</option>
                <option value="AVAILABILITY_GRID">Weekly availability</option>
                <option value="WAGE_OFFER">Wage Offer / LS-54</option>
                <option value="PAYROLL_FINANCE">Payroll &amp; Finance</option>
              </select>
            </div>

            <div>
              <label className="block mb-1.5 font-bold uppercase tracking-wider text-slate-600">
                Subject
              </label>
              <input
                type="text"
                required
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                disabled={sessionBlocked}
                placeholder="e.g., Question about e-signature consent"
                className="w-full bg-[#FFFDF8] border border-[#E2D5B7] rounded-2xl p-3 text-xs text-slate-900 font-bold outline-none focus:border-brand-orange-500 disabled:cursor-not-allowed disabled:opacity-50 placeholder:text-slate-400"
              />
            </div>

            <div>
              <label className="block mb-1.5 font-bold uppercase tracking-wider text-slate-600">
                Description
              </label>
              <textarea
                rows={5}
                required
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                disabled={sessionBlocked}
                placeholder="Describe what you need so HR can help immediately…"
                className="w-full bg-[#FFFDF8] border border-[#E2D5B7] rounded-2xl p-3.5 text-xs text-slate-900 font-medium outline-none focus:border-brand-orange-500 resize-none disabled:cursor-not-allowed disabled:opacity-50 placeholder:text-slate-400"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-3">
              {tickets.length > 0 && (
                <button
                  type="button"
                  onClick={() => setActiveTab('ACTIVE_TICKETS')}
                  className="px-5 py-3 rounded-2xl bg-[#F9F5EC] hover:bg-white text-slate-800 border border-[#E2D5B7] font-bold text-xs cursor-pointer transition-all"
                >
                  View my tickets
                </button>
              )}
              <button
                type="submit"
                disabled={isSubmitting || sessionBlocked}
                className="px-6 py-3.5 rounded-2xl bg-brand-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white font-extrabold text-xs cursor-pointer disabled:cursor-not-allowed shadow-lg transition-all flex items-center gap-2"
              >
                <Send className="w-4 h-4" />
                <span>{isSubmitting ? 'Submitting…' : 'Submit to HR'}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ACTIVE TICKETS + CHAT */}
      {activeTab === 'ACTIVE_TICKETS' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-[#FFFDF8] border border-[#E2D5B7] rounded-3xl p-5 space-y-4 shadow-xl h-fit">
            <h3 className="text-sm font-black font-heading text-slate-900 uppercase tracking-wider flex items-center gap-2 border-b border-[#E2D5B7] pb-3">
              <FileText className="w-4 h-4 text-[#F97316]" /> My tickets ({tickets.length})
            </h3>

            <div className="space-y-3">
              {loadState === 'loading' ? (
                <div className="p-8 text-center text-slate-600 font-mono text-xs border border-dashed border-[#E2D5B7] rounded-2xl flex flex-col items-center gap-2">
                  <Loader2 className="w-5 h-5 animate-spin text-[#F97316]" />
                  Loading from database…
                </div>
              ) : loadState === 'error' ? (
                <div className="p-6 text-center space-y-2 border border-dashed border-rose-300 bg-rose-50 rounded-2xl">
                  <AlertTriangle className="w-6 h-6 text-rose-600 mx-auto" />
                  <p className="text-xs font-bold text-rose-900">Could not load tickets</p>
                  <p className="text-[11px] font-mono text-rose-800">{loadError}</p>
                </div>
              ) : tickets.length === 0 ? (
                <div className="p-6 text-center space-y-3 border border-dashed border-[#E2D5B7] rounded-2xl bg-[#F9F5EC]">
                  <LifeBuoy className="w-8 h-8 text-slate-400 mx-auto" />
                  <p className="text-xs font-bold text-slate-800">No support tickets yet</p>
                  <p className="text-[11px] font-mono text-slate-600 leading-relaxed">
                    You have no open AtsHelpTicket rows for this applicant session.
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveTab('NEW_TICKET')}
                    disabled={sessionBlocked}
                    className="bg-brand-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white font-extrabold text-xs px-4 py-2 rounded-xl cursor-pointer disabled:cursor-not-allowed shadow transition-all"
                  >
                    + Create support ticket
                  </button>
                </div>
              ) : (
                tickets.map((t) => {
                  const isSelected = selectedTicket?.id === t.id;
                  return (
                    <div
                      key={t.id}
                      onClick={() => setSelectedTicketId(t.id)}
                      className={`p-4 rounded-2xl border transition-all duration-300 cursor-pointer space-y-2 hover:scale-[1.01] hover:shadow-md ${
                        isSelected
                          ? 'bg-orange-50 border-brand-orange-500/60 shadow-md'
                          : 'bg-[#F9F5EC] border-[#E2D5B7] hover:border-brand-orange-500/40'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[10px] font-black text-[#C2410C]">
                          {t.ticketNumber}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[9px] font-mono font-black uppercase border ${
                            t.status === 'RESOLVED'
                              ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                              : t.status === 'ESCALATED_HEAD_HR'
                                ? 'bg-purple-100 text-purple-900 border-purple-300'
                                : t.status === 'CLAIMED' || t.status === 'IN_PROGRESS'
                                  ? 'bg-blue-100 text-blue-800 border-blue-300'
                                  : 'bg-amber-100 text-amber-900 border-amber-300'
                          }`}
                        >
                          {t.status === 'RESOLVED'
                            ? '✓ Resolved'
                            : t.status === 'ESCALATED_HEAD_HR'
                              ? '✓ Claimed by Head of HR'
                              : t.status === 'CLAIMED' || t.status === 'IN_PROGRESS'
                                ? 'HR claimed'
                                : 'Open'}
                        </span>
                      </div>
                      <h4 className="font-extrabold text-xs text-slate-900 line-clamp-1">{t.subject}</h4>
                      <p className="text-[11px] text-slate-600 font-medium line-clamp-2">{t.message}</p>
                      <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 pt-1 border-t border-[#E2D5B7]">
                        <span>{t.categoryLabel}</span>
                        <span>{t.createdAt}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="lg:col-span-2 bg-[#FFFDF8] border border-[#E2D5B7] rounded-3xl shadow-xl flex flex-col overflow-hidden min-h-[580px] relative">
            {selectedTicket ? (
              <>
                <div className="p-5 border-b border-[#E2D5B7] bg-[#FFFDF8] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs font-black text-[#C2410C] bg-orange-100 border border-orange-200 px-2.5 py-0.5 rounded-full">
                        {selectedTicket.ticketNumber}
                      </span>
                      <h3 className="font-black text-slate-900 text-sm font-heading">
                        {selectedTicket.subject}
                      </h3>
                    </div>
                    <p className="text-xs text-slate-600 font-semibold">
                      Assigned:{' '}
                      <strong className="text-[#C2410C]">
                        {selectedTicket.assignedHrAgent || (selectedTicket.status === 'ESCALATED_HEAD_HR' ? 'Head of HR' : 'Pending HR assignment')}
                      </strong>
                    </p>
                  </div>
                  <div className="flex items-center gap-2 self-start sm:self-auto">
                    {selectedTicket.status === 'ESCALATED_HEAD_HR' || selectedTicket.category === 'WAGE_OFFER' || selectedTicket.subject?.includes('[WAGE_OFFER]') ? (
                      <span className="px-3 py-1 rounded-full text-xs font-mono font-black uppercase border bg-purple-100 text-purple-900 border-purple-300 flex items-center gap-1 shadow-sm">
                        <span>✓ Claimed by Head of HR</span>
                      </span>
                    ) : isOfferStage && selectedTicket.status !== 'RESOLVED' ? (
                      <button
                        type="button"
                        onClick={() => handleEscalateToHeadHr(selectedTicket.id)}
                        className="px-3 py-1 rounded-full text-xs font-mono font-extrabold border bg-purple-600 hover:bg-purple-700 text-white cursor-pointer transition-all flex items-center gap-1 shadow-md"
                      >
                        <span>👑 Discuss Wage Offer with Head of HR</span>
                      </button>
                    ) : null}

                    <span
                      className={`px-3 py-1 rounded-full text-xs font-mono font-black uppercase border ${
                        selectedTicket.status === 'RESOLVED'
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                          : selectedTicket.status === 'ESCALATED_HEAD_HR' || selectedTicket.category === 'WAGE_OFFER' || selectedTicket.subject?.includes('[WAGE_OFFER]')
                            ? 'bg-purple-100 text-purple-900 border-purple-300'
                            : selectedTicket.status === 'CLAIMED' ||
                                selectedTicket.status === 'IN_PROGRESS'
                              ? 'bg-blue-100 text-blue-800 border-blue-300'
                              : 'bg-amber-100 text-amber-900 border-amber-300'
                      }`}
                    >
                      {selectedTicket.status === 'ESCALATED_HEAD_HR' || selectedTicket.category === 'WAGE_OFFER' || selectedTicket.subject?.includes('[WAGE_OFFER]') ? 'HEAD HR REVIEW' : selectedTicket.status}
                    </span>
                  </div>
                </div>

                <div className="flex-1 p-6 overflow-y-auto bg-[#F9F5EC] max-h-[380px]">
                  {selectedTicket.messages.map((msg, i) => {
                    const isCandidate = msg.sender === 'CANDIDATE';
                    const prev = selectedTicket.messages[i - 1];
                    // Discord-style grouping: consecutive same-sender messages share one avatar/header.
                    const groupStart = !prev || prev.sender !== msg.sender;
                    return (
                      <div
                        key={msg.id}
                        className={`flex gap-3 max-w-[88%] ${isCandidate ? 'ml-auto flex-row-reverse' : 'mr-auto'} ${
                          groupStart ? 'mt-4 first:mt-0' : 'mt-1'
                        }`}
                      >
                        <div
                          className={`w-8 h-8 rounded-2xl flex items-center justify-center font-bold text-xs shrink-0 shadow-sm ${
                            groupStart ? '' : 'invisible'
                          } ${
                            isCandidate
                              ? 'bg-brand-orange-500 text-white'
                              : 'bg-white text-slate-800 border border-[#E2D5B7]'
                          }`}
                        >
                          {getInitials(msg.senderName)}
                        </div>
                        <div
                          className={`p-4 rounded-2xl space-y-2 text-xs shadow-sm ${
                            isCandidate
                              ? `bg-brand-orange-500 text-white ${groupStart ? 'rounded-tr-none' : ''}`
                              : `bg-white text-slate-800 border border-[#E2D5B7] ${groupStart ? 'rounded-tl-none' : ''}`
                          }`}
                        >
                          {groupStart && (
                            <div className="flex items-center justify-between gap-4 border-b border-black/10 pb-1 mb-1">
                              <span className="font-extrabold text-[11px]">{msg.senderName}</span>
                              <span className="font-mono text-[9px] opacity-80">{msg.timestamp}</span>
                            </div>
                          )}

                          {msg.type === 'JITSI_CALL' ? (
                            <div className="p-3.5 bg-slate-50 rounded-xl border border-[#E2D5B7] space-y-2.5 text-slate-900">
                              <div className="flex items-center gap-2">
                                <span
                                  className={`w-2.5 h-2.5 rounded-full ${msg.isHostJoined ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500 animate-pulse'}`}
                                />
                                <span
                                  className={`font-black text-xs uppercase tracking-wider flex items-center gap-1 ${msg.isHostJoined ? 'text-emerald-700' : 'text-amber-800'}`}
                                >
                                  <Video className="w-4 h-4" />{' '}
                                  {msg.isHostJoined
                                    ? 'Live Instant Jitsi Video Call'
                                    : 'Call request sent (awaiting HR host)'}
                                </span>
                              </div>
                              <p className="text-xs text-slate-700 leading-relaxed font-medium">
                                {msg.text}
                              </p>
                              {msg.isHostJoined ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (msg.callRoomUrl) {
                                      const returnUrl =
                                        typeof window !== 'undefined'
                                          ? `${window.location.origin}/rbt/help-desk`
                                          : '';
                                      const easyUrl = `${msg.callRoomUrl}#config.prejoinPageEnabled=false&config.requireDisplayName=false&config.leaveRedirectUrl=${encodeURIComponent(returnUrl)}`;
                                      launchJitsiMeetingWindow(easyUrl);
                                    }
                                  }}
                                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs py-3 px-4 rounded-xl shadow-md transition-all cursor-pointer flex items-center justify-center gap-2"
                                >
                                  <Video className="w-4 h-4 text-white" />
                                  <span>Join video call →</span>
                                </button>
                              ) : (
                                <div className="w-full bg-amber-50 text-amber-900 border border-amber-300 font-bold text-xs py-2.5 px-3 rounded-xl text-center flex items-center justify-center gap-2 font-mono">
                                  <Clock className="w-4 h-4 text-amber-600 animate-spin" />
                                  <span>Waiting for HR host to join first…</span>
                                </div>
                              )}
                            </div>
                          ) : msg.type === 'DOCUMENT' ? (
                            <div className="p-3 bg-slate-50 rounded-xl border border-[#E2D5B7] flex items-center justify-between gap-3 font-mono text-xs text-slate-900">
                              <div className="flex items-center gap-2">
                                <FileText className="w-4 h-4 text-[#F97316]" />
                                <span className="font-bold truncate max-w-[180px]">
                                  {msg.fileName}
                                </span>
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
                                className="p-1.5 rounded-lg bg-[#E2D5B7] hover:bg-slate-300 text-slate-800 cursor-pointer"
                              >
                                <Download className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <p className="leading-relaxed font-medium">{msg.text}</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {outbox
                    .filter((o) => o.ticketId === selectedTicket.id)
                    .map((o) => (
                      <div key={o.localId} className="flex flex-col items-end mt-1 gap-1">
                        <div
                          className={`max-w-[88%] p-4 rounded-2xl text-xs shadow-sm border ${
                            o.status === 'failed'
                              ? 'bg-rose-100 text-rose-900 border-rose-300'
                              : 'bg-brand-orange-500/80 text-white border-brand-orange-400/20'
                          }`}
                        >
                          <p className="leading-relaxed font-medium whitespace-pre-wrap">{o.text}</p>
                        </div>
                        {o.status === 'failed' ? (
                          <button
                            type="button"
                            onClick={() => retryReply(o)}
                            className="flex items-center gap-1 text-[9px] font-mono font-black text-rose-600 hover:text-rose-700 cursor-pointer"
                          >
                            <RotateCcw className="w-3 h-3" />
                            Failed to send — tap to retry
                          </button>
                        ) : (
                          <span className="flex items-center gap-1 text-[9px] font-mono text-slate-500">
                            <Loader2 className="w-3 h-3 animate-spin text-[#F97316]" /> Sending…
                          </span>
                        )}
                      </div>
                    ))}
                  <div ref={messagesEndRef} />
                </div>

                <form
                  onSubmit={handleSendReply}
                  className="p-4 border-t border-[#E2D5B7] bg-[#FFFDF8] flex items-end gap-3 relative"
                >
                  {showPlusMenu && (
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setShowPlusMenu(false)}
                      aria-hidden
                    />
                  )}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setShowPlusMenu(!showPlusMenu)}
                      className={`w-10 h-10 rounded-2xl border flex items-center justify-center transition-all cursor-pointer shadow-sm ${
                        showPlusMenu
                          ? 'bg-brand-orange-500 text-white border-brand-orange-400 rotate-45'
                          : 'bg-[#F9F5EC] hover:bg-white text-slate-800 border-[#E2D5B7] hover:text-[#F97316]'
                      }`}
                      title="Attach file / request call"
                    >
                      <Plus className="w-5 h-5 transition-transform" />
                    </button>

                    {showPlusMenu && (
                      <div className="absolute bottom-14 left-0 bg-[#FFFDF8] border border-[#E2D5B7] rounded-2xl p-2.5 shadow-2xl space-y-1.5 w-64 z-50 animate-scale-up">
                        <button
                          type="button"
                          onClick={handleRequestJitsiCall}
                          className="w-full p-2.5 rounded-xl bg-[#F9F5EC] hover:bg-orange-50 text-slate-900 font-extrabold text-xs flex items-center gap-2.5 transition-all text-left border border-[#E2D5B7] cursor-pointer"
                        >
                          <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center">
                            <Video className="w-4 h-4" />
                          </div>
                          <div>
                            <span className="block text-slate-900 font-bold">Request instant call</span>
                            <span className="text-[10px] text-slate-500 font-mono">
                              Host-locked until HR joins
                            </span>
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="w-full p-2.5 rounded-xl bg-[#F9F5EC] hover:bg-orange-50 text-slate-900 font-extrabold text-xs flex items-center gap-2.5 transition-all text-left border border-[#E2D5B7] cursor-pointer"
                        >
                          <div className="w-7 h-7 rounded-lg bg-blue-100 text-blue-800 flex items-center justify-center">
                            <Paperclip className="w-4 h-4" />
                          </div>
                          <div>
                            <span className="block text-slate-900 font-bold">Upload PDF / file</span>
                            <span className="text-[10px] text-slate-500 font-mono">
                              Attach to this thread
                            </span>
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

                  <textarea
                    ref={replyRef}
                    rows={1}
                    value={replyInput}
                    onChange={(e) => {
                      setReplyInput(e.target.value);
                      autosizeReply();
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendReply();
                      }
                    }}
                    placeholder="Message HR… (Enter to send, Shift+Enter for a new line)"
                    className="flex-1 resize-none bg-[#F9F5EC] border border-[#E2D5B7] rounded-2xl px-4 py-3 text-xs text-slate-900 placeholder-slate-400 outline-none focus:border-brand-orange-500 focus:bg-white font-medium max-h-[120px]"
                  />
                  <button
                    type="submit"
                    disabled={!replyInput.trim()}
                    className="bg-brand-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white font-black text-xs px-5 py-3 rounded-2xl shadow-md transition-all cursor-pointer disabled:cursor-not-allowed flex items-center gap-1.5 shrink-0"
                  >
                    <Send className="w-4 h-4" />
                    <span>Send</span>
                  </button>
                </form>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-3 text-slate-500">
                <LifeBuoy className="w-12 h-12 text-slate-400" />
                <h4 className="font-black text-slate-900 text-sm">
                  {loadState === 'loading'
                    ? 'Loading tickets…'
                    : loadState === 'error'
                      ? 'Tickets unavailable'
                      : loadState === 'no_session'
                        ? 'No applicant session'
                        : 'No ticket selected'}
                </h4>
                <p className="text-xs text-slate-600 max-w-sm font-mono leading-relaxed">
                  {loadState === 'error'
                    ? loadError
                    : loadState === 'no_session'
                      ? 'Bind a real candidate session before opening help desk chat.'
                      : 'Create a ticket or select one from the left to message HR.'}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
