'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import {
  MessageSquare,
  Users,
  Stethoscope,
  Send,
  Plus,
  Video,
  Paperclip,
  X,
  Briefcase,
  Bell,
  Sparkles,
  CheckCircle2,
  Inbox,
  ExternalLink,
  RefreshCw,
  UserRound,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  getRbtCommunicationInbox,
  getRbtStaffThread,
  sendRbtStaffMessage,
  type StaffCommInbox,
  type StaffCommMessage,
  type StaffCommPeer,
  type StaffCommPeerKind,
} from '@/app/actions/staffCommunicationActions';
import { markNotificationAsRead } from '@/app/actions/notificationActions';

/** Keep in sync with staffCommunicationActions NOTIFICATIONS_CHANNEL_ID. */
const NOTIFICATIONS_CHANNEL_ID = '__notifications__';
const EMPTY_PEERS: StaffCommPeer[] = [];

type GroupDef = { kind: StaffCommPeerKind; title: string; icon: React.ReactNode };

/**
 * Optimistic sends live outside `messages` so the 12s polling refresh can
 * never wipe an in-flight or failed message before the user can retry it.
 */
type OutboxEntry = {
  localId: string;
  text: string;
  kind: 'TEXT' | 'JITSI_CALL' | 'DOCUMENT';
  callRoomUrl?: string;
  fileName?: string;
  status: 'sending' | 'failed';
};

/** Discord-style grouping: consecutive same-side messages within 5 minutes. */
function isGroupStart(prev: StaffCommMessage | undefined, curr: StaffCommMessage) {
  if (!prev) return true;
  if (prev.mine !== curr.mine) return true;
  return new Date(curr.createdAt).getTime() - new Date(prev.createdAt).getTime() > 5 * 60 * 1000;
}

const GROUPS: GroupDef[] = [
  { kind: 'NOTIFICATIONS', title: 'Alerts', icon: <Bell className="w-3.5 h-3.5" /> },
  { kind: 'CASE_COORD', title: 'Case Coordinators', icon: <Users className="w-3.5 h-3.5" /> },
  { kind: 'BCBA', title: 'BCBAs', icon: <Stethoscope className="w-3.5 h-3.5" /> },
  { kind: 'STAFF', title: 'Other staff', icon: <UserRound className="w-3.5 h-3.5" /> },
];

