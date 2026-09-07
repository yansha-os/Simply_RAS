'use client';

import { AlertTriangle, Check, Send, ShieldCheck } from 'lucide-react';

type ToolbarButtonProps = {
  disabled?: boolean;
  onClick: () => void;
  children?: React.ReactNode;
};

export function DocumentReviewRejectButton({
  disabled,
  onClick,
  children = 'Request Correction',
}: ToolbarButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-red-500/25 bg-red-500/10 px-4 py-2 text-xs font-bold uppercase tracking-wide text-red-400 shadow-[0_0_20px_rgba(239,68,68,0.08)] transition-all duration-200 hover:border-red-500/45 hover:bg-red-500/20 hover:shadow-[0_0_24px_rgba(239,68,68,0.15)] disabled:cursor-not-allowed disabled:opacity-50"
    >
      <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
      {children}
    </button>
  );
}

export function DocumentReviewApproveButton({
  disabled,
  onClick,
  children = 'Approve',
}: ToolbarButtonProps) {
  return (
    <div className="group relative">
      <div className="absolute -inset-[2px] rounded-full bg-gradient-to-r from-green-500 to-emerald-500 opacity-60 blur transition duration-300 group-hover:opacity-90" />
      <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        className="relative inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-green-500/40 bg-zinc-900 px-5 py-2 text-xs font-bold uppercase tracking-wide text-white transition-all duration-200 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <ShieldCheck className="h-3.5 w-3.5 text-green-400" aria-hidden="true" />
        {children}
      </button>
    </div>
  );
}

export function DocumentReviewSendCorrectionsButton({
  count,
  disabled,
  onClick,
}: {
  count: number;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-orange-500 px-4 py-2 text-xs font-bold uppercase tracking-wide text-white shadow-lg shadow-orange-500/30 transition-all duration-200 hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <Send className="h-3 w-3" aria-hidden="true" />
      Send {count} Request{count !== 1 ? 's' : ''}
    </button>
  );
}

export function DocumentReviewApprovedBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-green-500/25 bg-green-500/10 px-4 py-2 text-xs font-bold uppercase tracking-wide text-green-400">
      <Check className="h-3 w-3" aria-hidden="true" /> Approved
    </span>
  );
}
