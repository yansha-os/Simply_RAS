import React from 'react';
import { prisma } from '@/lib/prisma';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { UserPlus, UserCheck, Users, AlertCircle, ArrowRight, Activity, ShieldCheck } from 'lucide-react';
import Link from 'next/link';

export default async function HrPortalPage() {
  const staffingClients = await prisma.client.findMany({
    where: { status: 'STAFFING_PENDING' },
    orderBy: { updatedAt: 'desc' }
  });

  const totalClients = await prisma.client.count();

  const allBcbas = await prisma.user.findMany({
    where: { role: 'BCBA', isActive: true },
    select: { id: true, firstName: true, lastName: true }
  });

  const allRbts = await prisma.user.findMany({
    where: { role: 'RBT', isActive: true },
    select: { id: true, firstName: true, lastName: true }
  });
  
  const missingStaffCount = staffingClients.length;
  const fullyStaffedCount = totalClients - missingStaffCount;
  const staffingFillPercentage = totalClients > 0 ? Math.round((fullyStaffedCount / totalClients) * 100) : 100;

  return (
    <div className="space-y-8">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-brand-black-800 p-6 rounded-xl border border-white/5">
        <div>
          <h1 className="text-3xl font-heading font-black text-brand-orange-500">HR & STAFFING ANALYTICS</h1>
          <p className="text-brand-blue-400">Clinical workforce metrics, staffing demand ratios, and fill rates.</p>
        </div>

        <Link
          href="/portal-hr/clients"
          className="bg-brand-orange-500 hover:bg-brand-orange-600 text-white font-bold text-xs px-4 h-10 rounded-xl flex items-center justify-center cursor-pointer"
        >
          Open Staffing Queue ({missingStaffCount}) <ArrowRight className="w-4 h-4 ml-1.5" />
        </Link>
      </div>

      {/* KPI Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="border-white/10 bg-zinc-950 shadow-md">
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs text-red-400 font-bold uppercase tracking-wider">Pending Staffing</p>
                <h3 className="text-3xl font-black text-white mt-2">{missingStaffCount}</h3>
              </div>
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400">
                <AlertCircle className="w-6 h-6" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-zinc-950 shadow-md">
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs text-brand-orange-400 font-bold uppercase tracking-wider">Fill Rate Ratio</p>
                <h3 className="text-3xl font-black text-white mt-2">{staffingFillPercentage}%</h3>
              </div>
              <div className="p-3 bg-brand-orange-500/10 border border-brand-orange-500/20 rounded-xl text-brand-orange-400">
                <Activity className="w-6 h-6" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-zinc-950 shadow-md">
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs text-green-400 font-bold uppercase tracking-wider">Active BCBAs</p>
                <h3 className="text-3xl font-black text-white mt-2">{allBcbas.length}</h3>
              </div>
              <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-xl text-green-400">
                <UserCheck className="w-6 h-6" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-zinc-950 shadow-md">
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs text-brand-blue-400 font-bold uppercase tracking-wider">Active RBTs</p>
                <h3 className="text-3xl font-black text-white mt-2">{allRbts.length}</h3>
              </div>
              <div className="p-3 bg-brand-blue-500/10 border border-brand-blue-500/20 rounded-xl text-brand-blue-400">
                <Users className="w-6 h-6" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Visual Metric Bars & Graphs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-white/10 bg-zinc-950 shadow-lg">
          <CardHeader className="pb-4 border-b border-white/5">
            <CardTitle className="text-base text-white flex items-center gap-2">
              <Activity className="w-5 h-5 text-brand-orange-400" />
              Staffing Capacity & Fulfillment Gauge
            </CardTitle>
            <p className="text-xs text-zinc-400 mt-1">Real-time breakdown of assigned clients vs unassigned staffing requests.</p>
          </CardHeader>
          <CardContent className="pt-6 space-y-6">
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-bold">
                <span className="text-green-400 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-green-500"></span> Fully Staffed Cases ({fullyStaffedCount})
                </span>
                <span className="text-white">{staffingFillPercentage}%</span>
              </div>
              <div className="w-full h-3 bg-zinc-900 rounded-full overflow-hidden border border-white/5 flex">
                <div 
                  className="bg-gradient-to-r from-green-600 to-green-400 h-full transition-all duration-500" 
                  style={{ width: `${staffingFillPercentage}%` }} 
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-xs font-bold">
                <span className="text-red-400 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500"></span> Needs BCBA / RBT ({missingStaffCount})
                </span>
                <span className="text-white">{100 - staffingFillPercentage}%</span>
              </div>
              <div className="w-full h-3 bg-zinc-900 rounded-full overflow-hidden border border-white/5 flex">
                <div 
                  className="bg-gradient-to-r from-red-600 to-red-400 h-full transition-all duration-500" 
                  style={{ width: `${100 - staffingFillPercentage}%` }} 
                />
              </div>
            </div>

            <div className="p-4 bg-zinc-900/60 rounded-xl border border-white/5 text-xs text-zinc-400 flex items-center justify-between">
              <span>Staffing Demand Index</span>
              <span className="font-bold text-brand-orange-400 text-sm">
                {missingStaffCount > 0 ? `${missingStaffCount} Clients Awaiting Match` : '100% Fully Staffed'}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-zinc-950 shadow-lg">
          <CardHeader className="pb-4 border-b border-white/5">
            <CardTitle className="text-base text-white flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-brand-blue-400" />
              HR Quick Action Shortcuts
            </CardTitle>
            <p className="text-xs text-zinc-400 mt-1">Jump directly into staffing queues and active staff management.</p>
          </CardHeader>
          <CardContent className="pt-6 space-y-4">
            <Link href="/portal-hr/clients" className="block">
              <div className="p-4 bg-zinc-900 hover:bg-zinc-800 border border-white/5 hover:border-brand-orange-500/30 rounded-xl transition-all flex items-center justify-between group">
                <div>
                  <h4 className="text-sm font-bold text-white group-hover:text-brand-orange-400 transition-colors">
                    Pending Staffing Queue ({missingStaffCount})
                  </h4>
                  <p className="text-xs text-zinc-400 mt-0.5">Assign BCBAs and RBT Candidates to new clients.</p>
                </div>
                <ArrowRight className="w-4 h-4 text-zinc-500 group-hover:text-brand-orange-400 transition-colors" />
              </div>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
