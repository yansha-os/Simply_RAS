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
} from 'lucide-react';
import { sendClientMessage } from '@/app/(dashboard)/portal-case/actions';

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
}: {
  clientId: string;
  initialMessages: ClientMsg[];
}) {
  const router = useRouter();
  const [messageText, setMessageText] = useState('');
  const [serverMessages, setServerMessages] = useState<ClientMsg[]>(initialMessages);
  const [previousInitialMessages, setPreviousInitialMessages] = useState(initialMessages);
  const [outbox, setOutbox] = useState<OutboxMsg[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [, startTransition] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [serverMessages.length, outbox.length]);

  // Reconcile during render when router.refresh() supplies a new snapshot.
  // React applies this guarded adjustment before committing children, while
  // failed and still-unmatched optimistic entries remain available to retry.
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

  const lastReadStaffId = useMemo(
    () => [...serverMessages].reverse().find((m) => !m.isFromClient && m.readAt)?.id,
    [serverMessages]
  );

  return (
    <div className="space-y-6 animate-slide-up">
      <Card className="border-[var(--line)] shadow-sm w-full bg-[var(--surface)]">
        <CardHeader className="pb-4 border-b border-[var(--line)] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <CardTitle className="text-lg text-[var(--ink-100)] flex items-center gap-3">
              <MessageSquare className="w-5 h-5 text-[var(--teal)]" />
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
            <span className="text-xs font-mono text-cyan-400 truncate max-w-[180px]">
              http://localhost:3000/magic-link/{clientId}
            </span>
            <Button
              variant="secondary"
              size="sm"
              className="h-7 text-[11px] px-2.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg cursor-pointer"
              onClick={(e) => {
                navigator.clipboard.writeText(`http://localhost:3000/magic-link/${clientId}`);
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
          <div className="flex flex-col h-[60vh] bg-zinc-950/95 relative overflow-hidden rounded-b-xl">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(6,182,212,0.08),_transparent_55%)]" />

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
                className="flex items-center gap-1.5 text-[10px] font-mono font-bold text-zinc-400 hover:text-white border border-white/10 hover:border-cyan-500/40 rounded-lg px-2.5 py-1.5 transition-all cursor-pointer"
              >
                <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>

            <div className="relative flex-1 overflow-y-auto p-5 space-y-1">
              {serverMessages.length === 0 && outbox.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center gap-3 px-6">
                  <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
                    <MessageSquare className="w-7 h-7 text-zinc-600" />
                  </div>
                  <p className="text-sm font-bold text-zinc-200">No messages yet</p>
                  <p className="text-xs text-zinc-500 font-mono max-w-xs leading-relaxed">
                    Send an update to the family — it lands instantly in their magic-link
                    portal.
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
                          <div className="max-w-[75%] flex flex-col gap-1">
                            {groupStart && msg.isFromClient && (
                              <span className="text-[10px] font-bold text-cyan-400 px-1">
                                {msg.senderName}
                              </span>
                            )}
                            <div
                              className={`rounded-2xl px-4 py-2.5 text-[13px] leading-relaxed shadow-md backdrop-blur-xl border ${
                                msg.isFromClient
                                  ? `bg-zinc-900/80 text-zinc-100 border-white/10 ${groupStart ? 'rounded-bl-md' : ''}`
                                  : `bg-cyan-600/90 text-white border-cyan-400/30 ${groupStart ? 'rounded-br-md' : ''}`
                              }`}
                            >
                              <p className="whitespace-pre-wrap font-medium">{msg.content}</p>
                            </div>
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
                  {outbox.map((o) => (
                    <div key={o.localId} className="flex justify-end mt-0.5">
                      <div className="max-w-[75%] flex flex-col gap-1 items-end">
                        <div
                          className={`rounded-2xl px-4 py-2.5 text-[13px] leading-relaxed shadow-md backdrop-blur-xl border ${
                            o.status === 'failed'
                              ? 'bg-rose-500/15 text-rose-100 border-rose-500/40'
                              : 'bg-cyan-600/60 text-white border-cyan-400/20'
                          }`}
                        >
                          <p className="whitespace-pre-wrap font-medium">{o.content}</p>
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
                  ))}
                </>
              )}
              <div ref={bottomRef} />
            </div>

            <form
              onSubmit={handleSendMessage}
              className="relative p-4 border-t border-white/10 bg-zinc-900/80 backdrop-blur-xl flex items-end gap-3"
            >
              <textarea
                ref={textareaRef}
                rows={1}
                placeholder="Type a message to the family… (Enter to send, Shift+Enter for a new line)"
                className="flex-1 resize-none bg-zinc-950 border border-white/10 rounded-2xl px-4 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-cyan-500/50 transition-colors font-medium max-h-[120px]"
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
                className="bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-2xl px-5 font-semibold transition-colors shadow-lg shadow-cyan-500/20 flex items-center gap-2 h-auto py-2.5 cursor-pointer shrink-0"
              >
                <Send className="w-4 h-4" />
                Send
              </Button>
            </form>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
