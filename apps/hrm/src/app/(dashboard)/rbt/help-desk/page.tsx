'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { 
  LifeBuoy, 
  PlusCircle, 
  MessageSquare, 
  Clock, 
  CheckCircle2, 
  ShieldCheck, 
  User, 
  Send, 
  HelpCircle, 
  Sparkles,
  ArrowRight,
  ChevronRight,
  AlertCircle,
  FileText,
  Plus,
  Video,
  Paperclip,
  X,
  Minimize2,
  Maximize2,
  ExternalLink,
  Download
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
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
  candidateName?: string;
  messages: TicketMessage[];
}

export default function RbtHelpDeskPage() {
  const router = useRouter();
  const [tickets, setTickets] = useState<HelpTicket[]>([]);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  
  // Create New Ticket Form State
  const [category, setCategory] = useState('GENERAL_QUESTION');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<'NEW_TICKET' | 'ACTIVE_TICKETS'>('NEW_TICKET');

  // Reply message input state
  const [replyInput, setReplyInput] = useState('');

  // iMessage / Discord '+' Media Drawer State
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Load tickets from local storage
    const loadTickets = () => {
      try {
        const saved = JSON.parse(localStorage.getItem('ras_rbt_help_tickets') || '[]');
        // Filter out old cached fake seed ticket (t-101 or TICK-9042) and any RESOLVED tickets
        const realTickets = Array.isArray(saved) ? saved.filter((t: any) => t.id !== 't-101' && t.ticketNumber !== 'TICK-9042' && t.status !== 'RESOLVED') : [];
        
        let candidateRealName = 'azm karim';
        try {
          const storedApp = localStorage.getItem('ras_latest_submitted_app') || localStorage.getItem('ras_submitted_app_c1');
          if (storedApp) {
            const parsed = JSON.parse(storedApp);
            if (parsed.fullName) candidateRealName = parsed.fullName;
            else if (parsed.name) candidateRealName = parsed.name;
          }
        } catch (e) {}

        const sanitizedTickets = realTickets.map((t: any) => ({
          ...t,
          candidateName: (!t.candidateName || t.candidateName.includes('Jane')) ? candidateRealName : t.candidateName,
          messages: (t.messages || []).map((m: any) => ({
            ...m,
            senderName: m.sender === 'CANDIDATE' && (!m.senderName || m.senderName.includes('Jane')) ? candidateRealName : m.senderName,
          })),
        }));

        if (sanitizedTickets.length > 0) {
          setTickets(sanitizedTickets);
          if (!selectedTicketId) setSelectedTicketId(sanitizedTickets[0].id);
          setActiveTab('ACTIVE_TICKETS');
        } else {
          localStorage.removeItem('ras_rbt_help_tickets');
          localStorage.removeItem('ras_latest_help_ticket');
          setTickets([]);
          setSelectedTicketId(null);
          setActiveTab('NEW_TICKET');
        }
      } catch (e) {}
    };

    loadTickets();
    window.addEventListener('storage', loadTickets);
    return () => window.removeEventListener('storage', loadTickets);
  }, []);

  const selectedTicket = tickets.find(t => t.id === selectedTicketId) || tickets[0];

  const saveAndSyncTickets = (updated: HelpTicket[]) => {
    setTickets(updated);
    localStorage.setItem('ras_rbt_help_tickets', JSON.stringify(updated));
    window.dispatchEvent(new Event('storage'));
  };

  const handleCreateTicket = (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !message.trim()) {
      toast.error('Please enter a subject and message for your support ticket.');
      return;
    }

    setIsSubmitting(true);

    const categoryLabels: Record<string, string> = {
      UPLOAD_CERTIFICATE: '40-Hour RBT Certificate Upload',
      INTERVIEW_SCHEDULE: '1-on-1 HR Interview Scheduling',
      SIMULATION_QUIZ: 'ABA Clinical Trial Simulator',
      AVAILABILITY_GRID: 'Weekly Work Availability',
      GENERAL_QUESTION: 'General Onboarding & Compliance',
    };

    let candidateRealName = 'azm karim';
    try {
      const storedApp = localStorage.getItem('ras_latest_submitted_app') || localStorage.getItem('ras_submitted_app_c1');
      if (storedApp) {
        const parsed = JSON.parse(storedApp);
        if (parsed.fullName) candidateRealName = parsed.fullName;
        else if (parsed.name) candidateRealName = parsed.name;
      }
    } catch (e) {}

    const newTicket: HelpTicket = {
      id: `t-${Date.now()}`,
      ticketNumber: `TICK-${Math.floor(1000 + Math.random() * 9000)}`,
      category,
      categoryLabel: categoryLabels[category] || 'General Support',
      subject,
      message,
      status: 'OPEN',
      createdAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' }),
      candidateName: candidateRealName,
      messages: [
        {
          id: `m-${Date.now()}`,
          sender: 'CANDIDATE',
          senderName: candidateRealName,
          text: message,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          type: 'TEXT'
        }
      ]
    };

    const updated = [newTicket, ...tickets];
    saveAndSyncTickets(updated);
    setSelectedTicketId(newTicket.id);

    // Flag HR Help Desk Alerts in custom stages for ATS Kanban
    try {
      const customStages = JSON.parse(localStorage.getItem('ras_ats_custom_stages') || '{}');
      const payload = { stage: 'HELP_DESK', activationStatus: 'INVITATION_SENT' };
      customStages['c1'] = payload;
      customStages['cand-1'] = payload;
      customStages['usr-applicant-1'] = payload;
      localStorage.setItem('ras_ats_custom_stages', JSON.stringify(customStages));
      localStorage.setItem('ras_latest_help_ticket', JSON.stringify({ category, message, subject, ticketId: newTicket.id }));
      window.dispatchEvent(new Event('storage'));
    } catch (err) {}

    setIsSubmitting(false);
    setSubject('');
    setMessage('');
    setActiveTab('ACTIVE_TICKETS');
    toast.success('🎉 Support ticket submitted! Assigned to active HR Recruiter.');
  };

  const handleSendReply = (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyInput.trim() || !selectedTicket) return;

    let realCandidateName = 'azm karim';
    try {
      const storedApp = localStorage.getItem('ras_latest_submitted_app') || localStorage.getItem('ras_submitted_app_c1');
      if (storedApp) {
        const parsed = JSON.parse(storedApp);
        if (parsed.fullName) realCandidateName = parsed.fullName;
        else if (parsed.name) realCandidateName = parsed.name;
      }
    } catch (e) {}

    const newMsg: TicketMessage = {
      id: `m-${Date.now()}`,
      sender: 'CANDIDATE',
      senderName: realCandidateName,
      text: replyInput.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      type: 'TEXT'
    };

    const updatedTickets = tickets.map(t => {
      if (t.id === selectedTicket.id) {
        return {
          ...t,
          messages: [...t.messages, newMsg]
        };
      }
      return t;
    });

    saveAndSyncTickets(updatedTickets);
    setReplyInput('');
    toast.success('Response sent to HR Recruiter!');
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

  // Candidate Requests Instant Jitsi Video Call
  const handleRequestJitsiCall = () => {
    setShowPlusMenu(false);
    if (!selectedTicket) return;

    let realCandidateName = 'azm karim';
    try {
      const storedApp = localStorage.getItem('ras_latest_submitted_app') || localStorage.getItem('ras_submitted_app_c1');
      if (storedApp) {
        const parsed = JSON.parse(storedApp);
        if (parsed.fullName) realCandidateName = parsed.fullName;
        else if (parsed.name) realCandidateName = parsed.name;
      }
    } catch (e) {}

    const roomName = `RiseAndShine_LiveCall_${selectedTicket.ticketNumber}_${Date.now().toString().slice(-4)}`;
    const roomUrl = `https://meet.jit.si/${roomName}`;

    const callReqMsg: TicketMessage = {
      id: `m-${Date.now()}`,
      sender: 'CANDIDATE',
      senderName: realCandidateName,
      text: '📞 Candidate requested an instant 1-on-1 video call session. Awaiting HR Host to start call...',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      type: 'JITSI_CALL',
      callRoomUrl: roomUrl,
      callRoomName: roomName,
      isHostJoined: false
    };

    const updated = tickets.map(t => {
      if (t.id === selectedTicket.id) {
        return {
          ...t,
          messages: [...t.messages, callReqMsg]
        };
      }
      return t;
    });

    saveAndSyncTickets(updated);
    toast.info('📞 Call request sent to HR Recruiter! You can join as soon as HR connects as host.');
  };

  // Candidate Document/File Upload Handler
  const handleDocumentUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    setShowPlusMenu(false);
    const file = e.target.files?.[0];
    if (!file || !selectedTicket) return;

    let realCandidateName = 'azm karim';
    try {
      const storedApp = localStorage.getItem('ras_latest_submitted_app') || localStorage.getItem('ras_submitted_app_c1');
      if (storedApp) {
        const parsed = JSON.parse(storedApp);
        if (parsed.fullName) realCandidateName = parsed.fullName;
        else if (parsed.name) realCandidateName = parsed.name;
      }
    } catch (e) {}

    const fileMsg: TicketMessage = {
      id: `m-${Date.now()}`,
      sender: 'CANDIDATE',
      senderName: realCandidateName,
      text: `📄 Attached File: ${file.name}`,
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
    <div className="max-w-6xl mx-auto space-y-6 select-none animate-fade-in text-slate-900 pb-16 relative">
      {/* HEADER BANNER */}
      <div className="bg-gradient-to-r from-orange-500 to-amber-500 p-6 sm:p-8 rounded-3xl text-white shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6 relative overflow-hidden">
        <div className="flex items-center gap-4 relative z-10">
          <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center font-bold text-white shadow-inner shrink-0">
            <LifeBuoy className="w-8 h-8" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl sm:text-3xl font-black font-heading tracking-tight">
                RBT Candidate Help Desk &amp; Chat Center
              </h1>
              <span className="bg-white/20 backdrop-blur-md text-white text-[10px] font-mono font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                LIVE SUPPORT
              </span>
            </div>
            <p className="text-xs text-orange-100 font-medium mt-1">
              Have questions about your 40-hour certificate, interview time, or clinical trial? Message our HR team live.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 relative z-10 shrink-0">
          <button
            onClick={() => setActiveTab('NEW_TICKET')}
            className={`px-4 py-2.5 rounded-2xl font-black text-xs transition-all cursor-pointer shadow-md flex items-center gap-2 ${
              activeTab === 'NEW_TICKET'
                ? 'bg-white text-[#F97316]'
                : 'bg-white/20 hover:bg-white/30 text-white backdrop-blur-md'
            }`}
          >
            <PlusCircle className="w-4 h-4" />
            <span>Create New Ticket</span>
          </button>
          {tickets.length > 0 && (
            <button
              onClick={() => setActiveTab('ACTIVE_TICKETS')}
              className={`px-4 py-2.5 rounded-2xl font-black text-xs transition-all cursor-pointer shadow-md flex items-center gap-2 ${
                activeTab === 'ACTIVE_TICKETS'
                  ? 'bg-white text-[#F97316]'
                  : 'bg-white/20 hover:bg-white/30 text-white backdrop-blur-md'
              }`}
            >
              <MessageSquare className="w-4 h-4" />
              <span>My Support Tickets ({tickets.length})</span>
            </button>
          )}
        </div>
      </div>

      {/* TAB 1: SUBMIT NEW TICKET FORM */}
      {activeTab === 'NEW_TICKET' && (
        <div className="bg-white border-2 border-orange-200 rounded-3xl p-6 sm:p-8 space-y-6 shadow-xl max-w-2xl mx-auto">
          <div className="flex items-center gap-3 border-b border-orange-100 pb-4">
            <div className="w-10 h-10 rounded-2xl bg-orange-100 border border-orange-200 text-[#F97316] flex items-center justify-center font-bold">
              <LifeBuoy className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-900 font-heading">Submit Onboarding Help Ticket</h2>
              <p className="text-xs text-slate-600 font-medium">Your request will be assigned immediately to an active HR Recruiter.</p>
            </div>
          </div>

          <form onSubmit={handleCreateTicket} className="space-y-4 text-xs font-semibold text-slate-700">
            <div>
              <label className="block mb-1.5 font-bold uppercase tracking-wider text-slate-700">Select Category:</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full bg-slate-50 border-2 border-slate-200 rounded-2xl p-3 text-xs text-slate-900 font-bold outline-none focus:border-[#F97316] cursor-pointer"
              >
                <option value="GENERAL_QUESTION">General Onboarding &amp; Compliance Question</option>
                <option value="UPLOAD_CERTIFICATE">Having trouble uploading 40-Hour RBT Certificate</option>
                <option value="INTERVIEW_SCHEDULE">Need help scheduling 1-on-1 HR Interview time</option>
                <option value="SIMULATION_QUIZ">Question about ABA Clinical Trial Simulator</option>
                <option value="AVAILABILITY_GRID">Need assistance setting weekly borough availability</option>
              </select>
            </div>

            <div>
              <label className="block mb-1.5 font-bold uppercase tracking-wider text-slate-700">Ticket Subject / Title:</label>
              <input
                type="text"
                required
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g., Question about E-Signature consent requirement"
                className="w-full bg-slate-50 border-2 border-slate-200 rounded-2xl p-3 text-xs text-slate-900 font-bold outline-none focus:border-[#F97316]"
              />
            </div>

            <div>
              <label className="block mb-1.5 font-bold uppercase tracking-wider text-slate-700">Detailed Description:</label>
              <textarea
                rows={5}
                required
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Describe what you're stuck on so your assigned HR Recruiter can assist you immediately..."
                className="w-full bg-slate-50 border-2 border-slate-200 rounded-2xl p-3.5 text-xs text-slate-900 font-medium outline-none focus:border-[#F97316] resize-none"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-3">
              {tickets.length > 0 && (
                <button
                  type="button"
                  onClick={() => setActiveTab('ACTIVE_TICKETS')}
                  className="px-5 py-3 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer transition-all"
                >
                  Cancel
                </button>
              )}
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-6 py-3.5 rounded-2xl bg-[#F97316] hover:bg-orange-600 text-white font-extrabold text-xs cursor-pointer shadow-lg shadow-orange-500/20 transition-all flex items-center gap-2"
              >
                <Send className="w-4 h-4" />
                <span>{isSubmitting ? 'Submitting Ticket...' : 'Submit Support Ticket to HR'}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* TAB 2: ACTIVE TICKETS & DISCORD/IMESSAGE MESSENGER */}
      {activeTab === 'ACTIVE_TICKETS' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* TICKET DRAWER SIDEBAR */}
          <div className="bg-white border-2 border-orange-200 rounded-3xl p-5 space-y-4 shadow-xl h-fit">
            <h3 className="text-sm font-black font-heading text-slate-900 uppercase tracking-wider flex items-center gap-2 border-b border-orange-100 pb-3">
              <FileText className="w-4 h-4 text-[#F97316]" /> Ticket History ({tickets.length})
            </h3>

            <div className="space-y-3">
              {tickets.length === 0 ? (
                <div className="p-6 text-center text-slate-500 font-mono text-xs space-y-3 border-2 border-dashed border-slate-200 rounded-2xl">
                  <LifeBuoy className="w-8 h-8 text-slate-300 mx-auto" />
                  <p className="font-bold text-slate-700">No support tickets found.</p>
                  <p className="text-[11px] text-slate-400">You currently have no active or past help desk tickets.</p>
                  <button
                    onClick={() => setActiveTab('NEW_TICKET')}
                    className="bg-[#F97316] hover:bg-orange-600 text-white font-extrabold text-xs px-4 py-2 rounded-xl cursor-pointer shadow transition-all"
                  >
                    + Create Support Ticket
                  </button>
                </div>
              ) : (
                tickets.map((t) => {
                  const isSelected = selectedTicket?.id === t.id;
                  return (
                    <div
                      key={t.id}
                      onClick={() => setSelectedTicketId(t.id)}
                      className={`p-4 rounded-2xl border-2 transition-all cursor-pointer space-y-2 ${
                        isSelected
                          ? 'bg-orange-50/80 border-[#F97316] shadow-md'
                          : 'bg-slate-50 border-slate-200 hover:border-orange-300'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[10px] font-black text-[#F97316]">
                          {t.ticketNumber}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-mono font-black uppercase border ${
                          t.status === 'RESOLVED'
                            ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                            : t.status === 'CLAIMED'
                            ? 'bg-blue-100 text-blue-800 border-blue-300'
                            : 'bg-amber-100 text-amber-800 border-amber-300'
                        }`}>
                          {t.status === 'RESOLVED' ? '✓ RESOLVED' : t.status === 'CLAIMED' ? '🟡 HR CLAIMED' : '🟢 OPEN'}
                        </span>
                      </div>

                      <h4 className="font-extrabold text-xs text-slate-900 line-clamp-1">
                        {t.subject}
                      </h4>

                      <p className="text-[11px] text-slate-500 font-medium line-clamp-2">
                        {t.message}
                      </p>

                      <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 pt-1 border-t border-slate-200/60">
                        <span>{t.categoryLabel}</span>
                        <span>{t.createdAt}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* LIVE DISCORD/IMESSAGE MESSENGER CHAT CENTER */}
          <div className="lg:col-span-2 bg-white border-2 border-orange-200 rounded-3xl shadow-xl flex flex-col overflow-hidden min-h-[580px] relative">
            {selectedTicket ? (
              <>
                {/* TICKET TOP HEADER */}
                <div className="p-5 border-b border-orange-100 bg-orange-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-black text-[#F97316] bg-orange-100 border border-orange-300 px-2.5 py-0.5 rounded-full">
                        {selectedTicket.ticketNumber}
                      </span>
                      <h3 className="font-black text-slate-900 text-sm font-heading">
                        {selectedTicket.subject}
                      </h3>
                    </div>
                    <p className="text-xs text-slate-600 font-semibold flex items-center gap-2">
                      <span>Assigned Agent:</span>
                      <strong className="text-[#F97316]">{selectedTicket.assignedHrAgent || 'Pending HR Assignment'}</strong>
                    </p>
                  </div>

                  <span className={`px-3 py-1 rounded-full text-xs font-mono font-black uppercase border self-start sm:self-auto ${
                    selectedTicket.status === 'RESOLVED'
                      ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                      : selectedTicket.status === 'CLAIMED'
                      ? 'bg-blue-100 text-blue-800 border-blue-300'
                      : 'bg-amber-100 text-amber-800 border-amber-300'
                  }`}>
                    {selectedTicket.status === 'RESOLVED' ? '✓ RESOLVED' : selectedTicket.status === 'CLAIMED' ? '🟡 CLAIMED BY HR' : '🟢 OPEN (IN QUEUE)'}
                  </span>
                </div>

                {/* MESSAGES CONVERSATION THREAD */}
                <div className="flex-1 p-6 space-y-4 overflow-y-auto bg-slate-50/50 max-h-[380px]">
                  {selectedTicket.messages.map((msg) => {
                    const isCandidate = msg.sender === 'CANDIDATE';
                    const getInitials = (name: string) => {
                      if (!name) return 'CD';
                      const parts = name.trim().split(' ');
                      if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
                      return name.substring(0, 2).toUpperCase();
                    };

                    return (
                      <div
                        key={msg.id}
                        className={`flex gap-3 max-w-[88%] ${isCandidate ? 'ml-auto flex-row-reverse' : 'mr-auto'}`}
                      >
                        <div className={`w-8 h-8 rounded-2xl flex items-center justify-center font-bold text-xs shrink-0 shadow-sm ${
                          isCandidate ? 'bg-[#F97316] text-white' : 'bg-slate-900 text-white'
                        }`}>
                          {isCandidate ? getInitials(msg.senderName) : 'HR'}
                        </div>

                        <div className={`p-4 rounded-2xl space-y-2 text-xs shadow-sm ${
                          isCandidate
                            ? 'bg-[#F97316] text-white rounded-tr-none'
                            : 'bg-white text-slate-900 border border-slate-200 rounded-tl-none'
                        }`}>
                          <div className="flex items-center justify-between gap-4 border-b border-white/20 pb-1 mb-1">
                            <span className="font-extrabold text-[11px]">{msg.senderName}</span>
                            <span className="font-mono text-[9px] opacity-80">{msg.timestamp}</span>
                          </div>

                          {/* RENDER TYPE: JITSI CALL INVITE BUBBLE */}
                          {msg.type === 'JITSI_CALL' ? (
                            <div className="p-3.5 bg-black/80 text-white rounded-xl space-y-2.5">
                              <div className="flex items-center gap-2">
                                <span className={`w-2.5 h-2.5 rounded-full ${msg.isHostJoined ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400 animate-pulse'}`} />
                                <span className={`font-black text-xs uppercase tracking-wider flex items-center gap-1 ${msg.isHostJoined ? 'text-emerald-300' : 'text-amber-300'}`}>
                                  <Video className="w-4 h-4" /> {msg.isHostJoined ? 'Live Instant Jitsi Video Call' : 'Call Request Sent (Awaiting HR Host)'}
                                </span>
                              </div>
                              <p className="text-xs text-zinc-300 leading-relaxed font-medium">{msg.text}</p>
                              {msg.isHostJoined ? (
                                <div className="space-y-1.5">
                                  <button
                                    onClick={() => {
                                      if (msg.callRoomUrl) {
                                        const returnUrl = typeof window !== 'undefined' ? `${window.location.origin}/rbt/help-desk` : '';
                                        const easyUrl = `${msg.callRoomUrl}#config.prejoinPageEnabled=false&config.requireDisplayName=false&config.leaveRedirectUrl=${encodeURIComponent(returnUrl)}`;
                                        launchJitsiMeetingWindow(easyUrl);
                                      }
                                    }}
                                    className="w-full bg-emerald-500 hover:bg-emerald-400 text-black font-black text-xs py-3 px-4 rounded-xl shadow-lg transition-all cursor-pointer flex items-center justify-center gap-2"
                                  >
                                    <Video className="w-4 h-4 text-black" />
                                    <span>🎥 Tap to Join Video Call (No App Needed) →</span>
                                  </button>
                                  <p className="text-[10px] text-emerald-300 font-mono text-center">
                                    💡 1-Tap Instant Connect. When call ends, you will return right back here.
                                  </p>
                                </div>
                              ) : (
                                <div className="w-full bg-zinc-800/90 text-amber-300 border border-amber-500/30 font-bold text-xs py-2.5 px-3 rounded-xl text-center flex items-center justify-center gap-2 font-mono">
                                  <Clock className="w-4 h-4 text-amber-400 animate-spin" />
                                  <span>⏳ Waiting for HR Host to Join First...</span>
                                </div>
                              )}
                            </div>
                          ) : msg.type === 'DOCUMENT' ? (
                            /* RENDER TYPE: DOCUMENT/PDF ATTACHMENT BUBBLE */
                            <div className="p-3 bg-black/10 rounded-xl border border-white/20 flex items-center justify-between gap-3 font-mono text-xs">
                              <div className="flex items-center gap-2">
                                <FileText className="w-4 h-4 text-[#F97316]" />
                                <span className="font-bold truncate max-w-[180px]">{msg.fileName}</span>
                              </div>
                              <button
                                onClick={() => toast.success(`Downloading ${msg.fileName}...`)}
                                className="p-1.5 rounded-lg bg-black/10 hover:bg-black/20 text-slate-800 cursor-pointer"
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

                {/* CHAT REPLY INPUT FORM WITH '+' MEDIA ATTACHMENT DRAWER */}
                <form onSubmit={handleSendReply} className="p-4 border-t border-orange-100 bg-orange-50/30 flex items-center gap-3 relative">
                  {/* '+' MEDIA DRAWER TOGGLE BUTTON */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setShowPlusMenu(!showPlusMenu)}
                      className={`w-10 h-10 rounded-2xl border flex items-center justify-center transition-all cursor-pointer shadow-sm ${
                        showPlusMenu
                          ? 'bg-[#F97316] text-white border-orange-600 rotate-45'
                          : 'bg-white hover:bg-orange-100 text-slate-700 border-slate-200 hover:text-[#F97316]'
                      }`}
                      title="Attach File / Request Call"
                    >
                      <Plus className="w-5 h-5 transition-transform" />
                    </button>

                    {/* '+' MEDIA POPOVER DRAWER */}
                    {showPlusMenu && (
                      <div className="absolute bottom-14 left-0 bg-white border-2 border-orange-200 rounded-2xl p-2.5 shadow-2xl space-y-1.5 w-64 z-50 animate-scale-up">
                        <button
                          type="button"
                          onClick={handleRequestJitsiCall}
                          className="w-full p-2.5 rounded-xl bg-slate-50 hover:bg-orange-50 text-slate-900 font-extrabold text-xs flex items-center gap-2.5 transition-all text-left border border-slate-200 hover:border-orange-300 cursor-pointer"
                        >
                          <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center">
                            <Video className="w-4 h-4" />
                          </div>
                          <div>
                            <span className="block text-slate-900">📞 Request Instant Call</span>
                            <span className="text-[10px] text-slate-500 font-mono">Send call request to HR</span>
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="w-full p-2.5 rounded-xl bg-slate-50 hover:bg-orange-50 text-slate-900 font-extrabold text-xs flex items-center gap-2.5 transition-all text-left border border-slate-200 hover:border-orange-300 cursor-pointer"
                        >
                          <div className="w-7 h-7 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center">
                            <Paperclip className="w-4 h-4" />
                          </div>
                          <div>
                            <span className="block text-slate-900">📄 Upload PDF / File</span>
                            <span className="text-[10px] text-slate-500 font-mono">Attach document to chat</span>
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
                    placeholder="Type message to HR Recruiter..."
                    className="flex-1 bg-white border-2 border-slate-200 rounded-2xl px-4 py-3 text-xs text-slate-900 placeholder-slate-400 outline-none focus:border-[#F97316] font-medium"
                  />

                  <button
                    type="submit"
                    className="bg-[#F97316] hover:bg-orange-600 text-white font-black text-xs px-5 py-3 rounded-2xl shadow-lg transition-all cursor-pointer flex items-center gap-1.5 shrink-0"
                  >
                    <Send className="w-4 h-4" />
                    <span>Send</span>
                  </button>
                </form>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-3 text-slate-400">
                <LifeBuoy className="w-12 h-12 text-slate-300" />
                <h4 className="font-black text-slate-700 text-sm">No Support Ticket Selected</h4>
                <p className="text-xs text-slate-400 max-w-xs font-mono">Select a support ticket from the left panel to start chatting live with HR.</p>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
