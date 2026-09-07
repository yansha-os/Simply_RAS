'use client';

import React, { useState, useEffect, useTransition } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { CheckCircle2, AlertTriangle, MessageSquare, Calendar, Plus, ExternalLink, Clock, ShieldAlert } from 'lucide-react';
import { getActionItems, resolveActionItem, createActionItem } from '@/app/actions/actionItems';
import { toast } from 'sonner';
import Link from 'next/link';

type ActionItem = Awaited<ReturnType<typeof getActionItems>>['actionItems'][number];

export default function CaseCoordActionItems({ coordinatorId }: { coordinatorId?: string }) {
  const [items, setItems] = useState<ActionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'OPEN' | 'RESOLVED'>('OPEN');
  const [isPending, startTransition] = useTransition();

  // New item modal/form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');

  const loadItems = () => {
    setLoading(true);
    getActionItems(coordinatorId).then(res => {
      if (res.success) {
        setItems(res.actionItems);
      }
      setLoading(false);
    });
  };

  useEffect(() => {
    let cancelled = false;
    void getActionItems(coordinatorId).then((res) => {
      if (cancelled) return;
      if (res.success) setItems(res.actionItems);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [coordinatorId]);

  const handleResolve = (id: string) => {
    startTransition(async () => {
      const res = await resolveActionItem(id);
      if (res.success) {
        toast.success('Action item marked as resolved!');
        setItems(prev => prev.map(item => item.id === id ? { ...item, status: 'RESOLVED' } : item));
      } else {
        toast.error(res.error || 'Failed to resolve action item');
      }
    });
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    startTransition(async () => {
      const res = await createActionItem({
        title: newTitle,
        description: newDesc,
        assigneeId: coordinatorId
      });

      if (res.success) {
        toast.success('Action item created!');
        setNewTitle('');
        setNewDesc('');
        setShowAddForm(false);
        loadItems();
      } else {
        toast.error(res.error || 'Failed to create action item');
      }
    });
  };

  const filteredItems = items.filter(item => item.status === filter);
  const openCount = items.filter(item => item.status === 'OPEN').length;

  return (
    <Card className="border-white/10 bg-zinc-950 shadow-lg">
      <CardHeader className="pb-4 border-b border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <CardTitle className="text-lg text-white flex items-center gap-2.5">
            <ShieldAlert className="w-5 h-5 text-brand-orange-500" />
            Case Coordinator Action Items Inbox
            {openCount > 0 && (
              <span className="bg-brand-orange-500/20 text-brand-orange-400 border border-brand-orange-500/30 text-xs px-2.5 py-0.5 rounded-full font-bold">
                {openCount} Open
              </span>
            )}
          </CardTitle>
          <p className="text-xs text-zinc-400 mt-1">Real-time alerts for unread client messages, expiring authorizations, and scheduling changes.</p>
        </div>

        <div className="flex items-center gap-2">
          <div className="bg-zinc-900 p-1 rounded-lg border border-white/5 flex text-xs">
            <button
              onClick={() => setFilter('OPEN')}
              className={`cursor-pointer px-3 py-1.5 rounded-md font-semibold transition-colors ${
                filter === 'OPEN' ? 'bg-brand-orange-500 text-white' : 'text-zinc-400 hover:text-white'
              }`}
            >
              Open Tasks
            </button>
            <button
              onClick={() => setFilter('RESOLVED')}
              className={`cursor-pointer px-3 py-1.5 rounded-md font-semibold transition-colors ${
                filter === 'RESOLVED' ? 'bg-green-600 text-white' : 'text-zinc-400 hover:text-white'
              }`}
            >
              Resolved History
            </button>
          </div>

          <Button
            onClick={() => setShowAddForm(!showAddForm)}
            className="cursor-pointer bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-xs text-white"
          >
            <Plus className="w-4 h-4 mr-1" /> Log Event
          </Button>
        </div>
      </CardHeader>

      <CardContent className="pt-6 space-y-4">
        {/* Quick Add Form */}
        {showAddForm && (
          <form onSubmit={handleCreate} className="bg-zinc-900/60 p-4 rounded-xl border border-white/10 space-y-3 animate-fade-in">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider">Log New Action Item / Event</h4>
            <div>
              <input
                type="text"
                placeholder="Title (e.g. Parent requested RBT schedule change)"
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                className="w-full bg-zinc-950 border border-white/10 rounded-lg p-2.5 text-xs text-white outline-none focus:border-brand-orange-500"
                required
              />
            </div>
            <div>
              <textarea
                placeholder="Additional notes or context..."
                value={newDesc}
                onChange={e => setNewDesc(e.target.value)}
                className="w-full bg-zinc-950 border border-white/10 rounded-lg p-2.5 text-xs text-white outline-none focus:border-brand-orange-500 h-20"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setShowAddForm(false)} className="cursor-pointer text-xs bg-zinc-800 text-zinc-300">
                Cancel
              </Button>
              <Button type="submit" disabled={isPending} className={`text-xs bg-brand-orange-500 text-white font-bold ${isPending ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                Save Action Item
              </Button>
            </div>
          </form>
        )}

        {/* Item List */}
        {loading ? (
          <div className="py-8 text-center text-xs text-zinc-500">Loading action items...</div>
        ) : filteredItems.length === 0 ? (
          <div className="py-8 text-center text-zinc-500 bg-zinc-900/30 rounded-xl border border-white/5 border-dashed">
            <CheckCircle2 className="w-8 h-8 text-green-500 mx-auto mb-2 opacity-60" />
            <p className="text-sm font-semibold text-zinc-300">
              {filter === 'OPEN' ? 'No open action items!' : 'No resolved action items recorded yet.'}
            </p>
            <p className="text-xs text-zinc-500 mt-1">All active cases are running smoothly.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredItems.map(item => (
              <div
                key={item.id}
                className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all ${
                  item.status === 'RESOLVED'
                    ? 'bg-zinc-900/30 border-white/5 text-zinc-400'
                    : 'bg-zinc-900 border-white/10 hover:border-brand-orange-500/30 text-white'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 shrink-0">
                    {item.title.toLowerCase().includes('message') ? (
                      <MessageSquare className="w-4 h-4 text-brand-blue-400" />
                    ) : item.title.toLowerCase().includes('auth') || item.title.toLowerCase().includes('expire') ? (
                      <AlertTriangle className="w-4 h-4 text-brand-orange-400" />
                    ) : (
                      <Calendar className="w-4 h-4 text-brand-gold-400" />
                    )}
                  </div>

                  <div>
                    <h4 className="text-sm font-semibold leading-tight">{item.title}</h4>
                    {item.description && <p className="text-xs text-zinc-400 mt-1">{item.description}</p>}
                    
                    <div className="flex items-center gap-3 mt-2 text-[11px] text-zinc-500">
                      {item.client && (
                        <Link
                          href={`/client/${item.client.id}?mode=case-coord`}
                          className="text-brand-orange-400 hover:underline inline-flex items-center gap-1 font-medium"
                        >
                          Client: {item.client.firstName} {item.client.lastName} <ExternalLink className="w-3 h-3" />
                        </Link>
                      )}
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(item.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </div>

                {item.status === 'OPEN' && (
                  <Button
                    disabled={isPending}
                    onClick={() => handleResolve(item.id)}
                    className="bg-green-600 hover:bg-green-700 text-white text-xs font-bold shrink-0 h-9 px-4 cursor-pointer"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" /> Mark Resolved
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
