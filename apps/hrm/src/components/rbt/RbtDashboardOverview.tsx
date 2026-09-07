'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Calendar,
  Clock,
  CreditCard,
  Briefcase,
  MessageSquare,
  FileText,
  HeartHandshake,
  CheckCircle2,
  MapPin,
  UserCheck,
  ChevronRight,
  ShieldCheck,
  ArrowUpRight,
  DollarSign,
} from 'lucide-react';
import { listRbtPayrollSessions } from '@/app/actions/payrollActions';
import { getActiveApplicantName } from '@/lib/syncAtsProgress';

export function RbtDashboardOverview() {
  const [userName, setUserName] = useState<string>('RBT Specialist');
  const [stats, setStats] = useState({
    totalHours: 0,
    completedSessions: 0,
    activeClients: 0,
    payHoldCount: 0,
    estimatedEarnings: 0,
    mileageReimbursement: 0,
    goalAttainmentRate: null as number | null,
  });
  const [, setLoading] = useState(true);

  useEffect(() => {
    async function loadDashboardData() {
      try {
        const name = getActiveApplicantName();
        if (name && name !== 'Applicant') {
          setUserName(name);
        }

        const payrollRes = await listRbtPayrollSessions();
        if (payrollRes.success && payrollRes.sessions) {
          const sessions = payrollRes.sessions;
          const totalHours = sessions.reduce((acc, s) => acc + (s.estimatedUnits ? s.estimatedUnits / 4 : 0), 0);
          const payHolds = sessions.filter((s) => !s.payable || Boolean(s.holdReason)).length;
          const totalEarnings = sessions.reduce((acc, s) => acc + (s.estimatedPay || 0), 0);
          setStats({
            totalHours: Number(totalHours.toFixed(1)),
            completedSessions: sessions.length,
            activeClients: 0,
            payHoldCount: payHolds,
            estimatedEarnings: Number(totalEarnings.toFixed(2)),
            mileageReimbursement: 0,
            goalAttainmentRate: null,
          });
        }
      } catch (err) {
        console.warn('Dashboard stats load notice:', err);
      } finally {
        setLoading(false);
      }
    }
    void loadDashboardData();
  }, []);

  return (
    <div className="space-y-8 pb-12 text-slate-900">
      {/* HEADER BANNER */}
      <div className="relative overflow-hidden rounded-3xl border border-[#E2D5B7] bg-[#FFFDF8] p-6 shadow-xl md:p-8">
        <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-[radial-gradient(ellipse_at_top_right,_rgba(249,115,22,0.12),_transparent_58%)]" />
        <div className="pointer-events-none absolute -left-20 -bottom-20 h-72 w-72 rounded-full bg-[radial-gradient(ellipse_at_bottom_left,_rgba(16,185,129,0.1),_transparent_58%)]" />

        <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 font-mono text-xs font-bold text-emerald-800">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                REGISTERED BEHAVIOR TECHNICIAN · ACTIVE
              </span>
              <span className="rounded-full border border-[#E2D5B7] bg-[#F9F5EC] px-3 py-1 font-mono text-xs font-bold text-slate-700">
                NYC METRO CLINICAL TEAM
              </span>
            </div>
            <h1 className="font-heading text-2xl font-black text-slate-900 md:text-3xl lg:text-4xl">
              Welcome Back, {userName}! 👋
            </h1>
            <p className="text-sm font-medium text-slate-600">
              Here is your clinical performance summary, active caseload analytics, and upcoming schedule overview.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/rbt/schedule"
              className="inline-flex cursor-pointer items-center gap-2 rounded-2xl bg-gradient-to-r from-[#F97316] to-amber-500 px-5 py-3 text-xs font-extrabold text-white shadow-lg shadow-orange-500/20 transition-all hover:scale-[1.02] hover:bg-orange-600"
            >
              <Calendar className="h-4 w-4" />
              <span>Launch Schedule Studio →</span>
            </Link>
            <Link
              href="/rbt/job-board"
              className="inline-flex cursor-pointer items-center gap-2 rounded-2xl border border-[#E2D5B7] bg-[#F9F5EC] px-4 py-3 text-xs font-bold text-slate-800 transition-all hover:bg-white hover:border-orange-300"
            >
              <Briefcase className="h-4 w-4 text-orange-600" />
              <span>Browse Job Board</span>
            </Link>
          </div>
        </div>
      </div>

      {/* KPI METRICS GRID (4 CARDS) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Metric 1: Hours Worked */}
        <div className="group relative overflow-hidden rounded-2xl border border-[#E2D5B7] bg-[#FFFDF8] p-5 shadow-lg transition-all duration-300 hover:border-orange-300 hover:shadow-xl">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs font-bold uppercase tracking-wider text-slate-500">
              Hours Worked
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-amber-200 bg-amber-50 text-amber-600">
              <Clock className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="flex items-baseline gap-2">
              <span className="font-heading text-3xl font-black text-slate-900">
                {stats.totalHours}
              </span>
              <span className="font-mono text-xs font-bold text-slate-500">hrs this period</span>
            </div>
            <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full bg-gradient-to-r from-amber-500 to-[#F97316] transition-all duration-500"
                style={{ width: `${Math.min(100, (stats.totalHours / 40) * 100)}%` }}
              />
            </div>
            <p className="mt-2 text-[11px] font-medium text-slate-500">
              Target: 40 hrs / period ({Math.round((stats.totalHours / 40) * 100)}% complete)
            </p>
          </div>
        </div>

        {/* Metric 2: Completed Sessions */}
        <div className="group relative overflow-hidden rounded-2xl border border-[#E2D5B7] bg-[#FFFDF8] p-5 shadow-lg transition-all duration-300 hover:border-emerald-300 hover:shadow-xl">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs font-bold uppercase tracking-wider text-slate-500">
              Completed Sessions
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-600">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="flex items-baseline gap-2">
              <span className="font-heading text-3xl font-black text-slate-900">
                {stats.completedSessions}
              </span>
              <span className="font-mono text-xs font-bold text-emerald-700">Sessions</span>
            </div>
            <p className="mt-3 flex items-center gap-1.5 text-[11px] font-bold text-emerald-700">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>100% Documentation Attested</span>
            </p>
          </div>
        </div>

        {/* Metric 3: Active Caseload */}
        <div className="group relative overflow-hidden rounded-2xl border border-[#E2D5B7] bg-[#FFFDF8] p-5 shadow-lg transition-all duration-300 hover:border-sky-300 hover:shadow-xl">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs font-bold uppercase tracking-wider text-slate-500">
              Active Caseload
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-sky-200 bg-sky-50 text-sky-600">
              <UserCheck className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="flex items-baseline gap-2">
              <span className="font-heading text-3xl font-black text-slate-900">
                {stats.activeClients}
              </span>
              <span className="font-mono text-xs font-bold text-sky-700">Clients</span>
            </div>
            <p className="mt-3 flex items-center gap-1.5 font-mono text-[11px] text-slate-600">
              <MapPin className="h-3.5 w-3.5 text-sky-600" />
              <span>Brooklyn &amp; Queens Boroughs</span>
            </p>
          </div>
        </div>

        {/* Metric 4: Estimated Earnings */}
        <div className="group relative overflow-hidden rounded-2xl border border-[#E2D5B7] bg-[#FFFDF8] p-5 shadow-lg transition-all duration-300 hover:border-purple-300 hover:shadow-xl">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs font-bold uppercase tracking-wider text-slate-500">
              Estimated Earnings
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-purple-200 bg-purple-50 text-purple-600">
              <DollarSign className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="flex items-baseline gap-1">
              <span className="font-heading text-3xl font-black text-slate-900">
                ${stats.estimatedEarnings.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </span>
            </div>
            <p className="mt-3 flex items-center gap-1.5 font-mono text-[11px] text-purple-700">
              <CreditCard className="h-3.5 w-3.5" />
              <span>Next Paydate: Aug 20 (Direct Deposit)</span>
            </p>
          </div>
        </div>
      </div>

      {/* ANALYTICS & CLINICAL GOALS ROW */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left 2 Cols: Clinical & Performance Breakdown */}
        <div className="space-y-6 lg:col-span-2">
          {/* Clinical Goal Progress Card */}
          <div className="rounded-3xl border border-[#E2D5B7] bg-[#FFFDF8] p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-heading text-lg font-black text-slate-900">
                  Clinical Session &amp; Goal Attainment
                </h3>
                <p className="text-xs text-slate-600">
                  Target data progress across active treatment plans
                </p>
              </div>
              <span className="rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 font-mono text-xs font-extrabold text-emerald-800">
                {stats.goalAttainmentRate == null
                  ? 'No goal data yet'
                  : `${stats.goalAttainmentRate}% Target Met`}
              </span>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border border-[#E2D5B7]/60 bg-white p-4 shadow-sm">
                <span className="font-mono text-[11px] font-bold text-slate-500">Direct ABA Sessions</span>
                <p className="mt-1 font-heading text-2xl font-black text-slate-900">—</p>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full bg-slate-200" style={{ width: '0%' }} />
                </div>
              </div>
              <div className="rounded-2xl border border-[#E2D5B7]/60 bg-white p-4 shadow-sm">
                <span className="font-mono text-[11px] font-bold text-slate-500">BCBA Supervision</span>
                <p className="mt-1 font-heading text-2xl font-black text-sky-700">—</p>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full bg-slate-200" style={{ width: '0%' }} />
                </div>
              </div>
              <div className="rounded-2xl border border-[#E2D5B7]/60 bg-white p-4 shadow-sm">
                <span className="font-mono text-[11px] font-bold text-slate-500">Mileage Reimbursed</span>
                <p className="mt-1 font-heading text-2xl font-black text-purple-700">{stats.mileageReimbursement} mi</p>
                <p className="mt-1 font-mono text-[10px] text-slate-500">Est. +$28.25 travel pay</p>
              </div>
            </div>

            {/* Upcoming Shifts Overview */}
            <div className="mt-6 space-y-3">
              <h4 className="font-mono text-xs font-extrabold uppercase tracking-wider text-slate-500">
                Today &amp; Upcoming Client Sessions
              </h4>
              <div className="space-y-2.5">
                {[
                  {
                    client: 'Ethan M.',
                    time: 'Today, 2:30 PM - 5:30 PM',
                    borough: 'Brooklyn (Flatbush)',
                    type: 'Direct ABA · 3.0 hrs',
                    status: 'UPCOMING',
                  },
                  {
                    client: 'Sofia R.',
                    time: 'Tomorrow, 9:00 AM - 12:00 PM',
                    borough: 'Queens (Forest Hills)',
                    type: 'Supervision & Direct · 3.0 hrs',
                    status: 'SCHEDULED',
                  },
                  {
                    client: 'Lucas K.',
                    time: 'Thursday, 3:00 PM - 6:00 PM',
                    borough: 'Brooklyn (Park Slope)',
                    type: 'Direct ABA · 3.0 hrs',
                    status: 'SCHEDULED',
                  },
                ].map((shift, idx) => (
                  <div
                    key={idx}
                    className="flex flex-col gap-3 rounded-2xl border border-[#E2D5B7]/70 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-orange-200 bg-orange-50 font-heading text-sm font-extrabold text-orange-700">
                        {shift.client.slice(0, 2)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h5 className="font-extrabold text-slate-900 text-sm">{shift.client}</h5>
                          <span className="rounded border border-[#E2D5B7] bg-[#F9F5EC] px-2 py-0.5 font-mono text-[10px] font-bold text-slate-700">
                            {shift.type}
                          </span>
                        </div>
                        <p className="mt-0.5 font-mono text-xs text-slate-600 flex items-center gap-1.5">
                          <Clock className="h-3 w-3 text-slate-400" /> {shift.time}
                          <span className="text-slate-300">•</span>
                          <MapPin className="h-3 w-3 text-slate-400" /> {shift.borough}
                        </p>
                      </div>
                    </div>
                    <Link
                      href="/rbt/schedule"
                      className="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-orange-200 bg-orange-50 px-3.5 py-2 text-xs font-extrabold text-orange-700 transition-all hover:bg-orange-100"
                    >
                      <span>Launch EMR</span>
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Right 1 Col: Quick Launchpad & Shortcuts */}
        <div className="space-y-4">
          <div className="rounded-3xl border border-[#E2D5B7] bg-[#FFFDF8] p-6 shadow-xl">
            <h3 className="font-heading text-lg font-black text-slate-900">
              Staff Portal Shortcuts
            </h3>
            <p className="text-xs text-slate-600">
              Quick access to your core workspace tools
            </p>

            <div className="mt-4 space-y-2.5">
              {[
                {
                  title: 'Schedule Studio',
                  desc: 'Manage shifts & submit session notes',
                  href: '/rbt/schedule',
                  icon: Calendar,
                  color: 'text-orange-700 bg-orange-50 border-orange-200',
                },
                {
                  title: 'Case Job Board',
                  desc: 'Apply for open client openings',
                  href: '/rbt/job-board',
                  icon: Briefcase,
                  color: 'text-amber-700 bg-amber-50 border-amber-200',
                },
                {
                  title: 'Team Messenger',
                  desc: 'Chat with BCBAs & HR Team',
                  href: '/rbt/communication',
                  icon: MessageSquare,
                  color: 'text-sky-700 bg-sky-50 border-sky-200',
                },
                {
                  title: 'Payroll & Earnings',
                  desc: 'View pay stubs & tax documents',
                  href: '/rbt/payroll',
                  icon: CreditCard,
                  color: 'text-emerald-700 bg-emerald-50 border-emerald-200',
                },
                {
                  title: 'Contracts & Documents',
                  desc: 'LS-54 & signed onboarding packs',
                  href: '/rbt/documents',
                  icon: FileText,
                  color: 'text-purple-700 bg-purple-50 border-purple-200',
                },
                {
                  title: 'HR Staff Help Desk',
                  desc: 'Submit ticket & support requests',
                  href: '/rbt/help-desk',
                  icon: HeartHandshake,
                  color: 'text-rose-700 bg-rose-50 border-rose-200',
                },
              ].map((item, i) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={i}
                    href={item.href}
                    className="group flex items-center justify-between rounded-2xl border border-[#E2D5B7]/70 bg-white p-3.5 shadow-sm transition-all duration-300 hover:scale-[1.01] hover:border-orange-300 hover:bg-[#F9F5EC]"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`flex h-9 w-9 items-center justify-center rounded-xl border ${item.color}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-slate-900 transition-colors group-hover:text-orange-600">
                          {item.title}
                        </h4>
                        <p className="text-[10px] text-slate-500">{item.desc}</p>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:text-slate-900" />
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
