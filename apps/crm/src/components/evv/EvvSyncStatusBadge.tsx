'use client';

import React from 'react';
import { CheckCircle2, Clock, AlertTriangle } from 'lucide-react';

export type EvvStatusProps = {
  vendor?: string | null;
  status?: string | null;
};

export function EvvSyncStatusBadge({ vendor, status }: EvvStatusProps) {
  const normalizedStatus = (status || 'PENDING').toUpperCase();
  const displayVendor = vendor ? vendor.toUpperCase() : 'STATE EVV';

  if (normalizedStatus === 'ACCEPTED') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 font-mono text-[10px] font-bold text-emerald-300">
        <CheckCircle2 className="h-3 w-3" />
        {displayVendor}: ACCEPTED
      </span>
    );
  }

  if (normalizedStatus === 'REJECTED') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-500/30 bg-rose-500/10 px-2.5 py-0.5 font-mono text-[10px] font-bold text-rose-300">
        <AlertTriangle className="h-3 w-3" />
        {displayVendor}: REJECTED
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-0.5 font-mono text-[10px] font-bold text-cyan-300">
      <Clock className="h-3 w-3 animate-pulse" />
      {displayVendor}: QUEUED
    </span>
  );
}
