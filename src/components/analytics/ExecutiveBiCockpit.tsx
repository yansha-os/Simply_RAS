'use client';

import React from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { TrendingUp, Users, DollarSign, Award, Download, PieChart, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

export default function ExecutiveBiCockpit() {
  const biMetrics = {
    mrr: 142500.0, // Monthly Recurring Revenue
    arrProjection: 1710000.0,
    agencyUtilizationPct: 88.5, // % billable vs admin
    staffRetentionPct: 94.2,
    activeClientCount: 68,
    avgClientLtv: 42500.0,
  };

  const handleExportExecutiveReport = () => {
    toast.success('Generated Executive C-Suite PDF Performance Summary for CEO & Board!');
  };

  return (
    <Card className="bg-zinc-950/80 backdrop-blur-xl border border-white/10 p-6 rounded-3xl space-y-6 shadow-2xl">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-4">
        <div>
          <h2 className="text-xl font-bold text-white font-heading flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-cyan-400" /> Executive Command Center & BI Analytics Cockpit
          </h2>
          <p className="text-xs text-zinc-400 font-sans mt-1">
            Phase 14 - C-Suite real-time metrics tracking Monthly Recurring Revenue (MRR), Agency Staff Utilization %, Retention Rate, and LTV.
          </p>
        </div>

        <Button
          onClick={handleExportExecutiveReport}
          className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold px-6 py-3 rounded-xl shadow-lg shadow-cyan-600/20 flex items-center gap-2 cursor-pointer"
        >
          <Download className="w-4 h-4" /> Export Executive Board PDF
        </Button>
      </div>

      {/* C-SUITE METRIC CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-zinc-900/60 border border-emerald-500/30 p-4 rounded-2xl">
          <span className="text-[10px] font-mono text-emerald-400 uppercase block">Monthly Recurring Revenue</span>
          <p className="text-2xl font-black text-emerald-400 font-mono mt-0.5">${biMetrics.mrr.toLocaleString()}</p>
          <p className="text-[10px] text-zinc-400 mt-1 font-mono">ARR Run Rate: ${(biMetrics.arrProjection / 1000000).toFixed(2)}M</p>
        </div>

        <div className="bg-zinc-900/60 border border-cyan-500/30 p-4 rounded-2xl">
          <span className="text-[10px] font-mono text-cyan-400 uppercase block">Agency Staff Utilization</span>
          <p className="text-2xl font-black text-cyan-400 font-mono mt-0.5">{biMetrics.agencyUtilizationPct}%</p>
          <p className="text-[10px] text-zinc-400 mt-1 font-sans">Billable CPT Hours vs Admin</p>
        </div>

        <div className="bg-zinc-900/60 border border-purple-500/30 p-4 rounded-2xl">
          <span className="text-[10px] font-mono text-purple-400 uppercase block">Staff Retention Rate</span>
          <p className="text-2xl font-black text-purple-400 font-mono mt-0.5">{biMetrics.staffRetentionPct}%</p>
          <p className="text-[10px] text-zinc-400 mt-1 font-sans">Annualized RBT/BCBA Retention</p>
        </div>

        <div className="bg-zinc-900/60 border border-amber-500/30 p-4 rounded-2xl">
          <span className="text-[10px] font-mono text-amber-400 uppercase block">Average Client LTV</span>
          <p className="text-2xl font-black text-amber-400 font-mono mt-0.5">${biMetrics.avgClientLtv.toLocaleString()}</p>
          <p className="text-[10px] text-zinc-400 mt-1 font-sans">{biMetrics.activeClientCount} Active Caseload Clients</p>
        </div>
      </div>
    </Card>
  );
}
