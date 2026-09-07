'use client';

import React, { useCallback, useEffect, useState, useTransition } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  DownloadCloud,
  Eye,
  FileText,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { DocumentPreviewModal } from '@/components/client-profile/DocumentPreviewModal';
import { getClientEmrDocumentVault } from '@/app/actions/emrDocumentVaultActions';
import {
  BILLING_DOC_GROUP_META,
  collectBillingDocuments,
  parseIntakeFormData,
  type BillingDocGroup,
  type BillingDocumentItem,
} from '@/lib/billingDocuments';

type BillingDocumentsTabProps = {
  client: {
    id: string;
    firstName?: string | null;
    lastName?: string | null;
    intakePacket?: { formData?: unknown } | null;
  };
};

const GROUP_ORDER: BillingDocGroup[] = [
  'VOB_INSURANCE',
  'PA_CLINICAL',
  'CLAIMS_SUPPORT',
];

function readinessTone(pct: number): string {
  if (pct >= 100) return 'bg-green-500/10 text-green-400 border-green-500/20';
  if (pct >= 60) return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
  return 'bg-red-500/10 text-red-400 border-red-500/20';
}

export default function BillingDocumentsTab({ client }: BillingDocumentsTabProps) {
  const [summary, setSummary] = useState(() =>
    collectBillingDocuments({
      clientId: client.id,
      formData: parseIntakeFormData(client.intakePacket?.formData),
    })
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [previewDoc, setPreviewDoc] = useState<BillingDocumentItem | null>(null);
  const [isPending, startTransition] = useTransition();

  const clientName =
    [client.firstName, client.lastName].filter(Boolean).join(' ') || 'Client';

  const loadVault = useCallback(() => {
    startTransition(async () => {
      setLoading(true);
      setError(null);
      const formData = parseIntakeFormData(client.intakePacket?.formData);
      const res = await getClientEmrDocumentVault(client.id);
      if (!res.success) {
        setError(res.error || 'Failed to load chart vault documents.');
        setSummary(collectBillingDocuments({ clientId: client.id, formData }));
        setLoading(false);
        return;
      }

      const vaultItems = [
        ...Object.values(res.vaultSummary?.categories ?? {}).flat(),
      ];
      setSummary(
        collectBillingDocuments({
          clientId: client.id,
          formData,
          vaultItems,
        })
      );
      setLoading(false);
    });
  }, [client.id, client.intakePacket?.formData]);

  useEffect(() => {
    loadVault();
  }, [loadVault]);

  const grouped = GROUP_ORDER.map((group) => ({
    group,
    meta: BILLING_DOC_GROUP_META[group],
    items: summary.items.filter((item) => item.group === group),
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-brand-orange-500/20 bg-brand-orange-500/10 text-brand-orange-400">
            <FileText className="h-5 w-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-heading text-base font-bold text-white">
                Billing Documents
              </h3>
              <span
                className={`rounded-full border px-2.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider ${readinessTone(summary.readinessPct)}`}
              >
                {summary.readinessPct}% PA Ready
              </span>
            </div>
            <p className="text-xs text-zinc-400">
              Insurance, VOB, and clinical attachments for PA and claims work —{' '}
              {clientName}.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={loadVault}
          disabled={isPending}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-white/10 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-300 transition-all hover:border-white/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isPending ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-zinc-950/80 p-4 backdrop-blur-xl transition-all duration-300 hover:border-brand-orange-500/30">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">
            Primary Insurance
          </p>
          <p className="mt-1 font-heading text-sm font-semibold text-white">
            {summary.insurancePayer ?? 'Payer not provided'}
          </p>
          <p className="mt-0.5 font-mono text-xs text-brand-blue-400">
            {summary.memberId ?? 'Member ID not provided'}
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-zinc-950/80 p-4 backdrop-blur-xl transition-all duration-300 hover:border-brand-orange-500/30">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">
            Medicaid
          </p>
          <p className="mt-1 font-heading text-sm font-semibold text-white">
            {summary.hasMedicaid ? 'Reported by family' : 'Not reported'}
          </p>
          <p className="mt-0.5 font-mono text-xs text-brand-orange-400">
            {summary.medicaidId ?? 'Medicaid ID not provided'}
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-zinc-950/80 p-4 backdrop-blur-xl transition-all duration-300 hover:border-brand-orange-500/30">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">
            Document coverage
          </p>
          <p className="mt-1 font-heading text-sm font-semibold text-white">
            {summary.presentCount} uploaded · {summary.requiredPresentCount}/{summary.requiredCount}{' '}
            PA-required
          </p>
          {summary.readinessPct < 100 && (
            <p className="mt-1 flex items-center gap-1 text-[11px] text-amber-400/90">
              <AlertTriangle className="h-3 w-3 shrink-0" />
              Missing items block clean PA submission.
            </p>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 p-3 text-xs text-amber-300">
          {error} Intake packet documents are still shown below.
        </div>
      )}

      {loading && !summary.items.some((item) => item.url) ? (
        <div className="flex items-center justify-center py-16 text-zinc-400">
          <RefreshCw className="mr-2 h-6 w-6 animate-spin text-brand-orange-500" />
          <span className="font-mono text-xs">Loading billing document repository…</span>
        </div>
      ) : (
        grouped.map(({ group, meta, items }) => (
          <section key={group} className="space-y-3">
            <div className="border-b border-white/10 pb-2">
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-brand-orange-400">
                {meta.title}
              </p>
              <p className="mt-0.5 text-xs text-zinc-500">{meta.description}</p>
            </div>

            {items.length === 0 ? (
              <p className="text-sm text-zinc-500">No documents in this category yet.</p>
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {items.map((item) => {
                  const hasFile = Boolean(item.url);
                  return (
                    <div
                      key={item.id}
                      className="group flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-zinc-950/70 p-4 backdrop-blur-xl transition-all duration-300 hover:scale-[1.01] hover:border-brand-orange-500/40 hover:shadow-2xl"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <FileText className="h-4 w-4 shrink-0 text-zinc-500" />
                          <span className="truncate text-sm font-medium text-zinc-200">
                            {item.label}
                          </span>
                          {item.requiredForPa && (
                            <span className="rounded-full border border-brand-orange-500/20 bg-brand-orange-500/10 px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider text-brand-orange-300">
                              PA Required
                            </span>
                          )}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 font-mono text-[10px] text-zinc-500">
                          <span>{item.source === 'intake' ? 'Intake packet' : 'Chart vault'}</span>
                          {item.isVerified && (
                            <span className="inline-flex items-center gap-0.5 text-green-400">
                              <ShieldCheck className="h-3 w-3" /> Verified
                            </span>
                          )}
                          {item.expirationDate && (
                            <span>Expires {item.expirationDate}</span>
                          )}
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        {hasFile ? (
                          <>
                            <button
                              type="button"
                              onClick={() => setPreviewDoc(item)}
                              className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-white/10 bg-zinc-900 px-2.5 py-1.5 text-[11px] font-medium text-zinc-200 transition-colors hover:border-brand-orange-500/40 hover:text-white"
                            >
                              <Eye className="h-3.5 w-3.5" />
                              Preview
                            </button>
                            <a
                              href={item.url!}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-brand-orange-500/20 bg-brand-orange-500/10 px-2.5 py-1.5 text-[11px] font-medium text-brand-orange-300 transition-colors hover:bg-brand-orange-500/20"
                            >
                              <DownloadCloud className="h-3.5 w-3.5" />
                              Open
                            </a>
                          </>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-lg border border-red-500/20 bg-red-500/10 px-2.5 py-1.5 text-[11px] text-red-300">
                            <AlertTriangle className="h-3.5 w-3.5" />
                            Missing
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        ))
      )}

      {summary.readinessPct === 100 && (
        <div className="flex items-center gap-2 rounded-xl border border-green-500/20 bg-green-500/10 p-3 text-xs text-green-300">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-green-400" />
          All PA-required billing documents are on file. Use the Assessment or Treatment PA tab to
          submit authorization requests.
        </div>
      )}

      <DocumentPreviewModal
        isOpen={Boolean(previewDoc)}
        onClose={() => setPreviewDoc(null)}
        title={previewDoc?.label ?? ''}
        titleId="billing-doc-preview-title"
        breadcrumbLabel="Billing Documents"
        url={previewDoc?.url ?? null}
      />
    </div>
  );
}
