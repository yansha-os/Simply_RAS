'use client';

import React from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { DollarSign, TrendingUp, Calendar, CreditCard, ShieldCheck, AlertCircle, PieChart } from 'lucide-react';

export default function FinancialRcmAnalyticsDashboard() {
  const rcmMetrics = {
    totalBilledYtd: 482900.0,
    totalCollectedYtd: 449100.0,
    netCollectionRatio: 93.0, // NCR %
    avgDaysInAr: 24, // Days in AR
    outstandingAr: 33800.0,
  };

  const payerProfitability = [
    { name: 'Sunshine Health (Medicaid)', billed: 210000, collected: 197400, ncr: 94, color: 'text-emerald-400' },
    { name: 'Simply Healthcare', billed: 145000, collected: 134850, ncr: 93, color: 'text-cyan-400' },
    { name: 'Aetna Commercial', billed: 85000, collected: 78200, ncr: 92, color: 'text-amber-400' },
    { name: 'BCBS Commercial', billed: 42900, collected: 38650, ncr: 90, color: 'text-purple-400' },
  ];

  const coPayLedger = [
    { clientName: 'Ethan Wright', parentName: 'Jane Wright', coPayAmount: 35.0, status: 'PAID', date: '08/01/2026' },
    { clientName: 'Lucas Vance', parentName: 'Marcus Vance Sr', coPayAmount: 50.0, status: 'DUE', date: '08/03/2026' },
    { clientName: 'Maya Lin', parentName: 'Robert Lin', coPayAmount: 25.0, status: 'PAID', date: '07/28/2026' },
  ];

  return (
    <Card className="bg-zinc-950/80 backdrop-blur-xl border border-white/10 p-6 rounded-3xl space-y-6 shadow-2xl">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-4">
        <div>
          <h2 className="text-xl font-bold text-white font-heading flex items-center gap-2">
            <DollarSign className="w-6 h-6 text-emerald-400" /> Financial Analytics & RCM Suite
          </h2>
          <p className="text-xs text-zinc-400 font-sans mt-1">
            Phase 7 - Practice revenue cycle metrics, Net Collection Ratio (NCR), Days in AR, and Payer Profitability Breakdown.
          </p>
        </div>

        <div className="flex gap-2">
          <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-4 py-2 rounded-2xl font-mono font-bold text-xs">
            NCR: {rcmMetrics.netCollectionRatio}%
          </div>
          <div className="bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 px-4 py-2 rounded-2xl font-mono font-bold text-xs">
            Avg Days in AR: {rcmMetrics.avgDaysInAr} Days
          </div>
        </div>
      </div>

      {/* METRIC CARDS GRID */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-zinc-900/60 border border-white/5 p-4 rounded-2xl">
          <span className="text-[10px] font-mono text-zinc-500 uppercase block">Total Billed (YTD)</span>
          <p className="text-2xl font-black text-white font-mono mt-0.5">${rcmMetrics.totalBilledYtd.toLocaleString()}</p>
        </div>
        <div className="bg-zinc-900/60 border border-emerald-500/30 p-4 rounded-2xl">
          <span className="text-[10px] font-mono text-emerald-400 uppercase block">Total Collected (YTD)</span>
          <p className="text-2xl font-black text-emerald-400 font-mono mt-0.5">${rcmMetrics.totalCollectedYtd.toLocaleString()}</p>
        </div>
        <div className="bg-zinc-900/60 border border-amber-500/30 p-4 rounded-2xl">
          <span className="text-[10px] font-mono text-amber-400 uppercase block">Outstanding AR</span>
          <p className="text-2xl font-black text-amber-400 font-mono mt-0.5">${rcmMetrics.outstandingAr.toLocaleString()}</p>
        </div>
        <div className="bg-zinc-900/60 border border-cyan-500/30 p-4 rounded-2xl">
          <span className="text-[10px] font-mono text-cyan-400 uppercase block">Net Collection Ratio</span>
          <p className="text-2xl font-black text-cyan-400 font-mono mt-0.5">{rcmMetrics.netCollectionRatio}%</p>
        </div>
      </div>

      {/* PAYER PROFITABILITY BREAKDOWN */}
      <div className="space-y-3">
        <h3 className="font-bold text-white text-base font-heading flex items-center gap-2">
          <PieChart className="w-5 h-5 text-cyan-400" /> Payer Profitability Breakdown
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {payerProfitability.map((p) => (
            <div key={p.name} className="bg-zinc-900/50 border border-white/5 p-4 rounded-2xl space-y-2">
              <div className="flex justify-between items-center">
                <h4 className="font-bold text-white text-sm">{p.name}</h4>
                <span className={`text-xs font-black font-mono ${p.color}`}>{p.ncr}% NCR</span>
              </div>
              <div className="flex justify-between items-center text-xs font-mono text-zinc-400">
                <span>Billed: ${p.billed.toLocaleString()}</span>
                <span>Collected: ${p.collected.toLocaleString()}</span>
              </div>
              <div className="w-full bg-zinc-950 rounded-full h-1.5 overflow-hidden">
                <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${p.ncr}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* CLIENT CO-PAY & DEDUCTIBLE LEDGER */}
      <div className="space-y-3 pt-2">
        <h3 className="font-bold text-white text-base font-heading flex items-center gap-2">
          <CreditCard className="w-5 h-5 text-amber-400" /> Client Co-Pay & Deductible Ledger
        </h3>

        <div className="space-y-2">
          {coPayLedger.map((item, idx) => (
            <div key={idx} className="bg-zinc-900/50 border border-white/5 p-3.5 rounded-2xl flex items-center justify-between">
              <div>
                <h4 className="font-bold text-white text-sm">{item.clientName} ({item.parentName})</h4>
                <span className="text-[10px] font-mono text-zinc-500">Date: {item.date}</span>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-sm font-bold text-white font-mono">${item.coPayAmount.toFixed(2)}</span>
                <span
                  className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border uppercase ${
                    item.status === 'PAID' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-amber-500/20 text-amber-400 border-amber-500/30'
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
