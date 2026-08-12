'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Briefcase,
  ClipboardList,
  Users,
  UserCheck,
  Inbox,
} from 'lucide-react';

export type CaseCoordDashboardMetrics = {
  staffingPending: number;
  openOpenings: number;
  pendingApps: number;
  activeCases: number;
  meetAndGreetsPending: number;
  totalCaseload: number;
};

type Coord = { id: string; firstName: string; lastName: string };
type ClientRow = {
  id: string;
  firstName: string;
  lastName: string;
  status: string;
  caseCoordinatorId: string | null;
  rbtId: string | null;
  rbtApproved: boolean | null;
  guardianName: string | null;
};

function pct(part: number, whole: number) {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 100);
}

export default function CaseCoordDashboard({
  coordinators,
  allClients,
  metrics,
}: {
  coordinators: Coord[];
  allClients: ClientRow[];
  metrics: CaseCoordDashboardMetrics;
}) {
  const [selectedCoordId, setSelectedCoordId] = useState<string>('');

  const scoped = useMemo(() => {
    if (!selectedCoordId) {
      return {
        staffingPending: metrics.staffingPending,
        activeCases: metrics.activeCases,
        meetAndGreetsPending: metrics.meetAndGreetsPending,
        totalCaseload: metrics.totalCaseload,
        staffingClients: allClients.filter((c) => c.status === 'STAFFING_PENDING'),
      };
    }
    const mine = allClients.filter((c) => c.caseCoordinatorId === selectedCoordId);
    return {
      staffingPending: mine.filter((c) => c.status === 'STAFFING_PENDING').length,
      activeCases: mine.filter((c) => c.status === 'ACTIVE').length,
      meetAndGreetsPending: mine.filter((c) => c.rbtId && !c.rbtApproved).length,
      totalCaseload: mine.length,
      staffingClients: mine.filter((c) => c.status === 'STAFFING_PENDING'),
    };
  }, [selectedCoordId, allClients, metrics]);

  const activePct = pct(scoped.activeCases, scoped.totalCaseload);
  const staffingPct = pct(scoped.staffingPending, scoped.totalCaseload);

  const cards = [
    {
      key: 'staffing',
      href: '/portal-case-coord/clients?status=STAFFING_PENDING',
      label: 'STAFFING PENDING',
      value: scoped.staffingPending,
      hint: 'Clients awaiting RBT staffing',
      badge: scoped.staffingPending === 0 ? 'CLEAR' : `${staffingPct}% QUEUE`,
      accent: 'brand-orange' as const,
      icon: ClipboardList,
    },
    {
      key: 'openings',
      href: '/portal-case-coord/openings',
      label: 'OPEN OPENINGS',
      value: metrics.openOpenings,
      hint: 'Live marketplace listings',
      badge: metrics.openOpenings === 0 ? 'NONE OPEN' : 'LIVE',
      accent: 'cyan' as const,
      icon: Briefcase,
    },
    {
      key: 'apps',
      href: '/portal-case-coord/openings',
      label: 'PENDING APPS',
      value: metrics.pendingApps,
      hint: 'Applied → parent decision',
      badge: metrics.pendingApps === 0 ? 'INBOX CLEAR' : 'REVIEW',
      accent: 'amber' as const,
      icon: Inbox,
    },
    {
      key: 'active',
      href: '/portal-case-coord/clients?status=ACTIVE',
      label: 'ACTIVE CASELOAD',
      value: scoped.activeCases,
      hint: `${scoped.totalCaseload} total in scope`,
      badge: `${activePct}% ACTIVE`,
      accent: 'emerald' as const,
      icon: UserCheck,
    },
  ];

  const accentStyles = {
    'brand-orange': {
      label: 'text-brand-orange-400',
      badge: 'bg-brand-orange-500/10 text-brand-orange-400 border-brand-orange-500/20',
      hover: 'hover:border-brand-orange-500/50',
      bar: 'bg-brand-orange-500',
      glow: 'group-hover:shadow-[0_0_32px_rgba(255,107,0,0.12)]',
      iconBg: 'bg-brand-orange-500/10 border-brand-orange-500/20 text-brand-orange-400',
    },
    cyan: {
      label: 'text-cyan-400',
      badge: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
      hover: 'hover:border-cyan-500/50',
      bar: 'bg-cyan-500',
      glow: 'group-hover:shadow-[0_0_32px_rgba(34,211,238,0.12)]',
      iconBg: 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400',
    },
    amber: {
      label: 'text-amber-400',
      badge: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
      hover: 'hover:border-amber-500/50',
      bar: 'bg-amber-500',
      glow: 'group-hover:shadow-[0_0_32px_rgba(245,158,11,0.12)]',
      iconBg: 'bg-amber-500/10 border-amber-500/20 text-amber-400',
    },
    emerald: {
      label: 'text-emerald-400',
      badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
      hover: 'hover:border-emerald-500/50',
      bar: 'bg-emerald-500',
      glow: 'group-hover:shadow-[0_0_32px_rgba(16,185,129,0.12)]',
      iconBg: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
    },
  };

  return (
    <div className="relative space-y-8 mt-6 pb-12 animate-fade-in-up">
      <div className="pointer-events-none absolute -top-24 right-0 h-72 w-72 rounded-full bg-brand-orange-500/10 blur-3xl" />
      <div className="pointer-events-none absolute top-40 left-1/4 h-64 w-64 rounded-full bg-cyan-500/5 blur-3xl" />

      {/* Hero */}
      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-zinc-950/80 p-8 shadow-2xl backdrop-blur-xl">
        <div className="absolute top-0 right-1/4 h-96 w-96 rounded-full bg-brand-orange-500/10 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-10 h-72 w-72 rounded-full bg-cyan-500/10 blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-brand-orange-500/20 bg-brand-orange-500/10 px-3 py-1 font-mono text-[11px] font-bold text-brand-orange-400">
              <span className="dot-live" />
              <span>CASE COORD · LIVE DB COUNTS</span>
            </div>
            <h1 className="font-heading text-3xl font-extrabold tracking-tight text-white lg:text-4xl">
              Case Coordination{' '}
              <span className="bg-gradient-to-r from-brand-orange-400 via-amber-300 to-cyan-300 bg-clip-text text-transparent">
                Command Center
              </span>
            </h1>
            <p className="max-w-xl text-sm text-zinc-400">
              Staffing queue, open listings, and pending applications — zeros when the queue is empty.
            </p>
          </div>

          <div className="flex flex-shrink-0 flex-wrap items-center gap-3">
            <div className="flex items-center rounded-xl border border-white/10 bg-zinc-900/90 px-3 py-2 shadow-sm backdrop-blur-md">
              <Users className="mr-2.5 h-4 w-4 text-brand-orange-400" />
              <select
                className="cursor-pointer bg-transparent pr-2 text-xs font-bold text-white outline-none"
                value={selectedCoordId}
                onChange={(e) => setSelectedCoordId(e.target.value)}
              >
                <option value="" className="bg-zinc-950 text-white">
                  All Coordinators
                </option>
                {coordinators.map((c) => (
                  <option key={c.id} value={c.id} className="bg-zinc-950 text-white">
                    {c.firstName} {c.lastName}
                  </option>
                ))}
              </select>
            </div>

            <Link
              href="/portal-case-coord/clients"
              className="flex h-10 cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-brand-orange-500 to-orange-600 px-4 text-xs font-bold text-white shadow-[0_0_20px_rgba(255,107,0,0.3)] transition-all hover:scale-105 hover:from-brand-orange-600 hover:to-orange-700"
            >
              Clients roster
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/portal-case-coord/openings"
              className="flex h-10 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-zinc-900/90 px-4 text-xs font-bold text-zinc-200 transition-all hover:border-cyan-500/40 hover:bg-zinc-800 hover:text-white"
            >
              <Briefcase className="h-3.5 w-3.5 text-cyan-400" />
              Openings
            </Link>
          </div>
        </div>

        {/* Quick deep-link strip */}
        <div className="relative z-10 mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Link
            href="/portal-case-coord/clients?status=STAFFING_PENDING"
            className="group cursor-pointer rounded-2xl border border-white/10 bg-zinc-950/60 px-4 py-3 backdrop-blur-xl transition-all duration-300 hover:scale-[1.01] hover:border-brand-orange-500/40 hover:shadow-2xl"
          >
            <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-brand-orange-400">
              Staffing queue
            </p>
            <p className="mt-1 text-xs text-zinc-400">
              Roster filtered to <span className="text-zinc-200">STAFFING_PENDING</span>
            </p>
            <span className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-brand-orange-300 group-hover:text-brand-orange-200">
              Open clients <ArrowRight className="h-3 w-3" />
            </span>
          </Link>
          <Link
            href="/portal-case-coord/openings"
            className="group cursor-pointer rounded-2xl border border-white/10 bg-zinc-950/60 px-4 py-3 backdrop-blur-xl transition-all duration-300 hover:scale-[1.01] hover:border-cyan-500/40 hover:shadow-2xl"
          >
            <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-cyan-400">
              Job openings
            </p>
            <p className="mt-1 text-xs text-zinc-400">
              Marketplace · review apps · parent accept
            </p>
            <span className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-cyan-300 group-hover:text-cyan-200">
              Openings board <ArrowRight className="h-3 w-3" />
            </span>
          </Link>
          <div className="rounded-2xl border border-white/10 bg-zinc-950/60 px-4 py-3 backdrop-blur-xl">
            <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-emerald-400">
              Staffing · First Session
            </p>
            <p className="mt-1 text-xs text-zinc-400">
              Client profile → checklist (auth, BCBA, opening, RBT)
            </p>
            {scoped.staffingClients[0] ? (
              <Link
                href={`/client/${scoped.staffingClients[0].id}?mode=case-coord&tab=staffing`}
                className="mt-2 inline-flex cursor-pointer items-center gap-1 text-[11px] font-semibold text-emerald-300 hover:text-emerald-200"
              >
                Open staffing tab <ArrowRight className="h-3 w-3" />
              </Link>
            ) : (
              <p className="mt-2 font-mono text-[11px] text-zinc-500">No STAFFING_PENDING clients</p>
            )}
          </div>
        </div>
      </div>

      {/* Metric cards — real counts, honest zeros */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => {
          const styles = accentStyles[card.accent];
          const Icon = card.icon;
          const barWidth =
            card.key === 'staffing'
              ? staffingPct
              : card.key === 'active'
                ? activePct
                : card.value > 0
                  ? Math.min(100, 20 + card.value * 8)
                  : 0;

          return (
            <Link
              key={card.key}
              href={card.href}
              className={`group relative cursor-pointer overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/80 p-6 shadow-xl backdrop-blur-xl transition-all duration-300 hover:scale-[1.01] hover:shadow-2xl ${styles.hover} ${styles.glow}`}
            >
              <div className="flex items-center justify-between">
                <span className={`font-mono text-xs font-bold uppercase tracking-wider ${styles.label}`}>
                  {card.label}
                </span>
                <span
                  className={`rounded-full border px-2.5 py-1 font-mono text-[10px] font-bold ${styles.badge}`}
                >
                  {card.badge}
                </span>
              </div>

              <div className="mt-4 flex items-end justify-between gap-3">
                <div>
                  <h3 className="font-mono text-4xl font-black tracking-tight text-white">
                    {card.value}
                  </h3>
                  <p className="mt-1 text-xs text-zinc-400">{card.hint}</p>
                </div>
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-xl border ${styles.iconBg}`}
                >
                  <Icon className="h-5 w-5" />
                </div>
              </div>

              <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-zinc-900">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${styles.bar}`}
                  style={{ width: `${barWidth}%` }}
                />
              </div>

              <div className="mt-3 flex items-center gap-1 font-mono text-[11px] text-zinc-500 transition-colors group-hover:text-zinc-300">
                Open <ArrowRight className="h-3 w-3" />
              </div>
            </Link>
          );
        })}
      </div>

      {/* Secondary: meet & greets + staffing list deep links */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-zinc-950/80 p-6 shadow-xl backdrop-blur-xl">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-mono text-xs font-bold uppercase tracking-wider text-amber-400">
                Meet &amp; greets
              </p>
              <h3 className="mt-1 font-heading text-lg font-bold text-white">
                Parent approval pending
              </h3>
            </div>
            <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 font-mono text-[10px] font-bold text-amber-400">
              {scoped.meetAndGreetsPending}
            </span>
          </div>
          <p className="mt-2 text-xs text-zinc-400">
            RBT linked, awaiting parent approve — manage from roster or openings.
          </p>
          <Link
            href="/portal-case-coord/clients"
            className="mt-4 inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-white/10 bg-zinc-900/80 px-3 py-2 text-xs font-bold text-zinc-200 transition-all hover:border-amber-500/40 hover:text-white"
          >
            Open roster <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        <div className="rounded-2xl border border-white/10 bg-zinc-950/80 p-6 shadow-xl backdrop-blur-xl">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-mono text-xs font-bold uppercase tracking-wider text-brand-orange-400">
                Staffing tabs
              </p>
              <h3 className="mt-1 font-heading text-lg font-bold text-white">
                Jump to client staffing
              </h3>
            </div>
            <span className="rounded-full border border-brand-orange-500/20 bg-brand-orange-500/10 px-2.5 py-1 font-mono text-[10px] font-bold text-brand-orange-400">
              {scoped.staffingClients.length}
            </span>
          </div>

          {scoped.staffingClients.length === 0 ? (
            <p className="mt-4 rounded-xl border border-dashed border-white/10 px-4 py-6 text-center font-mono text-xs text-zinc-500">
              0 STAFFING_PENDING — nothing to staff
            </p>
          ) : (
            <ul className="mt-4 max-h-48 space-y-2 overflow-y-auto">
              {scoped.staffingClients.slice(0, 8).map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/client/${c.id}?mode=case-coord&tab=staffing`}
                    className="flex cursor-pointer items-center justify-between rounded-xl border border-white/5 bg-zinc-900/60 px-3 py-2.5 transition-all duration-300 hover:scale-[1.01] hover:border-brand-orange-500/40 hover:shadow-lg"
                  >
                    <span className="text-sm font-semibold text-white">
                      {c.firstName} {c.lastName}
                    </span>
                    <span className="inline-flex items-center gap-1 font-mono text-[10px] font-bold text-brand-orange-400">
                      Staffing <ArrowRight className="h-3 w-3" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
