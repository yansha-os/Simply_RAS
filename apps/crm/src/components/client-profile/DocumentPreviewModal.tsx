'use client';

import { useState } from 'react';
import { FileCheck, Loader2 } from 'lucide-react';
import { DocumentReviewPreviewModal } from '@/components/client-profile/DocumentReviewPreviewModal';

export type DocumentPreviewModalProps = {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  url: string | null;
  titleId?: string;
  breadcrumbLabel?: string;
};

/**
 * Default document preview for simple URL-based files (billing snapshots, PA attachments).
 * Uses the same full-viewport Intake Coordinator shell.
 */
export function DocumentPreviewModal({
  isOpen,
  onClose,
  title,
  url,
  titleId = 'document-preview-title',
  breadcrumbLabel = 'Document Preview',
}: DocumentPreviewModalProps) {
  const [isLoading, setIsLoading] = useState(true);

  return (
    <DocumentReviewPreviewModal
      isOpen={isOpen}
      onClose={() => {
        setIsLoading(true);
        onClose();
      }}
      title={title}
      titleId={titleId}
      breadcrumbLabel={breadcrumbLabel}
    >
      {url ? (
        <div className="relative flex flex-1 items-start justify-center p-4 sm:p-6">
          {isLoading && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-zinc-950/80 backdrop-blur-sm">
              <Loader2 className="h-8 w-8 animate-spin text-brand-orange-400" aria-hidden="true" />
              <p className="font-mono text-xs uppercase tracking-wider text-zinc-500">Loading document…</p>
            </div>
          )}
          <div className="relative w-full max-w-6xl overflow-hidden rounded-2xl border border-white/10 bg-zinc-900/40 shadow-2xl shadow-black/40 ring-1 ring-white/[0.04]">
            <iframe
              src={url}
              title={`${title} preview`}
              className="block h-full w-full bg-zinc-950"
              style={{ minHeight: 'calc(100vh - 140px)' }}
              onLoad={() => setIsLoading(false)}
            />
          </div>
        </div>
      ) : (
        <div className="flex h-full min-h-[60vh] flex-col items-center justify-center px-4 text-zinc-500">
          <div className="flex h-16 w-16 items-center justify-center rounded-full border border-white/10 bg-white/[0.03]">
            <FileCheck className="h-8 w-8 opacity-40" aria-hidden="true" />
          </div>
          <p className="mt-4 font-heading text-base text-zinc-400">Document not available</p>
        </div>
      )}
    </DocumentReviewPreviewModal>
  );
}
