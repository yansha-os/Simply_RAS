'use client';

import React, { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import {
  MessageSquare,
  Send,
  Check,
  CheckCheck,
  Loader2,
  RotateCcw,
  RefreshCw,
  Mail,
  ShieldCheck,
  Smartphone,
  Sparkles,
  ArrowRight,
  User,
  ExternalLink,
  Plus,
  Video,
  FileText,
  Download,
  Paperclip,
} from 'lucide-react';
import { sendClientMessage, generateMagicLink } from '@/app/(dashboard)/portal-case/actions';
import {
  parseMessageContent,
  encodeCallContent,
  encodeDocContent,
  generateJitsiRoomUrl,
  launchJitsiMeetingWindow,
} from '@/lib/clientChatUtils';
import { toast } from 'sonner';

interface ClientMsg {
  id: string;
  clientId: string;
  content: string;
  isFromClient: boolean;
  senderName: string;
  createdAt: Date | string;
  readAt?: Date | string | null;
}

interface OutboxMsg {
  localId: string;
  content: string;
  createdAt: string;
  status: 'sending' | 'failed';
}

const STAFF_SENDER = 'Clinic Concierge';

function initialsOf(name?: string | null) {
  if (!name?.trim()) return '??';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function timeLabel(d: Date | string) {
  return new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function dayLabel(d: Date | string) {
  const date = new Date(d);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Group consecutive messages from the same side within 5 minutes (iMessage-style). */
function isGroupStart(prev: ClientMsg | undefined, curr: ClientMsg) {
  if (!prev) return true;
  if (prev.isFromClient !== curr.isFromClient) return true;
  return new Date(curr.createdAt).getTime() - new Date(prev.createdAt).getTime() > 5 * 60 * 1000;
}

export default function ClientMessagesTab({
  clientId,
  initialMessages,
  clientStatus,
  guardianName,
  guardianEmail,
  guardianPhone,
  hasIntakePacket,
  magicLinkToken,
}: {
  clientId: string;
  initialMessages: ClientMsg[];
  clientStatus?: string;
  guardianName?: string | null;
  guardianEmail?: string | null;
  guardianPhone?: string | null;
  hasIntakePacket?: boolean;
  magicLinkToken?: string | null;
}) {
  const router = useRouter();
  const [messageText, setMessageText] = useState('');
  const [serverMessages, setServerMessages] = useState<ClientMsg[]>(initialMessages);
  const [previousInitialMessages, setPreviousInitialMessages] = useState(initialMessages);
  const [outbox, setOutbox] = useState<OutboxMsg[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const [isUploadingDoc, setIsUploadingDoc] = useState(false);
  const [, startTransition] = useTransition();
  const [isActivating, startActivating] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [serverMessages.length, outbox.length]);

  // Close plus menu on outside click
  useEffect(() => {
    const handleClickOutside = () => setShowPlusMenu(false);
    if (showPlusMenu) {
      window.addEventListener('click', handleClickOutside);
      return () => window.removeEventListener('click', handleClickOutside);
    }
  }, [showPlusMenu]);

  // Reconcile during render when router.refresh() supplies a new snapshot.
  if (initialMessages !== previousInitialMessages) {
    setPreviousInitialMessages(initialMessages);
    setServerMessages(initialMessages);
    setIsRefreshing(false);
    setOutbox(
      outbox.filter(
        (entry) =>
          entry.status === 'failed' ||
          !initialMessages.some(
            (message) => !message.isFromClient && message.content === entry.content
          )
      )
    );
  }

  const autosize = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  };

  const dispatchSend = (entry: OutboxMsg) => {
    startTransition(async () => {
      const res = await sendClientMessage(clientId, entry.content);
      if (!res?.success) {
        setOutbox((prev) =>
          prev.map((o) => (o.localId === entry.localId ? { ...o, status: 'failed' } : o))
        );
        return;
      }
      // Promote optimistic → confirmed locally; refresh reconciles real ids.
      setServerMessages((prev) => [
        ...prev,
        {
          id: entry.localId,
          clientId,
          content: entry.content,
          isFromClient: false,
          senderName: STAFF_SENDER,
          createdAt: entry.createdAt,
          readAt: null,
        },
      ]);
      setOutbox((prev) => prev.filter((o) => o.localId !== entry.localId));
      router.refresh();
    });
  };

  const handleSendMessage = (e?: React.FormEvent) => {
    e?.preventDefault();
    const body = messageText.trim();
    if (!body) return;
    const entry: OutboxMsg = {
      localId: `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      content: body,
      createdAt: new Date().toISOString(),
      status: 'sending',
    };
    setOutbox((prev) => [...prev, entry]);
    setMessageText('');
    requestAnimationFrame(autosize);
    dispatchSend(entry);
  };

  const retrySend = (entry: OutboxMsg) => {
    setOutbox((prev) =>
      prev.map((o) => (o.localId === entry.localId ? { ...o, status: 'sending' } : o))
    );
    dispatchSend({ ...entry, status: 'sending' });
  };

  const handleStartJitsiCall = () => {
    setShowPlusMenu(false);
    const roomUrl = generateJitsiRoomUrl(clientId, 'care');
    const encoded = encodeCallContent(roomUrl, 'Instant Care Team Video Session');
    const entry: OutboxMsg = {
      localId: `local-call-${Date.now()}`,
      content: encoded,
      createdAt: new Date().toISOString(),
      status: 'sending',
    };
    setOutbox((prev) => [...prev, entry]);
    dispatchSend(entry);
    toast.success('Instant video meeting invite created!');
    launchJitsiMeetingWindow(roomUrl);
  };

  const handleDocumentSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setShowPlusMenu(false);
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      toast.error('File size exceeds 10MB limit.');
      return;
    }

    setIsUploadingDoc(true);
    const toastId = toast.loading('Uploading document...');
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok || !data?.url) {
        throw new Error(data?.error || 'Upload failed');
      }

      toast.dismiss(toastId);
      toast.success('Document uploaded and attached!');

      const encoded = encodeDocContent(data.url, file.name);
      const entry: OutboxMsg = {
        localId: `local-doc-${Date.now()}`,
        content: encoded,
        createdAt: new Date().toISOString(),
        status: 'sending',
      };
      setOutbox((prev) => [...prev, entry]);
      dispatchSend(entry);
    } catch (err: unknown) {
      toast.dismiss(toastId);
      toast.error(err instanceof Error ? err.message : 'Could not upload document.');
    } finally {
      setIsUploadingDoc(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const lastReadStaffId = useMemo(
    () => [...serverMessages].reverse().find((m) => !m.isFromClient && m.readAt)?.id,
    [serverMessages]
  );

  // If client is a new lead (INQUIRY) without an active magic link, show the Activation Gate
  if (clientStatus === 'INQUIRY' || (!hasIntakePacket && clientStatus === 'INQUIRY')) {
    return (
      <div className="space-y-6 animate-slide-up">
        <Card className="border-brand-orange-500/30 shadow-2xl w-full bg-zinc-950/90 backdrop-blur-2xl overflow-hidden rounded-3xl">
          <div className="relative p-6 sm:p-10 space-y-8">
            <div className="pointer-events-none absolute -right-16 -top-16 h-72 w-72 rounded-full bg-brand-orange-500/15 blur-3xl" />
            <div className="pointer-events-none absolute -left-16 -bottom-16 h-72 w-72 rounded-full bg-amber-500/10 blur-3xl" />

            {/* Header / Intro */}
            <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-6 pb-6 border-b border-white/10">
              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-orange-500/10 border border-brand-orange-500/20 text-brand-orange-400 font-mono text-[11px] font-bold">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>ONBOARDING ACTIVATION GATE</span>
                </div>
                <h3 className="text-2xl sm:text-3xl font-extrabold text-white font-heading tracking-tight">
                  Unlock Parent Messaging &amp; Portal
                </h3>
                <p className="text-sm text-zinc-400 max-w-xl font-sans leading-relaxed">
                  This client is currently in the <span className="text-brand-orange-400 font-semibold font-mono">INQUIRY</span> stage. Deliver their secure onboarding magic link to activate their single-device bound portal and enable real-time 2-way messaging.
                </p>
              </div>

              <div className="w-16 h-16 rounded-2xl bg-brand-orange-500/10 border border-brand-orange-500/30 flex items-center justify-center text-brand-orange-400 shrink-0 shadow-lg shadow-orange-500/10">
                <Mail className="w-8 h-8" />
              </div>
            </div>

            {/* Details Cards Grid */}
            <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-5 rounded-2xl border border-white/10 bg-zinc-900/60 space-y-3">
                <div className="flex items-center gap-2 text-xs font-mono font-bold text-zinc-300 uppercase tracking-wider">
                  <User className="w-4 h-4 text-brand-orange-400" />
                  <span>Guardian Contact Details</span>
                </div>
                <div className="space-y-2 text-xs">
                  <div className="flex items-center justify-between py-1 border-b border-white/5">
                    <span className="text-zinc-500">Parent / Guardian:</span>
                    <span className="text-white font-medium">{guardianName || 'Unspecified'}</span>
                  </div>
                  <div className="flex items-center justify-between py-1 border-b border-white/5">
                    <span className="text-zinc-500">Email Address:</span>
                    <span className="text-brand-orange-400 font-mono">{guardianEmail || 'No email recorded'}</span>
                  </div>
                  <div className="flex items-center justify-between py-1">
                    <span className="text-zinc-500">Phone Number:</span>
                    <span className="text-zinc-300 font-mono">{guardianPhone || 'No phone recorded'}</span>
                  </div>
                </div>
              </div>

              <div className="p-5 rounded-2xl border border-white/10 bg-zinc-900/60 space-y-3">
                <div className="flex items-center gap-2 text-xs font-mono font-bold text-zinc-300 uppercase tracking-wider">
                  <Smartphone className="w-4 h-4 text-amber-400" />
                  <span>Single-Device Lock &amp; Resend Email</span>
                </div>
                <div className="space-y-2 text-xs text-zinc-400 font-sans leading-relaxed">
                  <p className="flex items-start gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <span><strong>Device Binding:</strong> The generated link will automatically bind to the parent&apos;s primary device upon their first click, ensuring secure zero-trust portal access.</span>
                  </p>
                  <p className="flex items-start gap-2">
                    <Mail className="w-4 h-4 text-brand-orange-400 shrink-0 mt-0.5" />
                    <span><strong>Email Notification:</strong> Email dispatch instructions advise parents to open the invitation on their most frequently used phone or computer.</span>
                  </p>
                </div>
              </div>
            </div>

            {/* Action Footer */}
            <div className="relative z-10 flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-white/10">
              <div className="text-xs text-zinc-500 font-mono">
                Status: <span className="text-amber-400 font-bold">Awaiting Magic Link Generation</span>
              </div>

              <Button
                disabled={isActivating}
                onClick={() => {
                  startActivating(async () => {
                    const res = await generateMagicLink(clientId);
                    if (res?.success) {
                      toast.success('Parent magic link generated! Messaging unlocked.');
                      router.refresh();
                    } else {
                      toast.error(res?.error || 'Failed to generate parent link.');
                    }
                  });
                }}
                className="w-full sm:w-auto bg-gradient-to-r from-brand-orange-500 to-orange-600 hover:from-brand-orange-600 hover:to-orange-700 text-white font-bold text-xs px-6 h-11 rounded-xl shadow-[0_0_20px_rgba(255,107,0,0.3)] transition-all hover:scale-105 cursor-pointer flex items-center justify-center gap-2"
              >
                {isActivating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Generating &amp; Delivering Link...</span>
                  </>
                ) : (
                  <>
                    <Mail className="w-4 h-4" />
                    <span>Generate &amp; Deliver Parent Magic Link</span>
                    <ArrowRight className="w-4 h-4 ml-1" />
                  </>
                )}
              </Button>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-slide-up">
      <Card className="border-[var(--line)] shadow-sm w-full bg-[var(--surface)]">
        <CardHeader className="pb-4 border-b border-[var(--line)] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <CardTitle className="text-lg text-[var(--ink-100)] flex items-center gap-3">
              <MessageSquare className="w-5 h-5 text-[#EA580C]" />
              Client Communication
            </CardTitle>
            <p className="text-sm text-[var(--ink-400)] mt-1">
              Send messages directly to the parent&apos;s Zero-Trust portal.
            </p>
          </div>

          {/* Magic Link Header Box */}
          <div className="flex items-center gap-2 bg-zinc-900/90 border border-white/10 p-2 px-3 rounded-xl">
            <span className="text-[10px] font-mono text-zinc-400 uppercase font-bold">
              Magic Link:
            </span>
            {magicLinkToken ? (
              <a
                href={`/magic-link/${magicLinkToken}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-mono text-orange-400 hover:text-orange-300 hover:underline truncate max-w-[180px] flex items-center gap-1 cursor-pointer"
                title="Open parent portal in new tab"
              >
                <span>/magic-link/{magicLinkToken.slice(0, 8)}...</span>
                <ExternalLink className="w-3 h-3 shrink-0" />
              </a>
            ) : (
              <span className="text-xs font-mono text-zinc-500">Generate a secure link first</span>
            )}
            <Button
              variant="secondary"
              size="sm"
              disabled={!magicLinkToken}
              className="h-7 text-[11px] px-2.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
              onClick={(e) => {
                if (!magicLinkToken) return;
                const url = typeof window !== 'undefined' ? `${window.location.origin}/magic-link/${magicLinkToken}` : `/magic-link/${magicLinkToken}`;
                navigator.clipboard.writeText(url);
                const target = e.target as HTMLButtonElement;
                const oldText = target.innerText;
                target.innerText = 'Copied!';
                setTimeout(() => {
                  target.innerText = oldText;
                }, 2000);
              }}
            >
              Copy
            </Button>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="flex flex-col h-[65vh] bg-zinc-950/95 relative overflow-hidden rounded-b-xl">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(249,115,22,0.06),_transparent_55%)]" />

            {/* Thread toolbar */}
            <div className="relative px-4 py-2.5 border-b border-white/10 bg-zinc-900/80 backdrop-blur-xl flex items-center justify-between">
              <span className="text-[10px] font-mono font-black uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                <span className="dot-live w-1.5 h-1.5 rounded-full bg-emerald-400" />
                Parent portal thread
              </span>
              <button
                type="button"
                onClick={() => {
                  setIsRefreshing(true);
                  router.refresh();
                }}
                title="Check for new parent messages"
                className="flex items-center gap-1.5 text-[10px] font-mono font-bold text-zinc-400 hover:text-white border border-white/10 hover:border-orange-500/40 rounded-lg px-2.5 py-1.5 transition-all cursor-pointer"
              >
                <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>

            {/* Messages Scroll Area */}
            <div className="relative flex-1 overflow-y-auto p-5 space-y-1">
              {serverMessages.length === 0 && outbox.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center gap-3 px-6">
                  <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
                    <MessageSquare className="w-7 h-7 text-zinc-600" />
                  </div>
                  <p className="text-sm font-bold text-zinc-200">No messages yet</p>
                  <p className="text-xs text-zinc-500 font-mono max-w-xs leading-relaxed">
                    Send an update to the family — it lands instantly in their magic-link portal.
                  </p>
                </div>
              ) : (
                <>
                  {serverMessages.map((msg, i) => {
                    const prev = serverMessages[i - 1];
                    const groupStart = isGroupStart(prev, msg);
                    const newDay =
                      !prev ||
                      new Date(prev.createdAt).toDateString() !==
                        new Date(msg.createdAt).toDateString();
                    const parsed = parseMessageContent(msg.content);

                    return (
                      <React.Fragment key={msg.id}>
                        {newDay && (
                          <div className="flex items-center gap-3 py-3">
                            <div className="flex-1 h-px bg-white/10" />
                            <span className="text-[9px] font-mono font-black uppercase tracking-wider text-zinc-500">
                              {dayLabel(msg.createdAt)}
                            </span>
                            <div className="flex-1 h-px bg-white/10" />
                          </div>
                        )}
                        <div
                          className={`flex items-end gap-2 ${msg.isFromClient ? 'justify-start' : 'justify-end'} ${groupStart && !newDay ? 'mt-3' : 'mt-0.5'}`}
                        >
                          {msg.isFromClient && (
                            <div
                              className={`w-7 h-7 rounded-xl bg-zinc-800 border border-white/10 text-zinc-200 flex items-center justify-center font-black text-[10px] shrink-0 ${groupStart ? '' : 'invisible'}`}
                            >
                              {initialsOf(msg.senderName)}
                            </div>
                          )}
                          <div className="max-w-[78%] flex flex-col gap-1">
                            {groupStart && msg.isFromClient && (
                              <span className="text-[10px] font-bold text-orange-400 px-1">
                                {msg.senderName}
                              </span>
                            )}

                            {/* Card Content Based on Type */}
                            {parsed.type === 'JITSI_CALL' ? (
                              <div className="p-4 bg-zinc-900/90 border border-emerald-500/30 rounded-2xl shadow-xl space-y-3 backdrop-blur-xl">
                                <div className="flex items-center justify-between gap-3">
                                  <div className="flex items-center gap-2">
                                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                                    <span className="font-bold text-xs text-emerald-400 uppercase tracking-wider font-mono flex items-center gap-1.5">
                                      <Video className="w-4 h-4" /> Live Video Session
                                    </span>
                                  </div>
                                </div>
                                <p className="text-xs text-zinc-300 font-medium">
                                  {parsed.text}
                                </p>
                                <button
                                  type="button"
                                  onClick={() => parsed.callRoomUrl && launchJitsiMeetingWindow(parsed.callRoomUrl)}
                                  className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-xs py-2.5 px-4 rounded-xl shadow-lg transition-all cursor-pointer flex items-center justify-center gap-2 hover:scale-[1.01]"
                                >
                                  <Video className="w-4 h-4 text-white" />
                                  <span>Join Video Call →</span>
                                </button>
                              </div>
                            ) : parsed.type === 'DOCUMENT' ? (
                              <div className="p-3.5 bg-zinc-900/90 border border-white/10 rounded-2xl flex items-center justify-between gap-3 font-mono text-xs text-zinc-100 shadow-md">
                                <div className="flex items-center gap-2.5 truncate">
                                  <div className="w-8 h-8 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-400 shrink-0">
                                    <FileText className="w-4 h-4" />
                                  </div>
                                  <span className="font-bold truncate max-w-[200px] text-zinc-200">
                                    {parsed.fileName}
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => parsed.fileUrl && window.open(parsed.fileUrl, '_blank')}
                                  className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-orange-400 hover:text-orange-300 border border-white/10 transition cursor-pointer shrink-0"
                                  title="Download / View document"
                                >
                                  <Download className="w-4 h-4" />
                                </button>
                              </div>
                            ) : (
                              <div
                                className={`rounded-2xl px-4 py-2.5 text-[13px] leading-relaxed shadow-md backdrop-blur-xl border ${
                                  msg.isFromClient
                                    ? `bg-zinc-900/80 text-zinc-100 border-white/10 ${groupStart ? 'rounded-bl-md' : ''}`
                                    : `bg-gradient-to-r from-orange-500 via-orange-500 to-amber-500 text-white border-orange-400/30 ${groupStart ? 'rounded-br-md' : ''}`
                                }`}
                              >
                                <p className="whitespace-pre-wrap font-medium">{parsed.text}</p>
                              </div>
                            )}

                            <div
                              className={`flex items-center gap-1 px-1 ${msg.isFromClient ? 'justify-start' : 'justify-end'}`}
                            >
                              <span className="text-[9px] font-mono text-zinc-500">
                                {timeLabel(msg.createdAt)}
                              </span>
                              {!msg.isFromClient &&
                                (msg.id === lastReadStaffId ? (
                                  <span className="flex items-center gap-0.5 text-[9px] font-mono text-emerald-400">
                                    <CheckCheck className="w-3 h-3" /> Read by family
                                  </span>
                                ) : (
                                  <Check className="w-3 h-3 text-zinc-500" />
                                ))}
                            </div>
                          </div>
                        </div>
                      </React.Fragment>
                    );
                  })}
                  {outbox.map((o) => {
                    const parsed = parseMessageContent(o.content);
                    return (
                      <div key={o.localId} className="flex justify-end mt-0.5">
                        <div className="max-w-[78%] flex flex-col gap-1 items-end">
                          <div
                            className={`rounded-2xl px-4 py-2.5 text-[13px] leading-relaxed shadow-md backdrop-blur-xl border ${
                              o.status === 'failed'
                                ? 'bg-rose-500/15 text-rose-100 border-rose-500/40'
                                : 'bg-orange-600/60 text-white border-orange-400/20'
                            }`}
                          >
                            <p className="whitespace-pre-wrap font-medium">{parsed.text}</p>
                          </div>
                          {o.status === 'failed' ? (
                            <button
                              type="button"
                              onClick={() => retrySend(o)}
                              className="flex items-center gap-1 text-[9px] font-mono font-black text-rose-400 hover:text-rose-300 cursor-pointer px-1"
                            >
                              <RotateCcw className="w-3 h-3" />
                              Failed to send — tap to retry
                            </button>
                          ) : (
                            <span className="flex items-center gap-1 text-[9px] font-mono text-zinc-500 px-1">
                              <Loader2 className="w-3 h-3 animate-spin" /> Sending…
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Hidden File Input */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleDocumentSelected}
              className="hidden"
              accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
            />

            {/* Input Bar with '+' Media Drawer */}
            <form
              onSubmit={handleSendMessage}
              className="relative p-4 border-t border-white/10 bg-zinc-900/80 backdrop-blur-xl flex items-end gap-3"
            >
              {/* '+' Menu Toggle Button */}
              <div className="relative">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowPlusMenu(!showPlusMenu);
                  }}
                  className="p-2.5 rounded-2xl bg-zinc-800 hover:bg-zinc-700 text-orange-400 hover:text-orange-300 border border-white/10 transition-all cursor-pointer shrink-0"
                  title="Attach video call or document"
                >
                  <Plus className={`w-5 h-5 transition-transform ${showPlusMenu ? 'rotate-45 text-rose-400' : ''}`} />
                </button>

                {/* Popover Drawer */}
                {showPlusMenu && (
                  <div
                    className="absolute bottom-full left-0 mb-3 w-64 bg-zinc-900 border border-white/10 rounded-2xl p-2 shadow-2xl space-y-1 z-50 animate-in fade-in slide-in-from-bottom-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="px-3 py-1.5 text-[10px] font-mono font-bold text-zinc-400 uppercase tracking-wider border-b border-white/5">
                      Media &amp; Meeting Actions
                    </div>
                    <button
                      type="button"
                      onClick={handleStartJitsiCall}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5 text-left text-xs font-semibold text-zinc-200 transition cursor-pointer"
                    >
                      <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
                        <Video className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-white font-bold">Instant Video Meeting</div>
                        <div className="text-[10px] text-zinc-400">Launch live Jitsi call</div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploadingDoc}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5 text-left text-xs font-semibold text-zinc-200 transition cursor-pointer disabled:opacity-50"
                    >
                      <div className="w-8 h-8 rounded-xl bg-orange-500/10 border border-orange-500/20 text-orange-400 flex items-center justify-center">
                        <Paperclip className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-white font-bold">Share Document / PDF</div>
                        <div className="text-[10px] text-zinc-400">Attach clinical file</div>
                      </div>
                    </button>
                  </div>
                )}
              </div>

              <textarea
                ref={textareaRef}
                rows={1}
                placeholder="Type a message to the family… (Enter to send, Shift+Enter for a new line)"
                className="flex-1 resize-none bg-zinc-950 border border-white/10 rounded-2xl px-4 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-orange-500/50 transition-colors font-medium max-h-[120px]"
                value={messageText}
                onChange={(e) => {
                  setMessageText(e.target.value);
                  autosize();
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
              />
              <Button
                type="submit"
                disabled={!messageText.trim()}
                className="bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-2xl px-5 font-semibold transition-all shadow-lg shadow-orange-500/20 flex items-center gap-2 h-auto py-2.5 cursor-pointer shrink-0"
              >
                <Send className="w-4 h-4" />
                <span>Send</span>
              </Button>
            </form>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
