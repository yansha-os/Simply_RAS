'use client';

import React from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { UserPlus, Mail, FileCheck, ArrowRight, ShieldCheck, Users, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { AreaChartWidget, BarChartWidget, DonutChartWidget } from '@/components/ui/AnalyticsCharts';

export default function IntakeDashboard({ clients }: { clients: any[] }) {
  const inquiryQueue = clients.filter(c => c.status === 'INQUIRY');
  const waitingQueue = clients.filter(c => c.status === 'MAGIC_LINK_SENT');
  const reviewQueue = clients.filter(c => c.status === 'DOCS_SUBMITTED');
  const inProgressQueue = clients.filter(c => [
    'DOCS_APPROVED_INTAKE', 
    'CLINICAL_REVIEW_APPROVED', 
    'VOB_COMPLETED', 
    'PA_SUBMITTED', 
    'PA_APPROVED', 
    'ASSESSMENT_SCHEDULED', 
    'REPORT_ASSEMBLED', 
    'TX_PA_SUBMITTED', 
    'TX_PA_APPROVED'
  ].includes(c.status));

  const magicLinkCompletionPct = clients.length > 0 ? Math.round(((clients.length - waitingQueue.length) / clients.length) * 100) : 100;

  return (
    <div className="space-y-8 mt-6 pb-12 animate-fade-in-up">
      {/* Hero Master Intake Command Banner */}
      <div className="relative overflow-hidden p-8 rounded-3xl bg-gradient-to-r from-zinc-950 via-zinc-900 to-zinc-950 border border-white/10 shadow-2xl backdrop-blur-2xl group">
        <div className="absolute top-0 right-1/4 w-96 h-96 bg-brand-orange-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-10 w-96 h-96 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-orange-500/10 border border-brand-orange-500/20 text-brand-orange-400 font-mono text-[11px] font-bold">
              <span className="dot-live"></span>
              <span>INTAKE &amp; PA COMMAND CENTER • PARENT PACKET SYNC</span>
            </div>
            
            <h1 className="text-3xl lg:text-4xl font-extrabold text-white font-heading tracking-tight leading-tight">
              Intake Dashboard <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-orange-400 via-amber-300 to-teal-300">&amp; Analytics</span>
            </h1>
            
            <p className="text-sm text-zinc-400 max-w-2xl font-sans leading-relaxed">
              Supervise client onboarding velocity, parent magic link conversions, document cross-checks, and staffing SLA clearance.
            </p>
          </div>

          <Link
            href="/portal-case/clients"
            className="bg-gradient-to-r from-brand-orange-500 to-orange-600 hover:from-brand-orange-600 hover:to-orange-700 text-white font-bold text-xs px-5 h-11 rounded-xl shadow-[0_0_20px_rgba(255,107,0,0.3)] transition-all hover:scale-105 cursor-pointer flex items-center justify-center gap-2 flex-shrink-0"
          >
            <span>View Intake Pipeline &amp; Queue</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>

      {/* 4 Intake KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
        <Card className="bg-zinc-950/80 backdrop-blur-xl border border-white/10 shadow-xl rounded-2xl">
          <CardContent className="p-6 space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-xs font-mono font-bold text-brand-orange-400 uppercase tracking-wider">NEW INQUIRIES</span>
              <span className="px-2.5 py-1 rounded-full text-[10px] font-mono font-bold bg-brand-orange-500/10 text-brand-orange-400 border border-brand-orange-500/20">
                LEADS
              </span>
            </div>
            <div>
              <h3 className="text-3xl font-black text-white font-mono tracking-tight">{inquiryQueue.length}</h3>
              <p className="text-xs text-zinc-400 mt-1">Clients Needing Magic Link</p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-zinc-950/80 backdrop-blur-xl border border-white/10 shadow-xl rounded-2xl">
          <CardContent className="p-6 space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-xs font-mono font-bold text-amber-400 uppercase tracking-wider">LINKS SENT</span>
              <span className="px-2.5 py-1 rounded-full text-[10px] font-mono font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                AWAITING PARENT
              </span>
            </div>
            <div>
              <h3 className="text-3xl font-black text-white font-mono tracking-tight">{waitingQueue.length}</h3>
              <p className="text-xs text-zinc-400 mt-1">Portals Active in Parent Hands</p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-zinc-950/80 backdrop-blur-xl border border-white/10 shadow-xl rounded-2xl">
          <CardContent className="p-6 space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-xs font-mono font-bold text-rose-400 uppercase tracking-wider">DOC REVIEW</span>
              <span className="px-2.5 py-1 rounded-full text-[10px] font-mono font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                ACTION REQ
              </span>
            </div>
            <div>
              <h3 className="text-3xl font-black text-white font-mono tracking-tight">{reviewQueue.length}</h3>
              <p className="text-xs text-zinc-400 mt-1">Packets Submitted by Parents</p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-zinc-950/80 backdrop-blur-xl border border-white/10 shadow-xl rounded-2xl">
          <CardContent className="p-6 space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-xs font-mono font-bold text-emerald-400 uppercase tracking-wider">IN PROGRESS</span>
              <span className="px-2.5 py-1 rounded-full text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                BILLING HANDOFF
              </span>
            </div>
            <div>
              <h3 className="text-3xl font-black text-white font-mono tracking-tight">{inProgressQueue.length}</h3>
              <p className="text-xs text-zinc-400 mt-1">Clients Active in VOB / PA Workflow</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Interactive Intake Analytics Graphs */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <AreaChartWidget
            title="Monthly Parent Inquiry & Onboarding Velocity"
            subtitle="Real-time growth trend of incoming leads and completed parent onboarding packets"
            color="#FF7A45"
            data={[
              { label: 'Jan', value: 14 },
              { label: 'Feb', value: 22 },
              { label: 'Mar', value: 31 },
              { label: 'Apr', value: 45 },
              { label: 'May', value: 58 },
              { label: 'Jun', value: 72 },
              { label: 'Jul', value: clients.length || 85 },
            ]}
          />
        </div>

        <div className="space-y-6">
          <DonutChartWidget
            title="Magic Link Completion"
            percentage={magicLinkCompletionPct}
            label="Parent Onboarding Rate"
            color="#FF7A45"
          />
          <BarChartWidget
            title="Intake Queue Breakdown"
            subtitle="Volume distribution across onboarding stages"
            data={[
              { label: '1. Inquiries', value: inquiryQueue.length, color: '#FF7A45' },
              { label: '2. Sent Links', value: waitingQueue.length, color: '#F59E0B' },
              { label: '3. Doc Review', value: reviewQueue.length, color: '#F43F5E' },
              { label: '4. Handoff', value: inProgressQueue.length, color: '#10B981' },
            ]}
          />
        </div>
      </div>
    </div>
  );
}
