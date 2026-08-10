'use client';

import React, { useState, useTransition } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { MessageSquare, Send } from 'lucide-react';
import { sendClientMessage } from '@/app/(dashboard)/portal-case/actions';

export default function ClientMessagesTab({ clientId, initialMessages }: { clientId: string, initialMessages: any[] }) {
  const [messageText, setMessageText] = useState('');
  const [isPending, startTransition] = useTransition();

  // Optimistic UI for smooth typing
  const [optimisticMessages, setOptimisticMessages] = useState<any[]>(initialMessages);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageText.trim()) return;
    
    const newMsg = {
      id: 'temp-' + Date.now(),
      clientId,
      content: messageText,
      isFromClient: false,
      senderName: 'Clinic Concierge',
      createdAt: new Date().toISOString()
    };
    
    setOptimisticMessages(prev => [...prev, newMsg]);
    setMessageText('');

    startTransition(async () => {
      await sendClientMessage(clientId, newMsg.content, false, 'Clinic Concierge');
    });
  };

  return (
    <div className="space-y-6 animate-slide-up">
      <Card className="border-[var(--line)] shadow-sm w-full bg-[var(--surface)]">
        <CardHeader className="pb-4 border-b border-[var(--line)] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <CardTitle className="text-lg text-[var(--ink-100)] flex items-center gap-3">
              <MessageSquare className="w-5 h-5 text-[var(--teal)]" />
              Client Communication
            </CardTitle>
            <p className="text-sm text-[var(--ink-400)] mt-1">Send messages directly to the parent's Zero-Trust portal.</p>
          </div>

          {/* Magic Link Header Box */}
          <div className="flex items-center gap-2 bg-zinc-900/90 border border-white/10 p-2 px-3 rounded-xl">
            <span className="text-[10px] font-mono text-zinc-400 uppercase font-bold">Magic Link:</span>
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
                setTimeout(() => { target.innerText = oldText; }, 2000);
              }}
            >
              Copy
            </Button>
          </div>
        </CardHeader>
        
        <CardContent className="p-0">
          <div className="flex flex-col h-[60vh] bg-[var(--background)]">
            
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {optimisticMessages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-[var(--ink-500)]">
                  <MessageSquare className="w-10 h-10 mb-3 opacity-30" />
                  <p className="text-sm">No messages yet. Send an update to the family!</p>
                </div>
              ) : (
                optimisticMessages.map(msg => (
                  <div key={msg.id} className={`flex flex-col ${msg.isFromClient ? 'items-start' : 'items-end'}`}>
                    <div className={`max-w-[70%] rounded-2xl px-4 py-3 text-[14px] leading-relaxed shadow-sm ${msg.isFromClient ? 'bg-[var(--surface-hover)] border border-[var(--line)] text-[var(--ink-200)] rounded-tl-none' : 'bg-blue-600 text-white rounded-tr-none'}`}>
                      {msg.content}
                    </div>
                    <span className="text-[10px] text-[var(--ink-500)] mt-1 px-1">
                      {msg.isFromClient ? msg.senderName : 'You'} • {new Date(msg.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                    </span>
                  </div>
                ))
              )}
            </div>

            <form onSubmit={handleSendMessage} className="p-4 border-t border-[var(--line)] bg-[var(--surface)] flex gap-3">
              <input 
                type="text" 
                placeholder="Type a message to the client..." 
                className="flex-1 bg-[var(--background)] border border-[var(--line)] rounded-full px-5 py-2.5 text-sm text-[var(--ink-100)] focus:outline-none focus:border-blue-500 transition-colors"
                value={messageText}
                onChange={e => setMessageText(e.target.value)}
              />
              <Button 
                type="submit" 
                disabled={isPending || !messageText.trim()}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-full px-6 font-semibold transition-colors shadow-sm flex items-center gap-2 h-auto py-2.5"
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
