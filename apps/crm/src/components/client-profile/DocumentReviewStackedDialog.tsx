'use client';

import React, { useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

const subscribeToHydration = () => () => {};

/** Full-viewport document preview shell — keep below stacked dialogs. */
export const DOCUMENT_PREVIEW_Z_INDEX = 100;

/** Confirmation / reject dialogs that must appear above the preview. */
export const DOCUMENT_STACKED_DIALOG_Z_INDEX = 120;

export type DocumentReviewStackedDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  titleId?: string;
  children: React.ReactNode;
  maxWidthClass?: string;
  dismissOnBackdrop?: boolean;
};

/**
 * Portal-mounted dialog rendered above DocumentReviewPreviewModal (z-120 vs z-100).
 * Use for reject confirmations, approve prompts, and discard flows while preview is open.
 */
export function DocumentReviewStackedDialog({
  isOpen,
  onClose,
  titleId,
  children,
  maxWidthClass = 'max-w-md',
  dismissOnBackdrop = true,
}: DocumentReviewStackedDialogProps) {
  const mounted = useSyncExternalStore(
    subscribeToHydration,
    () => true,
    () => false
  );

  if (!isOpen || !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md animate-in fade-in duration-200"
      style={{ zIndex: DOCUMENT_STACKED_DIALOG_Z_INDEX }}
      onClick={(event) => {
        if (dismissOnBackdrop && event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        {...(titleId ? { 'aria-labelledby': titleId } : {})}
        className={`relative m-auto w-full ${maxWidthClass} overflow-hidden rounded-2xl border border-white/10 bg-zinc-900/95 shadow-2xl shadow-black/50 backdrop-blur-xl`}
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          aria-label="Close dialog"
          onClick={onClose}
          className="absolute right-4 top-4 z-10 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-zinc-500 transition-all duration-200 hover:bg-white/10 hover:text-white"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
        {children}
      </div>
    </div>,
    document.body
  );
}
