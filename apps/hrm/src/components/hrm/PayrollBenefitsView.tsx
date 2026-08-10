'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { CreditCard, DollarSign, Clock, CheckCircle2, ShieldCheck, Heart, FileText, Download, TrendingUp, Activity } from 'lucide-react';
import { toast } from 'sonner';

export default function PayrollBenefitsView() {
  const [paystubPeriod, setPaystubPeriod] = useState('July 15 - July 31, 2026');

  const timesheetSummary = {
    billableHours: 68.5,
    adminHours: 8.0,
    hourlyRate: 24.50,
    grossPay: 1874.25,
    taxDeductions: 328.00,
    netPay: 1546.25,
  };

  const handleDownloadPaystub = () => {
    toast.success('Downloading Paystub PDF...');
  };

  return (
    <div className="space-y-8">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-brand-black-800 p-6 rounded-xl border border-white/5 shadow-xl">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <CreditCard className="w-6 h-6 text-brand-orange-500" />
            Finance &amp; Payroll Analytics Portal
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Staff compensation metrics, billable therapy hours, timesheet conversions, and benefits enrollment.
          </p>
        </div>

        <Button
          onClick={handleDownloadPaystub}
          className="bg-brand-orange-500 hover:bg-brand-orange-600 text-white font-bold text-xs px-4 h-9 cursor-pointer"
        >
          <Download className="w-4 h-4 mr-1.5" /> Download Paystub
        </Button>
      </div>

      {/* FINANCIAL & PAYROLL STATISTICS KPI CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="border-white/10 bg-zinc-950 shadow-md">
          <CardContent className="p-6">
            <p className="text-xs text-brand-orange-400 font-bold uppercase">Monthly Payroll Spend</p>
            <h3 className="text-3xl font-black text-white mt-1">$48,250.00</h3>
            <p className="text-[10px] text-zinc-500 font-mono mt-0.5">Bi-weekly disbursement</p>
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-zinc-950 shadow-md">
          <CardContent className="p-6">
            <p className="text-xs text-green-400 font-bold uppercase">Estimated Net Pay</p>
            <h3 className="text-3xl font-black text-white mt-1">${timesheetSummary.netPay.toFixed(2)}</h3>
            <p className="text-[10px] text-zinc-500 font-mono mt-0.5">Current Period: {paystubPeriod}</p>
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-zinc-950 shadow-md">
          <CardContent className="p-6">
            <p className="text-xs text-cyan-400 font-bold uppercase">Billable Therapy Hours</p>
            <h3 className="text-3xl font-black text-white mt-1">{timesheetSummary.billableHours} hrs</h3>
            <p className="text-[10px] text-zinc-500 font-mono mt-0.5">98.4% Conversion Rate</p>
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-zinc-950 shadow-md">
          <CardContent className="p-6">
            <p className="text-xs text-purple-400 font-bold uppercase">Direct Deposit Verification</p>
            <h3 className="text-sm font-bold text-green-400 mt-2 flex items-center gap-1">
              <CheckCircle2 className="w-4 h-4" /> 100% Active &amp; Verified
            </h3>
            <p className="text-[10px] text-zinc-500 font-mono mt-0.5">Bank Routing Verified</p>
          </CardContent>
        </Card>
      </div>

      {/* PAYROLL ANALYTICS PROGRESS BREAKDOWN BAR */}
      <Card className="border-white/10 bg-zinc-950 shadow-lg">
        <CardHeader className="pb-4 border-b border-white/5">
          <CardTitle className="text-base text-white flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-green-400" />
            Timesheet &amp; Billable Hours Audit Analytics
          </CardTitle>
          <p className="text-xs text-zinc-400 mt-1">Real-time breakdown of clinical therapy vs administrative hours.</p>
        </CardHeader>
        <CardContent className="pt-6 space-y-6">
          <div className="space-y-2">
            <div className="flex justify-between text-xs font-bold">
              <span className="text-green-400 flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-green-500"></span> Billable Direct 1-on-1 ABA Therapy (68.5 hrs)
              </span>
              <span className="text-white">89.5%</span>
            </div>
            <div className="w-full h-3 bg-zinc-900 rounded-full overflow-hidden border border-white/5 flex">
              <div 
                className="bg-gradient-to-r from-green-600 to-green-400 h-full transition-all duration-500" 
                style={{ width: '89.5%' }} 
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-xs font-bold">
              <span className="text-brand-orange-400 flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-brand-orange-500"></span> Indirect Admin / Orientation (8.0 hrs)
              </span>
              <span className="text-white">10.5%</span>
            </div>
            <div className="w-full h-3 bg-zinc-900 rounded-full overflow-hidden border border-white/5 flex">
              <div 
                className="bg-gradient-to-r from-brand-orange-600 to-brand-orange-400 h-full transition-all duration-500" 
                style={{ width: '10.5%' }} 
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Benefits Enrollment Cards */}
      <Card className="border-white/10 bg-zinc-950 shadow-lg">
        <CardHeader className="pb-4 border-b border-white/5">
          <CardTitle className="text-base text-white flex items-center gap-2">
            <Heart className="w-5 h-5 text-red-400" />
            Staff Health &amp; Dental Benefits Enrollment
          </CardTitle>
          <p className="text-xs text-zinc-400 mt-1">Health insurance, dental, vision, and 401(k) retirement plans.</p>
        </CardHeader>
        <CardContent className="pt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 bg-zinc-900 rounded-xl border border-white/5 space-y-2">
            <div className="flex justify-between items-start">
              <h4 className="font-bold text-white text-sm">Medical (PPO Gold)</h4>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-green-500/10 text-green-400">Enrolled</span>
            </div>
            <p className="text-xs text-zinc-400">Provider: BlueCross BlueShield</p>
            <p className="text-xs text-zinc-500">Coverage: Employee + Family</p>
          </div>

          <div className="p-4 bg-zinc-900 rounded-xl border border-white/5 space-y-2">
            <div className="flex justify-between items-start">
              <h4 className="font-bold text-white text-sm">Dental &amp; Vision</h4>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-green-500/10 text-green-400">Enrolled</span>
            </div>
            <p className="text-xs text-zinc-400">Provider: Guardian Choice</p>
            <p className="text-xs text-zinc-500">Coverage: Full Vision &amp; Dental</p>
          </div>

          <div className="p-4 bg-zinc-900 rounded-xl border border-white/5 space-y-2">
            <div className="flex justify-between items-start">
              <h4 className="font-bold text-white text-sm">401(k) Retirement</h4>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-brand-orange-500/10 text-brand-orange-400">4% Match</span>
            </div>
            <p className="text-xs text-zinc-400">Provider: Vanguard 401k</p>
            <p className="text-xs text-zinc-500">Auto-Contribution: Active</p>
          </div>
        </CardContent>
      </Card>

      {/* Staff Payroll & Compensation Breakdown Table */}
      <Card className="border-white/10 bg-zinc-950 shadow-lg">
        <CardHeader className="pb-4 border-b border-white/5">
          <CardTitle className="text-base text-white flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-brand-orange-500" />
            Active RBT Staff Payroll Breakdown (Current Period)
          </CardTitle>
          <p className="text-xs text-zinc-400 mt-1">Per-technician billable hours, hourly rates, gross pay, and disbursement clearance status.</p>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-left text-xs text-zinc-300">
            <thead className="bg-zinc-900 text-zinc-400 uppercase text-[10px] font-bold tracking-wider border-b border-white/5">
              <tr>
                <th className="py-3.5 px-4">RBT Staff Member</th>
                <th className="py-3.5 px-4">Role / Level</th>
                <th className="py-3.5 px-4 text-center">Billable Hrs</th>
                <th className="py-3.5 px-4 text-center">Hourly Rate</th>
                <th className="py-3.5 px-4 text-right">Gross Pay</th>
                <th className="py-3.5 px-4 text-right">Net Pay</th>
                <th className="py-3.5 px-4 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 font-medium">
              <tr className="hover:bg-white/[0.02] transition-colors">
                <td className="py-3.5 px-4 font-bold text-white">David Miller</td>
                <td className="py-3.5 px-4 text-zinc-400 font-mono">Senior RBT</td>
                <td className="py-3.5 px-4 text-center font-mono">68.5 hrs</td>
                <td className="py-3.5 px-4 text-center font-mono">$24.50/hr</td>
                <td className="py-3.5 px-4 text-right font-mono font-bold text-white">$1,678.25</td>
                <td className="py-3.5 px-4 text-right font-mono font-bold text-green-400">$1,384.56</td>
                <td className="py-3.5 px-4 text-center">
                  <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-green-500/10 text-green-400 border border-green-500/20">READY</span>
                </td>
              </tr>
              <tr className="hover:bg-white/[0.02] transition-colors">
                <td className="py-3.5 px-4 font-bold text-white">Sarah Jenkins</td>
                <td className="py-3.5 px-4 text-zinc-400 font-mono">Lead RBT Supervisor</td>
                <td className="py-3.5 px-4 text-center font-mono">74.0 hrs</td>
                <td className="py-3.5 px-4 text-center font-mono">$28.00/hr</td>
                <td className="py-3.5 px-4 text-right font-mono font-bold text-white">$2,072.00</td>
                <td className="py-3.5 px-4 text-right font-mono font-bold text-green-400">$1,719.76</td>
                <td className="py-3.5 px-4 text-center">
                  <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-green-500/10 text-green-400 border border-green-500/20">READY</span>
                </td>
              </tr>
              <tr className="hover:bg-white/[0.02] transition-colors">
                <td className="py-3.5 px-4 font-bold text-white">Alexis Miller</td>
                <td className="py-3.5 px-4 text-zinc-400 font-mono">RBT Technician</td>
                <td className="py-3.5 px-4 text-center font-mono">52.0 hrs</td>
                <td className="py-3.5 px-4 text-center font-mono">$23.00/hr</td>
                <td className="py-3.5 px-4 text-right font-mono font-bold text-white">$1,196.00</td>
                <td className="py-3.5 px-4 text-right font-mono font-bold text-amber-400">$992.68</td>
                <td className="py-3.5 px-4 text-center">
                  <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">PENDING SIGN-OFF</span>
                </td>
              </tr>
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
