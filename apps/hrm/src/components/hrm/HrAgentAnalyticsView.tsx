'use client';

import React from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { 
  BarChart3, 
  TrendingUp, 
  Users, 
  Clock, 
  Award, 
  ShieldCheck, 
  CheckCircle2, 
  FileText, 
  PieChart, 
  ArrowRight,
  UserCheck,
  Target,
  ChevronDown,
  ChevronRight,
  Video,
} from 'lucide-react';

export default function HrAgentAnalyticsView() {
  const [isUpcomingOpen, setIsUpcomingOpen] = React.useState(true);
  const [isWaitingOpen, setIsWaitingOpen] = React.useState(true);
  const [isPastOpen, setIsPastOpen] = React.useState(false);
  const [isClaimedByMe, setIsClaimedByMe] = React.useState(true);
  return (
    <div className="space-y-8 animate-fade-in text-white pb-12">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-zinc-950 p-6 sm:p-8 rounded-3xl border border-white/10 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-brand-orange-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10">
          <div className="flex items-center gap-2 text-brand-orange-400 font-mono text-xs font-bold uppercase tracking-wider mb-2">
            <BarChart3 className="w-4 h-4" /> HR Analytics &amp; Recruitment Performance Dashboard
          </div>
          <h1 className="text-3xl sm:text-4xl font-black text-white font-heading tracking-tight">
            HR Agent Operations &amp; Intelligence
          </h1>
          <p className="text-xs sm:text-sm text-zinc-400 mt-1 max-w-2xl">
            Real-time analytics on candidate recruitment conversion rates, interview pass velocity, BACB compliance clearance, and borough staffing density.
          </p>
        </div>

        <div className="relative z-10 flex items-center gap-3">
          <Link href="/ats">
            <Button className="bg-brand-orange-500 hover:bg-brand-orange-600 text-white font-black text-xs px-5 h-11 rounded-2xl shadow-lg cursor-pointer flex items-center gap-2">
              <Users className="w-4 h-4" /> Go to ATS Candidate Pipeline
              <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
        </div>
      </div>

      {/* KPI STATISTICAL OVERVIEW CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-white/10 bg-zinc-950/80 backdrop-blur-xl shadow-xl hover:border-brand-orange-500/40 transition-all">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <span className="text-xs text-brand-orange-400 font-extrabold uppercase tracking-wider">Recruitment Velocity</span>
              <TrendingUp className="w-5 h-5 text-brand-orange-400" />
            </div>
            <h3 className="text-3xl font-black text-white mt-2">12.4 Days</h3>
            <p className="text-[11px] text-zinc-400 mt-1 flex items-center gap-1 font-medium">
              <span className="text-emerald-400 font-bold">-2.1 days</span> vs last month average
            </p>
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-zinc-950/80 backdrop-blur-xl shadow-xl hover:border-brand-orange-500/40 transition-all">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <span className="text-xs text-cyan-400 font-extrabold uppercase tracking-wider">Interview Pass Rate</span>
              <Award className="w-5 h-5 text-cyan-400" />
            </div>
            <h3 className="text-3xl font-black text-white mt-2">88.5%</h3>
            <p className="text-[11px] text-zinc-400 mt-1 flex items-center gap-1 font-medium">
              <span className="text-emerald-400 font-bold">23 / 26</span> passed HR interviews
            </p>
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-zinc-950/80 backdrop-blur-xl shadow-xl hover:border-brand-orange-500/40 transition-all">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <span className="text-xs text-purple-400 font-extrabold uppercase tracking-wider">BACB Compliance Rate</span>
              <ShieldCheck className="w-5 h-5 text-purple-400" />
            </div>
            <h3 className="text-3xl font-black text-white mt-2">100%</h3>
            <p className="text-[11px] text-zinc-400 mt-1 flex items-center gap-1 font-medium">
              <span className="text-emerald-400 font-bold">Zero</span> compliance deficiencies
            </p>
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-zinc-950/80 backdrop-blur-xl shadow-xl hover:border-brand-orange-500/40 transition-all">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <span className="text-xs text-emerald-400 font-extrabold uppercase tracking-wider">Offer Acceptance Ratio</span>
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            </div>
            <h3 className="text-3xl font-black text-white mt-2">94.2%</h3>
            <p className="text-[11px] text-zinc-400 mt-1 flex items-center gap-1 font-medium">
              <span className="text-emerald-400 font-bold">+3.2%</span> year-over-year target
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ANALYTICS SECTION GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 1. RECRUITMENT FUNNEL CONVERSION */}
        <Card className="border-white/10 bg-zinc-950 shadow-xl lg:col-span-2">
          <CardHeader className="pb-4 border-b border-white/5 flex flex-row items-center justify-between">
            <CardTitle className="text-base text-white flex items-center gap-2">
              <Target className="w-5 h-5 text-brand-orange-500" />
              Recruitment Funnel &amp; Conversion Efficiency
            </CardTitle>
            <span className="text-[10px] font-mono font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full uppercase">
              Live Metrics
            </span>
          </CardHeader>
          <CardContent className="pt-6 space-y-5">
            {/* Step 1: Applications Received */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="font-bold text-white">1. Public Applications Received</span>
                <span className="font-mono font-bold text-brand-orange-400">42 Applicants (100%)</span>
              </div>
              <div className="w-full h-3 bg-zinc-900 rounded-full overflow-hidden border border-white/5">
                <div className="h-full bg-brand-orange-500 rounded-full w-full" />
              </div>
            </div>

            {/* Step 2: HR Screening & Magic Links */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="font-bold text-zinc-300">2. HR Screen Approved &amp; Magic Links Sent</span>
                <span className="font-mono font-bold text-blue-400">34 Candidates (80.9%)</span>
              </div>
              <div className="w-full h-3 bg-zinc-900 rounded-full overflow-hidden border border-white/5">
                <div className="h-full bg-blue-500 rounded-full w-[80.9%]" />
              </div>
            </div>

            {/* Step 3: Video Interviews Conducted */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="font-bold text-zinc-300">3. 1-on-1 Video Onboarding Interviews</span>
                <span className="font-mono font-bold text-purple-400">26 Candidates (61.9%)</span>
              </div>
              <div className="w-full h-3 bg-zinc-900 rounded-full overflow-hidden border border-white/5">
                <div className="h-full bg-purple-500 rounded-full w-[61.9%]" />
              </div>
            </div>

            {/* Step 4: Clearance & Hired */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="font-bold text-zinc-300">4. Cleared &amp; Hired RBT Staff</span>
                <span className="font-mono font-bold text-emerald-400">23 Active RBTs (54.7%)</span>
              </div>
              <div className="w-full h-3 bg-zinc-900 rounded-full overflow-hidden border border-white/5">
                <div className="h-full bg-emerald-500 rounded-full w-[54.7%]" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 2. NYC BOROUGH STAFFING DISTRIBUTION */}
        <Card className="border-white/10 bg-zinc-950 shadow-xl">
          <CardHeader className="pb-4 border-b border-white/5">
            <CardTitle className="text-base text-white flex items-center gap-2">
              <PieChart className="w-5 h-5 text-cyan-400" />
              NYC Borough RBT Density
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6 space-y-4">
            <div className="space-y-3 text-xs">
              <div className="flex justify-between items-center bg-zinc-900 p-3 rounded-xl border border-white/5">
                <span className="font-bold text-white">Brooklyn (Park Slope / Williamsburg)</span>
                <span className="font-mono font-bold text-brand-orange-400">9 RBTs (39%)</span>
              </div>
              <div className="flex justify-between items-center bg-zinc-900 p-3 rounded-xl border border-white/5">
                <span className="font-bold text-white">Queens (Astoria / Forest Hills)</span>
                <span className="font-mono font-bold text-blue-400">6 RBTs (26%)</span>
              </div>
              <div className="flex justify-between items-center bg-zinc-900 p-3 rounded-xl border border-white/5">
                <span className="font-bold text-white">Manhattan (Upper East Side / Harlem)</span>
                <span className="font-mono font-bold text-purple-400">4 RBTs (17%)</span>
              </div>
              <div className="flex justify-between items-center bg-zinc-900 p-3 rounded-xl border border-white/5">
                <span className="font-bold text-white">Bronx &amp; Staten Island</span>
                <span className="font-mono font-bold text-emerald-400">4 RBTs (17%)</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* HR INTERVIEW QUEUE & OWNERSHIP MANAGEMENT HUB */}
      <div className="space-y-4 pt-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-black text-white font-heading flex items-center gap-2">
              <Clock className="w-5 h-5 text-brand-orange-500" />
              <span>HR Recruitment Interview Queues</span>
            </h2>
            <p className="text-xs text-zinc-400 font-mono mt-0.5">Manage unclaimed slots, upcoming scheduled calls, and completed interview archives.</p>
          </div>
        </div>

        {/* SECTION 1: WAITING FOR CLAIM / OPEN HR QUEUE ACCORDION */}
        {!isClaimedByMe && (
          <Card className="border-amber-500/40 bg-zinc-950 shadow-xl overflow-hidden">
            <CardHeader className="pb-3 border-b border-white/10 bg-amber-500/10 flex flex-row items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-amber-400 animate-pulse" />
                <CardTitle className="text-xs font-black uppercase text-amber-300 font-mono tracking-wider flex items-center gap-2">
                  <span>Waiting for Claim / Open HR Queue</span>
                  <span className="bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full text-[10px]">1 Unclaimed Slot</span>
                </CardTitle>
              </div>
              <button
                type="button"
                onClick={() => setIsWaitingOpen(!isWaitingOpen)}
                className="text-zinc-400 hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
              >
                {isWaitingOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </button>
            </CardHeader>
            {isWaitingOpen && (
              <CardContent className="p-4 flex items-center justify-between gap-4">
                <div>
                  <h4 className="text-sm font-bold text-white flex items-center gap-2">
                    <span>azm karim (RBT Applicant)</span>
                    <span className="text-xs text-amber-400 font-mono">• Fri, Aug 7 at 3:00 PM</span>
                  </h4>
                  <p className="text-xs text-zinc-400 mt-1">This interview was booked by candidate and is currently unclaimed.</p>
                </div>
                <Button
                  onClick={() => {
                    setIsClaimedByMe(true);
                  }}
                  className="bg-amber-500 hover:bg-amber-600 text-black font-black text-xs px-5 h-10 rounded-xl flex items-center gap-2 shadow-lg shadow-amber-500/20 cursor-pointer"
                >
                  <UserCheck className="w-4 h-4" />
                  <span>Claim Interview Slot</span>
                </Button>
              </CardContent>
            )}
          </Card>
        )}

        {/* SECTION 2: UPCOMING SCHEDULED INTERVIEWS ACCORDION */}
        <Card className="border-emerald-500/30 bg-zinc-950 shadow-xl overflow-hidden">
          <CardHeader className="pb-3 border-b border-white/10 bg-zinc-900/60 flex flex-row items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full bg-emerald-400 animate-pulse" />
              <CardTitle className="text-xs font-black uppercase text-emerald-400 font-mono tracking-wider flex items-center gap-2">
                <span>Upcoming Scheduled Interviews</span>
                <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2.5 py-0.5 rounded-full text-[10px]">1 Scheduled Slot</span>
              </CardTitle>
            </div>
            <button
              type="button"
              onClick={() => setIsUpcomingOpen(!isUpcomingOpen)}
              className="text-zinc-400 hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
            >
              {isUpcomingOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
          </CardHeader>

          {isUpcomingOpen && (
            <CardContent className="p-4 space-y-4">
              <div className="bg-zinc-900/60 border border-white/10 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-brand-orange-500/20 border border-brand-orange-500/40 flex items-center justify-center text-brand-orange-400 font-black text-sm">
                    AK
                  </div>
                  <div>
                    <h2 className="text-base font-extrabold text-white flex items-center gap-2">
                      <span>azm karim (RBT Applicant)</span>
                      <span className="text-xs text-zinc-400 font-mono font-normal">• Fri, Aug 7 at 3:00 PM</span>
                    </h2>
                    <p className="text-[11px] text-zinc-400 font-mono flex items-center gap-2 mt-0.5">
                      <span>Claimed by <strong className="text-white">Marcus Vance</strong></span>
                      <button
                        onClick={() => {
                          setIsClaimedByMe(false);
                        }}
                        className="text-rose-400 hover:underline cursor-pointer font-bold"
                      >
                        Unclaim Slot
                      </button>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <a
                    href="https://meet.jit.si/RiseAndShine_HR_Interview_cand_1"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs px-5 py-2.5 rounded-xl shadow-lg flex items-center gap-2 cursor-pointer transition-all hover:scale-[1.02]"
                  >
                    <Video className="w-4 h-4 text-white animate-pulse" />
                    <span>Join Meeting</span>
                  </a>

                  <Link href="/ats/applicant/cand-1?tab=INTERVIEW">
                    <Button className="bg-brand-orange-500 hover:bg-brand-orange-600 text-white font-extrabold text-xs px-4 h-10 rounded-xl flex items-center gap-2 shadow-md cursor-pointer">
                      <FileText className="w-4 h-4" />
                      <span>Script &amp; Scorecard</span>
                    </Button>
                  </Link>
                </div>
              </div>
            </CardContent>
          )}
        </Card>

        {/* SECTION 3: PAST COMPLETED INTERVIEWS ACCORDION */}
        <Card className="border-white/10 bg-zinc-950 shadow-xl overflow-hidden">
          <CardHeader className="pb-3 border-b border-white/10 bg-zinc-900/40 flex flex-row items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full bg-zinc-500" />
              <CardTitle className="text-xs font-black uppercase text-zinc-400 font-mono tracking-wider flex items-center gap-2">
                <span>Past &amp; Completed Interview Archive</span>
                <span className="bg-zinc-800 text-zinc-400 border border-white/10 px-2.5 py-0.5 rounded-full text-[10px]">1 Archived Record</span>
              </CardTitle>
            </div>
            <button
              type="button"
              onClick={() => setIsPastOpen(!isPastOpen)}
              className="text-zinc-400 hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
            >
              {isPastOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
          </CardHeader>

          {isPastOpen && (
            <CardContent className="p-4">
              <div className="p-4 rounded-2xl bg-zinc-900/60 border border-white/10 flex items-center justify-between gap-4 text-xs">
                <div>
                  <h5 className="font-extrabold text-white">azm karim — Initial HR Onboarding Screen</h5>
                  <p className="text-zinc-400 font-mono text-[11px] mt-0.5">Conducted by Marcus Vance • Scorecard: 4.8/5 ★</p>
                </div>
                <span className="px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-extrabold text-[10px] rounded-full uppercase">
                  ✓ Cleared
                </span>
              </div>
            </CardContent>
          )}
        </Card>
      </div>
    </div>
  );
}
