'use client';

import React from 'react';

const FLOW_STEPS = [
  { key: 'APPLIED', label: 'Applied' },
  { key: 'MESSAGING', label: 'Messaging' },
  { key: 'MEET_SCHEDULED', label: 'Meet' },
  { key: 'PARENT_PENDING', label: 'Parent' },
  { key: 'APPROVED', label: 'Assigned' },
] as const;

const STATUS_ORDER: Record<string, number> = {
  APPLIED: 0,
  MESSAGING: 1,
  MEET_SCHEDULED: 2,
  PARENT_PENDING: 3,
  APPROVED: 4,
  REJECTED: -1,
  WITHDRAWN: -1,
};

export const APPLICATION_STATUS_STYLES: Record<string, string> = {
  APPLIED: 'bg-sky-500/10 text-sky-300 border-sky-500/20',
  MESSAGING: 'bg-violet-500/10 text-violet-300 border-violet-500/20',
  MEET_SCHEDULED: 'bg-amber-500/10 text-amber-300 border-amber-500/20',
  PARENT_PENDING: 'bg-brand-orange-500/10 text-brand-orange-300 border-brand-orange-500/20',
  APPROVED: 'bg-green-500/10 text-green-400 border-green-500/20',
  REJECTED: 'bg-red-500/10 text-red-400 border-red-500/20',
  WITHDRAWN: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
};

/** Sort applicants: live pipeline first (APPLIED first), then terminal. */
export function sortApplicationsByInboxPriority<T extends { status: string; createdAt?: string | Date | null }>(
  apps: T[]
): T[] {
  const rank = (status: string) => {
    if (status === 'APPLIED') return 0;
    if (status === 'MESSAGING') return 1;
    if (status === 'MEET_SCHEDULED') return 2;
    if (status === 'PARENT_PENDING') return 3;
    if (status === 'APPROVED') return 4;
    return 5;
  };
  return [...apps].sort((a, b) => {
    const d = rank(a.status) - rank(b.status);
    if (d !== 0) return d;
    const at = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bt = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return bt - at;
  });
}

export function countNewApplications(apps: Array<{ status: string }>) {
  return apps.filter((a) => a.status === 'APPLIED').length;
}

export function ApplicationFlowBar({ status }: { status: string }) {
  if (status === 'REJECTED' || status === 'WITHDRAWN') {
    return (
      <div
        className={`rounded-xl border px-3 py-2 text-xs font-semibold ${
          APPLICATION_STATUS_STYLES[status] || APPLICATION_STATUS_STYLES.WITHDRAWN
        }`}
      >
        {status === 'REJECTED' ? 'Declined / rejected — opening stays open for other applicants' : 'RBT withdrew'}
      </div>
    );
  }

  const current = STATUS_ORDER[status] ?? 0;

  return (
    <div className="rounded-xl border border-white/10 bg-zinc-950/80 p-3">
      <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
        Applicant pipeline
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        {FLOW_STEPS.map((step, idx) => {
          const done = current > idx;
          const active = current === idx;
          return (
            <React.Fragment key={step.key}>
              {idx > 0 && (
                <span
                  className={`h-px w-3 shrink-0 sm:w-4 ${done || active ? 'bg-brand-orange-500/50' : 'bg-white/10'}`}
                />
              )}
              <span
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[10px] font-semibold uppercase tracking-wide transition-all ${
                  active
                    ? 'border-brand-orange-500/40 bg-brand-orange-500/15 text-brand-orange-200 shadow-[0_0_20px_rgba(249,115,22,0.15)]'
                    : done
                      ? 'border-green-500/25 bg-green-500/10 text-green-300'
                      : 'border-white/10 bg-white/[0.02] text-zinc-600'
                }`}
              >
                {active && <span className="dot-live" />}
                {step.label}
              </span>
            </React.Fragment>
          );
        })}
      </div>
      {status === 'APPROVED' && (
        <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">
          RBT assigned on the client. <span className="text-zinc-300">ACTIVE</span> still requires a durable first
          Session (First Session &amp; Activate tab) — parent accept does not flip status alone.
        </p>
      )}
      {status === 'APPLIED' && (
        <p className="mt-2 text-[11px] leading-relaxed text-sky-300/80">
          New from HRM Job Board — message the RBT, schedule a meet, then send to parent for a decision.
        </p>
      )}
    </div>
  );
}
