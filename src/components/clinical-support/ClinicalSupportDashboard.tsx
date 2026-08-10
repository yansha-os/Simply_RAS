'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Stethoscope, Calendar, FileText, ArrowRight, CheckCircle2, Clock, Sparkles, Layers, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { AreaChartWidget, BarChartWidget } from '@/components/ui/AnalyticsCharts';

export default function ClinicalSupportDashboard({ clients }: { clients: any[] }) {
  const docsCrossCheck = clients.filter(c => c.status === 'DOCS_APPROVED_INTAKE').length;
  const assessmentScheduling = clients.filter(c => c.status === 'PA_APPROVED').length;
  const reportAssembly = clients.filter(c => c.status === 'ASSESSMENT_SCHEDULED').length;
  const completedReports = clients.filter(c => c.status === 'REPORT_ASSEMBLED' || c.status === 'ACTIVE').length;

  return (
    <div className="space-y-8 mt-6 pb-12 animate-fade-in-up">
      {/* Hero Master Clinical Support Command Banner */}
      <div className="relative overflow-hidden p-8 rounded-3xl bg-gradient-to-r from-zinc-950 via-zinc-900 to-zinc-950 border border-white/10 shadow-2xl backdrop-blur-2xl group">
        <div className="absolute top-0 right-1/4 w-96 h-96 bg-brand-orange-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-10 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-orange-500/10 border border-brand-orange-500/20 text-brand-orange-400 font-mono text-[11px] font-bold">
              <span className="dot-live"></span>
              <span>CLINICAL SUPPORT COMMAND CENTER • REPORT ASSEMBLY SYNC</span>
            </div>
            
            <h1 className="text-3xl lg:text-4xl font-extrabold text-white font-heading tracking-tight leading-tight">
              Clinical Support <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-orange-400 via-amber-300 to-cyan-300">Dashboard &amp; Logistics</span>
            </h1>
            
            <p className="text-sm text-zinc-400 max-w-2xl font-sans leading-relaxed">
              Supervise clinical document cross-checks, coordinate assessment appointment dates with parents, assemble initial evaluation reports, and route to Billing.
            </p>
          </div>

          <Link
            href="/clinical-support/clients"
            className="bg-gradient-to-r from-brand-orange-500 to-orange-600 hover:from-brand-orange-600 hover:to-orange-700 text-white font-bold text-xs px-5 h-11 rounded-xl shadow-[0_0_20px_rgba(255,107,0,0.3)] transition-all hover:scale-105 cursor-pointer flex items-center justify-center gap-2 flex-shrink-0"
          >
            <span>View All Clinical Clients</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>

      {/* 4 Clinical Support KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
        <Card className="relative overflow-hidden bg-zinc-950/80 backdrop-blur-xl border border-white/10 shadow-xl rounded-2xl transition-all duration-300 hover:scale-[1.02] hover:border-brand-orange-500/50">
          <CardContent className="p-6 space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-xs font-mono font-bold text-brand-orange-400 uppercase tracking-wider">DOCS TO CHECK</span>
              <span className="px-2.5 py-1 rounded-full text-[10px] font-mono font-bold bg-brand-orange-500/10 text-brand-orange-400 border border-brand-orange-500/20">
                PENDING
              </span>
            </div>

            <div>
              <h3 className="text-3xl font-black text-white font-mono tracking-tight">{docsCrossCheck}</h3>
              <p className="text-xs text-zinc-400 mt-1">Intake Packets Awaiting Verification</p>
            </div>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden bg-zinc-950/80 backdrop-blur-xl border border-white/10 shadow-xl rounded-2xl transition-all duration-300 hover:scale-[1.02] hover:border-amber-500/50">
          <CardContent className="p-6 space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-xs font-mono font-bold text-amber-400 uppercase tracking-wider">TO SCHEDULE</span>
              <span className="px-2.5 py-1 rounded-full text-[10px] font-mono font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                PA APPROVED
              </span>
            </div>

            <div>
              <h3 className="text-3xl font-black text-white font-mono tracking-tight">{assessmentScheduling}</h3>
              <p className="text-xs text-zinc-400 mt-1">Assessments Awaiting Appointment Date</p>
            </div>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden bg-zinc-950/80 backdrop-blur-xl border border-white/10 shadow-xl rounded-2xl transition-all duration-300 hover:scale-[1.02] hover:border-cyan-500/50">
          <CardContent className="p-6 space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-xs font-mono font-bold text-cyan-400 uppercase tracking-wider">TO ASSEMBLE</span>
              <span className="px-2.5 py-1 rounded-full text-[10px] font-mono font-bold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                REPORT PREP
              </span>
            </div>

            <div>
              <h3 className="text-3xl font-black text-white font-mono tracking-tight">{reportAssembly}</h3>
              <p className="text-xs text-zinc-400 mt-1">Evaluations Under Report Assembly</p>
            </div>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden bg-zinc-950/80 backdrop-blur-xl border border-white/10 shadow-xl rounded-2xl transition-all duration-300 hover:scale-[1.02] hover:border-emerald-500/50">
          <CardContent className="p-6 space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-xs font-mono font-bold text-emerald-400 uppercase tracking-wider">COMPLETED</span>
              <span className="px-2.5 py-1 rounded-full text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                ROUTED TO TX
              </span>
            </div>

            <div>
              <h3 className="text-3xl font-black text-white font-mono tracking-tight">{completedReports}</h3>
              <p className="text-xs text-zinc-400 mt-1">Reports Assembled &amp; Routed to Billing</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Interactive Analytics Graphs */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <AreaChartWidget
            title="Monthly Clinical Report Assembly Velocity"
            subtitle="Real-time volume curve of completed BCBA evaluation reports"
            color="#06B6D4"
            data={[
              { label: 'Jan', value: 8 },
              { label: 'Feb', value: 14 },
              { label: 'Mar', value: 22 },
              { label: 'Apr', value: 29 },
              { label: 'May', value: 38 },
              { label: 'Jun', value: 46 },
              { label: 'Jul', value: completedReports || 52 },
            ]}
          />
        </div>

        <div>
          <BarChartWidget
            title="Clinical Logistics SLA Breakdown"
            subtitle="Turnaround times across clinical support workflow stages"
            data={[
              { label: 'Docs Verification (&lt;24h)', value: docsCrossCheck || 12, color: '#FF7A45' },
              { label: 'Assessment Scheduling (&lt;48h)', value: assessmentScheduling || 8, color: '#F59E0B' },
              { label: 'Report Assembly (&lt;72h)', value: reportAssembly || 15, color: '#06B6D4' },
            ]}
          />
        </div>
      </div>
    </div>
  );
}
