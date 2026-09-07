'use client';

import React, { useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronRight, FileSearch, X } from 'lucide-react';
import { DOCUMENT_PREVIEW_Z_INDEX } from '@/components/client-profile/DocumentReviewStackedDialog';

const subscribeToHydration = () => () => {};

export type DocumentReviewPreviewModalProps = {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  titleId?: string;
  breadcrumbLabel?: string;
  isApproved?: boolean;
  toolbarCenter?: React.ReactNode;
  toolbarActions?: React.ReactNode;
  changeModeBanner?: React.ReactNode;
  children: React.ReactNode;
};

/**
 * Full-viewport document review preview shell — source of truth styling from Intake Coordinator.
 * Portal-mounted, backdrop dismiss, premium glass navbar, scrollable content region.
 */
export function DocumentReviewPreviewModal({
  isOpen,
  onClose,
  title,
  titleId = 'document-review-preview-title',
  breadcrumbLabel = 'Document Review',
  isApproved = false,
  toolbarCenter,
  toolbarActions,
  changeModeBanner,
  children,
}: DocumentReviewPreviewModalProps) {
  const mounted = useSyncExternalStore(
    subscribeToHydration,
    () => true,
    () => false
  );

  if (!isOpen || !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 flex flex-col bg-zinc-950/95 backdrop-blur-xl animate-in fade-in duration-200"
      style={{ zIndex: DOCUMENT_PREVIEW_Z_INDEX }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-[radial-gradient(ellipse_at_top,rgba(249,115,22,0.12),transparent_70%)]"
        aria-hidden="true"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative flex min-h-0 flex-1 flex-col"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="relative flex flex-shrink-0 items-center gap-3 border-b border-white/10 bg-zinc-900/80 px-4 py-3 shadow-[0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-xl sm:gap-4 sm:px-5">
          <div className="grid min-w-0 flex-1 grid-cols-1 items-center gap-3 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:gap-4">
            <div className="flex min-w-0 items-center gap-2.5 lg:justify-self-start">
              <div className="flex shrink-0 items-center gap-1.5 font-mono text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                <FileSearch className="h-3.5 w-3.5 text-brand-orange-400/80" aria-hidden="true" />
                <span>{breadcrumbLabel}</span>
                <ChevronRight className="h-3 w-3 opacity-60" aria-hidden="true" />
              </div>
              <h3
                id={titleId}
                className="font-heading truncate text-base font-semibold tracking-tight text-white sm:text-lg"
              >
                {title}
              </h3>
              {isApproved && (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-green-500/25 bg-green-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-green-400">
                  <Check className="h-2.5 w-2.5" aria-hidden="true" /> Approved
                </span>
              )}
            </div>

            {toolbarCenter ? (
              <div className="flex justify-center lg:justify-self-center">{toolbarCenter}</div>
            ) : (
              <div className="hidden lg:block" aria-hidden="true" />
            )}

            <div className="flex shrink-0 items-center justify-end gap-2 lg:justify-self-end">
              {toolbarActions}
              {toolbarActions && (
                <div className="mx-0.5 hidden h-5 w-px bg-white/10 sm:block" aria-hidden="true" />
              )}
              <button
                type="button"
                autoFocus
                aria-label="Close document preview"
                onClick={onClose}
                className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-white/5 bg-white/[0.03] text-zinc-400 transition-all duration-200 hover:border-white/15 hover:bg-white/10 hover:text-white"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        </header>

        {changeModeBanner}

        <div className="relative min-h-0 flex-1 overflow-y-auto bg-zinc-950/60">
          <div
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.02),transparent_65%)]"
            aria-hidden="true"
          />
          <div className="relative min-h-full">{children}</div>
        </div>
      </div>
    </div>,
    document.body
  );
}
