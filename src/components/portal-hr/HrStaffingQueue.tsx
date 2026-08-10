'use client';

import React, { useState, useTransition } from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import { Calendar, UserPlus, ArrowRight, CheckCircle2, AlertCircle, ExternalLink } from 'lucide-react';
import { assignHrStaff } from '@/app/actions/hr';
import Link from 'next/link';

export default function HrStaffingQueue({ clients, bcbas, rbts }: { clients: any[], bcbas: any[], rbts: any[] }) {
  const [isPending, startTransition] = useTransition();

  const handleAssign = (clientId: string, type: 'bcba' | 'rbt', value: string) => {
    startTransition(async () => {
      const data = type === 'bcba' ? { bcbaId: value } : { rbtId: value };
      await assignHrStaff(clientId, data);
    });
  };

  if (clients.length === 0) {
    return (
      <div className="bg-brand-black-800 rounded-lg p-12 text-center border border-white/5">
        <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-4" />
        <h3 className="text-xl font-bold text-white mb-2">Staffing Pipeline Clear!</h3>
        <p className="text-zinc-400">There are currently no clients waiting for staffing assignments.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {clients.map(client => {
        const isFullyAssigned = client.bcbaId && client.rbtId;

        return (
          <Card key={client.id} className="bg-brand-black-800 border-white/5 hover:border-brand-orange-500/30 transition-colors flex flex-col justify-between">
            <CardContent className="p-5 flex flex-col justify-between h-full space-y-4">
              <div>
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-bold text-white text-lg flex items-center gap-2">
                      {client.firstName} {client.lastName}
                    </h3>
                    <p className="text-xs text-zinc-400 mt-0.5">Age: {client.childAge || 'N/A'} • {client.guardianName}</p>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                    isFullyAssigned 
                      ? 'bg-green-500/10 text-green-400 border border-green-500/20' 
                      : 'bg-brand-orange-500/10 text-brand-orange-400 border border-brand-orange-500/20'
                  }`}>
                    {isFullyAssigned ? 'Staffed ✓' : 'Needs Staff'}
                  </span>
                </div>

                <div className="mt-4 space-y-3">
                  <div>
                    <label className="block text-[10px] font-bold text-zinc-500 uppercase mb-1">BCBA Supervisor (Assigned by Clinical Director)</label>
                    <div className="w-full bg-zinc-950/60 border border-white/5 rounded-lg p-2.5 text-xs text-zinc-300 font-mono flex items-center justify-between">
                      <span>{client.bcba ? `${client.bcba.firstName} ${client.bcba.lastName}` : (client.bcbaId ? 'BCBA Assigned' : 'Clinical Director Assigned')}</span>
                      <span className="text-[10px] text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20">Clinical Director Owned</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-zinc-500 uppercase mb-1">RBT Candidate</label>
                    <select
                      className="w-full bg-zinc-950 border border-white/10 rounded-lg p-2.5 text-xs text-white focus:border-brand-orange-500 outline-none cursor-pointer"
                      value={client.rbtId || ''}
                      onChange={(e) => handleAssign(client.id, 'rbt', e.target.value)}
                      disabled={isPending}
                    >
                      <option value="">-- Select RBT Candidate --</option>
                      {rbts.map(rbt => (
                        <option key={rbt.id} value={rbt.id}>{rbt.firstName} {rbt.lastName}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-white/5 flex items-center justify-between">
                <span className="text-[11px] text-zinc-500">
                  {client.rbtApproved ? 'Meet & Greet Approved' : client.rbtId ? 'Meet & Greet Pending' : 'Awaiting Selection'}
                </span>
                <Link
                  href={`/client/${client.id}?mode=hr`}
                  className="inline-flex items-center text-xs font-bold text-brand-orange-400 hover:text-brand-orange-300 transition-colors gap-1"
                >
                  Open Staffing Tab <ExternalLink className="w-3.5 h-3.5" />
                </Link>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
