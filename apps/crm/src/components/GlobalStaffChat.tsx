'use client';

import React, { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import {
  MessageCircle,
  X,
  ChevronLeft,
  Send,
  Users,
  Plus,
  Video,
  Paperclip,
  RotateCcw,
  Check,
  CheckCheck,
  Loader2,
} from 'lucide-react';
import {
  getStaffMembers,
  getStaffMessages,
  sendStaffMessage,
  markStaffThreadRead,
} from '@/app/actions/chat';

type StaffMember = Awaited<ReturnType<typeof getStaffMembers>>[number];
type StaffMsg = Awaited<ReturnType<typeof getStaffMessages>>[number];

interface OutboxMsg {
  localId: string;
  content: string;
  createdAt: string;
  status: 'sending' | 'failed';
}

const JITSI_URL_RE = /https:\/\/meet\.jit\.si\/[\w-]+/;
const CALL_INVITE_PREFIX = '📞 Instant video call invite — join here: ';

function initialsOf(first?: string | null, last?: string | null) {
  const a = first?.trim()?.[0] || '';
  const b = last?.trim()?.[0] || '';
  return (a + b).toUpperCase() || '??';
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

/** Group consecutive messages from same side within 5 minutes (Discord-style). */
function isGroupStart(prev: StaffMsg | undefined, curr: StaffMsg) {
  if (!prev) return true;
  if (prev.isMine !== curr.isMine) return true;
  return new Date(curr.createdAt).getTime() - new Date(prev.createdAt).getTime() > 5 * 60 * 1000;
}

function openJitsiWindow(url: string) {
  const isMobile =
    window.innerWidth < 768 || /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  if (isMobile) {
    window.open(url, '_blank');
    return;
  }
  const width = 1280;
  const height = 800;
  const left = (window.screen.width - width) / 2;
  const top = (window.screen.height - height) / 2;
  window.open(
    url,
    'RasStaffJitsiCall',
    `width=${width},height=${height},top=${top},left=${left},scrollbars=yes,resizable=yes,status=no,toolbar=no,menubar=no`
  );
}

function CallCard({ content, mine }: { content: string; mine: boolean }) {
  const url = content.match(JITSI_URL_RE)?.[0];
  return (
    <div className="p-3 bg-black/40 rounded-xl border border-white/15 space-y-2.5 min-w-[200px]">
      <div className="flex items-center gap-2">
        <span className="dot-live w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
        <span className="font-black text-[11px] uppercase tracking-wider text-emerald-300 flex items-center gap-1.5">
          <Video className="w-3.5 h-3.5" />
          Instant video call
        </span>
      </div>
      <p className="text-[11px] opacity-90 leading-relaxed font-medium">
        {mine ? 'You started an instant Jitsi call.' : 'Invited you to an instant Jitsi call.'}
      </p>
      {url && (
        <button
          type="button"
          onClick={() => openJitsiWindow(url)}
          className="w-full bg-emerald-500 hover:bg-emerald-400 text-black font-black text-[11px] py-2 px-3 rounded-lg shadow-lg transition-all cursor-pointer flex items-center justify-center gap-1.5"
        >
          <Video className="w-3.5 h-3.5" />
          Join video call →
        </button>
      )}
    </div>
  );
}

export function GlobalStaffChat() {
  const [isOpen, setIsOpen] = useState(false);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [staffLoading, setStaffLoading] = useState(false);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<StaffMsg[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [outbox, setOutbox] = useState<OutboxMsg[]>([]);
  const [text, setText] = useState('');
  const [showPlus, setShowPlus] = useState(false);
  const [, startTransition] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const staffRequestRef = useRef(0);
  const threadRequestRef = useRef(0);
  const activeChatIdRef = useRef<string | null>(null);

  const loadStaff = useCallback(async () => {
    const requestId = ++staffRequestRef.current;
    setStaffLoading(true);
    const nextStaff = await getStaffMembers();
    if (requestId === staffRequestRef.current) {
      setStaff(nextStaff);
      setStaffLoading(false);
    }
  }, []);

  const loadThread = useCallback(async (peerId: string, opts?: { silent?: boolean }) => {
    const requestId = ++threadRequestRef.current;
    const nextMessages = await getStaffMessages(peerId);
    if (
      activeChatIdRef.current !== peerId ||
      requestId !== threadRequestRef.current
    ) {
      return;
    }
    setMessages(nextMessages);
    if (!opts?.silent) {
      setThreadLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen || !activeChatId) return;
    void markStaffThreadRead(activeChatId);
    const interval = setInterval(() => {
      void loadThread(activeChatId, { silent: true });
      void markStaffThreadRead(activeChatId);
    }, 5000);
    return () => {
      clearInterval(interval);
    };
  }, [activeChatId, isOpen, loadThread]);

  useEffect(
    () => () => {
      staffRequestRef.current += 1;
      threadRequestRef.current += 1;
    },
    []
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, outbox.length, activeChatId, isOpen]);

  const autosize = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 110)}px`;
  };

  const openChat = () => {
    setIsOpen(true);
    if (staff.length === 0 && !staffLoading) {
      void loadStaff();
    }
    const peerId = activeChatIdRef.current;
    if (peerId) {
      void loadThread(peerId, { silent: true });
    }
  };

  const closeChat = () => {
    threadRequestRef.current += 1;
    setIsOpen(false);
  };

  const openThread = (peerId: string) => {
    activeChatIdRef.current = peerId;
    threadRequestRef.current += 1;
    setActiveChatId(peerId);
    setMessages([]);
    setOutbox([]);
    setThreadLoading(true);
    setShowPlus(false);
    void loadThread(peerId);
  };

  const closeThread = () => {
    activeChatIdRef.current = null;
    threadRequestRef.current += 1;
    setActiveChatId(null);
    setMessages([]);
    setOutbox([]);
    setThreadLoading(false);
    setShowPlus(false);
  };

  const dispatchSend = useCallback(
    (peerId: string, entry: OutboxMsg) => {
      startTransition(async () => {
        const res = await sendStaffMessage(peerId, entry.content);
        if (!res?.success) {
          setOutbox((prev) =>
            prev.map((o) => (o.localId === entry.localId ? { ...o, status: 'failed' } : o))
          );
          return;
        }
        setOutbox((prev) => prev.filter((o) => o.localId !== entry.localId));
        loadThread(peerId, { silent: true });
      });
    },
    [loadThread]
  );

  const sendContent = (content: string) => {
    const body = content.trim();
    if (!body || !activeChatId) return;
    const entry: OutboxMsg = {
      localId: `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      content: body,
      createdAt: new Date().toISOString(),
      status: 'sending',
    };
    setOutbox((prev) => [...prev, entry]);
    dispatchSend(activeChatId, entry);
  };

  const handleSend = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!text.trim()) return;
    sendContent(text);
    setText('');
    requestAnimationFrame(autosize);
  };

  const retrySend = (entry: OutboxMsg) => {
    if (!activeChatId) return;
    setOutbox((prev) =>
      prev.map((o) => (o.localId === entry.localId ? { ...o, status: 'sending' } : o))
    );
    dispatchSend(activeChatId, { ...entry, status: 'sending' });
  };

  const startInstantCall = () => {
    setShowPlus(false);
    if (!activeChatId) return;
    const room = `RasStaffCall-${activeChatId.slice(0, 8)}-${Date.now().toString(36)}`;
    const url = `https://meet.jit.si/${room}`;
    sendContent(`${CALL_INVITE_PREFIX}${url}`);
    openJitsiWindow(`${url}#config.prejoinPageEnabled=false`);
  };

  const activeStaff = staff.find((s) => s.id === activeChatId);
  const lastReadMineId = [...messages].reverse().find((m) => m.isMine && m.readAt)?.id;

  return (
    <>
      {/* Floating launcher */}
      <button
        suppressHydrationWarning
        type="button"
        onClick={openChat}
        title="Open staff chat"
        className={`fixed bottom-6 right-6 w-14 h-14 bg-brand-orange-500 hover:bg-brand-orange-600 text-white rounded-full shadow-[0_0_24px_rgba(255,122,69,0.45)] flex items-center justify-center transition-all duration-300 z-50 cursor-pointer border border-white/20 ${
          isOpen ? 'scale-0 opacity-0' : 'scale-100 opacity-100 hover:scale-110'
        }`}
      >
        <MessageCircle className="w-6 h-6" />
      </button>

      {/* Chat window */}
      <div
        className={`fixed bottom-6 right-6 w-[min(380px,calc(100vw-2rem))] h-[560px] max-h-[80vh] bg-zinc-950/90 backdrop-blur-xl border border-white/10 rounded-3xl shadow-2xl flex flex-col overflow-hidden transition-all duration-300 z-50 origin-bottom-right ${
          isOpen ? 'scale-100 opacity-100' : 'scale-50 opacity-0 pointer-events-none'
        }`}
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(255,122,69,0.12),_transparent_55%)]" />

        {/* Header */}
        <div className="relative h-16 px-4 flex items-center justify-between shrink-0 border-b border-white/10 bg-zinc-900/80 backdrop-blur-xl">
          <div className="flex items-center gap-3 min-w-0">
            {activeChatId ? (
              <button
                suppressHydrationWarning
                type="button"
                onClick={closeThread}
                className="p-1.5 hover:bg-white/10 rounded-full transition-colors cursor-pointer text-zinc-300"
                title="Back to staff list"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
            ) : (
              <div className="w-9 h-9 rounded-2xl bg-brand-orange-500/15 border border-brand-orange-500/30 text-brand-orange-400 flex items-center justify-center">
                <Users className="w-4.5 h-4.5" />
              </div>
            )}
            {activeStaff ? (
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-2xl bg-brand-orange-500 text-white flex items-center justify-center font-black text-xs shrink-0 shadow-md shadow-orange-500/20">
                  {initialsOf(activeStaff.firstName, activeStaff.lastName)}
                </div>
                <div className="min-w-0">
                  <p className="font-black text-sm text-white font-heading truncate">
                    {activeStaff.firstName} {activeStaff.lastName}
                  </p>
                  <p className="text-[10px] text-zinc-400 font-mono flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    {activeStaff.role.replace(/_/g, ' ')}
                  </p>
                </div>
              </div>
            ) : (
              <span className="font-black text-sm text-white font-heading">Clinic Staff Chat</span>
            )}
          </div>
          <button
            suppressHydrationWarning
            type="button"
            onClick={closeChat}
            className="p-1.5 hover:bg-white/10 rounded-full transition-colors cursor-pointer text-zinc-300"
            title="Close chat"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        {!activeChatId ? (
          <div className="relative flex-1 overflow-y-auto p-2">
            <p className="text-[10px] font-mono font-black text-zinc-500 uppercase tracking-wider p-2 mb-1">
              Direct messages
            </p>
            {staffLoading ? (
              <div className="flex flex-col items-center justify-center gap-2 text-zinc-500 mt-16">
                <Loader2 className="w-5 h-5 animate-spin text-brand-orange-400" />
                <p className="text-xs font-mono">Loading staff…</p>
              </div>
            ) : staff.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 text-center mt-16 px-6">
                <Users className="w-8 h-8 text-zinc-700" />
                <p className="text-xs font-bold text-zinc-300">No teammates found</p>
                <p className="text-[11px] font-mono text-zinc-500 leading-relaxed">
                  Active staff members will appear here for direct messaging.
                </p>
              </div>
            ) : (
              staff.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => openThread(s.id)}
                  className="w-full text-left flex items-center gap-3 p-3 hover:bg-white/5 border border-transparent hover:border-brand-orange-500/30 rounded-2xl transition-all duration-300 cursor-pointer group"
                >
                  <div className="w-10 h-10 bg-brand-orange-500/15 border border-brand-orange-500/30 text-brand-orange-400 rounded-2xl flex items-center justify-center font-black text-xs shrink-0 group-hover:bg-brand-orange-500 group-hover:text-white transition-colors">
                    {initialsOf(s.firstName, s.lastName)}
                  </div>
                  <div className="min-w-0">
                    <div className="font-bold text-sm text-white truncate">
                      {s.firstName} {s.lastName}
                    </div>
                    <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-wide">
                      {s.role.replace(/_/g, ' ')}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        ) : (
          <div className="relative flex-1 flex flex-col min-h-0">
            <div className="flex-1 overflow-y-auto p-4 space-y-1">
              {threadLoading && messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center gap-2 text-zinc-500">
                  <Loader2 className="w-5 h-5 animate-spin text-brand-orange-400" />
                  <p className="text-xs font-mono">Loading messages…</p>
                </div>
              ) : messages.length === 0 && outbox.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center gap-2 px-6">
                  <MessageCircle className="w-8 h-8 text-zinc-700" />
                  <p className="text-sm font-black text-zinc-200">No messages yet</p>
                  <p className="text-[11px] font-mono text-zinc-500 leading-relaxed">
                    Start a conversation with {activeStaff?.firstName} — messages are private
                    between you two.
                  </p>
                </div>
              ) : (
                <>
                  {messages.map((msg, i) => {
                    const prev = messages[i - 1];
                    const groupStart = isGroupStart(prev, msg);
                    const newDay =
                      !prev ||
                      new Date(prev.createdAt).toDateString() !==
                        new Date(msg.createdAt).toDateString();
                    const isCall = msg.content.includes('meet.jit.si/');
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
                          className={`flex items-end gap-2 ${msg.isMine ? 'justify-end' : 'justify-start'} ${groupStart && !newDay ? 'mt-3' : 'mt-0.5'}`}
                        >
                          {!msg.isMine && (
                            <div
                              className={`w-7 h-7 rounded-xl bg-zinc-800 border border-white/10 text-zinc-200 flex items-center justify-center font-black text-[10px] shrink-0 ${
                                groupStart ? '' : 'invisible'
                              }`}
                            >
                              {initialsOf(activeStaff?.firstName, activeStaff?.lastName)}
                            </div>
                          )}
                          <div className="max-w-[80%] flex flex-col gap-1">
                            <div
                              className={`rounded-2xl px-3.5 py-2 text-xs leading-relaxed shadow-md backdrop-blur-xl border ${
                                msg.isMine
                                  ? `bg-brand-orange-500/90 text-white border-brand-orange-400/30 ${groupStart ? 'rounded-br-md' : ''}`
                                  : `bg-zinc-900/80 text-zinc-100 border-white/10 ${groupStart ? 'rounded-bl-md' : ''}`
                              }`}
                            >
                              {isCall ? (
                                <CallCard content={msg.content} mine={msg.isMine} />
                              ) : (
                                <p className="whitespace-pre-wrap font-medium">{msg.content}</p>
                              )}
                            </div>
                            <div
                              className={`flex items-center gap-1 px-1 ${msg.isMine ? 'justify-end' : 'justify-start'}`}
                            >
                              <span className="text-[9px] font-mono text-zinc-500">
                                {timeLabel(msg.createdAt)}
                              </span>
                              {msg.isMine &&
                                (msg.id === lastReadMineId ? (
                                  <span className="flex items-center gap-0.5 text-[9px] font-mono text-emerald-400">
                                    <CheckCheck className="w-3 h-3" /> Read
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
                    const isCall = o.content.includes('meet.jit.si/');
                    return (
                      <div key={o.localId} className="flex justify-end mt-0.5">
                        <div className="max-w-[80%] flex flex-col gap-1 items-end">
                          <div
                            className={`rounded-2xl px-3.5 py-2 text-xs leading-relaxed shadow-md backdrop-blur-xl border ${
                              o.status === 'failed'
                                ? 'bg-rose-500/15 text-rose-100 border-rose-500/40'
                                : 'bg-brand-orange-500/60 text-white border-brand-orange-400/20'
                            }`}
                          >
                            {isCall ? (
                              <CallCard content={o.content} mine />
                            ) : (
                              <p className="whitespace-pre-wrap font-medium">{o.content}</p>
                            )}
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

            {/* Composer */}
            <div className="relative p-3 border-t border-white/10 bg-zinc-900/80 backdrop-blur-xl">
              {showPlus && (
                <div className="absolute bottom-[64px] left-3 w-60 rounded-2xl border border-white/15 bg-zinc-950/95 backdrop-blur-2xl shadow-2xl p-2 space-y-1 z-20">
                  <button
                    type="button"
                    onClick={startInstantCall}
                    className="w-full flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[11px] font-bold text-zinc-200 hover:bg-brand-orange-500/15 border border-transparent hover:border-brand-orange-500/30 cursor-pointer transition-all"
                  >
                    <div className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                      <Video className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="block text-white">Instant Jitsi call</span>
                      <span className="text-[9px] text-zinc-400 font-mono">
                        Opens room + invites {activeStaff?.firstName}
                      </span>
                    </div>
                  </button>
                  <div
                    className="w-full flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[11px] font-bold text-zinc-500 border border-transparent cursor-not-allowed opacity-60"
                    title="Staff chat attachments require storage wiring — coming soon"
                  >
                    <div className="w-7 h-7 rounded-lg bg-blue-500/10 text-blue-500/60 flex items-center justify-center shrink-0">
                      <Paperclip className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="block">Upload PDF / file</span>
                      <span className="text-[9px] font-mono">Storage wiring pending</span>
                    </div>
                  </div>
                </div>
              )}
              <form onSubmit={handleSend} className="flex items-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowPlus((v) => !v)}
                  title="Attachments & call"
                  className={`w-10 h-10 rounded-2xl border flex items-center justify-center transition-all cursor-pointer shrink-0 shadow-[0_0_16px_rgba(255,122,69,0.25)] ${
                    showPlus
                      ? 'bg-brand-orange-500 text-white border-brand-orange-400 rotate-45'
                      : 'bg-brand-orange-500/15 border-brand-orange-500/40 text-brand-orange-400 hover:bg-brand-orange-500/25'
                  }`}
                >
                  <Plus className="w-5 h-5 transition-transform" />
                </button>
                <textarea
                  ref={textareaRef}
                  rows={1}
                  value={text}
                  onChange={(e) => {
                    setText(e.target.value);
                    autosize();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder={`Message ${activeStaff?.firstName || 'teammate'}…`}
                  className="flex-1 resize-none bg-zinc-950 border border-white/10 focus:border-brand-orange-500/50 rounded-2xl px-4 py-2.5 text-xs text-white placeholder:text-zinc-500 outline-none transition-colors font-medium max-h-[110px]"
                />
                <button
                  type="submit"
                  disabled={!text.trim()}
                  title="Send message"
                  className="bg-brand-orange-500 hover:bg-brand-orange-600 disabled:opacity-40 text-white rounded-2xl w-10 h-10 flex items-center justify-center transition-colors shrink-0 cursor-pointer disabled:cursor-not-allowed shadow-lg shadow-orange-500/20"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
