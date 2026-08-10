'use client';

import React from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { 
  Users, 
  FileText, 
  ClipboardCheck, 
  Activity, 
  CreditCard, 
  TrendingUp, 
  ArrowUpRight, 
  ShieldCheck, 
  UserCheck,
  Zap,
  Clock
} from 'lucide-react';

export default function HeadHrCommandCenter() {
  return (
    <div className="space-y-8 animate-fade-in text-white">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-zinc-950 p-6 sm:p-8 rounded-3xl border border-white/10 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-brand-orange-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10">
          <div className="flex items-center gap-2 text-brand-orange-400 font-mono text-xs font-bold uppercase tracking-wider mb-2">
            <Zap className="w-4 h-4" /> Head of HR &amp; Staff Dispatch Command Center
          </div>
          <h1 className="text-3xl sm:text-4xl font-black text-white font-heading tracking-tight">
            Rise &amp; Shine ABA Operations Hub
          </h1>
          <p className="text-xs sm:text-sm text-zinc-400 mt-1 max-w-2xl">
            Executive oversight of RBT candidate recruitment, clinical compliance, staffing dispatches to CRM Case Coordinators, and payroll disbursements.
          </p>
        </div>

        <div className="relative z-10 flex items-center gap-3">
          <Link href="/ats">
            <Button className="bg-brand-orange-500 hover:bg-brand-orange-600 text-white font-black text-xs px-5 h-11 rounded-2xl shadow-lg cursor-pointer flex items-center gap-2">
              <Users className="w-4 h-4" /> Review ATS Pipeline
            </Button>
          </Link>
        </div>
      </div>

      {/* KPI METRICS GRID */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-white/10 bg-zinc-950/80 backdrop-blur-xl shadow-xl hover:border-brand-orange-500/40 transition-all">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <span className="text-xs text-brand-orange-400 font-extrabold uppercase tracking-wider">ATS Candidates</span>
              <FileText className="w-5 h-5 text-brand-orange-400" />
            </div>
            <h3 className="text-3xl font-black text-white mt-2">18</h3>
            <p className="text-[11px] text-zinc-400 mt-1 flex items-center gap-1 font-medium">
              <span className="text-emerald-400 font-bold">+4</span> new applicants this week
            </p>
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-zinc-950/80 backdrop-blur-xl shadow-xl hover:border-brand-orange-500/40 transition-all">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <span className="text-xs text-emerald-400 font-extrabold uppercase tracking-wider">Onboarding Active</span>
              <ClipboardCheck className="w-5 h-5 text-emerald-400" />
            </div>
            <h3 className="text-3xl font-black text-white mt-2">6</h3>
            <p className="text-[11px] text-zinc-400 mt-1 flex items-center gap-1 font-medium">
              <span className="text-emerald-400 font-bold">2</span> interviews scheduled today
            </p>
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-zinc-950/80 backdrop-blur-xl shadow-xl hover:border-brand-orange-500/40 transition-all">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <span className="text-xs text-blue-400 font-extrabold uppercase tracking-wider">Pending Staffing</span>
              <Users className="w-5 h-5 text-blue-400" />
            </div>
            <h3 className="text-3xl font-black text-white mt-2">4</h3>
            <p className="text-[11px] text-zinc-400 mt-1 flex items-center gap-1 font-medium">
              Clients awaiting RBT match
            </p>
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-zinc-950/80 backdrop-blur-xl shadow-xl hover:border-brand-orange-500/40 transition-all">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <span className="text-xs text-purple-400 font-extrabold uppercase tracking-wider">Monthly Payroll</span>
              <CreditCard className="w-5 h-5 text-purple-400" />
            </div>
            <h3 className="text-3xl font-black text-white mt-2">$48.2k</h3>
            <p className="text-[11px] text-zinc-400 mt-1 flex items-center gap-1 font-medium">
              Bi-weekly disbursement ready
            </p>
          </CardContent>
        </Card>
      </div>

      {/* QUICK WORKFLOW MODULES */}
      <div className="space-y-4">
        <h2 className="text-lg font-black text-white font-heading flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-brand-orange-500" /> Operational Portals &amp; Workflows
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Module 1: ATS Candidate Pipeline */}
          <Link href="/ats" className="group">
            <Card className="border-white/10 bg-zinc-950/90 hover:bg-zinc-900 border transition-all duration-300 hover:border-brand-orange-500/50 hover:shadow-2xl h-full flex flex-col justify-between">
              <CardContent className="p-6 space-y-4">
                <div className="w-12 h-12 rounded-2xl bg-brand-orange-500/10 border border-brand-orange-500/20 text-brand-orange-400 flex items-center justify-center font-bold">
                  <FileText className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-white group-hover:text-brand-orange-400 transition-colors flex items-center justify-between">
                    ATS Applicant Funnel <ArrowUpRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity text-brand-orange-400" />
                  </h3>
                  <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                    Track applicant stages from initial submission, phone screening, 1-on-1 HR interview, to final offer generation.
                  </p>
                </div>
                <div className="pt-3 border-t border-white/5 flex items-center justify-between text-[11px] text-zinc-500 font-mono">
                  <span>18 Active Applicants</span>
                  <span className="text-brand-orange-400 font-bold">Manage Pipeline →</span>
                </div>
              </CardContent>
            </Card>
          </Link>

          {/* Module 2: Onboarding & Compliance */}
          <Link href="/onboarding" className="group">
            <Card className="border-white/10 bg-zinc-950/90 hover:bg-zinc-900 border transition-all duration-300 hover:border-emerald-500/50 hover:shadow-2xl h-full flex flex-col justify-between">
              <CardContent className="p-6 space-y-4">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
                  <ClipboardCheck className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-white group-hover:text-emerald-400 transition-colors flex items-center justify-between">
                    RBT Onboarding Checklist <ArrowUpRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity text-emerald-400" />
                  </h3>
                  <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                    6-point compliance checklist: BACB verification, background checks, Artemis EMR setup, and 1-on-1 interview scoring.
                  </p>
                </div>
                <div className="pt-3 border-t border-white/5 flex items-center justify-between text-[11px] text-zinc-500 font-mono">
                  <span>6 RBTs Onboarding</span>
                  <span className="text-emerald-400 font-bold">Review Compliance →</span>
                </div>
              </CardContent>
            </Card>
          </Link>

          {/* Module 3: Staffing Queue */}
          <Link href="/clients" className="group">
            <Card className="border-white/10 bg-zinc-950/90 hover:bg-zinc-900 border transition-all duration-300 hover:border-blue-500/50 hover:shadow-2xl h-full flex flex-col justify-between">
              <CardContent className="p-6 space-y-4">
                <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center font-bold">
                  <Users className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-white group-hover:text-blue-400 transition-colors flex items-center justify-between">
                    HR Staffing Match Queue <ArrowUpRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity text-blue-400" />
                  </h3>
                  <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                    Match cleared RBT candidates to pending client cases and dispatch assignments directly to CRM Case Coordinators.
                  </p>
                </div>
                <div className="pt-3 border-t border-white/5 flex items-center justify-between text-[11px] text-zinc-500 font-mono">
                  <span>4 Staffing Matches Needed</span>
                  <span className="text-blue-400 font-bold">Dispatch Candidates →</span>
                </div>
              </CardContent>
            </Card>
          </Link>
        </div>
      </div>
    </div>
  );
}
