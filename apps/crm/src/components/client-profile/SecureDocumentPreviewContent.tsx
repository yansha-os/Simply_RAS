'use client';

import { useState } from 'react';
import { AlertTriangle, FileCheck, Loader2 } from 'lucide-react';
import type { SecureDocument } from '@/lib/secureDocument';

type SecureDocumentPreviewContentProps = {
  docData: SecureDocument | null;
  previewTitle: string;
};

function DocumentLoadingState({ label }: { label: string }) {
  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-zinc-950/80 backdrop-blur-sm">
      <Loader2 className="h-8 w-8 animate-spin text-brand-orange-400" aria-hidden="true" />
      <p className="font-mono text-xs uppercase tracking-wider text-zinc-500">Loading {label}…</p>
    </div>
  );
}

/** Inline PDF/image viewer used inside DocumentReviewPreviewModal. */
export function SecureDocumentPreviewContent({
  docData,
  previewTitle,
}: SecureDocumentPreviewContentProps) {
  const [isLoading, setIsLoading] = useState(true);

  if (docData) {
    return (
      <div className="flex h-full min-h-[calc(100vh-8rem)] flex-col">
        <div className="flex flex-shrink-0 items-center justify-between border-b border-white/[0.06] bg-zinc-900/70 px-5 py-3 backdrop-blur-md sm:px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-green-500/20 bg-green-500/10">
              <FileCheck className="h-4 w-4 text-green-400" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-zinc-200">{docData.name}</p>
              <p className="font-mono text-[11px] text-zinc-500">{previewTitle}</p>
            </div>
          </div>
          <span className="shrink-0 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 font-mono text-[11px] text-zinc-400">
            {docData.size}
          </span>
        </div>

        <div className="relative flex flex-1 items-start justify-center p-4 sm:p-6">
          {isLoading && <DocumentLoadingState label={docData.type === 'application/pdf' ? 'PDF' : 'image'} />}

          <div className="relative w-full max-w-6xl overflow-hidden rounded-2xl border border-white/10 bg-zinc-900/40 shadow-2xl shadow-black/40 ring-1 ring-white/[0.04]">
            {docData.type === 'application/pdf' ? (
              <iframe
                src={docData.url}
                title={`${previewTitle} PDF preview`}
                className="block h-full w-full bg-zinc-950"
                style={{ minHeight: 'calc(100vh - 180px)' }}
                onLoad={() => setIsLoading(false)}
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={docData.url}
                alt={docData.name}
                className="mx-auto block h-auto max-w-full object-contain"
                onLoad={() => setIsLoading(false)}
                onError={() => setIsLoading(false)}
              />
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-[60vh] items-center justify-center px-4">
      <div className="max-w-md space-y-4 rounded-2xl border border-orange-500/20 bg-zinc-900/60 px-8 py-10 text-center shadow-xl backdrop-blur-md">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-orange-500/25 bg-orange-500/10 shadow-[0_0_32px_rgba(249,115,22,0.12)]">
          <AlertTriangle className="h-7 w-7 text-orange-400" aria-hidden="true" />
        </div>
        <p className="font-heading text-lg font-semibold text-white">Secure document unavailable</p>
        <p className="text-sm leading-relaxed text-zinc-400">
          This upload is missing, was returned for correction, or does not use the authorized document
          route. It cannot be reviewed or approved.
        </p>
      </div>
    </div>
  );
}