function formatNotifTime(iso: string) {
  try {
    return new Date(iso).toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function RbtStaffCommunicationView() {
  const [inbox, setInbox] = useState<StaffCommInbox | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(NOTIFICATIONS_CHANNEL_ID);
  const [messages, setMessages] = useState<StaffCommMessage[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [draft, setDraft] = useState('');
  const [outbox, setOutbox] = useState<OutboxEntry[]>([]);
  const [showPlus, setShowPlus] = useState(false);
  const [isPending, startTransition] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const threadRequestGenerationRef = useRef(0);

  const peers = inbox?.peers || EMPTY_PEERS;
  const selected: StaffCommPeer | null =
    peers.find((p) => p.id === selectedId) || peers[0] || null;
  const isNotifChannel = selected?.id === NOTIFICATIONS_CHANNEL_ID;

  const refreshInbox = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    const res = await getRbtCommunicationInbox();
    setInbox(res);
    if (!opts?.silent) setLoading(false);
    return res;
  }, []);

  const loadThread = useCallback(async (peerId: string) => {
    const requestGeneration = ++threadRequestGenerationRef.current;
    if (!peerId || peerId === NOTIFICATIONS_CHANNEL_ID) {
      setMessages([]);
      return;
    }
    setThreadLoading(true);
    const res = await getRbtStaffThread(peerId);
    if (requestGeneration !== threadRequestGenerationRef.current) return;
    if (res.success) setMessages(res.messages);
    else {
      setMessages([]);
      toast.error(res.error || 'Could not load thread');
    }
    setThreadLoading(false);
  }, []);

  useEffect(() => {
    let active = true;
    const poll = () => {
      void getRbtCommunicationInbox().then((res) => {
        if (!active) return;
        setInbox(res);
        setLoading(false);
      });

      if (selectedId && selectedId !== NOTIFICATIONS_CHANNEL_ID) {
        const requestGeneration = ++threadRequestGenerationRef.current;
        void getRbtStaffThread(selectedId).then((res) => {
          if (
            !active ||
            requestGeneration !== threadRequestGenerationRef.current
          ) {
            return;
          }
          if (res.success) {
            setMessages(res.messages);
          } else {
            setMessages([]);
            toast.error(res.error || 'Could not load thread');
          }
          setThreadLoading(false);
        });
      }
    };

    poll();
    const interval = window.setInterval(poll, 12000);
    return () => {
      active = false;
      threadRequestGenerationRef.current += 1;
      window.clearInterval(interval);
    };
  }, [selectedId]);

  const selectThread = (peerId: string) => {
    threadRequestGenerationRef.current += 1;
    setSelectedId(peerId);
    setOutbox([]);
    setShowPlus(false);
    if (peerId === NOTIFICATIONS_CHANNEL_ID) {
      setMessages([]);
      setThreadLoading(false);
    } else {
      setThreadLoading(true);
    }
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, outbox.length, selectedId, inbox?.notifications?.length]);

  const autosize = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  };

  const dispatchOutbox = useCallback(
    (peerId: string, entry: OutboxEntry) => {
      startTransition(async () => {
        const opts =
          entry.kind === 'TEXT'
            ? undefined
            : { kind: entry.kind, callRoomUrl: entry.callRoomUrl, fileName: entry.fileName };
        const res = await sendRbtStaffMessage(peerId, entry.text, opts);
        if (!res.success) {
          toast.error(res.error || 'Send failed');
          setOutbox((prev) =>
            prev.map((o) => (o.localId === entry.localId ? { ...o, status: 'failed' } : o))
          );
          return;
        }
        if (entry.kind === 'JITSI_CALL') {
          toast.success('Call request posted — wait for host to join first, then connect.');
        } else if (entry.kind === 'DOCUMENT') {
          toast.success('Document noted in thread (filename only — upload storage TBD)');
        }
        setOutbox((prev) => prev.filter((o) => o.localId !== entry.localId));
        if (res.message) {
          setMessages((prev) => [...prev, res.message!]);
        }
        refreshInbox({ silent: true });
      });
    },
    [refreshInbox]
  );

  const enqueue = (entry: Omit<OutboxEntry, 'localId' | 'status'>) => {
    if (!selected || isNotifChannel) return;
    const full: OutboxEntry = {
      ...entry,
      localId: `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      status: 'sending',
    };
    setOutbox((prev) => [...prev, full]);
    dispatchOutbox(selected.id, full);
  };

  const retryEntry = (entry: OutboxEntry) => {
    if (!selected || isNotifChannel) return;
    setOutbox((prev) =>
      prev.map((o) => (o.localId === entry.localId ? { ...o, status: 'sending' } : o))
    );
    dispatchOutbox(selected.id, { ...entry, status: 'sending' });
  };

  const sendText = (text: string) => {
    const body = text.trim();
    if (!body) return;
    setDraft('');
    requestAnimationFrame(autosize);
    enqueue({ text: body, kind: 'TEXT' });
  };

  const requestCall = () => {
    if (!selected || isNotifChannel) return;
    const room = `ras-rbt-${selected.id.slice(0, 8)}-${Date.now().toString(36)}`;
    const url = `https://meet.jit.si/${room}`;
    setShowPlus(false);
    enqueue({
      text: '📞 Requested an instant 1-on-1 video call',
      kind: 'JITSI_CALL',
      callRoomUrl: url,
    });
  };

  const onFile = (file: File | null) => {
    if (!file) return;
    setShowPlus(false);
    enqueue({ text: file.name, kind: 'DOCUMENT', fileName: file.name });
  };

  const groupedPeers = useMemo(() => {
    return GROUPS.map((g) => ({
      ...g,
      items: peers.filter((p) => p.kind === g.kind),
    })).filter((g) => g.items.length > 0);
  }, [peers]);

  const cases = inbox?.cases || [];
  const notifications = inbox?.notifications || [];

  return (
    <div className="max-w-6xl mx-auto space-y-5 animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <MessageSquare className="w-7 h-7 text-[#F97316]" />
            <h1 className="text-3xl font-black text-slate-900 font-heading tracking-tight">
              Care Team Communication
            </h1>
          </div>
          <p className="text-xs text-slate-600 font-semibold mt-1 max-w-2xl">
            Real threads with Case Coordinators and assigned BCBAs. Alerts from staffing and clinical
            workflows land in Notifications — no demo chats.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              refreshInbox().then(() => {
                if (selectedId && selectedId !== NOTIFICATIONS_CHANNEL_ID) loadThread(selectedId);
              });
            }}
            className="inline-flex items-center gap-2 rounded-2xl border-2 border-orange-200 bg-white/80 backdrop-blur-xl text-slate-700 text-xs font-black px-3.5 py-2.5 shadow-sm hover:border-[#F97316]/50 cursor-pointer transition-all"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <Link
            href="/rbt/job-board"
            className="inline-flex items-center gap-2 rounded-2xl bg-[#F97316] hover:bg-orange-600 text-white text-xs font-black px-4 py-2.5 shadow-lg cursor-pointer transition-all"
          >
            <Briefcase className="w-4 h-4" />
            Open Job Board
          </Link>
        </div>
      </div>

      {cases.length === 0 && (
        <div className="rounded-3xl border border-amber-500/20 bg-amber-50/80 backdrop-blur-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/80 border border-amber-200 text-[#F97316] flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900 font-heading">No case applications yet</h3>
              <p className="text-xs text-slate-600 font-medium mt-0.5">
                You can still message Case Coordinators. Apply on the Job Board to get a supervising BCBA
                on your caseload — family updates arrive via Notifications.
              </p>
            </div>
          </div>
          <Link
            href="/rbt/job-board"
            className="shrink-0 text-center rounded-xl border-2 border-[#F97316] bg-white text-[#F97316] hover:bg-orange-50 text-[11px] font-black px-3.5 py-2 cursor-pointer"
          >
            Go to Job Board →
          </Link>
        </div>
      )}

      {cases.length > 0 && (
        <div className="rounded-3xl border border-white/40 bg-white/70 backdrop-blur-xl p-3.5 shadow-sm">
          <p className="text-[10px] font-mono font-black uppercase tracking-wider text-[#F97316] mb-2 px-1">
            Your cases
          </p>
          <div className="flex flex-wrap gap-2">
            {cases.map((c) => (
              <div
                key={c.id}
                className="rounded-2xl border border-orange-100 bg-[#FFF7ED]/90 px-3 py-2 text-[11px]"
              >
                <span className="font-black text-slate-900 font-mono">{c.caseCode}</span>
                <span className="text-slate-500 font-semibold ml-2">
                  {c.clientInitials || '—'}
                  {c.neighborhood ? ` · ${c.neighborhood}` : ''}
                </span>
                <span className="ml-2 rounded-lg bg-emerald-500/10 text-emerald-700 border border-emerald-500/20 px-1.5 py-0.5 text-[9px] font-black uppercase">
                  {c.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4 min-h-[560px]">
        {/* Channel list */}
        <div className="rounded-3xl border border-orange-200/80 bg-white/80 backdrop-blur-xl shadow-xl overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-orange-100/80 bg-[#FFF7ED]/90 backdrop-blur-xl">
            <span className="text-[10px] font-mono font-black uppercase tracking-wider text-[#F97316]">
              Threads
            </span>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-3 custom-scrollbar">
            {loading && peers.length === 0 ? (
              <p className="text-xs text-slate-500 font-medium px-3 py-6 text-center">Loading inbox…</p>
            ) : groupedPeers.length === 0 ? (
              <div className="px-3 py-8 text-center space-y-2">
                <Inbox className="w-8 h-8 text-slate-300 mx-auto" />
                <p className="text-xs text-slate-500 font-semibold">
                  No staff contacts yet. Alerts will appear under Notifications when staffing or clinical
                  events fire.
                </p>
              </div>
            ) : (
              groupedPeers.map((g) => (
                <div key={g.kind} className="space-y-1.5">
                  <div className="px-2 pt-1 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-slate-500">
                    {g.icon}
                    {g.title}
                  </div>
                  {g.items.map((c) => {
                    const active = selected?.id === c.id;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => selectThread(c.id)}
                        className={`w-full text-left rounded-2xl border px-3 py-2.5 transition-all duration-300 cursor-pointer hover:scale-[1.01] ${
                          active
                            ? 'bg-orange-50 border-[#F97316]/40 shadow-md'
                            : 'bg-[#F0F7FF]/80 border-blue-100/80 hover:border-[#F97316]/40 hover:shadow-lg'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <div
                            className={`w-9 h-9 rounded-xl flex items-center justify-center text-[11px] font-black shrink-0 ${
                              c.kind === 'NOTIFICATIONS'
                                ? 'bg-sky-500 text-white shadow-md shadow-sky-500/20'
                                : 'bg-[#F97316] text-white shadow-md shadow-orange-500/20'
                            }`}
                          >
                            {c.kind === 'NOTIFICATIONS' ? (
                              <Bell className="w-3.5 h-3.5" />
                            ) : (
                              c.initials
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <p className="text-xs font-black text-slate-900 truncate">{c.name}</p>
                              {c.unreadCount > 0 && (
                                <span className="shrink-0 rounded-full bg-[#F97316] text-white text-[9px] font-black px-1.5 py-0.5">
                                  {c.unreadCount}
                                </span>
                              )}
                            </div>
                            <p className="text-[10px] text-slate-500 font-medium truncate">
                              {c.lastPreview || c.subtitle}
                            </p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Chat pane */}
        <div className="rounded-3xl border border-[#E2D5B7] bg-[#FFFDF8] text-slate-900 shadow-xl overflow-hidden flex flex-col min-h-[520px] relative">
          {!selected ? (
            <div className="relative flex-1 flex items-center justify-center p-8 text-center text-slate-500 text-sm">
              Select a thread or open Notifications.
            </div>
          ) : isNotifChannel ? (
            <>
              <div className="relative px-4 py-3 border-b border-[#E2D5B7] flex items-center justify-between bg-[#FFFDF8]">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-sky-100 border border-sky-200 text-sky-800 flex items-center justify-center">
                    <Bell className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-sm font-black text-slate-900">Notifications</p>
                    <p className="text-[10px] text-slate-500 font-mono flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-sky-500 animate-pulse" />
                      Coming from staffing &amp; clinical alerts
                    </p>
                  </div>
                </div>
                <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-slate-500 border border-[#E2D5B7] bg-[#F9F5EC] px-2 py-1 rounded-lg">
                  Read-only feed
                </span>
              </div>

              <div className="relative flex-1 overflow-y-auto p-4 space-y-3 bg-[#F9F5EC] custom-scrollbar">
                {notifications.length === 0 ? (
                  <div className="h-full min-h-[280px] flex flex-col items-center justify-center text-center gap-3 px-6">
                    <div className="w-14 h-14 rounded-2xl bg-white border border-[#E2D5B7] flex items-center justify-center">
                      <Inbox className="w-7 h-7 text-slate-400" />
                    </div>
                    <div>
                      <h3 className="text-base font-black font-heading text-slate-900">No alerts yet</h3>
                      <p className="text-xs text-slate-600 mt-1.5 max-w-sm mx-auto leading-relaxed">
                        When Case Coord, BCBA, or HR send staffing updates, job matches, or note
                        reminders, they show up here from the Notifications system — not as fake demo
                        chats.
                      </p>
                    </div>
                    <Link
                      href="/rbt/help-desk"
                      className="mt-2 rounded-2xl border border-[#E2D5B7] bg-white hover:bg-orange-50 text-slate-800 text-[11px] font-black px-4 py-2 cursor-pointer transition-all"
                    >
                      Need help? Open Help Desk →
                    </Link>
                  </div>
                ) : (
                  notifications.map((n) => (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => {
                        if (!n.isRead) {
                          markNotificationAsRead(n.id).then(() => refreshInbox({ silent: true }));
                        }
                      }}
                      className={`w-full text-left rounded-2xl border px-3.5 py-3 transition-all duration-300 cursor-pointer hover:scale-[1.01] hover:border-[#F97316]/40 ${
                        n.isRead
                          ? 'bg-white border-[#E2D5B7] text-slate-900'
                          : 'bg-sky-50 border-sky-300 text-slate-900 shadow-sm'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-xs font-black text-slate-900">{n.title}</p>
                        {!n.isRead && (
                          <span className="dot-live shrink-0 w-2 h-2 rounded-full bg-sky-500 mt-1" />
                        )}
                      </div>
                      <p className="text-[11px] text-slate-700 mt-1 leading-relaxed whitespace-pre-wrap">
                        {n.message}
                      </p>
                      <div className="flex items-center justify-between mt-2 gap-2">
                        <span className="text-[9px] font-mono text-slate-500">
                          {formatNotifTime(n.createdAt)} · {n.type}
                        </span>
                        {n.linkUrl && (
                          <Link
                            href={n.linkUrl.startsWith('http') ? n.linkUrl : n.linkUrl}
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1 text-[10px] font-black text-[#F97316] hover:underline cursor-pointer"
                          >
                            Open <ExternalLink className="w-3 h-3" />
                          </Link>
                        )}
                      </div>
                    </button>
                  ))
                )}
                <div ref={bottomRef} />
              </div>
            </>
          ) : (
            <>
              <div className="relative px-4 py-3 border-b border-[#E2D5B7] flex items-center justify-between bg-[#FFFDF8]">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-[#F97316] text-white flex items-center justify-center text-xs font-black">
                    {selected.initials}
                  </div>
                  <div>
                    <p className="text-sm font-black text-slate-900">{selected.name}</p>
                    <p className="text-[10px] text-slate-500 font-mono flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      {selected.subtitle} · live StaffMessage thread
                    </p>
                  </div>
                </div>
                <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-slate-500 border border-[#E2D5B7] bg-[#F9F5EC] px-2 py-1 rounded-lg">
                  HIPAA · Professional
                </span>
              </div>

              <div className="relative flex-1 overflow-y-auto p-4 bg-[#F9F5EC] custom-scrollbar">
                {threadLoading && messages.length === 0 ? (
                  <p className="text-center text-slate-500 text-xs py-16">Loading messages…</p>
                ) : messages.length === 0 && outbox.length === 0 ? (
                  <div className="h-full min-h-[240px] flex flex-col items-center justify-center text-center gap-2 px-6">
                    <MessageSquare className="w-8 h-8 text-slate-400" />
                    <p className="text-sm font-black text-slate-800">No messages yet</p>
                    <p className="text-[11px] text-slate-600 max-w-xs">
                      Start the conversation — Case Coord replies appear here. System alerts stay in
                      Notifications.
                    </p>
                  </div>
                ) : (
                  <>
                    {messages.map((m, i) => {
                      const groupStart = isGroupStart(messages[i - 1], m);
                      return (
                        <div
                          key={m.id}
                          className={`flex items-end gap-2 ${m.mine ? 'justify-end' : 'justify-start'} ${
                            groupStart ? 'mt-3 first:mt-0' : 'mt-1'
                          }`}
                        >
                          {!m.mine && (
                            <div
                              className={`w-7 h-7 rounded-xl bg-[#F97316] text-white flex items-center justify-center font-black text-[10px] shrink-0 shadow-sm ${
                                groupStart ? '' : 'invisible'
                              }`}
                            >
                              {selected.initials}
                            </div>
                          )}
                          <div
                            className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs shadow-sm ${
                              m.mine
                                ? `bg-brand-orange-500 text-white ${groupStart ? 'rounded-br-none' : ''}`
                                : `bg-white border border-[#E2D5B7] text-slate-800 ${groupStart ? 'rounded-bl-none' : ''}`
                            }`}
                          >
                            {!m.mine && groupStart && (
                              <p className="text-[10px] font-black text-[#F97316] mb-1">
                                {m.senderName}
                              </p>
                            )}
                            {m.type === 'JITSI_CALL' ? (
                              <div className="space-y-2">
                                <p className="font-semibold">{m.text}</p>
                                <p className="text-[10px] text-amber-800 font-medium">
                                  ⏳ Waiting for host to join first, then connect…
                                </p>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (!m.callRoomUrl) return;
                                    const isMobile = /iPhone|iPad|iPod|Android/i.test(
                                       navigator.userAgent
                                    );
                                    if (isMobile) window.open(m.callRoomUrl, '_blank');
                                    else
                                      window.open(
                                        m.callRoomUrl,
                                        'ras-jitsi',
                                        'width=1280,height=800'
                                      );
                                  }}
                                  className="w-full rounded-xl bg-emerald-600 text-white text-[11px] font-black py-2 cursor-pointer hover:bg-emerald-500"
                                >
                                  🟢 Join Video Call
                                </button>
                              </div>
                            ) : m.type === 'DOCUMENT' ? (
                              <div className="flex items-center gap-2 font-semibold">
                                <Paperclip className="w-3.5 h-3.5 text-[#F97316]" />
                                {m.fileName || m.text}
                              </div>
                            ) : (
                              <p className="font-medium leading-relaxed whitespace-pre-wrap">
                                {m.text}
                              </p>
                            )}
                            <p className="text-[9px] font-mono opacity-80 mt-1.5 text-right">
                              {m.timestamp}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                    {outbox.map((o) => (
                      <div key={o.localId} className="flex flex-col items-end mt-1 gap-1">
                        <div
                          className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs shadow-sm border ${
                            o.status === 'failed'
                              ? 'bg-rose-100 border-rose-300 text-rose-900'
                              : 'bg-brand-orange-500/80 text-white border-brand-orange-400/20'
                          }`}
                        >
                          {o.kind === 'DOCUMENT' ? (
                            <div className="flex items-center gap-2 font-semibold">
                              <Paperclip className="w-3.5 h-3.5 text-[#F97316]" />
                              {o.fileName || o.text}
                            </div>
                          ) : (
                            <p className="font-medium leading-relaxed whitespace-pre-wrap">
                              {o.text}
                            </p>
                          )}
                        </div>
                        {o.status === 'failed' ? (
                          <button
                            type="button"
                            onClick={() => retryEntry(o)}
                            className="flex items-center gap-1 text-[9px] font-mono font-black text-rose-600 hover:text-rose-700 cursor-pointer"
                          >
                            <RefreshCw className="w-3 h-3" />
                            Failed to send — tap to retry
                          </button>
                        ) : (
                          <span className="text-[9px] font-mono text-slate-500">Sending…</span>
                        )}
                      </div>
                    ))}
                  </>
                )}
                <div ref={bottomRef} />
              </div>

              <div className="relative p-3 border-t border-[#E2D5B7] bg-[#FFFDF8]">
                {showPlus && (
                  <div className="absolute bottom-[68px] left-3 w-56 rounded-2xl border border-[#E2D5B7] bg-[#FFFDF8] shadow-2xl p-2 space-y-1 z-20 animate-fade-in">
                    <button
                      type="button"
                      onClick={requestCall}
                      disabled={isPending}
                      className="w-full flex items-center gap-2 rounded-xl px-3 py-2 text-left text-[11px] font-bold text-slate-800 hover:bg-orange-50 cursor-pointer disabled:cursor-not-allowed"
                    >
                      <Video className="w-4 h-4 text-[#F97316]" />
                      Request Instant Call
                    </button>
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      disabled={isPending}
                      className="w-full flex items-center gap-2 rounded-xl px-3 py-2 text-left text-[11px] font-bold text-slate-800 hover:bg-orange-50 cursor-pointer disabled:cursor-not-allowed"
                    >
                      <Paperclip className="w-4 h-4 text-sky-600" />
                      Upload PDF / Document
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowPlus(false)}
                      className="w-full flex items-center gap-2 rounded-xl px-3 py-2 text-left text-[11px] font-bold text-slate-500 hover:bg-slate-100 cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                      Close
                    </button>
                  </div>
                )}
                <input
                  ref={fileRef}
                  type="file"
                  accept="application/pdf,image/*"
                  className="hidden"
                  onChange={(e) => onFile(e.target.files?.[0] || null)}
                />
                <form
                  className="flex items-end gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    sendText(draft);
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setShowPlus((v) => !v)}
                    className="w-10 h-10 rounded-2xl bg-orange-100 border border-orange-200 text-[#F97316] flex items-center justify-center hover:bg-orange-200 cursor-pointer shrink-0 shadow-sm"
                    title="Attachments & call"
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                  <textarea
                    ref={textareaRef}
                    value={draft}
                    onChange={(e) => {
                      setDraft(e.target.value);
                      autosize();
                    }}
                    rows={1}
                    placeholder={`Message ${selected.name.split(',')[0]}…`}
                    className="flex-1 resize-none rounded-2xl bg-[#F9F5EC] border border-[#E2D5B7] px-3.5 py-2.5 text-xs text-slate-900 placeholder:text-slate-400 outline-none focus:bg-white focus:border-[#F97316]/50 max-h-[120px]"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        sendText(draft);
                      }
                    }}
                  />
                  <button
                    type="submit"
                    disabled={!draft.trim() || isPending}
                    className="w-10 h-10 rounded-2xl bg-[#F97316] hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed text-white flex items-center justify-center cursor-pointer shrink-0 shadow-sm"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </form>
                <p className="text-[9px] text-slate-500 mt-2 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                  Keep PHI minimal — use initials and case codes when possible.
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
