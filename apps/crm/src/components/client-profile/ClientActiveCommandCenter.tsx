'use client';

import React, { useState, useTransition } from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Activity, ShieldCheck, UserCheck, Calendar, Plus, CheckCircle2 } from 'lucide-react';
import { createActionItem } from '@/app/actions/actionItems';
import { toast } from 'sonner';

type ActiveCaseClient = {
  id: string;
  firstName: string;
  lastName: string;
  caseCoordinatorId: string | null;
  bcba: { firstName: string; lastName: string } | null;
  rbt: { firstName: string; lastName: string } | null;
};

export default function ClientActiveCommandCenter({ client }: { client: ActiveCaseClient }) {
  const [showLogModal, setShowLogModal] = useState(false);
  const [eventType, setEventType] = useState('SCHEDULE_CHANGE');
  const [eventNotes, setEventNotes] = useState('');
  const [isPending, startTransition] = useTransition();

  const handleLogEvent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventNotes.trim()) return;

    let title = '';
    if (eventType === 'SCHEDULE_CHANGE') title = `Schedule Change Request for ${client.firstName} ${client.lastName}`;
    else if (eventType === 'RBT_ABSENCE') title = `RBT Absence / Coverage Needed for ${client.firstName} ${client.lastName}`;
    else if (eventType === 'PARENT_COMMUNICATION') title = `Parent Communication Flag for ${client.firstName} ${client.lastName}`;

    startTransition(async () => {
      const res = await createActionItem({
        title,
        description: eventNotes,
        clientId: client.id,
        assigneeId: client.caseCoordinatorId ?? undefined
      });

      if (res.success) {
        toast.success('Event logged! Added to Case Coordinator Action Items.');
        setEventNotes('');
        setShowLogModal(false);
      } else {
        toast.error(res.error || 'Failed to log event');
      }
    });
  };

  return (
    <Card className="border-brand-orange-500/30 bg-zinc-950 shadow-xl mb-6 overflow-hidden">
      <div className="bg-gradient-to-r from-brand-orange-500/20 via-zinc-900 to-zinc-950 px-6 py-4 border-b border-white/10 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-green-500/10 border border-green-500/30 flex items-center justify-center text-green-400 font-bold shrink-0">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-white">Active Case Command Center</h2>
              <span className="bg-green-500/10 text-green-400 border border-green-500/20 text-[10px] font-bold px-2 py-0.5 rounded uppercase">
                Active Therapy
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-0.5">Post-Pipeline Event-Driven Case Monitoring</p>
          </div>
        </div>

        <Button
          onClick={() => setShowLogModal(!showLogModal)}
          className="bg-brand-orange-500 hover:bg-brand-orange-600 text-white font-bold text-xs px-4 h-9 cursor-pointer"
        >
          <Plus className="w-4 h-4 mr-1.5" /> Log Event / Fire Ticket
        </Button>
      </div>

      <CardContent className="p-6 space-y-6">
        {/* Quick Log Form */}
        {showLogModal && (
          <form onSubmit={handleLogEvent} className="bg-zinc-900 p-5 rounded-xl border border-white/10 space-y-4 animate-fade-in">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">Log Field Event for Case Coordinator</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-400 mb-1.5">Event Category</label>
                <select
                  value={eventType}
                  onChange={e => setEventType(e.target.value)}
                  className="w-full bg-zinc-950 border border-white/10 rounded-lg p-2.5 text-xs text-white outline-none focus:border-brand-orange-500"
                >
                  <option value="SCHEDULE_CHANGE">🗓️ Schedule Change Request</option>
                  <option value="RBT_ABSENCE">🚨 RBT Absence / Coverage Needed</option>
                  <option value="PARENT_COMMUNICATION">💬 Parent Flag / Inquiry</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-400 mb-1.5">Event Details & Notes</label>
                <input
                  type="text"
                  placeholder="e.g. RBT called out sick for Friday 3 PM session"
                  value={eventNotes}
                  onChange={e => setEventNotes(e.target.value)}
                  className="w-full bg-zinc-950 border border-white/10 rounded-lg p-2.5 text-xs text-white outline-none focus:border-brand-orange-500"
                  required
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-white/5">
              <Button type="button" variant="secondary" onClick={() => setShowLogModal(false)} className="text-xs bg-zinc-800 text-zinc-300 cursor-pointer">
                Cancel
              </Button>
              <Button type="submit" disabled={isPending} className="text-xs bg-brand-orange-500 text-white font-bold cursor-pointer disabled:cursor-not-allowed">
                Submit Ticket
              </Button>
            </div>
          </form>
        )}

        {/* Live Active Roster Summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-zinc-900/60 p-4 rounded-xl border border-white/5 flex items-center gap-3">
            <UserCheck className="w-5 h-5 text-cyan-400 shrink-0" />
            <div>
              <span className="text-[10px] text-zinc-500 uppercase font-bold block">BCBA Supervisor</span>
              <span className="text-sm font-semibold text-white">
                {client.bcba ? `${client.bcba.firstName} ${client.bcba.lastName}` : 'Not Assigned'}
              </span>
            </div>
          </div>

          <div className="bg-zinc-900/60 p-4 rounded-xl border border-white/5 flex items-center gap-3">
            <ShieldCheck className="w-5 h-5 text-brand-orange-400 shrink-0" />
            <div>
              <span className="text-[10px] text-zinc-500 uppercase font-bold block">Assigned RBT</span>
              <span className="text-sm font-semibold text-white">
                {client.rbt ? `${client.rbt.firstName} ${client.rbt.lastName}` : 'Not Assigned'}
              </span>
            </div>
          </div>

          <div className="bg-zinc-900/60 p-4 rounded-xl border border-white/5 flex items-center gap-3">
            <Calendar className="w-5 h-5 text-green-400 shrink-0" />
            <div>
              <span className="text-[10px] text-zinc-500 uppercase font-bold block">Case Status</span>
              <span className="text-sm font-semibold text-green-400 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Fully Active & Staffed
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
