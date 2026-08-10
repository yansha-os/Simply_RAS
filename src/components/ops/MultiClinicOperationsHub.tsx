'use client';

import React, { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Building2, Layers, Calendar, CheckCircle2, Box, Smartphone, MapPin } from 'lucide-react';
import { toast } from 'sonner';

export default function MultiClinicOperationsHub() {
  const [selectedClinic, setSelectedClinic] = useState<string>('Miami Center Site');

  const clinics = [
    { id: 'c-1', name: 'Miami Center Site', address: '100 Healthcare Way, Miami, FL', activeClients: 34, rooms: 8 },
    { id: 'c-2', name: 'Orlando Clinic Site', address: '450 Innovation Way, Orlando, FL', activeClients: 22, rooms: 6 },
    { id: 'c-3', name: 'In-Home Care Division', address: 'Mobile Field Operations (South FL)', activeClients: 12, rooms: 0 },
  ];

  const inventoryCheckouts = [
    { kitName: 'VB-MAPP Testing Protocol Kit #3', checkedOutTo: 'Sarah Jenkins, BCBA', dueDate: '08/05/2026', status: 'CHECKED_OUT' },
    { kitName: 'Clinical iPad Pro #12 (EMR Field Tablet)', checkedOutTo: 'Marcus Vance, RBT', dueDate: '08/04/2026', status: 'CHECKED_OUT' },
    { kitName: 'ABLLS-R Assessment Binder #1', checkedOutTo: 'Elena Rostova, RBT', dueDate: '08/01/2026', status: 'OVERDUE' },
  ];

  const handleSwitchClinic = (name: string) => {
    setSelectedClinic(name);
    toast.info(`Switched Active Facility Operations Hub to: ${name}`);
  };

  return (
    <Card className="bg-zinc-950/80 backdrop-blur-xl border border-white/10 p-6 rounded-3xl space-y-6 shadow-2xl">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-4">
        <div>
          <h2 className="text-xl font-bold text-white font-heading flex items-center gap-2">
            <Building2 className="w-6 h-6 text-cyan-400" /> Multi-Location Clinic & Facility Operations Hub
          </h2>
          <p className="text-xs text-zinc-400 font-sans mt-1">
            Phase 16 - Multi-clinic site switcher, sensory room reservation calendar, and testing materials / iPad kit inventory tracker.
          </p>
        </div>

        {/* CLINIC SWITCHER DROPDOWN */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-zinc-400 uppercase font-bold">Active Site:</span>
          <select
            value={selectedClinic}
            onChange={(e) => handleSwitchClinic(e.target.value)}
            className="bg-zinc-900 border border-white/10 rounded-xl px-4 py-2 text-xs text-white outline-none focus:border-cyan-500 cursor-pointer font-sans shadow-sm"
          >
            {clinics.map((c) => (
              <option key={c.id} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* CLINIC LOCATIONS GRID */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {clinics.map((c) => (
          <div
            key={c.id}
            onClick={() => handleSwitchClinic(c.name)}
            className={`p-4 rounded-2xl border transition-all cursor-pointer ${
              selectedClinic === c.name ? 'bg-cyan-950/20 border-cyan-500/50 shadow-[0_0_15px_rgba(6,182,212,0.15)]' : 'bg-zinc-900/60 border-white/10 hover:border-white/20'
            }`}
          >
            <h4 className="font-bold text-white text-base">{c.name}</h4>
            <p className="text-xs text-zinc-400 font-sans mt-1 flex items-center gap-1">
              <MapPin className="w-3 h-3 text-cyan-400 shrink-0" /> {c.address}
            </p>
            <div className="flex justify-between items-center text-xs font-mono mt-3 pt-2 border-t border-white/5 text-zinc-300">
              <span>Clients: {c.activeClients}</span>
              <span>Therapy Rooms: {c.rooms}</span>
            </div>
          </div>
        ))}
      </div>

      {/* TESTING MATERIALS & IPAD INVENTORY TRACKER */}
      <div className="space-y-3 pt-2">
        <h3 className="font-bold text-white text-base font-heading flex items-center gap-2">
          <Box className="w-5 h-5 text-emerald-400" /> Testing Materials & Field iPad Inventory Tracker
        </h3>

        <div className="space-y-2">
          {inventoryCheckouts.map((item, idx) => (
            <div key={idx} className="bg-zinc-900/50 border border-white/5 p-4 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div>
                <h4 className="font-bold text-white text-sm">{item.kitName}</h4>
                <p className="text-xs text-zinc-400 font-sans mt-0.5">
                  Checked out to: <span className="text-zinc-200 font-semibold">{item.checkedOutTo}</span>
                </p>
              </div>

              <div className="flex items-center gap-4">
                <span className="text-xs font-mono text-zinc-400">Due: {item.dueDate}</span>
                <span
                  className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border uppercase ${
                    item.status === 'OVERDUE' ? 'bg-rose-500/20 text-rose-400 border-rose-500/30' : 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30'
                  }`}
                >
                  {item.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}
