'use client';

import React from 'react';
import { Users, Briefcase, ArrowRight } from 'lucide-react';
import Link from 'next/link';

/**
 * Case staffing moved to Indeed-style Job Board.
 * HR focuses on ATS applicant-cycle progress.
 */
export default function HrStaffingQueue() {
  return (
    <div className="space-y-8">
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/80 backdrop-blur-xl p-8">
        <div className="pointer-events-none absolute -right-10 top-0 h-40 w-40 rounded-full bg-brand-orange-500/15 blur-3xl" />
        <div className="relative space-y-4 max-w-2xl">
          <h1 className="font-heading text-2xl font-semibold text-white flex items-center gap-2">
            <Users className="w-6 h-6 text-brand-orange-500" />
            Case staffing moved to Job Board
          </h1>
          <p className="text-sm text-zinc-400 leading-relaxed">
            HR no longer dispatches RBTs onto client cases. Clinical Director assigns the BCBA in CRM. Case Coordinators
            post openings; hired RBTs apply on the Job Board; Case Coord runs messaging, video meet, and parent accept.
          </p>
          <p className="text-sm text-zinc-300">
            Your focus stays on the <span className="text-brand-orange-300 font-semibold">applicant cycle</span> (ATS,
            interviews, onboarding) so more RBTs become board-eligible.
          </p>
          <div className="flex flex-wrap gap-3 pt-2">
            <Link
              href="/ats"
              className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-brand-orange-500/40 bg-brand-orange-500/10 px-4 py-2.5 text-sm font-semibold text-brand-orange-200 transition hover:bg-brand-orange-500/20"
            >
              Open ATS pipeline <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/rbt/job-board"
              className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-white/10 px-4 py-2.5 text-sm text-zinc-300 hover:border-white/20"
            >
              <Briefcase className="h-4 w-4" /> Preview RBT Job Board
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
